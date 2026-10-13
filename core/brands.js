// Brand profiles: one JSON file per client in Documents/PortableStudio/Brands.
'use strict';
const fs = require('fs');
const path = require('path');
const { paths, ensureDir, readJson, writeJson, slugify, isSafeId } = require('./paths');

const COLOR_ROLES = ['primary', 'secondary', 'accent'];
const FONT_ROLES = ['heading', 'body'];
// mark/full/type, plus optional designer-made one-colour versions used for |white and |black.
const LOGO_KEYS = ['mark', 'full', 'type', 'markWhite', 'fullWhite', 'markBlack', 'fullBlack'];
const COPY_TEXT_FIELDS = ['headline', 'subheadline', 'about', 'mission', 'voice', 'cta'];

function defaultBrand() {
  return {
    id: '',
    name: '',
    tagline: '',
    industry: 'general',
    website: '',
    designerName: '',
    designerEmail: '',
    colors: { primary: '#E4572E', secondary: '#29335C', accent: '#F3A712' },
    fonts: { heading: { ps: '', name: '' }, body: { ps: '', name: '' } },
    logos: { mark: '', full: '', type: '', markWhite: '', fullWhite: '', markBlack: '', fullBlack: '' },
    images: {},
    copy: { headline: '', subheadline: '', about: '', mission: '', voice: '', cta: '', values: [], slides: [] },
    updatedAt: null,
  };
}

const str = (v) => (v === null || v === undefined ? '' : String(v));

// Accepts partial or messy input (API, MCP, older saves) and returns a complete brand.
function normalize(input) {
  const b = defaultBrand();
  const src = input || {};
  for (const k of ['id', 'name', 'tagline', 'industry', 'website', 'designerName', 'designerEmail']) {
    if (src[k] !== undefined) b[k] = str(src[k]).trim();
  }
  if (!b.industry) b.industry = 'general';
  for (const r of COLOR_ROLES) {
    const hex = normalizeHex(src.colors && src.colors[r]);
    if (hex) b.colors[r] = hex;
  }
  for (const r of FONT_ROLES) {
    const f = src.fonts && src.fonts[r];
    if (typeof f === 'string') b.fonts[r] = { ps: f, name: f };
    else if (f) b.fonts[r] = { ps: str(f.ps || f.postScriptName), name: str(f.name || f.ps) };
  }
  for (const k of LOGO_KEYS) b.logos[k] = str(src.logos && src.logos[k]);
  if (src.images && typeof src.images === 'object') {
    for (const k of Object.keys(src.images)) if (/^[a-z0-9_]+$/i.test(k)) b.images[k.toLowerCase()] = str(src.images[k]);
  }
  const c = src.copy || {};
  for (const k of COPY_TEXT_FIELDS) b.copy[k] = str(c[k]);
  b.copy.values = Array.isArray(c.values) ? c.values.map(str).filter(Boolean) : [];
  b.copy.slides = Array.isArray(c.slides)
    ? c.slides.map((s) => ({ title: str(s && s.title), body: str(s && s.body) })).filter((s) => s.title || s.body)
    : [];
  b.updatedAt = src.updatedAt || null;
  return b;
}

function normalizeHex(hex) {
  let h = str(hex).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toUpperCase() : null;
}

const fileFor = (id) => path.join(paths.brands(), `${id}.json`);

function list() {
  const dir = paths.brands();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return normalize(readJson(path.join(dir, f)));
      } catch {
        return null;
      }
    })
    .filter((b) => b && b.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function get(id) {
  if (!isSafeId(id)) throw new Error(`Invalid brand id: ${id}`);
  const file = fileFor(id);
  if (!fs.existsSync(file)) throw new Error(`Brand not found: ${id}`);
  return normalize(readJson(file));
}

// Creates or updates. A brand without an id gets one derived from its name.
function save(input) {
  const b = normalize(input);
  if (!b.name) throw new Error('A brand needs a name.');
  if (!b.id) {
    const base = slugify(b.name) || 'brand';
    let id = base;
    for (let n = 2; fs.existsSync(fileFor(id)); n++) id = `${base}-${n}`;
    b.id = id;
  }
  if (!isSafeId(b.id)) throw new Error(`Invalid brand id: ${b.id}`);
  b.updatedAt = new Date().toISOString();
  ensureDir(paths.brands());
  writeJson(fileFor(b.id), b);
  return b;
}

// Partial update: fields not in `patch` keep their saved values (nested colour/font/logo/copy too).
function update(id, patch) {
  const current = get(id);
  const p = patch || {};
  return save({
    ...current,
    ...p,
    id,
    colors: { ...current.colors, ...(p.colors || {}) },
    fonts: { ...current.fonts, ...(p.fonts || {}) },
    logos: { ...current.logos, ...(p.logos || {}) },
    images: { ...current.images, ...(p.images || {}) },
    copy: { ...current.copy, ...(p.copy || {}) },
  });
}

function remove(id) {
  if (!isSafeId(id)) throw new Error(`Invalid brand id: ${id}`);
  const file = fileFor(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}

// Brand from either an id or an inline object (used by the API and MCP).
function resolve({ brandId, brand }) {
  if (brandId) return get(brandId);
  if (brand) return normalize(brand);
  throw new Error('Provide brandId or brand.');
}

module.exports = {
  COLOR_ROLES, FONT_ROLES, LOGO_KEYS, COPY_TEXT_FIELDS,
  defaultBrand, normalize, normalizeHex, list, get, save, update, remove, resolve,
};
