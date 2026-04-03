// Preload 脚本：安全地暴露 IPC 给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWsPort: () => ipcRenderer.invoke('get-ws-port'),
  selectWorkspaceFolder: () => ipcRenderer.invoke('select-workspace-folder'),
  listWorkspaceEntries: (targetPath) => ipcRenderer.invoke('list-workspace-entries', targetPath),
  readWorkspacePreview: (targetPath) => ipcRenderer.invoke('read-workspace-preview', targetPath),
  openWorkspacePath: (targetPath) => ipcRenderer.invoke('open-workspace-path', targetPath),
  openWorkspacePreviewWindow: (preview) => ipcRenderer.invoke('open-workspace-preview-window', preview),
  runWorkspaceVerification: (targetPath) => ipcRenderer.invoke('run-workspace-verification', targetPath),
  launchNativeApplication: (payload) => ipcRenderer.invoke('launch-native-application', payload),
  listInstalledApplications: (forceRefresh) => ipcRenderer.invoke('list-installed-applications', forceRefresh),
  isElectron: true,
});
