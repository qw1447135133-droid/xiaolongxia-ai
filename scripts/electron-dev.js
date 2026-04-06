#!/usr/bin/env node

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const electronBinary = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const preferredNextPort = Number(process.env.XLX_NEXT_PORT || 3000);
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

function waitForChildExit(child, label) {
  return new Promise((_, reject) => {
    child.once("exit", code => {
      if (shuttingDown) {
        return;
      }
      reject(new Error(`${label} exited before becoming ready (code ${code ?? "unknown"}).`));
    });
    child.once("error", error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function isElectronRouteReady(port, timeoutMs = 3000) {
  return new Promise(resolve => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/electron?desktop-client=electron",
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

async function waitForReadyOrChildExit(child, check, label, timeoutMs = 60000, intervalMs = 500) {
  await Promise.race([
    waitFor(check, label, timeoutMs, intervalMs),
    waitForChildExit(child, label),
  ]);
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

function isRepoOwnedCommandLine(commandLine) {
  if (!commandLine) return false;
  return String(commandLine).toLowerCase().includes(projectRoot.toLowerCase());
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

async function getPortOwnerCommandLine(port) {
  if (process.platform !== "win32") return null;

  const command = [
    `$connection = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `if (-not $connection) { return }`,
    `$process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $connection.OwningProcess)`,
    `if ($process -and $process.CommandLine) { Write-Output $process.CommandLine }`,
  ].join("\n");

  try {
    const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
    const trimmed = output.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function findAvailablePort(startPort, maxAttempts = 12) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    // If TCP connect fails, we can safely try this port.
    if (!(await isTcpPortOpen(candidate))) {
      return candidate;
    }
  }

  throw new Error(`No available port found starting from ${startPort}.`);
}

async function cleanRepoProcesses() {
  if (process.platform !== "win32") {
    log("clean", "clean mode is currently implemented for Windows only; skipping process cleanup");
    return;
  }

  const escapedRoot = projectRoot.replace(/'/g, "''");
  const escapedElectronBinary = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe").replace(/'/g, "''");
  const command = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$repoRoot = '${escapedRoot}'`,
    `$electronBinary = '${escapedElectronBinary}'`,
    `$currentPid = ${process.pid}`,
    `$portPids = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 3000,3001 } | Select-Object -ExpandProperty OwningProcess -Unique)`,
    `$targets = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.ProcessId -ne $currentPid -and (`,
    `    ($_.Name -eq 'electron.exe' -and (`,
    `      $_.CommandLine -like "*$repoRoot*" -or`,
    `      $_.ExecutablePath -eq $electronBinary`,
    `    )) -or`,
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
    `exit 0`,
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

async function cleanRepoElectronProcesses() {
  if (process.platform !== "win32") {
    return;
  }

  const escapedRoot = projectRoot.replace(/'/g, "''");
  const escapedElectronBinary = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe").replace(/'/g, "''");
  const command = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$repoRoot = '${escapedRoot}'`,
    `$electronBinary = '${escapedElectronBinary}'`,
    `$currentPid = ${process.pid}`,
    `$targets = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.ProcessId -ne $currentPid -and`,
    `  $_.Name -eq 'electron.exe' -and (`,
    `    $_.CommandLine -like "*$repoRoot*" -or`,
    `    $_.ExecutablePath -eq $electronBinary`,
    `  )`,
    `}`,
    `foreach ($target in $targets) {`,
    `  try {`,
    `    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop`,
    `    Write-Output ("stopped " + $target.Name + " #" + $target.ProcessId)`,
    `  } catch {}`,
    `}`,
    `exit 0`,
  ].join("\n");

  const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    log("clean", line);
  }

  if (lines.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function stopPortOwnerProcess(port, label = `port ${port}`) {
  if (process.platform !== "win32") {
    return false;
  }

  const command = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$connection = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    `if (-not $connection) { exit 0 }`,
    `$process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $connection.OwningProcess)`,
    `if (-not $process) { exit 0 }`,
    `try {`,
    `  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop`,
    `  Write-Output ("stopped " + $process.Name + " #" + $process.ProcessId)`,
    `} catch {}`,
    `exit 0`,
  ].join("\n");

  const output = await execForText("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    log("clean", `${label}: ${line}`);
  }

  if (lines.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  return false;
}

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

async function ensureNextDev() {
  let nextPort = preferredNextPort;
  const portOpen = await isTcpPortOpen(nextPort);

  if (portOpen) {
    const ownerCommandLine = await getPortOwnerCommandLine(nextPort);
    const ownedByRepo = isRepoOwnedCommandLine(ownerCommandLine);

    if (ownedByRepo) {
      const healthy = await isHttpReady(nextPort, 1500);
      const electronRouteReady = healthy && await isElectronRouteReady(nextPort, 5000);
      if (healthy && electronRouteReady) {
        log("Next", `reusing existing repo dev server on http://localhost:${nextPort}`);
        return { reused: true, port: nextPort };
      }

      log("Next", `found stale repo dev server on http://localhost:${nextPort}; restarting it`);
      await stopPortOwnerProcess(nextPort, "Next");
    }
    if (!ownedByRepo) {
      nextPort = await findAvailablePort(Math.max(preferredNextPort + 2, wsPort + 1));
      log("Next", `port ${preferredNextPort} is occupied by another project, switching to http://localhost:${nextPort}`);
    }
  }

  const child = spawnManaged("Next", getNextBin(), ["dev", "-p", String(nextPort)]);
  await waitForReadyOrChildExit(child, () => isHttpReady(nextPort), "Next dev server");
  await waitForReadyOrChildExit(child, () => isElectronRouteReady(nextPort), "Electron route");
  log("Next", `ready on http://localhost:${nextPort}`);
  return { reused: false, child, port: nextPort };
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
    cleanNextArtifacts();
  } else {
    await cleanRepoElectronProcesses();
  }

  await ensureWsServer();
  const next = await ensureNextDev();

  log("Electron", `launching desktop shell against http://localhost:${next.port}`);
  const electronChild = spawnManaged("Electron", electronBinary, ["."], {
    NODE_ENV: "development",
    NEXT_DEV_URL: `http://localhost:${next.port}`,
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
