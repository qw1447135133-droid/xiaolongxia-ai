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
      const chatId = String(msg.chat.id);
      const senderId = String(msg.from?.id ?? chatId);
      const text = msg.text?.trim();
      if (!text) return;

      if (text === "/start") {
        this.bot.sendMessage(chatId, "STARCRAW 已就位，直接发指令即可。");
        return;
      }

      if (text === "/help") {
        this.bot.sendMessage(chatId, "示例：分析竞品、输出文案、召开会议并导出结论。");
        return;
      }

      const externalMessageId = String(msg.message_id ?? `${chatId}:${msg.date ?? Date.now()}`);
      const participantLabel =
        msg.chat.title
        || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ").trim()
        || msg.chat.username
        || chatId;
      onMessage({
        userId: chatId,
        text,
        platformId: "telegram",
        externalMessageId,
        inboundMessageKey: `telegram:${chatId}:${externalMessageId}`,
        conversationRef: `chat:${chatId}`,
        replyTargetId: `chat:${chatId}`,
        participantLabel,
        title: `telegram · ${participantLabel}`,
        remoteUserId: senderId,
        remoteThreadId: msg.message_thread_id ? String(msg.message_thread_id) : undefined,
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
    const normalized = String(userId || "").trim();
    const targetId = normalized.startsWith("chat:")
      ? normalized.slice("chat:".length)
      : (normalized || this.defaultChatId);
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

  async probe() {
    if (!this.bot) {
      return {
        ok: false,
        status: "idle",
        message: "Telegram 适配器尚未启动",
        checkedAt: Date.now(),
      };
    }

    const me = await this.bot.getMe();
    return {
      ok: true,
      status: "connected",
      message: `Telegram Bot 在线：@${me?.username || me?.first_name || "unknown"}`,
      checkedAt: Date.now(),
      raw: me,
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
