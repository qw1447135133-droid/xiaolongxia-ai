#!/usr/bin/env node

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");
const electronBinary = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const nextPort = 3000;
const wsPort = 3001;
const startupLog = path.join(process.env.APPDATA || projectRoot, "xiaolongxia-web-startup.log");
const STARTUP_LOG_MAX_BYTES = 512 * 1024;
const children = [];
let shuttingDown = false;
const cleanMode = process.argv.includes("--clean");

function log(scope, message) {
  process.stdout.write(`[${scope}] ${message}\n`);
}

function logError(scope, message) {
  process.stderr.write(`[${scope}] ${message}\n`);
}

function appendNodeOption(existingValue, option) {
  const normalized = String(existingValue || "").trim();
  if (!normalized) return option;
  if (normalized.split(/\s+/).includes(option)) return normalized;
  return `${normalized} ${option}`;
}

function getNextBin() {
  return process.platform === "win32"
    ? path.join(projectRoot, "node_modules", ".bin", "next.cmd")
    : path.join(projectRoot, "node_modules", ".bin", "next");
}

function isTcpPortOpen(port, host = "127.0.0.1", timeoutMs = 400) {
  return new Promise(resolve => {
    const socket = new net.Socket();

    const finish = result => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function isHttpReady(port, timeoutMs = 800) {
  return new Promise(resolve => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        timeout: timeoutMs,
      },
      response => {
        response.resume();
        resolve(true);
      },
    );

    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });

    request.once("error", () => resolve(false));
  });
}

async function waitFor(check, label, timeoutMs = 30000, intervalMs = 500) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${label} did not become ready within ${timeoutMs}ms.`);
}

function spawnManaged(name, command, args, envOverrides = {}) {
  log(name, `starting ${command} ${args.join(" ")}`.trim());
  const env = {
    ...process.env,
    FORCE_COLOR: "1",
    ...envOverrides,
  };

  if (Object.prototype.hasOwnProperty.call(env, "ELECTRON_RUN_AS_NODE")) {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  const isWindowsCmdShim = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const spawnCommand = isWindowsCmdShim ? process.env.ComSpec || "cmd.exe" : command;
  const spawnArgs = isWindowsCmdShim ? ["/d", "/s", "/c", command, ...args] : args;

  const child = spawn(spawnCommand, spawnArgs, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    shell: false,
  });

  children.push(child);

  child.once("exit", code => {
    if (!shuttingDown && code !== 0) {
      logError(name, `exited with code ${code}`);
    }
  });

  return child;
}

function execForText(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function cleanRepoProcesses() {
  if (process.platform !== "win32") {
    log("clean", "clean mode is currently implemented for Windows only; skipping process cleanup");
    return;
  }

  const escapedRoot = projectRoot.replace(/'/g, "''");
  const command = [
    `$repoRoot = '${escapedRoot}'`,
    `$currentPid = ${process.pid}`,
    `$portPids = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 3000,3001 } | Select-Object -ExpandProperty OwningProcess -Unique)`,
    `$targets = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.ProcessId -ne $currentPid -and (`,
    `    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like "*$repoRoot*") -or`,
    `    ($_.Name -eq 'node.exe' -and (`,
    `      $_.CommandLine -like "*$repoRoot*" -or`,
    `      $_.CommandLine -like "*server\\ws-server.js*" -or`,
    `      $portPids -contains $_.ProcessId`,
    `    ))`,
    `  )`,
    `}`,
    `foreach ($target in $targets) {`,
    `  try {`,
    `    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop`,
    `    Write-Output ("stopped " + $target.Name + " #" + $target.ProcessId)`,
    `  } catch {}`,
    `}`,
  ].join("\n");

  try {
    const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${command}\nexit 0`]);
    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      log("clean", "no repo-specific Electron or Node processes were running");
    } else {
      for (const line of lines) {
        log("clean", line);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1200));
  } catch (error) {
    logError("clean", `failed to stop repo processes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function cleanRepoElectronProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const escapedRoot = projectRoot.replace(/'/g, "''");
  const escapedElectronBinary = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe").replace(/'/g, "''");
  const command = [
    `$repoRoot = '${escapedRoot}'`,
    `$electronBinary = '${escapedElectronBinary}'`,
    `$currentPid = ${process.pid}`,
    `$targets = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.ProcessId -ne $currentPid -and $_.Name -eq 'electron.exe' -and (`,
    `    $_.CommandLine -like "*$repoRoot*" -or`,
    `    $_.ExecutablePath -eq $electronBinary`,
    `  )`,
    `}`,
    `foreach ($target in $targets) {`,
    `  try {`,
    `    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop`,
    `    Write-Output ("stopped electron.exe #" + $target.ProcessId)`,
    `  } catch {}`,
    `}`,
  ].join("\n");

  try {
    const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${command}\nexit 0`]);
    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      log("clean", line);
    }

    if (lines.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  } catch (error) {
    logError("clean", `failed to stop stale Electron processes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

<<<<<<< Updated upstream
=======
function cleanNextArtifacts() {
  const nextDir = path.join(projectRoot, ".next");

  try {
    if (require("fs").existsSync(nextDir)) {
      require("fs").rmSync(nextDir, { recursive: true, force: true });
      log("clean", "removed stale .next artifacts");
    }
  } catch (error) {
    logError("clean", `failed to remove .next artifacts: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function trimStartupLog() {
  try {
    if (!fs.existsSync(startupLog)) return;
    const stats = fs.statSync(startupLog);
    if (stats.size <= STARTUP_LOG_MAX_BYTES) return;
    fs.writeFileSync(startupLog, "", "utf8");
    log("clean", "trimmed stale desktop startup log");
  } catch (error) {
    logError("clean", `failed to trim desktop startup log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

>>>>>>> Stashed changes
async function ensureNextDev() {
  if (await isHttpReady(nextPort)) {
    log("Next", `reusing existing dev server on http://localhost:${nextPort}`);
    return { reused: true };
  }

  const child = spawnManaged("Next", getNextBin(), ["dev", "-p", String(nextPort)], {
    NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, "--no-deprecation"),
  });
  await waitFor(() => isHttpReady(nextPort), "Next dev server");
  log("Next", `ready on http://localhost:${nextPort}`);
  return { reused: false, child };
}

async function ensureWsServer() {
  if (await isTcpPortOpen(wsPort)) {
    log("WS", `reusing existing ws server on tcp://127.0.0.1:${wsPort}`);
    return { reused: true };
  }

  const child = spawnManaged("WS", process.execPath, [path.join("server", "ws-server.js")]);
  await waitFor(() => isTcpPortOpen(wsPort), "WS server");
  log("WS", `ready on tcp://127.0.0.1:${wsPort}`);
  return { reused: false, child };
}

function killStartedChildren() {
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
}

async function main() {
  trimStartupLog();

  if (cleanMode) {
    await cleanRepoProcesses();
  }

  await ensureWsServer();
  await ensureNextDev();

<<<<<<< Updated upstream
  log("Electron", "launching desktop shell");
=======
  if (!cleanMode) {
    await cleanRepoElectronProcesses();
  }

  log("Electron", `launching desktop shell against http://localhost:${next.port}`);
>>>>>>> Stashed changes
  const electronChild = spawnManaged("Electron", electronBinary, ["."], {
    NODE_ENV: "development",
  });

  electronChild.once("exit", code => {
    killStartedChildren();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  killStartedChildren();
  process.exit(130);
});

process.on("SIGTERM", () => {
  killStartedChildren();
  process.exit(143);
});

main().catch(error => {
  logError("electron:dev", error instanceof Error ? error.stack || error.message : String(error));
  killStartedChildren();
  process.exit(1);
});
