const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('oonjaiDesktop', {
  start: () => ipcRenderer.invoke('link:start'),
  stop: () => ipcRenderer.invoke('link:stop'),
  exchange: args => ipcRenderer.invoke('link:exchange', args),
  reply: args => ipcRenderer.invoke('link:reply', args),
  addListener: (_name, callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('link:request', listener);
    return Promise.resolve({ remove: () => ipcRenderer.removeListener('link:request', listener) });
  }
});
