// Builds PortableStudio's "Logo Presentation" template (12 pages, 1920x1080) in Illustrator.
//   $.global.PS_BUILD = { file: '<path>/template.ai', thumb: '<path>/thumbnail.png', root: '<repo root>' };
//   $.evalFile('<root>/builders/logo-presentation.jsx');
(function () {
    var cfg = $.global.PS_BUILD || {};
    $.evalFile(new File(cfg.root + '/builders/lib.jsx'));
    var B = $.global.PSBuilder({ width: 1920, height: 1080 });
    var W = B.W, H = B.H, M = 120;

    function label(p, str, color) {
        B.rect(p, M, 96, 28, 6, B.accent());
        B.text(p, M, 140, str, 'Body', 18, color || B.MUTED, { tracking: 120 });
    }

    function footer(p, dark) {
        var c = dark ? B.WHITE : B.MUTED;
        B.text(p, M, 1010, '{{brand.name}}  |  Logo Presentation', 'Body', 16, c);
        B.text(p, W - M, 1010, (p.n < 10 ? '0' : '') + p.n, 'Body', 16, c, { justify: 'right' });
    }

    // 1 Cover
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.INK);
        B.pattern(p, 0, 0, W, H, 160, [B.primary(), B.secondary(), B.accent()], 18);
        B.ph(p, 560, 300, 800, 360, 'logo.full|white');
        B.text(p, W / 2, 820, 'Logo Presentation', 'Heading', 40, B.WHITE, { justify: 'center' });
        B.text(p, W / 2, 880, 'Prepared for {{brand.name}} by {{designer.name}}  |  {{date}}', 'Body', 20, B.WHITE, { justify: 'center' });
    });
    // 2 The idea
    B.page(function (p) {
        label(p, 'THE IDEA');
        B.area(p, M, 220, 900, 420, '{{copy.headline}}', 'Heading', 84, B.INK, 92);
        B.area(p, 1140, 240, 660, 330, '{{copy.about}}', 'Body', 26, B.MUTED, 40);
        B.rect(p, 1140, 620, 660, 2, B.accent());
        B.area(p, 1140, 660, 660, 240, '{{copy.mission}}', 'Heading', 30, B.INK, 40);
        footer(p);
    });
    // 3 Logomark
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.PAPER);
        label(p, 'THE SYMBOL');
        B.ph(p, 660, 240, 600, 600, 'logo.mark');
        footer(p);
    });
    // 4 Primary logo
    B.page(function (p) {
        label(p, 'THE LOGO');
        B.ph(p, 360, 280, 1200, 500, 'logo.full');
        footer(p);
    });
    // 5 Construction
    B.page(function (p) {
        label(p, 'CONSTRUCTION');
        B.ph(p, 610, 200, 700, 700, 'logo.mark|grid');
        B.area(p, M, 760, 420, 160, 'Every curve is built from simple, repeatable geometry.', 'Body', 22, B.MUTED, 32);
        footer(p);
    });
    // 6 Colour versions
    B.page(function (p) {
        var tiles = [[B.primary(), 'logo.full|white'], [B.secondary(), 'logo.full|white'], [B.accent(), 'logo.full|white'], [B.WHITE, 'logo.full']];
        for (var i = 0; i < 4; i++) {
            var x = (i % 2) * (W / 2), y = Math.floor(i / 2) * (H / 2);
            B.rect(p, x, y, W / 2, H / 2, tiles[i][0]);
            B.ph(p, x + 280, y + 120, 400, 300, tiles[i][1]);
        }
    });
    // 7 Palette
    B.page(function (p) {
        var cols = [['Primary', 'primary', B.primary()], ['Secondary', 'secondary', B.secondary()], ['Accent', 'accent', B.accent()]];
        for (var i = 0; i < 3; i++) {
            var x = i * 640;
            B.rect(p, x, 0, 640, 760, cols[i][2]);
            B.text(p, x + 60, 840, cols[i][0], 'Heading', 34, B.INK);
            B.text(p, x + 60, 890, '{{color.' + cols[i][1] + '.hex}}', 'Body', 22, B.MUTED);
            B.text(p, x + 60, 925, 'RGB {{color.' + cols[i][1] + '.rgb}}', 'Body', 18, B.MUTED);
            B.text(p, x + 60, 958, 'CMYK {{color.' + cols[i][1] + '.cmyk}}', 'Body', 18, B.MUTED);
        }
    });
    // 8 In use: profile, app icon, business card
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.PAPER);
        label(p, 'IN USE');
        B.ellipse(p, 200, 330, 360, 360, B.primary());
        B.ph(p, 280, 410, 200, 200, 'logo.mark|white');
        B.text(p, 380, 760, 'Profile picture', 'Body', 18, B.MUTED, { justify: 'center' });
        B.rect(p, 720, 330, 360, 360, B.primary(), { radius: 80 });
        B.ph(p, 800, 410, 200, 200, 'logo.mark|white');
        B.text(p, 900, 760, 'App icon', 'Body', 18, B.MUTED, { justify: 'center' });
        B.rect(p, 1240, 380, 520, 300, B.WHITE, { radius: 14, stroke: B.LINE });
        B.ph(p, 1290, 420, 160, 110, 'logo.full');
        B.text(p, 1290, 600, 'Full Name', 'Heading', 22, B.INK);
        B.text(p, 1290, 635, '{{brand.website}}', 'Body', 16, B.MUTED);
        B.text(p, 1500, 760, 'Business card', 'Body', 18, B.MUTED, { justify: 'center' });
        footer(p);
    });
    // 9 Pattern
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.primary());
        B.pattern(p, 0, 0, W, H, 180, [B.secondary(), B.accent(), B.tint(B.primary(), 60)], 90);
        B.ellipse(p, 710, 290, 500, 500, B.primary());
        B.ph(p, 810, 390, 300, 300, 'logo.mark|white');
    });
    // 10 Website
    B.page(function (p) {
        label(p, 'ONLINE');
        B.rect(p, 360, 200, 1200, 760, B.WHITE, { radius: 18, stroke: B.LINE });
        B.rect(p, 360, 200, 1200, 56, B.PAPER, { radius: 18 });
        for (var d = 0; d < 3; d++) B.ellipse(p, 388 + d * 28, 220, 16, 16, B.LINE);
        B.rect(p, 360, 256, 1200, 704, B.primary());
        B.ph(p, 410, 290, 130, 80, 'logo.full|white');
        B.area(p, 410, 460, 760, 240, '{{copy.headline}}', 'Heading', 64, B.WHITE, 72);
        B.area(p, 410, 720, 640, 90, '{{copy.subheadline}}', 'Body', 24, B.WHITE, 32);
        B.rect(p, 410, 840, 360, 60, B.accent(), { radius: 30 });
        B.text(p, 590, 879, '{{copy.cta}}', 'Heading', 20, B.WHITE, { justify: 'center' });
    });
    // 11 Typography
    B.page(function (p) {
        label(p, 'TYPOGRAPHY');
        B.text(p, M, 520, '{{brand.name}}', 'Heading', 150, B.INK);
        B.text(p, M, 600, '{{font.heading}}  /  {{font.body}}', 'Body', 26, B.accent());
        B.area(p, M, 680, 1100, 220, '{{copy.about}}', 'Body', 30, B.MUTED, 44);
        footer(p);
    });
    // 12 Thank you
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.primary());
        B.ph(p, 860, 260, 200, 200, 'logo.mark|white');
        B.text(p, W / 2, 640, 'Thank you', 'Heading', 110, B.WHITE, { justify: 'center' });
        B.text(p, W / 2, 720, '{{designer.name}}  |  {{designer.email}}', 'Body', 24, B.WHITE, { justify: 'center' });
    });

    return B.build(cfg);
})();
