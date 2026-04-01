/**
 * wecom.js — 企业微信自建应用适配器
 *
 * 所需字段：corpId, agentId, secret, token, encodingAESKey
 * 需要公网 Webhook URL
 * Webhook 路径：GET/POST /webhook/wecom
 */

import crypto from 'crypto';

export default class WecomAdapter {
  constructor() {
    this.corpId = null;
    this.agentId = null;
    this.secret = null;
    this.token = null;
    this.encodingAESKey = null;
    this.accessToken = null;
    this.tokenExpireAt = 0;
    this.onMessage = null;
  }

  async init(fields, onMessage) {
    const { corpId, agentId, secret, token, encodingAESKey } = fields;
    if (!corpId?.trim())          throw new Error('corpId 不能为空');
    if (!agentId?.trim())         throw new Error('agentId 不能为空');
    if (!secret?.trim())          throw new Error('secret 不能为空');
    if (!token?.trim())           throw new Error('token 不能为空');
    if (!encodingAESKey?.trim())  throw new Error('encodingAESKey 不能为空');

    this.corpId = corpId;
    this.agentId = agentId;
    this.secret = secret;
    this.token = token;
    this.encodingAESKey = encodingAESKey;
    this.onMessage = onMessage;

    globalThis.__wecomAdapter = this;
    console.log('[wecom] Adapter ready. Webhook path: GET|POST /webhook/wecom');
  }

  // 验证企业微信签名（GET 验证时使用）
  verifySignature({ timestamp, nonce, echostr, msg_signature }) {
    const arr = [this.token, timestamp, nonce, echostr ?? ''].sort();
    const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    return hash === msg_signature;
  }

  // 获取 access_token
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpireAt) return this.accessToken;
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.corpId}&corpsecret=${this.secret}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.errcode !== 0) throw new Error(`企业微信获取 token 失败: ${data.errmsg}`);
    this.accessToken = data.access_token;
    this.tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  // 处理 POST Webhook（消息接收，由 ws-server 调用）
  async handleWebhookMessage(xmlBody, query) {
    // 简单解析 XML 中的文本消息（生产建议用 xml2js 库）
    const fromUser = xmlBody.match(/<FromUserName><!\[CDATA\[(.*?)\]\]>/)?.[1];
    const msgType  = xmlBody.match(/<MsgType><!\[CDATA\[(.*?)\]\]>/)?.[1];
    const content  = xmlBody.match(/<Content><!\[CDATA\[(.*?)\]\]>/)?.[1];

    if (msgType === 'text' && fromUser && content?.trim()) {
      this.onMessage(fromUser, content.trim(), 'wecom');
    }
    return 'success';
  }

  async stop() {
    globalThis.__wecomAdapter = null;
    this.accessToken = null;
  }

  async sendMessage(userId, text) {
    const token = await this.getAccessToken();
    const chunks = splitText(text, 2048);
    for (const chunk of chunks) {
      await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: userId,
          msgtype: 'text',
          agentid: parseInt(this.agentId),
          text: { content: chunk },
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
