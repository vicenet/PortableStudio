// Where PortableStudio keeps its files. Shared by the panel (CEP Node) and the MCP server.
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

// Each host app's panel serves the local API on its own port.
const PORTS = { illustrator: 7391, photoshop: 7392 };

function appDataDir() {
  if (process.env.PORTABLESTUDIO_HOME) return process.env.PORTABLESTUDIO_HOME;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PortableStudio');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'PortableStudio');
  return path.join(os.homedir(), '.config', 'portablestudio');
}

// User-visible files (brands, output) live in Documents.
function documentsDir() {
  if (process.env.PORTABLESTUDIO_DOCS) return process.env.PORTABLESTUDIO_DOCS;
  return path.join(os.homedir(), 'Documents', 'PortableStudio');
}

const paths = {
  root: ROOT,
  config: path.join(ROOT, 'config'),
  templates: () => process.env.PORTABLESTUDIO_TEMPLATES || path.join(ROOT, 'templates'),
  appData: appDataDir,
  settingsFile: () => path.join(appDataDir(), 'settings.json'),
  runtimeFile: (app) => path.join(appDataDir(), 'runtime', `${app}.json`),
  brands: () => path.join(documentsDir(), 'Brands'),
  output: () => path.join(documentsDir(), 'Output'),
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (fallback !== undefined && (e.code === 'ENOENT' || e instanceof SyntaxError)) return fallback;
    throw e;
  }
}

function writeJson(file, data, mode) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const safeFileName = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Untitled';

// Rejects ids that could escape their folder (../, slashes, etc.).
const isSafeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(id);

module.exports = { PORTS, paths, ensureDir, readJson, writeJson, slugify, safeFileName, isSafeId };
