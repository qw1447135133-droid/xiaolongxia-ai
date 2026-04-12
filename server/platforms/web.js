import crypto from "crypto";
import PlatformAdapterTemplate from "./adapter-template.js";

const WEB_OUTBOUND_CACHE_LIMIT = 200;
const WEB_OUTBOUND_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeConversationRef(visitorId, conversationRef) {
  const normalizedConversationRef = normalizeText(conversationRef);
  if (normalizedConversationRef) return normalizedConversationRef;
  const normalizedVisitorId = normalizeText(visitorId);
  return normalizedVisitorId ? `visitor:${normalizedVisitorId}` : "";
}

function normalizeTargetRef(targetId, defaultVisitorId = "") {
  const normalizedTarget = normalizeText(targetId);
  if (normalizedTarget) return normalizedTarget;
  const normalizedDefaultVisitorId = normalizeText(defaultVisitorId);
  return normalizedDefaultVisitorId ? `visitor:${normalizedDefaultVisitorId}` : "";
}

function parseAllowedOrigins(input) {
  return String(input || "")
    .split(/[\n,]/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function extractRequestOrigin(headers = {}) {
  const origin = normalizeText(headers.origin).toLowerCase();
  if (origin) return origin;
  const referer = normalizeText(headers.referer);
  if (!referer) return "";
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return "";
  }
}

function isOriginAllowed(allowedOrigins, requestOrigin) {
  if (!requestOrigin || allowedOrigins.length === 0) return false;
  let requestHostname = "";
  try {
    requestHostname = new URL(requestOrigin).hostname.toLowerCase();
  } catch {
    requestHostname = "";
  }

  return allowedOrigins.some((entry) => {
    if (entry === "*") return true;
    if (entry.includes("://")) return entry === requestOrigin;
    return Boolean(requestHostname) && entry === requestHostname;
  });
}

function buildHmac(secret, timestamp, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export default class WebAdapter extends PlatformAdapterTemplate {
  constructor() {
    super();
    this.siteName = "";
    this.signingSecret = "";
    this.publicWidgetToken = "";
    this.defaultVisitorId = "";
    this.allowedOrigins = [];
    this.outboundQueues = new Map();
  }

  async init(fields, onMessage) {
    this.onMessage = onMessage;
    this.siteName = normalizeText(fields?.siteName) || "Web Chat";
    this.signingSecret = normalizeText(fields?.signingSecret);
    this.publicWidgetToken = normalizeText(fields?.publicWidgetToken);
    this.defaultVisitorId = normalizeText(fields?.defaultVisitorId);
    this.allowedOrigins = parseAllowedOrigins(fields?.allowedOrigins);

    if (!this.siteName) {
      throw new Error("siteName 不能为空");
    }
    if (!this.signingSecret) {
      throw new Error("signingSecret 不能为空");
    }
  }

  async stop() {
    this.outboundQueues.clear();
  }

  pruneQueues(now = Date.now()) {
    for (const [conversationRef, queue] of this.outboundQueues.entries()) {
      const nextQueue = queue
        .filter(item => now - item.createdAt < WEB_OUTBOUND_TTL_MS)
        .slice(-WEB_OUTBOUND_CACHE_LIMIT);
      if (nextQueue.length > 0) {
        this.outboundQueues.set(conversationRef, nextQueue);
      } else {
        this.outboundQueues.delete(conversationRef);
      }
    }
  }

  authorizeRequest(headers = {}, rawBody = "") {
    const secret = this.signingSecret;
    const widgetToken = normalizeText(headers["x-starcraw-widget-token"]);
    if (widgetToken) {
      if (!this.publicWidgetToken || widgetToken !== this.publicWidgetToken) {
        throw new Error("网页挂件令牌校验失败。");
      }
      const requestOrigin = extractRequestOrigin(headers);
      if (!isOriginAllowed(this.allowedOrigins, requestOrigin)) {
        throw new Error("当前网页来源未在允许列表中。");
      }
      return true;
    }

    if (!secret) {
      throw new Error("网页会话签名密钥尚未配置");
    }

    const directSecret = normalizeText(headers["x-starcraw-secret"]);
    if (directSecret && directSecret === secret) {
      return true;
    }

    const timestamp = normalizeText(headers["x-starcraw-timestamp"]);
    const signature = normalizeText(headers["x-starcraw-signature"]).toLowerCase();
    if (!timestamp || !signature) {
      throw new Error("缺少网页会话鉴权头，请提供 x-starcraw-secret 或 x-starcraw-signature。");
    }

    const expectedSignature = buildHmac(secret, timestamp, rawBody).toLowerCase();
    const normalizedSignature = signature.replace(/^sha256=/i, "");
    if (normalizedSignature !== expectedSignature) {
      throw new Error("网页会话签名校验失败。");
    }

    return true;
  }

  ensureQueue(conversationRef) {
    if (!this.outboundQueues.has(conversationRef)) {
      this.outboundQueues.set(conversationRef, []);
    }
    return this.outboundQueues.get(conversationRef);
  }

  async sendMessage(targetId, text, payload = {}) {
    const conversationRef = normalizeTargetRef(targetId, this.defaultVisitorId);
    if (!conversationRef) {
      throw new Error("网页会话目标不能为空");
    }

    const visitorId = normalizeText(payload?.remoteUserId)
      || (conversationRef.startsWith("visitor:") ? conversationRef.slice("visitor:".length) : "");
    const queue = this.ensureQueue(conversationRef);
    const createdAt = Date.now();
    queue.push({
      id: `web-out-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
      conversationRef,
      visitorId,
      text: normalizeText(text),
      createdAt,
      source: "assistant",
    });
    this.pruneQueues(createdAt);
  }

  async probe() {
    return {
      ok: true,
      status: "connected",
      message: `网页会话桥接已就绪：${this.siteName}`,
      checkedAt: Date.now(),
    };
  }

  async handleWebhookRequest({ method, headers, body }) {
    if (method !== "POST") {
      return {
        ok: false,
        statusCode: 405,
        responseType: "json",
        responseBody: { ok: false, error: "网页会话入站仅支持 POST。" },
        statusDetail: "网页会话入站仅支持 POST。",
        healthScore: 30,
      };
    }

    try {
      this.authorizeRequest(headers, body || "");
      const payload = body ? JSON.parse(body) : {};
      const visitorId = normalizeText(payload?.visitorId || payload?.userId || this.defaultVisitorId);
      const text = normalizeText(payload?.text || payload?.message);
      const conversationRef = normalizeConversationRef(visitorId, payload?.conversationRef || payload?.threadId);
      if (!visitorId || !text || !conversationRef) {
        return {
          ok: false,
          statusCode: 400,
          responseType: "json",
          responseBody: { ok: false, error: "visitorId、text 或 conversationRef 缺失。" },
          statusDetail: "网页会话入站字段不完整。",
          healthScore: 40,
        };
      }

      const externalMessageId =
        normalizeText(payload?.externalMessageId)
        || `web-${conversationRef}-${Date.now()}`;
      await this.emitInboundMessage({
        userId: visitorId,
        text,
        platformId: "web",
        externalMessageId,
        inboundMessageKey: `web:${conversationRef}:${externalMessageId}`,
        conversationRef,
        replyTargetId: conversationRef,
        participantLabel: normalizeText(payload?.participantLabel || payload?.displayName || visitorId),
        title: normalizeText(payload?.title) || `${this.siteName} · ${visitorId}`,
        remoteUserId: visitorId,
        remoteThreadId: normalizeText(payload?.threadId) || undefined,
        raw: payload,
      });

      return {
        ok: true,
        statusCode: 200,
        responseType: "json",
        responseBody: {
          ok: true,
          accepted: true,
          conversationRef,
          externalMessageId,
        },
        statusDetail: "网页会话入站消息已接收。",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        statusCode: 401,
        responseType: "json",
        responseBody: { ok: false, error: message },
        statusDetail: message,
        healthScore: 35,
      };
    }
  }

  async pullOutboundMessages({ headers = {}, body = "" }) {
    this.authorizeRequest(headers, body || "");
    const payload = body ? JSON.parse(body) : {};
    const visitorId = normalizeText(payload?.visitorId || payload?.userId || this.defaultVisitorId);
    const conversationRef = normalizeConversationRef(visitorId, payload?.conversationRef || payload?.threadId);
    if (!conversationRef) {
      throw new Error("拉取网页会话回复时缺少 visitorId 或 conversationRef。");
    }

    const ackIds = Array.isArray(payload?.ackIds)
      ? payload.ackIds.map(item => normalizeText(item)).filter(Boolean)
      : [];
    const queue = [...(this.outboundQueues.get(conversationRef) ?? [])];
    const limit = Math.max(1, Math.min(50, Number(payload?.limit || 20)));
    const nextQueue = ackIds.length > 0
      ? queue.filter(item => !ackIds.includes(item.id))
      : queue;
    this.outboundQueues.set(conversationRef, nextQueue);
    this.pruneQueues();

    return {
      ok: true,
      conversationRef,
      visitorId,
      messages: nextQueue.slice(0, limit),
      pendingCount: nextQueue.length,
      pulledAt: Date.now(),
    };
  }
}
