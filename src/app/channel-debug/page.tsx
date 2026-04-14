"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { PLATFORM_DEFINITIONS, type PlatformConfig, type PlatformDef } from "@/store/types";
import { useStore } from "@/store";

type TranscriptItem = {
  id: string;
  role: "inbound" | "assistant" | "system";
  text: string;
  at: number;
};

type ActionId = "diagnose" | "probe_webhook" | "send_test_message" | "simulate_inbound" | "replay_last_debug";
type LabPlatformId = "web" | "dingtalk" | "wechat_official" | "qq";

const LAB_PLATFORM_IDS = new Set<LabPlatformId>(["web", "dingtalk", "wechat_official", "qq"]);

const LAB_INTRO: Record<LabPlatformId, string> = {
  web: "适合官网聊天框 / H5 / 内嵌客服挂件。可直接模拟访客入站并拉取 AI 回复。",
  dingtalk: "适合联调应用机器人、默认会话和主动测试发信。",
  wechat_official: "适合验证公众号回调链路、默认 OpenID 和客服消息回发。",
  qq: "适合验证本地桥接推送、拉取、回执、dead-letter 与文件下发链路。",
};

function formatTime(timestamp?: number | null) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
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

function statusTone(status?: string) {
  switch (status) {
    case "connected":
      return { color: "#16a34a", background: "rgba(22,163,74,0.12)", label: "Connected" };
    case "degraded":
    case "rate_limited":
      return { color: "#d97706", background: "rgba(217,119,6,0.12)", label: "Degraded" };
    case "error":
    case "auth_failed":
    case "webhook_unreachable":
      return { color: "#dc2626", background: "rgba(220,38,38,0.12)", label: "Attention" };
    case "configured":
    case "syncing":
    case "webhook_missing":
      return { color: "#2563eb", background: "rgba(37,99,235,0.12)", label: "Config" };
    default:
      return { color: "#64748b", background: "rgba(100,116,139,0.12)", label: "Idle" };
  }
}

function describeCapabilities(def: PlatformDef) {
  const items = [];
  if (def.capabilities.supportsWebhook) items.push("Webhook");
  if (def.capabilities.supportsPush) items.push("Push");
  if (def.capabilities.supportsFileSend) items.push("File");
  if (def.capabilities.supportsMediaSend) items.push("Media");
  if (def.capabilities.supportsGroupChat) items.push("Group");
  if (def.capabilities.supportsDirectChat) items.push("Direct");
  if (def.capabilities.supportsThreadReply) items.push("Thread");
  if (def.capabilities.supportsSessionResume) items.push("Resume");
  if (def.capabilities.supportsProbe) items.push("Probe");
  return items;
}

function defaultTargetForPlatform(platformId: string, config?: PlatformConfig | null) {
  const fields = config?.fields ?? {};
  if (platformId === "telegram") return String(fields.defaultChatId || "").trim();
  if (platformId === "feishu" || platformId === "wechat_official" || platformId === "qq") return String(fields.defaultOpenId || "").trim();
  if (platformId === "dingtalk") return String(fields.defaultOpenConversationId || fields.defaultWebhookUrl || "").trim();
  if (platformId === "web") return String(fields.defaultVisitorId || "").trim();
  return String(config?.lastInboundTarget || "").trim();
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <article style={{ ...panelStyle, gap: 8 }}>
      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent }}>{value}</div>
    </article>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 14, background: "rgba(248,250,252,0.8)", border: "1px solid rgba(148,163,184,0.14)" }}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

export default function ChannelDebugPage() {
  const platformConfigs = useStore(s => s.platformConfigs);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptItem[]>>({});

  const enabledCount = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.enabled).length,
    [platformConfigs],
  );
  const connectedCount = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.status === "connected").length,
    [platformConfigs],
  );
  const attentionCount = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => ["degraded", "error", "auth_failed", "webhook_unreachable", "rate_limited"].includes(platformConfigs[def.id]?.status || "")).length,
    [platformConfigs],
  );
  const pendingEvents = useMemo(
    () => PLATFORM_DEFINITIONS.reduce((sum, def) => sum + Number(platformConfigs[def.id]?.pendingEvents || 0), 0),
    [platformConfigs],
  );

  function setBusyFlag(key: string, next: boolean) {
    setBusy(current => ({ ...current, [key]: next }));
  }

  function pushTranscript(platformId: string, item: TranscriptItem) {
    setTranscripts(current => ({
      ...current,
      [platformId]: [...(current[platformId] ?? []), item],
    }));
  }

  async function runDebugAction(platformId: string, action: ActionId, extra: Record<string, unknown> = {}) {
    const key = `${platformId}:${action}`;
    setBusyFlag(key, true);
    try {
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, platformId, ...extra }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || result.message || `${action} failed`);
      }
      const nextFeedback =
        action === "diagnose"
          ? JSON.stringify(result.report ?? result, null, 2)
          : action === "probe_webhook"
            ? JSON.stringify(result.probe ?? result, null, 2)
            : typeof result.message === "string" && result.message.trim()
              ? result.message.trim()
              : JSON.stringify(result, null, 2);
      setFeedback(current => ({ ...current, [platformId]: nextFeedback }));
      if (action === "simulate_inbound" && typeof extra.text === "string" && extra.text.trim()) {
        pushTranscript(platformId, {
          id: `${platformId}-sim-${Date.now()}`,
          role: "inbound",
          text: extra.text.trim(),
          at: Date.now(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(current => ({ ...current, [platformId]: message }));
      pushTranscript(platformId, {
        id: `${platformId}-sys-${Date.now()}`,
        role: "system",
        text: message,
        at: Date.now(),
      });
    } finally {
      setBusyFlag(key, false);
    }
  }

  async function postPlatformInbound(platformId: LabPlatformId) {
    const text = String(drafts[platformId] || "").trim();
    if (!text) return;
    const config = platformConfigs[platformId];
    const fields = config?.fields ?? {};
    const busyKey = `${platformId}:inbound`;
    setBusyFlag(busyKey, true);
    try {
      if (platformId === "web") {
        const visitorId = String(fields.defaultVisitorId || "").trim() || "visitor_demo_001";
        const body = JSON.stringify({
          visitorId,
          conversationRef: `visitor:${visitorId}`,
          participantLabel: "官网访客",
          text,
        });
        const url = await resolveBackendUrl("/webhook/web");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (String(fields.publicWidgetToken || "").trim()) {
          headers["x-starcraw-widget-token"] = String(fields.publicWidgetToken).trim();
        } else if (String(fields.signingSecret || "").trim()) {
          const timestamp = String(Date.now());
          const signature = await hmacSha256Hex(String(fields.signingSecret).trim(), timestamp, body);
          headers["x-starcraw-secret"] = String(fields.signingSecret).trim();
          headers["x-starcraw-timestamp"] = timestamp;
          headers["x-starcraw-signature"] = `sha256=${signature}`;
        } else {
          throw new Error("Web 渠道缺少 publicWidgetToken 或 signingSecret。");
        }
        const response = await fetch(url, { method: "POST", headers, body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw new Error(result.error || "Web 入站失败");
      }

      if (platformId === "dingtalk") {
        const url = await resolveBackendUrl("/webhook/dingtalk");
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderStaffId: "staff_demo_001",
            senderNick: "钉钉客户",
            conversationId: (String(fields.defaultOpenConversationId || "cid_demo")).replace(/^cid:/, ""),
            robotCode: String(fields.defaultRobotCode || "ding_robot_demo"),
            sessionWebhook: String(fields.defaultWebhookUrl || ""),
            msgtype: "text",
            text: { content: text },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw new Error(result.error || "钉钉入站失败");
      }

      if (platformId === "wechat_official") {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = "starcraw-debug";
        const token = String(fields.token || "").trim();
        const signature = await sha1Hex([token, timestamp, nonce].sort().join(""));
        const xml = [
          "<xml>",
          `  <ToUserName><![CDATA[${String(fields.appId || "gh_debug").trim()}]]></ToUserName>`,
          `  <FromUserName><![CDATA[${String(fields.defaultOpenId || "openid_debug").trim()}]]></FromUserName>`,
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
        const userId = String(fields.defaultOpenId || "").trim() || "qq_demo_001";
        const url = await resolveBackendUrl("/webhook/qq");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-starcraw-secret": String(fields.bridgeSecret || "").trim(),
          },
          body: JSON.stringify({
            userId,
            conversationRef: `qq:${userId}`,
            participantLabel: "QQ 客户",
            text,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw new Error(result.error || "QQ 入站失败");
      }

      pushTranscript(platformId, {
        id: `${platformId}-in-${Date.now()}`,
        role: "inbound",
        text,
        at: Date.now(),
      });
      setDrafts(current => ({ ...current, [platformId]: "" }));
      setFeedback(current => ({ ...current, [platformId]: "模拟入站已送达。" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(current => ({ ...current, [platformId]: message }));
      pushTranscript(platformId, {
        id: `${platformId}-sys-${Date.now()}`,
        role: "system",
        text: message,
        at: Date.now(),
      });
    } finally {
      setBusyFlag(busyKey, false);
    }
  }

  async function pullReplies(platformId: "web" | "qq") {
    const config = platformConfigs[platformId];
    const fields = config?.fields ?? {};
    const busyKey = `${platformId}:pull`;
    setBusyFlag(busyKey, true);
    try {
      const path = platformId === "web" ? "/api/web-channel/pull" : "/api/qq-bridge/pull";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let body = "{}";

      if (platformId === "web") {
        const visitorId = String(fields.defaultVisitorId || "").trim() || "visitor_demo_001";
        body = JSON.stringify({ visitorId, conversationRef: `visitor:${visitorId}`, limit: 20 });
        if (String(fields.publicWidgetToken || "").trim()) {
          headers["x-starcraw-widget-token"] = String(fields.publicWidgetToken).trim();
        } else if (String(fields.signingSecret || "").trim()) {
          const timestamp = String(Date.now());
          const signature = await hmacSha256Hex(String(fields.signingSecret).trim(), timestamp, body);
          headers["x-starcraw-secret"] = String(fields.signingSecret).trim();
          headers["x-starcraw-timestamp"] = timestamp;
          headers["x-starcraw-signature"] = `sha256=${signature}`;
        } else {
          throw new Error("Web 渠道缺少 publicWidgetToken 或 signingSecret。");
        }
      } else {
        const userId = String(fields.defaultOpenId || "").trim() || "qq_demo_001";
        body = JSON.stringify({ userId, conversationRef: `qq:${userId}`, limit: 20 });
        headers["x-starcraw-secret"] = String(fields.bridgeSecret || "").trim();
      }

      const url = await resolveBackendUrl(path);
      const response = await fetch(url, { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || "拉取失败");

      const messages = Array.isArray(result.messages) ? result.messages : [];
      if (messages.length === 0) {
        setFeedback(current => ({ ...current, [platformId]: "当前没有待拉取的 AI 回复。" }));
        return;
      }

      setTranscripts(current => ({
        ...current,
        [platformId]: [
          ...(current[platformId] ?? []),
          ...messages.map((item: { id: string; text?: string; createdAt?: number; kind?: string; attachment?: { fileName?: string; caption?: string } }) => ({
            id: item.id,
            role: "assistant" as const,
            text: item.kind === "file"
              ? `[FILE] ${item.attachment?.fileName || "unnamed"}${item.attachment?.caption ? ` · ${item.attachment.caption}` : ""}`
              : String(item.text || ""),
            at: item.createdAt || Date.now(),
          })),
        ],
      }));
      setFeedback(current => ({
        ...current,
        [platformId]: platformId === "qq" && result.deadLetterCount
          ? `已拉取 ${messages.length} 条 AI 回复，dead-letter ${result.deadLetterCount} 条。`
          : `已拉取 ${messages.length} 条 AI 回复。`,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback(current => ({ ...current, [platformId]: message }));
      pushTranscript(platformId, {
        id: `${platformId}-pull-${Date.now()}`,
        role: "system",
        text: message,
        at: Date.now(),
      });
    } finally {
      setBusyFlag(busyKey, false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={heroStyle}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>Channel Doctor</div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>全渠道统一联调与平台 Doctor</h1>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569", maxWidth: 980 }}>
            这一页把所有渠道的健康、默认目标、最近失败、回放、Webhook 探测、冷却状态和桥接回执统一收口。
            现在不只是看“配没配上”，还能看到哪里在堵、是否能重放、以及 QQ 桥接是否已经把送达/失败回写回来。
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/channel-integration-guide" style={linkButtonStyle("dark")}>打开接入指南</a>
            <a href="/hermes-architecture" style={linkButtonStyle("light")}>打开 Hermes 架构页</a>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <MetricCard label="已启用渠道" value={enabledCount} accent="#2563eb" />
          <MetricCard label="已连接" value={connectedCount} accent="#16a34a" />
          <MetricCard label="需关注" value={attentionCount} accent="#dc2626" />
          <MetricCard label="待处理事件" value={pendingEvents} accent="#d97706" />
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          {PLATFORM_DEFINITIONS.map((def) => {
            const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" as const };
            const tone = statusTone(config.status);
            const target = defaultTargetForPlatform(def.id, config);
            const capabilities = describeCapabilities(def);
            const debugHistory = config.debugHistory ?? [];
            const failures = config.recentFailedMessages ?? [];
            const actionFeedback = feedback[def.id];
            const isLab = LAB_PLATFORM_IDS.has(def.id as LabPlatformId);
            const transcript = transcripts[def.id] ?? [];

            return (
              <article
                key={def.id}
                style={{
                  ...panelStyle,
                  border: `1px solid ${tone.color}2d`,
                  boxShadow: `0 20px 42px ${tone.background}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 24 }}>{def.emoji}</span>
                      <h2 style={{ margin: 0, fontSize: 22 }}>{def.name}</h2>
                      <span style={{ borderRadius: 999, padding: "6px 10px", background: tone.background, color: tone.color, fontSize: 11, fontWeight: 800 }}>
                        {config.status} · {tone.label}
                      </span>
                      <span style={subBadgeStyle(config.enabled ? "#0f172a" : "#64748b", config.enabled ? "#e2e8f0" : "#f8fafc")}>
                        {config.enabled ? "已启用" : "未启用"}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569", maxWidth: 980 }}>{def.description}</div>
                    {isLab ? <div style={{ fontSize: 12, color: "#334155" }}>{LAB_INTRO[def.id as LabPlatformId]}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <button type="button" style={ghostButtonStyle} onClick={() => void runDebugAction(def.id, "diagnose")} disabled={busy[`${def.id}:diagnose`]}>
                      {busy[`${def.id}:diagnose`] ? "诊断中..." : "Doctor"}
                    </button>
                    <button type="button" style={ghostButtonStyle} onClick={() => void runDebugAction(def.id, "probe_webhook")} disabled={busy[`${def.id}:probe_webhook`] || !def.capabilities.supportsWebhook}>
                      {busy[`${def.id}:probe_webhook`] ? "探测中..." : "Probe Webhook"}
                    </button>
                    <button type="button" style={darkButtonStyle} onClick={() => void runDebugAction(def.id, "send_test_message")} disabled={busy[`${def.id}:send_test_message`]}>
                      {busy[`${def.id}:send_test_message`] ? "发送中..." : "Send Test"}
                    </button>
                    <button type="button" style={ghostButtonStyle} onClick={() => void runDebugAction(def.id, "replay_last_debug")} disabled={busy[`${def.id}:replay_last_debug`] || !config.lastDebugAction}>
                      {busy[`${def.id}:replay_last_debug`] ? "回放中..." : "Replay"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <InfoStat label="模式" value={def.mode} />
                  <InfoStat label="默认目标" value={target || "未配置"} />
                  <InfoStat label="健康分" value={typeof config.healthScore === "number" ? String(config.healthScore) : "—"} />
                  <InfoStat label="待处理" value={String(config.pendingEvents ?? 0)} />
                  <InfoStat label="最近联调" value={config.lastDebugAt ? formatTime(config.lastDebugAt) : "—"} />
                  <InfoStat label="冷却至" value={config.outboundCooldownUntil ? formatTime(config.outboundCooldownUntil) : "—"} />
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Capability Surface</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {capabilities.map(item => (
                      <span key={`${def.id}-${item}`} style={subBadgeStyle("#334155", "#eef2ff")}>{item}</span>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>运行态</div>
                  <div style={{ fontSize: 13, lineHeight: 1.8, color: "#475569" }}>{config.detail || "当前还没有更多运行态诊断。"}</div>
                  {config.accountLabel ? <div style={{ fontSize: 12, color: "#334155" }}>账号标签：{config.accountLabel}</div> : null}
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Synced {formatTime(config.lastSyncedAt)} · Checked {formatTime(config.lastCheckedAt)} · Event {formatTime(config.lastEventAt)} · Inbound {formatTime(config.lastInboundAt)} · Outbound OK {formatTime(config.lastOutboundSuccessAt)} · Outbound Fail {formatTime(config.lastOutboundFailureAt)}
                  </div>
                </div>

                {actionFeedback ? (
                  <div style={feedbackStyle}>
                    <strong style={{ fontSize: 12, display: "block", marginBottom: 6 }}>最近动作结果</strong>
                    <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{actionFeedback}</div>
                  </div>
                ) : null}

                {debugHistory.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>Debug History</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {debugHistory.slice().reverse().map((entry) => (
                        <div key={`${def.id}-${entry.at}-${entry.action}`} style={historyRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 12 }}>{entry.action}</strong>
                            <span style={{ fontSize: 11, color: entry.ok ? "#16a34a" : "#dc2626" }}>{entry.status} · {formatTime(entry.at)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>{entry.target ? `${entry.target} · ` : ""}{entry.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {failures.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>Recent Failures</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {failures.map((item) => (
                        <div key={`${def.id}-${item.at}-${item.target}`} style={failureRowStyle}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 12 }}>{item.target}</strong>
                            <span style={{ fontSize: 11, color: "#991b1b" }}>retry {item.retryCount} · {formatTime(item.at)}</span>
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.7, color: "#7f1d1d" }}>{item.message} · {item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isLab ? (
                  <div style={{ display: "grid", gap: 12, padding: 14, borderRadius: 16, background: "rgba(241,245,249,0.75)", border: "1px solid rgba(148,163,184,0.18)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ fontSize: 14 }}>{def.name} Lab</strong>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" style={ghostButtonStyle} onClick={() => void runDebugAction(def.id, "simulate_inbound", { targetId: target || undefined, text: String(drafts[def.id] || "").trim() || "这是一条模拟入站消息，用于联调工作台。" })} disabled={busy[`${def.id}:simulate_inbound`]}>
                          {busy[`${def.id}:simulate_inbound`] ? "注入中..." : "Inject Inbound"}
                        </button>
                        {def.id === "web" || def.id === "qq" ? (
                          <button type="button" style={ghostButtonStyle} onClick={() => void pullReplies(def.id as "web" | "qq")} disabled={busy[`${def.id}:pull`]}>
                            {busy[`${def.id}:pull`] ? "拉取中..." : "Pull Replies"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <textarea
                        value={drafts[def.id] ?? ""}
                        onChange={(event) => setDrafts(current => ({ ...current, [def.id]: event.target.value }))}
                        placeholder={`输入一条 ${def.name} 联调消息`}
                        style={textareaStyle}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" style={darkButtonStyle} onClick={() => void postPlatformInbound(def.id as LabPlatformId)} disabled={busy[`${def.id}:inbound`]}>
                          {busy[`${def.id}:inbound`] ? "发送中..." : "Post Inbound"}
                        </button>
                        <button type="button" style={ghostButtonStyle} onClick={() => setTranscripts(current => ({ ...current, [def.id]: [] }))}>
                          清空记录
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
                      {transcript.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#64748b" }}>这里会显示模拟入站、AI 回流和本地联调错误。</div>
                      ) : (
                        transcript.map(item => (
                          <div
                            key={item.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: item.role === "assistant" ? "rgba(37,99,235,0.08)" : item.role === "inbound" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
                              border: `1px solid ${item.role === "assistant" ? "rgba(37,99,235,0.18)" : item.role === "inbound" ? "rgba(22,163,74,0.18)" : "rgba(220,38,38,0.18)"}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                              <strong style={{ fontSize: 12 }}>{item.role}</strong>
                              <span style={{ fontSize: 11, color: "#64748b" }}>{formatTime(item.at)}</span>
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{item.text}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f7f9fc 0%, #edf2f9 100%)",
  color: "#0f172a",
  padding: "32px 20px 56px",
  fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 24,
  borderRadius: 28,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.2)",
  boxShadow: "0 28px 90px rgba(15, 23, 42, 0.08)",
};

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 20,
  borderRadius: 24,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(148,163,184,0.16)",
};

const feedbackStyle: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(14,165,233,0.08)",
  border: "1px solid rgba(14,165,233,0.16)",
};

const historyRowStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(248,250,252,0.92)",
  border: "1px solid rgba(148,163,184,0.14)",
  display: "grid",
  gap: 4,
};

const failureRowStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(254,242,242,0.9)",
  border: "1px solid rgba(248,113,113,0.18)",
  display: "grid",
  gap: 4,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 88,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.24)",
  padding: "12px 14px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.7,
  resize: "vertical",
};

const darkButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#0f172a",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#fff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

function linkButtonStyle(tone: "dark" | "light") {
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

function subBadgeStyle(color: string, background: string): CSSProperties {
  return {
    borderRadius: 999,
    padding: "4px 10px",
    background,
    color,
    fontSize: 11,
    fontWeight: 700,
  };
}
