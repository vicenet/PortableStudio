// Tests the pure tag/brand logic in host/lib/brand.jsx. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrand() {
  const ctx = { PortableStudio: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'host', 'lib', 'brand.jsx'), 'utf8'), ctx);
  return ctx.PortableStudio.brand;
}

const B = loadBrand();
// Objects from the vm context have a different Array prototype; compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('parseTag reads key and modifiers', () => {
  assert.deepEqual(plain(B.parseTag('{{brand.name|heading|primary}}')), { key: 'brand.name', mods: ['heading', 'primary'] });
  assert.deepEqual(plain(B.parseTag(' {{ Logo.Mark }} ')), { key: 'logo.mark', mods: [] });
  assert.equal(B.parseTag('Layer 1'), null);
  assert.equal(B.parseTag('{{a}} and {{b}}'), null);
});

test('findTags returns positions', () => {
  const tags = B.findTags('Hi {{brand.name}}, {{date}}');
  assert.equal(tags.length, 2);
  assert.equal(tags[0].start, 3);
  assert.equal(tags[0].end, 17);
  assert.equal(tags[1].key, 'date');
});

test('replaceTags fills known tags and reports unknown ones', () => {
  const r = B.replaceTags('{{brand.name}} - {{nope}}', { 'brand.name': 'Saffron' });
  assert.equal(r.text, 'Saffron - {{nope}}');
  assert.equal(r.changed, true);
  assert.deepEqual(plain(r.unfilled), ['nope']);
});

test('colour helpers', () => {
  assert.equal(B.normalizeHex('abc'), '#AABBCC');
  assert.equal(B.normalizeHex('#e4572e'), '#E4572E');
  assert.equal(B.normalizeHex('zzz'), null);
  assert.deepEqual({ ...B.hexToRgb('#E4572E') }, { r: 228, g: 87, b: 46 });
  assert.deepEqual({ ...B.rgbToCmyk({ r: 0, g: 0, b: 0 }) }, { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual({ ...B.rgbToCmyk({ r: 255, g: 0, b: 0 }) }, { c: 0, m: 100, y: 100, k: 0 });
});

test('buildValues flattens the brand', () => {
  const v = B.buildValues({
    name: 'Saffron', designerName: 'Ace',
    colors: { primary: '#E4572E', secondary: 'not-a-colour' },
    fonts: { heading: { ps: 'Montserrat-Bold', name: 'Montserrat Bold' } },
  }, new Date(2026, 9, 13));
  assert.equal(v['brand.name'], 'Saffron');
  assert.equal(v['designer.name'], 'Ace');
  assert.equal(v['date'], 'October 2026');
  assert.equal(v['color.primary.rgb'], '228, 87, 46');
  assert.equal(v['color.primary.cmyk'], '0, 62, 80, 11');
  assert.equal('color.secondary' in v, false);
  assert.equal(v['font.heading'], 'Montserrat Bold');
});

test('assetPath maps logo and image keys', () => {
  const brand = { logos: { mark: 'C:/m.svg' }, images: { hero: 'C:/h.jpg' } };
  assert.equal(B.assetPath(brand, 'logo.mark'), 'C:/m.svg');
  assert.equal(B.assetPath(brand, 'image.hero'), 'C:/h.jpg');
  assert.equal(B.assetPath(brand, 'logo.full'), '');
});

test('buildValues exposes brand copy as copy.* tags', () => {
  const v = B.buildValues({
    name: 'Saffron',
    copy: { headline: 'Good food', values: ['Fresh', 'Warm'], slides: [{ title: 'Hi', body: 'Welcome' }] },
  });
  assert.equal(v['copy.headline'], 'Good food');
  assert.equal(v['copy.values'], 'Fresh\rWarm');
  assert.equal(v['copy.value2'], 'Warm');
  assert.equal(v['copy.slide1.title'], 'Hi');
  assert.equal(v['copy.slide1.body'], 'Welcome');
  assert.equal('copy.about' in v, false);
});
