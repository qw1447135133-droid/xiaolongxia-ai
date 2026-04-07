/**
 * Electron 主进程
 * 参考 openhanako/desktop/main.cjs 架构：
 * 1. 启动 WS 服务器子进程
 * 2. 等待服务器就绪
 * 3. 加载 Next.js 前端（dev 模式用 localhost:3000，生产用打包文件）
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// ── 加载 .env.local（强制覆盖，优先级高于系统环境变量）──
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) {
        if (m[2].trim() === "") {
          delete process.env[m[1]]; // 空值 = 清除系统环境变量
        } else {
          process.env[m[1]] = m[2].trim();
        }
      }
    }
    console.log('[main] .env.local loaded');
  } catch (e) {
    console.warn('[main] .env.local not found, using system env');
  }
}
loadEnvLocal();

// 使用函数延迟访问 app.isPackaged，避免在 app 初始化前访问
const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = Number(process.env.WS_PORT || 3001);

let mainWindow = null;
let wsServerProcess = null;

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

async function selectNativeApplicationFile() {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: '选择应用程序',
    buttonLabel: '选择应用',
    properties: ['openFile'],
    filters: [
      { name: '应用程序', extensions: ['exe', 'lnk', 'bat', 'cmd', 'com'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

// ── 启动 WS 服务器 ──
function startWsServer() {
  const serverScript = isDev()
    ? path.join(__dirname, '..', 'server', 'ws-server.js')
    : path.join(process.resourcesPath, 'server', 'ws-server.js');

  console.log('[main] starting WS server:', serverScript);

  wsServerProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      WS_PORT: String(WS_PORT),
      NODE_ENV: isDev() ? 'development' : 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  wsServerProcess.stdout.on('data', (d) => console.log('[ws-server]', d.toString().trim()));
  wsServerProcess.stderr.on('data', (d) => console.error('[ws-server]', d.toString().trim()));

  wsServerProcess.on('exit', (code) => {
    console.log('[main] WS server exited with code', code);
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'STARCRAW',
    backgroundColor: '#0d0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // 无边框风格（可选）
    // frame: false,
    show: false,
  });

  const url = isDev()
    ? (process.env.NEXT_DEV_URL || 'http://localhost:3000')
    : `file://${path.join(__dirname, 'out', 'index.html')}`;

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev()) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // 外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── 应用启动 ──
app.whenReady().then(async () => {
  // ── IPC：前端获取 WS 端口 ──
  ipcMain.handle('get-ws-port', () => WS_PORT);
  ipcMain.handle('launch-native-application', async (_event, payload) => launchNativeApplication(payload));
  ipcMain.handle('select-native-application-file', async () => selectNativeApplicationFile());

  startWsServer();

  try {
    await waitForWsServer(15000);
    console.log('[main] WS server ready');
  } catch (e) {
    console.error('[main] WS server failed to start:', e.message);
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// ── 退出时清理 ──
app.on('before-quit', () => {
  if (wsServerProcess) {
    wsServerProcess.kill('SIGTERM');
    wsServerProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
