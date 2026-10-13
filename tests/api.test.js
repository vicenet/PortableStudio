// Tests the local REST API (core/api.js) over real HTTP with a fake Studio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portablestudio-api-'));
process.env.PORTABLESTUDIO_HOME = path.join(tmp, 'home');
process.env.PORTABLESTUDIO_DOCS = path.join(tmp, 'docs');
process.env.PORTABLESTUDIO_TEMPLATES = path.join(tmp, 'templates');

const { createApi } = require('../core/api');
const brands = require('../core/brands');
const templates = require('../core/templates');
const color = require('../core/color');
const packs = require('../core/packs');
const license = require('../core/license');
const settings = require('../core/settings');

const TOKEN = 'test-token-123';
const calls = [];
const fakeStudio = {
  status: () => ({ app: 'illustrator', version: 'test' }),
  listTemplates: () => [],
  generate: async (args) => {
    calls.push(['generate', args]);
    return { brand: args.brand.name, results: [] };
  },
  logoKit: async (args) => ({ outputDir: '/out', files: [], brand: args.brand.name }),
  extractPalette: async () => ({ palette: [] }),
  writeCopy: async ({ source }) => ({ headline: source === 'industry' ? 'Industry H' : 'AI H', values: [], slides: [] }),
};

let server, port;
test.before(async () => {
  server = http.createServer(createApi({ studio: fakeStudio, brands, templates, color, packs, license, settings, getToken: () => TOKEN }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
test.after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function call(method, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, path: route, method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('rejects missing or wrong tokens', async () => {
  assert.equal((await call('GET', '/v1/status', null, { Authorization: '' })).status, 401);
  assert.equal((await call('GET', '/v1/status', null, { Authorization: 'Bearer wrong' })).status, 401);
});

test('rejects requests coming from a browser page', async () => {
  const r = await call('GET', '/v1/status', null, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('status and config', async () => {
  const s = await call('GET', '/v1/status');
  assert.equal(s.status, 200);
  assert.equal(s.body.data.app, 'illustrator');
  const c = await call('GET', '/v1/config');
  assert.ok(c.body.data.industries.some((i) => i.id === 'restaurant'));
});

test('brand CRUD over the API', async () => {
  const created = await call('POST', '/v1/brands', { name: 'Nova Labs', industry: 'tech', colors: { primary: '#3A86FF' } });
  assert.equal(created.status, 200);
  assert.equal(created.body.data.id, 'nova-labs');
  const updated = await call('PUT', '/v1/brands/nova-labs', { name: 'Nova Labs', tagline: 'Ship faster' });
  assert.equal(updated.body.data.tagline, 'Ship faster');
  const list = await call('GET', '/v1/brands');
  assert.equal(list.body.data.length, 1);
  const missing = await call('GET', '/v1/brands/nope');
  assert.equal(missing.status, 404);
});

test('generate resolves the brand by id and passes options through', async () => {
  const r = await call('POST', '/v1/generate', { brandId: 'nova-labs', templateIds: ['a', 'b'], exportPages: true, pageWidth: 1080 });
  assert.equal(r.status, 200);
  const [, args] = calls.find((c) => c[0] === 'generate');
  assert.equal(args.brand.name, 'Nova Labs');
  assert.deepEqual(args.templateIds, ['a', 'b']);
  assert.equal(args.exportPages, true);
  assert.equal(args.pageWidth, 1080);
});

test('copy can be saved back onto the brand', async () => {
  const r = await call('POST', '/v1/copy', { brandId: 'nova-labs', source: 'industry', save: true });
  assert.equal(r.body.data.headline, 'Industry H');
  assert.equal(brands.get('nova-labs').copy.headline, 'Industry H');
});

test('palette report from brand or explicit colours', async () => {
  const r = await call('POST', '/v1/palette/report', { colors: { primary: '#000000', secondary: '#FFFFFF' } });
  assert.equal(r.body.data.pairs[0].ratio, 21);
  const fromBrand = await call('POST', '/v1/palette/report', { brandId: 'nova-labs' });
  assert.equal(fromBrand.body.data.roles.primary.hex, '#3A86FF');
});

test('bad JSON and unknown routes give clear errors', async () => {
  const unknown = await call('GET', '/v1/nothing');
  assert.equal(unknown.status, 404);
  const bad = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/v1/brands', method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.end('{not json');
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /JSON/);
});
