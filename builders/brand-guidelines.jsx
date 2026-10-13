// Builds PortableStudio's "Essential Brand Guidelines" template (42 pages, 1920x1080) in Illustrator.
// Every brand-specific element is tagged, so Generate / Update fill it. Run with:
//   $.global.PS_BUILD = { file: '<path>/template.ai', thumb: '<path>/thumbnail.png' };
//   $.evalFile('<root>/builders/brand-guidelines.jsx');
(function () {
    var cfg = $.global.PS_BUILD || {};
    var W = 1920, H = 1080, M = 120;

    // ---------- colours ----------
    function rgb(r, g, b) { var c = new RGBColor(); c.red = r; c.green = g; c.blue = b; return c; }
    var INK = rgb(20, 20, 22), PAPER = rgb(244, 242, 238), LINE = rgb(214, 211, 205), MUTED = rgb(110, 110, 114), WHITE = rgb(255, 255, 255);

    var PAGES = [];
    function page(fn) { PAGES.push(fn); }

    // ---------- page list ----------
    page(cover);
    page(function (p) { contentPage(p, 'Introduction', 'Welcome');
        titleBlock(p, 'Welcome', 'This guide explains how the {{brand.name}} identity works and how to use it with confidence. Keep it close whenever you create something for the brand.');
        area(p, 760, 220, 1040, 360, '{{copy.headline}}', 'Heading', 76, INK, 88);
        area(p, 760, 640, 900, 300, '{{copy.about}}', 'Body', 26, MUTED, 40);
    });
    page(contents);
    page(divider('01', 'Brand Overview'));
    page(function (p) { contentPage(p, 'Brand Overview', 'Who we are');
        titleBlock(p, 'Who we are', 'The ideas below sit behind every design decision. Read them before you start.');
        var cols = [['Mission', '{{copy.mission}}'], ['Promise', '{{copy.subheadline}}'], ['Story', '{{copy.about}}']];
        for (var i = 0; i < 3; i++) {
            var x = 760 + i * 360;
            rect(p, x, 230, 320, 6, accent());
            text(p, x, 300, '0' + (i + 1), 'Heading', 28, accent());
            text(p, x, 360, cols[i][0], 'Heading', 40, INK);
            area(p, x, 400, 310, 230, cols[i][1], 'Body', 22, MUTED, 34);
        }
        rect(p, 760, 680, 1040, 240, primary(), { radius: 24 });
        area(p, 820, 730, 920, 150, '{{copy.headline}}', 'Heading', 46, WHITE, 56);
    });
    page(function (p) { contentPage(p, 'Brand Overview', 'Values');
        titleBlock(p, 'Our values', 'Four words that guide how we behave, write and design.');
        for (var i = 0; i < 4; i++) {
            var x = 760 + (i % 2) * 530, y = 220 + Math.floor(i / 2) * 360;
            rect(p, x, y, 500, 330, PAPER, { radius: 24 });
            text(p, x + 40, y + 80, '0' + (i + 1), 'Body', 20, accent());
            area(p, x + 40, y + 140, 420, 160, '{{copy.value' + (i + 1) + '}}', 'Heading', 52, INK, 60);
        }
    });
    page(function (p) { contentPage(p, 'Brand Overview', 'Voice');
        titleBlock(p, 'Tone of voice', 'How we sound in every headline, caption and conversation.');
        rect(p, 760, 220, 1040, 700, primary(), { radius: 28 });
        text(p, 820, 330, '"', 'Heading', 160, accent());
        area(p, 820, 380, 900, 480, '{{copy.voice}}', 'Heading', 48, WHITE, 62);
    });

    page(divider('02', 'Logo'));
    page(logoShowcase('Logomark', 'Our symbol. Use it on its own where space is tight or the brand is already clear, such as app icons and social avatars.', 'logo.mark', PAPER, ''));
    page(logoShowcase('Logotype', 'Our name, set as a fixed piece of artwork. Never retype it in a font.', 'logo.type', PAPER, ''));
    page(logoShowcase('Construction', 'The symbol is built from simple geometry. Outlines, anchor points and circles show how its curves fit together.', 'logo.mark', WHITE, 'grid', true));
    page(logoShowcase('Primary logo', 'The full logo is our first choice for every layout. Give it room and place it on clean backgrounds.', 'logo.full', WHITE, '', true));
    page(logoShowcase('On brand colour', 'On our primary colour the logo reverses to white.', 'logo.full', null, 'white'));
    page(logoShowcase('On dark', 'On dark or photographic backgrounds use the white logo for maximum contrast.', 'logo.full', INK, 'white'));
    page(function (p) { contentPage(p, 'Logo', 'Variations');
        titleBlock(p, 'Variations', 'Choose the version with the strongest contrast against its background.');
        var tiles = [[WHITE, '', 'Full colour', true], [PAPER, '|black', 'Black'], [primary(), '|white', 'Reversed'], [WHITE, '|primary', 'One colour', true]];
        for (var i = 0; i < 4; i++) {
            var x = 760 + (i % 2) * 530, y = 200 + Math.floor(i / 2) * 370;
            rect(p, x, y, 500, 300, tiles[i][0], { radius: 18, stroke: tiles[i][3] ? LINE : null });
            ph(p, x + 110, y + 50, 280, 200, 'logo.full' + tiles[i][1]);
            text(p, x, y + 340, tiles[i][2], 'Body', 18, MUTED);
        }
    });
    page(function (p) { contentPage(p, 'Logo', 'Minimum size');
        titleBlock(p, 'Minimum size', 'Below these sizes details are lost. Use the logomark instead when space is smaller.');
        var sizes = [[480, 'Print 40 mm / Digital 240 px'], [300, 'Print 25 mm / Digital 140 px'], [160, 'Print 15 mm / Digital 80 px']];
        var x = 760;
        for (var i = 0; i < 3; i++) {
            ph(p, x, 560 - sizes[i][0] * 0.6, sizes[i][0], sizes[i][0] * 0.6, 'logo.full');
            text(p, x, 640, sizes[i][1], 'Body', 18, MUTED);
            x += sizes[i][0] + 60;
        }
        rect(p, 760, 700, 1040, 1, LINE);
        ph(p, 760, 760, 120, 120, 'logo.mark');
        text(p, 920, 830, 'Logomark minimum: 32 px / 8 mm', 'Body', 18, MUTED);
    });
    page(function (p) { contentPage(p, 'Logo', 'Clearspace');
        titleBlock(p, 'Clearspace', 'Keep this space around the logo free of text and graphics. X equals the height of the logomark.');
        rect(p, 760, 220, 1040, 700, PAPER, { radius: 28 });
        rect(p, 990, 330, 580, 460, null, { stroke: accent(), dash: true });
        ph(p, 1070, 410, 420, 300, 'logo.full');
        var marks = [[1280, 380, 'X'], [1280, 770, 'X'], [1030, 575, 'X'], [1530, 575, 'X']];
        for (var i = 0; i < marks.length; i++) text(p, marks[i][0], marks[i][1], marks[i][2], 'Heading', 26, accent(), { justify: 'center' });
    });
    page(function (p) { contentPage(p, 'Logo', 'Backgrounds');
        titleBlock(p, 'Backgrounds', 'The logo can sit on any brand colour as long as it stays clear and readable.');
        var bgs = [[WHITE, '', true], [PAPER, ''], [primary(), '|white'], [secondary(), '|white'], [accent(), '|white'], [INK, '|white']];
        for (var i = 0; i < 6; i++) {
            var x = 760 + (i % 3) * 350, y = 220 + Math.floor(i / 3) * 360;
            rect(p, x, y, 330, 330, bgs[i][0], { radius: 18, stroke: bgs[i][2] ? LINE : null });
            ph(p, x + 65, y + 75, 200, 180, 'logo.full' + bgs[i][1]);
        }
    });
    page(function (p) { contentPage(p, 'Logo', 'Misuse');
        titleBlock(p, 'Please don\'t', 'Protect the logo. Always use the supplied artwork and never alter it.');
        var dont = [['|stretch', 'Don\'t stretch or squash'], ['|rotate', 'Don\'t rotate'], ['|flipx', 'Don\'t mirror'],
            ['|faded', 'Don\'t lower the opacity'], ['|accent', 'Don\'t recolour'], ['', 'Don\'t place on busy backgrounds']];
        for (var i = 0; i < 6; i++) {
            var x = 760 + (i % 3) * 350, y = 200 + Math.floor(i / 3) * 370;
            rect(p, x, y, 330, 280, PAPER, { radius: 18 });
            if (i === 5) busyPattern(p, x, y, 330, 280);
            ph(p, x + 75, y + 55, 180, 170, 'logo.full' + dont[i][0]);
            ellipse(p, x + 286, y + 14, 30, 30, rgb(214, 48, 49));
            text(p, x + 301, y + 36, 'x', 'Heading', 20, WHITE, { justify: 'center' });
            text(p, x, y + 320, dont[i][1], 'Body', 18, MUTED);
        }
    });

    page(divider('03', 'Colour'));
    page(function (p) { contentPage(p, 'Colour', 'Palette');
        titleBlock(p, 'Colour palette', 'Our colours are a big part of how people recognise us. Use the values below for exact matches.');
        var roles = [['Primary', 'primary', primary(), 470], ['Secondary', 'secondary', secondary(), 270], ['Accent', 'accent', accent(), 270]];
        var x = 760;
        for (var i = 0; i < 3; i++) {
            rect(p, x, 220, roles[i][3], 470, roles[i][2], { radius: 22 });
            text(p, x, 750, roles[i][0], 'Heading', 30, INK);
            text(p, x, 800, 'HEX  {{color.' + roles[i][1] + '.hex}}', 'Body', 18, MUTED);
            text(p, x, 835, 'RGB  {{color.' + roles[i][1] + '.rgb}}', 'Body', 18, MUTED);
            text(p, x, 870, 'CMYK  {{color.' + roles[i][1] + '.cmyk}}', 'Body', 18, MUTED);
            x += roles[i][3] + 35;
        }
    });
    page(function (p) { contentPage(p, 'Colour', 'Tints');
        titleBlock(p, 'Tints', 'Lighter tints extend the palette for backgrounds, charts and illustrations.');
        var roles = [['Primary', primary()], ['Secondary', secondary()], ['Accent', accent()]];
        var steps = [100, 80, 60, 40, 20];
        for (var r = 0; r < 3; r++) {
            text(p, 760, 260 + r * 240, roles[r][0], 'Body', 18, MUTED);
            for (var s = 0; s < 5; s++) {
                var c = tint(roles[r][1], steps[s]);
                rect(p, 760 + s * 208, 280 + r * 240, 196, 150, c, { radius: 14 });
                text(p, 760 + s * 208, 460 + r * 240, steps[s] + '%', 'Body', 16, MUTED);
            }
        }
    });
    page(function (p) { contentPage(p, 'Colour', 'Gradients');
        titleBlock(p, 'Gradients', 'Gradients blend neighbouring brand colours. Use them for large backgrounds, never behind small text.');
        gradientRect(p, 760, 220, 1040, 330, primary(), secondary());
        gradientRect(p, 760, 590, 505, 330, accent(), primary());
        gradientRect(p, 1295, 590, 505, 330, secondary(), accent());
    });
    page(function (p) { contentPage(p, 'Colour', 'Balance');
        titleBlock(p, 'Colour balance', 'Use the primary colour most, the secondary to support it and the accent sparingly to draw the eye.');
        rect(p, 760, 260, 624, 520, primary(), { radius: 0 });
        rect(p, 1384, 260, 312, 520, secondary());
        rect(p, 1696, 260, 104, 520, accent());
        text(p, 760, 840, '60%  Primary', 'Heading', 26, INK);
        text(p, 1384, 840, '30%  Secondary', 'Heading', 26, INK);
        text(p, 1696, 840, '10%', 'Heading', 26, INK);
    });

    page(divider('04', 'Typography'));
    page(function (p) { contentPage(p, 'Typography', 'Headings');
        titleBlock(p, 'Heading typeface', 'Bold and confident. Use it for headlines, titles and short statements.');
        text(p, 760, 260, '{{font.heading}}', 'Body', 24, accent());
        text(p, 740, 620, 'Aa', 'Heading', 380, INK);
        area(p, 1240, 330, 560, 400, 'ABCDEFGHIJKLM\rNOPQRSTUVWXYZ\rabcdefghijklm\rnopqrstuvwxyz\r0123456789', 'Heading', 40, INK, 56);
    });
    page(function (p) { contentPage(p, 'Typography', 'Body');
        titleBlock(p, 'Body typeface', 'Clear and comfortable to read. Use it for paragraphs, captions and interfaces.');
        text(p, 760, 260, '{{font.body}}', 'Body', 24, accent());
        text(p, 740, 620, 'Aa', 'Body', 380, INK);
        area(p, 1240, 330, 560, 520, '{{copy.about}}', 'Body', 26, MUTED, 40);
    });
    page(function (p) { contentPage(p, 'Typography', 'Hierarchy');
        titleBlock(p, 'Hierarchy', 'Size and weight create order. Keep to these levels so every layout feels consistent.');
        var levels = [['Headline', '{{copy.headline}}', 'Heading', 64, 230], ['Subhead', '{{copy.subheadline}}', 'Heading', 34, 470],
            ['Body', '{{copy.mission}}', 'Body', 22, 620], ['Call to action', '{{copy.cta}}', 'Heading', 22, 820]];
        for (var i = 0; i < levels.length; i++) {
            text(p, 760, levels[i][4] + 20, levels[i][0], 'Body', 16, MUTED);
            area(p, 1000, levels[i][4] - 10, 800, levels[i][3] * 3, levels[i][1], levels[i][2], levels[i][3], i === 3 ? accent() : INK, levels[i][3] * 1.2);
        }
    });

    page(divider('05', 'Graphic Elements'));
    page(function (p) { contentPage(p, 'Graphic Elements', 'Pattern');
        titleBlock(p, 'Brand pattern', 'Built from simple shapes in our colours. Use it as a background accent on covers, packaging and social posts.');
        brandPattern(p, 760, 220, 1040, 700);
    });
    page(function (p) { contentPage(p, 'Graphic Elements', 'Shapes');
        titleBlock(p, 'Shapes', 'Rounded corners and circles echo our friendly personality. Combine them freely with photography.');
        rect(p, 760, 260, 300, 300, primary(), { radius: 150 });
        rect(p, 1110, 260, 300, 300, secondary(), { radius: 40 });
        rect(p, 1460, 260, 340, 140, accent(), { radius: 70 });
        rect(p, 1460, 420, 340, 140, tint(primary(), 30), { radius: 70 });
        rect(p, 760, 620, 1040, 300, PAPER, { radius: 28 });
        area(p, 820, 700, 900, 200, '{{copy.headline}}', 'Heading', 44, INK, 54);
    });

    page(divider('06', 'Stationery'));
    page(function (p) { contentPage(p, 'Stationery', 'Business card');
        titleBlock(p, 'Business card', 'Standard 85 x 55 mm. Front in brand colour, back with contact details.');
        rect(p, 790, 300, 495, 320, primary(), { radius: 12, shadow: true });
        ph(p, 940, 400, 195, 120, 'logo.mark|white');
        rect(p, 1310, 300, 495, 320, WHITE, { radius: 12, stroke: LINE });
        ph(p, 1350, 330, 130, 100, 'logo.full');
        text(p, 1350, 500, 'Full Name', 'Heading', 22, INK);
        text(p, 1350, 530, 'Job Title', 'Body', 16, MUTED);
        text(p, 1350, 580, '{{brand.website}}', 'Body', 16, accent());
    });
    page(function (p) { contentPage(p, 'Stationery', 'Letterhead');
        titleBlock(p, 'Letterhead', 'A4 letterhead with the logo top left and a single accent line. Keep body text in the body typeface.');
        rect(p, 800, 180, 540, 760, WHITE, { stroke: LINE });
        ph(p, 840, 210, 120, 90, 'logo.full');
        rect(p, 840, 310, 460, 3, accent());
        for (var l = 0; l < 12; l++) rect(p, 840, 360 + l * 34, l % 4 === 3 ? 300 : 460, 10, PAPER, { radius: 5 });
        text(p, 840, 900, '{{brand.website}}', 'Body', 12, MUTED);
        rect(p, 1400, 420, 400, 200, WHITE, { stroke: LINE });
        ph(p, 1430, 440, 80, 60, 'logo.full');
        rect(p, 1400, 600, 400, 20, primary());
    });

    page(divider('07', 'Photography'));
    page(function (p) { contentPage(p, 'Photography', 'Direction');
        titleBlock(p, 'Photo direction', 'Natural light, real people and genuine moments. Look for touches of our colours in every shot.');
        ph(p, 760, 200, 500, 720, 'image.photo1|cover');
        ph(p, 1290, 200, 510, 345, 'image.photo2|cover');
        ph(p, 1290, 575, 510, 345, 'image.photo3|cover');
    });
    page(function (p) { contentPage(p, 'Photography', 'With the brand');
        titleBlock(p, 'Photos with the brand', 'Pair photography with a solid colour block for headlines and logos.');
        ph(p, 760, 200, 1040, 720, 'image.photo4|cover');
        rect(p, 760, 640, 620, 280, primary());
        area(p, 800, 680, 540, 160, '{{copy.headline}}', 'Heading', 40, WHITE, 48);
        ph(p, 800, 830, 110, 80, 'logo.full|white');
    });

    page(divider('08', 'Applications'));
    page(function (p) { contentPage(p, 'Applications', 'Social media');
        titleBlock(p, 'Social media', 'Bold colour, one clear message and the logo in a consistent corner.');
        rect(p, 760, 230, 500, 500, primary(), { radius: 20 });
        area(p, 810, 300, 400, 300, '{{copy.headline}}', 'Heading', 44, WHITE, 52);
        ph(p, 810, 600, 130, 100, 'logo.full|white');
        rect(p, 1300, 230, 500, 500, PAPER, { radius: 20 });
        brandPattern(p, 1300, 230, 500, 200, true);
        area(p, 1350, 480, 400, 140, '{{copy.subheadline}}', 'Heading', 30, INK, 38);
        rect(p, 1350, 650, 360, 54, accent(), { radius: 27 });
        text(p, 1530, 684, '{{copy.cta}}', 'Heading', 18, WHITE, { justify: 'center' });
        text(p, 760, 790, 'Profile', 'Body', 16, MUTED);
        ellipse(p, 760, 820, 110, 110, primary());
        ph(p, 785, 845, 60, 60, 'logo.mark|white');
    });
    page(function (p) { contentPage(p, 'Applications', 'Website');
        titleBlock(p, 'Website', 'Lead with the headline and one call to action. Keep the navigation light.');
        rect(p, 760, 200, 1040, 700, WHITE, { radius: 16, stroke: LINE });
        rect(p, 760, 200, 1040, 50, PAPER, { radius: 16 });
        for (var d = 0; d < 3; d++) ellipse(p, 785 + d * 26, 217, 14, 14, LINE);
        rect(p, 760, 250, 1040, 650, primary());
        ph(p, 800, 268, 110, 74, 'logo.full|white');
        area(p, 800, 420, 620, 220, '{{copy.headline}}', 'Heading', 56, WHITE, 64);
        area(p, 800, 650, 560, 90, '{{copy.subheadline}}', 'Body', 22, WHITE, 30);
        rect(p, 800, 770, 360, 56, accent(), { radius: 28 });
        text(p, 980, 806, '{{copy.cta}}', 'Heading', 18, WHITE, { justify: 'center' });
    });
    page(function (p) { contentPage(p, 'Applications', 'App icon');
        titleBlock(p, 'App icon', 'The logomark on our primary colour, built on a rounded square.');
        var sizes = [360, 220, 120, 64];
        var x = 760;
        for (var i = 0; i < sizes.length; i++) {
            var y = 560 - sizes[i];
            rect(p, x, y, sizes[i], sizes[i], primary(), { radius: sizes[i] * 0.22 });
            ph(p, x + sizes[i] * 0.2, y + sizes[i] * 0.2, sizes[i] * 0.6, sizes[i] * 0.6, 'logo.mark|white');
            text(p, x, 610, sizes[i] + ' px', 'Body', 16, MUTED);
            x += sizes[i] + 60;
        }
    });
    page(function (p) { contentPage(p, 'Applications', 'Summary');
        titleBlock(p, 'At a glance', 'The essentials of the {{brand.name}} identity on one page.');
        rect(p, 760, 200, 500, 330, PAPER, { radius: 18 });
        ph(p, 860, 240, 300, 250, 'logo.full');
        rect(p, 1290, 200, 160, 330, primary(), { radius: 18 });
        rect(p, 1465, 200, 160, 330, secondary(), { radius: 18 });
        rect(p, 1640, 200, 160, 330, accent(), { radius: 18 });
        rect(p, 760, 560, 500, 360, PAPER, { radius: 18 });
        text(p, 800, 670, 'Aa', 'Heading', 90, INK);
        text(p, 800, 730, '{{font.heading}}', 'Body', 20, MUTED);
        text(p, 800, 820, 'Aa', 'Body', 70, INK);
        text(p, 800, 880, '{{font.body}}', 'Body', 20, MUTED);
        rect(p, 1290, 560, 510, 360, primary(), { radius: 18 });
        area(p, 1330, 610, 430, 270, '{{copy.values}}', 'Heading', 36, WHITE, 46);
    });
    page(backCover);

    // ---------- build ----------
    var prevCS = app.coordinateSystem;
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    var doc = app.documents.add(DocumentColorSpace.RGB, W, H, PAGES.length, DocumentArtboardLayout.GridByRow, 100, 6);
    var SW = {
        primary: globalSwatch('Primary', 46, 52, 140),
        secondary: globalSwatch('Secondary', 30, 30, 36),
        accent: globalSwatch('Accent', 255, 140, 66)
    };
    var STYLE = { Heading: doc.paragraphStyles.add('Heading'), Body: doc.paragraphStyles.add('Body') };
    setFont(STYLE.Heading, 'Arial-BoldMT');
    setFont(STYLE.Body, 'ArialMT');
    STYLE.Heading.paragraphAttributes.hyphenation = false;
    STYLE.Body.paragraphAttributes.hyphenation = false;

    function primary() { return SW.primary; }
    function secondary() { return SW.secondary; }
    function accent() { return SW.accent; }

    for (var i = 0; i < PAGES.length; i++) {
        var r = doc.artboards[i].artboardRect;
        doc.artboards[i].name = 'Page ' + (i < 9 ? '0' : '') + (i + 1);
        PAGES[i]({ L: r[0], T: r[1], n: i + 1 });
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
    return 'built ' + PAGES.length + ' pages';

    // ---------- helpers ----------
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

    function tint(spotColor, pct) {
        var c = new SpotColor();
        c.spot = spotColor.spot;
        c.tint = pct;
        return c;
    }

    function setFont(style, ps) {
        try { style.characterAttributes.textFont = app.textFonts.getByName(ps); } catch (e) { /* keep default */ }
    }

    function X(p, x) { return p.L + x; }
    function Y(p, y) { return p.T - y; }

    function rect(p, x, y, w, h, fill, o) {
        o = o || {};
        var item = o.radius
            ? doc.pathItems.roundedRectangle(Y(p, y), X(p, x), w, h, o.radius, o.radius)
            : doc.pathItems.rectangle(Y(p, y), X(p, x), w, h);
        if (fill) { item.filled = true; item.fillColor = fill; } else { item.filled = false; }
        if (o.stroke) {
            item.stroked = true;
            item.strokeColor = o.stroke;
            item.strokeWidth = o.dash ? 2 : 1.5;
            if (o.dash) item.strokeDashes = [10, 8];
        } else {
            item.stroked = false;
        }
        return item;
    }

    function ellipse(p, x, y, w, h, fill) {
        var e = doc.pathItems.ellipse(Y(p, y), X(p, x), w, h);
        e.filled = true;
        e.fillColor = fill;
        e.stroked = false;
        return e;
    }

    function styleText(tf, style, size, color, leading) {
        STYLE[style].applyTo(tf.textRange, true);
        var ca = tf.textRange.characterAttributes;
        ca.size = size;
        ca.fillColor = color;
        if (leading) { ca.autoLeading = false; ca.leading = leading; }
    }

    function text(p, x, y, str, style, size, color, o) {
        var tf = doc.textFrames.pointText([X(p, x), Y(p, y)]);
        tf.contents = str;
        styleText(tf, style, size, color);
        if (o && o.justify) {
            tf.textRange.paragraphAttributes.justification = o.justify === 'center' ? Justification.CENTER : Justification.RIGHT;
        }
        return tf;
    }

    function area(p, x, y, w, h, str, style, size, color, leading) {
        var box = doc.pathItems.rectangle(Y(p, y), X(p, x), w, h);
        var tf = doc.textFrames.areaText(box);
        tf.contents = str;
        styleText(tf, style, size, color, leading);
        return tf;
    }

    // Placeholder for a logo/image: an empty dashed box named with the tag.
    function ph(p, x, y, w, h, tag) {
        var r = rect(p, x, y, w, h, null, { stroke: LINE, dash: true });
        r.name = '{{' + tag + '}}';
        return r;
    }

    function gradientRect(p, x, y, w, h, c1, c2) {
        var g = doc.gradients.add();
        g.type = GradientType.LINEAR;
        g.gradientStops[0].color = c1;
        g.gradientStops[1].color = c2;
        var gc = new GradientColor();
        gc.gradient = g;
        var r = rect(p, x, y, w, h, null, { radius: 22 });
        r.filled = true;
        r.fillColor = gc;
        return r;
    }

    // Geometric pattern: a grid of circles, quarter-circles and squares in brand colours.
    function brandPattern(p, x, y, w, h, light) {
        var size = light ? 100 : 130;
        var cols = Math.floor(w / size), rows = Math.floor(h / size);
        var palette = light ? [tint(primary(), 25), tint(accent(), 35), tint(secondary(), 15)] : [primary(), secondary(), accent(), tint(primary(), 40)];
        var group = doc.groupItems.add();
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var k = (r * 7 + c * 3) % 5;
                var px = x + c * size, py = y + r * size;
                var col = palette[(r + c) % palette.length];
                var item;
                if (k === 0 || k === 3) item = ellipse(p, px + 8, py + 8, size - 16, size - 16, col);
                else if (k === 1) item = rect(p, px + 8, py + 8, size - 16, size - 16, col, { radius: 18 });
                else if (k === 2) item = quarter(p, px + 8, py + 8, size - 16, col, (r + c) % 4);
                else item = rect(p, px + size * 0.3, py + size * 0.3, size * 0.4, size * 0.4, col, { radius: size * 0.2 });
                item.move(group, ElementPlacement.PLACEATEND);
            }
        }
        return group;
    }

    // Quarter circle of radius s whose centre sits on one corner of the cell (0 TL, 1 TR, 2 BR, 3 BL).
    function quarter(p, x, y, s, col, corner) {
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
    }

    function busyPattern(p, x, y, w, h) {
        var g = brandPattern(p, x, y, w, h, false);
        g.opacity = 70;
    }

    // ---------- page chrome ----------
    function chrome(p, section, dark) {
        var fg = dark ? WHITE : MUTED;
        rect(p, M, 64, 28, 6, accent());
        text(p, M, 104, '{{brand.name}}', 'Heading', 16, dark ? WHITE : INK);
        text(p, W - M, 104, section, 'Body', 16, fg, { justify: 'right' });
        if (!dark) rect(p, M, 990, W - 2 * M, 1, LINE);
        text(p, M, 1036, (p.n < 10 ? '0' : '') + p.n, 'Body', 16, fg);
        text(p, W - M, 1036, 'Brand Guidelines  {{year}}', 'Body', 16, fg, { justify: 'right' });
    }

    function contentPage(p, section) {
        chrome(p, section, false);
    }

    function titleBlock(p, title, desc) {
        area(p, M, 190, 560, 180, title, 'Heading', 60, INK, 66);
        area(p, M, 400, 520, 480, desc, 'Body', 22, MUTED, 34);
    }

    function logoShowcase(title, desc, key, bg, mod, bordered) {
        return function (p) {
            contentPage(p, 'Logo');
            titleBlock(p, title, desc);
            rect(p, 760, 200, 1040, 720, bg || primary(), { radius: 28, stroke: bordered ? LINE : null });
            ph(p, 980, 400, 600, 320, key + (mod ? '|' + mod : ''));
        };
    }

    function divider(num, title) {
        return function (p) {
            rect(p, 0, 0, W, H, primary());
            chrome(p, title, true);
            text(p, W - M, 880, num, 'Heading', 520, accent(), { justify: 'right' });
            rect(p, M, 700, 80, 8, accent());
            area(p, M, 740, 900, 220, title, 'Heading', 110, WHITE, 112);
        };
    }

    function cover(p) {
        rect(p, 0, 0, W, H, primary());
        brandPattern(p, 1260, 0, 660, 1080, false).opacity = 25;
        ph(p, M, 140, 560, 220, 'logo.full|white');
        rect(p, M, 640, 80, 8, accent());
        area(p, M, 680, 1000, 260, 'Brand\rGuidelines', 'Heading', 120, WHITE, 120);
        text(p, M, 1000, '{{year}}  |  Prepared by {{designer.name}}', 'Body', 20, WHITE);
    }

    function contents(p) {
        contentPage(p, 'Contents');
        area(p, M, 190, 560, 180, 'Contents', 'Heading', 60, INK, 66);
        var items = ['Brand Overview', 'Logo', 'Colour', 'Typography', 'Graphic Elements', 'Stationery', 'Photography', 'Applications'];
        for (var i = 0; i < items.length; i++) {
            var x = 760 + Math.floor(i / 4) * 540, y = 260 + (i % 4) * 170;
            text(p, x, y, '0' + (i + 1), 'Heading', 30, accent());
            text(p, x + 80, y, items[i], 'Heading', 40, INK);
            rect(p, x, y + 40, 480, 1, LINE);
        }
    }

    function backCover(p) {
        rect(p, 0, 0, W, H, primary());
        ph(p, M, 140, 200, 200, 'logo.mark|white');
        area(p, M, 560, 1100, 160, 'Thank you', 'Heading', 130, WHITE, 130);
        text(p, M, 800, '{{brand.website}}', 'Body', 28, WHITE);
        text(p, M, 1000, 'Guidelines by {{designer.name}}  |  {{designer.email}}', 'Body', 20, WHITE);
        text(p, W - M, 1000, '{{year}}', 'Body', 20, WHITE, { justify: 'right' });
    }
})();
