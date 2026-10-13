// Builds PortableStudio's "Instagram Carousel" template (5 slides, 1080x1350) in Illustrator.
// Text comes from {{copy.slide1.title}} ... {{copy.slide5.body}} (AI or industry copy in the panel).
//   $.global.PS_BUILD = { file, thumb, root };  $.evalFile('<root>/builders/social-carousel.jsx');
(function () {
    var cfg = $.global.PS_BUILD || {};
    $.evalFile(new File(cfg.root + '/builders/lib.jsx'));
    var B = $.global.PSBuilder({ width: 1080, height: 1350 });
    var W = B.W, H = B.H, M = 90;

    // Progress dots: the active slide is a wider pill.
    function dots(p, active, dark) {
        var x = M;
        for (var i = 0; i < 5; i++) {
            var on = i === active;
            var w = on ? 40 : 14;
            B.rect(p, x, 1250, w, 14, on ? B.accent() : (dark ? B.tint(B.secondary(), 40) : B.LINE), { radius: 7 });
            x += w + 16;
        }
    }

    // 1 Hook
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.primary());
        B.pattern(p, 540, 0, 540, 540, 135, [B.secondary(), B.accent(), B.tint(B.primary(), 60)], 70);
        B.ph(p, M, 110, 220, 120, 'logo.full|white');
        B.areaRich(p, M, 620, 900, 560, [
            { text: '{{copy.slide1.title}}', style: 'Heading', size: 96, color: B.WHITE, leading: 100, spaceAfter: 36 },
            { text: '{{copy.slide1.body}}', style: 'Body', size: 36, color: B.WHITE, leading: 48 }
        ]);
        B.rect(p, 850, 1220, 140, 70, B.accent(), { radius: 35 });
        B.text(p, 920, 1268, '->', 'Heading', 30, B.WHITE, { justify: 'center' });
        dots(p, 0, true);
    });

    // 2-4 Points
    function point(n) {
        return function (p) {
            B.rect(p, 0, 0, W, H, n % 2 ? B.PAPER : B.WHITE);
            B.text(p, M, 420, '0' + n, 'Heading', 200, B.accent());
            B.rect(p, M, 500, 120, 10, B.primary());
            B.areaRich(p, M, 580, 880, 600, [
                { text: '{{copy.slide' + n + '.title}}', style: 'Heading', size: 84, color: B.INK, leading: 92, spaceAfter: 40 },
                { text: '{{copy.slide' + n + '.body}}', style: 'Body', size: 40, color: B.MUTED, leading: 54 }
            ]);
            B.ellipse(p, 830, -120, 380, 380, B.tint(B.secondary(), 25));
            B.ph(p, 930, 1225, 70, 70, 'logo.mark');
            dots(p, n - 1, false);
        };
    }
    B.page(point(2));
    B.page(point(3));
    B.page(point(4));

    // 5 Call to action
    B.page(function (p) {
        B.rect(p, 0, 0, W, H, B.primary());
        B.ellipse(p, 640, 760, 760, 760, B.tint(B.secondary(), 55));
        B.ph(p, M, 110, 220, 120, 'logo.full|white');
        B.areaRich(p, M, 380, 900, 520, [
            { text: '{{copy.slide5.title}}', style: 'Heading', size: 92, color: B.WHITE, leading: 98, spaceAfter: 36 },
            { text: '{{copy.slide5.body}}', style: 'Body', size: 38, color: B.WHITE, leading: 50 }
        ]);
        B.rect(p, M, 960, 520, 100, B.accent(), { radius: 50 });
        B.text(p, M + 260, 1024, '{{copy.cta}}', 'Heading', 34, B.WHITE, { justify: 'center' });
        B.text(p, M, 1140, '{{brand.website}}', 'Body', 30, B.WHITE);
        dots(p, 4, true);
    });

    return B.build({ file: cfg.file, thumb: cfg.thumb, columns: 5, gap: 40, pageName: 'Slide' });
})();
