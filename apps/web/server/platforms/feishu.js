/**
 * feishu.js — 飞书机器人适配器
 *
 * 所需字段：appId, appSecret, verifyToken, encryptKey（可选）
 * 需要公网 Webhook URL
 * Webhook 路径：POST /webhook/feishu
 */

export default class FeishuAdapter {
  constructor() {
    this.appId = null;
    this.appSecret = null;
    this.verifyToken = null;
    this.encryptKey = null;
    this.accessToken = null;
    this.tokenExpireAt = 0;
    this.onMessage = null;
  }

  async init(fields, onMessage) {
    const { appId, appSecret, verifyToken, encryptKey } = fields;
    if (!appId?.trim())       throw new Error('appId 不能为空');
    if (!appSecret?.trim())   throw new Error('appSecret 不能为空');
    if (!verifyToken?.trim()) throw new Error('verifyToken 不能为空');

    this.appId = appId;
    this.appSecret = appSecret;
    this.verifyToken = verifyToken;
    this.encryptKey = encryptKey || null;
    this.onMessage = onMessage;

    globalThis.__feishuAdapter = this;
    console.log('[feishu] Adapter ready. Webhook path: POST /webhook/feishu');
  }

  // 获取 tenant_access_token
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireAt) return this.accessToken;
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(`飞书获取 token 失败: ${data.msg}`);
    this.accessToken = data.tenant_access_token;
    this.tokenExpireAt = Date.now() + (data.expire - 60) * 1000;
    return this.accessToken;
  }

  // 处理 Webhook 事件（由 ws-server 调用）
  async handleWebhookEvent(body) {
    // 验证 challenge
    if (body.challenge) return { challenge: body.challenge };

    const event = body.event;
    if (!event || body.header?.event_type !== 'im.message.receive_v1') return {};

    const msgContent = event.message?.content;
    if (!msgContent) return {};

    let text = '';
    try {
      const parsed = JSON.parse(msgContent);
      text = parsed.text?.trim() || '';
    } catch { return {}; }

    if (!text) return {};

    const senderId = event.sender?.sender_id?.open_id;
    if (senderId) this.onMessage(senderId, text, 'feishu');
    return {};
  }

  async stop() {
    globalThis.__feishuAdapter = null;
    this.accessToken = null;
  }

  async sendMessage(userId, text) {
    const token = await this.getAccessToken();
    // 飞书单条最长不超过 30000 字，分段发送
    const chunks = splitText(text, 3000);
    for (const chunk of chunks) {
      await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: userId,
          msg_type: 'text',
          content: JSON.stringify({ text: chunk }),
        }),
      });
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
