// Brand values and {{tag}} handling shared by the Illustrator and Photoshop scripts.
// Pure ES3 (ExtendScript) - no host APIs here, so it can also be tested in Node.

(function (root) {
    var B = {};

    B.COLOR_ROLES = ['primary', 'secondary', 'accent'];
    B.FONT_ROLES = ['heading', 'body'];

    // {{key}} or {{key|mod|mod}}, e.g. {{brand.name|heading|primary}}
    var TAG_SRC = '\\{\\{\\s*([A-Za-z0-9_.]+)((?:\\|[A-Za-z0-9_]+)*)\\s*\\}\\}';

    function toTag(m) {
        return {
            key: m[1].toLowerCase(),
            mods: m[2] ? m[2].substring(1).toLowerCase().split('|') : []
        };
    }

    B.has = function (obj, key) {
        return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
    };

    B.contains = function (arr, value) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] === value) return true;
        }
        return false;
    };

    // A layer/object name that is exactly one tag, e.g. "{{logo.mark}}". Returns null otherwise.
    B.parseTag = function (name) {
        var m = new RegExp('^\\s*' + TAG_SRC + '\\s*$').exec(String(name || ''));
        return m ? toTag(m) : null;
    };

    // Every tag inside a piece of text, with character positions.
    B.findTags = function (text) {
        var re = new RegExp(TAG_SRC, 'g');
        var out = [];
        var m;
        text = String(text || '');
        while ((m = re.exec(text)) !== null) {
            var t = toTag(m);
            t.start = m.index;
            t.end = m.index + m[0].length;
            out.push(t);
        }
        return out;
    };

    // Replaces known tags in text. Tags with no value are left as-is and listed in `unfilled`.
    B.replaceTags = function (text, values) {
        text = String(text || '');
        var tags = B.findTags(text);
        var result = '';
        var last = 0;
        var unfilled = [];
        var changed = false;
        for (var i = 0; i < tags.length; i++) {
            var t = tags[i];
            result += text.substring(last, t.start);
            if (B.has(values, t.key)) {
                result += values[t.key];
                changed = true;
            } else {
                result += text.substring(t.start, t.end);
                unfilled.push(t.key);
            }
            last = t.end;
        }
        result += text.substring(last);
        return { text: result, changed: changed, unfilled: unfilled };
    };

    // "#abc", "abc", "#AABBCC" -> "#AABBCC". Returns null for anything invalid.
    B.normalizeHex = function (hex) {
        var h = String(hex || '').replace(/^\s+|\s+$/g, '').replace(/^#/, '');
        if (/^[0-9a-fA-F]{3}$/.test(h)) {
            h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        }
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return '#' + h.toUpperCase();
    };

    B.hexToRgb = function (hex) {
        var h = B.normalizeHex(hex);
        if (!h) return null;
        return {
            r: parseInt(h.substring(1, 3), 16),
            g: parseInt(h.substring(3, 5), 16),
            b: parseInt(h.substring(5, 7), 16)
        };
    };

    // Simple (non colour-managed) conversion, good enough for labels and CMYK documents.
    B.rgbToCmyk = function (rgb) {
        var r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
        var k = 1 - Math.max(r, g, b);
        if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
        return {
            c: Math.round((1 - r - k) / (1 - k) * 100),
            m: Math.round((1 - g - k) / (1 - k) * 100),
            y: Math.round((1 - b - k) / (1 - k) * 100),
            k: Math.round(k * 100)
        };
    };

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];

    B.formatDate = function (d) {
        return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    };

    function str(v) {
        return v === null || v === undefined ? '' : String(v);
    }

    // Turns the brand object sent by the panel into a flat { 'tag.key': 'text' } map.
    B.buildValues = function (brand, now) {
        var b = brand || {};
        var v = {};
        now = now || new Date();

        v['brand.name'] = str(b.name);
        v['brand.tagline'] = str(b.tagline);
        v['brand.industry'] = str(b.industryName || b.industry);
        v['brand.website'] = str(b.website);
        v['designer.name'] = str(b.designerName);
        v['designer.email'] = str(b.designerEmail);
        v['date'] = B.formatDate(now);
        v['year'] = String(now.getFullYear());

        for (var i = 0; i < B.COLOR_ROLES.length; i++) {
            var role = B.COLOR_ROLES[i];
            var hex = B.normalizeHex(b.colors && b.colors[role]);
            if (!hex) continue;
            var rgb = B.hexToRgb(hex);
            var cmyk = B.rgbToCmyk(rgb);
            v['color.' + role] = hex;
            v['color.' + role + '.hex'] = hex;
            v['color.' + role + '.rgb'] = rgb.r + ', ' + rgb.g + ', ' + rgb.b;
            v['color.' + role + '.cmyk'] = cmyk.c + ', ' + cmyk.m + ', ' + cmyk.y + ', ' + cmyk.k;
        }

        for (var j = 0; j < B.FONT_ROLES.length; j++) {
            var f = b.fonts && b.fonts[B.FONT_ROLES[j]];
            if (f && f.name) v['font.' + B.FONT_ROLES[j]] = String(f.name);
        }

        addCopyValues(v, b.copy);
        return v;
    };

    // copy.headline, copy.values (one per line), copy.value1.., copy.slide1.title / copy.slide1.body ..
    // Line breaks use \r, which both Illustrator and Photoshop treat as a new paragraph.
    function addCopyValues(v, copy) {
        if (!copy) return;
        var fields = ['headline', 'subheadline', 'about', 'mission', 'voice', 'cta'];
        for (var i = 0; i < fields.length; i++) {
            if (copy[fields[i]]) v['copy.' + fields[i]] = str(copy[fields[i]]);
        }
        var values = copy.values || [];
        if (values.length) {
            v['copy.values'] = values.join('\r');
            // Fill up to six value slots so templates with more slots than values don't show raw tags.
            for (var k = 0; k < Math.max(values.length, 6); k++) v['copy.value' + (k + 1)] = str(values[k]);
        }
        var slides = copy.slides || [];
        for (var s = 0; s < slides.length; s++) {
            v['copy.slide' + (s + 1) + '.title'] = str(slides[s].title);
            v['copy.slide' + (s + 1) + '.body'] = str(slides[s].body);
        }
    }

    // "logo.mark" -> brand.logos.mark, "image.hero" -> brand.images.hero
    B.assetPath = function (brand, key) {
        var parts = key.split('.');
        var group = parts[0] === 'logo' ? 'logos' : (parts[0] === 'image' ? 'images' : null);
        if (!group || !brand || !brand[group]) return '';
        return str(brand[group][parts[1]]);
    };

    B.isAssetKey = function (key) {
        return key.indexOf('logo.') === 0 || key.indexOf('image.') === 0;
    };

    root.brand = B;
})(typeof PortableStudio !== 'undefined' ? PortableStudio : this);
