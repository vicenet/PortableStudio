// Illustrator implementation of the PortableStudio host API.
//
// Template conventions (see docs/TEMPLATE-GUIDE.md):
//   text      - text containing {{brand.name}} etc, or a text frame named with a tag
//   colours   - GLOBAL swatches named Primary / Secondary / Accent
//   fonts     - paragraph or character styles named Heading / Body
//   logos     - any object named {{logo.mark}} / {{logo.full}} / {{logo.type}} (or {{image.x}})

(function (PS) {
    var api = PS.api;
    var B = PS.brand;
    var U = PS.util;

    function withDocumentCoordinates(fn) {
        var prev = app.coordinateSystem;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        try {
            return fn();
        } finally {
            app.coordinateSystem = prev;
        }
    }

    function activeDocOrThrow() {
        if (app.documents.length === 0) throw new Error('Open your template design first.');
        return app.activeDocument;
    }

    function makeColor(doc, hex) {
        var rgb = B.hexToRgb(hex);
        if (doc.documentColorSpace == DocumentColorSpace.CMYK) {
            var k = B.rgbToCmyk(rgb);
            var c = new CMYKColor();
            c.cyan = k.c; c.magenta = k.m; c.yellow = k.y; c.black = k.k;
            return c;
        }
        var r = new RGBColor();
        r.red = rgb.r; r.green = rgb.g; r.blue = rgb.b;
        return r;
    }

    // ---- colours: recolour global swatches whose name is a colour role ----
    function applyColors(doc, brand, report) {
        var swatches = doc.swatches;
        for (var i = 0; i < swatches.length; i++) {
            var sw = swatches[i];
            var role = String(sw.name).toLowerCase();
            if (!B.contains(B.COLOR_ROLES, role)) continue;
            var hex = B.normalizeHex(brand.colors && brand.colors[role]);
            if (!hex) continue;
            if (sw.color.typename === 'SpotColor') {
                sw.color.spot.color = makeColor(doc, hex);
                report.colors.push(sw.name);
            } else {
                report.warnings.push('Swatch "' + sw.name + '" is not a global swatch, so artwork using it was not recoloured.');
            }
        }
    }

    // ---- fonts: change the font of paragraph/character styles named Heading/Body ----
    function findFont(psName) {
        try {
            return app.textFonts.getByName(psName);
        } catch (e) {
            return null;
        }
    }

    // Changes a role's style font. Returns the PostScript name the style had before.
    function setStyleFont(styles, role, font, report) {
        var oldName = null;
        for (var i = 0; i < styles.length; i++) {
            if (String(styles[i].name).toLowerCase() !== role) continue;
            try { oldName = styles[i].characterAttributes.textFont.name; } catch (e) { /* unset */ }
            styles[i].characterAttributes.textFont = font;
            report.fonts.push(styles[i].name);
        }
        return oldName;
    }

    // Text inserted by the script carries its font as a local override, so a style change alone
    // doesn't reach it. Move paragraphs of this style that still use the old font to the new one.
    function retargetParagraphs(doc, role, oldNames, font) {
        var stale = [];
        for (var n = 0; n < oldNames.length; n++) if (oldNames[n] && oldNames[n] !== font.name) stale.push(oldNames[n]);
        if (!stale.length) return;
        for (var i = 0; i < doc.textFrames.length; i++) {
            var tf = doc.textFrames[i];
            if (isDataItem(tf)) continue;
            // Only generated frames can hold text inserted with a stale font.
            if (String(tf.note || '').indexOf(TEXT_NOTE) !== 0) continue;
            try {
                var paras = tf.paragraphs;
                for (var p = 0; p < paras.length; p++) {
                    var para = paras[p];
                    if (para.length === 0) continue;
                    if (String(para.paragraphStyles[0].name).toLowerCase() !== role) continue;
                    var chars = para.characters;
                    for (var c = 0; c < chars.length; c++) {
                        if (B.contains(stale, chars[c].characterAttributes.textFont.name)) chars[c].characterAttributes.textFont = font;
                    }
                }
            } catch (e) { /* locked or empty frame */ }
        }
    }

    // Returns { role: [every font name this role has used in the document] } for the data layer.
    function applyFonts(doc, brand, report, prevFonts) {
        var history = {};
        for (var r in prevFonts || {}) if (prevFonts.hasOwnProperty(r)) history[r] = prevFonts[r].slice(0);
        for (var i = 0; i < B.FONT_ROLES.length; i++) {
            var role = B.FONT_ROLES[i];
            var f = brand.fonts && brand.fonts[role];
            if (!f || !f.ps) continue;
            var font = findFont(f.ps);
            if (!font) {
                report.warnings.push('Font "' + (f.name || f.ps) + '" is not installed; ' + role + ' font left unchanged.');
                continue;
            }
            var known = history[role] || [];
            var oldName = setStyleFont(doc.paragraphStyles, role, font, report);
            if (oldName) U.addUnique(known, [oldName]);
            setStyleFont(doc.characterStyles, role, font, report);
            if (prevFonts) retargetParagraphs(doc, role, known, font); // update mode only
            U.addUnique(known, [font.name]);
            history[role] = known;
        }
        return history;
    }

    // ---- text ----
    // Generated documents remember how to re-apply a brand ("Update open document"):
    //   - each text frame that had tags gets note "ps:<original template text>"
    //   - each placed logo gets note "ps-asset:<json box>"
    //   - a hidden, non-printing layer holds the values that were last applied
    var TEXT_NOTE = 'ps:';
    var ASSET_NOTE = 'ps-asset:';
    var DATA_LAYER = 'PortableStudio Data';

    function isDataItem(item) {
        try {
            return item.layer.name === DATA_LAYER;
        } catch (e) {
            return false;
        }
    }

    // Replaces characters [start, end) with value, keeping the style of the first replaced
    // character (or of its neighbour when inserting into an empty slot).
    function replaceRange(tf, start, end, value) {
        if (end > start) {
            for (var j = end - 1; j > start; j--) tf.characters[j].remove();
            if (value === '') tf.characters[start].remove();
            else tf.characters[start].contents = value;
            return;
        }
        if (value === '') return;
        var len = tf.characters.length;
        if (start < len) tf.characters[start].contents = value + tf.characters[start].contents;
        else if (len > 0) tf.characters[len - 1].contents = tf.characters[len - 1].contents + value;
        else tf.contents = value;
    }

    // Plans the edits that turn `original` filled with `prev` into `original` filled with `next`.
    // prev === null means the frame still holds the raw template text.
    function planEdits(original, prev, next) {
        var tags = B.findTags(original);
        var edits = [];
        var offset = 0;
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i];
            var raw = original.substring(t.start, t.end);
            var oldVal = prev && B.has(prev, t.key) ? prev[t.key] : raw;
            var newVal = B.has(next, t.key) ? next[t.key] : oldVal;
            if (newVal !== oldVal) edits.push({ pos: t.start + offset, len: oldVal.length, value: newVal });
            offset += oldVal.length - raw.length;
        }
        return edits;
    }

    function fillFrame(tf, original, prev, next, report) {
        var edits = planEdits(original, prev, next);
        for (var e = edits.length - 1; e >= 0; e--) {
            replaceRange(tf, edits[e].pos, edits[e].pos + edits[e].len, edits[e].value);
        }
        var tags = B.findTags(original);
        for (var i = 0; i < tags.length; i++) {
            if (!B.has(next, tags[i].key)) U.addUnique(report.unfilledTags, [tags[i].key]);
        }
        return edits.length > 0;
    }

    // Area text that no longer fits its box: shrink it (max 12 steps, down to ~37 %) until it does.
    function visibleCount(tf) {
        var n = 0;
        for (var i = 0; i < tf.lines.length; i++) n += String(tf.lines[i].contents).replace(/\s/g, '').length;
        return n;
    }

    function isOverset(tf) {
        if (tf.kind !== TextType.AREATEXT) return false;
        return visibleCount(tf) < String(tf.contents).replace(/\s/g, '').length;
    }

    function fitFrame(tf, report) {
        if (!isOverset(tf)) return;
        var ca = tf.textRange.characterAttributes;
        var size = ca.size, leading = ca.autoLeading ? 0 : ca.leading;
        for (var step = 0; step < 12 && isOverset(tf); step++) {
            size *= 0.92;
            ca.size = size;
            if (leading) { leading *= 0.92; ca.leading = leading; }
        }
        var label = String(tf.contents).substring(0, 30);
        if (isOverset(tf)) report.warnings.push('Text "' + label + '" is too long for its box even after shrinking.');
        else report.fitted.push(label);
    }

    // prev: values applied last time (update mode) or null (fresh template).
    function replaceText(doc, values, prev, report, force) {
        var frames = doc.textFrames;
        for (var i = 0; i < frames.length; i++) {
            var tf = frames[i];
            if (isDataItem(tf)) continue;
            try {
                var note = String(tf.note || '');
                var original, framePrev;
                if (note.indexOf(TEXT_NOTE) === 0) {
                    original = note.substring(TEXT_NOTE.length);
                    framePrev = prev;
                    var expected = B.replaceTags(original, prev || {}).text;
                    if (tf.contents !== expected) {
                        if (!force) {
                            report.warnings.push('Text "' + String(tf.contents).substring(0, 30) + '" was edited by hand, so it was left as is.');
                            continue;
                        }
                        tf.contents = original; // reset to the template text
                        framePrev = null;
                    }
                } else {
                    var nameTag = B.parseTag(tf.name);
                    if (nameTag && B.has(values, nameTag.key) && tf.contents.indexOf('{{') < 0) {
                        // Whole frame driven by its name: rewrite it as an inline tag first.
                        tf.contents = '{{' + nameTag.key + '}}';
                    }
                    if (tf.contents.indexOf('{{') < 0) continue;
                    original = tf.contents;
                    framePrev = null;
                    tf.note = TEXT_NOTE + original;
                }
                var changed;
                try {
                    changed = fillFrame(tf, original, framePrev, values, report);
                } catch (e) {
                    // Fallback: whole-frame replace (keeps the first character's style).
                    var r = B.replaceTags(original, values);
                    tf.contents = r.text;
                    changed = true;
                }
                if (changed) {
                    report.textReplaced++;
                    try { fitFrame(tf, report); } catch (eFit) { /* best effort */ }
                }
            } catch (e2) {
                report.warnings.push('Could not edit text "' + String(tf.contents).substring(0, 30) + '" (locked or hidden layer?).');
            }
        }
    }

    // ---- logos / images ----
    function bounds(item) {
        var b = item.geometricBounds; // [left, top, right, bottom]
        return {
            left: b[0], top: b[1], right: b[2], bottom: b[3],
            width: Math.abs(b[2] - b[0]), height: Math.abs(b[1] - b[3]),
            cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2
        };
    }

    function fitInto(item, target, cover) {
        var ib = bounds(item);
        if (ib.width === 0 || ib.height === 0) return;
        var sx = target.width / ib.width, sy = target.height / ib.height;
        var s = (cover ? Math.max(sx, sy) : Math.min(sx, sy)) * 100;
        item.resize(s, s);
        ib = bounds(item);
        item.translate(target.cx - ib.cx, target.cy - ib.cy);
    }

    function importArt(doc, file) {
        var ext = String(file.name).split('.').pop().toLowerCase();
        if (ext === 'svg' || ext === 'ai' || ext === 'eps' || ext === 'pdf') {
            return { item: doc.groupItems.createFromFile(file), raster: false };
        }
        var p = doc.placedItems.add();
        p.file = file;
        return { item: p, raster: true };
    }

    // Puts `file` where `target` is, fitted into `box`, and removes `target`.
    // Applies placeholder modifiers after the art is fitted:
    //   cover   fill the box (crop-style) instead of fitting inside it
    //   stretch fill the box exactly, distorting the art ("don't" examples)
    //   white | black | primary | secondary | accent   recolour vector art
    //   rotate | flipx | flipy | faded                 "don't" examples
    // Number of distinct fill colours in vector art (to spot multi-colour logos).
    function fillColors(item, seen) {
        var i;
        if (item.typename === 'GroupItem') for (i = 0; i < item.pageItems.length; i++) fillColors(item.pageItems[i], seen);
        else if (item.typename === 'CompoundPathItem') { if (item.pathItems.length) fillColors(item.pathItems[0], seen); }
        else if (item.typename === 'PathItem' && item.filled && !item.clipping) {
            var c = item.fillColor, k = c.typename;
            if (k === 'RGBColor') k += Math.round(c.red) + ',' + Math.round(c.green) + ',' + Math.round(c.blue);
            else if (k === 'CMYKColor') k += Math.round(c.cyan) + ',' + Math.round(c.magenta) + ',' + Math.round(c.yellow) + ',' + Math.round(c.black);
            else if (k === 'SpotColor') k += c.spot.name + c.tint;
            seen[k] = true;
        }
        return seen;
    }

    function applyModifiers(item, box, mods, brand, raster, report) {
        if (B.contains(mods, 'stretch')) {
            var ib = bounds(item);
            if (ib.width && ib.height) {
                item.resize(box.width / ib.width * 100, box.height / ib.height * 100);
                ib = bounds(item);
                item.translate(box.cx - ib.cx, box.cy - ib.cy);
            }
        }
        var colorMods = ['white', 'black', 'primary', 'secondary', 'accent'];
        for (var i = 0; i < mods.length; i++) {
            var m = mods[i];
            if (B.contains(colorMods, m) && !raster) {
                var hex = m === 'white' ? '#FFFFFF' : (m === 'black' ? '#000000' : B.normalizeHex(brand.colors && brand.colors[m]));
                if (hex) {
                    var n = 0, seen = fillColors(item, {});
                    for (var sk in seen) if (seen.hasOwnProperty(sk)) n++;
                    if (n > 1 && report) {
                        U.addUnique(report.warnings, m === 'white' || m === 'black'
                            ? ['The logo has several colours, so its automatic ' + m + ' version loses detail. ' +
                                'Add White and Black versions under Logos > One-colour versions for best results.']
                            : ['The logo has several colours, so its single-colour (' + m + ') version loses detail. ' +
                                'This is expected on pages like "Please don\'t"; check the page looks right.']);
                    }
                    recolor(item, solidRgb(hex));
                }
            } else if (m === 'rotate') {
                item.rotate(-18);
            } else if (m === 'flipx') {
                item.resize(-100, 100);
            } else if (m === 'flipy') {
                item.resize(100, -100);
            } else if (m === 'faded') {
                item.opacity = 30;
            }
        }
    }

    // Wraps item in a clipping group cropped to box (for cover-fitted photos).
    function clipToBox(item, box) {
        var group = item.parent.groupItems.add();
        group.move(item, ElementPlacement.PLACEBEFORE);
        item.move(group, ElementPlacement.PLACEATEND);
        var mask = group.pathItems.rectangle(box.cy + box.height / 2, box.cx - box.width / 2, box.width, box.height);
        mask.move(group, ElementPlacement.PLACEATBEGINNING);
        group.clipped = true;
        return group;
    }

    // 25 % tint of the Secondary global swatch, or a light grey.
    function softBrandColor(doc, brand) {
        for (var i = 0; i < doc.swatches.length; i++) {
            if (String(doc.swatches[i].name).toLowerCase() === 'secondary' && doc.swatches[i].color.typename === 'SpotColor') {
                var c = new SpotColor();
                c.spot = doc.swatches[i].color.spot;
                c.tint = 25;
                return c;
            }
        }
        return solidRgb('#E6E4E0');
    }

    function swapInAsset(doc, target, file, box, key, mods, brand, report, skipRecolor) {
        var placed = importArt(doc, file);
        var item = placed.item;
        item.move(target, ElementPlacement.PLACEBEFORE);
        fitInto(item, box, B.contains(mods, 'cover'));
        target.remove();
        // Raster images stay linked (the panel copies them into a Links folder next to the document).
        applyModifiers(item, box, mods, brand, placed.raster || skipRecolor, report);
        if (B.contains(mods, 'grid') && !placed.raster) {
            // Construction page: faded logo with outlines, anchors, handles and circles on top.
            var wrap = item.parent.groupItems.add();
            wrap.move(item, ElementPlacement.PLACEBEFORE);
            item.move(wrap, ElementPlacement.PLACEATEND);
            item.opacity = 30;
            var overlay = wrap.groupItems.add();
            drawGrid(overlay, [item], {
                outlines: true, anchors: true, handles: true, circles: true,
                color: B.normalizeHex(brand.colors && brand.colors.accent) || '#1E90FF'
            });
            item = wrap;
        }
        if (B.contains(mods, 'cover')) item = clipToBox(item, box);
        item.name = key;
        item.note = ASSET_NOTE + JSON.stringify({ key: key, cx: box.cx, cy: box.cy, width: box.width, height: box.height, mods: mods });
        return item;
    }

    // Fresh templates: replaces {{logo.x}} placeholders. Update mode: swaps logos whose file changed.
    function placeAssets(doc, brand, prevAssets, report, forceAll) {
        var items = doc.pageItems;
        var targets = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (isDataItem(it)) continue;
            var note = String(it.note || '');
            if (note.indexOf(ASSET_NOTE) === 0) {
                var meta = JSON.parse(note.substring(ASSET_NOTE.length));
                targets.push({ item: it, key: meta.key, box: meta, mods: meta.mods || (meta.cover ? ['cover'] : []), generated: true });
                continue;
            }
            var t = B.parseTag(it.name);
            if (t && B.isAssetKey(t.key)) {
                targets.push({ item: it, key: t.key, box: bounds(it), mods: t.mods, generated: false });
            }
        }
        for (var k = 0; k < targets.length; k++) {
            var target = targets[k];
            var key = target.key;
            var basePath = B.assetPath(brand, key);
            var colorMod = firstColorMod(target.mods);
            // PNG logos get pre-made colour versions from the panel (vector logos are recoloured here).
            var part = key.split('.')[1];
            var variant = colorMod && brand.logoVariants && brand.logoVariants[part];
            // Designer-supplied one-colour artwork (logos.fullWhite, logos.markBlack...) beats auto recolouring.
            var supplied = (colorMod === 'white' || colorMod === 'black') && key.indexOf('logo.') === 0 &&
                brand.logos && brand.logos[part + (colorMod === 'white' ? 'White' : 'Black')];
            var path = supplied || (variant && variant[colorMod]) || basePath;
            var compareKey = key + (colorMod ? '|' + colorMod : '');
            if (target.generated && !forceAll && prevAssets && prevAssets[compareKey] === path) continue;
            if (!path) {
                if (!target.generated && key.indexOf('image.') === 0) {
                    // No photo: turn the dashed box into a soft brand-colour block (Update can add a photo later).
                    try {
                        target.item.filled = true;
                        target.item.fillColor = softBrandColor(doc, brand);
                        target.item.stroked = false;
                    } catch (eFill) { /* leave placeholder */ }
                    report.warnings.push('No photo chosen for ' + key + '; used a brand colour block instead.');
                } else if (!target.generated) {
                    report.warnings.push('No file chosen for ' + key + '; placeholder left in place.');
                }
                continue;
            }
            var file = new File(path);
            if (!file.exists) {
                report.warnings.push(key + ' file not found: ' + path);
                continue;
            }
            try {
                swapInAsset(doc, target.item, file, target.box, key, target.mods, brand, report, !!supplied);
                report.assets.push(key);
            } catch (e2) {
                report.warnings.push('Could not place ' + key + ': ' + e2.message);
            }
        }
    }

    var COLOR_MODS = ['white', 'black', 'primary', 'secondary', 'accent'];

    function firstColorMod(mods) {
        for (var i = 0; i < mods.length; i++) if (B.contains(COLOR_MODS, mods[i])) return mods[i];
        return null;
    }

    // ---- generation data (hidden layer) ----
    function readData(doc) {
        try {
            var layer = doc.layers.getByName(DATA_LAYER);
            return JSON.parse(layer.textFrames[0].contents);
        } catch (e) {
            return null;
        }
    }

    function writeData(doc, data) {
        var layer;
        try {
            layer = doc.layers.getByName(DATA_LAYER);
            layer.locked = false;
            layer.visible = true;
            while (layer.pageItems.length) layer.pageItems[0].remove();
        } catch (e) {
            layer = doc.layers.add();
            layer.name = DATA_LAYER;
        }
        var tf = layer.textFrames.add();
        tf.contents = JSON.stringify(data);
        layer.zOrder(ZOrderMethod.SENDTOBACK);
        layer.printable = false;
        layer.locked = true;
        layer.visible = false;
    }

    function assetPaths(brand) {
        var out = {};
        var groups = { logo: brand.logos || {}, image: brand.images || {} };
        for (var g in groups) {
            if (!groups.hasOwnProperty(g)) continue;
            for (var k in groups[g]) {
                if (groups[g].hasOwnProperty(k)) out[g + '.' + k] = String(groups[g][k] || '');
            }
        }
        var lv = brand.logoVariants || {};
        for (var lk in lv) {
            if (!lv.hasOwnProperty(lk)) continue;
            for (var c = 0; c < COLOR_MODS.length; c++) {
                var m = COLOR_MODS[c];
                out['logo.' + lk + '|' + m] = lv[lk][m] || out['logo.' + lk] || '';
            }
        }
        for (var key in out) {
            if (!out.hasOwnProperty(key) || key.indexOf('|') >= 0 || key.indexOf('logo.') !== 0) continue;
            for (var c2 = 0; c2 < COLOR_MODS.length; c2++) {
                if (!out.hasOwnProperty(key + '|' + COLOR_MODS[c2])) out[key + '|' + COLOR_MODS[c2]] = out[key];
            }
        }
        return out;
    }

    function applyBrand(doc, brand, prevData, report, force) {
        var values = B.buildValues(brand);
        var fonts;
        withDocumentCoordinates(function () {
            applyColors(doc, brand, report);
            fonts = applyFonts(doc, brand, report, prevData ? prevData.fonts : null);
            // No brand font chosen: name the template's own font so {{font.x}} still reads well.
            for (var r = 0; r < B.FONT_ROLES.length; r++) {
                var fk = 'font.' + B.FONT_ROLES[r];
                if (B.has(values, fk)) continue;
                for (var ps = 0; ps < doc.paragraphStyles.length; ps++) {
                    var st = doc.paragraphStyles[ps];
                    if (String(st.name).toLowerCase() !== B.FONT_ROLES[r]) continue;
                    try { values[fk] = st.characterAttributes.textFont.family + ' ' + st.characterAttributes.textFont.style; } catch (eF) { /* unset */ }
                }
            }
            replaceText(doc, values, prevData ? prevData.values : null, report, force);
            placeAssets(doc, brand, prevData ? prevData.assets : null, report, force);
        });
        return { values: values, fonts: fonts };
    }

    function savePdf(doc, pdfPath) {
        var opts = new PDFSaveOptions();
        opts.compatibility = PDFCompatibility.ACROBAT7;
        opts.preserveEditability = false;
        opts.generateThumbnails = true;
        doc.saveAs(new File(pdfPath), opts);
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    function pngOptions(scale, transparent) {
        var o = new ExportOptionsPNG24();
        o.artBoardClipping = true;
        o.antiAliasing = true;
        o.transparency = !!transparent;
        o.horizontalScale = scale;
        o.verticalScale = scale;
        return o;
    }

    function ensureFolder(path) {
        var f = new Folder(path);
        if (!f.exists) f.create();
        return f;
    }

    // One PNG per artboard: <base>-01.png, <base>-02.png ... (carousel slides, pages).
    function exportArtboards(doc, dir, base, width) {
        var folder = ensureFolder(dir);
        var files = [];
        for (var i = 0; i < doc.artboards.length; i++) {
            doc.artboards.setActiveArtboardIndex(i);
            var ab = doc.artboards[i].artboardRect;
            var scale = width ? width / Math.abs(ab[2] - ab[0]) * 100 : 100;
            var f = new File(folder.fsName + '/' + base + '-' + pad2(i + 1) + '.png');
            doc.exportFile(f, ExportType.PNG24, pngOptions(scale, false));
            files.push(f.fsName);
        }
        return files;
    }

    // Saves, exports pages/PDF, and leaves the editable .ai open for the designer.
    function finishDocument(doc, work, arg, outputs) {
        doc.save();
        if (arg.pagesDir) {
            outputs.pages = exportArtboards(doc, arg.pagesDir, arg.pagesBase || 'page', arg.pageWidth || 0);
        }
        if (arg.pdfFile) {
            savePdf(doc, arg.pdfFile);
            doc.close(SaveOptions.DONOTSAVECHANGES);
            doc = app.open(work);
            outputs.pdf = new File(arg.pdfFile).fsName;
        }
        doc.artboards.setActiveArtboardIndex(0);
        app.executeMenuCommand('fitall');
        return outputs;
    }

    // arg: { workFile, pdfFile, pagesDir, pagesBase, pageWidth, brand, templateId, templateName }
    api.applyTemplate = function (arg) {
        var work = U.fileOrThrow(arg.workFile, 'Working copy');
        var brand = arg.brand || {};
        var report = U.newReport();

        var doc = app.open(work);
        var applied = applyBrand(doc, brand, null, report, false);
        writeData(doc, {
            v: 1, templateId: arg.templateId || '', templateName: arg.templateName || '',
            brandId: brand.id || '', brandName: brand.name || '',
            values: applied.values, fonts: applied.fonts, assets: assetPaths(brand)
        });
        var outputs = finishDocument(doc, work, arg, { source: work.fsName });
        return { outputs: outputs, report: report };
    };

    // Re-applies a (changed) brand to the open generated document.
    // Text edited by hand is kept unless arg.force. arg: { brand, force, exportPdf, pagesDir, pagesBase }
    api.updateDocument = function (arg) {
        var doc = activeDocOrThrow();
        var data = readData(doc);
        if (!data) throw new Error('This document was not generated by PortableStudio, so it cannot be updated. Generate it from a template first.');
        var work;
        try { work = doc.fullName; } catch (e) { throw new Error('Save the document first.'); }
        var brand = arg.brand || {};
        var report = U.newReport();
        if (data.brandName && brand.name && data.brandName !== brand.name) {
            report.warnings.push('Brand name changed from "' + data.brandName + '" to "' + brand.name + '".');
        }
        var applied = applyBrand(doc, brand, data, report, !!arg.force);
        data.values = applied.values;
        data.fonts = applied.fonts;
        data.assets = assetPaths(brand);
        data.brandId = brand.id || data.brandId;
        data.brandName = brand.name || data.brandName;
        data.updatedAt = new Date().toUTCString();
        writeData(doc, data);
        var pdfPath = arg.exportPdf ? String(work.fsName).replace(/\.ai$/i, '') + '.pdf' : null;
        var outputs = finishDocument(doc, work, { pdfFile: pdfPath, pagesDir: arg.pagesDir, pagesBase: arg.pagesBase }, { source: work.fsName });
        return { outputs: outputs, report: report, templateName: data.templateName };
    };

    // Info about the open document for the panel (is it a generated document?).
    api.activeDocumentInfo = function () {
        if (app.documents.length === 0) return { open: false };
        var doc = app.activeDocument;
        var data = readData(doc);
        var file = null;
        try { file = doc.fullName.fsName; } catch (e) { /* unsaved */ }
        return { open: true, name: doc.name, file: file, generated: !!data, templateName: data ? data.templateName : '', brandName: data ? data.brandName : '' };
    };

    api.listFonts = function () {
        var out = [];
        var fonts = app.textFonts;
        for (var i = 0; i < fonts.length; i++) {
            try {
                var f = fonts[i];
                out.push({ ps: f.name, name: f.family + ' ' + f.style, family: f.family });
            } catch (e) { /* skip unreadable font */ }
        }
        return out;
    };

    // Describes the open document so the panel can register it as a template.
    api.scanActiveDocument = function () {
        var doc = activeDocOrThrow();
        var file = null;
        try { file = doc.fullName.fsName; } catch (e) { /* never saved */ }

        var tags = [], placeholders = [], colorRoles = [], fontStyles = [], warnings = [];

        for (var i = 0; i < doc.textFrames.length; i++) {
            var tf = doc.textFrames[i];
            if (isDataItem(tf)) continue;
            var nt = B.parseTag(tf.name);
            if (nt) U.addUnique(tags, [nt.key]);
            var found = B.findTags(tf.contents);
            for (var j = 0; j < found.length; j++) U.addUnique(tags, [found[j].key]);
        }
        for (var p = 0; p < doc.pageItems.length; p++) {
            if (isDataItem(doc.pageItems[p])) continue;
            var pt = B.parseTag(doc.pageItems[p].name);
            if (pt && B.isAssetKey(pt.key)) U.addUnique(placeholders, [pt.key]);
        }
        for (var s = 0; s < doc.swatches.length; s++) {
            var sw = doc.swatches[s];
            var role = String(sw.name).toLowerCase();
            if (!B.contains(B.COLOR_ROLES, role)) continue;
            if (sw.color.typename === 'SpotColor') colorRoles.push(role);
            else warnings.push('Swatch "' + sw.name + '" must be a Global swatch (double-click it, tick "Global").');
        }
        var styleSets = [doc.paragraphStyles, doc.characterStyles];
        for (var ss = 0; ss < styleSets.length; ss++) {
            for (var st = 0; st < styleSets[ss].length; st++) {
                var sn = String(styleSets[ss][st].name).toLowerCase();
                if (B.contains(B.FONT_ROLES, sn)) U.addUnique(fontStyles, [sn]);
            }
        }

        if (!file) warnings.push('Save the document to disk first (File > Save).');
        else if (!doc.saved) warnings.push('The document has unsaved changes; they will be saved when you add it.');
        if (tags.length === 0 && placeholders.length === 0 && colorRoles.length === 0) {
            warnings.push('No tags, logo placeholders or colour swatches found - nothing would change when generating.');
        }
        if (placeholders.length === 0) warnings.push('No logo placeholder found (an object named {{logo.mark}}, {{logo.full}} or {{logo.type}}).');
        for (var l = 0; l < doc.placedItems.length; l++) {
            warnings.push('This document has linked images. Embed them (Links panel > Embed Image) so the template is self-contained.');
            break;
        }

        var ab = doc.artboards[0].artboardRect;
        return {
            app: 'illustrator',
            file: file,
            ext: '.ai',
            saved: doc.saved,
            pages: doc.artboards.length,
            width: Math.round(Math.abs(ab[2] - ab[0])),
            height: Math.round(Math.abs(ab[1] - ab[3])),
            tags: tags,
            placeholders: placeholders,
            colorRoles: colorRoles,
            fontStyles: fontStyles,
            warnings: warnings
        };
    };

    api.saveActive = function () {
        var doc = activeDocOrThrow();
        try { doc.fullName.fsName; } catch (e) { throw new Error('Save the document to disk first (File > Save).'); }
        if (!doc.saved) doc.save();
        return doc.fullName.fsName;
    };

    // arg: { file, width }
    api.exportThumbnail = function (arg) {
        var doc = activeDocOrThrow();
        doc.artboards.setActiveArtboardIndex(0);
        var ab = doc.artboards[0].artboardRect;
        var w = Math.abs(ab[2] - ab[0]);
        var scale = (arg.width || 600) / w * 100;
        var o = new ExportOptionsPNG24();
        o.artBoardClipping = true;
        o.antiAliasing = true;
        o.transparency = false;
        o.horizontalScale = scale;
        o.verticalScale = scale;
        doc.exportFile(new File(arg.file), ExportType.PNG24, o);
        return arg.file;
    };

    // ---- logo construction grid ----
    // Collects the vector paths inside items (groups and compound paths are opened up).
    function collectPaths(item, out) {
        var i;
        switch (item.typename) {
            case 'GroupItem':
                for (i = 0; i < item.pageItems.length; i++) collectPaths(item.pageItems[i], out);
                break;
            case 'CompoundPathItem':
                for (i = 0; i < item.pathItems.length; i++) collectPaths(item.pathItems[i], out);
                break;
            case 'PathItem':
                if (!item.clipping && !item.guides) out.push(item);
                break;
        }
        return out;
    }

    function unionBounds(items) {
        var b = null;
        for (var i = 0; i < items.length; i++) {
            var v = items[i].visibleBounds;
            if (!b) b = [v[0], v[1], v[2], v[3]];
            else b = [Math.min(b[0], v[0]), Math.max(b[1], v[1]), Math.max(b[2], v[2]), Math.min(b[3], v[3])];
        }
        return b;
    }

    function cubicPoint(p0, p1, p2, p3, t) {
        var u = 1 - t;
        return [
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        ];
    }

    // Circle through three points, or null if they are (nearly) in a line.
    function circleFrom3(a, b, c) {
        var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
        if (Math.abs(d) < 1e-6) return null;
        var a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
        var x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
        var y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
        return { x: x, y: y, r: Math.sqrt((a[0] - x) * (a[0] - x) + (a[1] - y) * (a[1] - y)) };
    }

    function strokeLine(container, pts, color, width, dashed) {
        var p = container.pathItems.add();
        p.setEntirePath(pts);
        p.filled = false;
        p.stroked = true;
        p.strokeColor = color;
        p.strokeWidth = width;
        if (dashed) p.strokeDashes = [width * 4, width * 3];
        return p;
    }

    function dot(container, x, y, r, fill, stroke, width) {
        var e = container.pathItems.ellipse(y + r, x - r, r * 2, r * 2);
        e.filled = !!fill;
        if (fill) e.fillColor = fill;
        e.stroked = !!stroke;
        if (stroke) { e.strokeColor = stroke; e.strokeWidth = width; }
        return e;
    }

    // Draws construction overlays for `items` into `container` (a layer or group).
    // opts: { outlines, anchors, handles, gridlines, circles, clearspace, color }
    function drawGrid(container, items, opts) {
        var color = solidRgb(opts.color || '#1E90FF');
        var white = solidRgb('#FFFFFF');
        var paths = [];
        for (var i = 0; i < items.length; i++) collectPaths(items[i], paths);
        if (!paths.length) throw new Error('No vector paths found. Logo grids need vector artwork (SVG/AI), not images.');
        var b = unionBounds(items);
        var w = Math.abs(b[2] - b[0]), h = Math.abs(b[1] - b[3]), size = Math.max(w, h);
        var lw = Math.max(0.25, size / 900);
        var counts = { paths: paths.length, anchors: 0, handles: 0, gridlines: 0, circles: 0 };
        var xs = {}, ys = {}, circles = [];
        var round = function (v) { return Math.round(v * 2) / 2; };

        for (var p = 0; p < paths.length; p++) {
            var path = paths[p];
            if (opts.outlines) {
                var o = path.duplicate(container, ElementPlacement.PLACEATEND);
                o.filled = false;
                o.stroked = true;
                o.strokeColor = color;
                o.strokeWidth = lw;
                o.opacity = 100;
            }
            var pts = path.pathPoints;
            for (var k = 0; k < pts.length; k++) {
                var pt = pts[k];
                xs[round(pt.anchor[0])] = true;
                ys[round(pt.anchor[1])] = true;
                if (opts.circles) {
                    var next = pts[(k + 1) % pts.length];
                    if (k + 1 < pts.length || path.closed) {
                        var mid = cubicPoint(pt.anchor, pt.rightDirection, next.leftDirection, next.anchor, 0.5);
                        var c = circleFrom3(pt.anchor, mid, next.anchor);
                        if (c && c.r > size * 0.02 && c.r < size * 1.5) {
                            var dup = false;
                            for (var q = 0; q < circles.length; q++) {
                                var d = circles[q];
                                if (Math.abs(d.x - c.x) < size * 0.01 && Math.abs(d.y - c.y) < size * 0.01 && Math.abs(d.r - c.r) < size * 0.01) { dup = true; break; }
                            }
                            if (!dup && circles.length < 150) circles.push(c);
                        }
                    }
                }
            }
        }

        var m = size * 0.12;
        if (opts.gridlines) {
            var gl = 0;
            for (var gx in xs) {
                if (!xs.hasOwnProperty(gx) || gl > 80) continue;
                strokeLine(container, [[Number(gx), b[1] + m], [Number(gx), b[3] - m]], color, lw * 0.6).opacity = 45;
                gl++;
            }
            for (var gy in ys) {
                if (!ys.hasOwnProperty(gy) || gl > 160) continue;
                strokeLine(container, [[b[0] - m, Number(gy)], [b[2] + m, Number(gy)]], color, lw * 0.6).opacity = 45;
                gl++;
            }
            counts.gridlines = gl;
        }
        if (opts.circles) {
            for (var ci = 0; ci < circles.length; ci++) {
                var cc = circles[ci];
                dot(container, cc.x, cc.y, cc.r, null, color, lw * 0.8).opacity = 60;
            }
            counts.circles = circles.length;
        }
        if (opts.handles || opts.anchors) {
            var ar = Math.max(0.6, size * 0.006);
            for (var hp = 0; hp < paths.length; hp++) {
                var hpts = paths[hp].pathPoints;
                for (var h2 = 0; h2 < hpts.length && counts.anchors < 3000; h2++) {
                    var a = hpts[h2];
                    if (opts.handles) {
                        var dirs = [a.leftDirection, a.rightDirection];
                        for (var di = 0; di < 2; di++) {
                            var dd = dirs[di];
                            if (Math.abs(dd[0] - a.anchor[0]) + Math.abs(dd[1] - a.anchor[1]) < 0.01) continue;
                            strokeLine(container, [a.anchor, dd], color, lw * 0.7);
                            dot(container, dd[0], dd[1], ar * 0.7, color, null, 0);
                            counts.handles++;
                        }
                    }
                    if (opts.anchors) {
                        dot(container, a.anchor[0], a.anchor[1], ar, white, color, lw);
                        counts.anchors++;
                    }
                }
            }
        }
        if (opts.clearspace) {
            var x = Math.min(w, h) * 0.25;
            var r = container.pathItems.rectangle(b[1] + x, b[0] - x, w + 2 * x, h + 2 * x);
            r.filled = false;
            r.stroked = true;
            r.strokeColor = color;
            r.strokeWidth = lw;
            r.strokeDashes = [lw * 6, lw * 4];
            strokeLine(container, [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]], color, lw * 0.6, true);
        }
        return counts;
    }

    var GRID_LAYER = 'Logo Grid';

    // arg: { outlines, anchors, handles, gridlines, circles, clearspace, color }
    api.logoGrid = function (arg) {
        var doc = activeDocOrThrow();
        var sel = [];
        for (var i = 0; i < doc.selection.length; i++) sel.push(doc.selection[i]);
        if (!sel.length) throw new Error('Select your logo artwork first.');
        return withDocumentCoordinates(function () {
            var layer;
            try {
                layer = doc.layers.getByName(GRID_LAYER);
                layer.locked = false;
                layer.visible = true;
            } catch (e) {
                layer = doc.layers.add();
                layer.name = GRID_LAYER;
            }
            var group = layer.groupItems.add();
            group.name = 'Grid ' + (layer.groupItems.length);
            var counts = drawGrid(group, sel, arg || {});
            doc.selection = null;
            return counts;
        });
    };

    api.removeLogoGrids = function () {
        var doc = activeDocOrThrow();
        try {
            doc.layers.getByName(GRID_LAYER).remove();
            return true;
        } catch (e) {
            return false;
        }
    };

    // ---- logo export kit ----
    function isVectorFile(file) {
        var ext = String(file.name).split('.').pop().toLowerCase();
        return ext === 'svg' || ext === 'ai' || ext === 'eps' || ext === 'pdf';
    }

    function solidRgb(hex) {
        var rgb = B.hexToRgb(hex);
        var c = new RGBColor();
        c.red = rgb.r; c.green = rgb.g; c.blue = rgb.b;
        return c;
    }

    // Sets every fill and stroke inside `item` to one colour. Returns false if something
    // (an image, mesh, symbol...) could not be recoloured.
    function recolor(item, color) {
        var ok = true, i;
        switch (item.typename) {
            case 'GroupItem':
                for (i = 0; i < item.pageItems.length; i++) ok = recolor(item.pageItems[i], color) && ok;
                break;
            case 'CompoundPathItem':
                for (i = 0; i < item.pathItems.length; i++) ok = recolor(item.pathItems[i], color) && ok;
                break;
            case 'PathItem':
                if (item.clipping) break;
                if (item.filled) item.fillColor = color;
                if (item.stroked) item.strokeColor = color;
                break;
            case 'TextFrame':
                item.textRange.characterAttributes.fillColor = color;
                break;
            default:
                ok = false;
        }
        return ok;
    }

    function exportSvg(doc, path) {
        var o = new ExportOptionsSVG();
        o.embedRasterImages = true;
        o.fontType = SVGFontType.OUTLINEFONT;
        o.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
        o.documentEncoding = SVGDocumentEncoding.UTF8;
        o.coordinatePrecision = 3;
        doc.exportFile(new File(path), ExportType.SVG, o);
    }

    // A new document holding just the artwork, artboard trimmed to it.
    function logoDocument(file, color) {
        var doc = app.documents.add(DocumentColorSpace.RGB, 1000, 1000);
        var art = importArt(doc, file).item;
        var recolored = true;
        if (color) recolored = recolor(art, color);
        var b = art.visibleBounds;
        doc.artboards[0].artboardRect = [b[0], b[1], b[2], b[3]];
        return { doc: doc, art: art, recolored: recolored };
    }

    // Square or banner canvas with a background colour and the logo fitted into the middle.
    function canvasDocument(file, w, h, bgHex, logoColor, fill) {
        var doc = app.documents.add(DocumentColorSpace.RGB, w, h);
        var ab = doc.artboards[0].artboardRect;
        if (bgHex) {
            var bg = doc.pathItems.rectangle(ab[1], ab[0], w, h);
            bg.stroked = false;
            bg.filled = true;
            bg.fillColor = solidRgb(bgHex);
        }
        var art = importArt(doc, file).item;
        if (logoColor) recolor(art, logoColor);
        var bw = w * fill, bh = h * fill;
        var cx = (ab[0] + ab[2]) / 2, cy = (ab[1] + ab[3]) / 2;
        fitInto(art, { width: bw, height: bh, cx: cx, cy: cy }, false);
        return doc;
    }

    // arg: { dir, baseName, brand }
    api.exportLogoKit = function (arg) {
        var brand = arg.brand || {};
        var primary = B.normalizeHex(brand.colors && brand.colors.primary) || '#000000';
        var root = ensureFolder(arg.dir).fsName;
        var base = arg.baseName || 'logo';
        var files = [], warnings = [];
        var white = solidRgb('#FFFFFF');
        var variantColors = { color: null, black: solidRgb('#000000'), white: white, primary: solidRgb(primary) };
        var keys = ['full', 'mark', 'type'];
        var sourceFor = {};

        return withDocumentCoordinates(function () {
            for (var k = 0; k < keys.length; k++) {
                var key = keys[k];
                var p = brand.logos && brand.logos[key];
                if (!p) continue;
                var file = new File(p);
                if (!file.exists) {
                    warnings.push('logo.' + key + ' file not found: ' + p);
                    continue;
                }
                sourceFor[key] = file;
                var vector = isVectorFile(file);
                var rasterVariants = (brand.logoVariants && brand.logoVariants[key]) || {};
                var variants = ['color'];
                var kitColors = ['black', 'white', 'primary'];
                var supplied = function (variantName) {
                    if (variantName !== 'white' && variantName !== 'black') return null;
                    var sp = brand.logos && brand.logos[key + (variantName === 'white' ? 'White' : 'Black')];
                    return sp && new File(sp).exists ? new File(sp) : null;
                };
                for (var kc = 0; kc < kitColors.length; kc++) {
                    if (vector || rasterVariants[kitColors[kc]] || supplied(kitColors[kc])) variants.push(kitColors[kc]);
                }
                if (!vector) {
                    warnings.push('logo.' + key + ' is an image, so only PNG files were made' +
                        (variants.length > 1 ? ' (colour versions included).' : '. Use a transparent PNG or SVG for colour versions.') +
                        ' Use SVG or AI for SVG/EPS/PDF.');
                }
                for (var v = 0; v < variants.length; v++) {
                    var variant = variants[v];
                    var folder = ensureFolder(root + '/Logos/' + key + '/' + variant).fsName;
                    var name = folder + '/' + base + '-' + key + '-' + variant;
                    var own = supplied(variant);
                    var srcFile = own || (vector || variant === 'color' ? file : new File(rasterVariants[variant]));
                    var ld = logoDocument(srcFile, own ? null : (vector ? variantColors[variant] : null));
                    try {
                        if (!ld.recolored) warnings.push('Parts of logo.' + key + ' could not be recoloured (' + variant + ').');
                        var ab = ld.doc.artboards[0].artboardRect;
                        var w = Math.abs(ab[2] - ab[0]);
                        var widths = [500, 1000, 2000];
                        for (var s = 0; s < widths.length; s++) {
                            var png = new File(name + '-' + widths[s] + 'px.png');
                            ld.doc.exportFile(png, ExportType.PNG24, pngOptions(Math.min(widths[s] / w * 100, 776), true));
                            files.push(png.fsName);
                        }
                        if (vector) {
                            exportSvg(ld.doc, name + '.svg');
                            files.push(name + '.svg');
                            ld.doc.saveAs(new File(name + '.eps'), new EPSSaveOptions());
                            files.push(name + '.eps');
                            savePdf(ld.doc, name + '.pdf');
                            files.push(name + '.pdf');
                        }
                    } finally {
                        ld.doc.close(SaveOptions.DONOTSAVECHANGES);
                    }
                }
            }

            var iconKey = sourceFor.mark ? 'mark' : (sourceFor.full ? 'full' : 'type');
            var wideKey = sourceFor.full ? 'full' : (sourceFor.type ? 'type' : 'mark');
            var iconSource = sourceFor[iconKey];
            var wideSource = sourceFor[wideKey];
            function whiteVersion(k) {
                var own = brand.logos && brand.logos[k + 'White'];
                if (own && new File(own).exists) return new File(own);
                var lv = brand.logoVariants && brand.logoVariants[k];
                return lv && lv.white ? new File(lv.white) : null;
            }
            if (!iconSource) {
                warnings.push('No logo files chosen, so favicons and social images were skipped.');
                return { files: files, favicons: [], warnings: warnings };
            }

            // Favicons: transparent squares, 512 artboard exported at several sizes.
            var favFolder = ensureFolder(root + '/Favicons').fsName;
            var favicons = [];
            var favSizes = [[16, 'favicon-16.png'], [32, 'favicon-32.png'], [48, 'favicon-48.png'],
                [180, 'apple-touch-icon.png'], [192, 'android-chrome-192.png'], [512, 'android-chrome-512.png']];
            var fav = canvasDocument(iconSource, 512, 512, null, null, 0.86);
            try {
                for (var i = 0; i < favSizes.length; i++) {
                    var ff = new File(favFolder + '/' + favSizes[i][1]);
                    fav.exportFile(ff, ExportType.PNG24, pngOptions(favSizes[i][0] / 512 * 100, true));
                    favicons.push(ff.fsName);
                    files.push(ff.fsName);
                }
            } finally {
                fav.close(SaveOptions.DONOTSAVECHANGES);
            }

            // Social images in two styles:
            //   brand - brand colour background, logo in white (vector logos) or as-is (images)
            //   light - white background, logo in full colour
            var socialFolder = ensureFolder(root + '/Social').fsName;
            var social = [
                ['profile-400x400', 400, 400, iconSource, 0.78, iconKey],
                ['og-image-1200x630', 1200, 630, wideSource, 0.7, wideKey],
                ['banner-x-1500x500', 1500, 500, wideSource, 0.62, wideKey],
                ['banner-linkedin-1128x191', 1128, 191, wideSource, 0.72, wideKey],
                ['post-1080x1080', 1080, 1080, wideSource, 0.6, wideKey]
            ];
            var styles = [['brand', primary, true], ['light', '#FFFFFF', false]];
            for (var sIdx = 0; sIdx < social.length; sIdx++) {
                var spec = social[sIdx];
                for (var st = 0; st < styles.length; st++) {
                    var onBrand = styles[st][2];
                    var src = spec[3];
                    var logoColor = null;
                    if (onBrand && whiteVersion(spec[5])) src = whiteVersion(spec[5]);
                    else if (onBrand && isVectorFile(src)) logoColor = white;
                    var sd = canvasDocument(src, spec[1], spec[2], styles[st][1], logoColor, spec[4]);
                    try {
                        var sf = new File(socialFolder + '/' + spec[0] + '-' + styles[st][0] + '.png');
                        sd.exportFile(sf, ExportType.PNG24, pngOptions(100, false));
                        files.push(sf.fsName);
                    } finally {
                        sd.close(SaveOptions.DONOTSAVECHANGES);
                    }
                }
            }
            return { files: files, favicons: favicons, warnings: warnings };
        });
    };

    // ---- sample template: a 3-page tagged brand guideline to show the conventions ----
    function addGlobalSwatch(doc, name, r, g, b) {
        var spot = doc.spots.add();
        spot.name = name;
        spot.colorType = ColorModel.PROCESS;
        var c = new RGBColor();
        c.red = r; c.green = g; c.blue = b;
        spot.color = c;
        var sc = new SpotColor();
        sc.spot = spot;
        sc.tint = 100;
        return sc;
    }

    function addText(doc, contents, x, y, style, color, size) {
        var tf = doc.textFrames.pointText([x, y]);
        tf.contents = contents;
        style.applyTo(tf.textRange, true);
        if (color) tf.textRange.characterAttributes.fillColor = color;
        if (size) tf.textRange.characterAttributes.size = size;
        return tf;
    }

    function addRect(doc, top, left, w, h, fill, name) {
        var r = doc.pathItems.rectangle(top, left, w, h);
        if (fill) {
            r.filled = true;
            r.fillColor = fill;
        } else {
            r.filled = false;
        }
        r.stroked = !fill;
        if (!fill) {
            var gray = new RGBColor();
            gray.red = gray.green = gray.blue = 160;
            r.strokeColor = gray;
            r.strokeWidth = 2;
            r.strokeDashes = [12, 8];
        }
        if (name) r.name = name;
        return r;
    }

    // arg: { file, thumb }
    api.createSampleTemplate = function (arg) {
        var W = 1920, H = 1080, M = 120;
        var doc = app.documents.add(DocumentColorSpace.RGB, W, H, 3, DocumentArtboardLayout.Row, 100, 3);

        withDocumentCoordinates(function () {
            var primary = addGlobalSwatch(doc, 'Primary', 228, 87, 46);
            var secondary = addGlobalSwatch(doc, 'Secondary', 41, 51, 92);
            var accent = addGlobalSwatch(doc, 'Accent', 243, 167, 18);
            var white = new RGBColor();
            white.red = white.green = white.blue = 255;

            var heading = doc.paragraphStyles.add('Heading');
            heading.characterAttributes.size = 110;
            var body = doc.paragraphStyles.add('Body');
            body.characterAttributes.size = 32;

            var footer = '{{designer.name}}  |  {{designer.email}}  |  {{date}}';

            // Page 1 - cover
            var a1 = doc.artboards[0].artboardRect, L = a1[0], T = a1[1];
            addRect(doc, T, L, W, H, primary);
            addRect(doc, T - M, L + M, 420, 180, null, '{{logo.full}}');
            addText(doc, '{{brand.name}}', L + M, T - H / 2, heading, white);
            addText(doc, '{{brand.tagline}}', L + M, T - H / 2 - 80, body, white);
            addText(doc, footer, L + M, T - H + M, body, white, 20);

            // Page 2 - colour palette
            var a2 = doc.artboards[1].artboardRect;
            L = a2[0]; T = a2[1];
            addText(doc, 'Colour Palette', L + M, T - 2 * M, heading, secondary, 72);
            var swatchFills = [primary, secondary, accent];
            var roles = ['primary', 'secondary', 'accent'];
            var labels = ['Primary', 'Secondary', 'Accent'];
            for (var i = 0; i < 3; i++) {
                var x = L + M + i * 560;
                addRect(doc, T - 320, x, 480, 420, swatchFills[i]);
                addText(doc, labels[i], x, T - 800, body, secondary);
                addText(doc, 'HEX {{color.' + roles[i] + '.hex}}', x, T - 850, body, secondary, 22);
                addText(doc, 'RGB {{color.' + roles[i] + '.rgb}}', x, T - 885, body, secondary, 22);
                addText(doc, 'CMYK {{color.' + roles[i] + '.cmyk}}', x, T - 920, body, secondary, 22);
            }
            addText(doc, footer, L + M, T - H + M / 2, body, secondary, 20);

            // Page 3 - typography
            var a3 = doc.artboards[2].artboardRect;
            L = a3[0]; T = a3[1];
            addRect(doc, T - M, L + W - M - 200, 200, 200, null, '{{logo.mark}}');
            addText(doc, 'Typography', L + M, T - 2 * M, heading, secondary, 72);
            addText(doc, '{{font.heading}}', L + M, T - 420, body, primary, 28);
            addText(doc, 'Aa Bb Cc Dd Ee 0123', L + M, T - 540, heading, secondary);
            addText(doc, '{{font.body}}', L + M, T - 700, body, primary, 28);
            addText(doc, 'The quick brown fox jumps over the lazy dog.', L + M, T - 760, body, secondary);
            addText(doc, footer, L + M, T - H + M / 2, body, secondary, 20);
        });

        doc.saveAs(new File(arg.file), new IllustratorSaveOptions());
        if (arg.thumb) api.exportThumbnail({ file: arg.thumb, width: 600 });
        return api.scanActiveDocument();
    };
})(PortableStudio);
