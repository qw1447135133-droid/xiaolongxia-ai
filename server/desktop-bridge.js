import { randomUUID } from "crypto";
import { WebSocket } from "ws";

const clientRuntime = new Map();
const launchCapableClients = new Set();
const installedAppsCapableClients = new Set();
const pendingLaunchRequests = new Map();
const pendingInstalledAppRequests = new Map();

function normalizeRuntime(runtime = {}) {
  const isElectron = Boolean(runtime?.isElectron);
  const canLaunchNativeApplications = Boolean(runtime?.canLaunchNativeApplications ?? isElectron);
  const canListInstalledApplications = Boolean(
    runtime?.canListInstalledApplications ?? runtime?.canLaunchNativeApplications ?? isElectron,
  );
  return {
    isElectron,
    canLaunchNativeApplications,
    canListInstalledApplications,
    updatedAt: Date.now(),
  };
}

export function updateClientRuntime(ws, runtime = {}) {
  const normalized = normalizeRuntime(runtime);
  clientRuntime.set(ws, normalized);

  if (normalized.canLaunchNativeApplications) {
    launchCapableClients.add(ws);
  } else {
    launchCapableClients.delete(ws);
  }

  if (normalized.canListInstalledApplications) {
    installedAppsCapableClients.add(ws);
  } else {
    installedAppsCapableClients.delete(ws);
  }
}

export function removeClientRuntime(ws) {
  clientRuntime.delete(ws);
  launchCapableClients.delete(ws);
  installedAppsCapableClients.delete(ws);
}

export function cleanupClientLaunchRequests(ws) {
  for (const [requestId, pending] of pendingLaunchRequests.entries()) {
    if (pending.ws !== ws) continue;
    clearTimeout(pending.timeoutId);
    pending.reject(new Error("桌面客户端已断开连接，无法继续启动本机程序。"));
    pendingLaunchRequests.delete(requestId);
  }

  for (const [requestId, pending] of pendingInstalledAppRequests.entries()) {
    if (pending.ws !== ws) continue;
    clearTimeout(pending.timeoutId);
    pending.reject(new Error("桌面客户端已断开连接，无法继续读取本机程序列表。"));
    pendingInstalledAppRequests.delete(requestId);
  }
}

function isLaunchCapableClient(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const runtime = clientRuntime.get(ws);
  return Boolean(runtime?.canLaunchNativeApplications);
}

function isInstalledAppsCapableClient(ws) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const runtime = clientRuntime.get(ws);
  return Boolean(runtime?.canListInstalledApplications);
}

function getCapableClient(preferredWs, capability, clientSet) {
  if (capability(preferredWs)) {
    return preferredWs;
  }

  let candidate = null;
  let candidateUpdatedAt = 0;
  for (const ws of clientSet) {
    if (!capability(ws)) continue;
    const updatedAt = Number(clientRuntime.get(ws)?.updatedAt || 0);
    if (!candidate || updatedAt >= candidateUpdatedAt) {
      candidate = ws;
      candidateUpdatedAt = updatedAt;
    }
  }
  return candidate;
}

function getLaunchCapableClient(preferredWs) {
  return getCapableClient(preferredWs, isLaunchCapableClient, launchCapableClients);
}

function getInstalledAppsCapableClient(preferredWs) {
  return getCapableClient(preferredWs, isInstalledAppsCapableClient, installedAppsCapableClients);
}

export function handleDesktopLaunchResult(ws, message = {}) {
  const requestId = typeof message?.requestId === "string" ? message.requestId : "";
  if (!requestId) return false;

  const pending = pendingLaunchRequests.get(requestId);
  if (!pending || pending.ws !== ws) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pendingLaunchRequests.delete(requestId);

  if (message.ok === false) {
    pending.reject(new Error(String(message.error || "本机程序启动失败。")));
    return true;
  }

  pending.resolve(message.result ?? { ok: true, method: "shell", message: "已提交桌面启动请求。" });
  return true;
}

export function handleDesktopInstalledApplicationsResult(ws, message = {}) {
  const requestId = typeof message?.requestId === "string" ? message.requestId : "";
  if (!requestId) return false;

  const pending = pendingInstalledAppRequests.get(requestId);
  if (!pending || pending.ws !== ws) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pendingInstalledAppRequests.delete(requestId);

  if (message.ok === false) {
    pending.reject(new Error(String(message.error || "读取本机程序列表失败。")));
    return true;
  }

  pending.resolve(Array.isArray(message.result) ? message.result : []);
  return true;
}

export function requestDesktopLaunch(payload, options = {}) {
  const ws = getLaunchCapableClient(options.preferredWs);
  if (!ws) {
    throw new Error("当前没有可用的 Electron 桌面客户端，无法启动本机程序。");
  }

  const requestId = randomUUID();
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 15000));

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingLaunchRequests.delete(requestId);
      reject(new Error("桌面客户端响应超时，本机程序启动未确认。"));
    }, timeoutMs);

    pendingLaunchRequests.set(requestId, {
      ws,
      resolve,
      reject,
      timeoutId,
    });

    ws.send(JSON.stringify({
      type: "desktop_launch_request",
      requestId,
      payload,
    }));
  });
}

export function requestDesktopInstalledApplications(payload = {}, options = {}) {
  const ws = getInstalledAppsCapableClient(options.preferredWs);
  if (!ws) {
    throw new Error("当前没有可用的 Electron 桌面客户端，无法读取本机程序列表。");
  }

  const requestId = randomUUID();
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 20000));

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingInstalledAppRequests.delete(requestId);
      reject(new Error("桌面客户端响应超时，本机程序列表未返回。"));
    }, timeoutMs);

    pendingInstalledAppRequests.set(requestId, {
      ws,
      resolve,
      reject,
      timeoutId,
    });

    ws.send(JSON.stringify({
      type: "desktop_installed_apps_request",
      requestId,
      payload: {
        forceRefresh: Boolean(payload?.forceRefresh),
      },
    }));
  });
}

export function getDesktopRuntimeSummary() {
  let totalClients = 0;
  let launchCapable = 0;
  let installedAppsCapable = 0;

  for (const runtime of clientRuntime.values()) {
    totalClients += 1;
    if (runtime?.canLaunchNativeApplications) {
      launchCapable += 1;
    }
    if (runtime?.canListInstalledApplications) {
      installedAppsCapable += 1;
    }
  }

  return {
    totalClients,
    launchCapable,
    installedAppsCapable,
  };
}
