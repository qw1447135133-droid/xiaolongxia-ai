/**
 * line.js — LINE Messaging API 适配器
 *
 * 所需字段：channelAccessToken, channelSecret
 * 需要公网 Webhook URL（开发时用 ngrok http 3001）
 * Webhook 路径：POST /webhook/line
 */

export default class LineAdapter {
  constructor() {
    this.client = null;
    this.middleware = null;
    this.registeredHandler = null;
  }

  async init(fields, onMessage) {
    const { channelAccessToken, channelSecret } = fields;
    if (!channelAccessToken?.trim()) throw new Error('channelAccessToken 不能为空');
    if (!channelSecret?.trim())      throw new Error('channelSecret 不能为空');

    const lineSdk = await import('@line/bot-sdk').catch(() => {
      throw new Error('请先安装依赖：npm install @line/bot-sdk');
    });

    const config = { channelAccessToken, channelSecret };
    this.client = new lineSdk.Client(config);
    this.middleware = lineSdk.middleware(config);
    this.onMessage = onMessage;

    console.log('[line] Adapter ready. Webhook path: POST /webhook/line');
  }

  async handleWebhookEvents(events) {
    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;
      const sourceType = String(event.source?.type || "user").trim().toLowerCase();
      const rawTargetId = String(
        event.source?.groupId
        || event.source?.roomId
        || event.source?.userId
        || "",
      ).trim();
      const senderId = String(event.source?.userId || rawTargetId).trim();
      const text = event.message.text?.trim();
      if (!text || !rawTargetId) continue;
      const externalMessageId = String(
        event.message.id
        || event.webhookEventId
        || event.replyToken
        || `${rawTargetId}:${event.timestamp ?? Date.now()}`,
      );
      const conversationRef = `${sourceType}:${rawTargetId}`;
      this.onMessage({
        userId: rawTargetId,
        text,
        platformId: "line",
        externalMessageId,
        inboundMessageKey: `line:${externalMessageId}`,
        conversationRef,
        replyTargetId: conversationRef,
        participantLabel: senderId || rawTargetId,
        title: `line · ${conversationRef}`,
        remoteUserId: senderId || rawTargetId,
        remoteThreadId: sourceType === "group" || sourceType === "room" ? rawTargetId : undefined,
      });
    }
  }

  async stop() {
    this.client = null;
    this.middleware = null;
  }

  async sendMessage(userId, text) {
    if (!this.client) return;
    const normalizedTarget = String(userId || "").trim();
    const actualTargetId = normalizedTarget.includes(":")
      ? normalizedTarget.split(":").slice(1).join(":")
      : normalizedTarget;
    if (!actualTargetId) {
      throw new Error("LINE 目标会话 ID 不能为空");
    }
    // LINE 单条最长 5000 字
    const chunks = splitText(text, 5000);
    for (const chunk of chunks) {
      await this.client.pushMessage(actualTargetId, { type: 'text', text: chunk });
    }
  }

  async probe() {
    if (!this.client) {
      return {
        ok: false,
        status: "idle",
        message: "LINE 适配器尚未启动",
        checkedAt: Date.now(),
      };
    }

    let botInfo = null;
    if (typeof this.client.getBotInfo === "function") {
      botInfo = await this.client.getBotInfo();
    }

    return {
      ok: true,
      status: "connected",
      message: `LINE Official Account 在线${botInfo?.displayName ? `：${botInfo.displayName}` : ""}`,
      checkedAt: Date.now(),
      raw: botInfo,
    };
  }

  async handleWebhookRequest({ method, body }) {
    if (method !== "POST") {
      return {
        ok: false,
        statusCode: 405,
        responseType: "empty",
        statusDetail: "LINE Webhook 仅支持 POST。",
        healthScore: 30,
      };
    }

    const events = JSON.parse(body || "{}").events ?? [];
    await this.handleWebhookEvents(events);
    return {
      ok: true,
      statusCode: 200,
      responseType: "text",
      responseBody: "OK",
      statusDetail: "已收到 LINE Webhook 回调。",
    };
  }
}

function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
