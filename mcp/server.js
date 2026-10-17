#!/usr/bin/env node
// PortableStudio MCP server (stdio). Lets Claude and other MCP clients manage brands, write copy,
// check colours and generate brand assets.
//
// Brand, template, copy, colour and pack tools work on their own. Generating files needs
// Illustrator or Photoshop open with the PortableStudio panel loaded, because that is where
// the local API (core/api.js) runs.
'use strict';
const http = require('http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const { paths, PORTS, readJson } = require('../core/paths');
const settings = require('../core/settings');
const brands = require('../core/brands');
const templates = require('../core/templates');
const color = require('../core/color');
const copy = require('../core/copy');
const packs = require('../core/packs');
const pkg = require('../package.json');

// ---------- local API client ----------
function apiRequest(app, method, route, body) {
  const runtime = readJson(paths.runtimeFile(app), null);
  const port = (runtime && runtime.port) || PORTS[app];
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
      headers: {
        Authorization: `Bearer ${settings.load().apiToken}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (json.ok) resolve(json.data);
          else reject(new Error(json.error));
        } catch {
          reject(new Error(`Unexpected response from the ${app} panel (HTTP ${res.statusCode}).`));
        }
      });
    });
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error(`${app === 'illustrator' ? 'Illustrator' : 'Photoshop'} isn't connected. Open it and the PortableStudio panel (Window > Extensions > PortableStudio), then try again.`));
      } else {
        reject(e);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- helpers ----------
const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e.message || String(e) }] });
const tool = (fn) => async (args) => {
  try {
    return ok(await fn(args || {}));
  } catch (e) {
    return fail(e);
  }
};

const brandRef = {
  brandId: z.string().optional().describe('Id of a saved brand (see list_brands).'),
  brand: z.record(z.string(), z.any()).optional().describe('Inline brand object, used instead of brandId.'),
};

const brandShape = {
  id: z.string().optional().describe('Existing brand id to update. Omit to create a new brand.'),
  name: z.string().describe('Brand name.'),
  tagline: z.string().optional(),
  industry: z.string().optional().describe('Industry id from list_industries, e.g. "restaurant".'),
  website: z.string().optional(),
  designerName: z.string().optional(),
  designerEmail: z.string().optional(),
  colors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
  }).optional().describe('Hex colours like "#E4572E".'),
  fonts: z.object({
    heading: z.string().optional(),
    body: z.string().optional(),
  }).optional().describe('PostScript font names installed on this computer, e.g. "Montserrat-Bold".'),
  logos: z.object({
    mark: z.string().optional(),
    full: z.string().optional(),
    type: z.string().optional(),
  }).optional().describe('Absolute paths to logo files (SVG/AI best for Illustrator, PNG for Photoshop).'),
};

// Every tool declares all four hints explicitly so hosts can warn before anything that writes,
// deletes or reaches the network. readOnly: changes nothing. destructive: can overwrite or delete
// existing data. idempotent: repeating the same call has no further effect. openWorld: reaches the
// internet (localhost and the user's own files don't count).
const hints = (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) =>
  ({ readOnlyHint, destructiveHint, idempotentHint, openWorldHint });

// ---------- server ----------
// The local API client is injectable so tests can stand in for the Adobe panels.
function createServer({ request = apiRequest } = {}) {
  const server = new McpServer({ name: 'portablestudio', version: pkg.version });

  async function connectedApps() {
    const out = {};
    for (const app of Object.keys(PORTS)) {
      try {
        out[app] = await request(app, 'GET', '/v1/status');
      } catch (e) {
        out[app] = { connected: false, reason: e.message };
      }
    }
    return out;
  }

  server.registerTool('status', {
    title: 'Connection status',
    description: 'Shows which Adobe apps have the PortableStudio panel open and ready to generate files.',
    inputSchema: {},
    annotations: hints(true, false, true, false),
  }, tool(connectedApps));

  server.registerTool('list_industries', {
    title: 'List industries',
    description: 'Industries with their tone of voice and suggested colour palettes.',
    inputSchema: {},
    annotations: hints(true, false, true, false),
  }, tool(() => templates.loadConfig().industries.map(({ id, name, voice, palettes }) => ({ id, name, voice, palettes }))));

  server.registerTool('list_templates', {
    title: 'List templates',
    description: 'Templates in the library. Each has an app (illustrator or photoshop), category and industries.',
    inputSchema: {
      app: z.enum(['illustrator', 'photoshop']).optional(),
      industry: z.string().optional(),
      category: z.string().optional().describe('brand-guidelines, logo-presentation, social-post, social-carousel, stationery or mockup'),
    },
    annotations: hints(true, false, true, false),
  }, tool((a) => templates.list(a).map(templates.publicView)));

  server.registerTool('list_brands', {
    title: 'List brands',
    description: 'Saved brand profiles (clients).',
    inputSchema: {},
    annotations: hints(true, false, true, false),
  }, tool(() => brands.list().map((b) => ({ id: b.id, name: b.name, industry: b.industry, colors: b.colors, updatedAt: b.updatedAt }))));

  server.registerTool('get_brand', {
    title: 'Get brand',
    description: 'Full details of one saved brand, including its copy.',
    inputSchema: { id: z.string() },
    annotations: hints(true, false, true, false),
  }, tool((a) => brands.get(a.id)));

  server.registerTool('save_brand', {
    title: 'Save brand',
    description: 'Creates a brand, or updates one when id is given. Fields you leave out keep their current values.',
    inputSchema: brandShape,
    annotations: hints(false, true, false, false),
  }, tool((a) => (a.id ? brands.update(a.id, a) : brands.save(a))));

  server.registerTool('delete_brand', {
    title: 'Delete brand',
    description: 'Permanently deletes a saved brand profile. Generated files are not affected.',
    inputSchema: { id: z.string() },
    annotations: hints(false, true, true, false),
  }, tool((a) => ({ deleted: brands.remove(a.id) })));

  server.registerTool('write_brand_copy', {
    title: 'Write brand copy',
    description: 'Writes headline, about, mission, values, tone of voice, call to action and carousel slides. ' +
      'source "ai" uses Claude (needs an Anthropic API key in PortableStudio settings or ANTHROPIC_API_KEY); ' +
      '"industry" uses the built-in starter copy for the brand\'s industry. Set save to store it on the brand.',
    inputSchema: {
      ...brandRef,
      brief: z.string().optional().describe('Positioning, audience, tone or anything the copy should reflect.'),
      slides: z.number().int().min(1).max(10).optional().describe('Number of carousel slides (default 5).'),
      source: z.enum(['ai', 'industry']).optional(),
      save: z.boolean().optional(),
    },
    annotations: hints(false, true, false, true),
  }, tool(async (a) => {
    const brand = brands.resolve(a);
    const result = a.source === 'industry'
      ? copy.industryCopy(brand)
      : await copy.generateCopy(brand, { brief: a.brief || '', slides: a.slides || 5 });
    if (a.save && brand.id) brands.save({ ...brand, copy: result });
    return result;
  }));

  server.registerTool('color_report', {
    title: 'Colour report',
    description: 'For each brand colour: HEX/RGB/CMYK, tints and shades, and WCAG contrast against white, black and the other brand colours.',
    inputSchema: {
      ...brandRef,
      colors: z.record(z.string(), z.string()).optional().describe('e.g. {"primary":"#E4572E","secondary":"#29335C"}'),
    },
    annotations: hints(true, false, true, false),
  }, tool((a) => color.paletteReport(a.colors || brands.resolve(a).colors)));

  server.registerTool('extract_palette_from_logo', {
    title: 'Extract palette from logo',
    description: 'Reads the main colours from a logo image and suggests primary/secondary/accent. Needs Illustrator or Photoshop open with the panel.',
    inputSchema: { imagePath: z.string(), count: z.number().int().min(2).max(10).optional() },
    annotations: hints(true, false, true, false),
  }, tool(async (a) => {
    const apps = await connectedApps();
    const app = Object.keys(apps).find((k) => apps[k].app);
    if (!app) throw new Error('Open Illustrator or Photoshop with the PortableStudio panel to read image colours.');
    return request(app, 'POST', '/v1/palette/extract', a);
  }));

  server.registerTool('generate', {
    title: 'Generate brand assets',
    description: 'Fills templates with a brand and saves editable files plus PDF/PNG to Documents/PortableStudio/Output. ' +
      'Templates are routed to the app they belong to, which must be open with the PortableStudio panel. ' +
      'exportPages also saves every page or carousel slide as its own PNG.',
    inputSchema: {
      ...brandRef,
      templateIds: z.array(z.string()).min(1),
      exportPages: z.boolean().optional(),
      pageWidth: z.number().int().positive().optional().describe('Width in pixels for page PNGs (Illustrator).'),
    },
    annotations: hints(false, false, false, false),
  }, tool(async (a) => {
    const brand = brands.resolve(a);
    const byApp = {};
    for (const id of a.templateIds) {
      const t = templates.get(id);
      (byApp[t.app] = byApp[t.app] || []).push(id);
    }
    const out = {};
    for (const app of Object.keys(byApp)) {
      try {
        out[app] = await request(app, 'POST', '/v1/generate', {
          brand, templateIds: byApp[app], exportPages: a.exportPages, pageWidth: a.pageWidth,
        });
      } catch (e) {
        out[app] = { error: e.message, templateIds: byApp[app] };
      }
    }
    return out;
  }));

  server.registerTool('export_logo_kit', {
    title: 'Export logo kit',
    description: 'Exports every logo as SVG, EPS, PDF and PNG in colour, black, white and brand-colour versions, ' +
      'plus favicons (including favicon.ico) and social profile/banner images. Needs Illustrator open with the panel.',
    inputSchema: brandRef,
    annotations: hints(false, false, false, false),
  }, tool((a) => request('illustrator', 'POST', '/v1/logo-kit', { brand: brands.resolve(a) })));

  server.registerTool('draw_logo_grid', {
    title: 'Draw logo construction grid',
    description: 'Draws a construction grid (outlines, anchor points, handles, circles, optional gridlines and clearspace) ' +
      'on the artwork currently selected in Illustrator. The user must select a vector logo first.',
    inputSchema: {
      outlines: z.boolean().optional(), anchors: z.boolean().optional(), handles: z.boolean().optional(),
      circles: z.boolean().optional(), gridlines: z.boolean().optional(), clearspace: z.boolean().optional(),
      color: z.string().optional().describe('Hex colour for the grid lines, e.g. "#1E90FF".'),
    },
    annotations: hints(false, false, false, false),
  }, tool((a) => request('illustrator', 'POST', '/v1/logo-grid', a)));

  server.registerTool('list_template_packs', {
    title: 'List template packs',
    description: 'Packs available from the template catalog (the URL set in PortableStudio settings unless given).',
    inputSchema: { catalogUrl: z.string().optional() },
    annotations: hints(true, false, true, true),
  }, tool((a) => packs.loadCatalog(a.catalogUrl || settings.load().catalogUrl)));

  server.registerTool('install_template_pack', {
    title: 'Install template pack',
    description: 'Downloads a pack\'s templates into the library.',
    inputSchema: { packId: z.string(), catalogUrl: z.string().optional(), overwrite: z.boolean().optional() },
    annotations: hints(false, true, true, true),
  }, tool((a) => packs.installPack(a.catalogUrl || settings.load().catalogUrl, a.packId, { overwrite: a.overwrite })));

  return server;
}

async function main() {
  settings.ensureApiToken();
  await createServer().connect(new StdioServerTransport());
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createServer, hints };

