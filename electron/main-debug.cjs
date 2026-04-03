/**
 * Electron 主进程 - 调试版本
 */

console.log('=== Starting Electron Main Process ===');

const electron = require('electron');
console.log('electron module:', typeof electron, electron);

if (!electron || typeof electron !== 'object') {
  console.error('ERROR: electron module is not an object!');
  console.error('electron value:', electron);
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, shell } = electron;
console.log('app:', typeof app, app);
console.log('BrowserWindow:', typeof BrowserWindow);

if (!app) {
  console.error('ERROR: app is undefined!');
  console.error('Available keys in electron:', Object.keys(electron));
  process.exit(1);
}

const path = require('path');
const { spawn } = require('child_process');

const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = 3001;

let mainWindow = null;

function createMainWindow() {
  console.log('[main] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '🦞 小龙虾 AI 团队',
    backgroundColor: '#0d0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  const url = 'http://localhost:3000';
  console.log('[main] Loading URL:', url);

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    console.log('[main] Window ready to show');
    mainWindow.show();
    if (isDev()) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    console.log('[main] Window closed');
    mainWindow = null;
  });
}

console.log('[main] Setting up app.whenReady...');
app.whenReady().then(() => {
  console.log('[main] App is ready!');
  ipcMain.handle('get-ws-port', () => WS_PORT);
  createMainWindow();
});

app.on('window-all-closed', () => {
  console.log('[main] All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

console.log('=== Main process script loaded ===');
