/**
 * 兼容层：
 * 旧调用方仍然从 platform-manager 导入 startPlatform / sendToPlatform，
 * 实际实现已经迁移到 runtime-manager + registry。
 */

import {
  getPlatformRuntime,
  isPlatformRunning,
  listPlatformCapabilities,
  listPlatformRuntimes,
  probePlatformRuntime,
  sendPlatformFile,
  sendPlatformMessage,
  startPlatformRuntime,
  stopPlatformRuntime,
} from "./runtime-manager.js";

export {
  getPlatformRuntime,
  isPlatformRunning,
  listPlatformCapabilities,
  listPlatformRuntimes,
  probePlatformRuntime,
};

export async function startPlatform(platformId, fields, onMessage) {
  return startPlatformRuntime(platformId, fields, {
    onInboundMessage: onMessage,
  });
}

export async function stopPlatform(platformId) {
  return stopPlatformRuntime(platformId);
}

export async function sendToPlatform(platformId, userId, text) {
  return sendPlatformMessage({
    platformId,
    targetId: userId,
    text,
  });
}

export async function sendFileToPlatform(platformId, userId, payload) {
  return sendPlatformFile({
    platformId,
    targetId: userId,
    attachment: {
      filePath: payload.filePath,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      caption: payload.caption,
    },
  });
}

