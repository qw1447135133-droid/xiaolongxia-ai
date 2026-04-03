/**
 * Electron 主进程
 * 参考 openhanako/desktop/main.cjs 架构：
 * 1. 启动 WS 服务器子进程
 * 2. 等待服务器就绪
 * 3. 加载 Next.js 前端（dev 模式用 localhost:3000，生产用打包文件）
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

const startupLog = path.join(process.env.APPDATA || process.cwd(), 'xiaolongxia-web-startup.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(arg => {
    if (arg instanceof Error) return `${arg.message}\n${arg.stack || ''}`;
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }
    return String(arg);
  }).join(' ')}\n`;
  try {
    fs.appendFileSync(startupLog, line, 'utf8');
  } catch {}
  console.log(...args);
}

// 使用函数延迟访问 app.isPackaged，避免在 app 初始化前访问
const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = 3001;

let mainWindow = null;
let wsServerProcess = null;
let wsServerModule = null;
let isQuitting = false;

// 防止多实例启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('[main] Another instance is already running, quitting...');
  app.quit();
  process.exit(0);
}

// ── 启动 WS 服务器 ──
async function startWsServer() {
  // dev 模式下 ws-server 由 concurrently 独立启动，避免重复启动导致端口冲突
  if (isDev()) {
    log('[main] dev mode: ws-server started externally, skipping spawn');
    return;
  }

  process.env.WS_PORT = String(WS_PORT);
  process.env.NODE_ENV = 'production';

  const serverModulePath = path.join(app.getAppPath(), 'server', 'ws-server.js');
  log('[main] starting WS server in-process:', serverModulePath);

  try {
    wsServerModule = await import(pathToFileURL(serverModulePath).href);
    log('[main] WS server module imported successfully');
    return;
  } catch (error) {
    log('[main] in-process WS server import failed, fallback to child process', error);
  }

  const serverScript = path.join(process.resourcesPath, 'server', 'ws-server.js');
  log('[main] starting WS server via child process:', serverScript);

  wsServerProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      WS_PORT: String(WS_PORT),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  wsServerProcess.stdout.on('data', (d) => log('[ws-server]', d.toString().trim()));
  wsServerProcess.stderr.on('data', (d) => log('[ws-server][err]', d.toString().trim()));

  wsServerProcess.on('exit', (code) => {
    log('[main] WS server exited with code', code);
    wsServerProcess = null;
  });
}

// ── 等待 WS 服务器就绪（轮询端口）──
function waitForWsServer(timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${WS_PORT}`, () => resolve());
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('WS server timeout'));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    // WS 服务器不是 HTTP，直接用 net 检测端口
    const net = require('net');
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(200);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('WS server timeout'));
        else setTimeout(tryConnect, 300);
      });
      sock.on('timeout', () => {
        sock.destroy();
        if (Date.now() - start > timeout) reject(new Error('WS server timeout'));
        else setTimeout(tryConnect, 300);
      });
      sock.connect(WS_PORT, '127.0.0.1');
    };
    tryConnect();
  });
}

// ── 创建主窗口 ──
function createMainWindow() {
  // 防止重复创建
  if (mainWindow && !mainWindow.isDestroyed()) {
    log('[main] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '🦞 小龙虾 AI 团队',
    backgroundColor: '#0d0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    // 无边框风格（可选）
    // frame: false,
    show: false,
  });

  const productionIndex = path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'index.html');
  const url = 'http://localhost:3000';

  log('[main] Loading target:', isDev() ? url : productionIndex);
  log('[main] __dirname:', __dirname);
  log('[main] process.resourcesPath:', process.resourcesPath);

  const loadPromise = isDev()
    ? mainWindow.loadURL(url)
    : mainWindow.loadFile(productionIndex);

  loadPromise.catch(err => {
    log('[main] Failed to load window:', err);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log('[main] did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.once('ready-to-show', () => {
    log('[main] ready-to-show');
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
      if (isDev()) mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    log('[main] window closed');
    mainWindow = null;
  });

  // 外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── 应用启动 ──
app.whenReady().then(async () => {
  log('[main] app.whenReady');
  // ── IPC：前端获取 WS 端口 ──
  ipcMain.handle('get-ws-port', () => WS_PORT);

  // 处理第二个实例尝试启动
  app.on('second-instance', () => {
    log('[main] Second instance detected, focusing main window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  await startWsServer();

  try {
    await waitForWsServer(15000);
    log('[main] WS server ready');
  } catch (e) {
    log('[main] WS server failed to start:', e);
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// ── 退出时清理 ──
app.on('before-quit', () => {
  log('[main] before-quit');
  isQuitting = true;
  if (wsServerModule?.stopServer) {
    try {
      wsServerModule.stopServer();
      log('[main] Stopped in-process WS server');
    } catch (error) {
      log('[main] Failed to stop in-process WS server', error);
    }
    wsServerModule = null;
  }
  if (wsServerProcess) {
    log('[main] Killing WS server process');
    wsServerProcess.kill('SIGTERM');
    wsServerProcess = null;
  }
});

app.on('window-all-closed', () => {
  log('[main] window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  log('[main] uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  log('[main] unhandledRejection', reason);
});
