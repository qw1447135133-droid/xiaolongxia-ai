/**
 * 平台适配器模板。
 *
 * 新增渠道时，优先复制这份模板并补齐：
 * 1. init / stop
 * 2. sendMessage / sendFile（如支持）
 * 3. probe
 * 4. handleWebhookRequest（Webhook 型平台）
 *
 * 然后在 registry.js 中注册：
 * - id
 * - AdapterClass
 * - mode
 * - webhook.path / webhook.methods（如适用）
 * - capabilities
 */

export default class PlatformAdapterTemplate {
  constructor() {
    this.onMessage = null;
  }

  async init(fields, onMessage) {
    this.onMessage = onMessage;
    void fields;
    throw new Error("请在具体平台适配器中实现 init()");
  }

  async stop() {
    // 可选：关闭连接、停止轮询、释放资源
  }

  async sendMessage(targetId, text) {
    void targetId;
    void text;
    throw new Error("当前平台适配器尚未实现 sendMessage()");
  }

  async sendFile(targetId, payload) {
    void targetId;
    void payload;
    throw new Error("当前平台适配器尚未实现 sendFile()");
  }

  async probe() {
    return {
      ok: false,
      status: "idle",
      message: "当前平台适配器尚未实现 probe()",
      checkedAt: Date.now(),
    };
  }

  async handleWebhookRequest({ method, url, headers, query, body }) {
    void method;
    void url;
    void headers;
    void query;
    void body;

    return {
      ok: false,
      statusCode: 501,
      responseType: "empty",
      statusDetail: "当前平台适配器尚未实现 handleWebhookRequest()",
      healthScore: 25,
    };
  }

  emitInboundMessage(message) {
    if (typeof this.onMessage === "function") {
      return this.onMessage(message);
    }
    return undefined;
  }
}
