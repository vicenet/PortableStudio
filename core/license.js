// License keys via Lemon Squeezy's public License API. Disabled until config/app.json enables it.
// Docs: https://docs.lemonsqueezy.com/api/license-api
'use strict';
const os = require('os');
const settings = require('./settings');
const { loadConfig } = require('./templates');
const http = require('./http');

const API = 'https://api.lemonsqueezy.com/v1/licenses';
const DAY = 24 * 60 * 60 * 1000;

const config = () => loadConfig().app.licensing || { enabled: false };

// Rejects keys sold for some other product in the same Lemon Squeezy account (or another store).
function checkProduct(meta, cfg) {
  if (!meta) return;
  if (cfg.storeId && Number(meta.store_id) !== Number(cfg.storeId)) throw new Error('This license key is for a different store.');
  if (cfg.productId && Number(meta.product_id) !== Number(cfg.productId)) throw new Error('This license key is for a different product.');
}

function errorMessage(res, fallback) {
  return (res.json && res.json.error) || `${fallback} (HTTP ${res.status})`;
}

async function activate(key, post = http.postForm) {
  const cfg = config();
  const res = await post(`${API}/activate`, { license_key: key.trim(), instance_name: `${os.hostname()} (PortableStudio)` });
  if (!res.json || !res.json.activated) throw new Error(errorMessage(res, 'Activation failed'));
  checkProduct(res.json.meta, cfg);
  settings.update({
    license: {
      key: key.trim(),
      instanceId: res.json.instance && res.json.instance.id,
      status: 'active',
      lastValidated: new Date().toISOString(),
      expiresAt: res.json.license_key && res.json.license_key.expires_at,
    },
  });
  return status();
}

async function validate(post = http.postForm) {
  const cfg = config();
  const lic = settings.load().license;
  if (!lic.key) return status();
  const res = await post(`${API}/validate`, { license_key: lic.key, instance_id: lic.instanceId || '' });
  if (res.status >= 500 || !res.json) throw new Error('License server unavailable');
  checkProduct(res.json.meta, cfg);
  const lk = res.json.license_key || {};
  settings.update({
    license: {
      status: res.json.valid ? 'active' : (lk.status || 'invalid'),
      lastValidated: new Date().toISOString(),
      expiresAt: lk.expires_at || null,
    },
  });
  return status();
}

async function deactivate(post = http.postForm) {
  const lic = settings.load().license;
  if (lic.key && lic.instanceId) {
    await post(`${API}/deactivate`, { license_key: lic.key, instance_id: lic.instanceId });
  }
  settings.update({ license: { key: '', instanceId: '', status: 'none', lastValidated: null, expiresAt: null } });
  return status();
}

// Licensed if licensing is off, or the key validated recently enough (offline grace period).
function status(now = Date.now()) {
  const cfg = config();
  const lic = settings.load().license;
  if (!cfg.enabled) return { licensed: true, mode: 'disabled', status: lic.status };
  const last = lic.lastValidated ? Date.parse(lic.lastValidated) : 0;
  const graceUntil = last + (cfg.graceDays || 14) * DAY;
  const expired = lic.expiresAt && Date.parse(lic.expiresAt) < now;
  const licensed = lic.status === 'active' && !expired && now < graceUntil;
  return {
    licensed,
    mode: 'enforced',
    status: expired ? 'expired' : lic.status,
    expiresAt: lic.expiresAt,
    lastValidated: lic.lastValidated,
    needsRevalidation: lic.status === 'active' && now - last > (cfg.revalidateDays || 7) * DAY,
  };
}

// Called on startup: revalidates when due; network failures fall back to the grace period.
async function check() {
  const st = status();
  if (st.mode === 'enforced' && st.needsRevalidation) {
    try {
      return await validate();
    } catch {
      return status();
    }
  }
  return st;
}

function requireLicense() {
  const st = status();
  if (!st.licensed) throw new Error('PortableStudio needs an active license. Activate it in Settings.');
}

module.exports = { activate, validate, deactivate, status, check, requireLicense };
