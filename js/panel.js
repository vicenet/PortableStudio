/* Panel UI. All real work goes through Studio (js/studio.js), which the local API also uses. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DRAFT_KEY = 'portablestudio.draft';
  let C = null; // Studio.core, set on start

  const state = {
    brand: null,
    templates: [],
    selected: new Set(),
    fonts: null,
    busy: false,
    paletteIndex: 0,
  };

  // ---------- helpers ----------
  function log(target, html, kind = '') {
    const div = document.createElement('div');
    div.className = 'entry ' + kind;
    div.innerHTML = html;
    $(target).prepend(div);
    return div;
  }

  async function busy(button, fn, logTarget = '#log') {
    if (state.busy) return;
    state.busy = true;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Working…';
    try {
      await fn();
    } catch (e) {
      log(logTarget, esc(e.message), 'error');
      console.error(e);
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = label;
      updateGenerateButton();
    }
  }

  const categoryName = (id) => (C.config.categories.find((c) => c.id === id) || { name: id || 'Other' }).name;
  const industryName = (id) => (C.config.industries.find((i) => i.id === id) || { name: id }).name;
  const fileUrl = (p) => {
    if (!p || !Host.node('fs').existsSync(p)) return '';
    const norm = p.replace(/\\/g, '/');
    return encodeURI('file://' + (norm.startsWith('/') ? '' : '/') + norm) + '?v=' + Host.node('fs').statSync(p).mtimeMs;
  };
  const basename = (p) => Host.node('path').basename(p);
  const folderLink = (dir) => `<button type="button" class="link" data-reveal="${esc(dir)}">Open folder</button>`;

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-reveal]');
    if (t) Host.revealFolder(t.dataset.reveal);
  });

  // ---------- brand state ----------
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state.brand)); } catch { /* storage unavailable */ }
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d) return C.brands.normalize(d);
    } catch { /* ignore */ }
    return C.brands.defaultBrand();
  }

  function setBrand(brand) {
    state.brand = C.brands.normalize(brand);
    saveDraft();
    renderBrand();
  }

  function changed() {
    saveDraft();
    updateGenerateButton();
  }

  function renderBrandSelect() {
    const list = C.brands.list();
    $('#brandSelect').innerHTML = '<option value="">+ New brand</option>' +
      list.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    $('#brandSelect').value = state.brand.id && list.some((b) => b.id === state.brand.id) ? state.brand.id : '';
    $('#brandDelete').disabled = !$('#brandSelect').value;
  }

  function renderBrand() {
    const b = state.brand;
    for (const el of $$('[data-field]')) el.value = b[el.dataset.field] || '';
    for (const role of C.brands.COLOR_ROLES) {
      $(`[data-color="${role}"]`).value = b.colors[role];
      $(`[data-hex="${role}"]`).value = b.colors[role];
    }
    for (const el of $$('[data-font]')) el.value = b.fonts[el.dataset.font].name || '';
    for (const row of $$('[data-logo], [data-image]')) renderLogo(row);
    for (const el of $$('[data-copy]')) el.value = b.copy[el.dataset.copy] || '';
    $('[data-copy-list="values"]').value = b.copy.values.join('\n');
    $('[data-copy-slides]').value = b.copy.slides.map((s) => `${s.title} | ${s.body}`).join('\n');
    $('#t-industry').value = b.industry || 'general';
    renderBrandSelect();
    renderContrast();
    renderTemplates();
    renderColorReport();
  }

  // A file row is either a logo slot (data-logo) or a photo slot (data-image).
  const slotOf = (row) => (row.dataset.logo ? ['logos', row.dataset.logo] : ['images', row.dataset.image]);

  function renderLogo(row) {
    const [group, key] = slotOf(row);
    const p = (state.brand[group] || {})[key];
    $('.fname', row).textContent = p ? basename(p) : 'None';
    $('.fname', row).title = p || '';
    $('.clear', row).hidden = !p;
  }

  function bindBrandForm() {
    $('#industrySelect').innerHTML = C.config.industries
      .map((i) => `<option value="${esc(i.id)}">${esc(i.id === 'general' ? 'Not specified' : i.name)}</option>`).join('');

    for (const el of $$('[data-field]')) {
      el.addEventListener('input', () => {
        state.brand[el.dataset.field] = el.value;
        if (el.dataset.field === 'industry') {
          $('#t-industry').value = el.value;
          state.paletteIndex = 0;
          renderTemplates();
        }
        changed();
      });
    }

    for (const role of C.brands.COLOR_ROLES) {
      const picker = $(`[data-color="${role}"]`);
      const hex = $(`[data-hex="${role}"]`);
      picker.addEventListener('input', () => setColor(role, picker.value));
      hex.addEventListener('change', () => {
        if (!setColor(role, hex.value)) hex.value = state.brand.colors[role];
      });
    }

    for (const input of $$('[data-font]')) bindFontPicker(input);
    $('#fontsCard').addEventListener('toggle', (e) => { if (e.target.open) loadFonts(); });

    for (const row of $$('[data-logo], [data-image]')) {
      const [group, key] = slotOf(row);
      $('.pick', row).addEventListener('click', () => {
        const types = group === 'logos' ? ['svg', 'png', 'jpg', 'jpeg', 'pdf', 'ai', 'eps', 'psd'] : ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'psd'];
        const file = Host.chooseFile('Choose ' + $('.label', row).textContent, types);
        if (!file) return;
        state.brand[group] = state.brand[group] || {};
        state.brand[group][key] = file;
        renderLogo(row);
        changed();
      });
      $('.clear', row).addEventListener('click', () => {
        state.brand[group][key] = '';
        renderLogo(row);
        changed();
      });
    }

    for (const el of $$('[data-copy]')) {
      el.addEventListener('input', () => { state.brand.copy[el.dataset.copy] = el.value; changed(); });
    }
    $('[data-copy-list="values"]').addEventListener('input', (e) => {
      state.brand.copy.values = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
      changed();
    });
    $('[data-copy-slides]').addEventListener('input', (e) => {
      state.brand.copy.slides = e.target.value.split('\n').map((line) => {
        const [title, ...rest] = line.split('|');
        return { title: (title || '').trim(), body: rest.join('|').trim() };
      }).filter((s) => s.title || s.body);
      changed();
    });

    // brand profiles
    $('#brandSelect').addEventListener('change', (e) => {
      const id = e.target.value;
      setBrand(id ? C.brands.get(id) : { ...C.brands.defaultBrand(), designerName: state.brand.designerName, designerEmail: state.brand.designerEmail });
    });
    $('#brandSave').addEventListener('click', () => {
      try {
        const saved = C.brands.save(state.brand);
        setBrand(saved);
        log('#log', `Saved brand <b>${esc(saved.name)}</b>.`, 'ok');
      } catch (e) {
        log('#log', esc(e.message), 'error');
      }
    });
    $('#brandDelete').addEventListener('click', () => {
      const id = $('#brandSelect').value;
      if (!id || !confirm(`Delete the saved brand "${state.brand.name}"? Generated files are kept.`)) return;
      C.brands.remove(id);
      setBrand({ ...state.brand, id: '' });
      log('#log', 'Brand deleted.', 'ok');
    });

    // colour helpers
    $('#extractColors').addEventListener('click', (e) => busy(e.currentTarget, extractColors));
    $('#industryPalette').addEventListener('click', () => {
      const palettes = Studio.industryPalettes(state.brand.industry);
      if (!palettes.length) return;
      const p = palettes[state.paletteIndex % palettes.length];
      state.paletteIndex++;
      for (const role of Object.keys(p)) setColor(role, p[role]);
    });

    // copy
    $('#copyAi').addEventListener('click', (e) => busy(e.currentTarget, () => writeCopy('ai')));
    $('#copyIndustry').addEventListener('click', (e) => busy(e.currentTarget, () => writeCopy('industry')));
  }

  function setColor(role, value) {
    const hex = C.brands.normalizeHex(value);
    if (!hex) return false;
    state.brand.colors[role] = hex;
    $(`[data-color="${role}"]`).value = hex;
    $(`[data-hex="${role}"]`).value = hex;
    renderContrast();
    changed();
    return true;
  }

  function renderContrast() {
    const report = Studio.paletteReport(state.brand.colors);
    const weak = report.pairs.filter((p) => p.rating === 'Fail');
    const r = report.roles.primary;
    $('#contrastSummary').innerHTML =
      `White text on primary: <b>${r.contrast.white.ratio}:1</b> (${r.contrast.white.rating})` +
      (weak.length ? ` · ⚠ low contrast: ${weak.map((p) => `${p.a}/${p.b} ${p.ratio}:1`).join(', ')}` : '');
  }

  async function extractColors() {
    const logo = state.brand.logos.mark || state.brand.logos.full || state.brand.logos.type ||
      Host.chooseFile('Choose a logo to read colours from', ['svg', 'png', 'jpg', 'jpeg']);
    if (!logo) return;
    const res = await Studio.extractPalette({ imagePath: logo, count: 5 });
    for (const role of Object.keys(res.suggested)) setColor(role, res.suggested[role]);
    log('#log', 'Colours from logo: ' + res.palette.map((p) =>
      `<span class="chip" style="background:${esc(p.hex)}"></span>${esc(p.hex)} (${p.share}%)`).join(' '), 'ok');
  }

  async function writeCopy(source) {
    const copy = await Studio.writeCopy({ brand: state.brand, brief: $('#copyBrief').value.trim(), slides: 5, source });
    state.brand.copy = { ...state.brand.copy, ...copy };
    renderBrand();
    $('#copyCard').open = true;
    changed();
    log('#log', source === 'ai' ? 'Claude wrote new brand copy. Edit anything you like, then Save the brand.' : 'Filled in industry starter copy.', 'ok');
  }

  async function loadFonts() {
    if (state.fonts) return;
    $('#fontStatus').textContent = 'Loading installed fonts…';
    try {
      const fonts = await Studio.listFonts();
      const seen = new Set();
      state.fonts = fonts.filter((f) => !seen.has(f.name) && seen.add(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      $('#fontStatus').textContent = `${state.fonts.length} fonts installed. Type to search, e.g. "mont bold".`;
    } catch (e) {
      $('#fontStatus').textContent = 'Could not load fonts: ' + e.message;
    }
  }

  // Searchable font dropdown (Adobe's embedded Chromium doesn't render <datalist> popups).
  function bindFontPicker(input) {
    const role = input.dataset.font;
    const list = input.nextElementSibling;
    let items = [];
    let active = -1;

    const matchesQuery = (font, words) => words.every((w) => font.name.toLowerCase().includes(w) || font.ps.toLowerCase().includes(w));

    function render() {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      items = (state.fonts || []).filter((f) => matchesQuery(f, words)).slice(0, 60);
      active = items.length ? 0 : -1;
      list.innerHTML = items.length
        ? items.map((f, i) => `<div class="combo-item${i === active ? ' active' : ''}" data-i="${i}">
            <span class="font-name">${esc(f.name)}</span>
            <span class="font-preview" style="font-family:'${esc(f.family || f.name)}'">Aa</span></div>`).join('')
        : `<div class="combo-empty">${state.fonts ? 'No matching fonts' : 'Loading fonts…'}</div>`;
      list.hidden = false;
    }

    function highlight() {
      $$('.combo-item', list).forEach((el, i) => el.classList.toggle('active', i === active));
      const el = $(`.combo-item[data-i="${active}"]`, list);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function choose(font) {
      state.brand.fonts[role] = font ? { ps: font.ps, name: font.name } : { ps: '', name: '' };
      input.value = font ? font.name : '';
      input.classList.remove('invalid');
      list.hidden = true;
      changed();
    }

    input.addEventListener('focus', async () => {
      await loadFonts();
      input.select();
      render();
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (list.hidden && e.key === 'ArrowDown') render();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        highlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0) choose(items[active]);
      } else if (e.key === 'Escape') {
        list.hidden = true;
        input.blur();
      }
    });
    // mousedown (not click) so it fires before the input's blur hides the list
    list.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.combo-item');
      if (!el) return;
      e.preventDefault();
      choose(items[Number(el.dataset.i)]);
    });
    input.addEventListener('blur', () => {
      list.hidden = true;
      const chosen = state.brand.fonts[role];
      if (!input.value.trim()) {
        if (chosen.ps) choose(null);
      } else if (input.value !== chosen.name) {
        // Typed text that wasn't picked from the list: keep the previous choice.
        input.value = chosen.name || '';
        input.classList.toggle('invalid', !chosen.name);
      }
    });
  }

  // ---------- templates & generate ----------
  function bindTemplatePicker() {
    $('#t-industry').innerHTML = C.config.industries.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
    $('#t-category').innerHTML = '<option value="">All types</option>' +
      C.config.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('#t-industry').addEventListener('change', renderTemplates);
    $('#t-category').addEventListener('change', renderTemplates);
    $('#selectAll').addEventListener('click', () => {
      for (const t of shownTemplates()) state.selected.add(t.id);
      renderTemplates();
    });
    $('#generate').addEventListener('click', (e) => busy(e.currentTarget, generate));
    $('#updateCard').hidden = Host.info.app !== 'illustrator';
    $('#updateDoc').addEventListener('click', (e) => busy(e.currentTarget, updateOpenDocument));
  }

  async function updateOpenDocument() {
    const info = await Studio.activeDocumentInfo();
    if (!info.open) throw new Error('Open a generated document in Illustrator first.');
    if (!info.generated) throw new Error(`"${info.name}" wasn't generated by PortableStudio, so it can't be updated.`);
    const res = await Studio.updateOpenDocument({ brand: state.brand, force: $('#updateForce').checked, exportPdf: true });
    const rep = res.report;
    const lines = [
      `Updated <b>${esc(info.name)}</b>.`,
      `Text: ${rep.textReplaced} · Colours: ${rep.colors.length} · Fonts: ${rep.fonts.length} · Logos/images: ${rep.assets.length}`,
    ].concat(rep.warnings.map((w) => `⚠ ${esc(w)}`));
    const dir = Host.node('path').dirname(res.outputs.source);
    log('#log', lines.join('<br>') + '<br>' + folderLink(dir), rep.warnings.length ? 'warn' : 'ok');
    const open = await Studio.notify(`"${info.name}" was updated and its PDF re-exported.` +
      (rep.warnings.length ? `\n${rep.warnings.length} note(s) - see the panel.` : ''), true);
    if (open) Host.revealFolder(dir);
  }

  function refreshTemplates() {
    state.templates = Studio.listTemplates();
    for (const id of [...state.selected]) if (!state.templates.some((t) => t.id === id)) state.selected.delete(id);
    renderTemplates();
    renderLibrary();
  }

  function shownTemplates() {
    const industry = $('#t-industry').value;
    const category = $('#t-category').value;
    return state.templates.filter((t) => C.templates.matches(t, industry, category));
  }

  function renderTemplates() {
    if (!C) return;
    const shown = shownTemplates();
    const grid = $('#templateGrid');
    if (!state.templates.length) {
      grid.innerHTML = '<p class="hint">No templates yet. Go to <b>Templates</b> to add your design, create a sample or install a pack.</p>';
    } else if (!shown.length) {
      grid.innerHTML = '<p class="hint">No templates match these filters.</p>';
    } else {
      grid.innerHTML = shown.map((t) => `
        <button type="button" class="tpl ${state.selected.has(t.id) ? 'selected' : ''}" data-id="${esc(t.id)}" title="${esc(t.description || t.name)}">
          <span class="thumb">${t.thumbPath ? `<img src="${esc(fileUrl(t.thumbPath))}" alt="">` : ''}</span>
          <span class="name">${esc(t.name)}</span>
          <span class="meta">${esc(categoryName(t.category))} · ${t.pages} ${t.pages === 1 ? 'page' : 'pages'}</span>
        </button>`).join('');
    }
    for (const el of $$('.tpl', grid)) {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (state.selected.has(id)) state.selected.delete(id);
        else state.selected.add(id);
        el.classList.toggle('selected');
        updateGenerateButton();
      });
    }
    updateGenerateButton();
  }

  function updateGenerateButton() {
    const n = state.selected.size;
    $('#generate').textContent = n > 1 ? `Generate ${n} templates` : 'Generate';
    $('#generate').disabled = state.busy || !n || !state.brand || !state.brand.name.trim();
  }

  async function generate() {
    const ids = state.templates.filter((t) => state.selected.has(t.id)).map((t) => t.id);
    const progress = log('#log', 'Starting…', 'progress');
    let cancelled = false;
    const cancel = $('#cancelGenerate');
    cancel.hidden = ids.length < 2;
    cancel.disabled = false;
    cancel.textContent = 'Cancel after this template';
    cancel.onclick = () => { cancelled = true; cancel.disabled = true; cancel.textContent = 'Cancelling…'; };
    let res;
    try {
      res = await Studio.generate({
        brand: state.brand,
        templateIds: ids,
        exportPages: $('#exportPages').checked,
        shouldCancel: () => cancelled,
        onProgress: (t, i, n) => {
          const pct = Math.round((i / n) * 100);
          progress.innerHTML = `<div class="progress-row">
            <span class="thumb small">${t.thumbPath ? `<img src="${esc(fileUrl(t.thumbPath))}" alt="">` : ''}</span>
            <span>Generating <b>${esc(t.name)}</b><br><span class="hint">${i + 1} of ${n} · ${esc(state.brand.name)}</span></span>
          </div><div class="bar"><span style="width:${Math.max(4, pct)}%"></span></div>`;
        },
      });
    } finally {
      progress.remove();
      cancel.hidden = true;
      cancel.onclick = null;
    }
    reportGenerate(res);
    const stopped = res.results.filter((r) => r.cancelled).length;
    if (stopped) log('#log', `Cancelled: ${stopped} template(s) not generated.`, 'warn');
    const done = res.results.filter((r) => !r.skipped);
    if (done.length) {
      const warnings = done.reduce((n, r) => n + r.report.warnings.length, 0);
      const msg = `${done.length === 1 ? `"${done[0].templateName}" is` : `${done.length} templates are`} ready for ${res.brand}.` +
        (warnings ? `\n${warnings} warning(s) - see the panel for details.` : '') +
        '\n\nThe editable file is open in Illustrator. After editing the brand in the panel, use "Update open document" to apply changes.';
      const open = await Studio.notify(Host.info.app === 'illustrator' ? msg : msg.replace(/\n\nThe editable[\s\S]*$/, ''), true);
      if (open) Host.revealFolder(Host.node('path').dirname(done[0].outputDir));
    }
  }

  function reportGenerate(res) {
    for (const r of res.results) {
      if (r.cancelled) continue;
      if (r.skipped) {
        log('#log', `Skipped <b>${esc(r.templateName)}</b>: ${esc(r.reason)}`, 'warn');
        continue;
      }
      const rep = r.report;
      const lines = [
        `<b>${esc(r.templateName)}</b> done.`,
        `Text: ${rep.textReplaced} · Colours: ${rep.colors.length} · Fonts: ${rep.fonts.length} · Logos/images: ${rep.assets.length}` +
          (r.outputs.pages ? ` · Pages: ${r.outputs.pages.length}` : ''),
      ];
      if (rep.fitted && rep.fitted.length) lines.push(`Shrunk to fit: ${rep.fitted.length} text box(es)`);
      if (rep.unfilledTags.length) lines.push(`Not filled: ${rep.unfilledTags.map((t) => `<code>{{${esc(t)}}}</code>`).join(' ')}`);
      for (const w of rep.warnings) lines.push(`⚠ ${esc(w)}`);
      log('#log', lines.join('<br>') + '<br>' + folderLink(r.outputDir), rep.warnings.length ? 'warn' : 'ok');
    }
  }

  // ---------- kit tab ----------
  function bindKit() {
    const isAi = Host.info.app === 'illustrator';
    $('#logoKit').disabled = !isAi;
    $('#logoKitNote').textContent = isAi ? 'Uses the logos and colours on the Create tab.' : 'Open PortableStudio in Illustrator to export the logo kit.';
    $('#logoKit').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const res = await Studio.logoKit({ brand: state.brand });
      const lines = [`Logo kit ready: <b>${res.files.length}</b> files.`].concat(res.warnings.map((w) => `⚠ ${esc(w)}`));
      log('#kitLog', lines.join('<br>') + '<br>' + folderLink(res.outputDir), res.warnings.length ? 'warn' : 'ok');
      const open = await Studio.notify(`Logo kit ready: ${res.files.length} files (logos, favicons and social images).` +
        (res.warnings.length ? `\n\n${res.warnings.join('\n')}` : ''), true);
      if (open) Host.revealFolder(res.outputDir);
    }, '#kitLog'));
    $('#refreshReport').addEventListener('click', renderColorReport);

    $('#gridCard').hidden = !isAi;
    $('#drawGrid').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const opts = { color: $('#gridColor').value };
      for (const el of $$('[data-grid]')) opts[el.dataset.grid] = el.checked;
      const c = await Host.call('logoGrid', opts);
      log('#kitLog', `Grid drawn on ${c.paths} path(s): ${c.anchors} anchors, ${c.handles} handles, ${c.circles} circles, ${c.gridlines} gridlines.`, 'ok');
    }, '#kitLog'));
    $('#removeGrid').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const removed = await Host.call('removeLogoGrids');
      log('#kitLog', removed ? 'Logo grids removed.' : 'No logo grids in this document.', 'ok');
    }, '#kitLog'));
  }

  function renderColorReport() {
    if (!C) return;
    const report = Studio.paletteReport(state.brand.colors);
    const sw = (hex, label) => `<span class="sw" style="background:${esc(hex)}" title="${esc(hex)}">${label ? esc(label) : ''}</span>`;
    const roles = Object.keys(report.roles).map((role) => {
      const r = report.roles[role];
      return `
        <div class="report-role">
          <div class="report-head">${sw(r.hex)}<b>${esc(role)}</b> ${esc(r.hex)}</div>
          <div class="hint">RGB ${r.rgb.r}, ${r.rgb.g}, ${r.rgb.b} · CMYK ${r.cmyk.c}, ${r.cmyk.m}, ${r.cmyk.y}, ${r.cmyk.k}</div>
          <div class="ramp">${r.tints.slice().reverse().map((t) => sw(t.hex)).join('')}${sw(r.hex)}${r.shades.map((t) => sw(t.hex)).join('')}</div>
          <div class="hint">On white ${r.contrast.white.ratio}:1 (${r.contrast.white.rating}) · On black ${r.contrast.black.ratio}:1 (${r.contrast.black.rating})</div>
        </div>`;
    }).join('');
    const pairs = report.pairs.map((p) => `<div>${esc(p.a)} / ${esc(p.b)}: <b>${p.ratio}:1</b> <span class="rating ${p.rating === 'Fail' ? 'bad' : ''}">${esc(p.rating)}</span></div>`).join('');
    $('#colorReport').innerHTML = roles + `<div class="report-pairs"><b>Brand colour pairs</b>${pairs}</div>`;
  }

  // ---------- templates tab ----------
  function bindTemplatesTab() {
    const form = $('#registerForm');
    form.category.innerHTML = C.config.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('#industryChecks').innerHTML = C.config.industries.map((i) =>
      `<label class="check"><input type="checkbox" value="${esc(i.id)}"${i.id === 'general' ? ' checked' : ''}> ${esc(i.name)}</label>`).join('');

    $('#scan').addEventListener('click', (e) => busy(e.currentTarget, scan, '#templatesLog'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button[type=submit]', form), register, '#templatesLog');
    });
    $('#sample').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const meta = await Studio.createSample();
      log('#templatesLog', `Created <b>${esc(meta.name)}</b>. It is open so you can see how it is tagged.`, 'ok');
      refreshTemplates();
    }, '#templatesLog'));
    $('#openLibrary').addEventListener('click', () => Host.revealFolder(C.paths.ensureDir(C.paths.paths.templates())));

    const isAi = Host.info.app === 'illustrator';
    $('#starterList').innerHTML = Studio.STARTERS.map((s) => `
      <div class="lib-row">
        <span class="info"><b>${esc(s.name)}</b><br><span class="hint">${esc(s.description)}</span></span>
        <button type="button" data-starter="${esc(s.id)}"${isAi ? '' : ' disabled title="Open PortableStudio in Illustrator to build"'}>Build</button>
      </div>`).join('');
    for (const btn of $$('[data-starter]')) {
      btn.addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const meta = await Studio.buildStarter(btn.dataset.starter);
        log('#templatesLog', `Built <b>${esc(meta.name)}</b> (${meta.pages} pages).`, 'ok');
        refreshTemplates();
      }, '#templatesLog'));
    }
    $('#loadPacks').addEventListener('click', (e) => busy(e.currentTarget, loadPacks, '#templatesLog'));
    $('#installPackFile').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const file = Host.chooseFile('Choose a PortableStudio pack', ['zip']);
      if (!file) return;
      const res = C.packs.installPackFile(file);
      const n = res.results.filter((r) => r.installed).length;
      log('#templatesLog', `Installed <b>${esc(res.name)}</b>: ${n} template(s).`, 'ok');
      refreshTemplates();
    }, '#templatesLog'));
    $('#exportPack').addEventListener('click', (e) => busy(e.currentTarget, exportPack, '#templatesLog'));
  }

  const chips = (list, prefix = '') => (list.length
    ? list.map((t) => `<code>{{${esc(prefix + t)}}}</code>`).join(' ')
    : '<span class="hint">none</span>');

  async function scan() {
    const s = await Studio.scanActiveDocument();
    const form = $('#registerForm');
    $('#scanResult').innerHTML = `
      <div class="scan">
        <div><b>${esc(s.file ? basename(s.file) : 'Unsaved document')}</b> · ${s.pages} ${s.pages === 1 ? 'page' : 'pages'} · ${s.width}×${s.height}</div>
        <div>Text tags: ${chips(s.tags)}</div>
        <div>Logo/image placeholders: ${chips(s.placeholders)}</div>
        <div>Colours: ${chips(s.colorRoles, 'color.')}</div>
        <div>Font roles: ${s.fontStyles.length ? esc(s.fontStyles.join(', ')) : '<span class="hint">none</span>'}</div>
        ${s.warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}
      </div>`;
    form.hidden = !s.file;
    if (s.file && !form.name.value) form.name.value = basename(s.file).replace(/\.[^.]+$/, '');
  }

  async function register() {
    const form = $('#registerForm');
    const meta = await Studio.registerActiveDocument({
      name: form.name.value.trim(),
      category: form.category.value,
      description: form.description.value.trim(),
      industries: $$('#industryChecks input:checked').map((i) => i.value),
      author: state.brand.designerName || '',
    });
    log('#templatesLog', `Added <b>${esc(meta.name)}</b> to the library.`, 'ok');
    form.reset();
    form.hidden = true;
    $('#scanResult').innerHTML = '';
    refreshTemplates();
  }

  function renderLibrary() {
    const all = Studio.listTemplates({ allApps: true });
    const list = $('#libraryList');
    list.innerHTML = all.length ? all.map((t) => `
      <div class="lib-row" data-id="${esc(t.id)}">
        <span class="thumb small">${t.thumbPath ? `<img src="${esc(fileUrl(t.thumbPath))}" alt="">` : ''}</span>
        <span class="info"><b>${esc(t.name)}</b><br><span class="hint">${esc(t.app)} · ${esc(categoryName(t.category))} · ${esc(t.industries.map(industryName).join(', '))}</span></span>
        ${t.app === Host.info.app ? '<button type="button" class="edit">Edit</button>' : ''}
      </div>`).join('') : '<p class="hint">No templates yet.</p>';
    for (const row of $$('.lib-row', list)) {
      const edit = $('.edit', row);
      if (edit) edit.addEventListener('click', () => Studio.openTemplate(row.dataset.id).catch((e) => log('#templatesLog', esc(e.message), 'error')));
    }
    $('#packTemplates').innerHTML = all.map((t) =>
      `<label class="check"><input type="checkbox" value="${esc(t.id)}"> ${esc(t.name)} <span class="hint">(${esc(t.app)})</span></label>`).join('') ||
      '<p class="hint">Add templates first.</p>';
  }

  async function loadPacks() {
    const catalog = await C.packs.loadCatalog(C.settings.load().catalogUrl);
    const list = $('#packList');
    list.innerHTML = catalog.packs.length ? catalog.packs.map((p) => {
      const installed = p.templates.length && p.templates.every((t) => t.installed);
      return `
        <div class="pack" data-id="${esc(p.id)}">
          <div><b>${esc(p.name)}</b> <span class="hint">${esc(p.price || 'Free')} · ${p.templates.length} templates${p.author ? ' · by ' + esc(p.author) : ''}</span></div>
          <div class="hint">${esc(p.description || '')}</div>
          <div class="actions">
            ${p.purchaseUrl ? `<button type="button" class="buy">Buy</button>` : ''}
            <button type="button" class="install">${installed ? 'Reinstall' : 'Install'}</button>
          </div>
        </div>`;
    }).join('') : '<p class="hint">This catalog has no packs.</p>';
    for (const row of $$('.pack', list)) {
      const pack = catalog.packs.find((p) => p.id === row.dataset.id);
      const buy = $('.buy', row);
      if (buy) buy.addEventListener('click', () => window.cep.util.openURLInDefaultBrowser(pack.purchaseUrl));
      $('.install', row).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const res = await C.packs.installPack(catalog.url, pack.id, { overwrite: true });
        log('#templatesLog', `Installed <b>${esc(pack.name)}</b> (${res.results.length} templates).`, 'ok');
        refreshTemplates();
      }, '#templatesLog'));
    }
  }

  async function exportPack() {
    const ids = $$('#packTemplates input:checked').map((i) => i.value);
    if (!ids.length) throw new Error('Tick the templates to include.');
    const id = C.paths.slugify($('#packId').value);
    if (!id) throw new Error('Give the pack an id, e.g. restaurant-essentials.');
    const outDir = Host.chooseFolder('Choose where to save the pack');
    if (!outDir) return;
    const res = C.packs.exportPack({
      outDir,
      templateIds: ids,
      pack: {
        id,
        name: $('#packName').value.trim() || id,
        price: $('#packPrice').value.trim() || 'Free',
        purchaseUrl: $('#packPurchase').value.trim(),
        author: state.brand.designerName || '',
      },
    });
    log('#templatesLog', `Pack <b>${esc(res.pack.name)}</b> exported with ${res.pack.templates.length} templates: ` +
      `<code>${esc(basename(res.zip))}</code> to sell or share, plus a catalog folder to host.<br>${folderLink(outDir)}`, 'ok');
  }

  // ---------- settings tab ----------
  function mcpConfig() {
    const server = `${Host.info.root}/mcp/server.js`;
    return JSON.stringify({ mcpServers: { portablestudio: { command: 'node', args: [server] } } }, null, 2);
  }

  function renderSettings() {
    const s = C.settings.load();
    const api = ApiServer.state;
    $('#apiStatus').innerHTML = api.running
      ? `Running at <code>http://127.0.0.1:${api.port}/v1</code>`
      : `Not running${api.error ? ': ' + esc(api.error) : ''}.`;
    $('#apiToken').value = s.apiToken;
    $('#apiEnabled').checked = s.apiEnabled;
    $('#mcpConfig').textContent = mcpConfig();
    $('#anthropicKey').value = s.anthropicApiKey ? '••••••••' + s.anthropicApiKey.slice(-4) : '';
    $('#aiModel').value = s.aiModel;
    $('#catalogUrl').value = s.catalogUrl;
    renderLicense();
  }

  function renderLicense() {
    const st = C.license.status();
    $('#licenseForm').hidden = st.mode === 'disabled';
    $('#licenseStatus').textContent = st.mode === 'disabled'
      ? 'Licensing is turned off (config/app.json). Turn it on before you sell PortableStudio.'
      : `Status: ${st.status}${st.expiresAt ? ' · expires ' + st.expiresAt.slice(0, 10) : ''}${st.lastValidated ? ' · checked ' + st.lastValidated.slice(0, 10) : ''}`;
    const notice = $('#licenseNotice');
    notice.hidden = st.licensed;
    notice.textContent = st.licensed ? '' : 'Activate your license in Settings to generate files.';
  }

  function bindSettings() {
    try {
      const u = JSON.parse(localStorage.getItem('portablestudio.updateCheck')) || {};
      $('#checkUpdates').checked = !u.off;
    } catch { /* first run */ }
    $('#checkUpdates').addEventListener('change', (e) => {
      let u = {};
      try { u = JSON.parse(localStorage.getItem('portablestudio.updateCheck')) || {}; } catch { /* first run */ }
      u.off = !e.target.checked;
      try { localStorage.setItem('portablestudio.updateCheck', JSON.stringify(u)); } catch { /* not critical */ }
    });
    $('#copyToken').addEventListener('click', () => {
      Host.copyText(C.settings.load().apiToken);
      log('#settingsLog', 'API token copied.', 'ok');
    });
    $('#newToken').addEventListener('click', () => {
      if (!confirm('Create a new API token? Anything using the old token will stop working.')) return;
      C.settings.regenerateApiToken();
      renderSettings();
      log('#settingsLog', 'New API token created. The MCP server picks it up automatically.', 'ok');
    });
    $('#apiEnabled').addEventListener('change', (e) => {
      C.settings.update({ apiEnabled: e.target.checked });
      if (e.target.checked) ApiServer.start();
      else ApiServer.stop();
      setTimeout(renderSettings, 300);
    });
    $('#copyMcp').addEventListener('click', () => {
      Host.copyText(mcpConfig());
      log('#settingsLog', 'MCP config copied.', 'ok');
    });
    $('#saveAi').addEventListener('click', () => {
      const key = $('#anthropicKey').value.trim();
      const patch = { aiModel: $('#aiModel').value };
      if (key && !key.startsWith('••')) patch.anthropicApiKey = key;
      if (!key) patch.anthropicApiKey = '';
      C.settings.update(patch);
      renderSettings();
      log('#settingsLog', 'AI settings saved.', 'ok');
    });
    $('#saveCatalog').addEventListener('click', () => {
      C.settings.update({ catalogUrl: $('#catalogUrl').value.trim() });
      log('#settingsLog', 'Catalog URL saved.', 'ok');
    });
    $('#activateLicense').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const key = $('#licenseKey').value.trim();
      if (!key) throw new Error('Enter your license key.');
      await C.license.activate(key);
      $('#licenseKey').value = '';
      renderLicense();
      log('#settingsLog', 'License activated. Thank you!', 'ok');
    }, '#settingsLog'));
    $('#deactivateLicense').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await C.license.deactivate();
      renderLicense();
      log('#settingsLog', 'License deactivated on this computer.', 'ok');
    }, '#settingsLog'));
  }

  // ---------- first run ----------
  const WELCOME_KEY = 'portablestudio.welcomed';

  function bindWelcome() {
    let seen = false;
    try { seen = localStorage.getItem(WELCOME_KEY) === '1'; } catch { /* ignore */ }
    $('#welcome').hidden = seen || C.brands.list().length > 0;
    $('#welcomeClose').addEventListener('click', () => {
      $('#welcome').hidden = true;
      try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
    });
    $('#loadSample').addEventListener('click', () => {
      setBrand(Studio.sampleBrand(state.brand));
      log('#log', 'Loaded the sample brand "Lumen Coffee". Pick a template and click Generate.', 'ok');
    });
  }

  // ---------- tabs & startup ----------
  function bindTabs() {
    for (const btn of $$('.tabs button')) {
      btn.addEventListener('click', () => {
        $$('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
        $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
        if (btn.dataset.tab === 'settings') renderSettings();
        if (btn.dataset.tab === 'kit') renderColorReport();
      });
    }
  }

  // Tells the user about a newer release (GitHub, at most once a day). Can be turned off in Settings.
  function checkForUpdate() {
    let last = {};
    try { last = JSON.parse(localStorage.getItem('portablestudio.updateCheck')) || {}; } catch { /* first run */ }
    if (last.off) return;
    const save = () => { try { localStorage.setItem('portablestudio.updateCheck', JSON.stringify(last)); } catch { /* not critical */ } };
    const newer = (a, b) => {
      const pa = String(a).replace(/^v/, '').split('.').map(Number);
      const pb = String(b).replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
      return false;
    };
    const show = () => {
      const version = require(`${Host.info.root}/package.json`).version;
      if (!last.tag || !newer(last.tag, version) || last.dismissed === last.tag) return;
      const el = $('#updateNotice');
      el.innerHTML = `PortableStudio ${esc(last.tag.replace(/^v/, ''))} is out. <button class="link" id="getUpdate">Download</button> · <button class="link" id="skipUpdate">Later</button>`;
      el.hidden = false;
      $('#getUpdate').onclick = () => window.cep.util.openURLInDefaultBrowser(last.url);
      $('#skipUpdate').onclick = () => { el.hidden = true; last.dismissed = last.tag; save(); };
    };
    if (last.at && Date.now() - last.at < 864e5) return show();
    Host.core('http').getJson('https://api.github.com/repos/vicenet/PortableStudio/releases/latest', { 'User-Agent': 'PortableStudio' })
      .then((j) => { Object.assign(last, { at: Date.now(), tag: j.tag_name, url: j.html_url }); save(); show(); })
      .catch(() => { /* offline or rate-limited: try again tomorrow */ });
  }

  async function start() {
    bindTabs();
    try {
      await Host.init();
      C = Studio.init();
      $('#hostBadge').textContent = Host.info.app === 'illustrator' ? 'Illustrator' : 'Photoshop';
      state.brand = loadDraft();
      bindBrandForm();
      bindTemplatePicker();
      bindKit();
      bindTemplatesTab();
      bindSettings();
      bindWelcome();
      refreshTemplates();
      renderBrand();
      ApiServer.start();
      loadFonts();
      C.license.check().then(renderLicense).catch(() => renderLicense());
      setTimeout(checkForUpdate, 3000);
    } catch (e) {
      $('#hostBadge').textContent = 'error';
      $('#fatal').hidden = false;
      $('#fatal').textContent = e.message;
      console.error(e);
    }
  }

  document.addEventListener('DOMContentLoaded', start);
})();
