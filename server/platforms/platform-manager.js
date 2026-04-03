/**
 * platform-manager.js — 消息平台统一管理器
 *
 * 每个适配器实现相同接口：
 *   init(fields, onMessage)  — 启动监听
 *   stop()                   — 停止监听
 *   sendMessage(userId, text) — 发送回复
 */

import TelegramAdapter  from './telegram.js';
import LineAdapter      from './line.js';
import FeishuAdapter    from './feishu.js';
import WecomAdapter     from './wecom.js';

const ADAPTER_MAP = {
  telegram: TelegramAdapter,
  line:     LineAdapter,
  feishu:   FeishuAdapter,
  wecom:    WecomAdapter,
};

// 当前运行中的适配器实例
const runningAdapters = {};

/**
 * 启动或更新一个平台适配器
 * @param {string} platformId
 * @param {Record<string, string>} fields
 * @param {(userId: string, text: string) => void} onMessage
 */
export async function startPlatform(platformId, fields, onMessage) {
  // 先停掉旧实例
  await stopPlatform(platformId);

  const AdapterClass = ADAPTER_MAP[platformId];
  if (!AdapterClass) {
    console.warn(`[platforms] Unknown platform: ${platformId}`);
    return;
  }

  try {
    const adapter = new AdapterClass();
    await adapter.init(fields, onMessage);
    runningAdapters[platformId] = adapter;
    console.log(`[platforms] ${platformId} started`);
  } catch (err) {
    console.error(`[platforms] ${platformId} failed to start:`, err.message);
    throw err;
  }
}

/**
 * 停止一个平台适配器
 */
export async function stopPlatform(platformId) {
  const adapter = runningAdapters[platformId];
  if (adapter) {
    try { await adapter.stop(); } catch {}
    delete runningAdapters[platformId];
    console.log(`[platforms] ${platformId} stopped`);
  }
}

/**
 * 向指定平台用户发送消息
 */
export async function sendToPlatform(platformId, userId, text) {
  const adapter = runningAdapters[platformId];
  if (!adapter) return;
  try {
    await adapter.sendMessage(userId, text);
  } catch (err) {
    console.error(`[platforms] ${platformId} sendMessage failed:`, err.message);
  }
}

export async function sendFileToPlatform(platformId, userId, payload) {
  const adapter = runningAdapters[platformId];
  if (!adapter) {
    throw new Error(`平台 ${platformId} 未连接`);
  }
  if (typeof adapter.sendFile !== "function") {
    throw new Error(`平台 ${platformId} 暂不支持发送文件`);
  }

  try {
    await adapter.sendFile(userId, payload);
  } catch (err) {
    console.error(`[platforms] ${platformId} sendFile failed:`, err.message);
    throw err;
  }
}
