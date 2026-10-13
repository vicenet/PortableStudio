// Local REST API (http://127.0.0.1:<port>/v1/...). The panel serves it while it is open;
// the MCP server and other tools call it. Requests need `Authorization: Bearer <token>`.
'use strict';
const crypto = require('crypto');

const MAX_BODY = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sameToken(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// deps: { studio, brands, templates, color, packs, license, settings, getToken }
function createApi(deps) {
  const { studio, brands, templates, color, packs, license, settings } = deps;
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  const brandFrom = (body) => brands.resolve({ brandId: body.brandId, brand: body.brand });

  route('GET', '/v1/status', () => studio.status());
  route('GET', '/v1/config', () => {
    const c = templates.loadConfig();
    return { industries: c.industries, categories: c.categories };
  });

  route('GET', '/v1/templates', (p, body, q) =>
    studio.listTemplates({ industry: q.get('industry') || undefined, category: q.get('category') || undefined, allApps: q.get('app') === 'all' })
      .map(templates.publicView));
  route('GET', '/v1/templates/:id', (p) => templates.publicView(templates.get(p.id)));

  route('GET', '/v1/brands', () => brands.list());
  route('GET', '/v1/brands/:id', (p) => brands.get(p.id));
  route('POST', '/v1/brands', (p, body) => brands.save(body.brand || body));
  route('PUT', '/v1/brands/:id', (p, body) => brands.update(p.id, body.brand || body));
  route('DELETE', '/v1/brands/:id', (p) => ({ deleted: brands.remove(p.id) }));

  route('POST', '/v1/generate', (p, body) => studio.generate({
    brand: brandFrom(body),
    templateIds: body.templateIds || (body.templateId ? [body.templateId] : []),
    exportPages: Boolean(body.exportPages),
    pageWidth: Number(body.pageWidth) || 0,
  }));
  route('POST', '/v1/logo-kit', (p, body) => studio.logoKit({ brand: brandFrom(body) }));
  route('POST', '/v1/logo-grid', (p, body) => studio.logoGrid(body || {}));

  route('POST', '/v1/palette/extract', (p, body) => studio.extractPalette({ imagePath: body.imagePath, count: body.count || 5 }));
  route('POST', '/v1/palette/report', (p, body) => color.paletteReport(body.colors || brandFrom(body).colors));

  route('POST', '/v1/copy', async (p, body) => {
    const brand = brandFrom(body);
    const copy = await studio.writeCopy({ brand, brief: body.brief || '', slides: body.slides || 5, source: body.source || 'ai' });
    if (body.save && brand.id) brands.save({ ...brand, copy });
    return copy;
  });

  route('GET', '/v1/packs', (p, body, q) => packs.loadCatalog(q.get('catalogUrl') || settings.load().catalogUrl));
  route('POST', '/v1/packs/install', (p, body) =>
    packs.installPack(body.catalogUrl || settings.load().catalogUrl, body.packId, { overwrite: Boolean(body.overwrite) }));

  route('GET', '/v1/license', () => license.status());

  return async function handle(req, res) {
    try {
      // Browsers always send Origin on cross-site requests; refusing them stops any web page
      // from driving the API through the user's browser.
      if (req.headers.origin) throw new HttpError(403, 'Browser requests are not allowed.');
      if (!sameToken(req.headers.authorization, `Bearer ${deps.getToken()}`)) throw new HttpError(401, 'Missing or wrong API token.');
      const url = new URL(req.url, 'http://localhost');
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) throw new HttpError(404, `No route for ${req.method} ${url.pathname}`);
      const m = url.pathname.match(match.re);
      const params = {};
      match.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
      const data = await match.handler(params, body, url.searchParams);
      send(res, 200, { ok: true, data: data === undefined ? null : data });
    } catch (e) {
      const status = e.status || (/not found/i.test(e.message) ? 404 : 400);
      send(res, status, { ok: false, error: e.message });
    }
  };
}

module.exports = { createApi, HttpError };
