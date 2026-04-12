"use client";
import { useState, useEffect } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { PlatformDef } from "@/store/types";
import { derivePlatformProvisionState, getPlatformStatusLabel } from "@/lib/platform-connectors";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { sendWs } from "@/hooks/useWebSocket";

type PlatformDebugAction = "send_test_message";

function deriveTelegramTargetFromInboundKey(inboundMessageKey: string | undefined) {
  const normalized = String(inboundMessageKey || "").trim();
  const match = normalized.match(/^telegram:([^:]+):/i);
  return match?.[1]?.trim() || "";
}

function getPlatformDefaultDebugTarget(def: PlatformDef, config: { fields: Record<string, string>; lastInboundMessageKey?: string; lastInboundTarget?: string; lastDebugTarget?: string }) {
  const inboundDebugTarget =
    String(config.lastInboundTarget || "").trim()
    || (def.id === "telegram" ? deriveTelegramTargetFromInboundKey(config.lastInboundMessageKey) : "");

  let configuredDefaultTarget = "";
  if (def.id === "telegram") configuredDefaultTarget = (config.fields.defaultChatId ?? "").trim();
  if (def.id === "feishu" || def.id === "wechat_official" || def.id === "qq") configuredDefaultTarget = (config.fields.defaultOpenId ?? "").trim();
  if (def.id === "dingtalk") configuredDefaultTarget = (config.fields.defaultWebhookUrl ?? "").trim() || (config.fields.defaultOpenConversationId ?? "").trim();
  if (def.id === "web") configuredDefaultTarget = (config.fields.defaultVisitorId ?? "").trim();

  const persistedDebugTarget = String(config.lastDebugTarget || "").trim();
  const preferredTarget =
    def.id === "telegram" || def.id === "dingtalk" || def.id === "wechat_official" || def.id === "qq"
      ? (inboundDebugTarget || configuredDefaultTarget || persistedDebugTarget)
      : (configuredDefaultTarget || inboundDebugTarget || persistedDebugTarget);

  return {
    inboundDebugTarget,
    configuredDefaultTarget,
    persistedDebugTarget,
    preferredTarget,
  };
}

export function PlatformSettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        为每个平台单独配置接入凭证。启用后智能体可通过该平台接收指令并回复结果。
      </div>
      {PLATFORM_DEFINITIONS.map(def => (
        <PlatformCard key={def.id} def={def} />
      ))}
    </div>
  );
}

function PlatformCard({ def }: { def: PlatformDef }) {
  const { platformConfigs, updatePlatformConfig, updatePlatformField, reconcilePlatformConfig } = useStore();
  const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" };
  const {
    inboundDebugTarget,
    configuredDefaultTarget: defaultDebugTarget,
    persistedDebugTarget,
    preferredTarget: preferredDebugTarget,
  } = getPlatformDefaultDebugTarget(def, config);
  const canApplyInboundTelegramTarget =
    def.id === "telegram"
    && Boolean(inboundDebugTarget)
    && inboundDebugTarget !== defaultDebugTarget;
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debugBusyAction, setDebugBusyAction] = useState<PlatformDebugAction | null>(null);
  const [debugFeedback, setDebugFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // 展开状态跟随 enabled
  useEffect(() => {
    if (config.enabled) setExpanded(true);
  }, [config.enabled]);

  const allRequiredFilled = def.fields
    .filter(f => f.required)
    .every(f => (config.fields[f.key] ?? "").trim().length > 0);

  function toggle() {
    const next = !config.enabled;
    updatePlatformConfig(def.id, {
      enabled: next,
      status: next ? "syncing" : "idle",
      errorMsg: undefined,
      detail: next ? "正在同步连接器配置。" : undefined,
      lastSyncedAt: Date.now(),
    });
    setExpanded(next);
    if (!next) {
      sendWs({ type: "platform_sync", platformId: def.id, enabled: false, fields: {} });
      void syncRuntimeSettings();
      return;
    }
    reconcilePlatformConfig(def.id);
    void syncRuntimeSettings();
  }

  async function handleSave() {
    if (!allRequiredFilled) return;
    setSaving(true);
    const nextState = derivePlatformProvisionState(def, { ...config, enabled: true });
    updatePlatformConfig(def.id, {
      status: "syncing",
      errorMsg: undefined,
      detail: nextState.detail,
      healthScore: nextState.healthScore,
      lastSyncedAt: Date.now(),
    });
    // 发送到服务端
    sendWs({
      type: "platform_sync",
      platformId: def.id,
      enabled: true,
      fields: config.fields,
    });
    reconcilePlatformConfig(def.id);
    await syncRuntimeSettings();
    setSaving(false);
  }

  async function handleDebugAction(action: PlatformDebugAction) {
    setDebugBusyAction(action);
    setDebugFeedback(null);
    try {
      const targetId = preferredDebugTarget || undefined;
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          platformId: def.id,
          targetId,
        }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.message || "测试通信失败");
      }
      setDebugFeedback({ ok: true, text: result.message || "测试通信已发送" });
    } catch (error) {
      setDebugFeedback({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setDebugBusyAction(null);
    }
  }

  function handleDisconnect() {
    updatePlatformConfig(def.id, { enabled: false, status: "idle", errorMsg: undefined, detail: undefined, healthScore: 0 });
    setExpanded(false);
    sendWs({ type: "platform_sync", platformId: def.id, enabled: false, fields: {} });
    void syncRuntimeSettings();
  }

  const statusColor =
    config.status === "connected" ? "var(--success)" :
    config.status === "configured" || config.status === "syncing" || config.status === "degraded"
      ? "var(--warning)"
      : config.status === "idle"
        ? "var(--text-muted)"
        : "var(--danger)";

  const statusDot =
    config.status === "connected" ? "#22c55e" :
    config.status === "configured" || config.status === "syncing" || config.status === "degraded"
      ? "#f59e0b"
      : config.status === "idle"
        ? "#888"
        : "#ef4444";
  const diagnosis = getPlatformDiagnosis(def, config.status, allRequiredFilled);
  const communicationTarget = preferredDebugTarget;
  const headerClassName = [
    "platform-settings__card-header",
    config.enabled ? "platform-settings__card-header--enabled" : "",
    expanded ? "platform-settings__card-header--expanded" : "",
  ].filter(Boolean).join(" ");
  const toggleClassName = [
    "platform-settings__toggle",
    config.enabled ? "platform-settings__toggle--checked" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="card platform-settings__card">
      {/* 卡片头部 */}
      <div className={headerClassName} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 20 }}>{def.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{def.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{def.description}</div>
        </div>

        {/* 连接状态 */}
        {config.enabled && (
          <div className="platform-settings__card-meta">
            <span className="platform-settings__status-dot" style={{ background: statusDot }} />
            <span style={{ fontSize: 11, color: statusColor }}>
              {getPlatformStatusLabel(config.status)}
            </span>
          </div>
        )}

        {/* 开关 */}
        <div className={toggleClassName} onClick={e => { e.stopPropagation(); toggle(); }}>
          <div className="platform-settings__toggle-thumb" />
        </div>

        <span className="platform-settings__expand-indicator">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* 展开的配置区域 */}
      {expanded && (
        <div className="platform-settings__body">
          {/* Webhook 提示 */}
          {def.webhookBased && (
            <div className="platform-settings__notice platform-settings__notice--webhook">
              ⚠️ 此平台需要公网 Webhook 回调地址。开发阶段可用{" "}
              <code className="platform-settings__notice-code">
                ngrok http 3001
              </code>{" "}
              获取临时地址。
            </div>
          )}

          {["web", "dingtalk", "wechat_official", "qq"].includes(def.id) ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <a
                  href="/channel-debug"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: "4px 10px", textDecoration: "none" }}
                >
                  打开统一联调页
                </a>
                <a
                  href="/channel-integration-guide"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: "4px 10px", textDecoration: "none" }}
                >
                  打开运行指南
                </a>
                {def.id === "qq" ? (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    本地示例脚本：<code className="platform-settings__notice-code">node scripts/qq-bridge-example.mjs http://localhost:3001 &lt;bridgeSecret&gt; &lt;qqUserId&gt;</code>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {def.id === "web" ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              <div style={{ display: "grid", gap: 6 }}>
                <div>网页会话入站：<code className="platform-settings__notice-code">POST /webhook/web</code></div>
                <div>网页会话拉取回复：<code className="platform-settings__notice-code">POST /api/web-channel/pull</code></div>
                <div>轻量挂件脚本：<code className="platform-settings__notice-code">GET /starcraw-web-widget.js</code></div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  生产环境建议给挂件配置 <code className="platform-settings__notice-code">publicWidgetToken</code> + <code className="platform-settings__notice-code">allowedOrigins</code>，
                  不要把 <code className="platform-settings__notice-code">signingSecret</code> 直接暴露在站点前端。
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <a
                    href="/web-channel-demo"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost"
                    style={{ fontSize: 11, padding: "4px 10px", textDecoration: "none" }}
                  >
                    打开网页会话测试页
                  </a>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    测试页里已经带了可复制的挂件嵌入片段，适合先联通前后端闭环，再挂到官网/H5。
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {def.id === "dingtalk" ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              <div style={{ display: "grid", gap: 6 }}>
                <div>Webhook 入站：<code className="platform-settings__notice-code">POST /webhook/dingtalk</code></div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  当前这版钉钉连接器优先走应用机器人会话中的 <code className="platform-settings__notice-code">sessionWebhook</code> 回消息。
                  现在也支持 <code className="platform-settings__notice-code">openConversationId + robotCode</code> 的主动群发文本。
                  如果要做主动联调，建议至少配置 <code className="platform-settings__notice-code">defaultWebhookUrl</code> 或 <code className="platform-settings__notice-code">defaultRobotCode</code>。
                </div>
              </div>
            </div>
          ) : null}

          {def.id === "wechat_official" ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              <div style={{ display: "grid", gap: 6 }}>
                <div>Webhook 入站：<code className="platform-settings__notice-code">GET/POST /webhook/wechat-official</code></div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  当前已支持明文模式与安全模式的签名校验、加密消息解密、文本/事件接入和客服文本外发。
                  如果你启用了安全模式，请确保 <code className="platform-settings__notice-code">encodingAESKey</code> 填写正确。
                </div>
              </div>
            </div>
          ) : null}

          {def.id === "qq" ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              <div style={{ display: "grid", gap: 6 }}>
                <div>QQ Bridge 入站：<code className="platform-settings__notice-code">POST /webhook/qq</code></div>
                <div>QQ Bridge 拉取回复：<code className="platform-settings__notice-code">POST /api/qq-bridge/pull</code></div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  这条渠道当前走本地桥接模式。外部 QQ 监听程序把真实消息推送进来，再从拉取接口取走 AI 回复并代发到 QQ。
                </div>
              </div>
            </div>
          ) : null}

          {/* 字段输入 */}
          {def.fields.map(field => {
            if (field.toggleable) {
              return (
                <ToggleableField
                  key={field.key}
                  field={field}
                  value={config.fields[field.key] ?? ""}
                  onChange={v => updatePlatformField(def.id, field.key, v)}
                />
              );
            }

            const isTelegramChatIdField = def.id === "telegram" && field.key === "defaultChatId";

            return (
              <div key={field.key}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  {field.label}
                  {field.required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
                  {field.hint && (
                    <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 400 }}>
                      — {field.hint}
                    </span>
                  )}
                </label>
                <input
                  className="input"
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={config.fields[field.key] ?? ""}
                  onChange={e => updatePlatformField(def.id, field.key, e.target.value)}
                  style={{ fontSize: 12, width: "100%" }}
                />
                {isTelegramChatIdField ? (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      {inboundDebugTarget
                        ? `最近一次真实会话 Chat ID：${inboundDebugTarget}`
                        : "先在 Telegram 里给机器人发一条消息，程序就会自动记录真实 Chat ID。"}
                    </span>
                    {canApplyInboundTelegramTarget ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => updatePlatformField(def.id, field.key, inboundDebugTarget)}
                        style={{ fontSize: 11, padding: "4px 10px", minWidth: 112 }}
                      >
                        使用最近会话 ID
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          <label className="platform-settings__approval-panel">
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>自动外发需审批</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                开启后，自动回复和自动推送不会直接发出，必须先人工接管或明确批准。
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(config.requireOutboundApproval)}
              onChange={event => {
                updatePlatformConfig(def.id, { requireOutboundApproval: event.target.checked });
                void syncRuntimeSettings();
              }}
            />
          </label>

          {/* 错误信息 */}
          {config.errorMsg && (
            <div className="platform-settings__notice platform-settings__notice--error">
              ✗ {config.errorMsg}
            </div>
          )}

          {!config.errorMsg && config.detail ? (
            <div className="platform-settings__notice platform-settings__notice--neutral">
              {config.detail}
            </div>
          ) : null}

          <div className="platform-settings__meta">
            <span>诊断 {diagnosis}</span>
            <span>健康度 {config.healthScore ?? 0}%</span>
            {config.lastSyncedAt ? (
              <span>
                最近同步 {new Intl.DateTimeFormat("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(config.lastSyncedAt)}
              </span>
            ) : null}
            {config.lastCheckedAt ? (
              <span>
                最近检查 {formatPlatformTime(config.lastCheckedAt)}
              </span>
            ) : null}
            {config.lastEventAt ? (
              <span>
                最近事件 {formatPlatformTime(config.lastEventAt)}
              </span>
            ) : null}
            {config.lastInboundAt ? (
              <span>
                最近入站 {formatPlatformTime(config.lastInboundAt)}
              </span>
            ) : null}
            {config.lastOutboundSuccessAt ? (
              <span>
                最近外发成功 {formatPlatformTime(config.lastOutboundSuccessAt)}
              </span>
            ) : null}
            {config.lastOutboundFailureAt ? (
              <span>
                最近外发失败 {formatPlatformTime(config.lastOutboundFailureAt)}
              </span>
            ) : null}
            {typeof config.outboundRetryCount === "number" ? <span>最近重试 {config.outboundRetryCount}</span> : null}
            {config.outboundCooldownUntil ? (
              <span>
                冷却到 {formatPlatformTime(config.outboundCooldownUntil)}
              </span>
            ) : null}
            {config.pendingEvents ? <span>待处理事件 {config.pendingEvents}</span> : null}
            {config.requireOutboundApproval ? <span>自动外发需审批</span> : null}
          </div>

          {config.webhookUrl ? (
            <div className="platform-settings__webhook-row">
              Webhook: {config.webhookUrl}
            </div>
          ) : null}

          <div className="platform-settings__debug-panel">
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>测试通信</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              向当前平台发送一条测试消息，用于确认账号、凭证和默认目标是否连通。
              {communicationTarget
                ? ` 当前目标 ${communicationTarget}${
                    def.id === "telegram" && inboundDebugTarget
                      ? "（已优先使用最近一次真实会话）"
                      : defaultDebugTarget && persistedDebugTarget && defaultDebugTarget !== persistedDebugTarget
                        ? "（已优先使用当前配置）"
                        : ""
                  }。`
                : " 未设置默认目标时会尝试使用平台内置默认收件方。"}
            </div>

            {def.id === "telegram" ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Telegram 私聊外发需要真实数字 Chat ID；`@username` 或机器人用户名不能直接作为私聊目标。
              </div>
            ) : null}

            {debugFeedback ? (
              <div
                className={
                  debugFeedback.ok
                    ? "platform-settings__notice platform-settings__debug-feedback--success"
                    : "platform-settings__notice platform-settings__debug-feedback--error"
                }
              >
                {debugFeedback.ok ? "✓" : "✗"} {debugFeedback.text}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => void handleDebugAction("send_test_message")}
                className="btn-ghost"
                disabled={!config.enabled || debugBusyAction !== null}
                style={{ fontSize: 11, padding: "4px 12px", minWidth: 92 }}
              >
                {debugBusyAction === "send_test_message" ? "发送中..." : "测试通信"}
              </button>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="platform-settings__actions">
            {config.status === "connected" && (
              <button
                onClick={handleDisconnect}
                className="btn-ghost"
                style={{ fontSize: 11, padding: "4px 12px", color: "var(--danger)", borderColor: "var(--danger)" }}
              >
                断开连接
              </button>
            )}
            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={!allRequiredFilled || saving}
              style={{ fontSize: 11, padding: "4px 14px", minWidth: 80 }}
            >
              {saving ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="spinner" style={{ width: 10, height: 10 }} />
                  连接中...
                </span>
              ) : config.status === "connected" ? "重新连接" : "保存并连接"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPlatformTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function getPlatformDiagnosis(def: PlatformDef, status: string, allRequiredFilled: boolean) {
  if (!allRequiredFilled) return "先补齐必填字段";
  if (status === "idle") return "当前未启用";
  if (status === "syncing") return "等待服务端确认";
  if (status === "webhook_missing") return def.webhookBased ? "优先检查公网回调" : "等待首条消息回执";
  if (status === "webhook_unreachable") return "回调链路异常";
  if (status === "auth_failed") return "鉴权失败，优先核对 token/secret";
  if (status === "rate_limited") return "平台限流，降低频率后重试";
  if (status === "degraded") return "部分可用，优先检查最近失败事件";
  if (status === "connected") return "可以进入真实消息联调";
  if (status === "configured") return "等待握手或首条回执";
  if (status === "error") return "服务端或适配器异常";
  return "检查最近状态回写";
}

// ── 带开关的字段（如代理） ──
function ToggleableField({ field, value, onChange }: {
  field: import("@/store/types").PlatformFieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(() => value.trim().length > 0);

  function toggle() {
    if (open) {
      setOpen(false);
      onChange(""); // 关闭时清空
    } else {
      setOpen(true);
    }
  }

  return (
    <div>
      <div className={open ? "platform-settings__toggle-row platform-settings__toggle-row--open" : "platform-settings__toggle-row"}>
        <div
          className={open ? "platform-settings__field-toggle platform-settings__field-toggle--checked" : "platform-settings__field-toggle"}
          onClick={toggle}
        >
          <div className="platform-settings__field-toggle-thumb" />
        </div>
        <span className={open ? "platform-settings__field-toggle-label platform-settings__field-toggle-label--open" : "platform-settings__field-toggle-label"}>
          {field.label}
          {field.hint && !open && (
            <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 400 }}>
              — {field.hint}
            </span>
          )}
        </span>
      </div>

      {open && (
        <input
          className="input"
          type="text"
          placeholder={field.placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ fontSize: 12, width: "100%" }}
          autoFocus
        />
      )}
    </div>
  );
}
