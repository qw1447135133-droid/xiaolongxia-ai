"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";

type DemoTranscriptItem = {
  id: string;
  role: "visitor" | "assistant" | "system";
  text: string;
  at: number;
};

type PulledMessage = {
  id: string;
  text: string;
  createdAt: number;
  source?: string;
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function buildSignature(secret: string, timestamp: string, body: string) {
  return crypto.subtle
    .importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)))
    .then((buffer) => Array.from(new Uint8Array(buffer)).map(item => item.toString(16).padStart(2, "0")).join(""));
}

export default function WebChannelDemoPage() {
  const webConfig = useStore(s => s.platformConfigs.web);
  const [visitorId, setVisitorId] = useState(() => webConfig?.fields?.defaultVisitorId?.trim() || "visitor_demo_001");
  const [conversationRef, setConversationRef] = useState(() => {
    const configuredVisitor = webConfig?.fields?.defaultVisitorId?.trim() || "visitor_demo_001";
    return `visitor:${configuredVisitor}`;
  });
  const [secret, setSecret] = useState(() => webConfig?.fields?.signingSecret?.trim() || "");
  const [widgetToken, setWidgetToken] = useState(() => webConfig?.fields?.publicWidgetToken?.trim() || "");
  const [participantLabel, setParticipantLabel] = useState("官网访客");
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<DemoTranscriptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("请先确认 Web 渠道已启用并保存，再从这里发送访客消息。");
  const ackIdsRef = useRef<string[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!webConfig) return;
    if (!secret && webConfig.fields.signingSecret?.trim()) {
      setSecret(webConfig.fields.signingSecret.trim());
    }
    if (!widgetToken && webConfig.fields.publicWidgetToken?.trim()) {
      setWidgetToken(webConfig.fields.publicWidgetToken.trim());
    }
    if ((!visitorId || visitorId === "visitor_demo_001") && webConfig.fields.defaultVisitorId?.trim()) {
      const nextVisitorId = webConfig.fields.defaultVisitorId.trim();
      setVisitorId(nextVisitorId);
      setConversationRef(`visitor:${nextVisitorId}`);
    }
  }, [secret, visitorId, webConfig, widgetToken]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [transcript]);

  const embedSnippet = useMemo(() => {
    const normalizedConversationRef = conversationRef.trim() || `visitor:${visitorId.trim() || "visitor_demo_001"}`;
    return [
      '<script src="https://your-domain.com/starcraw-web-widget.js"></script>',
      "<script>",
      "  window.StarcrawWebChannel.init({",
      '    baseUrl: "https://your-domain.com",',
      `    widgetToken: "${widgetToken.trim() || "<your-widget-token>"}",`,
      `    visitorId: "${visitorId.trim() || "visitor_demo_001"}",`,
      `    conversationRef: "${normalizedConversationRef}",`,
      `    participantLabel: "${participantLabel.trim() || "官网访客"}",`,
      '    title: "STARCRAW 在线咨询",',
      '    subtitle: "消息会进入统一渠道中枢",',
      '    buttonLabel: "联系 STARCRAW",',
      "  });",
      "</script>",
    ].join("\n");
  }, [conversationRef, participantLabel, visitorId, widgetToken]);

  async function buildAuthHeaders(body: string): Promise<Record<string, string>> {
    const normalizedWidgetToken = widgetToken.trim();
    if (normalizedWidgetToken) {
      return {
        "Content-Type": "application/json",
        "x-starcraw-widget-token": normalizedWidgetToken,
      };
    }

    const normalizedSecret = secret.trim();
    if (!normalizedSecret) {
      throw new Error("请先填写 publicWidgetToken，或回退填写 signingSecret 进行联调。");
    }

    const timestamp = String(Date.now());
    const signature = await buildSignature(normalizedSecret, timestamp, body);
    return {
      "Content-Type": "application/json",
      "x-starcraw-secret": normalizedSecret,
      "x-starcraw-timestamp": timestamp,
      "x-starcraw-signature": `sha256=${signature}`,
    };
  }

  async function sendVisitorMessage() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const body = JSON.stringify({
        visitorId: visitorId.trim(),
        conversationRef: conversationRef.trim() || `visitor:${visitorId.trim()}`,
        participantLabel: participantLabel.trim() || visitorId.trim(),
        text,
      });
      const url = await resolveBackendUrl("/webhook/web");
      const response = await fetch(url, {
        method: "POST",
        headers: await buildAuthHeaders(body),
        body,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "网页会话消息发送失败。");
      }

      setTranscript(current => [
        ...current,
        {
          id: `visitor-${Date.now()}`,
          role: "visitor",
          text,
          at: Date.now(),
        },
      ]);
      setDraft("");
      setStatus("访客消息已送达服务端，AI 回复会在下方自动拉取。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setTranscript(current => [
        ...current,
        {
          id: `sys-${Date.now()}`,
          role: "system",
          text: error instanceof Error ? error.message : String(error),
          at: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (!webConfig?.enabled || !secret.trim() || !visitorId.trim()) return;
      try {
        const body = JSON.stringify({
          visitorId: visitorId.trim(),
          conversationRef: conversationRef.trim() || `visitor:${visitorId.trim()}`,
          ackIds: ackIdsRef.current,
          limit: 20,
        });
        const url = await resolveBackendUrl("/api/web-channel/pull");
        const response = await fetch(url, {
          method: "POST",
          headers: await buildAuthHeaders(body),
          body,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) return;
        if (cancelled) return;

        const messages = Array.isArray(result.messages) ? result.messages as PulledMessage[] : [];
        if (messages.length > 0) {
          ackIdsRef.current = messages.map(item => item.id);
          setTranscript(current => {
            const seenIds = new Set(current.map(item => item.id));
            const nextItems = messages
              .filter(item => !seenIds.has(item.id))
              .map(item => ({
                id: item.id,
                role: "assistant" as const,
                text: item.text,
                at: item.createdAt || Date.now(),
              }));
            return nextItems.length > 0 ? [...current, ...nextItems] : current;
          });
          setStatus(`已拉取 ${messages.length} 条 AI 回复。`);
        } else {
          ackIdsRef.current = [];
        }
      } catch {
        // 静默轮询失败，避免测试页抖动
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [conversationRef, secret, visitorId, webConfig?.enabled]);

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f6f8fb 0%, #eef3f8 100%)",
      color: "#0f172a",
      padding: "32px 20px 48px",
      fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 18 }}>
        <section style={{
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: 24,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.08)",
          padding: 24,
          display: "grid",
          gap: 10,
        }}>
          <div style={{ fontSize: 12, letterSpacing: "0.14em", color: "#64748b", textTransform: "uppercase" }}>Web Channel Demo</div>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1 }}>网页会话联调页</h1>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569", maxWidth: 860 }}>
            这个页面直接调用当前服务端的 <code>/webhook/web</code> 与 <code>/api/web-channel/pull</code>。
            你可以把它当成最小可用的官网聊天挂件联调台，先验证访客消息进入渠道会话、再验证 AI 回复被网页端拉回。
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: webConfig?.enabled ? "rgba(16, 185, 129, 0.12)" : "rgba(248, 113, 113, 0.12)", color: webConfig?.enabled ? "#047857" : "#b91c1c", fontSize: 12, fontWeight: 700 }}>
              {webConfig?.enabled ? "Web 渠道已启用" : "Web 渠道未启用"}
            </span>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(59, 130, 246, 0.10)", color: "#1d4ed8", fontSize: 12, fontWeight: 700 }}>
              默认访客 {webConfig?.fields?.defaultVisitorId?.trim() || "未配置"}
            </span>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(15, 23, 42, 0.06)", color: "#334155", fontSize: 12, fontWeight: 700 }}>
              会话 {conversationRef.trim() || `visitor:${visitorId.trim() || "visitor_demo_001"}`}
            </span>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(360px, 420px) 1fr", gap: 18, alignItems: "start" }}>
          <div style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: 22,
            padding: 20,
            display: "grid",
            gap: 14,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>联调参数</div>
            <Field label="访客 ID" value={visitorId} onChange={setVisitorId} placeholder="visitor_demo_001" />
            <Field label="会话 Ref" value={conversationRef} onChange={setConversationRef} placeholder="visitor:visitor_demo_001" />
            <Field label="访客展示名" value={participantLabel} onChange={setParticipantLabel} placeholder="官网访客" />
            <Field label="挂件令牌" value={widgetToken} onChange={setWidgetToken} placeholder="publicWidgetToken（推荐）" secret />
            <Field label="签名密钥" value={secret} onChange={setSecret} placeholder="来自 Web 渠道配置的 signingSecret" secret />
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>访客消息</span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="你好，我想了解五一活动和客户画像推送方案。"
                style={{
                  minHeight: 120,
                  borderRadius: 16,
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  padding: 14,
                  fontSize: 14,
                  lineHeight: 1.7,
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void sendVisitorMessage()}
                disabled={busy || !draft.trim()}
                style={{
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 18px",
                  background: busy ? "#94a3b8" : "#0f172a",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "发送中..." : "发送访客消息"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTranscript([]);
                  ackIdsRef.current = [];
                  setStatus("已清空当前测试转录。");
                }}
                style={{
                  borderRadius: 14,
                  padding: "12px 18px",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  background: "#fff",
                  color: "#334155",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                清空转录
              </button>
            </div>
            <div style={{
              fontSize: 12,
              lineHeight: 1.7,
              color: "#475569",
              background: "rgba(59, 130, 246, 0.07)",
              borderRadius: 16,
              padding: "12px 14px",
            }}>
              {status}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
              推荐优先测试 <code>publicWidgetToken</code>，只有在纯本地联调或后台代理时再使用 <code>signingSecret</code>。
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <section style={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: 22,
              padding: 20,
              display: "grid",
              gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>实时转录</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>每 2.5 秒自动拉取回复</div>
              </div>
              <div
                ref={transcriptRef}
                style={{
                  minHeight: 340,
                  maxHeight: 520,
                  overflowY: "auto",
                  display: "grid",
                  gap: 12,
                  paddingRight: 6,
                }}
              >
                {transcript.length === 0 ? (
                  <div style={{
                    borderRadius: 18,
                    border: "1px dashed rgba(148, 163, 184, 0.4)",
                    padding: 18,
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "#64748b",
                    background: "rgba(248, 250, 252, 0.8)",
                  }}>
                    还没有消息。发送一条访客消息后，这里会先出现访客发言，再自动拉到 AI 从 `web` 渠道吐回来的回复。
                  </div>
                ) : transcript.map(item => (
                  <article
                    key={item.id}
                    style={{
                      justifySelf: item.role === "assistant" ? "end" : "start",
                      maxWidth: "78%",
                      borderRadius: 18,
                      padding: "12px 14px",
                      background:
                        item.role === "assistant"
                          ? "linear-gradient(135deg, #0f172a, #1e293b)"
                          : item.role === "visitor"
                            ? "rgba(59, 130, 246, 0.10)"
                            : "rgba(248, 113, 113, 0.12)",
                      color: item.role === "assistant" ? "#f8fafc" : "#0f172a",
                      border: item.role === "assistant" ? "none" : "1px solid rgba(148, 163, 184, 0.22)",
                      boxShadow: item.role === "assistant" ? "0 14px 32px rgba(15, 23, 42, 0.18)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 11, opacity: 0.78, marginBottom: 6 }}>
                      <span>{item.role === "assistant" ? "AI 回复" : item.role === "visitor" ? "访客消息" : "系统提示"}</span>
                      <span>{formatTime(item.at)}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{item.text}</div>
                  </article>
                ))}
              </div>
            </section>

            <section style={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: 22,
              padding: 20,
              display: "grid",
              gap: 10,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>嵌入调用示例</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#475569" }}>
                现在除了低层接口，项目里已经带了一个可直接挂站点的轻量脚本 <code>/starcraw-web-widget.js</code>。
                下面这段就是最小嵌入方式，适合先把官网聊天入口挂起来再做视觉定制。
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
                {embedSnippet}
              </pre>
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "#64748b" }}>
                如果你想自己做前端外观，也可以继续直接调用 <code>/webhook/web</code> 与 <code>/api/web-channel/pull</code>。
                当前这版挂件更偏向快速联调和私域站点接入。
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  secret?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{label}</span>
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          borderRadius: 14,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          padding: "12px 14px",
          fontSize: 13,
          outline: "none",
          background: "#fff",
        }}
      />
    </label>
  );
}
