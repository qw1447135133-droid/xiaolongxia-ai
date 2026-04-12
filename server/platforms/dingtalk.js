import PlatformAdapterTemplate from "./adapter-template.js";

const DINGTALK_ACCESS_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken";
const DINGTALK_SESSION_WEBHOOK_TTL_MS = 10 * 60 * 1000;
const DINGTALK_GROUP_MESSAGE_URL = "https://api.dingtalk.com/v1.0/robot/groupMessages/send";

function normalizeText(value) {
  return String(value || "").trim();
}

function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  for (let index = 0; index < text.length; index += maxLen) {
    chunks.push(text.slice(index, index + maxLen));
  }
  return chunks;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function normalizeReplyTarget(targetId) {
  const normalizedTarget = normalizeText(targetId);
  if (!normalizedTarget) return "";
  if (isHttpUrl(normalizedTarget)) return normalizedTarget;
  if (normalizedTarget.startsWith("sessionWebhook:")) {
    return normalizedTarget.slice("sessionWebhook:".length);
  }
  return normalizedTarget;
}

function parseWebhookList(value) {
  return String(value || "")
    .split(/[\n,，;；]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function resolveInboundText(payload = {}) {
  const msgType = normalizeText(payload.msgtype).toLowerCase();
  const directText = normalizeText(payload.text?.content || payload.content || payload.question || payload.prompt);
  if (directText) return directText;

  const textContent = payload.text?.content;
  if (typeof textContent === "string") return normalizeText(textContent);

  const richText = payload.richText?.map?.((item) => normalizeText(item?.text)).filter(Boolean).join("\n");
  if (normalizeText(richText)) return normalizeText(richText);

  if (msgType === "audio") {
    const recognition = normalizeText(payload.content?.recognition);
    return recognition ? `语音消息：${recognition}` : "收到一条语音消息";
  }
  if (msgType === "file") {
    const fileName = normalizeText(payload.content?.fileName);
    return fileName ? `收到文件：${fileName}` : "收到一条文件消息";
  }
  if (msgType === "picture") {
    return "收到一张图片";
  }
  if (msgType === "video") {
    return "收到一段视频";
  }
  if (msgType === "richtext" || msgType === "richText") {
    const richItems = Array.isArray(payload.content?.richText)
      ? payload.content.richText.map((item) => normalizeText(item?.text)).filter(Boolean).join("\n")
      : "";
    return normalizeText(richItems) || "收到一条富文本消息";
  }
  return "";
}

function pickConversationRef(payload = {}) {
  const openConversationId = normalizeText(
    payload.conversationId
    || payload.openConversationId
    || payload.conversation?.openConversationId
    || payload.chatbotConversationId,
  );
  if (openConversationId) return `cid:${openConversationId}`;

  const senderStaffId = normalizeText(payload.senderStaffId || payload.staffId || payload.senderId);
  if (senderStaffId) return `staff:${senderStaffId}`;

  const conversationToken = normalizeText(payload.conversationToken);
  if (conversationToken) return `token:${conversationToken}`;

  return "";
}

function pickParticipantLabel(payload = {}) {
  return normalizeText(
    payload.senderNick
    || payload.senderName
    || payload.nickName
    || payload.staffName
    || payload.senderStaffId
    || payload.senderId,
  );
}

export default class DingTalkAdapter extends PlatformAdapterTemplate {
  constructor() {
    super();
    this.clientId = "";
    this.clientSecret = "";
    this.token = "";
    this.aesKey = "";
    this.defaultOpenConversationId = "";
    this.defaultWebhookUrl = "";
    this.defaultRobotCode = "";
    this.accessToken = "";
    this.tokenExpireAt = 0;
    this.onMessage = null;
    this.sessionWebhookByConversation = new Map();
    this.sessionWebhookByStaff = new Map();
    this.robotCodeByConversation = new Map();
  }

  async init(fields, onMessage) {
    const { clientId, clientSecret, token, aesKey, defaultOpenConversationId, defaultWebhookUrl, defaultRobotCode } = fields ?? {};
    if (!normalizeText(clientId)) throw new Error("clientId 不能为空");
    if (!normalizeText(clientSecret)) throw new Error("clientSecret 不能为空");

    this.clientId = normalizeText(clientId);
    this.clientSecret = normalizeText(clientSecret);
    this.token = normalizeText(token);
    this.aesKey = normalizeText(aesKey);
    this.defaultOpenConversationId = normalizeText(defaultOpenConversationId);
    this.defaultWebhookUrl = parseWebhookList(defaultWebhookUrl)[0] || "";
    this.defaultRobotCode = normalizeText(defaultRobotCode);
    this.onMessage = onMessage;
  }

  async stop() {
    this.accessToken = "";
    this.tokenExpireAt = 0;
    this.sessionWebhookByConversation.clear();
    this.sessionWebhookByStaff.clear();
    this.robotCodeByConversation.clear();
  }

  rememberSessionWebhook(payload = {}) {
    const sessionWebhook = normalizeText(payload.sessionWebhook);
    if (!isHttpUrl(sessionWebhook)) return;

    const expiresAt = Date.now() + DINGTALK_SESSION_WEBHOOK_TTL_MS;
    const conversationRef = pickConversationRef(payload);
    const senderStaffId = normalizeText(payload.senderStaffId || payload.staffId || payload.senderId);
    if (conversationRef) {
      this.sessionWebhookByConversation.set(conversationRef, { url: sessionWebhook, expiresAt });
    }
    if (senderStaffId) {
      this.sessionWebhookByStaff.set(senderStaffId, { url: sessionWebhook, expiresAt });
    }
    const robotCode = normalizeText(payload.robotCode);
    if (conversationRef && robotCode) {
      this.robotCodeByConversation.set(conversationRef, robotCode);
    }
  }

  pruneSessionWebhooks(now = Date.now()) {
    for (const [key, value] of this.sessionWebhookByConversation.entries()) {
      if (!value?.url || Number(value?.expiresAt || 0) <= now) {
        this.sessionWebhookByConversation.delete(key);
      }
    }
    for (const [key, value] of this.sessionWebhookByStaff.entries()) {
      if (!value?.url || Number(value?.expiresAt || 0) <= now) {
        this.sessionWebhookByStaff.delete(key);
      }
    }
  }

  resolveRobotCode(conversationRef = "") {
    const normalizedConversationRef = normalizeText(conversationRef);
    return normalizeText(this.robotCodeByConversation.get(normalizedConversationRef)) || this.defaultRobotCode;
  }

  resolveSessionWebhook(targetId) {
    this.pruneSessionWebhooks();
    const normalizedTarget = normalizeReplyTarget(targetId);
    if (isHttpUrl(normalizedTarget)) return normalizedTarget;

    const cachedConversation = this.sessionWebhookByConversation.get(normalizedTarget);
    if (cachedConversation?.url) return cachedConversation.url;

    const normalizedStaffId = normalizedTarget.startsWith("staff:")
      ? normalizedTarget.slice("staff:".length)
      : normalizedTarget;
    const cachedStaff = this.sessionWebhookByStaff.get(normalizedStaffId);
    if (cachedStaff?.url) return cachedStaff.url;

    if (isHttpUrl(this.defaultWebhookUrl)) return this.defaultWebhookUrl;
    return "";
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireAt) return this.accessToken;

    const response = await fetch(DINGTALK_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appKey: this.clientId,
        appSecret: this.clientSecret,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !normalizeText(payload.accessToken || payload.access_token)) {
      throw new Error(payload.message || payload.msg || payload.code || "钉钉 accessToken 获取失败");
    }

    this.accessToken = normalizeText(payload.accessToken || payload.access_token);
    const expireIn = Number(payload.expireIn || payload.expires_in || 7200);
    this.tokenExpireAt = Date.now() + Math.max(60, expireIn - 60) * 1000;
    return this.accessToken;
  }

  async sendByWebhook(webhookUrl, text) {
    const chunks = splitText(text, 1800);
    for (const chunk of chunks) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: chunk },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.errmsg || payload.message || `钉钉 Webhook 发送失败（HTTP ${response.status}）`);
      }
      const errCode = Number(payload.errcode ?? payload.code ?? 0);
      if (!Number.isNaN(errCode) && errCode !== 0) {
        throw new Error(payload.errmsg || payload.message || `钉钉 Webhook 发送失败（code ${errCode}）`);
      }
    }
  }

  async sendToOpenConversation(openConversationId, text, robotCode) {
    const accessToken = await this.getAccessToken();
    const chunks = splitText(text, 1800);
    for (const chunk of chunks) {
      const response = await fetch(DINGTALK_GROUP_MESSAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify({
          msgKey: "sampleText",
          msgParam: JSON.stringify({ content: chunk }),
          openConversationId,
          robotCode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.errmsg || `钉钉群消息发送失败（HTTP ${response.status}）`);
      }
      if (payload?.code && String(payload.code) !== "0") {
        throw new Error(payload.message || payload.errmsg || `钉钉群消息发送失败（code ${payload.code}）`);
      }
    }
  }

  async sendMessage(targetId, text) {
    const normalizedText = normalizeText(text);
    if (!normalizedText) return;

    const webhookUrl = this.resolveSessionWebhook(targetId);
    if (webhookUrl) {
      await this.sendByWebhook(webhookUrl, normalizedText);
      return;
    }

    const normalizedTarget = normalizeReplyTarget(targetId) || this.defaultOpenConversationId;
    if (!normalizedTarget) {
      throw new Error("钉钉目标不能为空，请先收到一条真实会话消息，或配置 defaultWebhookUrl。");
    }

     if (normalizedTarget.startsWith("cid:")) {
      const openConversationId = normalizedTarget.slice("cid:".length);
      const robotCode = this.resolveRobotCode(normalizedTarget);
      if (!robotCode) {
        throw new Error("钉钉群聊主动发消息需要 robotCode，请先配置 defaultRobotCode 或先收到一条真实群会话消息。");
      }
      await this.sendToOpenConversation(openConversationId, normalizedText, robotCode);
      return;
    }

    throw new Error(`当前钉钉连接器还没有可用的 SessionWebhook，无法向 ${normalizedTarget} 主动发消息。请先配置 defaultWebhookUrl，或先由对方发起一条消息建立会话。`);
  }

  async probe() {
    const accessToken = await this.getAccessToken();
    return {
      ok: Boolean(accessToken),
      status: "connected",
      message: `钉钉应用凭证校验通过：${this.clientId}`,
      checkedAt: Date.now(),
      raw: {
        hasDefaultWebhookUrl: Boolean(this.defaultWebhookUrl),
        hasDefaultOpenConversationId: Boolean(this.defaultOpenConversationId),
        hasDefaultRobotCode: Boolean(this.defaultRobotCode),
      },
    };
  }

  async handleWebhookRequest({ method, body }) {
    if (method === "GET") {
      return {
        ok: true,
        statusCode: 200,
        responseType: "json",
        responseBody: { ok: true, message: "DingTalk webhook route ready." },
        statusDetail: "钉钉 Webhook 探针可达。",
      };
    }

    if (method !== "POST") {
      return {
        ok: false,
        statusCode: 405,
        responseType: "json",
        responseBody: { ok: false, error: "钉钉 Webhook 仅支持 GET/POST。" },
        statusDetail: "钉钉 Webhook 仅支持 GET/POST。",
        healthScore: 30,
      };
    }

    const payload = parseJsonBody(body);
    if (payload.challenge) {
      return {
        ok: true,
        statusCode: 200,
        responseType: "json",
        responseBody: { challenge: payload.challenge },
        statusDetail: "钉钉回调 challenge 已响应。",
      };
    }

    this.rememberSessionWebhook(payload);

    const text = resolveInboundText(payload);
    if (!text) {
      return {
        ok: true,
        statusCode: 200,
        responseType: "json",
        responseBody: { ok: true, ignored: true },
        statusDetail: "钉钉回调已收到，但当前只处理文本消息。",
        healthScore: 88,
      };
    }

    const senderStaffId = normalizeText(payload.senderStaffId || payload.staffId || payload.senderId || payload.chatbotUserId);
    const conversationRef = pickConversationRef(payload) || (senderStaffId ? `staff:${senderStaffId}` : `dingtalk:${Date.now()}`);
    const sessionWebhook = this.resolveSessionWebhook(payload.sessionWebhook || conversationRef);
    const externalMessageId = normalizeText(
      payload.messageId
      || payload.msgId
      || payload.processQueryKey
      || `${conversationRef}:${Date.now()}`,
    );

    await this.emitInboundMessage({
      userId: senderStaffId || conversationRef,
      text,
      platformId: "dingtalk",
      externalMessageId,
      inboundMessageKey: `dingtalk:${externalMessageId}`,
      conversationRef,
      replyTargetId: sessionWebhook || conversationRef,
      participantLabel: pickParticipantLabel(payload) || senderStaffId || conversationRef,
      title: normalizeText(payload.conversationTitle || payload.chatbotName) || `dingtalk · ${conversationRef}`,
      remoteUserId: senderStaffId || undefined,
      remoteThreadId: conversationRef.startsWith("cid:") ? conversationRef.slice("cid:".length) : undefined,
      raw: payload,
    });

    return {
      ok: true,
      statusCode: 200,
      responseType: "json",
      responseBody: { ok: true },
      statusDetail: "钉钉文本消息已接入渠道会话。",
      healthScore: 100,
    };
  }
}
