/* Everything PortableStudio can do, used by both the panel UI and the local API.
   Host calls are queued so only one script runs in Illustrator/Photoshop at a time. */
const Studio = (() => {
  let core = null;
  let chain = Promise.resolve();

  function queued(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  function init() {
    core = {
      paths: Host.core('paths'),
      settings: Host.core('settings'),
      brands: Host.core('brands'),
      templates: Host.core('templates'),
      color: Host.core('color'),
      copy: Host.core('copy'),
      license: Host.core('license'),
      packs: Host.core('packs'),
      ico: Host.core('ico'),
    };
    core.config = core.templates.loadConfig();
    return core;
  }

  const fs = () => Host.node('fs');
  const path = () => Host.node('path');
  const app = () => Host.info.app;

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function brandOutputDir(brand, label) {
    const { paths, safeFileName, ensureDir } = core.paths;
    return ensureDir(path().join(paths.output(), safeFileName(brand.name), `${stamp()} - ${safeFileName(label)}`));
  }

  function industryName(id) {
    const i = core.config.industries.find((x) => x.id === id);
    return i && i.id !== 'general' ? i.name : '';
  }

  function forHost(brand) {
    return { ...brand, industryName: industryName(brand.industry) };
  }

  function requireBrandName(brand) {
    if (!brand.name) throw new Error('The brand needs a name.');
    return brand;
  }

  // ---- raster logos: trim empty margins ----
  // Logo PNGs often have a big transparent or white margin, which makes them look tiny once
  // fitted into a placeholder. Trimmed copies are cached in the app-data folder.
  const RASTER = /\.(png|jpe?g)$/i;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read image: ' + file));
      const norm = file.replace(/\\/g, '/');
      img.src = encodeURI('file://' + (norm.startsWith('/') ? '' : '/') + norm);
    });
  }

  // Content bounding box from a small preview: uses transparency when the image has it,
  // otherwise anything that differs from the corner (background) colour.
  function contentBox(img, preview = 600) {
    const s = Math.min(1, preview / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const corner = [d[0], d[1], d[2], d[3]];
    const useAlpha = corner[3] < 250;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const content = useAlpha
          ? d[o + 3] > 12
          : Math.abs(d[o] - corner[0]) + Math.abs(d[o + 1] - corner[1]) + Math.abs(d[o + 2] - corner[2]) > 36;
        if (!content) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    const pad = 1;
    const x0 = Math.max(0, (minX - pad) / s), y0 = Math.max(0, (minY - pad) / s);
    const x1 = Math.min(img.naturalWidth, (maxX + 1 + pad) / s), y1 = Math.min(img.naturalHeight, (maxY + 1 + pad) / s);
    return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
  }

  async function trimmedCopy(file, maxSide = 4000) {
    const nfs = fs();
    const stat = nfs.statSync(file);
    const key = Host.node('crypto').createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|${maxSide}`).digest('hex').slice(0, 20);
    const cacheDir = core.paths.ensureDir(path().join(core.paths.paths.appData(), 'cache'));
    const out = path().join(cacheDir, key + '.png');
    if (nfs.existsSync(out)) return out;
    const img = await loadImage(file);
    const box = contentBox(img);
    if (!box) return file;
    const trims = 1 - (box.w * box.h) / (img.naturalWidth * img.naturalHeight);
    const k = Math.min(1, maxSide / Math.max(box.w, box.h));
    if (trims < 0.02 && k === 1 && /\.png$/i.test(file)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(box.w * k));
    canvas.height = Math.max(1, Math.round(box.h * k));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    nfs.writeFileSync(out, Buffer.from(b64, 'base64'));
    return out;
  }

  // Solid-colour version of a transparent PNG: every visible pixel becomes `hex`, keeping its alpha.
  // Returns null when the image has no transparency (the colour would fill the whole rectangle).
  async function recolorPng(file, hex, maxSide = 2000) {
    const nfs = fs();
    const stat = nfs.statSync(file);
    const key = Host.node('crypto').createHash('sha1').update(`${file}|${stat.size}|${stat.mtimeMs}|${hex}|${maxSide}`).digest('hex').slice(0, 20);
    const out = path().join(core.paths.ensureDir(path().join(core.paths.paths.appData(), 'cache')), `${key}.png`);
    if (nfs.existsSync(out)) return out;
    const img = await loadImage(file);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = data.data;
    let transparent = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
    if (transparent < d.length / 4 * 0.02) return null;
    const rgb = core.color.hexToRgb(hex);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = rgb.r;
      d[i + 1] = rgb.g;
      d[i + 2] = rgb.b;
    }
    ctx.putImageData(data, 0, 0);
    nfs.writeFileSync(out, Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'));
    return out;
  }

  // Colour versions of raster logos, used for {{logo.x|white}} etc. and the logo kit.
  async function logoVariants(brand) {
    const variants = {};
    const colors = { white: '#FFFFFF', black: '#000000', ...brand.colors };
    for (const k of ['mark', 'full', 'type']) {
      const p = (brand.logos || {})[k];
      if (!p || !/\.png$/i.test(p) || !fs().existsSync(p)) continue;
      for (const name of ['white', 'black', 'primary', 'secondary', 'accent']) {
        if (!colors[name]) continue;
        try {
          const v = await recolorPng(p, colors[name]);
          if (!v) break; // no transparency: skip this logo entirely
          (variants[k] = variants[k] || {})[name] = v;
        } catch (e) {
          console.warn('Recolour failed', p, e);
          break;
        }
      }
    }
    return variants;
  }

  // Brand copy whose raster logos point at trimmed versions (vector files and photos are left alone).
  async function prepareAssets(brand) {
    const b = JSON.parse(JSON.stringify(brand));
    // Only logos: photos keep their own framing (and can be huge).
    for (const group of ['logos']) {
      for (const k of Object.keys(b[group] || {})) {
        const p = b[group][k];
        if (!p || !RASTER.test(p) || !fs().existsSync(p)) continue;
        try {
          b[group][k] = await trimmedCopy(p);
        } catch (e) {
          console.warn('Trim failed, using original', p, e);
        }
      }
    }
    b.logoVariants = await logoVariants(b);
    return b;
  }

  // Copies raster logos and photos into <dir>/Links and points the brand at those copies,
  // so generated .ai files link to images next to them (like Illustrator's Package)
  // instead of embedding them - much faster and lighter for big photos.
  function linkAssets(brand, dir) {
    const b = JSON.parse(JSON.stringify(brand));
    const linksDir = core.paths.ensureDir(path().join(dir, 'Links'));
    for (const group of ['logos', 'images']) {
      for (const k of Object.keys(b[group] || {})) {
        const src = b[group][k];
        if (!src || !RASTER.test(src) || !fs().existsSync(src)) continue;
        const prefix = group === 'logos' ? 'logo' : 'image';
        const dest = path().join(linksDir, `${prefix}-${k}${path().extname(src).toLowerCase()}`);
        fs().copyFileSync(src, dest);
        b[group][k] = dest;
      }
    }
    for (const k of Object.keys(b.logoVariants || {})) {
      for (const name of Object.keys(b.logoVariants[k])) {
        const dest = path().join(linksDir, `logo-${k}-${name}.png`);
        fs().copyFileSync(b.logoVariants[k][name], dest);
        b.logoVariants[k][name] = dest;
      }
    }
    return b;
  }

  // ---- templates ----
  function listTemplates({ industry, category, allApps = false } = {}) {
    return core.templates.list({ app: allApps ? undefined : app(), industry, category });
  }

  // ---- generate (one or many templates) ----
  // shouldCancel() is checked between templates: a template that has started always finishes.
  async function generate({ brand, templateIds, exportPages = false, pageWidth = 0, onProgress, shouldCancel }) {
    core.license.requireLicense();
    const b = requireBrandName(core.brands.normalize(brand));
    if (!templateIds || !templateIds.length) throw new Error('Choose at least one template.');
    const hostBrand = forHost(await prepareAssets(b));
    const results = [];
    for (const id of templateIds) {
      const t = core.templates.get(id);
      if (shouldCancel && shouldCancel()) {
        results.push({ templateId: id, templateName: t.name, skipped: true, cancelled: true, reason: 'Cancelled.' });
        continue;
      }
      if (t.app !== app()) {
        results.push({ templateId: id, templateName: t.name, skipped: true, reason: `Needs ${t.app}; open it there.` });
        continue;
      }
      if (onProgress) onProgress(t, results.length, templateIds.length);
      const dir = brandOutputDir(b, t.name);
      const base = core.paths.safeFileName(`${b.name} - ${t.name}`);
      const work = path().join(dir, base + path().extname(t.filePath));
      fs().copyFileSync(t.filePath, work);
      const arg = { workFile: work, brand: linkAssets(hostBrand, dir), templateId: t.id, templateName: t.name };
      if (app() === 'illustrator') arg.pdfFile = path().join(dir, base + '.pdf');
      else arg.pngFile = path().join(dir, base + '.png');
      if (exportPages || t.category === 'social-carousel') {
        arg.pagesDir = path().join(dir, 'Pages');
        arg.pagesBase = core.paths.slugify(`${b.name}-${t.name}`) || 'page';
        arg.pageWidth = pageWidth;
      }
      const res = await queued(() => Host.call('applyTemplate', arg));
      results.push({ templateId: id, templateName: t.name, outputDir: dir, outputs: res.outputs, report: res.report });
    }
    return { brand: b.name, results };
  }

  // ---- logo export kit (Illustrator) ----
  async function logoKit({ brand }) {
    core.license.requireLicense();
    if (app() !== 'illustrator') throw new Error('The logo export kit runs in Illustrator.');
    const b = requireBrandName(core.brands.normalize(brand));
    const dir = brandOutputDir(b, 'Logo Kit');
    const prepared = await prepareAssets(b);
    const res = await queued(() => Host.call('exportLogoKit', { dir, baseName: core.paths.slugify(b.name) || 'logo', brand: prepared }));
    const icoSources = res.favicons.filter((f) => /favicon-(16|32|48)\.png$/.test(f));
    if (icoSources.length) {
      const ico = core.ico.writeIco(icoSources, path().join(dir, 'Favicons', 'favicon.ico'));
      res.files.push(ico);
    }
    return { outputDir: dir, ...res };
  }

  // ---- colour ----
  function loadImagePixels(file, maxSide = 200) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || maxSide, img.naturalHeight || maxSide));
        const w = Math.max(1, Math.round((img.naturalWidth || maxSide) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || maxSide) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx.getImageData(0, 0, w, h).data);
      };
      img.onerror = () => reject(new Error('Could not read that image. Use SVG, PNG or JPG for colour extraction.'));
      const norm = file.replace(/\\/g, '/');
      img.src = encodeURI('file://' + (norm.startsWith('/') ? '' : '/') + norm);
    });
  }

  async function extractPalette({ imagePath, count = 5 }) {
    if (!imagePath || !fs().existsSync(imagePath)) throw new Error('Image not found.');
    const pixels = await loadImagePixels(imagePath);
    const palette = core.color.extractPalette(pixels, { count });
    if (!palette.length) throw new Error('No colours found (is the image only black, white or transparent?).');
    const suggested = core.color.suggestRoles(palette);
    return { palette, suggested, report: core.color.paletteReport(suggested) };
  }

  const paletteReport = (colors) => core.color.paletteReport(colors);

  function industryPalettes(industryId) {
    const ind = core.config.industries.find((i) => i.id === industryId) || core.config.industries[0];
    return (ind.palettes || []).map(([primary, secondary, accent]) => ({ primary, secondary, accent }));
  }

  // ---- copy ----
  async function writeCopy({ brand, brief = '', slides = 5, source = 'ai' }) {
    const b = requireBrandName(core.brands.normalize(brand));
    if (source === 'industry') return core.copy.industryCopy(b);
    return core.copy.generateCopy(b, { brief, slides });
  }

  // ---- template registration ----
  async function registerActiveDocument(fields) {
    if (!fields.name) throw new Error('Give the template a name.');
    await queued(() => Host.call('saveActive'));
    const scan = await queued(() => Host.call('scanActiveDocument'));
    const slot = core.templates.createSlot(fields.name, scan.ext);
    try {
      await queued(() => Host.call('exportThumbnail', { file: slot.thumb, width: 600 }));
      fs().copyFileSync(scan.file, slot.file);
      return core.templates.writeMeta(slot, fields, scan);
    } catch (e) {
      core.templates.removeSlot(slot);
      throw e;
    }
  }

  async function createSample() {
    const isAi = app() === 'illustrator';
    const fields = isAi
      ? { name: 'Sample Brand Guidelines', category: 'brand-guidelines', industries: ['general'], description: '3-page tagged example.' }
      : { name: 'Sample Social Post', category: 'social-post', industries: ['general'], description: '1080x1350 tagged example.' };
    const slot = core.templates.createSlot(fields.name, isAi ? '.ai' : '.psd');
    try {
      const scan = await queued(() => Host.call('createSampleTemplate', { file: slot.file, thumb: slot.thumb }));
      return core.templates.writeMeta(slot, fields, scan);
    } catch (e) {
      core.templates.removeSlot(slot);
      throw e;
    }
  }

  // Re-applies the brand to the open generated document (Illustrator).
  async function updateOpenDocument({ brand, force = false, exportPdf = true }) {
    core.license.requireLicense();
    if (app() !== 'illustrator') throw new Error('Updating an open document works in Illustrator.');
    const b = requireBrandName(core.brands.normalize(brand));
    const info = await activeDocumentInfo();
    let hostBrand = forHost(await prepareAssets(b));
    if (info.file) hostBrand = linkAssets(hostBrand, path().dirname(info.file));
    return queued(() => Host.call('updateDocument', { brand: hostBrand, force, exportPdf }));
  }

  const activeDocumentInfo = () => (app() === 'illustrator'
    ? queued(() => Host.call('activeDocumentInfo'))
    : Promise.resolve({ open: false }));

  // Message box in the host app; with askOpen resolves true when the user wants the folder.
  const notify = (message, askOpen = false) => queued(() => Host.call('notify', { title: 'PortableStudio', message, askOpen }));

  // Starter templates drawn by scripts in builders/ (Illustrator). Rebuilding replaces the old copy.
  const STARTERS = [
    { builder: 'brand-guidelines', id: 'essential-brand-guidelines', name: 'Essential Brand Guidelines', category: 'brand-guidelines',
      description: 'Brand guidelines: overview, logo, construction, colour, typography, graphics, stationery, photography and applications.' },
    { builder: 'logo-presentation', id: 'logo-presentation', name: 'Logo Presentation', category: 'logo-presentation',
      description: '12-page logo presentation: idea, symbol, construction, colour versions, palette and the logo in use.' },
    { builder: 'social-carousel', id: 'instagram-carousel', name: 'Instagram Carousel', category: 'social-carousel',
      description: '5-slide 1080x1350 carousel filled from the brand copy slides. Exports one PNG per slide.' },
  ];

  async function buildStarter(id) {
    if (app() !== 'illustrator') throw new Error('Starter templates are built in Illustrator.');
    const s = STARTERS.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown starter template: ${id}`);
    fs().rmSync(path().join(core.paths.paths.templates(), s.id), { recursive: true, force: true });
    const slot = core.templates.createSlot(s.id, '.ai');
    const fwd = (x) => x.split('\\').join('/');
    const build = JSON.stringify({ file: fwd(slot.file), thumb: fwd(slot.thumb), root: Host.info.root });
    const script = `$.global.PS_BUILD = ${build}; $.evalFile(File(${JSON.stringify(`${Host.info.root}/builders/${s.builder}.jsx`)}));`;
    try {
      const out = await queued(() => new Promise((resolve) => window.__adobe_cep__.evalScript(script, resolve)));
      if (!/^built/.test(out)) throw new Error(`Template build failed: ${out}`);
      const scan = await queued(() => Host.call('scanActiveDocument'));
      await queued(() => new Promise((resolve) => window.__adobe_cep__.evalScript('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES)', resolve)));
      const meta = core.templates.writeMeta(slot, { name: s.name, category: s.category, industries: ['general'], description: s.description, author: 'PortableStudio' }, scan);
      return meta;
    } catch (e) {
      core.templates.removeSlot(slot);
      throw e;
    }
  }

  // Demo brand shipped in assets/sample (original artwork, free to use for testing).
  function sampleBrand(current = {}) {
    const dir = path().join(Host.info.root, 'assets', 'sample');
    const raw = JSON.parse(fs().readFileSync(path().join(dir, 'brand.json'), 'utf8'));
    for (const k of Object.keys(raw.logos)) raw.logos[k] = path().join(dir, raw.logos[k]);
    raw.designerName = current.designerName || '';
    raw.designerEmail = current.designerEmail || '';
    const b = core.brands.normalize(raw);
    b.copy = core.copy.industryCopy(b);
    return b;
  }

  // Construction grid on the current selection (Illustrator).
  async function logoGrid(opts = {}) {
    if (app() !== 'illustrator') throw new Error('Logo grids are drawn in Illustrator.');
    const o = { outlines: true, anchors: true, handles: true, circles: true, gridlines: false, clearspace: false, ...opts };
    return queued(() => Host.call('logoGrid', o));
  }

  const scanActiveDocument = () => queued(() => Host.call('scanActiveDocument'));
  const openTemplate = (id) => queued(() => Host.call('openFile', { file: core.templates.get(id).filePath }));
  const listFonts = () => queued(() => Host.call('listFonts'));

  function status() {
    const pkg = Host.node(`${Host.info.root}/package.json`);
    return {
      app: app(),
      version: pkg.version,
      license: core.license.status(),
      settings: core.settings.publicView(),
    };
  }

  return {
    init, get core() { return core; }, listTemplates, generate, logoKit, extractPalette, paletteReport,
    industryPalettes, writeCopy, registerActiveDocument, createSample, scanActiveDocument, openTemplate,
    listFonts, status, updateOpenDocument, activeDocumentInfo, notify, prepareAssets, sampleBrand, STARTERS, buildStarter, logoGrid,
  };
})();
