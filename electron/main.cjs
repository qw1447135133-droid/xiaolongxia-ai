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
  try {
    console.log(...args);
  } catch {}
}

// 使用函数延迟访问 app.isPackaged，避免在 app 初始化前访问
const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = 3001;

let mainWindow = null;
let wsServerProcess = null;
let isQuitting = false;
const allowedWorkspaceRoots = new Set();
const previewWindows = new Map();

const WORKSPACE_LIST_LIMIT = 500;
const TEXT_PREVIEW_LIMIT = 512 * 1024;
const IMAGE_PREVIEW_LIMIT = 6 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.htm',
  '.xml', '.yml', '.yaml', '.toml', '.ini', '.env', '.csv', '.log', '.py', '.java', '.c', '.cpp', '.h',
  '.hpp', '.rs', '.go', '.php', '.sh', '.bat', '.cmd', '.sql'
]);
const LANGUAGE_BY_EXTENSION = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.py': 'python',
  '.sh': 'bash',
  '.sql': 'sql',
};

// 防止多实例启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('[main] Another instance is already running, quitting...');
  app.quit();
  process.exit(0);
}

function toCanonicalPath(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('A valid workspace path is required.');
  }
  const resolved = path.resolve(String(targetPath));
  return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
}

function isPathWithinRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function getWorkspaceRootForPath(targetPath) {
  const matches = [...allowedWorkspaceRoots]
    .filter(rootPath => isPathWithinRoot(rootPath, targetPath))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

function assertWorkspacePathAllowed(targetPath) {
  const canonicalPath = toCanonicalPath(targetPath);
  const rootPath = getWorkspaceRootForPath(canonicalPath);
  if (!rootPath) {
    throw new Error('Path is outside the selected workspace.');
  }
  return { canonicalPath, rootPath };
}

function sortWorkspaceEntries(entries) {
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

async function readFileSlice(targetPath, maxBytes) {
  const handle = await fs.promises.open(targetPath, 'r');
  try {
    const buffer = Buffer.alloc(Math.max(maxBytes, 1));
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  if (sample.includes(0)) return false;
  let suspiciousBytes = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspiciousBytes += 1;
  }
  return suspiciousBytes / Math.max(sample.length, 1) < 0.08;
}

function getImageMimeType(extension) {
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return `image/${extension.slice(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPreviewWindowHtml(preview) {
  const title = escapeHtml(preview.name || 'Workspace Preview');
  const subtitle = escapeHtml(preview.path || '');
  const badges = [
    preview.kind,
    preview.language,
    preview.truncated ? 'truncated' : '',
  ].filter(Boolean).map(item => `<span class="badge">${escapeHtml(item)}</span>`).join('');

  let body = '';
  if (preview.kind === 'image' && preview.dataUrl) {
    body = `<div class="image-wrap"><img src="${preview.dataUrl}" alt="${title}" class="image" /></div>`;
  } else if (preview.kind === 'text') {
    body = `<pre class="code">${escapeHtml(preview.content || '')}</pre>`;
  } else {
    body = `
      <div class="meta-grid">
        <div class="meta-card"><span>Type</span><strong>${escapeHtml(preview.kind || 'unknown')}</strong></div>
        <div class="meta-card"><span>Size</span><strong>${escapeHtml(String(preview.size ?? 0))} bytes</strong></div>
        <div class="meta-card"><span>Updated</span><strong>${escapeHtml(new Date(preview.modifiedAt || Date.now()).toLocaleString())}</strong></div>
        ${typeof preview.itemCount === 'number' ? `<div class="meta-card"><span>Items</span><strong>${escapeHtml(String(preview.itemCount))}</strong></div>` : ''}
        ${preview.message ? `<div class="meta-card meta-card-wide"><span>Message</span><strong>${escapeHtml(preview.message)}</strong></div>` : ''}
      </div>
    `;
  }

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #0d1016;
          --card: rgba(255,255,255,0.04);
          --line: rgba(255,255,255,0.12);
          --text: #eef2ff;
          --muted: #9aa4bf;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Segoe UI", "PingFang SC", sans-serif;
          background:
            radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 28%),
            radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.14), transparent 24%),
            var(--bg);
          color: var(--text);
        }
        .shell {
          min-height: 100vh;
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .hero, .panel {
          border: 1px solid var(--line);
          background: var(--card);
          border-radius: 24px;
          backdrop-filter: blur(12px);
        }
        .hero { padding: 22px 24px; }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .title {
          margin-top: 8px;
          font-size: 24px;
          font-weight: 700;
          word-break: break-all;
        }
        .subtitle {
          margin-top: 8px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.7;
          word-break: break-all;
        }
        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }
        .badge {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          color: var(--muted);
          font-size: 11px;
        }
        .panel {
          flex: 1;
          min-height: 0;
          padding: 20px;
          overflow: auto;
        }
        .image-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100%;
          padding: 8px;
        }
        .image {
          max-width: 100%;
          max-height: calc(100vh - 220px);
          border-radius: 18px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.35);
        }
        .code {
          margin: 0;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(4, 8, 18, 0.72);
          color: #dbeafe;
          white-space: pre-wrap;
          word-break: break-word;
          font: 13px/1.8 Consolas, monospace;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .meta-card {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.03);
        }
        .meta-card-wide { grid-column: 1 / -1; }
        .meta-card span {
          color: var(--muted);
          font-size: 12px;
          display: block;
          margin-bottom: 10px;
        }
        .meta-card strong {
          font-size: 15px;
          line-height: 1.7;
          word-break: break-word;
        }
      </style>
    </head>
    <body>
      <main class="shell">
        <section class="hero">
          <div class="eyebrow">Detached Preview</div>
          <div class="title">${title}</div>
          <div class="subtitle">${subtitle}</div>
          <div class="badges">${badges}</div>
        </section>
        <section class="panel">${body}</section>
      </main>
    </body>
  </html>`;
}

function openWorkspacePreviewWindow(preview) {
  if (!preview || typeof preview !== 'object') {
    throw new Error('A preview payload is required.');
  }

  const { canonicalPath } = assertWorkspacePathAllowed(preview.path);
  const existingWindow = previewWindows.get(canonicalPath);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    return;
  }

  const previewWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: `${preview.name || 'Preview'} - Desk`,
    backgroundColor: '#0d1016',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  previewWindows.set(canonicalPath, previewWindow);
  previewWindow.on('closed', () => {
    previewWindows.delete(canonicalPath);
  });

  previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPreviewWindowHtml(preview))}`);
}

async function buildWorkspacePreview(targetPath) {
  const { canonicalPath } = assertWorkspacePathAllowed(targetPath);
  const stat = await fs.promises.stat(canonicalPath);
  const extension = path.extname(canonicalPath).toLowerCase();
  const basePreview = {
    path: canonicalPath,
    name: path.basename(canonicalPath),
    extension: extension.replace(/^\./, ''),
    size: stat.size,
    modifiedAt: stat.mtimeMs,
  };

  if (stat.isDirectory()) {
    const entries = await fs.promises.readdir(canonicalPath);
    return {
      ...basePreview,
      kind: 'directory',
      itemCount: entries.length,
      message: '这是一个文件夹。点击左侧目录可以继续深入浏览。',
    };
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    if (stat.size > IMAGE_PREVIEW_LIMIT) {
      return {
        ...basePreview,
        kind: 'unsupported',
        message: `图片超过 ${(IMAGE_PREVIEW_LIMIT / 1024 / 1024).toFixed(0)} MB，当前只显示元数据。`,
      };
    }
    const buffer = await fs.promises.readFile(canonicalPath);
    return {
      ...basePreview,
      kind: 'image',
      dataUrl: `data:${getImageMimeType(extension)};base64,${buffer.toString('base64')}`,
    };
  }

  const buffer = await readFileSlice(canonicalPath, TEXT_PREVIEW_LIMIT);
  const truncated = stat.size > TEXT_PREVIEW_LIMIT;
  if (TEXT_EXTENSIONS.has(extension) || looksLikeText(buffer)) {
    return {
      ...basePreview,
      kind: 'text',
      content: buffer.toString('utf8'),
      truncated,
      language: LANGUAGE_BY_EXTENSION[extension] ?? 'text',
      message: truncated ? '文件较大，当前仅显示开头片段。' : undefined,
    };
  }

  return {
    ...basePreview,
    kind: 'binary',
    message: '当前文件类型不适合内联预览，已显示基础信息。',
  };
}

async function listWorkspaceEntries(targetPath) {
  const { canonicalPath, rootPath } = assertWorkspacePathAllowed(targetPath);
  const stat = await fs.promises.stat(canonicalPath);
  if (!stat.isDirectory()) {
    throw new Error('Selected path is not a directory.');
  }

  const dirents = await fs.promises.readdir(canonicalPath, { withFileTypes: true });
  const entries = [];

  for (const dirent of dirents.slice(0, WORKSPACE_LIST_LIMIT)) {
    try {
      const absolutePath = path.join(canonicalPath, dirent.name);
      const realPath = toCanonicalPath(absolutePath);
      if (!isPathWithinRoot(rootPath, realPath)) {
        continue;
      }
      const entryStat = await fs.promises.stat(realPath);
      entries.push({
        name: dirent.name,
        path: realPath,
        kind: entryStat.isDirectory() ? 'directory' : 'file',
        extension: path.extname(dirent.name).replace(/^\./, '').toLowerCase(),
        size: entryStat.size,
        modifiedAt: entryStat.mtimeMs,
      });
    } catch (error) {
      log('[main] failed to inspect workspace entry', dirent.name, error);
    }
  }

  return {
    rootPath,
    currentPath: canonicalPath,
    parentPath: canonicalPath === rootPath ? null : path.dirname(canonicalPath),
    entries: sortWorkspaceEntries(entries),
  };
}

// ── 启动 WS 服务器 ──
async function startWsServer() {
  // dev 模式下 ws-server 由 concurrently 独立启动，避免重复启动导致端口冲突
  if (isDev()) {
    log('[main] dev mode: ws-server started externally, skipping spawn');
    return;
  }

  const bootstrapScript = path.join(app.getAppPath(), 'electron', 'ws-bootstrap.cjs');
  log('[main] starting WS server via bootstrap:', bootstrapScript);

  wsServerProcess = spawn(process.execPath, [bootstrapScript], {
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

  mainWindow.on('close', () => {
    log('[main] window close requested');
    isQuitting = true;
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
  // ── IPC：前端获取 WS 端口与 Desk 工作区 ──
  ipcMain.handle('get-ws-port', () => WS_PORT);
  ipcMain.handle('select-workspace-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const rootPath = toCanonicalPath(result.filePaths[0]);
    allowedWorkspaceRoots.add(rootPath);
    return rootPath;
  });
  ipcMain.handle('list-workspace-entries', async (_event, targetPath) => listWorkspaceEntries(targetPath));
  ipcMain.handle('read-workspace-preview', async (_event, targetPath) => buildWorkspacePreview(targetPath));
  ipcMain.handle('open-workspace-path', async (_event, targetPath) => {
    const { canonicalPath } = assertWorkspacePathAllowed(targetPath);
    const openError = await shell.openPath(canonicalPath);
    if (openError) {
      throw new Error(openError);
    }
  });
  ipcMain.handle('open-workspace-preview-window', async (_event, preview) => {
    openWorkspacePreviewWindow(preview);
  });

  // 处理第二个实例尝试启动
  app.on('second-instance', () => {
    log('[main] Second instance detected, focusing main window');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return;
    }

    log('[main] No live main window found for existing instance, recreating window');
    createMainWindow();
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
