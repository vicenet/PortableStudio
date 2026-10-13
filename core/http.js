// Small HTTP client on Node's http/https (no fetch: CEP's Node is too old and the panel's
// browser fetch is subject to CORS). Supports http(s):// and file:// URLs.
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const { fileURLToPath } = require('url');

const TIMEOUT_MS = 30000;

function request(url, { method = 'GET', headers = {}, body = null, redirects = 3 } = {}) {
  if (url.startsWith('file:')) {
    return Promise.resolve().then(() => {
      const buf = fs.readFileSync(fileURLToPath(url));
      return { status: 200, headers: {}, body: buf };
    });
  }
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method, headers, timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(request(next, { method, headers, body, redirects: redirects - 1 }));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error(`Request timed out: ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getJson(url, headers) {
  const res = await request(url, { headers: { Accept: 'application/json', ...headers } });
  if (res.status !== 200) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
  return JSON.parse(res.body.toString('utf8'));
}

async function postForm(url, fields) {
  const body = new URLSearchParams(fields).toString();
  const res = await request(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  let json = null;
  try {
    json = JSON.parse(res.body.toString('utf8'));
  } catch { /* non-JSON error page */ }
  return { status: res.status, json };
}

async function download(url, dest) {
  const res = await request(url);
  if (res.status !== 200) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  fs.writeFileSync(dest, res.body);
  return dest;
}

module.exports = { request, getJson, postForm, download };
