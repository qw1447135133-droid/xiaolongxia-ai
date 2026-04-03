import { promises as fs } from "fs";

/**
 * Feishu/Lark adapter.
 *
 * Required fields:
 * - appId
 * - appSecret
 * - verifyToken
 * Optional fields:
 * - encryptKey
 * - defaultOpenId
 */

export default class FeishuAdapter {
  constructor() {
    this.appId = null;
    this.appSecret = null;
    this.verifyToken = null;
    this.encryptKey = null;
    this.defaultOpenId = null;
    this.accessToken = null;
    this.tokenExpireAt = 0;
    this.onMessage = null;
  }

  async init(fields, onMessage) {
    const { appId, appSecret, verifyToken, encryptKey, defaultOpenId } = fields;
    if (!appId?.trim()) throw new Error("appId 不能为空");
    if (!appSecret?.trim()) throw new Error("appSecret 不能为空");
    if (!verifyToken?.trim()) throw new Error("verifyToken 不能为空");

    this.appId = appId;
    this.appSecret = appSecret;
    this.verifyToken = verifyToken;
    this.encryptKey = encryptKey || null;
    this.defaultOpenId = defaultOpenId?.trim() || null;
    this.onMessage = onMessage;

    globalThis.__feishuAdapter = this;
    console.log("[feishu] Adapter ready. Webhook path: POST /webhook/feishu");
  }

  resolveTarget(userId) {
    const targetId = userId || this.defaultOpenId;
    if (!targetId) {
      throw new Error("飞书默认 Open ID 未配置");
    }
    return targetId;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireAt) return this.accessToken;
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`飞书获取 token 失败: ${data.msg}`);
    this.accessToken = data.tenant_access_token;
    this.tokenExpireAt = Date.now() + (data.expire - 60) * 1000;
    return this.accessToken;
  }

  async handleWebhookEvent(body) {
    if (body.challenge) return { challenge: body.challenge };

    const event = body.event;
    if (!event || body.header?.event_type !== "im.message.receive_v1") return {};

    const msgContent = event.message?.content;
    if (!msgContent) return {};

    let text = "";
    try {
      const parsed = JSON.parse(msgContent);
      text = parsed.text?.trim() || "";
    } catch {
      return {};
    }

    if (!text) return {};

    const senderId = event.sender?.sender_id?.open_id;
    if (senderId) this.onMessage(senderId, text, "feishu");
    return {};
  }

  async stop() {
    globalThis.__feishuAdapter = null;
    this.accessToken = null;
  }

  async sendMessage(userId, text) {
    const targetId = this.resolveTarget(userId);
    const token = await this.getAccessToken();
    const chunks = splitText(text, 3000);
    for (const chunk of chunks) {
      await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: targetId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk }),
        }),
      });
    }
  }

  async uploadFile(filePath, fileName) {
    const token = await this.getAccessToken();
    const fileBuffer = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file_type", fileName.split(".").pop() || "docx");
    form.append("file_name", fileName);
    form.append("file", new Blob([fileBuffer]), fileName);

    const res = await fetch("https://open.feishu.cn/open-apis/im/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });
    const data = await res.json();
    if (data.code !== 0 || !data.data?.file_key) {
      throw new Error(data.msg || "飞书文件上传失败");
    }
    return { token, fileKey: data.data.file_key };
  }

  async sendFile(userId, payload) {
    const targetId = this.resolveTarget(userId);
    if (payload.caption) {
      await this.sendMessage(targetId, payload.caption);
    }

    const { token, fileKey } = await this.uploadFile(payload.filePath, payload.fileName);
    const res = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: targetId,
        msg_type: "file",
        content: JSON.stringify({ file_key: fileKey }),
      }),
    });
    const data = await res.json();
    if (data.code !== 0) {
      throw new Error(data.msg || "飞书发送文件失败");
    }
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
