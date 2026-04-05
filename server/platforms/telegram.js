/**
 * Telegram Bot adapter.
 *
 * Required fields:
 * - botToken
 * Optional fields:
 * - proxy
 * - defaultChatId
 */

export default class TelegramAdapter {
  constructor() {
    this.bot = null;
    this.defaultChatId = null;
  }

  async init(fields, onMessage) {
    const { botToken, proxy, defaultChatId } = fields;
    if (!botToken?.trim()) throw new Error("botToken 不能为空");

    this.defaultChatId = defaultChatId?.trim() || null;

    const { default: TelegramBot } = await import("node-telegram-bot-api").catch(() => {
      throw new Error("请先安装依赖：npm install node-telegram-bot-api");
    });

    const options = { polling: true };

    if (proxy?.trim()) {
      const proxyUrl = proxy.trim().replace(/^https:\/\//, "http://");
      if (proxyUrl.startsWith("socks")) {
        const { SocksProxyAgent } = await import("socks-proxy-agent").catch(() => {
          throw new Error("SOCKS 代理需要安装：npm install socks-proxy-agent");
        });
        options.request = { agent: new SocksProxyAgent(proxyUrl) };
      } else {
        const { HttpsProxyAgent } = await import("https-proxy-agent").catch(() => {
          throw new Error("HTTP 代理需要安装：npm install https-proxy-agent");
        });
        options.request = { agent: new HttpsProxyAgent(proxyUrl) };
      }
      console.log(`[telegram] using proxy: ${proxyUrl}`);
    }

    this.bot = new TelegramBot(botToken, options);

    this.bot.on("message", async (msg) => {
      const userId = String(msg.chat.id);
      const text = msg.text?.trim();
      if (!text) return;

      if (text === "/start") {
        this.bot.sendMessage(userId, "🦞 小龙虾 AI 团队已就位，直接发指令即可。");
        return;
      }

      if (text === "/help") {
        this.bot.sendMessage(userId, "示例：分析竞品、输出文案、召开会议并导出结论。");
        return;
      }

      const externalMessageId = String(msg.message_id ?? `${userId}:${msg.date ?? Date.now()}`);
      onMessage({
        userId,
        text,
        platformId: "telegram",
        externalMessageId,
        inboundMessageKey: `telegram:${userId}:${externalMessageId}`,
      });
    });

    this.bot.on("polling_error", (err) => {
      console.error("[telegram] polling error:", err.code, err.message);
    });
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
    }
  }

  resolveTarget(userId) {
    const targetId = userId || this.defaultChatId;
    if (!targetId) {
      throw new Error("Telegram 默认 Chat ID 未配置");
    }
    return targetId;
  }

  async sendMessage(userId, text) {
    if (!this.bot) return;
    const targetId = this.resolveTarget(userId);
    const chunks = splitText(text, 4096);
    for (const chunk of chunks) {
      await this.bot.sendMessage(targetId, chunk, { parse_mode: "Markdown" }).catch(() =>
        this.bot.sendMessage(targetId, chunk),
      );
    }
  }

  async sendFile(userId, payload) {
    if (!this.bot) return;
    const targetId = this.resolveTarget(userId);
    await this.bot.sendDocument(targetId, payload.filePath, {
      caption: payload.caption?.slice(0, 900),
    });
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
