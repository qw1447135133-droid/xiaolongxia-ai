#!/usr/bin/env node

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const electronBinary = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const nextPort = 3000;
const wsPort = 3001;
const children = [];
let shuttingDown = false;
const cleanMode = process.argv.includes("--clean");

function log(scope, message) {
  process.stdout.write(`[${scope}] ${message}\n`);
}

function logError(scope, message) {
  process.stderr.write(`[${scope}] ${message}\n`);
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
  const useShell = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const env = {
    ...process.env,
    FORCE_COLOR: "1",
    ...envOverrides,
  };

  if (Object.prototype.hasOwnProperty.call(env, "ELECTRON_RUN_AS_NODE")) {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
    shell: useShell,
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

  const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
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
}

async function ensureNextDev() {
  if (await isHttpReady(nextPort)) {
    log("Next", `reusing existing dev server on http://localhost:${nextPort}`);
    return { reused: true };
  }

  const child = spawnManaged("Next", getNextBin(), ["dev", "-p", String(nextPort)]);
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
  if (cleanMode) {
    await cleanRepoProcesses();
  }

  await ensureWsServer();
  await ensureNextDev();

  log("Electron", "launching desktop shell");
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
