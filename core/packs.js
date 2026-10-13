// Template packs: install templates from a remote (or local) catalog, and export packs to publish.
//
// catalog.json
// {
//   "version": 1,
//   "packs": [{
//     "id": "restaurant-essentials", "name": "Restaurant Essentials", "author": "...",
//     "description": "...", "industries": ["restaurant"], "price": "Free" | "$19",
//     "purchaseUrl": "https://...",          // optional: shown as a Buy link for paid packs
//     "templates": [{ "id": "menu-guidelines", "path": "templates/menu-guidelines/" }]
//   }]
// }
// Each template path is a folder (relative to the catalog URL) containing template.json,
// the template file and an optional thumbnail.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { paths, readJson, writeJson, isSafeId, ensureDir } = require('./paths');
const http = require('./http');
const templates = require('./templates');
const { createZip, readZip } = require('./zip');

const ALLOWED_EXT = ['.ai', '.psd', '.png', '.jpg', '.jpeg'];

const toUrl = (urlOrPath) => (/^[a-z]+:\/\//i.test(urlOrPath) ? urlOrPath : pathToFileURL(path.resolve(urlOrPath)).toString());

async function loadCatalog(catalogUrl) {
  if (!catalogUrl) throw new Error('No template catalog configured. Add a catalog URL in Settings.');
  const url = toUrl(catalogUrl);
  const res = await http.request(url);
  if (res.status !== 200) throw new Error(`Could not load catalog (HTTP ${res.status}).`);
  const catalog = JSON.parse(res.body.toString('utf8'));
  if (!catalog || !Array.isArray(catalog.packs)) throw new Error('Not a PortableStudio catalog.');
  const installed = new Set(templates.list().map((t) => t.id));
  return {
    url,
    packs: catalog.packs.map((p) => ({
      ...p,
      templates: (p.templates || []).map((t) => ({ ...t, installed: installed.has(t.id) })),
    })),
  };
}

// A file name from untrusted metadata must be a plain name with an expected extension.
function safeName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== name || !ALLOWED_EXT.includes(path.extname(base).toLowerCase())) {
    throw new Error(`Unsafe file name in template: ${name}`);
  }
  return base;
}

async function installTemplate(catalogUrl, entry, { overwrite = false } = {}) {
  if (!isSafeId(entry.id)) throw new Error(`Invalid template id: ${entry.id}`);
  const dest = path.join(paths.templates(), entry.id);
  if (fs.existsSync(dest) && !overwrite) return { id: entry.id, skipped: true };

  const base = new URL(entry.path.endsWith('/') ? entry.path : entry.path + '/', toUrl(catalogUrl)).toString();
  const metaRes = await http.request(new URL('template.json', base).toString());
  if (metaRes.status !== 200) throw new Error(`Template ${entry.id}: template.json not found.`);
  const meta = JSON.parse(metaRes.body.toString('utf8'));
  const file = safeName(meta.file);
  const thumb = meta.thumbnail ? safeName(meta.thumbnail) : null;

  const tmp = `${dest}.downloading`;
  fs.rmSync(tmp, { recursive: true, force: true });
  ensureDir(tmp);
  try {
    await http.download(new URL(file, base).toString(), path.join(tmp, file));
    if (thumb) await http.download(new URL(thumb, base).toString(), path.join(tmp, thumb));
    writeJson(path.join(tmp, 'template.json'), { ...meta, id: entry.id, file, thumbnail: thumb });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return { id: entry.id, installed: true };
}

async function installPack(catalogUrl, packId, opts) {
  const catalog = await loadCatalog(catalogUrl);
  const pack = catalog.packs.find((p) => p.id === packId);
  if (!pack) throw new Error(`Pack not found: ${packId}`);
  const results = [];
  for (const t of pack.templates) results.push(await installTemplate(catalog.url, t, opts));
  return { pack: pack.id, results };
}

// Writes a self-contained, hostable folder: catalog.json + templates/<id>/...
function exportPack({ outDir, pack, templateIds }) {
  if (!pack || !isSafeId(pack.id)) throw new Error('A pack needs an id (letters, numbers, dashes).');
  ensureDir(outDir);
  const entries = templateIds.map((id) => {
    const t = templates.get(id);
    const dest = ensureDir(path.join(outDir, 'templates', t.id));
    for (const f of ['template.json', path.basename(t.file), t.thumbnail && path.basename(t.thumbnail)].filter(Boolean)) {
      fs.copyFileSync(path.join(t.dir, f), path.join(dest, f));
    }
    return { id: t.id, name: t.name, app: t.app, path: `templates/${t.id}/` };
  });
  const catalogFile = path.join(outDir, 'catalog.json');
  const catalog = readJson(catalogFile, { version: 1, packs: [] });
  const packEntry = {
    id: pack.id,
    name: pack.name || pack.id,
    author: pack.author || '',
    description: pack.description || '',
    industries: pack.industries || ['general'],
    price: pack.price || 'Free',
    purchaseUrl: pack.purchaseUrl || '',
    templates: entries,
  };
  catalog.packs = catalog.packs.filter((p) => p.id !== pack.id).concat(packEntry);
  writeJson(catalogFile, catalog);

  // Also a single-file version (<id>.zip) to sell or share; installed with installPackFile().
  const zipEntries = [{ name: 'pack.json', data: Buffer.from(JSON.stringify(packEntry, null, 2)) }];
  for (const t of packEntry.templates) {
    const dir = path.join(outDir, 'templates', t.id);
    for (const f of fs.readdirSync(dir)) {
      zipEntries.push({ name: `templates/${t.id}/${f}`, data: fs.readFileSync(path.join(dir, f)) });
    }
  }
  const zipFile = path.join(outDir, `${pack.id}.zip`);
  fs.writeFileSync(zipFile, createZip(zipEntries));
  return { catalog: catalogFile, pack: packEntry, zip: zipFile };
}

// Installs every template from a pack .zip (made by exportPack) into the library.
function installPackFile(zipPath, { overwrite = true } = {}) {
  const entries = readZip(fs.readFileSync(zipPath));
  const manifest = entries.find((e) => e.name === 'pack.json');
  if (!manifest) throw new Error('This zip is not a PortableStudio pack (pack.json missing).');
  const pack = JSON.parse(manifest.data.toString('utf8'));
  const byTemplate = {};
  for (const e of entries) {
    const m = e.name.match(/^templates\/([^/]+)\/([^/]+)$/);
    if (!m) continue;
    (byTemplate[m[1]] = byTemplate[m[1]] || {})[m[2]] = e.data;
  }
  const results = [];
  for (const id of Object.keys(byTemplate)) {
    if (!isSafeId(id)) throw new Error(`Invalid template id in pack: ${id}`);
    const files = byTemplate[id];
    if (!files['template.json']) throw new Error(`Template ${id} has no template.json`);
    const meta = JSON.parse(files['template.json'].toString('utf8'));
    const file = safeName(meta.file);
    const thumb = meta.thumbnail ? safeName(meta.thumbnail) : null;
    if (!files[file]) throw new Error(`Template ${id} is missing ${file}`);
    const dest = path.join(paths.templates(), id);
    if (fs.existsSync(dest) && !overwrite) {
      results.push({ id, skipped: true });
      continue;
    }
    const tmp = `${dest}.installing`;
    fs.rmSync(tmp, { recursive: true, force: true });
    ensureDir(tmp);
    fs.writeFileSync(path.join(tmp, file), files[file]);
    if (thumb && files[thumb]) fs.writeFileSync(path.join(tmp, thumb), files[thumb]);
    writeJson(path.join(tmp, 'template.json'), { ...meta, id, file, thumbnail: thumb && files[thumb] ? thumb : null });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    results.push({ id, installed: true });
  }
  return { pack: pack.id, name: pack.name || pack.id, results };
}

module.exports = { loadCatalog, installTemplate, installPack, exportPack, installPackFile };
