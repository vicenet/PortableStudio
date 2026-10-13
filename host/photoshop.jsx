// Photoshop implementation of the PortableStudio host API.
//
// Template conventions (see docs/TEMPLATE-GUIDE.md), all by LAYER NAME:
//   {{brand.name|heading|primary}}  text layer: content, optional font role and colour role
//   {{color.primary}}               Solid Color fill layer, recoloured
//   {{logo.mark}}                   any layer: the logo is placed and fitted into its bounds
//   {{logo.mark|replace}}           smart object: contents replaced (keeps mockup warps/effects)
// Text layers whose content contains {{tags}} are also filled in.

(function (PS) {
    var api = PS.api;
    var B = PS.brand;
    var U = PS.util;

    function cTID(s) { return app.charIDToTypeID(s); }
    function sTID(s) { return app.stringIDToTypeID(s); }

    function withPixels(fn) {
        var prev = app.preferences.rulerUnits;
        app.preferences.rulerUnits = Units.PIXELS;
        try {
            return fn();
        } finally {
            app.preferences.rulerUnits = prev;
        }
    }

    function activeDocOrThrow() {
        if (app.documents.length === 0) throw new Error('Open your template design first.');
        return app.activeDocument;
    }

    function walkLayers(container, out) {
        var layers = container.layers;
        for (var i = 0; i < layers.length; i++) {
            out.push(layers[i]);
            if (layers[i].typename === 'LayerSet') walkLayers(layers[i], out);
        }
        return out;
    }

    function solidColor(hex) {
        var c = new SolidColor();
        c.rgb.hexValue = B.normalizeHex(hex).substring(1);
        return c;
    }

    function rgbDescriptor(hex) {
        var rgb = B.hexToRgb(hex);
        var d = new ActionDescriptor();
        d.putDouble(cTID('Rd  '), rgb.r);
        d.putDouble(cTID('Grn '), rgb.g);
        d.putDouble(cTID('Bl  '), rgb.b);
        return d;
    }

    function layerBounds(layer) {
        var b = layer.bounds; // [left, top, right, bottom] as UnitValues
        var l = b[0].as('px'), t = b[1].as('px'), r = b[2].as('px'), bt = b[3].as('px');
        return { left: l, top: t, width: r - l, height: bt - t, cx: (l + r) / 2, cy: (t + bt) / 2 };
    }

    // ---- text layers ----
    function applyText(layer, tag, values, brand, report) {
        var ti = layer.textItem;
        if (tag && B.has(values, tag.key)) {
            ti.contents = values[tag.key];
            report.textReplaced++;
        } else if (String(ti.contents).indexOf('{{') >= 0) {
            var r = B.replaceTags(ti.contents, values);
            if (r.changed) {
                ti.contents = r.text;
                report.textReplaced++;
            }
            U.addUnique(report.unfilledTags, r.unfilled);
        } else if (tag && !B.isAssetKey(tag.key)) {
            U.addUnique(report.unfilledTags, [tag.key]);
        }
        if (!tag) return;
        for (var i = 0; i < tag.mods.length; i++) {
            var mod = tag.mods[i];
            if (B.contains(B.FONT_ROLES, mod)) {
                var f = brand.fonts && brand.fonts[mod];
                if (f && f.ps) {
                    try {
                        ti.font = f.ps;
                        U.addUnique(report.fonts, [mod]);
                    } catch (e) {
                        report.warnings.push('Font "' + (f.name || f.ps) + '" could not be applied to "' + layer.name + '".');
                    }
                }
            } else if (B.contains(B.COLOR_ROLES, mod)) {
                var hex = B.normalizeHex(brand.colors && brand.colors[mod]);
                if (hex) ti.color = solidColor(hex);
            }
        }
    }

    // ---- colour fill layers ----
    function applyFillColor(doc, layer, hex) {
        doc.activeLayer = layer;
        var d = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(sTID('contentLayer'), cTID('Ordn'), cTID('Trgt'));
        d.putReference(cTID('null'), ref);
        var fill = new ActionDescriptor();
        fill.putObject(cTID('Clr '), cTID('RGBC'), rgbDescriptor(hex));
        d.putObject(cTID('T   '), sTID('solidColorLayer'), fill);
        executeAction(cTID('setd'), d, DialogModes.NO);
    }

    // ---- logos / images ----
    function placeFile(file) {
        var d = new ActionDescriptor();
        d.putPath(cTID('null'), file);
        d.putEnumerated(cTID('FTcs'), cTID('QCSt'), cTID('Qcsa'));
        var off = new ActionDescriptor();
        off.putUnitDouble(cTID('Hrzn'), cTID('#Pxl'), 0);
        off.putUnitDouble(cTID('Vrtc'), cTID('#Pxl'), 0);
        d.putObject(cTID('Ofst'), cTID('Ofst'), off);
        executeAction(cTID('Plc '), d, DialogModes.NO);
    }

    function replaceSmartObject(file) {
        var d = new ActionDescriptor();
        d.putPath(cTID('null'), file);
        executeAction(sTID('placedLayerReplaceContents'), d, DialogModes.NO);
    }

    function applyAsset(doc, layer, tag, brand, report) {
        var path = B.assetPath(brand, tag.key);
        if (!path) {
            report.warnings.push('No file chosen for ' + tag.key + '; placeholder left in place.');
            return;
        }
        var file = new File(path);
        if (!file.exists) {
            report.warnings.push(tag.key + ' file not found: ' + path);
            return;
        }
        doc.activeLayer = layer;
        if (B.contains(tag.mods, 'replace')) {
            if (layer.kind != LayerKind.SMARTOBJECT) {
                report.warnings.push('"' + layer.name + '" uses |replace but is not a smart object.');
                return;
            }
            replaceSmartObject(file);
            report.assets.push(tag.key);
            return;
        }
        var target = layerBounds(layer);
        placeFile(file); // lands directly above the placeholder
        var placed = doc.activeLayer;
        var pb = layerBounds(placed);
        if (pb.width > 0 && pb.height > 0) {
            var sx = target.width / pb.width, sy = target.height / pb.height;
            var s = (B.contains(tag.mods, 'cover') ? Math.max(sx, sy) : Math.min(sx, sy)) * 100;
            placed.resize(s, s, AnchorPosition.MIDDLECENTER);
            pb = layerBounds(placed);
            placed.translate(target.cx - pb.cx, target.cy - pb.cy);
        }
        placed.name = tag.key;
        layer.remove();
        report.assets.push(tag.key);
    }

    // Artboards are top-level layer groups with artboardEnabled; returned in reading order.
    function artboardRects(doc) {
        var out = [];
        for (var i = 0; i < doc.layerSets.length; i++) {
            var ls = doc.layerSets[i];
            var ref = new ActionReference();
            ref.putIdentifier(cTID('Lyr '), ls.id);
            var d = executeActionGet(ref);
            if (!d.hasKey(sTID('artboardEnabled')) || !d.getBoolean(sTID('artboardEnabled'))) continue;
            var r = d.getObjectValue(sTID('artboard')).getObjectValue(sTID('artboardRect'));
            out.push({
                name: ls.name,
                left: r.getDouble(sTID('left')), top: r.getDouble(sTID('top')),
                right: r.getDouble(sTID('right')), bottom: r.getDouble(sTID('bottom'))
            });
        }
        out.sort(function (a, b) {
            return Math.abs(a.top - b.top) > 1 ? a.top - b.top : a.left - b.left;
        });
        return out;
    }

    function pad2(n) {
        return (n < 10 ? '0' : '') + n;
    }

    // One PNG per artboard (carousel slides); a single PNG when the document has no artboards.
    function exportPages(doc, dir, base) {
        var folder = new Folder(dir);
        if (!folder.exists) folder.create();
        var rects = artboardRects(doc);
        var files = [];
        if (!rects.length) {
            var single = new File(folder.fsName + '/' + base + '-01.png');
            doc.saveAs(single, new PNGSaveOptions(), true, Extension.LOWERCASE);
            return [single.fsName];
        }
        for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            var dup = doc.duplicate(base + '-' + pad2(i + 1), false);
            try {
                dup.crop([UnitValue(r.left, 'px'), UnitValue(r.top, 'px'), UnitValue(r.right, 'px'), UnitValue(r.bottom, 'px')]);
                var f = new File(folder.fsName + '/' + base + '-' + pad2(i + 1) + '.png');
                dup.saveAs(f, new PNGSaveOptions(), true, Extension.LOWERCASE);
                files.push(f.fsName);
            } finally {
                dup.close(SaveOptions.DONOTSAVECHANGES);
            }
        }
        app.activeDocument = doc;
        return files;
    }

    // arg: { workFile, pngFile, pagesDir, pagesBase, brand }
    api.applyTemplate = function (arg) {
        var work = U.fileOrThrow(arg.workFile, 'Working copy');
        var brand = arg.brand || {};
        var report = U.newReport();
        var values = B.buildValues(brand);
        var outputs = { source: work.fsName };

        withPixels(function () {
            var doc = app.open(work);
            var layers = walkLayers(doc, []);
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.typename !== 'ArtLayer') continue;
                var tag = B.parseTag(layer.name);
                try {
                    if (layer.kind == LayerKind.TEXT) {
                        applyText(layer, tag, values, brand, report);
                    } else if (!tag) {
                        continue;
                    } else if (tag.key.indexOf('color.') === 0) {
                        var role = tag.key.split('.')[1];
                        var hex = B.normalizeHex(brand.colors && brand.colors[role]);
                        if (!hex) continue;
                        if (layer.kind != LayerKind.SOLIDFILL) {
                            report.warnings.push('"' + layer.name + '" must be a Solid Color fill layer to be recoloured.');
                            continue;
                        }
                        applyFillColor(doc, layer, hex);
                        U.addUnique(report.colors, [role]);
                    } else if (B.isAssetKey(tag.key)) {
                        applyAsset(doc, layer, tag, brand, report);
                    }
                } catch (e) {
                    report.warnings.push('Could not update layer "' + layer.name + '": ' + e.message);
                }
            }
            doc.save();
            if (arg.pagesDir) {
                outputs.pages = exportPages(doc, arg.pagesDir, arg.pagesBase || 'page');
            }
            if (arg.pngFile) {
                doc.saveAs(new File(arg.pngFile), new PNGSaveOptions(), true, Extension.LOWERCASE);
                outputs.png = new File(arg.pngFile).fsName;
            }
        });
        return { outputs: outputs, report: report };
    };

    api.listFonts = function () {
        var out = [];
        var fonts = app.fonts;
        for (var i = 0; i < fonts.length; i++) {
            try {
                out.push({ ps: fonts[i].postScriptName, name: fonts[i].name, family: fonts[i].family });
            } catch (e) { /* skip unreadable font */ }
        }
        return out;
    };

    api.scanActiveDocument = function () {
        var doc = activeDocOrThrow();
        var file = null;
        try { file = doc.fullName.fsName; } catch (e) { /* never saved */ }

        var tags = [], placeholders = [], colorRoles = [], fontStyles = [], warnings = [];

        withPixels(function () {
            var layers = walkLayers(doc, []);
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.typename !== 'ArtLayer') continue;
                var tag = B.parseTag(layer.name);
                if (layer.kind == LayerKind.TEXT) {
                    var found = B.findTags(layer.textItem.contents);
                    for (var j = 0; j < found.length; j++) U.addUnique(tags, [found[j].key]);
                }
                if (!tag) continue;
                if (B.isAssetKey(tag.key)) {
                    U.addUnique(placeholders, [tag.key]);
                    if (B.contains(tag.mods, 'replace') && layer.kind != LayerKind.SMARTOBJECT) {
                        warnings.push('"' + layer.name + '" uses |replace but is not a smart object.');
                    }
                } else if (tag.key.indexOf('color.') === 0) {
                    U.addUnique(colorRoles, [tag.key.split('.')[1]]);
                    if (layer.kind != LayerKind.SOLIDFILL) {
                        warnings.push('"' + layer.name + '" must be a Solid Color fill layer (Layer > New Fill Layer > Solid Color).');
                    }
                } else {
                    U.addUnique(tags, [tag.key]);
                }
                for (var m = 0; m < tag.mods.length; m++) {
                    if (B.contains(B.FONT_ROLES, tag.mods[m])) U.addUnique(fontStyles, [tag.mods[m]]);
                }
            }
        });

        if (!file) warnings.push('Save the document to disk first (File > Save As .psd).');
        else if (!doc.saved) warnings.push('The document has unsaved changes; they will be saved when you add it.');
        if (tags.length === 0 && placeholders.length === 0 && colorRoles.length === 0) {
            warnings.push('No tagged layers found - nothing would change when generating.');
        }

        return {
            app: 'photoshop',
            file: file,
            ext: file ? ('.' + String(file).split('.').pop().toLowerCase()) : '.psd',
            saved: doc.saved,
            pages: 1,
            width: Math.round(doc.width.as('px')),
            height: Math.round(doc.height.as('px')),
            tags: tags,
            placeholders: placeholders,
            colorRoles: colorRoles,
            fontStyles: fontStyles,
            warnings: warnings
        };
    };

    api.saveActive = function () {
        var doc = activeDocOrThrow();
        try { doc.fullName.fsName; } catch (e) { throw new Error('Save the document to disk first (File > Save As .psd).'); }
        if (!doc.saved) doc.save();
        return doc.fullName.fsName;
    };

    // arg: { file, width }
    api.exportThumbnail = function (arg) {
        var doc = activeDocOrThrow();
        withPixels(function () {
            var dup = doc.duplicate('PortableStudio thumbnail', true);
            try {
                var w = dup.width.as('px'), h = dup.height.as('px');
                var tw = arg.width || 600;
                dup.resizeImage(UnitValue(tw, 'px'), UnitValue(Math.round(h * tw / w), 'px'), undefined, ResampleMethod.BICUBIC);
                dup.saveAs(new File(arg.file), new PNGSaveOptions(), true, Extension.LOWERCASE);
            } finally {
                dup.close(SaveOptions.DONOTSAVECHANGES);
                app.activeDocument = doc;
            }
        });
        return arg.file;
    };

    // ---- sample template: a tagged 1080x1350 social post ----
    function makeFillLayer(doc, name, hex, rect) {
        if (rect) doc.selection.select(rect);
        var d = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putClass(sTID('contentLayer'));
        d.putReference(cTID('null'), ref);
        var layerDesc = new ActionDescriptor();
        var solid = new ActionDescriptor();
        solid.putObject(cTID('Clr '), cTID('RGBC'), rgbDescriptor(hex));
        layerDesc.putObject(cTID('Type'), sTID('solidColorLayer'), solid);
        d.putObject(cTID('Usng'), sTID('contentLayer'), layerDesc);
        executeAction(cTID('Mk  '), d, DialogModes.NO);
        doc.activeLayer.name = name;
        try { doc.selection.deselect(); } catch (e) { /* nothing selected */ }
    }

    function makeText(doc, contents, x, y, size, hex, name) {
        var layer = doc.artLayers.add();
        layer.kind = LayerKind.TEXT;
        var ti = layer.textItem;
        ti.contents = contents;
        ti.size = size;
        ti.justification = Justification.CENTER;
        ti.position = [UnitValue(x, 'px'), UnitValue(y, 'px')];
        ti.color = solidColor(hex);
        layer.name = name;
    }

    // arg: { file, thumb }
    api.createSampleTemplate = function (arg) {
        withPixels(function () {
            var doc = app.documents.add(UnitValue(1080, 'px'), UnitValue(1350, 'px'), 72,
                'PortableStudio Sample', NewDocumentMode.RGB, DocumentFill.WHITE);

            makeFillLayer(doc, '{{color.primary}}', '#E4572E');
            makeFillLayer(doc, '{{color.accent}}', '#F3A712', [[0, 1180], [1080, 1180], [1080, 1350], [0, 1350]]);

            var logo = doc.artLayers.add();
            doc.selection.select([[390, 280], [690, 280], [690, 580], [390, 580]]);
            doc.selection.fill(solidColor('#FFFFFF'), ColorBlendMode.NORMAL, 35);
            doc.selection.deselect();
            doc.activeLayer = logo;
            executeAction(sTID('newPlacedLayer'), undefined, DialogModes.NO);
            doc.activeLayer.name = '{{logo.mark}}';

            makeText(doc, '{{brand.name}}', 540, 780, 96, '#FFFFFF', '{{brand.name|heading}}');
            makeText(doc, '{{brand.tagline}}', 540, 860, 40, '#FFFFFF', '{{brand.tagline|body}}');
            makeText(doc, '{{brand.website}}', 540, 1280, 32, '#29335C', '{{brand.website|body|secondary}}');

            doc.saveAs(new File(arg.file), new PhotoshopSaveOptions(), false, Extension.LOWERCASE);
        });
        if (arg.thumb) api.exportThumbnail({ file: arg.thumb, width: 600 });
        return api.scanActiveDocument();
    };
})(PortableStudio);
