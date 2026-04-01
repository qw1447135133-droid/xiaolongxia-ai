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

    // 将处理函数注册到全局（ws-server.js 的 HTTP 服务会调用）
    globalThis.__lineAdapter = this;
    console.log('[line] Adapter ready. Webhook path: POST /webhook/line');
  }

  async handleWebhookEvents(events) {
    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;
      const userId = event.source.userId;
      const text = event.message.text?.trim();
      if (!text) continue;
      this.onMessage(userId, text, 'line');
    }
  }

  async stop() {
    globalThis.__lineAdapter = null;
    this.client = null;
    this.middleware = null;
  }

  async sendMessage(userId, text) {
    if (!this.client) return;
    // LINE 单条最长 5000 字
    const chunks = splitText(text, 5000);
    for (const chunk of chunks) {
      await this.client.pushMessage(userId, { type: 'text', text: chunk });
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
