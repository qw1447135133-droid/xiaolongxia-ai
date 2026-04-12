"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";

type DebugPlatformId = "web" | "dingtalk" | "wechat_official" | "qq";
type TranscriptItem = { id: string; role: "inbound" | "assistant" | "system"; text: string; at: number };

type PlatformLabConfig = {
  id: DebugPlatformId;
  title: string;
  webhookPath: string;
  pullPath?: string;
  intro: string;
  inboundPlaceholder: string;
  inboundLabel: string;
  targetHint: string;
};

const PLATFORM_LABS: PlatformLabConfig[] = [
  {
    id: "web",
    title: "Web 渠道",
    webhookPath: "/webhook/web",
    pullPath: "/api/web-channel/pull",
    intro: "适合官网聊天框 / H5 / 内嵌客服挂件。可以直接在这里模拟访客入站并拉取 AI 回复。",
    inboundPlaceholder: "你好，我想了解你们的活动方案。",
    inboundLabel: "访客消息",
    targetHint: "访客 ID / 会话 Ref",
  },
  {
    id: "dingtalk",
    title: "钉钉",
    webhookPath: "/webhook/dingtalk",
    intro: "这里可以直接模拟应用机器人收到一条文本消息，也可以触发一次主动测试发送。",
    inboundPlaceholder: "我们想聊一下渠道合作和报价。",
    inboundLabel: "钉钉入站文本",
    targetHint: "defaultWebhookUrl / openConversationId",
  },
  {
    id: "wechat_official",
    title: "微信公众号",
    webhookPath: "/webhook/wechat-official",
    intro: "这里走公众号标准明文回调协议，可模拟用户发来文本消息，再用客服消息接口回发测试消息。",
    inboundPlaceholder: "你好，我想咨询一下产品功能。",
    inboundLabel: "公众号文本消息",
    targetHint: "默认用户 OpenID",
  },
  {
    id: "qq",
    title: "QQ Bridge",
    webhookPath: "/webhook/qq",
    pullPath: "/api/qq-bridge/pull",
    intro: "这里对应本地 QQ 桥接模式。桥接程序负责把 QQ 消息推进来，再从拉取接口取走 AI 回复。",
    inboundPlaceholder: "你好，我想先加个联系方式。",
    inboundLabel: "QQ 入站消息",
    targetHint: "默认用户 / 群会话 ID",
  },
];

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

async function sha1Hex(input: string) {
  const buffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer)).map(item => item.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(buffer)).map(item => item.toString(16).padStart(2, "0")).join("");
}

export default function ChannelDebugPage() {
  const platformConfigs = useStore(s => s.platformConfigs);
  const [drafts, setDrafts] = useState<Record<DebugPlatformId, string>>({
    web: "",
    dingtalk: "",
    wechat_official: "",
    qq: "",
  });
  const [statuses, setStatuses] = useState<Record<DebugPlatformId, string>>({
    web: "等待联调",
    dingtalk: "等待联调",
    wechat_official: "等待联调",
    qq: "等待联调",
  });
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<DebugPlatformId, TranscriptItem[]>>({
    web: [],
    dingtalk: [],
    wechat_official: [],
    qq: [],
  });

  const snippetMap = useMemo(() => {
    const webFields = platformConfigs.web?.fields ?? {};
    const dingtalkFields = platformConfigs.dingtalk?.fields ?? {};
    const wechatFields = platformConfigs.wechat_official?.fields ?? {};
    const qqFields = platformConfigs.qq?.fields ?? {};

    return {
      web: [
        'fetch("/webhook/web", {',
        '  method: "POST",',
        "  headers: {",
        `    "x-starcraw-widget-token": "${webFields.publicWidgetToken || "<widget-token>"}",`,
        '    "Content-Type": "application/json",',
        "  },",
        '  body: JSON.stringify({ visitorId: "visitor_demo_001", text: "你好" }),',
        "});",
      ].join("\n"),
      dingtalk: [
        'fetch("/webhook/dingtalk", {',
        '  method: "POST",',
        '  headers: { "Content-Type": "application/json" },',
        "  body: JSON.stringify({",
        `    senderStaffId: "staff_demo",`,
        `    senderNick: "钉钉客户",`,
        `    conversationId: "${dingtalkFields.defaultOpenConversationId || "cid_demo"}",`,
        `    robotCode: "${dingtalkFields.defaultRobotCode || "ding_robot_code"}",`,
        '    msgtype: "text",',
        '    text: { content: "你好" }',
        "  }),",
        "});",
      ].join("\n"),
      wechat_official: [
        "POST /webhook/wechat-official?signature=...&timestamp=...&nonce=...",
        "<xml>",
        "  <ToUserName><![CDATA[gh_xxx]]></ToUserName>",
        "  <FromUserName><![CDATA[oAbCdEf]]></FromUserName>",
        "  <CreateTime>1712900000</CreateTime>",
        "  <MsgType><![CDATA[text]]></MsgType>",
        "  <Content><![CDATA[你好]]></Content>",
        "</xml>",
      ].join("\n"),
      qq: [
        'fetch("/webhook/qq", {',
        '  method: "POST",',
        "  headers: {",
        `    "x-starcraw-secret": "${qqFields.bridgeSecret || "<bridge-secret>"}",`,
        '    "Content-Type": "application/json",',
        "  },",
        '  body: JSON.stringify({ userId: "qq_demo_001", text: "你好" }),',
        "});",
      ].join("\n"),
    } satisfies Record<DebugPlatformId, string>;
  }, [platformConfigs]);

  function setPlatformStatus(platformId: DebugPlatformId, next: string) {
    setStatuses(current => ({ ...current, [platformId]: next }));
  }

  function pushTranscript(platformId: DebugPlatformId, item: TranscriptItem) {
    setTranscripts(current => ({
      ...current,
      [platformId]: [...current[platformId], item],
    }));
  }

  async function postPlatformInbound(platformId: DebugPlatformId) {
    const text = drafts[platformId].trim();
    if (!text) return;
    setBusy(current => ({ ...current, [`inbound:${platformId}`]: true }));
    try {
      if (platformId === "web") {
        const fields = platformConfigs.web?.fields ?? {};
        const body = JSON.stringify({
          visitorId: fields.defaultVisitorId?.trim() || "visitor_demo_001",
          conversationRef: `visitor:${fields.defaultVisitorId?.trim() || "visitor_demo_001"}`,
          participantLabel: "官网访客",
          text,
        });
        const url = await resolveBackendUrl("/webhook/web");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (fields.publicWidgetToken?.trim()) {
          headers["x-starcraw-widget-token"] = fields.publicWidgetToken.trim();
        } else if (fields.signingSecret?.trim()) {
          const timestamp = String(Date.now());
          const signature = await hmacSha256Hex(fields.signingSecret.trim(), timestamp, body);
          headers["x-starcraw-secret"] = fields.signingSecret.trim();
          headers["x-starcraw-timestamp"] = timestamp;
          headers["x-starcraw-signature"] = `sha256=${signature}`;
        } else {
          throw new Error("Web 渠道缺少 publicWidgetToken 或 signingSecret。");
        }
        const response = await fetch(url, { method: "POST", headers, body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "Web 入站失败");
      }

      if (platformId === "dingtalk") {
        const fields = platformConfigs.dingtalk?.fields ?? {};
        const url = await resolveBackendUrl("/webhook/dingtalk");
        const payload = {
          senderStaffId: "staff_demo_001",
          senderNick: "钉钉客户",
          conversationId: (fields.defaultOpenConversationId || "cid_demo").replace(/^cid:/, ""),
          robotCode: fields.defaultRobotCode || "ding_robot_demo",
          sessionWebhook: fields.defaultWebhookUrl || "",
          msgtype: "text",
          text: { content: text },
        };
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "钉钉入站失败");
      }

      if (platformId === "wechat_official") {
        const fields = platformConfigs.wechat_official?.fields ?? {};
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = "starcraw-debug";
        const signature = await sha1Hex([fields.token?.trim() || "", timestamp, nonce].sort().join(""));
        const xml = [
          "<xml>",
          `  <ToUserName><![CDATA[${fields.appId?.trim() || "gh_debug"}]]></ToUserName>`,
          `  <FromUserName><![CDATA[${fields.defaultOpenId?.trim() || "openid_debug"}]]></FromUserName>`,
          `  <CreateTime>${timestamp}</CreateTime>`,
          "  <MsgType><![CDATA[text]]></MsgType>",
          `  <Content><![CDATA[${text}]]></Content>`,
          `  <MsgId>${Date.now()}</MsgId>`,
          "</xml>",
        ].join("\n");
        const url = await resolveBackendUrl(`/webhook/wechat-official?signature=${signature}&timestamp=${timestamp}&nonce=${nonce}`);
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/xml" },
          body: xml,
        });
        const resultText = await response.text();
        if (!response.ok) throw new Error(resultText || "公众号入站失败");
      }

      if (platformId === "qq") {
        const fields = platformConfigs.qq?.fields ?? {};
        const url = await resolveBackendUrl("/webhook/qq");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-starcraw-secret": fields.bridgeSecret?.trim() || "",
          },
          body: JSON.stringify({
            userId: fields.defaultOpenId?.trim() || "qq_demo_001",
            conversationRef: `qq:${fields.defaultOpenId?.trim() || "qq_demo_001"}`,
            participantLabel: "QQ 客户",
            text,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "QQ 入站失败");
      }

      pushTranscript(platformId, {
        id: `${platformId}-in-${Date.now()}`,
        role: "inbound",
        text,
        at: Date.now(),
      });
      setDrafts(current => ({ ...current, [platformId]: "" }));
      setPlatformStatus(platformId, "入站测试已送达。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushTranscript(platformId, {
        id: `${platformId}-sys-${Date.now()}`,
        role: "system",
        text: message,
        at: Date.now(),
      });
      setPlatformStatus(platformId, message);
    } finally {
      setBusy(current => ({ ...current, [`inbound:${platformId}`]: false }));
    }
  }

  async function sendPlatformDebug(platformId: DebugPlatformId) {
    setBusy(current => ({ ...current, [`debug:${platformId}`]: true }));
    try {
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_test_message",
          platformId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "测试发送失败");
      }
      setPlatformStatus(platformId, result.message || "测试发送成功。");
    } catch (error) {
      setPlatformStatus(platformId, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(current => ({ ...current, [`debug:${platformId}`]: false }));
    }
  }

  async function pullReplies(platformId: Extract<DebugPlatformId, "web" | "qq">) {
    setBusy(current => ({ ...current, [`pull:${platformId}`]: true }));
    try {
      const fields = platformConfigs[platformId]?.fields ?? {};
      const path = platformId === "web" ? "/api/web-channel/pull" : "/api/qq-bridge/pull";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let body = "{}";
      if (platformId === "web") {
        const visitorId = fields.defaultVisitorId?.trim() || "visitor_demo_001";
        body = JSON.stringify({ visitorId, conversationRef: `visitor:${visitorId}`, limit: 20 });
        if (fields.publicWidgetToken?.trim()) {
          headers["x-starcraw-widget-token"] = fields.publicWidgetToken.trim();
        } else if (fields.signingSecret?.trim()) {
          const timestamp = String(Date.now());
          const signature = await hmacSha256Hex(fields.signingSecret.trim(), timestamp, body);
          headers["x-starcraw-secret"] = fields.signingSecret.trim();
          headers["x-starcraw-timestamp"] = timestamp;
          headers["x-starcraw-signature"] = `sha256=${signature}`;
        } else {
          throw new Error("Web 渠道缺少 publicWidgetToken 或 signingSecret。");
        }
      } else {
        const userId = fields.defaultOpenId?.trim() || "qq_demo_001";
        body = JSON.stringify({ userId, conversationRef: `qq:${userId}`, limit: 20 });
        headers["x-starcraw-secret"] = fields.bridgeSecret?.trim() || "";
      }

      const url = await resolveBackendUrl(path);
      const response = await fetch(url, { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "拉取失败");

      const messages = Array.isArray(result.messages) ? result.messages : [];
      if (messages.length === 0) {
        setPlatformStatus(platformId, "当前没有待拉取的 AI 回复。");
        return;
      }
      setTranscripts(current => ({
        ...current,
        [platformId]: [
          ...current[platformId],
          ...messages.map((item: { id: string; text: string; createdAt: number }) => ({
            id: item.id,
            role: "assistant" as const,
            text: item.text,
            at: item.createdAt || Date.now(),
          })),
        ],
      }));
      setPlatformStatus(platformId, `已拉取 ${messages.length} 条 AI 回复。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPlatformStatus(platformId, message);
    } finally {
      setBusy(current => ({ ...current, [`pull:${platformId}`]: false }));
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f7f9fc 0%, #edf2f9 100%)",
      color: "#0f172a",
      padding: "32px 20px 56px",
      fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={{
          display: "grid",
          gap: 10,
          padding: 24,
          borderRadius: 28,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(148,163,184,0.2)",
          boxShadow: "0 28px 90px rgba(15, 23, 42, 0.08)",
        }}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>Channel Debug Lab</div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>统一渠道联调页</h1>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569", maxWidth: 920 }}>
            这里把 `Web / 钉钉 / 微信公众号 / QQ Bridge` 的联调动作放到同一个页面里。
            你可以直接模拟入站消息、触发平台测试发送、以及在支持拉取的渠道上查看 AI 回流结果。
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/channel-integration-guide" style={linkButtonStyle("dark")}>打开运行指南</a>
            <a href="/web-channel-demo" style={linkButtonStyle("light")}>单独打开 Web 测试页</a>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {PLATFORM_LABS.map((platform) => {
            const config = platformConfigs[platform.id];
            const transcript = transcripts[platform.id];
            return (
              <article
                key={platform.id}
                style={{
                  display: "grid",
                  gap: 14,
                  alignContent: "start",
                  padding: 20,
                  borderRadius: 24,
                  background: "rgba(255,255,255,0.95)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.07)",
                }}
              >
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{platform.title}</div>
                    <span style={{
                      borderRadius: 999,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      background: config?.enabled ? "rgba(16,185,129,0.12)" : "rgba(248,113,113,0.12)",
                      color: config?.enabled ? "#047857" : "#b91c1c",
                    }}>
                      {config?.enabled ? "已启用" : "未启用"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#475569" }}>{platform.intro}</div>
                  <div style={{ display: "grid", gap: 4, fontSize: 12, color: "#64748b" }}>
                    <div>入站：<code>{platform.webhookPath}</code></div>
                    {platform.pullPath ? <div>拉取：<code>{platform.pullPath}</code></div> : null}
                    <div>目标：{platform.targetHint}</div>
                  </div>
                </div>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{platform.inboundLabel}</span>
                  <textarea
                    value={drafts[platform.id]}
                    onChange={(event) => setDrafts(current => ({ ...current, [platform.id]: event.target.value }))}
                    placeholder={platform.inboundPlaceholder}
                    style={{
                      minHeight: 96,
                      borderRadius: 16,
                      border: "1px solid rgba(148,163,184,0.24)",
                      padding: 12,
                      fontSize: 13,
                      lineHeight: 1.65,
                      resize: "vertical",
                    }}
                  />
                </label>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void postPlatformInbound(platform.id)}
                    disabled={busy[`inbound:${platform.id}`] || !drafts[platform.id].trim()}
                    style={actionButtonStyle("primary")}
                  >
                    {busy[`inbound:${platform.id}`] ? "发送中..." : "模拟入站"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendPlatformDebug(platform.id)}
                    disabled={busy[`debug:${platform.id}`] || !config?.enabled}
                    style={actionButtonStyle("light")}
                  >
                    {busy[`debug:${platform.id}`] ? "发送中..." : "测试外发"}
                  </button>
                  {platform.pullPath ? (
                    <button
                      type="button"
                      onClick={() => void pullReplies(platform.id as "web" | "qq")}
                      disabled={busy[`pull:${platform.id}`] || !config?.enabled}
                      style={actionButtonStyle("light")}
                    >
                      {busy[`pull:${platform.id}`] ? "拉取中..." : "拉取回复"}
                    </button>
                  ) : null}
                </div>

                <div style={{
                  borderRadius: 16,
                  padding: "12px 14px",
                  background: "rgba(248,250,252,0.9)",
                  border: "1px solid rgba(148,163,184,0.14)",
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: "#475569",
                }}>
                  {statuses[platform.id]}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>最小请求示例</div>
                  <pre style={{
                    margin: 0,
                    padding: 14,
                    borderRadius: 18,
                    background: "#0f172a",
                    color: "#e2e8f0",
                    fontSize: 11,
                    lineHeight: 1.7,
                    overflowX: "auto",
                  }}>
                    {snippetMap[platform.id]}
                  </pre>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>联调记录</div>
                  <div style={{
                    minHeight: 160,
                    maxHeight: 240,
                    overflowY: "auto",
                    display: "grid",
                    gap: 10,
                    paddingRight: 4,
                  }}>
                    {transcript.length === 0 ? (
                      <div style={{
                        borderRadius: 16,
                        border: "1px dashed rgba(148,163,184,0.3)",
                        background: "rgba(248,250,252,0.7)",
                        padding: 14,
                        fontSize: 12,
                        lineHeight: 1.7,
                        color: "#64748b",
                      }}>
                        还没有联调记录。你可以先发一条模拟入站，再触发测试外发。
                      </div>
                    ) : transcript.map(item => (
                      <article
                        key={item.id}
                        style={{
                          borderRadius: 16,
                          padding: "10px 12px",
                          background: item.role === "assistant"
                            ? "linear-gradient(135deg, #0f172a, #1e293b)"
                            : item.role === "inbound"
                              ? "rgba(59,130,246,0.1)"
                              : "rgba(248,113,113,0.1)",
                          color: item.role === "assistant" ? "#f8fafc" : "#0f172a",
                          border: item.role === "assistant" ? "none" : "1px solid rgba(148,163,184,0.18)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6, fontSize: 10, opacity: 0.78 }}>
                          <span>{item.role === "assistant" ? "AI 回复" : item.role === "inbound" ? "模拟入站" : "系统提示"}</span>
                          <span>{formatTime(item.at)}</span>
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 12 }}>{item.text}</div>
                      </article>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function actionButtonStyle(tone: "primary" | "light"): CSSProperties {
  if (tone === "primary") {
    return {
      border: "none",
      borderRadius: 14,
      padding: "10px 14px",
      background: "#0f172a",
      color: "#fff",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
    };
  }
  return {
    borderRadius: 14,
    padding: "10px 14px",
    border: "1px solid rgba(148,163,184,0.24)",
    background: "#fff",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function linkButtonStyle(tone: "dark" | "light"): CSSProperties {
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
        background: "rgba(255,255,255,0.86)",
        color: "#334155",
        border: "1px solid rgba(148,163,184,0.24)",
        fontSize: 12,
        fontWeight: 700,
      };
}
