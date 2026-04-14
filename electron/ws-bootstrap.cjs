const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  try {
    const explicitServerEntry = process.env.XIAOLONGXIA_SERVER_ENTRY
      ? path.resolve(process.env.XIAOLONGXIA_SERVER_ENTRY)
      : '';
    const serverModulePath = explicitServerEntry || path.resolve(__dirname, '..', 'server', 'ws-server.js');
    await import(pathToFileURL(serverModulePath).href);
  } catch (error) {
    console.error('[ws-bootstrap] failed to import ws-server:', error);
    process.exit(1);
  }
})();
