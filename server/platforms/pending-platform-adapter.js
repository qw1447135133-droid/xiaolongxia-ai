import PlatformAdapterTemplate from "./adapter-template.js";

export function createPendingPlatformAdapter({
  platformId,
  displayName,
  webhookDisplayName,
  supportsWebhook = false,
}) {
  return class PendingPlatformAdapter extends PlatformAdapterTemplate {
    constructor() {
      super();
      this.platformId = platformId;
      this.displayName = displayName;
      this.webhookDisplayName = webhookDisplayName || displayName;
      this.fields = {};
    }

    async init(fields, onMessage) {
      this.fields = fields ?? {};
      this.onMessage = onMessage;
    }

    async sendMessage() {
      throw new Error(`${this.displayName} 渠道骨架已注册，但真实发送链路尚未实现。`);
    }

    async sendFile() {
      throw new Error(`${this.displayName} 渠道骨架已注册，但文件发送链路尚未实现。`);
    }

    async probe() {
      return {
        ok: false,
        status: "configured",
        message: `${this.displayName} 接入骨架已就绪，待补真实 SDK / OAuth / Webhook 编排。`,
        checkedAt: Date.now(),
      };
    }

    async handleWebhookRequest() {
      if (!supportsWebhook) {
        return {
          ok: false,
          statusCode: 405,
          responseType: "json",
          responseBody: {
            ok: false,
            error: `${this.webhookDisplayName} 当前不是 Webhook 入口型接入。`,
          },
          statusDetail: `${this.webhookDisplayName} 当前不是 Webhook 入口型接入。`,
          healthScore: 30,
        };
      }

      return {
        ok: false,
        statusCode: 501,
        responseType: "json",
        responseBody: {
          ok: false,
          error: `${this.webhookDisplayName} Webhook 已命中骨架入口，但消息解析与签名校验尚未实现。`,
        },
        statusDetail: `${this.webhookDisplayName} Webhook 已命中骨架入口，但消息解析与签名校验尚未实现。`,
        healthScore: 55,
      };
    }
  };
}
