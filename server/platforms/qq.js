import PlatformAdapterTemplate from "./adapter-template.js";

const QQ_OUTBOUND_CACHE_LIMIT = 200;
const QQ_OUTBOUND_TTL_MS = 24 * 60 * 60 * 1000;
const QQ_DEAD_LETTER_LIMIT = 60;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeConversationRef(userId, conversationRef) {
  const normalizedConversationRef = normalizeText(conversationRef);
  if (normalizedConversationRef) return normalizedConversationRef;
  const normalizedUserId = normalizeText(userId);
  return normalizedUserId ? `qq:${normalizedUserId}` : "";
}

function normalizeTargetRef(targetId, defaultOpenId = "") {
  const normalizedTarget = normalizeText(targetId);
  if (normalizedTarget) return normalizedTarget;
  const normalizedDefault = normalizeText(defaultOpenId);
  return normalizedDefault ? `qq:${normalizedDefault}` : "";
}

function makeOutboundId(kind, createdAt) {
  return `qq-${kind}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeQueueStats(queue = []) {
  const fileCount = queue.filter(item => item.kind === "file").length;
  const textCount = queue.filter(item => item.kind === "text").length;
  return {
    pendingCount: queue.length,
    textCount,
    fileCount,
  };
}

export default class QqAdapter extends PlatformAdapterTemplate {
  constructor() {
    super();
    this.bridgeName = "";
    this.bridgeSecret = "";
    this.defaultOpenId = "";
    this.outboundQueues = new Map();
    this.deadLetters = [];
    this.lastInboundAt = null;
    this.lastPullAt = null;
    this.lastAckAt = null;
    this.lastDeliveredAt = null;
    this.lastFailureAt = null;
    this.lastOutboundAt = null;
  }

  async init(fields, onMessage) {
    this.bridgeName = normalizeText(fields?.bridgeName) || "QQ Bridge";
    this.bridgeSecret = normalizeText(fields?.bridgeSecret);
    this.defaultOpenId = normalizeText(fields?.defaultOpenId);
    this.onMessage = onMessage;

    if (!this.bridgeName) {
      throw new Error("bridgeName 不能为空");
    }
    if (!this.bridgeSecret) {
      throw new Error("bridgeSecret 不能为空");
    }
  }

  async stop() {
    this.outboundQueues.clear();
    this.deadLetters = [];
  }

  authorizeRequest(headers = {}) {
    const directSecret = normalizeText(headers["x-starcraw-secret"]);
    if (!directSecret || directSecret !== this.bridgeSecret) {
      throw new Error("QQ Bridge 鉴权失败，请检查 x-starcraw-secret。");
    }
    return true;
  }

  pruneQueues(now = Date.now()) {
    for (const [conversationRef, queue] of this.outboundQueues.entries()) {
      const nextQueue = queue
        .filter(item => now - item.createdAt < QQ_OUTBOUND_TTL_MS)
        .slice(-QQ_OUTBOUND_CACHE_LIMIT);
      if (nextQueue.length > 0) {
        this.outboundQueues.set(conversationRef, nextQueue);
      } else {
        this.outboundQueues.delete(conversationRef);
      }
    }
  }

  ensureQueue(conversationRef) {
    if (!this.outboundQueues.has(conversationRef)) {
      this.outboundQueues.set(conversationRef, []);
    }
    return this.outboundQueues.get(conversationRef);
  }

  pushDeadLetter(item, reason, now = Date.now()) {
    this.deadLetters = [
      {
        ...item,
        failedAt: now,
        reason: normalizeText(reason) || "unknown",
      },
      ...this.deadLetters,
    ].slice(0, QQ_DEAD_LETTER_LIMIT);
  }

  async sendMessage(targetId, text, payload = {}) {
    const conversationRef = normalizeTargetRef(targetId, this.defaultOpenId);
    if (!conversationRef) {
      throw new Error("QQ Bridge 目标不能为空");
    }

    const remoteUserId = normalizeText(payload?.remoteUserId)
      || (conversationRef.startsWith("qq:") ? conversationRef.slice("qq:".length) : "");
    const queue = this.ensureQueue(conversationRef);
    const createdAt = Date.now();
    queue.push({
      id: makeOutboundId("text", createdAt),
      kind: "text",
      conversationRef,
      remoteUserId,
      text: normalizeText(text),
      createdAt,
      source: "assistant",
    });
    this.lastOutboundAt = createdAt;
    this.pruneQueues(createdAt);
  }

  async sendFile(targetId, payload = {}, envelope = {}) {
    const conversationRef = normalizeTargetRef(targetId, this.defaultOpenId);
    if (!conversationRef) {
      throw new Error("QQ Bridge 目标不能为空");
    }
    if (!normalizeText(payload?.filePath) || !normalizeText(payload?.fileName)) {
      throw new Error("QQ Bridge 发送文件时缺少 filePath 或 fileName。");
    }

    const remoteUserId = normalizeText(envelope?.remoteUserId)
      || (conversationRef.startsWith("qq:") ? conversationRef.slice("qq:".length) : "");
    const queue = this.ensureQueue(conversationRef);
    const createdAt = Date.now();
    queue.push({
      id: makeOutboundId("file", createdAt),
      kind: "file",
      conversationRef,
      remoteUserId,
      text: normalizeText(payload?.caption),
      createdAt,
      source: "assistant",
      attachment: {
        filePath: normalizeText(payload.filePath),
        fileName: normalizeText(payload.fileName),
        mimeType: normalizeText(payload?.mimeType) || "application/octet-stream",
        caption: normalizeText(payload?.caption),
      },
    });
    this.lastOutboundAt = createdAt;
    this.pruneQueues(createdAt);
  }

  async probe() {
    this.pruneQueues();
    const queueEntries = Array.from(this.outboundQueues.values()).flat();
    return {
      ok: true,
      status: "connected",
      message: `QQ 本地桥接已就绪：${this.bridgeName}`,
      checkedAt: Date.now(),
      queueStats: makeQueueStats(queueEntries),
      deadLetterCount: this.deadLetters.length,
      lastInboundAt: this.lastInboundAt,
      lastPullAt: this.lastPullAt,
      lastAckAt: this.lastAckAt,
      lastDeliveredAt: this.lastDeliveredAt,
      lastFailureAt: this.lastFailureAt,
      lastOutboundAt: this.lastOutboundAt,
    };
  }

  async handleWebhookRequest({ method, headers, body }) {
    if (method !== "POST") {
      return {
        ok: false,
        statusCode: 405,
        responseType: "json",
        responseBody: { ok: false, error: "QQ Bridge 入站仅支持 POST。" },
        statusDetail: "QQ Bridge 入站仅支持 POST。",
        healthScore: 30,
      };
    }

    try {
      this.authorizeRequest(headers);
      const payload = body ? JSON.parse(body) : {};
      const userId = normalizeText(payload?.userId || payload?.senderId || payload?.uin);
      const text = normalizeText(payload?.text || payload?.message || payload?.content);
      const conversationRef = normalizeConversationRef(userId, payload?.conversationRef || payload?.threadId || payload?.sessionId);
      if (!userId || !text || !conversationRef) {
        return {
          ok: false,
          statusCode: 400,
          responseType: "json",
          responseBody: { ok: false, error: "userId、text 或 conversationRef 缺失。" },
          statusDetail: "QQ Bridge 入站字段不完整。",
          healthScore: 40,
        };
      }

      const externalMessageId = normalizeText(payload?.externalMessageId || payload?.messageId)
        || `qq-${conversationRef}-${Date.now()}`;
      this.lastInboundAt = Date.now();
      await this.emitInboundMessage({
        userId,
        text,
        platformId: "qq",
        externalMessageId,
        inboundMessageKey: `qq:${conversationRef}:${externalMessageId}`,
        conversationRef,
        replyTargetId: conversationRef,
        participantLabel: normalizeText(payload?.participantLabel || payload?.nickname || userId),
        title: normalizeText(payload?.title) || `qq · ${userId}`,
        remoteUserId: userId,
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
          queueStats: makeQueueStats(this.outboundQueues.get(conversationRef) ?? []),
        },
        statusDetail: "QQ Bridge 入站消息已接收。",
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
    this.authorizeRequest(headers);
    const payload = body ? JSON.parse(body) : {};
    const now = Date.now();
    const userId = normalizeText(payload?.userId || payload?.senderId || payload?.uin || this.defaultOpenId);
    const conversationRef = normalizeConversationRef(userId, payload?.conversationRef || payload?.threadId || payload?.sessionId);
    if (!conversationRef) {
      throw new Error("拉取 QQ 回复时缺少 userId 或 conversationRef。");
    }

    const ackIds = Array.isArray(payload?.ackIds)
      ? payload.ackIds.map(item => normalizeText(item)).filter(Boolean)
      : [];
    const deliveredIds = Array.isArray(payload?.deliveredIds)
      ? payload.deliveredIds.map(item => normalizeText(item)).filter(Boolean)
      : [];
    const failedIds = Array.isArray(payload?.failedIds)
      ? payload.failedIds.map(item => normalizeText(item)).filter(Boolean)
      : [];
    const receiptItems = Array.isArray(payload?.receipts)
      ? payload.receipts
          .map((item) => ({
            id: normalizeText(item?.id),
            status: normalizeText(item?.status),
            reason: normalizeText(item?.reason),
          }))
          .filter(item => item.id && item.status)
      : [];

    const deliveredSet = new Set([...ackIds, ...deliveredIds]);
    const failedSet = new Map(failedIds.map(id => [id, "bridge-reported-failure"]));
    for (const item of receiptItems) {
      if (item.status === "delivered" || item.status === "acked") {
        deliveredSet.add(item.id);
      }
      if (item.status === "failed") {
        failedSet.set(item.id, item.reason || "bridge-reported-failure");
      }
    }

    const queue = [...(this.outboundQueues.get(conversationRef) ?? [])];
    const remainingQueue = [];
    for (const item of queue) {
      if (deliveredSet.has(item.id)) {
        this.lastAckAt = now;
        this.lastDeliveredAt = now;
        continue;
      }
      if (failedSet.has(item.id)) {
        this.lastAckAt = now;
        this.lastFailureAt = now;
        this.pushDeadLetter(item, failedSet.get(item.id), now);
        continue;
      }
      remainingQueue.push(item);
    }

    if (remainingQueue.length > 0) {
      this.outboundQueues.set(conversationRef, remainingQueue);
    } else {
      this.outboundQueues.delete(conversationRef);
    }

    this.lastPullAt = now;
    this.pruneQueues(now);

    const limit = Math.max(1, Math.min(50, Number(payload?.limit || 20)));
    const messages = remainingQueue.slice(0, limit);

    return {
      ok: true,
      conversationRef,
      userId,
      messages,
      pendingCount: remainingQueue.length,
      queueStats: makeQueueStats(remainingQueue),
      pulledAt: now,
      lastInboundAt: this.lastInboundAt,
      lastPullAt: this.lastPullAt,
      lastAckAt: this.lastAckAt,
      lastDeliveredAt: this.lastDeliveredAt,
      lastFailureAt: this.lastFailureAt,
      deadLetterCount: this.deadLetters.length,
      deadLetters: this.deadLetters.slice(0, 10),
    };
  }
}
