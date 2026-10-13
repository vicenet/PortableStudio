// User settings (API token, Anthropic key, license cache). Stored in the app-data folder,
// readable only by the current user where the OS supports it.
'use strict';
const crypto = require('crypto');
const { paths, readJson, writeJson } = require('./paths');

const DEFAULTS = {
  apiToken: '',
  apiEnabled: true,
  anthropicApiKey: '',
  aiModel: 'claude-opus-5-5',
  catalogUrl: '',
  license: { key: '', instanceId: '', status: 'none', lastValidated: null, expiresAt: null },
};

function load() {
  const saved = readJson(paths.settingsFile(), {});
  return { ...DEFAULTS, ...saved, license: { ...DEFAULTS.license, ...(saved.license || {}) } };
}

function save(settings) {
  writeJson(paths.settingsFile(), settings, 0o600);
  return settings;
}

function update(patch) {
  const s = load();
  const next = { ...s, ...patch, license: { ...s.license, ...(patch.license || {}) } };
  return save(next);
}

// The local API token is created on first use and shared with the MCP server through this file.
function ensureApiToken() {
  const s = load();
  if (s.apiToken) return s.apiToken;
  s.apiToken = crypto.randomBytes(24).toString('hex');
  save(s);
  return s.apiToken;
}

function regenerateApiToken() {
  return update({ apiToken: crypto.randomBytes(24).toString('hex') }).apiToken;
}

// Safe to show in a UI or send over the API.
function publicView(s = load()) {
  return {
    apiEnabled: s.apiEnabled,
    aiModel: s.aiModel,
    hasAnthropicKey: Boolean(s.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    catalogUrl: s.catalogUrl,
    license: { status: s.license.status, expiresAt: s.license.expiresAt, lastValidated: s.license.lastValidated },
  };
}

module.exports = { DEFAULTS, load, save, update, ensureApiToken, regenerateApiToken, publicView };
