// Preload bridge for the desktop shell.
// M0: minimal — the window loads the web host over http, so no bridge is needed yet.
// M2: this file grows a contextBridge that carries fetch/SSE/WS over IPC instead of http.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  version: process.versions.electron,
  platform: process.platform,
});
