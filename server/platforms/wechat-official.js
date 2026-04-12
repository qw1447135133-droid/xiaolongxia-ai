import crypto from "crypto";
import PlatformAdapterTemplate from "./adapter-template.js";

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

function readXmlNode(xml, tagName) {
  const cdataPattern = new RegExp(`<${tagName}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tagName}>`, "i");
  const plainPattern = new RegExp(`<${tagName}>(.*?)<\\/${tagName}>`, "i");
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch?.[1]) return cdataMatch[1].trim();
  const plainMatch = xml.match(plainPattern);
  return plainMatch?.[1]?.trim() || "";
}

function xmlContainsEncrypt(xml) {
  return Boolean(readXmlNode(xml, "Encrypt"));
}

function readUInt32BE(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function decodeWeChatPayload(encodingAESKey, encrypted) {
  const normalizedKey = normalizeText(encodingAESKey);
  const normalizedEncrypted = normalizeText(encrypted);
  if (!normalizedKey || !normalizedEncrypted) {
    throw new Error("缺少公众号安全模式解密参数。");
  }

  const aesKey = Buffer.from(`${normalizedKey}=`, "base64");
  if (aesKey.length !== 32) {
    throw new Error("EncodingAESKey 无效，解密密钥长度不正确。");
  }

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(normalizedEncrypted, "base64"),
    decipher.final(),
  ]);

  const padding = decrypted[decrypted.length - 1];
  const content = padding > 0 && padding <= 32
    ? decrypted.subarray(0, decrypted.length - padding)
    : decrypted;

  if (content.length < 20) {
    throw new Error("公众号加密消息体长度异常。");
  }

  const xmlLength = readUInt32BE(content, 16);
  const xmlStart = 20;
  const xmlEnd = xmlStart + xmlLength;
  const xml = content.subarray(xmlStart, xmlEnd).toString("utf8");
  const appId = content.subarray(xmlEnd).toString("utf8");
  return { xml, appId };
}

function buildEventSummary(eventType, eventKey) {
  const normalizedEventType = normalizeText(eventType).toLowerCase();
  const normalizedEventKey = normalizeText(eventKey);
  if (!normalizedEventType) return "";
  if (normalizedEventType === "subscribe") {
    return normalizedEventKey ? `用户触发关注事件，场景值：${normalizedEventKey}` : "用户触发关注事件";
  }
  if (normalizedEventType === "unsubscribe") {
    return "用户触发取消关注事件";
  }
  if (normalizedEventType === "click") {
    return normalizedEventKey ? `用户点击了公众号菜单：${normalizedEventKey}` : "用户点击了公众号菜单";
  }
  if (normalizedEventType === "view") {
    return normalizedEventKey ? `用户点击了菜单跳转链接：${normalizedEventKey}` : "用户点击了菜单跳转链接";
  }
  if (normalizedEventType === "scan") {
    return normalizedEventKey ? `用户扫描了二维码，场景值：${normalizedEventKey}` : "用户扫描了二维码";
  }
  return normalizedEventKey ? `收到公众号事件 ${normalizedEventType}：${normalizedEventKey}` : `收到公众号事件 ${normalizedEventType}`;
}

export default class WechatOfficialAdapter extends PlatformAdapterTemplate {
  constructor() {
    super();
    this.appId = "";
    this.appSecret = "";
    this.token = "";
    this.encodingAESKey = "";
    this.defaultOpenId = "";
    this.accessToken = "";
    this.tokenExpireAt = 0;
    this.onMessage = null;
  }

  async init(fields, onMessage) {
    const { appId, appSecret, token, encodingAESKey, defaultOpenId } = fields ?? {};
    if (!normalizeText(appId)) throw new Error("appId 不能为空");
    if (!normalizeText(appSecret)) throw new Error("appSecret 不能为空");
    if (!normalizeText(token)) throw new Error("token 不能为空");

    this.appId = normalizeText(appId);
    this.appSecret = normalizeText(appSecret);
    this.token = normalizeText(token);
    this.encodingAESKey = normalizeText(encodingAESKey);
    this.defaultOpenId = normalizeText(defaultOpenId);
    this.onMessage = onMessage;
  }

  async stop() {
    this.accessToken = "";
    this.tokenExpireAt = 0;
  }

  verifySignature({ signature, timestamp, nonce }) {
    const normalizedSignature = normalizeText(signature);
    const normalizedTimestamp = normalizeText(timestamp);
    const normalizedNonce = normalizeText(nonce);
    if (!normalizedSignature || !normalizedTimestamp || !normalizedNonce) return false;

    const hash = crypto
      .createHash("sha1")
      .update([this.token, normalizedTimestamp, normalizedNonce].sort().join(""))
      .digest("hex");
    return hash === normalizedSignature;
  }

  verifyEncryptedSignature({ signature, timestamp, nonce, encrypted }) {
    const normalizedSignature = normalizeText(signature);
    const normalizedTimestamp = normalizeText(timestamp);
    const normalizedNonce = normalizeText(nonce);
    const normalizedEncrypted = normalizeText(encrypted);
    if (!normalizedSignature || !normalizedTimestamp || !normalizedNonce || !normalizedEncrypted) return false;

    const hash = crypto
      .createHash("sha1")
      .update([this.token, normalizedTimestamp, normalizedNonce, normalizedEncrypted].sort().join(""))
      .digest("hex");
    return hash === normalizedSignature;
  }

  decryptEncryptedEnvelope(encrypted) {
    const { xml, appId } = decodeWeChatPayload(this.encodingAESKey, encrypted);
    const normalizedAppId = normalizeText(appId);
    if (normalizedAppId && normalizedAppId !== this.appId) {
      throw new Error("公众号加密消息 AppID 校验失败。");
    }
    return xml;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireAt) return this.accessToken;

    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`;
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    const accessToken = normalizeText(payload.access_token);
    if (!response.ok || !accessToken) {
      throw new Error(payload.errmsg || payload.errcode || "微信公众号 access_token 获取失败");
    }

    this.accessToken = accessToken;
    const expiresIn = Number(payload.expires_in || 7200);
    this.tokenExpireAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
    return this.accessToken;
  }

  async sendMessage(targetId, text) {
    const normalizedTarget = normalizeText(targetId) || this.defaultOpenId;
    if (!normalizedTarget) {
      throw new Error("微信公众号目标 OpenID 不能为空");
    }

    const openId = normalizedTarget.startsWith("openid:")
      ? normalizedTarget.slice("openid:".length)
      : normalizedTarget;
    if (!openId) {
      throw new Error("微信公众号目标 OpenID 无效");
    }

    const accessToken = await this.getAccessToken();
    const chunks = splitText(normalizeText(text), 1800);
    for (const chunk of chunks) {
      const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          touser: openId,
          msgtype: "text",
          text: { content: chunk },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const errCode = Number(payload.errcode || 0);
      if (!response.ok || errCode !== 0) {
        throw new Error(payload.errmsg || `微信公众号客服消息发送失败（code ${errCode || response.status}）`);
      }
    }
  }

  async probe() {
    const accessToken = await this.getAccessToken();
    return {
      ok: Boolean(accessToken),
      status: "connected",
      message: `微信公众号凭证校验通过：${this.appId}`,
      checkedAt: Date.now(),
      raw: {
        supportsEncryptedCallback: Boolean(this.encodingAESKey),
        hasDefaultOpenId: Boolean(this.defaultOpenId),
      },
    };
  }

  async handleWebhookRequest({ method, query, body }) {
    if (method === "GET") {
      const encryptedEcho = normalizeText(query?.echostr);
      const encryptedSignature = normalizeText(query?.msg_signature || query?.signature);
      if (encryptedEcho && this.encodingAESKey && this.verifyEncryptedSignature({
        signature: encryptedSignature,
        timestamp: query?.timestamp,
        nonce: query?.nonce,
        encrypted: encryptedEcho,
      })) {
        return {
          ok: true,
          statusCode: 200,
          responseType: "text",
          responseBody: this.decryptEncryptedEnvelope(encryptedEcho),
          statusDetail: "微信公众号安全模式回调校验通过。",
        };
      }

      if (!this.verifySignature(query || {})) {
        return {
          ok: false,
          statusCode: 403,
          responseType: "text",
          responseBody: "signature invalid",
          statusDetail: "微信公众号回调签名校验失败。",
          healthScore: 35,
        };
      }

      return {
        ok: true,
        statusCode: 200,
        responseType: "text",
        responseBody: normalizeText(query?.echostr),
        statusDetail: "微信公众号回调校验通过。",
      };
    }

    if (method !== "POST") {
      return {
        ok: false,
        statusCode: 405,
        responseType: "text",
        responseBody: "unsupported method",
        statusDetail: "微信公众号 Webhook 仅支持 GET/POST。",
        healthScore: 30,
      };
    }

    if (!this.verifySignature(query || {})) {
      return {
        ok: false,
        statusCode: 403,
        responseType: "text",
        responseBody: "signature invalid",
        statusDetail: "微信公众号消息签名校验失败。",
        healthScore: 35,
      };
    }

    let xml = String(body || "");
    if (!xml.trim()) {
      return {
        ok: true,
        statusCode: 200,
        responseType: "text",
        responseBody: "success",
        statusDetail: "微信公众号空消息已忽略。",
      };
    }

    if (xmlContainsEncrypt(xml)) {
      const encrypted = readXmlNode(xml, "Encrypt");
      const encryptedSignature = normalizeText(query?.msg_signature || query?.signature);
      if (!this.encodingAESKey) {
        return {
          ok: false,
          statusCode: 400,
          responseType: "text",
          responseBody: "missing encodingAESKey",
          statusDetail: "收到公众号加密回调，但当前未配置 EncodingAESKey。",
          healthScore: 55,
        };
      }
      if (!this.verifyEncryptedSignature({
        signature: encryptedSignature,
        timestamp: query?.timestamp,
        nonce: query?.nonce,
        encrypted,
      })) {
        return {
          ok: false,
          statusCode: 403,
          responseType: "text",
          responseBody: "signature invalid",
          statusDetail: "微信公众号加密消息签名校验失败。",
          healthScore: 35,
        };
      }
      xml = this.decryptEncryptedEnvelope(encrypted);
    }

    const msgType = readXmlNode(xml, "MsgType");
    const fromUserName = readXmlNode(xml, "FromUserName");
    const toUserName = readXmlNode(xml, "ToUserName");
    const content = readXmlNode(xml, "Content");
    const msgId = readXmlNode(xml, "MsgId");
    const createTime = readXmlNode(xml, "CreateTime");
    const eventType = readXmlNode(xml, "Event");
    const eventKey = readXmlNode(xml, "EventKey");

    if (msgType === "text" && fromUserName && content) {
      const externalMessageId = normalizeText(msgId) || `${fromUserName}:${createTime || Date.now()}`;
      await this.emitInboundMessage({
        userId: fromUserName,
        text: content,
        platformId: "wechat_official",
        externalMessageId,
        inboundMessageKey: `wechat_official:${externalMessageId}`,
        conversationRef: `openid:${fromUserName}`,
        replyTargetId: `openid:${fromUserName}`,
        participantLabel: fromUserName,
        title: `wechat_official · ${toUserName || fromUserName}`,
        remoteUserId: fromUserName,
        raw: {
          msgType,
          toUserName,
          createTime,
        },
      });
    }

    if (msgType === "event" && fromUserName) {
      const eventSummary = buildEventSummary(eventType, eventKey);
      if (eventSummary) {
        const externalMessageId = `${fromUserName}:${eventType || "event"}:${createTime || Date.now()}`;
        await this.emitInboundMessage({
          userId: fromUserName,
          text: eventSummary,
          platformId: "wechat_official",
          externalMessageId,
          inboundMessageKey: `wechat_official:${externalMessageId}`,
          conversationRef: `openid:${fromUserName}`,
          replyTargetId: `openid:${fromUserName}`,
          participantLabel: fromUserName,
          title: `wechat_official · ${toUserName || fromUserName}`,
          remoteUserId: fromUserName,
          raw: {
            msgType,
            eventType,
            eventKey,
            toUserName,
            createTime,
          },
        });
      }
    }

    return {
      ok: true,
      statusCode: 200,
      responseType: "text",
      responseBody: "success",
      statusDetail: msgType === "text"
        ? "微信公众号文本消息已接入渠道会话。"
        : msgType === "event"
          ? "微信公众号事件消息已接入渠道会话。"
          : "微信公众号回调已收到，当前仅处理文本与事件消息。",
      healthScore: 100,
    };
  }
}
