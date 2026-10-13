// Minimal JSON for ExtendScript, which has no built-in JSON object.
// parse() is only ever fed data produced by our own panel, so eval is acceptable here.

if (typeof $.global.JSON !== 'object') {
    $.global.JSON = {};
}

(function (J) {
    function quote(s) {
        return '"' + s.replace(/[\\"\x00-\x1f]/g, function (c) {
            switch (c) {
                case '"': return '\\"';
                case '\\': return '\\\\';
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '\t': return '\\t';
                case '\b': return '\\b';
                case '\f': return '\\f';
            }
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }

    function str(v) {
        if (v === null || v === undefined) return 'null';
        var t = typeof v;
        if (t === 'string') return quote(v);
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'boolean') return String(v);
        if (t === 'function') return undefined;
        var parts = [];
        if (v instanceof Array) {
            for (var i = 0; i < v.length; i++) {
                var item = str(v[i]);
                parts.push(item === undefined ? 'null' : item);
            }
            return '[' + parts.join(',') + ']';
        }
        for (var k in v) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
            var s = str(v[k]);
            if (s !== undefined) parts.push(quote(k) + ':' + s);
        }
        return '{' + parts.join(',') + '}';
    }

    if (typeof J.stringify !== 'function') {
        J.stringify = function (v) { return str(v); };
    }
    if (typeof J.parse !== 'function') {
        J.parse = function (s) { return eval('(' + s + ')'); };
    }
})($.global.JSON);
