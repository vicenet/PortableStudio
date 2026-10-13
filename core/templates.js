// Template library on disk: templates/<id>/{template.ai|psd, thumbnail.png, template.json}
'use strict';
const fs = require('fs');
const path = require('path');
const { paths, readJson, writeJson, slugify, isSafeId } = require('./paths');

function loadConfig() {
  return {
    industries: readJson(path.join(paths.config, 'industries.json')),
    categories: readJson(path.join(paths.config, 'categories.json')),
    app: readJson(process.env.PORTABLESTUDIO_APP_CONFIG || path.join(paths.config, 'app.json'), {}),
  };
}

function list({ app, industry, category } = {}) {
  const dir = paths.templates();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readTemplate(path.join(dir, d.name)))
    .filter((t) => t && (!app || t.app === app) && matches(t, industry, category))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readTemplate(dir) {
  const metaFile = path.join(dir, 'template.json');
  if (!fs.existsSync(metaFile)) return null;
  try {
    const meta = readJson(metaFile);
    meta.dir = dir;
    meta.filePath = path.join(dir, path.basename(meta.file));
    meta.thumbPath = meta.thumbnail ? path.join(dir, path.basename(meta.thumbnail)) : null;
    meta.industries = meta.industries && meta.industries.length ? meta.industries : ['general'];
    return meta;
  } catch (e) {
    return null;
  }
}

function get(id) {
  if (!isSafeId(id)) throw new Error(`Invalid template id: ${id}`);
  const t = readTemplate(path.join(paths.templates(), id));
  if (!t) throw new Error(`Template not found: ${id}`);
  return t;
}

function matches(t, industry, category) {
  const industryOk = !industry || industry === 'general' ||
    t.industries.includes('general') || t.industries.includes(industry);
  return industryOk && (!category || t.category === category);
}

// Creates an empty templates/<id> folder and returns its paths.
function createSlot(name, ext) {
  const base = slugify(name) || 'template';
  let id = base;
  for (let n = 2; fs.existsSync(path.join(paths.templates(), id)); n++) id = `${base}-${n}`;
  const dir = path.join(paths.templates(), id);
  fs.mkdirSync(dir, { recursive: true });
  return { id, dir, file: path.join(dir, 'template' + ext), thumb: path.join(dir, 'thumbnail.png') };
}

function writeMeta(slot, fields, scan) {
  const meta = {
    id: slot.id,
    name: fields.name,
    app: scan.app,
    category: fields.category,
    industries: fields.industries && fields.industries.length ? fields.industries : ['general'],
    description: fields.description || '',
    file: path.basename(slot.file),
    thumbnail: fs.existsSync(slot.thumb) ? 'thumbnail.png' : null,
    pages: scan.pages,
    size: { width: scan.width, height: scan.height },
    tags: [...scan.tags, ...scan.placeholders, ...scan.colorRoles.map((r) => `color.${r}`)],
    fontRoles: scan.fontStyles,
    author: fields.author || '',
    version: 1,
    created: new Date().toISOString().slice(0, 10),
  };
  writeJson(path.join(slot.dir, 'template.json'), meta);
  return meta;
}

function removeSlot(slot) {
  fs.rmSync(slot.dir, { recursive: true, force: true });
}

// What the API/MCP returns: no absolute paths beyond what a client needs.
function publicView(t) {
  return {
    id: t.id, name: t.name, app: t.app, category: t.category, industries: t.industries,
    description: t.description || '', pages: t.pages, size: t.size, tags: t.tags || [],
    thumbnail: t.thumbPath || null,
  };
}

module.exports = { loadConfig, list, get, matches, createSlot, writeMeta, removeSlot, publicView };
