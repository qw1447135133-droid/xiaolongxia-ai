// Preload 脚本：安全地暴露 IPC 给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWsPort: () => ipcRenderer.invoke('get-ws-port'),
  isElectron: true,
});
