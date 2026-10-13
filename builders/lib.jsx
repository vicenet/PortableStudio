// Shared helpers for PortableStudio template builders (Illustrator, ES3).
//   var B = $.global.PSBuilder({ width: 1920, height: 1080 });
//   B.page(function (p) { B.rect(p, 0, 0, 100, 100, B.primary()); });
//   return B.build($.global.PS_BUILD);
// Coordinates are page-relative with y pointing down (x, y from the artboard's top-left).
$.global.PSBuilder = function (opts) {
    var W = opts.width, H = opts.height;
    var B = { W: W, H: H, pages: [] };
    var doc, SW, STYLE;

    function rgb(r, g, b) { var c = new RGBColor(); c.red = r; c.green = g; c.blue = b; return c; }
    B.rgb = rgb;
    B.INK = rgb(20, 20, 22);
    B.PAPER = rgb(244, 242, 238);
    B.LINE = rgb(214, 211, 205);
    B.MUTED = rgb(110, 110, 114);
    B.WHITE = rgb(255, 255, 255);

    B.page = function (fn) { B.pages.push(fn); };
    B.primary = function () { return SW.primary; };
    B.secondary = function () { return SW.secondary; };
    B.accent = function () { return SW.accent; };
    B.doc = function () { return doc; };

    function globalSwatch(name, r, g, b) {
        var spot = doc.spots.add();
        spot.name = name;
        spot.colorType = ColorModel.PROCESS;
        spot.color = rgb(r, g, b);
        var sc = new SpotColor();
        sc.spot = spot;
        sc.tint = 100;
        return sc;
    }

    B.tint = function (spotColor, pct) {
        var c = new SpotColor();
        c.spot = spotColor.spot;
        c.tint = pct;
        return c;
    };

    function X(p, x) { return p.L + x; }
    function Y(p, y) { return p.T - y; }

    B.rect = function (p, x, y, w, h, fill, o) {
        o = o || {};
        var item = o.radius
            ? doc.pathItems.roundedRectangle(Y(p, y), X(p, x), w, h, o.radius, o.radius)
            : doc.pathItems.rectangle(Y(p, y), X(p, x), w, h);
        if (fill) { item.filled = true; item.fillColor = fill; } else { item.filled = false; }
        if (o.stroke) {
            item.stroked = true;
            item.strokeColor = o.stroke;
            item.strokeWidth = o.dash ? 2 : (o.strokeWidth || 1.5);
            if (o.dash) item.strokeDashes = [10, 8];
        } else {
            item.stroked = false;
        }
        if (o.opacity) item.opacity = o.opacity;
        return item;
    };

    B.ellipse = function (p, x, y, w, h, fill, o) {
        var e = doc.pathItems.ellipse(Y(p, y), X(p, x), w, h);
        e.filled = !!fill;
        if (fill) e.fillColor = fill;
        e.stroked = !!(o && o.stroke);
        if (o && o.stroke) { e.strokeColor = o.stroke; e.strokeWidth = o.strokeWidth || 2; }
        if (o && o.opacity) e.opacity = o.opacity;
        return e;
    };

    function styleText(tf, style, size, color, leading) {
        STYLE[style].applyTo(tf.textRange, true);
        var ca = tf.textRange.characterAttributes;
        ca.size = size;
        ca.fillColor = color;
        if (leading) { ca.autoLeading = false; ca.leading = leading; }
    }

    B.text = function (p, x, y, str, style, size, color, o) {
        var tf = doc.textFrames.pointText([X(p, x), Y(p, y)]);
        tf.contents = str;
        styleText(tf, style, size, color);
        if (o && o.justify) {
            tf.textRange.paragraphAttributes.justification = o.justify === 'center' ? Justification.CENTER : Justification.RIGHT;
        }
        if (o && o.tracking) tf.textRange.characterAttributes.tracking = o.tracking;
        return tf;
    };

    B.area = function (p, x, y, w, h, str, style, size, color, leading, o) {
        var box = doc.pathItems.rectangle(Y(p, y), X(p, x), w, h);
        var tf = doc.textFrames.areaText(box);
        tf.contents = str;
        styleText(tf, style, size, color, leading);
        if (o && o.justify) {
            tf.textRange.paragraphAttributes.justification = o.justify === 'center' ? Justification.CENTER : Justification.RIGHT;
        }
        return tf;
    };

    // One area-text box with several differently styled paragraphs, so later paragraphs flow
    // right after earlier ones whatever their length. parts: [{ text, style, size, color, leading, spaceAfter }]
    B.areaRich = function (p, x, y, w, h, parts) {
        var box = doc.pathItems.rectangle(Y(p, y), X(p, x), w, h);
        var tf = doc.textFrames.areaText(box);
        var texts = [];
        for (var i = 0; i < parts.length; i++) texts.push(parts[i].text);
        tf.contents = texts.join('\r');
        for (var j = 0; j < parts.length; j++) {
            var part = parts[j];
            var para = tf.paragraphs[j];
            STYLE[part.style].applyTo(para, true);
            var ca = para.characterAttributes;
            ca.size = part.size;
            ca.fillColor = part.color;
            if (part.leading) { ca.autoLeading = false; ca.leading = part.leading; }
            if (part.spaceAfter) para.paragraphAttributes.spaceAfter = part.spaceAfter;
        }
        return tf;
    };

    // Empty dashed box named with a tag, e.g. 'logo.full|white' or 'image.photo1|cover'.
    B.ph = function (p, x, y, w, h, tag) {
        var r = B.rect(p, x, y, w, h, null, { stroke: B.LINE, dash: true });
        r.name = '{{' + tag + '}}';
        return r;
    };

    B.gradientRect = function (p, x, y, w, h, c1, c2, o) {
        var g = doc.gradients.add();
        g.type = GradientType.LINEAR;
        g.gradientStops[0].color = c1;
        g.gradientStops[1].color = c2;
        var gc = new GradientColor();
        gc.gradient = g;
        var r = B.rect(p, x, y, w, h, null, o);
        r.filled = true;
        r.fillColor = gc;
        return r;
    };

    // Quarter circle of radius s centred on one corner of the cell (0 TL, 1 TR, 2 BR, 3 BL).
    B.quarter = function (p, x, y, s, col, corner) {
        var cx = [x, x + s, x + s, x][corner], cy = [y, y, y + s, y + s][corner];
        var start = [0, 90, 180, 270][corner];
        var pts = [[X(p, cx), Y(p, cy)]];
        for (var i = 0; i <= 16; i++) {
            var a = (start + 90 * i / 16) * Math.PI / 180;
            pts.push([X(p, cx + Math.cos(a) * s), Y(p, cy + Math.sin(a) * s)]);
        }
        var path = doc.pathItems.add();
        path.setEntirePath(pts);
        path.closed = true;
        path.filled = true;
        path.fillColor = col;
        path.stroked = false;
        return path;
    };

    // Geometric pattern in brand colours (circles, quarter circles, rounded squares).
    B.pattern = function (p, x, y, w, h, size, palette, opacity) {
        var cols = Math.floor(w / size), rows = Math.floor(h / size);
        var group = doc.groupItems.add();
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var k = (r * 7 + c * 3) % 5;
                var px = x + c * size, py = y + r * size;
                var col = palette[(r + c) % palette.length];
                var item;
                if (k === 0 || k === 3) item = B.ellipse(p, px + 8, py + 8, size - 16, size - 16, col);
                else if (k === 1) item = B.rect(p, px + 8, py + 8, size - 16, size - 16, col, { radius: 18 });
                else if (k === 2) item = B.quarter(p, px + 8, py + 8, size - 16, col, (r + c) % 4);
                else item = B.rect(p, px + size * 0.3, py + size * 0.3, size * 0.4, size * 0.4, col, { radius: size * 0.2 });
                item.move(group, ElementPlacement.PLACEATEND);
            }
        }
        if (opacity) group.opacity = opacity;
        return group;
    };

    // cfg: { file, thumb, columns, gap }
    B.build = function (cfg) {
        cfg = cfg || {};
        var prevCS = app.coordinateSystem;
        app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
        doc = app.documents.add(DocumentColorSpace.RGB, W, H, B.pages.length, DocumentArtboardLayout.GridByRow, cfg.gap || 100, cfg.columns || 6);
        SW = {
            primary: globalSwatch('Primary', 46, 52, 140),
            secondary: globalSwatch('Secondary', 30, 30, 36),
            accent: globalSwatch('Accent', 255, 140, 66)
        };
        STYLE = { Heading: doc.paragraphStyles.add('Heading'), Body: doc.paragraphStyles.add('Body') };
        try { STYLE.Heading.characterAttributes.textFont = app.textFonts.getByName('Arial-BoldMT'); } catch (e) { /* default */ }
        try { STYLE.Body.characterAttributes.textFont = app.textFonts.getByName('ArialMT'); } catch (e2) { /* default */ }
        STYLE.Heading.paragraphAttributes.hyphenation = false;
        STYLE.Body.paragraphAttributes.hyphenation = false;
        for (var i = 0; i < B.pages.length; i++) {
            var r = doc.artboards[i].artboardRect;
            doc.artboards[i].name = (cfg.pageName || 'Page') + ' ' + (i < 9 ? '0' : '') + (i + 1);
            B.pages[i]({ L: r[0], T: r[1], n: i + 1 });
        }
        app.coordinateSystem = prevCS;
        if (cfg.file) doc.saveAs(new File(cfg.file), new IllustratorSaveOptions());
        if (cfg.thumb) {
            doc.artboards.setActiveArtboardIndex(0);
            var o = new ExportOptionsPNG24();
            o.artBoardClipping = true;
            o.horizontalScale = o.verticalScale = 600 / W * 100;
            doc.exportFile(new File(cfg.thumb), ExportType.PNG24, o);
        }
        return 'built ' + B.pages.length + ' pages';
    };

    return B;
};
