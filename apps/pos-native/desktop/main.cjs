const { app, BrowserWindow, protocol, net, ipcMain, shell, powerSaveBlocker } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { LocalLink } = require('./transport.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, link;
app.whenReady().then(() => {
  powerSaveBlocker.start('prevent-display-sleep');
  const root = path.resolve(__dirname, '../www');
  protocol.handle('app', request => {
    const url = new URL(request.url);
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.hostname !== 'localhost' || !file.startsWith(root + path.sep)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  window = new BrowserWindow({ width: 1280, height: 850, title: 'Oon Jai POS', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  link = new LocalLink(event => { if (!window.isDestroyed()) window.webContents.send('link:request', event); });
  for (const method of ['start', 'stop', 'exchange', 'reply']) ipcMain.handle('link:' + method, (event, args) => {
    const source = new URL(event.senderFrame.url);
    if (event.senderFrame !== window.webContents.mainFrame || source.protocol !== 'app:' || source.hostname !== 'localhost') throw Error('Untrusted page');
    return link[method](args);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Only the company release page can open from this application's chrome.
    if (url === 'https://github.com/OonJai-Marketplace/Restaurant-Back-Office/releases') void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://localhost/')) event.preventDefault(); });
  window.loadURL('app://localhost/index.html');
});
app.on('window-all-closed', () => { void link?.stop(); app.quit(); });
