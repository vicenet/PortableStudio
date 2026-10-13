// PortableStudio host entry point. The panel evaluates this file, then calls
// PortableStudio.init(root) and PortableStudio.call(name, jsonArg) for everything else.

var PortableStudio = (typeof PortableStudio !== 'undefined') ? PortableStudio : {};

(function (PS) {
    PS.api = PS.api || {};
    PS.util = PS.util || {};

    PS.hostName = function () {
        var n = String(BridgeTalk.appName).toLowerCase();
        if (n.indexOf('illustrator') === 0) return 'illustrator';
        if (n.indexOf('photoshop') === 0) return 'photoshop';
        return 'unknown';
    };

    PS.init = function (rootPath) {
        PS.root = rootPath;
        $.evalFile(new File(rootPath + '/host/lib/json.jsx'));
        $.evalFile(new File(rootPath + '/host/lib/brand.jsx'));
        var host = PS.hostName();
        if (host !== 'unknown') {
            $.evalFile(new File(rootPath + '/host/' + host + '.jsx'));
        }
        return host;
    };

    // Single entry point for the panel. Always returns {"ok":true,"data":...} or {"ok":false,"error":"..."}.
    PS.call = function (name, argJson) {
        try {
            var fn = PS.api[name];
            if (typeof fn !== 'function') throw new Error('Unknown host function: ' + name);
            var arg = argJson ? JSON.parse(argJson) : {};
            var data = fn(arg);
            return JSON.stringify({ ok: true, data: data === undefined ? null : data });
        } catch (e) {
            var msg = String(e && e.message ? e.message : e);
            if (e && e.line) msg += ' (line ' + e.line + ')';
            return JSON.stringify({ ok: false, error: msg });
        }
    };

    PS.util.fileOrThrow = function (path, what) {
        var f = new File(path);
        if (!f.exists) throw new Error((what || 'File') + ' not found: ' + path);
        return f;
    };

    PS.util.addUnique = function (arr, values) {
        for (var i = 0; i < values.length; i++) {
            if (!PS.brand.contains(arr, values[i])) arr.push(values[i]);
        }
    };

    PS.util.newReport = function () {
        return { textReplaced: 0, colors: [], fonts: [], assets: [], unfilledTags: [], fitted: [], warnings: [] };
    };

    PS.api.ping = function () {
        return { app: PS.hostName(), version: String(app.version) };
    };

    // Shows a message in the host app. With askOpen, returns true if the user wants the folder opened.
    PS.api.notify = function (arg) {
        var title = arg.title || 'PortableStudio';
        if (arg.askOpen) return confirm(arg.message + '\n\nOpen the output folder?', false, title);
        alert(arg.message, title);
        return true;
    };

    PS.api.openFile = function (arg) {
        app.open(PS.util.fileOrThrow(arg.file, 'Template file'));
        return true;
    };
})(PortableStudio);
