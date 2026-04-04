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
const verboseDesktopDebug = process.env.XLX_ELECTRON_DEBUG === '1';
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

function debugLog(...args) {
  if (!verboseDesktopDebug) return;
  log(...args);
}

// 使用函数延迟访问 app.isPackaged，避免在 app 初始化前访问
const isDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged;
const WS_PORT = 3001;

// Electron + Windows 在大量 backdrop-filter / glass 样式下偶发出现首屏空白，
// 这里优先关掉硬件加速，保证桌面端稳定渲染。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-direct-composition');

let mainWindow = null;
let wsServerProcess = null;
let isQuitting = false;
let mainWindowTarget = null;
let mainWindowShowingLoadFallback = false;
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

<<<<<<< Updated upstream
=======
function safeExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDesktopLoadFallbackHtml({ target, errorCode, errorDescription }) {
  const safeTarget = escapeHtml(target);
  const safeError = escapeHtml(errorDescription || '未知加载错误');
  const safeCode = escapeHtml(errorCode ?? 'unknown');
  const checkedAt = escapeHtml(new Date().toLocaleString('zh-CN', { hour12: false }));

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>小龙虾 AI 团队 · 桌面恢复</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1020;
        --panel: rgba(15, 23, 42, 0.88);
        --panel-2: rgba(30, 41, 59, 0.72);
        --border: rgba(148, 163, 184, 0.28);
        --text: #e5eefb;
        --muted: #9fb0c7;
        --accent: #7dd3fc;
        --danger: #fda4af;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(125, 211, 252, 0.14), transparent 28%),
          radial-gradient(circle at bottom right, rgba(248, 113, 113, 0.1), transparent 22%),
          linear-gradient(180deg, #09101d, #0f172a 58%, #111827);
        display: grid;
        place-items: center;
        padding: 28px;
      }
      .shell {
        width: min(760px, 100%);
        border-radius: 28px;
        border: 1px solid var(--border);
        background: linear-gradient(180deg, var(--panel), var(--panel-2));
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        padding: 28px;
        display: grid;
        gap: 18px;
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.75;
      }
      .meta {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.03);
        font-size: 13px;
      }
      .meta strong {
        color: var(--text);
      }
      .meta code {
        color: #f8fafc;
        word-break: break-all;
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 18px;
        font-size: 14px;
        cursor: pointer;
      }
      .primary {
        background: linear-gradient(135deg, #7dd3fc, #38bdf8);
        color: #08111f;
        font-weight: 700;
      }
      .ghost {
        background: rgba(255,255,255,0.06);
        color: var(--text);
        border: 1px solid var(--border);
      }
      .hint {
        color: var(--danger);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="eyebrow">Desktop Recovery</div>
      <h1>桌面工作台暂时无法加载，正在尝试恢复连接。</h1>
      <p>这通常不是业务数据丢失，而是桌面端当前连接的本地页面还没有就绪，或者旧窗口还停留在失效地址上。</p>
      <section class="meta">
        <div><strong>目标地址：</strong><code>${safeTarget}</code></div>
        <div><strong>错误代码：</strong><code>${safeCode}</code></div>
        <div><strong>错误信息：</strong>${safeError}</div>
        <div><strong>检查时间：</strong>${checkedAt}</div>
      </section>
      <div class="actions">
        <button class="primary" id="retry">重新连接</button>
        <button class="ghost" id="relaunch">重新启动桌面端</button>
      </div>
      <p class="hint">如果你刚启动桌面端，等待本地服务就绪后再点一次“重新连接”，通常就能恢复。</p>
    </main>
    <script>
      const retry = document.getElementById('retry');
      const relaunch = document.getElementById('relaunch');
      retry?.addEventListener('click', async () => {
        retry.disabled = true;
        retry.textContent = '正在重新连接...';
        try {
          await window.electronAPI?.reloadDesktopWindow?.();
        } catch (error) {
          retry.disabled = false;
          retry.textContent = '重新连接';
        }
      });
      relaunch?.addEventListener('click', async () => {
        relaunch.disabled = true;
        relaunch.textContent = '正在重新启动...';
        try {
          await window.electronAPI?.relaunchDesktopApp?.();
        } catch (error) {
          relaunch.disabled = false;
          relaunch.textContent = '重新启动桌面端';
        }
      });
    </script>
  </body>
</html>`;
}

function shouldLogRendererConsole(level, message) {
  const normalized = String(message || '');
  if (normalized.includes('Download the React DevTools')) return false;
  if (normalized.includes('[Fast Refresh]')) return false;
  if (normalized.includes('Electron Security Warning')) return false;
  if (normalized.includes('was preloaded using link preload but not used')) return false;
  if (normalized.includes('%c')) return verboseDesktopDebug && level >= 2;
  if (normalized.startsWith('[WS]')) return verboseDesktopDebug;
  return level >= 3;
}

async function showMainWindowLoadFallback(details = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindowShowingLoadFallback = true;
  const target = details.target || mainWindowTarget || 'unknown';
  const html = buildDesktopLoadFallbackHtml({
    target,
    errorCode: details.errorCode,
    errorDescription: details.errorDescription,
  });

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  if (!mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}

async function loadMainWindowTarget() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('当前没有可用的桌面窗口。');
  }

  const productionIndex = path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'index.html');
  const devTargetBase = process.env.NEXT_DEV_URL || 'http://localhost:3000';
  if (isDev()) {
    const devTargetUrl = new URL(devTargetBase);
    devTargetUrl.pathname = '/electron';
    devTargetUrl.searchParams.set('desktop-client', 'electron');
    mainWindowTarget = devTargetUrl.toString();
  } else {
    mainWindowTarget = productionIndex;
  }
  mainWindowShowingLoadFallback = false;

  debugLog('[main] Loading target:', mainWindowTarget);
  debugLog('[main] __dirname:', __dirname);
  debugLog('[main] process.resourcesPath:', process.resourcesPath);

  try {
    if (isDev()) {
      await mainWindow.loadURL(mainWindowTarget);
    } else {
      await mainWindow.loadFile(mainWindowTarget, {
        query: {
          'desktop-client': 'electron',
        },
      });
    }
  } catch (error) {
    log('[main] Failed to load window:', error);
    await showMainWindowLoadFallback({
      target: mainWindowTarget,
      errorDescription: error instanceof Error ? error.message : String(error),
    });
  }
}

function getLocalBin(rootPath, name) {
  return path.join(rootPath, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
}

function escapePowerShellSingleQuoted(value) {
  return String(value ?? '').replace(/'/g, "''");
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

function execForText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {}),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function runPowerShellJson(script) {
  const powerShellCommand =
    process.platform === 'win32'
      ? (
          safeExists(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))
            ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
            : 'powershell.exe'
        )
      : 'powershell';

  const output = await execForText(powerShellCommand, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
  const trimmed = output.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed);
}

function collectProgramIdentitySet(target) {
  const raw = String(target ?? '').trim().toLowerCase();
  if (!raw) return new Set();
  const normalized = raw.replace(/^"+|"+$/g, '');
  const identities = new Set([normalized]);
  const parsed = path.win32.parse(normalized);
  if (parsed.base) identities.add(parsed.base.toLowerCase());
  if (parsed.name) identities.add(parsed.name.toLowerCase());
  return identities;
}

function assertNativeProgramAllowed(payload) {
  const policy = payload?.policy ?? {};
  if (policy.enabled === false) {
    throw new Error('本机程序调用已在设置中关闭。');
  }

  if (!policy.whitelistMode) {
    return;
  }

  const whitelist = Array.isArray(policy.whitelist) ? policy.whitelist : [];
  if (whitelist.length === 0) {
    throw new Error('已开启白名单模式，但白名单为空，请先添加允许启动的程序。');
  }

  const targetIdentities = collectProgramIdentitySet(payload?.target);
  const allowed = whitelist.some(entry => {
    const identities = collectProgramIdentitySet(entry?.target);
    for (const identity of identities) {
      if (targetIdentities.has(identity)) {
        return true;
      }
    }
    return false;
  });

  if (!allowed) {
    throw new Error('当前程序不在白名单内，已拒绝启动。');
  }
}

async function listInstalledApplications(forceRefresh = false) {
  const shouldUseCache =
    !forceRefresh &&
    Array.isArray(installedApplicationsCache.items) &&
    Date.now() - installedApplicationsCache.scannedAt < 60_000;

  if (shouldUseCache) {
    return installedApplicationsCache.items;
  }

  if (process.platform !== 'win32') {
    installedApplicationsCache = {
      items: [],
      scannedAt: Date.now(),
    };
    return [];
  }

  const startMenuDirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]
    .filter(Boolean)
    .map(dir => `'${escapePowerShellSingleQuoted(dir)}'`)
    .join(', ');

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$registryPaths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$entries = New-Object System.Collections.Generic.List[object]
function Add-Entry($name, $target, $source, $location) {
  if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($target)) { return }
  $entries.Add([PSCustomObject]@{
    name = $name.Trim()
    target = $target.Trim('" ')
    source = $source
    location = $location
  })
}
foreach ($registryPath in $registryPaths) {
  Get-ItemProperty $registryPath | ForEach-Object {
    $name = $_.DisplayName
    if ([string]::IsNullOrWhiteSpace($name)) { return }
    $target = $null
    if ($_.DisplayIcon) {
      $target = ($_.DisplayIcon -split ',')[0]
    }
    if ([string]::IsNullOrWhiteSpace($target) -and $_.InstallLocation -and (Test-Path $_.InstallLocation)) {
      $candidate = Get-ChildItem -Path $_.InstallLocation -Filter *.exe -File | Select-Object -First 1
      if ($candidate) { $target = $candidate.FullName }
    }
    Add-Entry $name $target 'registry' $_.InstallLocation
  }
}
$wsh = New-Object -ComObject WScript.Shell
foreach ($dir in @(${startMenuDirs})) {
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem -Path $dir -Recurse -File -Include *.lnk | ForEach-Object {
    $shortcut = $wsh.CreateShortcut($_.FullName)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    $target = $shortcut.TargetPath
    Add-Entry $name $target 'start-menu' $_.DirectoryName
  }
}
$entries |
  Group-Object { "{0}|{1}" -f $_.name.ToLowerInvariant(), $_.target.ToLowerInvariant() } |
  ForEach-Object { $_.Group[0] } |
  Sort-Object name |
  ConvertTo-Json -Depth 4 -Compress
`;

  const scanned = await runPowerShellJson(script);
  const scannedList = Array.isArray(scanned) ? scanned : scanned ? [scanned] : [];
  const normalized = scannedList.map((item, index) => ({
    id: `desktop-app-${index}-${Buffer.from(`${item.name}|${item.target}`).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 12)}`,
    name: item.name,
    target: item.target,
    source: item.source === 'registry' ? 'registry' : 'start-menu',
    ...(item.location ? { location: item.location } : {}),
  }));

  installedApplicationsCache = {
    items: normalized,
    scannedAt: Date.now(),
  };
  return normalized;
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

  assertNativeProgramAllowed(payload);

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

const SEND_KEYS_MODIFIERS = {
  CTRL: '^',
  CONTROL: '^',
  ALT: '%',
  SHIFT: '+',
};

const SEND_KEYS_NAMED = {
  ENTER: '{ENTER}',
  RETURN: '{ENTER}',
  TAB: '{TAB}',
  ESC: '{ESC}',
  ESCAPE: '{ESC}',
  SPACE: ' ',
  BACKSPACE: '{BACKSPACE}',
  DELETE: '{DELETE}',
  DEL: '{DELETE}',
  UP: '{UP}',
  DOWN: '{DOWN}',
  LEFT: '{LEFT}',
  RIGHT: '{RIGHT}',
  HOME: '{HOME}',
  END: '{END}',
  PGUP: '{PGUP}',
  PAGEUP: '{PGUP}',
  PGDN: '{PGDN}',
  PAGEDOWN: '{PGDN}',
  F1: '{F1}',
  F2: '{F2}',
  F3: '{F3}',
  F4: '{F4}',
  F5: '{F5}',
  F6: '{F6}',
  F7: '{F7}',
  F8: '{F8}',
  F9: '{F9}',
  F10: '{F10}',
  F11: '{F11}',
  F12: '{F12}',
};

function normalizeDesktopInputAction(action) {
  const normalized = String(action || '').trim().toLowerCase();
  const allowed = new Set(['move', 'click', 'double_click', 'right_click', 'scroll', 'type', 'key', 'hotkey', 'wait']);
  if (!allowed.has(normalized)) {
    throw new Error(`不支持的桌面输入动作：${action}`);
  }
  return normalized;
}

function normalizeCoordinate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 必须是数字。`);
  }
  return Math.round(parsed);
}

function normalizeDesktopDuration(value, fallbackMs = 120) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return Math.max(0, Math.min(10_000, Math.round(parsed)));
}

function escapePowerShellDoubleQuoted(value) {
  return String(value ?? '').replace(/`/g, '``').replace(/"/g, '`"');
}

function escapeSendKeysText(text) {
  return String(text ?? '').replace(/[+^%~(){}\[\]]/g, (match) => {
    if (match === '{') return '{{}';
    if (match === '}') return '{}}';
    if (match === '[') return '{[}';
    if (match === ']') return '{]}';
    return `{${match}}`;
  });
}

function resolveSendKeysToken(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) {
    throw new Error('按键不能为空。');
  }

  const upper = key.toUpperCase();
  if (SEND_KEYS_NAMED[upper]) {
    return SEND_KEYS_NAMED[upper];
  }

  if (key.length === 1) {
    return escapeSendKeysText(key);
  }

  throw new Error(`暂不支持的按键：${key}`);
}

function buildSendKeysChord(rawKeys) {
  const keys = Array.isArray(rawKeys)
    ? rawKeys.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  if (keys.length === 0) {
    throw new Error('组合键不能为空。');
  }

  const modifiers = [];
  const mainKeys = [];
  for (const key of keys) {
    const upper = key.toUpperCase();
    if (SEND_KEYS_MODIFIERS[upper]) {
      modifiers.push(SEND_KEYS_MODIFIERS[upper]);
      continue;
    }
    if (upper === 'WIN' || upper === 'META' || upper === 'CMD') {
      throw new Error('当前版本暂不支持 Windows / Meta 键。');
    }
    mainKeys.push(resolveSendKeysToken(key));
  }

  if (mainKeys.length === 0) {
    throw new Error('组合键缺少主键。');
  }

  return `${modifiers.join('')}${mainKeys.join('')}`;
}

function detectDesktopVerificationIntent(payload) {
  const source = [
    payload?.intent,
    payload?.target,
    payload?.text,
    payload?.key,
    ...(Array.isArray(payload?.keys) ? payload.keys : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(captcha|otp|2fa|验证码|人机验证|短信验证|验证按钮|滑块验证|二次验证|验证)/i.test(source)
    || payload?.riskCategory === 'verification';
}

function buildDesktopRetrySuggestions(action, x, y) {
  if ((action !== 'click' && action !== 'double_click' && action !== 'right_click') || x === null || y === null) {
    return [];
  }

  const offsets = [
    { label: '右侧微调', dx: 14, dy: 0 },
    { label: '左侧微调', dx: -14, dy: 0 },
    { label: '下方微调', dx: 0, dy: 12 },
    { label: '上方微调', dx: 0, dy: -12 },
    { label: '右下补点', dx: 18, dy: 10 },
    { label: '左上补点', dx: -18, dy: -10 },
  ];

  return offsets.map((offset) => ({
    ...offset,
    nextX: x + offset.dx,
    nextY: y + offset.dy,
  }));
}

async function controlDesktopInput(payload) {
  const action = normalizeDesktopInputAction(payload?.action);
  const policy = payload?.policy ?? {};

  if (policy.enabled === false) {
    throw new Error('桌面鼠标键盘控制已在设置中关闭。');
  }

  if (process.platform !== 'win32') {
    throw new Error('当前桌面输入控制仅支持 Windows Electron 运行态。');
  }

  if (detectDesktopVerificationIntent(payload) && policy.requireManualTakeoverForVerification !== false) {
    return {
      ok: false,
      action,
      mode: 'manual-handoff',
      manualRequired: true,
      message: '检测到验证码或验证场景，已切换到人工接管模式，请人工完成验证后再继续。',
    };
  }

  const x = normalizeCoordinate(payload?.x, 'x');
  const y = normalizeCoordinate(payload?.y, 'y');
  const deltaY = normalizeCoordinate(payload?.deltaY, 'deltaY');
  const durationMs = normalizeDesktopDuration(payload?.durationMs, action === 'wait' ? 600 : 120);
  const text = typeof payload?.text === 'string' ? payload.text : '';
  const key = typeof payload?.key === 'string' ? payload.key : '';
  const rawHotkeys = Array.isArray(payload?.keys) ? payload.keys : [];
  const hotkeySequence = rawHotkeys.length > 0 ? buildSendKeysChord(rawHotkeys) : '';
  const keySequence = key ? buildSendKeysChord([key]) : '';
  const retrySuggestions = buildDesktopRetrySuggestions(action, x, y);

  if ((action === 'move' || action === 'click' || action === 'double_click' || action === 'right_click') && (x === null || y === null)) {
    throw new Error(`${action} 动作需要提供 x 和 y 坐标。`);
  }

  if (action === 'scroll' && deltaY === null) {
    throw new Error('scroll 动作需要提供 deltaY。');
  }

  if (action === 'type' && !text) {
    throw new Error('type 动作需要提供 text。');
  }

  if (action === 'key' && !key) {
    throw new Error('key 动作需要提供 key。');
  }

  if (action === 'hotkey' && !hotkeySequence) {
    throw new Error('hotkey 动作需要提供 keys。');
  }

  const escapedText = escapePowerShellDoubleQuoted(escapeSendKeysText(text));
  const escapedHotkey = escapePowerShellDoubleQuoted(hotkeySequence);
  const escapedKey = escapePowerShellDoubleQuoted(keySequence);
  const clickButton = action === 'right_click' ? 'right' : 'left';

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DesktopInputNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
function Get-CursorPoint {
  $point = New-Object DesktopInputNative+POINT
  [DesktopInputNative]::GetCursorPos([ref]$point) | Out-Null
  return @{ x = $point.X; y = $point.Y }
}
function Invoke-MouseClick([string]$button) {
  if ($button -eq 'right') {
    [DesktopInputNative]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 45
    [DesktopInputNative]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
    return
  }
  [DesktopInputNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 45
  [DesktopInputNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}
$action = "${action}"
$x = ${x === null ? '$null' : x}
$y = ${y === null ? '$null' : y}
$deltaY = ${deltaY === null ? '$null' : deltaY}
$durationMs = ${durationMs}
$button = "${clickButton}"
$text = "${escapedText}"
$hotkey = "${escapedHotkey}"
$keySequence = "${escapedKey}"
$message = ""
$retryStrategy = ""
switch ($action) {
  'move' {
    [DesktopInputNative]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds $durationMs
    $message = "已移动鼠标到 ($x, $y)"
  }
  'click' {
    [DesktopInputNative]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 80
    Invoke-MouseClick $button
    Start-Sleep -Milliseconds $durationMs
    $retryStrategy = "visual-recheck-offset"
    $message = "已在 ($x, $y) 执行鼠标点击；若界面未变化，请先截图复核，再按附近偏移点补点一次。"
  }
  'double_click' {
    [DesktopInputNative]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 80
    Invoke-MouseClick $button
    Start-Sleep -Milliseconds 120
    Invoke-MouseClick $button
    Start-Sleep -Milliseconds $durationMs
    $retryStrategy = "visual-recheck-offset"
    $message = "已在 ($x, $y) 执行鼠标双击；若界面未变化，请先截图复核，再按附近偏移点补点一次。"
  }
  'right_click' {
    [DesktopInputNative]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 80
    Invoke-MouseClick $button
    Start-Sleep -Milliseconds $durationMs
    $retryStrategy = "visual-recheck-offset"
    $message = "已在 ($x, $y) 执行鼠标右键；若菜单未出现，请先截图复核，再按附近偏移点补点一次。"
  }
  'scroll' {
    [DesktopInputNative]::mouse_event(0x0800, 0, 0, [uint32]([int]$deltaY), [UIntPtr]::Zero)
    Start-Sleep -Milliseconds $durationMs
    $message = "已滚动鼠标滚轮 $deltaY"
  }
  'type' {
    [System.Windows.Forms.SendKeys]::SendWait($text)
    Start-Sleep -Milliseconds $durationMs
    $message = "已输入文本"
  }
  'key' {
    [System.Windows.Forms.SendKeys]::SendWait($keySequence)
    Start-Sleep -Milliseconds $durationMs
    $message = "已发送按键 ${escapePowerShellDoubleQuoted(key || '')}"
  }
  'hotkey' {
    [System.Windows.Forms.SendKeys]::SendWait($hotkey)
    Start-Sleep -Milliseconds $durationMs
    $message = "已发送组合键"
  }
  'wait' {
    Start-Sleep -Milliseconds $durationMs
    $message = "已等待 $durationMs ms"
  }
  default {
    throw "Unsupported action: $action"
  }
}
$result = @{
  ok = $true
  action = $action
  mode = 'executed'
  manualRequired = $false
  message = $message
  retryStrategy = if ($retryStrategy) { $retryStrategy } else { $null }
  cursor = Get-CursorPoint
}
$result | ConvertTo-Json -Compress
`;

  const result = await runPowerShellJson(script);
  return typeof result === 'object' && result
    ? {
      ...result,
      ...(retrySuggestions.length > 0 ? { retrySuggestions } : {}),
    }
    : {
      ok: true,
      action,
      mode: 'executed',
      manualRequired: false,
      message: '桌面输入动作已执行。',
      ...(retrySuggestions.length > 0 ? { retryStrategy: 'visual-recheck-offset', retrySuggestions } : {}),
    };
}

async function captureDesktopScreenshot(payload = {}) {
  if (process.platform !== 'win32') {
    throw new Error('当前桌面截图仅支持 Windows Electron 运行态。');
  }

  const maxWidth = Math.max(480, Math.min(1920, Number(payload?.maxWidth) || 1440));
  const quality = Math.max(45, Math.min(90, Number(payload?.quality) || 72));

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$sourceBitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($sourceBitmap)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$targetWidth = [Math]::Min(${Math.round(maxWidth)}, $bounds.Width)
$targetHeight = if ($targetWidth -lt $bounds.Width) { [int][Math]::Round($bounds.Height * ($targetWidth / $bounds.Width)) } else { $bounds.Height }
$outputBitmap = if ($targetWidth -ne $bounds.Width) { New-Object System.Drawing.Bitmap $targetWidth, $targetHeight } else { $sourceBitmap }
if ($targetWidth -ne $bounds.Width) {
  $resizedGraphics = [System.Drawing.Graphics]::FromImage($outputBitmap)
  $resizedGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resizedGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $resizedGraphics.DrawImage($sourceBitmap, 0, 0, $targetWidth, $targetHeight)
  $resizedGraphics.Dispose()
}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoder = [System.Drawing.Imaging.Encoder]::Quality
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]${Math.round(quality)})
$stream = New-Object System.IO.MemoryStream
$outputBitmap.Save($stream, $codec, $encoderParams)
$base64 = [System.Convert]::ToBase64String($stream.ToArray())
$result = @{
  ok = $true
  message = '已抓取当前桌面截图。'
  dataUrl = "data:image/jpeg;base64,$base64"
  width = $targetWidth
  height = $targetHeight
  format = 'jpeg'
}
$graphics.Dispose()
if ($outputBitmap -ne $sourceBitmap) { $outputBitmap.Dispose() }
$sourceBitmap.Dispose()
$stream.Dispose()
$result | ConvertTo-Json -Compress
`;

  const result = await runPowerShellJson(script);
  if (typeof result === 'object' && result) {
    return result;
  }

  throw new Error('桌面截图返回了无效结果。');
}

function readWorkspacePackageJson(rootPath) {
  const packagePath = path.join(rootPath, 'package.json');
  if (!safeExists(packagePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveVerificationPlan(rootPath) {
  const packageJson = readWorkspacePackageJson(rootPath);
  const scripts = packageJson && packageJson.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts
    : {};
  const plan = [];

  if (typeof scripts.build === 'string' && scripts.build.trim()) {
    plan.push({
      id: 'build',
      label: 'Build',
      command: getNpmCommand(),
      args: ['run', 'build'],
      displayCommand: 'npm run build',
    });
  }

  if (typeof scripts.typecheck === 'string' && scripts.typecheck.trim()) {
    plan.push({
      id: 'typecheck',
      label: 'Typecheck',
      command: getNpmCommand(),
      args: ['run', 'typecheck'],
      displayCommand: 'npm run typecheck',
    });
  } else {
    const tscBin = getLocalBin(rootPath, 'tsc');
    const tsconfigPath = path.join(rootPath, 'tsconfig.json');
    if (safeExists(tscBin) && safeExists(tsconfigPath)) {
      plan.push({
        id: 'typecheck',
        label: 'Typecheck',
        command: tscBin,
        args: ['--noEmit'],
        displayCommand: process.platform === 'win32' ? '.\\node_modules\\.bin\\tsc.cmd --noEmit' : './node_modules/.bin/tsc --noEmit',
      });
    }
  }

  if (typeof scripts.lint === 'string' && scripts.lint.trim()) {
    plan.push({
      id: 'lint',
      label: 'Lint',
      command: getNpmCommand(),
      args: ['run', 'lint'],
      displayCommand: 'npm run lint',
    });
  }

  return plan;
}

function runVerificationCommand(step, cwd) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(step.command, step.args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: '1',
      },
    });

    const finalize = (status, extraOutput = '') => {
      if (settled) return;
      settled = true;
      const completedAt = Date.now();
      const mergedOutput = [stdout.trim(), stderr.trim(), extraOutput.trim()]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 12000);

      resolve({
        id: step.id,
        label: step.label,
        status,
        command: step.displayCommand,
        output: mergedOutput,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
      });
    };

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finalize('failed', `Verification step timed out after ${VERIFICATION_TIMEOUT_MS}ms.`);
    }, VERIFICATION_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 12000) stdout = stdout.slice(-12000);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      finalize('failed', error.message || String(error));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      finalize(code === 0 ? 'passed' : 'failed', code === 0 ? '' : `Process exited with code ${code}.`);
    });
  });
}

async function runWorkspaceVerification(targetPath) {
  const { canonicalPath } = assertWorkspacePathAllowed(targetPath);
  const plan = resolveVerificationPlan(canonicalPath);

  if (plan.length === 0) {
    return {
      status: 'skipped',
      rootPath: canonicalPath,
      results: [],
    };
  }

  const results = [];
  for (const step of plan) {
    const result = await runVerificationCommand(step, canonicalPath);
    results.push(result);
    if (result.status === 'failed') {
      break;
    }
  }

  return {
    status: results.some(item => item.status === 'failed') ? 'failed' : 'passed',
    rootPath: canonicalPath,
    results,
  };
}

>>>>>>> Stashed changes
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
    debugLog('[main] Window already exists, focusing...');
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '🦞 小龙虾 AI 团队',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
    // 无边框风格（可选）
    // frame: false,
    show: true,
  });

<<<<<<< Updated upstream
  const productionIndex = path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'index.html');
  const url = 'http://localhost:3000';
=======
  loadMainWindowTarget();
>>>>>>> Stashed changes

  mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log('[main] did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
    if (!isMainFrame) {
      return;
    }
    await showMainWindowLoadFallback({
      target: validatedURL || mainWindowTarget,
      errorCode,
      errorDescription,
    });
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (shouldLogRendererConsole(level, message)) {
      log('[renderer:console]', { level, message, line, sourceId });
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('[renderer:gone]', details);
  });
  mainWindow.webContents.on('unresponsive', () => {
    log('[renderer] unresponsive');
  });
  mainWindow.webContents.on('responsive', () => {
    debugLog('[renderer] responsive');
  });
  mainWindow.webContents.on('dom-ready', () => {
    debugLog('[renderer] dom-ready');
  });
  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('[renderer] did-finish-load');
  });

  mainWindow.once('ready-to-show', () => {
    debugLog('[main] ready-to-show');
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', () => {
    debugLog('[main] window close requested');
    isQuitting = true;
  });

  mainWindow.on('closed', () => {
    debugLog('[main] window closed');
    mainWindow = null;
  });

  // 外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

<<<<<<< Updated upstream
=======
function reloadDesktopWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('当前没有可重载的桌面窗口。');
  }

  if (mainWindowShowingLoadFallback) {
    void loadMainWindowTarget();
  } else {
    mainWindow.webContents.reloadIgnoringCache();
  }
  return {
    ok: true,
    message: mainWindowShowingLoadFallback ? '已请求重新加载桌面目标页面。' : '已请求重载当前桌面窗口。',
  };
}

function relaunchDesktopApp() {
  app.relaunch();
  setTimeout(() => {
    app.exit(0);
  }, 120);
  return {
    ok: true,
    message: '已请求重启 Electron 桌面实例。',
  };
}

>>>>>>> Stashed changes
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
      if (isDev()) {
        log('[main] Dev second-instance: reloading existing main window');
        mainWindow.webContents.reloadIgnoringCache();
      }
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
