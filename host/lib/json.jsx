// Minimal JSON for ExtendScript, which has no built-in JSON object.
// parse() is a strict parser rather than eval: it also reads JSON stored inside template
// documents, which come from outside the panel and must never be able to run code.

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
    function parse(text) {
        var s = String(text);
        var at = 0;
        var ESC = { '"': '"', '\\': '\\', '/': '/', 'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t' };

        function fail(msg) {
            throw new SyntaxError('JSON.parse: ' + msg + ' at position ' + at);
        }
        function white() {
            var c = s.charAt(at);
            while (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
                at++;
                c = s.charAt(at);
            }
        }
        function expect(word) {
            if (s.substr(at, word.length) !== word) fail('unexpected token');
            at += word.length;
        }
        function string() {
            var out = '';
            at++;
            while (at < s.length) {
                var c = s.charAt(at);
                if (c === '"') {
                    at++;
                    return out;
                }
                if (c === '\\') {
                    at++;
                    c = s.charAt(at);
                    if (c === 'u') {
                        var hex = s.substr(at + 1, 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad unicode escape');
                        out += String.fromCharCode(parseInt(hex, 16));
                        at += 5;
                    } else if (ESC.hasOwnProperty(c)) {
                        out += ESC[c];
                        at++;
                    } else {
                        fail('bad escape');
                    }
                } else if (c < ' ') {
                    fail('control character in string');
                } else {
                    out += c;
                    at++;
                }
            }
            fail('unterminated string');
        }
        function number() {
            var m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+\-]?[0-9]+)?/.exec(s.substring(at));
            if (!m) fail('bad number');
            at += m[0].length;
            return Number(m[0]);
        }
        function array() {
            var out = [];
            at++;
            white();
            if (s.charAt(at) === ']') {
                at++;
                return out;
            }
            while (true) {
                out.push(value());
                white();
                var c = s.charAt(at);
                at++;
                if (c === ']') return out;
                if (c !== ',') fail('expected , or ]');
            }
        }
        function object() {
            var out = {};
            at++;
            white();
            if (s.charAt(at) === '}') {
                at++;
                return out;
            }
            while (true) {
                white();
                if (s.charAt(at) !== '"') fail('expected string key');
                var key = string();
                white();
                if (s.charAt(at) !== ':') fail('expected :');
                at++;
                out[key] = value();
                white();
                var c = s.charAt(at);
                at++;
                if (c === '}') return out;
                if (c !== ',') fail('expected , or }');
            }
        }
        function value() {
            white();
            var c = s.charAt(at);
            if (c === '{') return object();
            if (c === '[') return array();
            if (c === '"') return string();
            if (c === 't') { expect('true'); return true; }
            if (c === 'f') { expect('false'); return false; }
            if (c === 'n') { expect('null'); return null; }
            if (c === '-' || (c >= '0' && c <= '9')) return number();
            fail('unexpected token');
        }

        var result = value();
        white();
        if (at < s.length) fail('unexpected trailing data');
        return result;
    }

    if (typeof J.parse !== 'function') {
        J.parse = parse;
    }
})($.global.JSON);
