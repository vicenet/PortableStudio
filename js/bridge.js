/* Talks to Illustrator/Photoshop through CEP's evalScript, plus a few CEP/Node helpers. */
const Host = (() => {
  const cep = window.__adobe_cep__;
  const APPS = { ILST: 'illustrator', PHXS: 'photoshop', PHSP: 'photoshop' };
  const node = typeof require === 'function' ? require : null;
  const info = { app: null, root: null };

  // One script at a time: the panel and the local API can both call the host, and overlapping
  // evalScript calls can make Illustrator drop a reply that every later call then waits behind.
  let queue = Promise.resolve();
  function evalRaw(script) {
    const p = queue.then(() => evalOnce(script), () => evalOnce(script));
    queue = p.catch(() => {});
    return p;
  }

  function evalOnce(script) {
    return new Promise((resolve, reject) => {
      if (!cep) return reject(new Error('Not running inside Illustrator or Photoshop.'));
      cep.evalScript(script, (result) => {
        if (result === 'EvalScript error.') {
          reject(new Error('Host script error - check the .jsx files for a syntax error.'));
        } else {
          resolve(result);
        }
      });
    });
  }

  function extensionRoot() {
    const url = decodeURI(cep.getSystemPath('extension'));
    // Windows: file:///D:/x -> D:/x   macOS: file:///Users/x -> /Users/x
    return process.platform === 'win32' ? url.replace(/^file:\/{3}/, '') : url.replace(/^file:\/{2}/, '');
  }

  async function init() {
    if (!cep) throw new Error('Not running inside Illustrator or Photoshop.');
    if (!node) throw new Error('Node.js is disabled for this panel (check CSXS/manifest.xml).');
    info.app = APPS[JSON.parse(cep.getHostEnvironment()).appName] || 'unknown';
    info.root = extensionRoot().replace(/\\/g, '/');
    const hostApp = await evalRaw(
      `$.evalFile(${JSON.stringify(info.root + '/host/index.jsx')}); PortableStudio.init(${JSON.stringify(info.root)});`
    );
    if (hostApp !== info.app) throw new Error(`Host scripts failed to load (got "${hostApp}").`);
    return info;
  }

  async function call(name, arg = {}) {
    const raw = await evalRaw(`PortableStudio.call(${JSON.stringify(name)}, ${JSON.stringify(JSON.stringify(arg))})`);
    let res;
    try {
      res = JSON.parse(raw);
    } catch {
      throw new Error(`Unexpected reply from ${info.app}: ${raw}`);
    }
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  function chooseFile(title, extensions) {
    const r = window.cep.fs.showOpenDialogEx(false, false, title, '', extensions);
    return r.err === 0 && r.data && r.data.length ? r.data[0] : null;
  }

  function revealFolder(dir) {
    const { spawn } = node('child_process');
    const cmd = process.platform === 'win32' ? 'explorer' : 'open';
    spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
  }

  function chooseFolder(title) {
    const r = window.cep.fs.showOpenDialogEx(false, true, title, '', []);
    return r.err === 0 && r.data && r.data.length ? r.data[0] : null;
  }

  // Shared CommonJS modules in core/ (also used by the MCP server).
  const core = (name) => node(`${info.root}/core/${name}.js`);

  function copyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  return { info, init, call, chooseFile, chooseFolder, revealFolder, node, core, copyText };
})();
