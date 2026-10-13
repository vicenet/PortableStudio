// Tests for core/ modules, run against a throwaway data folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portablestudio-'));
process.env.PORTABLESTUDIO_HOME = path.join(tmp, 'home');
process.env.PORTABLESTUDIO_DOCS = path.join(tmp, 'docs');
process.env.PORTABLESTUDIO_TEMPLATES = path.join(tmp, 'templates');
process.env.ANTHROPIC_API_KEY = '';

const color = require('../core/color');
const brands = require('../core/brands');
const copy = require('../core/copy');
const settings = require('../core/settings');
const license = require('../core/license');
const packs = require('../core/packs');
const templates = require('../core/templates');
const { buildIco, pngSize } = require('../core/ico');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// ---- colour ----
test('contrast ratio matches WCAG reference values', () => {
  assert.equal(color.contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(color.contrastRatio('#777777', '#FFFFFF'), 4.48);
  assert.equal(color.wcag(4.48), 'AA Large');
  assert.equal(color.wcag(7.1), 'AAA');
});

test('tints and shades move toward white and black', () => {
  const { tints, shades } = color.tintsAndShades('#808080');
  assert.equal(tints.length, 4);
  assert.ok(color.hexToRgb(tints[3].hex).r > 200);
  assert.ok(color.hexToRgb(shades[3].hex).r < 40);
});

test('extractPalette finds the dominant colours and ignores background', () => {
  const px = [];
  const push = (r, g, b, a, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  push(255, 255, 255, 255, 500); // white background
  push(0, 0, 0, 0, 300); // transparent
  push(200, 30, 30, 255, 600); // red
  push(20, 40, 160, 255, 300); // blue
  push(240, 200, 20, 255, 100); // yellow
  const palette = color.extractPalette(px, { count: 3 });
  assert.equal(palette.length, 3);
  assert.equal(palette[0].hex, '#C81E1E');
  const roles = color.suggestRoles(palette);
  assert.equal(roles.primary, '#C81E1E');
  assert.deepEqual(new Set([roles.secondary, roles.accent]), new Set(['#1428A0', '#F0C814']));
});

test('paletteReport covers every pair', () => {
  const r = color.paletteReport({ primary: '#E4572E', secondary: '#29335C', accent: '#F3A712' });
  assert.equal(Object.keys(r.roles).length, 3);
  assert.equal(r.pairs.length, 3);
  assert.equal(r.roles.secondary.bestText, '#FFFFFF');
});

// ---- brands ----
test('brands: save, list, get, update, remove', () => {
  const saved = brands.save({ name: 'Saffron Kitchen', colors: { primary: 'c8553d' }, fonts: { heading: 'Montserrat-Bold' } });
  assert.equal(saved.id, 'saffron-kitchen');
  assert.equal(saved.colors.primary, '#C8553D');
  assert.deepEqual(saved.fonts.heading, { ps: 'Montserrat-Bold', name: 'Montserrat-Bold' });
  const second = brands.save({ name: 'Saffron Kitchen' });
  assert.equal(second.id, 'saffron-kitchen-2');
  assert.equal(brands.list().length, 2);
  brands.save({ ...brands.get('saffron-kitchen'), tagline: 'Spice it up' });
  assert.equal(brands.get('saffron-kitchen').tagline, 'Spice it up');
  brands.remove('saffron-kitchen-2');
  assert.equal(brands.list().length, 1);
});

test('brands reject unsafe ids', () => {
  assert.throws(() => brands.get('../settings'), /Invalid brand id/);
  assert.throws(() => brands.save({ id: '../../evil', name: 'x' }), /Invalid brand id/);
});

// ---- copy ----
test('industry copy is filled with the brand name', () => {
  const c = copy.industryCopy(brands.normalize({ name: 'Saffron', industry: 'restaurant' }));
  assert.match(c.headline, /Saffron/);
  assert.equal(c.slides.length, 5);
  assert.ok(c.values.length >= 3);
  assert.ok(!JSON.stringify(c).includes('{name}'));
});

test('generateCopy sends a structured-output request and parses the result', async () => {
  let sent;
  const fakeCopy = {
    headline: 'H', subheadline: 'S', about: 'A', mission: 'M', voice: 'V', cta: 'C',
    values: ['One', 'Two', 'Three'], slides: [{ title: 'T1', body: 'B1' }, { title: 'T2', body: 'B2' }],
  };
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          sent = req;
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(fakeCopy) }] };
        },
      },
    },
  };
  const brand = brands.normalize({ name: 'Saffron', industry: 'restaurant' });
  const result = await copy.generateCopy(brand, { brief: 'Family restaurant', slides: 2, client });
  assert.deepEqual(result, fakeCopy);
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(sent.fallbacks, 'default');
  assert.match(sent.messages[0].content, /Restaurant & Food/);
  assert.match(sent.messages[0].content, /Family restaurant/);
});

test('generateCopy surfaces refusals and missing keys clearly', async () => {
  const brand = brands.normalize({ name: 'X' });
  const refusing = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(copy.generateCopy(brand, { client: refusing }), /declined/);
  await assert.rejects(copy.generateCopy(brand), /Anthropic API key/);
});

// ---- settings ----
test('api token is created once and persisted', () => {
  const t1 = settings.ensureApiToken();
  assert.equal(settings.ensureApiToken(), t1);
  assert.equal(t1.length, 48);
  assert.ok(!('apiToken' in settings.publicView()));
});

// ---- license ----
test('license is not enforced while disabled in config', () => {
  assert.equal(license.status().licensed, true);
  assert.doesNotThrow(() => license.requireLicense());
});

test('license activation stores the instance and checks the product', async () => {
  const appFile = path.join(tmp, 'app.json');
  fs.writeFileSync(appFile, JSON.stringify({ licensing: { enabled: true, storeId: 1, productId: 2, revalidateDays: 7, graceDays: 14 } }));
  process.env.PORTABLESTUDIO_APP_CONFIG = appFile;
  try {
    assert.equal(license.status().licensed, false);

    const good = async () => ({
      status: 200,
      json: { activated: true, instance: { id: 'inst-1' }, license_key: { expires_at: null }, meta: { store_id: 1, product_id: 2 } },
    });
    const st = await license.activate('KEY-123', good);
    assert.equal(st.licensed, true);
    assert.equal(settings.load().license.instanceId, 'inst-1');

    const otherProduct = async () => ({ status: 200, json: { activated: true, instance: { id: 'x' }, meta: { store_id: 1, product_id: 99 } } });
    await assert.rejects(license.activate('KEY-OTHER', otherProduct), /different product/);

    const bad = async () => ({ status: 400, json: { activated: false, error: 'license_key not found.' } });
    await assert.rejects(license.activate('NOPE', bad), /not found/);

    await license.deactivate(async () => ({ status: 200, json: { deactivated: true } }));
    assert.equal(license.status().licensed, false);
  } finally {
    delete process.env.PORTABLESTUDIO_APP_CONFIG;
  }
});

// ---- packs ----
function makeTemplate(id, app = 'illustrator') {
  const dir = path.join(process.env.PORTABLESTUDIO_TEMPLATES, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, app === 'illustrator' ? 'template.ai' : 'template.psd'), `fake ${id}`);
  fs.writeFileSync(path.join(dir, 'thumbnail.png'), 'png');
  fs.writeFileSync(path.join(dir, 'template.json'), JSON.stringify({
    id, name: id, app, category: 'social-carousel', industries: ['restaurant'],
    file: app === 'illustrator' ? 'template.ai' : 'template.psd', thumbnail: 'thumbnail.png', pages: 5,
  }));
}

test('packs: export a pack, then install it from its catalog', async () => {
  makeTemplate('menu-carousel');
  makeTemplate('promo-post', 'photoshop');
  const out = path.join(tmp, 'published');
  const res = packs.exportPack({ outDir: out, pack: { id: 'restaurant-essentials', name: 'Restaurant Essentials', price: '$19' }, templateIds: ['menu-carousel', 'promo-post'] });
  assert.equal(res.pack.templates.length, 2);

  fs.rmSync(process.env.PORTABLESTUDIO_TEMPLATES, { recursive: true, force: true });
  assert.equal(templates.list().length, 0);

  const catalog = await packs.loadCatalog(path.join(out, 'catalog.json'));
  assert.equal(catalog.packs[0].price, '$19');
  const install = await packs.installPack(path.join(out, 'catalog.json'), 'restaurant-essentials');
  assert.equal(install.results.filter((r) => r.installed).length, 2);
  assert.deepEqual(templates.list().map((t) => t.id).sort(), ['menu-carousel', 'promo-post']);
  assert.equal(templates.list({ app: 'photoshop' }).length, 1);
});

test('packs refuse unsafe file names from a catalog', async () => {
  const out = path.join(tmp, 'evil');
  fs.mkdirSync(path.join(out, 't'), { recursive: true });
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ version: 1, packs: [{ id: 'evil', templates: [{ id: 'evil-t', path: 't/' }] }] }));
  fs.writeFileSync(path.join(out, 't', 'template.json'), JSON.stringify({ file: '../../escape.ai' }));
  await assert.rejects(packs.installPack(path.join(out, 'catalog.json'), 'evil'), /Unsafe file name/);
  assert.ok(!fs.existsSync(path.join(process.env.PORTABLESTUDIO_TEMPLATES, 'evil-t')));
});

// ---- ico ----
test('buildIco wraps PNGs in an ICO container', () => {
  const png = (w) => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(w, 20);
    return b;
  };
  const ico = buildIco([png(16), png(32)]);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico.readUInt8(6), 16);
  assert.equal(ico.readUInt8(22), 32);
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 32);
  assert.deepEqual(pngSize(png(48)), { width: 48, height: 48 });
});

// ---- zip + pack files ----
const { createZip, readZip, crc32 } = require('../core/zip');

test('zip round trip (stored and deflated entries)', () => {
  const big = Buffer.alloc(5000, 'a');
  const tiny = Buffer.from('x');
  const out = readZip(createZip([{ name: 'a/big.txt', data: big }, { name: 'tiny.bin', data: tiny }]));
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'a/big.txt');
  assert.ok(out[0].data.equals(big));
  assert.ok(out[1].data.equals(tiny));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('zip reader rejects path traversal', () => {
  const evil = createZip([{ name: '../evil.txt', data: Buffer.from('x') }]);
  assert.throws(() => readZip(evil), /Unsafe path/);
});

test('pack .zip export then install from file', () => {
  makeTemplate('zip-carousel');
  const out = path.join(tmp, 'zip-pack');
  const res = packs.exportPack({ outDir: out, pack: { id: 'zip-pack', name: 'Zip Pack' }, templateIds: ['zip-carousel'] });
  assert.ok(fs.existsSync(res.zip));
  fs.rmSync(path.join(process.env.PORTABLESTUDIO_TEMPLATES, 'zip-carousel'), { recursive: true, force: true });
  const installed = packs.installPackFile(res.zip);
  assert.equal(installed.name, 'Zip Pack');
  assert.deepEqual(installed.results, [{ id: 'zip-carousel', installed: true }]);
  assert.equal(templates.get('zip-carousel').file, 'template.ai');
});

test('pack .zip with an unsafe template file name is refused', () => {
  const bad = createZip([
    { name: 'pack.json', data: Buffer.from('{"id":"bad"}') },
    { name: 'templates/bad-t/template.json', data: Buffer.from('{"file":"evil.exe"}') },
    { name: 'templates/bad-t/evil.exe', data: Buffer.from('x') },
  ]);
  const f = path.join(tmp, 'bad.zip');
  fs.writeFileSync(f, bad);
  assert.throws(() => packs.installPackFile(f), /Unsafe file name/);
});
