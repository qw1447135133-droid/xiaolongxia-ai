import { getPlatformCapabilities, getPlatformRegistryEntry, listPlatformRegistryEntries } from "./registry.js";

const runningRuntimes = new Map();

function normalizeHandlers(handlers = {}) {
  const onInboundMessage = typeof handlers.onInboundMessage === "function"
    ? handlers.onInboundMessage
    : (typeof handlers.onMessage === "function" ? handlers.onMessage : null);

  if (!onInboundMessage) {
    throw new Error("Platform runtime requires an onInboundMessage handler");
  }

  return {
    onInboundMessage,
    onStatusChange: typeof handlers.onStatusChange === "function" ? handlers.onStatusChange : null,
    onDebugEvent: typeof handlers.onDebugEvent === "function" ? handlers.onDebugEvent : null,
  };
}

function buildRuntimeSnapshot(platformId, adapter, entry) {
  return {
    platformId,
    adapter,
    capabilities: (typeof adapter.getCapabilities === "function" ? adapter.getCapabilities() : null) ?? entry.capabilities,
    mode: entry.mode,
    startedAt: Date.now(),
  };
}

export function isPlatformRunning(platformId) {
  return runningRuntimes.has(String(platformId || "").trim());
}

export function getPlatformRuntime(platformId) {
  return runningRuntimes.get(String(platformId || "").trim()) ?? null;
}

export function listPlatformRuntimes() {
  return Array.from(runningRuntimes.values());
}

export function listPlatformCapabilities() {
  return listPlatformRegistryEntries().map(entry => ({
    platformId: entry.id,
    mode: entry.mode,
    capabilities: entry.capabilities,
  }));
}

export async function startPlatformRuntime(platformId, fields, handlers = {}) {
  const normalizedPlatformId = String(platformId || "").trim();
  const entry = getPlatformRegistryEntry(normalizedPlatformId);
  if (!entry) {
    throw new Error(`Unknown platform: ${normalizedPlatformId}`);
  }

  await stopPlatformRuntime(normalizedPlatformId);

  const normalizedHandlers = normalizeHandlers(handlers);
  const adapter = new entry.AdapterClass();

  if (typeof adapter.init !== "function") {
    throw new Error(`Platform ${normalizedPlatformId} adapter missing init()`);
  }

  await adapter.init(fields, normalizedHandlers.onInboundMessage, normalizedHandlers);

  const snapshot = buildRuntimeSnapshot(normalizedPlatformId, adapter, entry);
  runningRuntimes.set(normalizedPlatformId, snapshot);
  return snapshot;
}

export async function stopPlatformRuntime(platformId) {
  const normalizedPlatformId = String(platformId || "").trim();
  const runtime = runningRuntimes.get(normalizedPlatformId);
  if (!runtime) return;

  try {
    if (typeof runtime.adapter?.stop === "function") {
      await runtime.adapter.stop();
    }
  } finally {
    runningRuntimes.delete(normalizedPlatformId);
  }
}

export async function sendPlatformMessage(payload) {
  const normalizedPlatformId = String(payload?.platformId || "").trim();
  const runtime = getPlatformRuntime(normalizedPlatformId);
  if (!runtime) {
    throw new Error(`平台 ${normalizedPlatformId} 未连接`);
  }
  if (typeof runtime.adapter?.sendMessage !== "function") {
    throw new Error(`平台 ${normalizedPlatformId} 暂不支持发送消息`);
  }

  await runtime.adapter.sendMessage(payload.targetId, payload.text ?? "", payload);
  return true;
}

export async function sendPlatformFile(payload) {
  const normalizedPlatformId = String(payload?.platformId || "").trim();
  const runtime = getPlatformRuntime(normalizedPlatformId);
  if (!runtime) {
    throw new Error(`平台 ${normalizedPlatformId} 未连接`);
  }
  if (typeof runtime.adapter?.sendFile !== "function") {
    throw new Error(`平台 ${normalizedPlatformId} 暂不支持发送文件`);
  }
  if (!payload?.attachment?.filePath || !payload?.attachment?.fileName) {
    throw new Error("发送文件时缺少 filePath 或 fileName");
  }

  await runtime.adapter.sendFile(payload.targetId, {
    filePath: payload.attachment.filePath,
    fileName: payload.attachment.fileName,
    mimeType: payload.attachment.mimeType,
    caption: payload.attachment.caption,
  }, payload);
  return true;
}

export async function probePlatformRuntime(platformId) {
  const normalizedPlatformId = String(platformId || "").trim();
  const runtime = getPlatformRuntime(normalizedPlatformId);
  if (!runtime) {
    return {
      ok: false,
      status: "idle",
      message: "平台尚未启动",
      checkedAt: Date.now(),
    };
  }

  if (typeof runtime.adapter?.probe === "function") {
    return runtime.adapter.probe();
  }

  return {
    ok: true,
    status: "connected",
    message: "当前适配器未实现 probe，按运行中处理",
    checkedAt: Date.now(),
    capabilities: getPlatformCapabilities(normalizedPlatformId),
  };
}

