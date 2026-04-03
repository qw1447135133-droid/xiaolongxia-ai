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
const fs = require('fs');

const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = 3001;

let mainWindow = null;

function safeExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function tokenizeCommandArgs(rawArgs) {
  if (!Array.isArray(rawArgs)) return [];
  return rawArgs
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
}

function quoteForWindowsStart(value) {
  const stringValue = String(value ?? '');
  if (!stringValue) return '""';
  if (!/[\s"]/u.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

async function launchNativeApplication(payload) {
  const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
  const args = tokenizeCommandArgs(payload?.args);
  const cwd = typeof payload?.cwd === 'string' && payload.cwd.trim()
    ? path.resolve(payload.cwd.trim())
    : undefined;

  if (!target) {
    throw new Error('程序路径或命令不能为空。');
  }

  if (cwd && !safeExists(cwd)) {
    throw new Error('指定的工作目录不存在。');
  }

  try {
    const child = spawn(target, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
      ...(cwd ? { cwd } : {}),
    });
    child.unref();
    return {
      ok: true,
      method: 'spawn',
      message: `已直接启动 ${target}`,
      pid: child.pid ?? null,
    };
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }

    const startCommand = ['start', '""', quoteForWindowsStart(target), ...args.map(quoteForWindowsStart)].join(' ');
    const child = spawn('cmd.exe', ['/d', '/s', '/c', startCommand], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
      ...(cwd ? { cwd } : {}),
    });
    child.unref();
    return {
      ok: true,
      method: 'shell',
      message: `已通过 Windows Shell 启动 ${target}`,
      pid: child.pid ?? null,
    };
  }
}

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

  const url = process.env.NEXT_DEV_URL || 'http://localhost:3000';
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
  ipcMain.handle('launch-native-application', async (_event, payload) => launchNativeApplication(payload));
  createMainWindow();
});

app.on('window-all-closed', () => {
  console.log('[main] All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

console.log('=== Main process script loaded ===');
