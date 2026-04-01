/**
 * telegram.js — Telegram Bot 适配器
 *
 * 所需字段：botToken, proxy（可选，格式 http://host:port 或 socks5://host:port）
 * 使用轮询方式（polling），无需公网 Webhook
 */

export default class TelegramAdapter {
  constructor() {
    this.bot = null;
  }

  async init(fields, onMessage) {
    const { botToken, proxy } = fields;
    if (!botToken?.trim()) throw new Error('botToken 不能为空');

    const { default: TelegramBot } = await import('node-telegram-bot-api').catch(() => {
      throw new Error('请先安装依赖：npm install node-telegram-bot-api');
    });

    const options = { polling: true };

    // 配置代理（国内访问 Telegram 必须）
    if (proxy?.trim()) {
      // 本地代理统一用 http://，避免误填 https:// 导致 TLS 握手失败
      const proxyUrl = proxy.trim().replace(/^https:\/\//, 'http://');
      if (proxyUrl.startsWith('socks')) {
        const { SocksProxyAgent } = await import('socks-proxy-agent').catch(() => {
          throw new Error('SOCKS 代理需要安装：npm install socks-proxy-agent');
        });
        options.request = { agent: new SocksProxyAgent(proxyUrl) };
      } else {
        const { HttpsProxyAgent } = await import('https-proxy-agent').catch(() => {
          throw new Error('HTTP 代理需要安装：npm install https-proxy-agent');
        });
        options.request = { agent: new HttpsProxyAgent(proxyUrl) };
      }
      console.log(`[telegram] using proxy: ${proxyUrl}`);
    }

    this.bot = new TelegramBot(botToken, options);

    this.bot.on('message', async (msg) => {
      const userId = String(msg.chat.id);
      const text = msg.text?.trim();
      if (!text) return;
      if (text === '/start') {
        this.bot.sendMessage(userId, '🦞 小龙虾 AI 团队已就位！请直接输入你的指令，例如：\n分析无线耳机市场，写英文文案');
        return;
      }
      if (text === '/help') {
        this.bot.sendMessage(userId, '📋 使用方式：\n直接发送指令给虾总管，他会拆解任务交给专员执行。\n\n例如：\n• 分析竞品\n• 写产品文案\n• 设计海报方案');
        return;
      }
      onMessage(userId, text, 'telegram');
    });

    this.bot.on('polling_error', (err) => {
      console.error('[telegram] polling error:', err.code, err.message);
    });
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
    }
  }

  async sendMessage(userId, text) {
    if (!this.bot) return;
    const chunks = splitText(text, 4096);
    for (const chunk of chunks) {
      await this.bot.sendMessage(userId, chunk, { parse_mode: 'Markdown' }).catch(() =>
        this.bot.sendMessage(userId, chunk)
      );
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
