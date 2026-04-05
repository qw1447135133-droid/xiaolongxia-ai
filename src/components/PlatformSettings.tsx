"use client";
import { useState, useEffect } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { PlatformDef } from "@/store/types";
import { derivePlatformProvisionState, getPlatformStatusLabel } from "@/lib/platform-connectors";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { sendWs } from "@/hooks/useWebSocket";

type PlatformDebugAction = "send_test_message" | "simulate_inbound" | "probe_webhook" | "replay_last_debug";
type PlatformDiagnosisCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "neutral";
  detail: string;
};
type PlatformDiagnosisReport = {
  platformId: string;
  summary: string;
  score: number;
  checks: PlatformDiagnosisCheck[];
  suggestedActions: string[];
  checkedAt: number;
};

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
  const defaultDebugTarget =
    def.id === "telegram"
      ? (config.fields.defaultChatId ?? "").trim()
      : def.id === "feishu"
        ? (config.fields.defaultOpenId ?? "").trim()
        : "";
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debugTarget, setDebugTarget] = useState("");
  const [debugText, setDebugText] = useState("");
  const [debugBusyAction, setDebugBusyAction] = useState<PlatformDebugAction | null>(null);
  const [debugFeedback, setDebugFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [diagnosisReport, setDiagnosisReport] = useState<PlatformDiagnosisReport | null>(null);

  // 展开状态跟随 enabled
  useEffect(() => {
    if (config.enabled) setExpanded(true);
  }, [config.enabled]);

  useEffect(() => {
    if (debugTarget.trim()) return;
    const preferredTarget = String(config.lastDebugTarget || defaultDebugTarget || "").trim();
    if (preferredTarget) {
      setDebugTarget(preferredTarget);
    }
  }, [config.lastDebugTarget, debugTarget, defaultDebugTarget]);

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
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          platformId: def.id,
          targetId: debugTarget.trim() || undefined,
          text: debugText.trim() || undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.message || "平台联调请求失败");
      }
      setDebugFeedback({ ok: true, text: result.message || "联调动作已执行" });
    } catch (error) {
      setDebugFeedback({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setDebugBusyAction(null);
    }
  }

  async function handleDiagnose() {
    setDiagnosisBusy(true);
    setDebugFeedback(null);
    try {
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "diagnose",
          platformId: def.id,
        }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string; report?: PlatformDiagnosisReport };
      if (!response.ok || !result.ok || !result.report) {
        throw new Error(result.error || result.message || "平台诊断失败");
      }
      setDiagnosisReport(result.report);
      setDebugFeedback({ ok: true, text: result.message || "诊断完成" });
    } catch (error) {
      setDiagnosisReport(null);
      setDebugFeedback({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setDiagnosisBusy(false);
    }
  }

  async function handleReplayLastDebug() {
    if (!config.lastDebugAction) return;
    setDebugBusyAction("replay_last_debug");
    setDebugFeedback(null);
    try {
      const url = await resolveBackendUrl("/api/platform-debug");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replay_last_debug",
          platformId: def.id,
          targetId: debugTarget.trim() || undefined,
          text: debugText.trim() || undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.message || "重放最近联调失败");
      }
      setDebugFeedback({ ok: true, text: result.message || "已重试最近联调动作" });
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

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* 卡片头部 */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          background: config.enabled ? "var(--accent-dim)" : "var(--bg-card)",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 20 }}>{def.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{def.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{def.description}</div>
        </div>

        {/* 连接状态 */}
        {config.enabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginRight: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusDot, display: "inline-block" }} />
            <span style={{ fontSize: 11, color: statusColor }}>
              {getPlatformStatusLabel(config.status)}
            </span>
          </div>
        )}

        {/* 开关 */}
        <div
          onClick={e => { e.stopPropagation(); toggle(); }}
          style={{
            width: 36, height: 20, borderRadius: 10, position: "relative", cursor: "pointer",
            background: config.enabled ? "var(--accent)" : "var(--border)",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <div style={{
            position: "absolute", top: 2,
            left: config.enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </div>

        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 2 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* 展开的配置区域 */}
      {expanded && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Webhook 提示 */}
          {def.webhookBased && (
            <div style={{
              fontSize: 11, padding: "6px 10px", borderRadius: "var(--radius-sm)",
              background: "rgba(var(--accent-rgb),0.08)",
              border: "1px solid rgba(var(--accent-rgb),0.2)",
              color: "var(--accent)",
            }}>
              ⚠️ 此平台需要公网 Webhook 回调地址。开发阶段可用{" "}
              <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.15)", padding: "1px 4px", borderRadius: 3 }}>
                ngrok http 3001
              </code>{" "}
              获取临时地址。
            </div>
          )}

          {/* 字段输入 */}
          {def.fields.map(field => (
            field.toggleable
              ? <ToggleableField key={field.key} field={field} value={config.fields[field.key] ?? ""} onChange={v => updatePlatformField(def.id, field.key, v)} />
              : <div key={field.key}>
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
                </div>
          ))}

          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
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
            <div style={{
              fontSize: 11, padding: "5px 8px", borderRadius: "var(--radius-sm)",
              background: "rgba(var(--danger-rgb),0.08)",
              border: "1px solid rgba(var(--danger-rgb),0.2)",
              color: "var(--danger)",
            }}>
              ✗ {config.errorMsg}
            </div>
          )}

          {!config.errorMsg && config.detail ? (
            <div style={{
              fontSize: 11, padding: "5px 8px", borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-muted)",
            }}>
              {config.detail}
            </div>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
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
            <div style={{
              fontSize: 11,
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-muted)",
              lineHeight: 1.7,
              wordBreak: "break-all",
            }}>
              Webhook: {config.webhookUrl}
            </div>
          ) : null}

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>联调工具</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              发送真实测试消息，或仅在工作台内模拟一条入站消息。
              {defaultDebugTarget ? ` 留空目标 ID 时默认使用 ${defaultDebugTarget}。` : ""}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => void handleDiagnose()}
                className="btn-ghost"
                disabled={diagnosisBusy}
                style={{ fontSize: 11, padding: "4px 12px" }}
              >
                {diagnosisBusy ? "诊断中..." : "一键诊断"}
              </button>
              {diagnosisReport ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                  诊断分 {diagnosisReport.score} · {formatPlatformTime(diagnosisReport.checkedAt)}
                </div>
              ) : null}
            </div>

            {diagnosisReport ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.6 }}>
                  {diagnosisReport.summary}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {diagnosisReport.checks.map(check => (
                    <div
                      key={check.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        fontSize: 11,
                        color: check.status === "fail"
                          ? "var(--danger)"
                          : check.status === "warn"
                            ? "var(--warning)"
                            : check.status === "pass"
                              ? "var(--success)"
                              : "var(--text-muted)",
                      }}
                    >
                      <span style={{ minWidth: 48, fontWeight: 600 }}>
                        {renderDiagnosisBadge(check.status)} {check.label}
                      </span>
                      <span style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{check.detail}</span>
                    </div>
                  ))}
                </div>
                {diagnosisReport.suggestedActions.length > 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    建议：{diagnosisReport.suggestedActions.join("；")}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
              <input
                className="input"
                type="text"
                placeholder={
                  config.lastDebugTarget
                    ? `目标 ID（最近 ${config.lastDebugTarget}${defaultDebugTarget && defaultDebugTarget !== config.lastDebugTarget ? `，默认 ${defaultDebugTarget}` : ""}）`
                    : defaultDebugTarget
                      ? `目标 ID（默认 ${defaultDebugTarget}）`
                      : "目标 ID / 用户 ID"
                }
                value={debugTarget}
                onChange={e => setDebugTarget(e.target.value)}
                style={{ fontSize: 12, width: "100%" }}
              />
              <textarea
                className="input"
                placeholder="测试文案，留空则使用默认测试内容"
                value={debugText}
                onChange={e => setDebugText(e.target.value)}
                rows={3}
                style={{ fontSize: 12, width: "100%", resize: "vertical", minHeight: 72 }}
              />
            </div>

            {debugFeedback ? (
              <div style={{
                fontSize: 11,
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                background: debugFeedback.ok ? "rgba(var(--success-rgb),0.08)" : "rgba(var(--danger-rgb),0.08)",
                border: debugFeedback.ok ? "1px solid rgba(var(--success-rgb),0.2)" : "1px solid rgba(var(--danger-rgb),0.2)",
                color: debugFeedback.ok ? "var(--success)" : "var(--danger)",
              }}>
                {debugFeedback.ok ? "✓" : "✗"} {debugFeedback.text}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {config.lastDebugAction ? (
                <button
                  onClick={() => void handleReplayLastDebug()}
                  className="btn-ghost"
                  disabled={debugBusyAction !== null || diagnosisBusy || (!config.enabled && config.lastDebugAction !== "diagnose")}
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  {debugBusyAction === "replay_last_debug" ? "重试中..." : "重试上次联调"}
                </button>
              ) : null}
              {def.webhookBased ? (
                <button
                  onClick={() => void handleDebugAction("probe_webhook")}
                  className="btn-ghost"
                  disabled={!config.enabled || debugBusyAction !== null}
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  {debugBusyAction === "probe_webhook" ? "探测中..." : "探测 Webhook"}
                </button>
              ) : null}
              <button
                onClick={() => void handleDebugAction("send_test_message")}
                className="btn-ghost"
                disabled={!config.enabled || debugBusyAction !== null}
                style={{ fontSize: 11, padding: "4px 12px" }}
              >
                {debugBusyAction === "send_test_message" ? "发送中..." : "发送测试消息"}
              </button>
              <button
                onClick={() => void handleDebugAction("simulate_inbound")}
                className="btn-ghost"
                disabled={!config.enabled || debugBusyAction !== null}
                style={{ fontSize: 11, padding: "4px 12px" }}
              >
                {debugBusyAction === "simulate_inbound" ? "注入中..." : "模拟入站"}
              </button>
            </div>

            {config.lastDebugAt ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                最近联调：
                {config.lastDebugAction === "send_test_message"
                  ? "发送测试消息"
                  : config.lastDebugAction === "simulate_inbound"
                    ? "模拟入站"
                    : config.lastDebugAction === "probe_webhook"
                      ? "探测 Webhook"
                      : "一键诊断"}
                {" · "}
                {config.lastDebugStatus === "failed"
                  ? "失败"
                  : config.lastDebugStatus === "sent"
                    ? "已发送"
                    : "完成"}
                {" · "}
                {formatPlatformTime(config.lastDebugAt)}
                {config.lastDebugTarget ? ` · 目标 ${config.lastDebugTarget}` : ""}
                {config.lastDebugMessage ? ` · ${config.lastDebugMessage}` : ""}
              </div>
            ) : null}

            {config.debugHistory?.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>最近联调记录</div>
                {config.debugHistory
                  .slice()
                  .sort((left, right) => right.at - left.at)
                  .map((entry, index) => (
                    <div
                      key={`${entry.at}-${entry.action}-${index}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "flex-start",
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ color: entry.ok ? "var(--text)" : "var(--danger)" }}>
                          {formatDebugAction(entry.action)} · {formatDebugStatus(entry.status)}
                          {entry.target ? ` · ${entry.target}` : ""}
                        </div>
                        <div style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{entry.message}</div>
                      </div>
                      <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {formatPlatformTime(entry.at)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}

            {config.recentFailedMessages?.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>最近失败消息缓存</div>
                {config.recentFailedMessages
                  .slice()
                  .sort((left, right) => right.at - left.at)
                  .map((entry, index) => (
                    <div
                      key={`${entry.at}-${entry.target}-${index}`}
                      style={{
                        display: "grid",
                        gap: 2,
                        fontSize: 11,
                        padding: "6px 0",
                        borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ color: "var(--text)" }}>
                        {entry.target} · {formatPlatformTime(entry.at)}
                        {entry.retryCount > 0 ? ` · 已重试 ${entry.retryCount} 次` : ""}
                      </div>
                      <div style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
                        失败内容: {entry.message}
                      </div>
                      <div style={{ color: "var(--danger)", lineHeight: 1.6 }}>
                        失败原因: {entry.reason}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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

function formatDebugAction(action: "send_test_message" | "simulate_inbound" | "diagnose" | "probe_webhook") {
  if (action === "send_test_message") return "发送测试消息";
  if (action === "simulate_inbound") return "模拟入站";
  if (action === "probe_webhook") return "探测 Webhook";
  return "一键诊断";
}

function formatDebugStatus(status: "sent" | "completed" | "failed") {
  if (status === "sent") return "已发送";
  if (status === "failed") return "失败";
  return "完成";
}

function renderDiagnosisBadge(status: PlatformDiagnosisCheck["status"]) {
  if (status === "pass") return "通过";
  if (status === "warn") return "注意";
  if (status === "fail") return "失败";
  return "信息";
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: open ? 6 : 0 }}>
        <div
          onClick={toggle}
          style={{
            width: 30, height: 17, borderRadius: 9, position: "relative", cursor: "pointer",
            background: open ? "var(--accent)" : "var(--border)",
            transition: "background 0.2s", flexShrink: 0,
          }}
        >
          <div style={{
            position: "absolute", top: 2,
            left: open ? 15 : 2,
            width: 13, height: 13, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }} />
        </div>
        <span style={{ fontSize: 11, color: open ? "var(--text)" : "var(--text-muted)" }}>
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
