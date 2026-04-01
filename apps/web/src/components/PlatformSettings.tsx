"use client";
import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { PlatformDef } from "@/store/types";
import { sendWs } from "@/hooks/useWebSocket";

export function PlatformSettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        为每个平台单独配置接入凭证。启用后 Agent 可通过该平台接收指令并回复结果。
      </div>
      {PLATFORM_DEFINITIONS.map(def => (
        <PlatformCard key={def.id} def={def} />
      ))}
    </div>
  );
}

function PlatformCard({ def }: { def: PlatformDef }) {
  const { platformConfigs, updatePlatformConfig, updatePlatformField } = useStore();
  const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" };
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // 展开状态跟随 enabled
  useEffect(() => {
    if (config.enabled) setExpanded(true);
  }, [config.enabled]);

  const allRequiredFilled = def.fields
    .filter(f => f.required)
    .every(f => (config.fields[f.key] ?? "").trim().length > 0);

  function toggle() {
    const next = !config.enabled;
    updatePlatformConfig(def.id, { enabled: next, status: "idle", errorMsg: undefined });
    setExpanded(next);
    if (!next) {
      sendWs({ type: "platform_sync", platformId: def.id, enabled: false, fields: {} });
    }
  }

  async function handleSave() {
    if (!allRequiredFilled) return;
    setSaving(true);
    updatePlatformConfig(def.id, { status: "idle", errorMsg: undefined });
    // 发送到服务端
    sendWs({
      type: "platform_sync",
      platformId: def.id,
      enabled: true,
      fields: config.fields,
    });
    // 乐观更新状态，等服务端回调（如需可扩展 ws 返回 platform_status）
    setTimeout(() => {
      updatePlatformConfig(def.id, { status: "connected" });
      setSaving(false);
    }, 800);
  }

  function handleDisconnect() {
    updatePlatformConfig(def.id, { enabled: false, status: "idle", errorMsg: undefined });
    setExpanded(false);
    sendWs({ type: "platform_sync", platformId: def.id, enabled: false, fields: {} });
  }

  const statusColor =
    config.status === "connected" ? "var(--success)" :
    config.status === "error"     ? "var(--danger)" :
    "var(--text-muted)";

  const statusDot =
    config.status === "connected" ? "#22c55e" :
    config.status === "error"     ? "#ef4444" :
    "#888";

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
              {config.status === "connected" ? "已连接" : config.status === "error" ? "连接失败" : "未连接"}
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
              ⚠️ 此平台需要公网 Webhook 地址。开发阶段可用{" "}
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
