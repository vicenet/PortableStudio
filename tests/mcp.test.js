// Tests the MCP server end to end: a real MCP client talks to it over an in-memory transport,
// and a fake local API stands in for the Illustrator and Photoshop panels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portablestudio-mcp-'));
process.env.PORTABLESTUDIO_HOME = path.join(tmp, 'home');
process.env.PORTABLESTUDIO_DOCS = path.join(tmp, 'docs');
process.env.PORTABLESTUDIO_TEMPLATES = path.join(tmp, 'templates');
process.env.ANTHROPIC_API_KEY = '';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../mcp/server');
const packs = require('../core/packs');

const EXPECTED_TOOLS = [
  'status', 'list_industries', 'list_templates', 'list_brands', 'get_brand', 'save_brand',
  'delete_brand', 'write_brand_copy', 'color_report', 'extract_palette_from_logo', 'generate',
  'export_logo_kit', 'draw_logo_grid', 'list_template_packs', 'install_template_pack',
];

// Fake local API: records each call and answers like a connected panel.
const apiCalls = [];
const connected = new Set(['illustrator', 'photoshop']);
async function fakeRequest(app, method, route, body) {
  apiCalls.push({ app, method, route, body });
  if (!connected.has(app)) throw new Error(`${app} isn't connected.`);
  if (route === '/v1/status') return { app, version: 'test' };
  if (route === '/v1/palette/extract') return { palette: ['#E4572E', '#29335C'] };
  if (route === '/v1/generate') return { brand: body.brand.name, results: body.templateIds.map((templateId) => ({ templateId })) };
  if (route === '/v1/logo-kit') return { outputDir: '/out', files: ['mark.svg'], brand: body.brand.name };
  if (route === '/v1/logo-grid') return { drawn: true, options: body };
  throw new Error(`Unexpected route ${route}`);
}

function makeTemplate(id, app) {
  const dir = path.join(process.env.PORTABLESTUDIO_TEMPLATES, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = app === 'illustrator' ? 'template.ai' : 'template.psd';
  fs.writeFileSync(path.join(dir, file), `fake ${id}`);
  fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify({
    id, name: id, app, category: 'social-carousel', industries: ['restaurant'], file, pages: 5,
  }));
}

let client;
test.before(async () => {
  makeTemplate('menu-carousel', 'illustrator');
  makeTemplate('promo-post', 'photoshop');
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ request: fakeRequest }).connect(serverSide);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
});
test.after(async () => {
  await client.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content[0].text;
  if (res.isError) return { error: text };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

test('lists exactly the expected tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
});

test('every tool declares all four annotation hints as booleans', async () => {
  const { tools } = await client.listTools();
  for (const t of tools) {
    for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
      assert.equal(typeof (t.annotations || {})[hint], 'boolean', `${t.name} is missing ${hint}`);
    }
    if (t.annotations.readOnlyHint) assert.equal(t.annotations.destructiveHint, false, `${t.name} is read-only but destructive`);
  }
});

test('hints match what each tool actually does', async () => {
  const { tools } = await client.listTools();
  const a = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
  assert.equal(a.delete_brand.destructiveHint, true);
  assert.equal(a.save_brand.readOnlyHint, false);
  assert.equal(a.write_brand_copy.openWorldHint, true);
  assert.equal(a.install_template_pack.openWorldHint, true);
  assert.equal(a.list_brands.readOnlyHint, true);
  assert.equal(a.generate.destructiveHint, false);
});

test('status reports each connected app', async () => {
  const s = await call('status');
  assert.equal(s.illustrator.app, 'illustrator');
  assert.equal(s.photoshop.app, 'photoshop');
});

test('status reports a disconnected app instead of failing', async () => {
  connected.delete('photoshop');
  try {
    const s = await call('status');
    assert.equal(s.photoshop.connected, false);
    assert.equal(s.illustrator.app, 'illustrator');
  } finally {
    connected.add('photoshop');
  }
});

test('list_industries returns industries with voice and palettes', async () => {
  const industries = await call('list_industries');
  const restaurant = industries.find((i) => i.id === 'restaurant');
  assert.ok(restaurant);
  assert.ok(restaurant.voice);
  assert.ok(Array.isArray(restaurant.palettes));
});

test('list_templates filters by app', async () => {
  assert.deepEqual((await call('list_templates')).map((t) => t.id).sort(), ['menu-carousel', 'promo-post']);
  assert.deepEqual((await call('list_templates', { app: 'photoshop' })).map((t) => t.id), ['promo-post']);
});

let brandId;
test('save_brand creates a brand, then updates only the fields given', async () => {
  const created = await call('save_brand', { name: 'Saffron Kitchen', industry: 'restaurant', colors: { primary: '#E4572E' } });
  assert.ok(created.id);
  brandId = created.id;
  const updated = await call('save_brand', { id: brandId, name: 'Saffron Kitchen', tagline: 'Spice, slowly' });
  assert.equal(updated.tagline, 'Spice, slowly');
  assert.equal(updated.colors.primary, '#E4572E');
});

test('list_brands and get_brand read the saved brand', async () => {
  const list = await call('list_brands');
  assert.ok(list.some((b) => b.id === brandId && b.name === 'Saffron Kitchen'));
  const b = await call('get_brand', { id: brandId });
  assert.equal(b.tagline, 'Spice, slowly');
});

test('write_brand_copy with industry copy can save it to the brand', async () => {
  const c = await call('write_brand_copy', { brandId, source: 'industry', save: true });
  assert.ok(c.headline);
  const b = await call('get_brand', { id: brandId });
  assert.equal(b.copy.headline, c.headline);
});

test('color_report covers each colour with contrast data', async () => {
  const r = await call('color_report', { colors: { primary: '#E4572E', secondary: '#29335C' } });
  assert.ok(JSON.stringify(r).includes('E4572E'));
  assert.ok(/contrast/i.test(JSON.stringify(r)));
});

test('extract_palette_from_logo goes through a connected app', async () => {
  const r = await call('extract_palette_from_logo', { imagePath: '/logo.png', count: 3 });
  assert.deepEqual(r.palette, ['#E4572E', '#29335C']);
  assert.equal(apiCalls.at(-1).route, '/v1/palette/extract');
});

test('extract_palette_from_logo explains when no app is open', async () => {
  connected.clear();
  try {
    const r = await call('extract_palette_from_logo', { imagePath: '/logo.png' });
    assert.match(r.error, /Open Illustrator or Photoshop/);
  } finally {
    connected.add('illustrator');
    connected.add('photoshop');
  }
});

test('generate routes each template to its own app', async () => {
  apiCalls.length = 0;
  const r = await call('generate', { brandId, templateIds: ['menu-carousel', 'promo-post'] });
  assert.equal(r.illustrator.results[0].templateId, 'menu-carousel');
  assert.equal(r.photoshop.results[0].templateId, 'promo-post');
  assert.deepEqual(apiCalls.filter((c) => c.route === '/v1/generate').map((c) => c.app).sort(), ['illustrator', 'photoshop']);
});

test('generate reports a closed app per template instead of failing the whole run', async () => {
  connected.delete('photoshop');
  try {
    const r = await call('generate', { brandId, templateIds: ['menu-carousel', 'promo-post'] });
    assert.ok(r.illustrator.results);
    assert.deepEqual(r.photoshop.templateIds, ['promo-post']);
    assert.ok(r.photoshop.error);
  } finally {
    connected.add('photoshop');
  }
});

test('export_logo_kit sends the resolved brand to Illustrator', async () => {
  const r = await call('export_logo_kit', { brandId });
  assert.equal(r.brand, 'Saffron Kitchen');
  assert.equal(apiCalls.at(-1).app, 'illustrator');
});

test('draw_logo_grid passes its options to Illustrator', async () => {
  const r = await call('draw_logo_grid', { circles: true, color: '#1E90FF' });
  assert.equal(r.drawn, true);
  assert.equal(apiCalls.at(-1).body.color, '#1E90FF');
});

test('list_template_packs and install_template_pack work from a catalog', async () => {
  const out = path.join(tmp, 'published');
  packs.exportPack({ outDir: out, pack: { id: 'starter', name: 'Starter' }, templateIds: ['menu-carousel'] });
  fs.rmSync(path.join(process.env.PORTABLESTUDIO_TEMPLATES, 'menu-carousel'), { recursive: true, force: true });
  const catalogUrl = path.join(out, 'catalog.json');

  const catalog = await call('list_template_packs', { catalogUrl });
  assert.equal(catalog.packs[0].id, 'starter');
  assert.equal(catalog.packs[0].templates[0].installed, false);

  const install = await call('install_template_pack', { catalogUrl, packId: 'starter' });
  assert.equal(install.results.filter((r) => r.installed).length, 1);
  assert.ok((await call('list_templates')).some((t) => t.id === 'menu-carousel'));
});

test('delete_brand removes the brand', async () => {
  const r = await call('delete_brand', { id: brandId });
  assert.equal(r.deleted, true);
  assert.ok(!(await call('list_brands')).some((b) => b.id === brandId));
});

test('tool errors come back as MCP errors, not crashes', async () => {
  const r = await call('get_brand', { id: 'no-such-brand' });
  assert.ok(r.error);
});
