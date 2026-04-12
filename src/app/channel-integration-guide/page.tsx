const sections = [
  {
    title: "Web 渠道",
    intro: "适合官网聊天框、H5 客服窗口和内嵌挂件。当前项目已经内置轻量挂件脚本和调试页。",
    bullets: [
      "站点侧推荐使用 `publicWidgetToken + allowedOrigins`，不要把 `signingSecret` 暴露在前端。",
      "入站接口：`POST /webhook/web`。",
      "拉取回复：`POST /api/web-channel/pull`。",
      "静态挂件脚本：`GET /starcraw-web-widget.js`。",
    ],
    code: [
      '<script src="https://your-domain.com/starcraw-web-widget.js"></script>',
      "<script>",
      "  window.StarcrawWebChannel.init({",
      '    baseUrl: "https://your-domain.com",',
      '    widgetToken: "<your-widget-token>",',
      "  });",
      "</script>",
    ].join("\n"),
  },
  {
    title: "钉钉",
    intro: "当前优先支持应用机器人会话接入，兼顾 `sessionWebhook` 回消息和 `openConversationId + robotCode` 主动群发。",
    bullets: [
      "入站接口：`POST /webhook/dingtalk`。",
      "收到真实会话后会自动缓存 `sessionWebhook` 和 `robotCode`。",
      "主动群发建议配置 `defaultRobotCode`，并配合 `defaultOpenConversationId` 使用。",
      "如果只是做回话回复，优先让真实会话先打一条消息进来。",
    ],
    code: [
      "{",
      '  "senderStaffId": "staff_demo_001",',
      '  "senderNick": "钉钉客户",',
      '  "conversationId": "cid_xxx",',
      '  "robotCode": "ding_robot_code",',
      '  "msgtype": "text",',
      '  "text": { "content": "你好" }',
      "}",
    ].join("\n"),
  },
  {
    title: "微信公众号",
    intro: "已经支持明文与安全模式回调、文本消息和事件消息接入，以及客服文本外发。",
    bullets: [
      "回调地址：`GET/POST /webhook/wechat-official`。",
      "明文模式只需要 `token`；安全模式还需要 `encodingAESKey`。",
      "安全模式会校验 `msg_signature` 并自动解密 `Encrypt` 消息体。",
      "主动外发走客服消息接口，因此目标用户必须在可触达窗口内。",
    ],
    code: [
      "POST /webhook/wechat-official?signature=...&timestamp=...&nonce=...",
      "<xml>",
      "  <ToUserName><![CDATA[gh_xxx]]></ToUserName>",
      "  <FromUserName><![CDATA[oAbCdEf]]></FromUserName>",
      "  <CreateTime>1712900000</CreateTime>",
      "  <MsgType><![CDATA[text]]></MsgType>",
      "  <Content><![CDATA[你好]]></Content>",
      "</xml>",
    ].join("\n"),
  },
  {
    title: "QQ Bridge",
    intro: "QQ 当前采用本地桥接模式。桥接程序负责监听 QQ，把真实消息推到工作台，再把 AI 回复拉回去代发。",
    bullets: [
      "入站接口：`POST /webhook/qq`。",
      "拉取回复：`POST /api/qq-bridge/pull`。",
      "桥接鉴权：请求头 `x-starcraw-secret`。",
      "仓库已附带示例脚本：`node scripts/qq-bridge-example.mjs http://localhost:3001 <bridgeSecret> <qqUserId>`。",
    ],
    code: [
      'fetch("/webhook/qq", {',
      '  method: "POST",',
      '  headers: { "x-starcraw-secret": "<bridge-secret>", "Content-Type": "application/json" },',
      '  body: JSON.stringify({ userId: "qq_demo_001", text: "你好" })',
      "})",
    ].join("\n"),
  },
];

export default function ChannelIntegrationGuidePage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
      color: "#0f172a",
      padding: "32px 20px 56px",
      fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={{
          display: "grid",
          gap: 10,
          padding: 24,
          borderRadius: 28,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(148,163,184,0.2)",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
        }}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>Channel Guide</div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>渠道接入运行指南</h1>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569", maxWidth: 860 }}>
            这里收口当前项目已经落地的渠道接入方式，方便你快速判断每条渠道是“直接接官方接口”、还是“通过本地桥接落地”。
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/channel-debug" style={guideLinkStyle("dark")}>打开统一联调页</a>
            <a href="/web-channel-demo" style={guideLinkStyle("light")}>单独打开 Web 测试页</a>
          </div>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            style={{
              display: "grid",
              gap: 14,
              padding: 22,
              borderRadius: 24,
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(148,163,184,0.16)",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{section.title}</h2>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569" }}>{section.intro}</div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {section.bullets.map((bullet) => (
                <div key={bullet} style={{ fontSize: 13, lineHeight: 1.7, color: "#334155" }}>
                  {bullet}
                </div>
              ))}
            </div>
            <pre style={{
              margin: 0,
              padding: 16,
              borderRadius: 18,
              background: "#0f172a",
              color: "#e2e8f0",
              fontSize: 12,
              lineHeight: 1.7,
              overflowX: "auto",
            }}>
              {section.code}
            </pre>
          </section>
        ))}
      </div>
    </main>
  );
}

function guideLinkStyle(tone: "dark" | "light") {
  return tone === "dark"
    ? {
        textDecoration: "none",
        borderRadius: 999,
        padding: "10px 14px",
        background: "#0f172a",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
      }
    : {
        textDecoration: "none",
        borderRadius: 999,
        padding: "10px 14px",
        background: "#fff",
        color: "#334155",
        border: "1px solid rgba(148,163,184,0.24)",
        fontSize: 12,
        fontWeight: 700,
      };
}
