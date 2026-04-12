import { createPlatformCapabilities } from "./contracts.js";
import TelegramAdapter from "./telegram.js";
import LineAdapter from "./line.js";
import FeishuAdapter from "./feishu.js";
import WecomAdapter from "./wecom.js";
import DingTalkAdapter from "./dingtalk.js";
import WechatOfficialAdapter from "./wechat-official.js";
import QqAdapter from "./qq.js";
import WebAdapter from "./web.js";

const PLATFORM_REGISTRY = {
  telegram: {
    id: "telegram",
    AdapterClass: TelegramAdapter,
    mode: "long-poll",
    capabilities: createPlatformCapabilities({
      supportsPush: true,
      supportsFileSend: true,
      supportsMediaSend: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsThreadReply: true,
      supportsOwnerConversation: true,
      supportsSessionResume: false,
      supportsProbe: true,
    }),
  },
  line: {
    id: "line",
    AdapterClass: LineAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/line",
      methods: ["POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsProbe: true,
    }),
  },
  feishu: {
    id: "feishu",
    AdapterClass: FeishuAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/feishu",
      methods: ["GET", "POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsFileSend: true,
      supportsMediaSend: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsThreadReply: true,
      supportsOwnerConversation: true,
      supportsProbe: true,
    }),
  },
  wecom: {
    id: "wecom",
    AdapterClass: WecomAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/wecom",
      methods: ["GET", "POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsProbe: true,
    }),
  },
  dingtalk: {
    id: "dingtalk",
    AdapterClass: DingTalkAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/dingtalk",
      methods: ["GET", "POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsProbe: true,
    }),
  },
  wechat_official: {
    id: "wechat_official",
    AdapterClass: WechatOfficialAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/wechat-official",
      methods: ["GET", "POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsProbe: true,
    }),
  },
  qq: {
    id: "qq",
    AdapterClass: QqAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/qq",
      methods: ["POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsGroupChat: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsSessionResume: true,
      supportsProbe: true,
    }),
  },
  web: {
    id: "web",
    AdapterClass: WebAdapter,
    mode: "webhook",
    webhook: {
      path: "/webhook/web",
      methods: ["POST"],
    },
    capabilities: createPlatformCapabilities({
      supportsWebhook: true,
      supportsPush: true,
      supportsDirectChat: true,
      supportsOwnerConversation: true,
      supportsSessionResume: true,
      supportsProbe: true,
    }),
  },
};

export function getPlatformRegistryEntry(platformId) {
  return PLATFORM_REGISTRY[String(platformId || "").trim()] ?? null;
}

export function listPlatformRegistryEntries() {
  return Object.values(PLATFORM_REGISTRY);
}

export function listWebhookPlatformRegistryEntries() {
  return listPlatformRegistryEntries().filter(entry => entry.mode === "webhook" && entry.webhook?.path);
}

export function getPlatformCapabilities(platformId) {
  return getPlatformRegistryEntry(platformId)?.capabilities ?? null;
}

export function getPlatformConnectionMode(platformId) {
  return getPlatformRegistryEntry(platformId)?.mode ?? null;
}

export function getPlatformWebhookConfig(platformId) {
  return getPlatformRegistryEntry(platformId)?.webhook ?? null;
}

export function findPlatformRegistryEntryByWebhookPath(pathname) {
  const normalizedPathname = String(pathname || "").trim();
  return listWebhookPlatformRegistryEntries().find(entry => entry.webhook?.path === normalizedPathname) ?? null;
}

export const PLATFORM_WEBHOOK_PATHS = Object.freeze(
  Object.fromEntries(
    listWebhookPlatformRegistryEntries().map(entry => [entry.id, entry.webhook.path]),
  ),
);
