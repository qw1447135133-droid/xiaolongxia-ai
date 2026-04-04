// Preload 脚本：安全地暴露 IPC 给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

function markElectronRuntime() {
  try {
    globalThis.__XLX_ELECTRON__ = true;
  } catch {}

  const applyMarker = () => {
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute('data-runtime', 'electron');
      }
      if (document.body) {
        document.body.classList.add('runtime-electron');
      }
    } catch {}
  };

  try {
    window.__XLX_ELECTRON__ = true;
  } catch {}

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyMarker, { once: true });
    } else {
      applyMarker();
    }
  }
}

markElectronRuntime();

contextBridge.exposeInMainWorld('electronAPI', {
  getWsPort: () => ipcRenderer.invoke('get-ws-port'),
  selectWorkspaceFolder: () => ipcRenderer.invoke('select-workspace-folder'),
  listWorkspaceEntries: (targetPath) => ipcRenderer.invoke('list-workspace-entries', targetPath),
  readWorkspacePreview: (targetPath) => ipcRenderer.invoke('read-workspace-preview', targetPath),
  openWorkspacePath: (targetPath) => ipcRenderer.invoke('open-workspace-path', targetPath),
  openWorkspacePreviewWindow: (preview) => ipcRenderer.invoke('open-workspace-preview-window', preview),
  isElectron: true,
});
