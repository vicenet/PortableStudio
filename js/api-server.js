/* Serves core/api.js on 127.0.0.1 while the panel is open, and advertises the port in a
   runtime file so the MCP server can find it. */
const ApiServer = (() => {
  let server = null;
  const state = { running: false, port: null, error: null };

  function runtimeFile() {
    return Studio.core.paths.paths.runtimeFile(Host.info.app);
  }

  function start() {
    if (server) return state;
    const http = Host.node('http');
    const c = Studio.core;
    if (!c.settings.load().apiEnabled) {
      state.error = 'Disabled in Settings';
      return state;
    }
    c.settings.ensureApiToken();
    const handler = Host.core('api').createApi({
      studio: Studio,
      brands: c.brands,
      templates: c.templates,
      color: c.color,
      packs: c.packs,
      license: c.license,
      settings: c.settings,
      getToken: () => c.settings.load().apiToken,
    });
    state.port = c.paths.PORTS[Host.info.app];
    server = http.createServer(handler);
    server.setTimeout(0); // generation can take minutes
    server.on('error', (e) => {
      state.running = false;
      state.error = e.code === 'EADDRINUSE' ? `Port ${state.port} is already in use` : e.message;
      server = null;
    });
    server.listen(state.port, '127.0.0.1', () => {
      state.running = true;
      state.error = null;
      c.paths.writeJson(runtimeFile(), {
        app: Host.info.app,
        port: state.port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      });
    });
    window.addEventListener('beforeunload', stop);
    return state;
  }

  function stop() {
    if (!server) return;
    server.close();
    server = null;
    state.running = false;
    try { Host.node('fs').unlinkSync(runtimeFile()); } catch { /* already gone */ }
  }

  return { start, stop, state };
})();
