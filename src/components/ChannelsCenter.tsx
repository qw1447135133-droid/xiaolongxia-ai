"use client";

import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { ControlCenterSectionId } from "@/store/types";

export function ChannelsCenter() {
  const { platformConfigs, updatePlatformConfig } = useStore();
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const enabledCount = PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.enabled).length;
  const connectedCount = PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.status === "connected").length;
  const webhookCount = PLATFORM_DEFINITIONS.filter(def => def.webhookBased).length;

  const toggleChannel = (platformId: string) => {
    const current = platformConfigs[platformId] ?? { enabled: false, fields: {}, status: "idle" as const };
    const nextEnabled = !current.enabled;

    updatePlatformConfig(platformId, {
      enabled: nextEnabled,
      status: nextEnabled ? current.status : "idle",
      errorMsg: undefined,
    });

    sendWs({
      type: "platform_sync",
      platformId,
      enabled: nextEnabled,
      fields: nextEnabled ? current.fields : {},
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(96, 165, 250, 0.14), rgba(255,255,255,0.02))",
          borderColor: "rgba(96, 165, 250, 0.22)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Channels Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Bridge-style channel overview for external message access
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          This lightweight layer turns the existing platform settings into a visible channel board, so external access routes feel like part of the workbench rather than a hidden configuration form.
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
            去远程值守面板
          </button>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
            去详细平台设置
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <ChannelMetric label="Channels" value={PLATFORM_DEFINITIONS.length} accent="var(--accent)" />
        <ChannelMetric label="Enabled" value={enabledCount} accent="#60a5fa" />
        <ChannelMetric label="Connected" value={connectedCount} accent="var(--success)" />
        <ChannelMetric label="Webhook-based" value={webhookCount} accent="var(--warning)" />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Channel Board</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Toggle channels, inspect readiness, and see which routes need public webhook support.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {PLATFORM_DEFINITIONS.map(def => {
            const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" as const };
            const requiredFields = def.fields.filter(field => field.required);
            const readyCount = requiredFields.filter(field => (config.fields[field.key] ?? "").trim().length > 0).length;
            const readiness = requiredFields.length === 0 ? 100 : Math.round((readyCount / requiredFields.length) * 100);

            const statusColor =
              config.status === "connected"
                ? "var(--success)"
                : config.status === "error"
                  ? "var(--danger)"
                  : "var(--text-muted)";

            return (
              <article
                key={def.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${config.enabled ? "rgba(var(--accent-rgb), 0.28)" : "var(--border)"}`,
                  background: config.enabled ? "rgba(var(--accent-rgb), 0.08)" : "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{def.emoji}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{def.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {def.description}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${statusColor}33`,
                      background: `${statusColor}1f`,
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {config.status}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={channelRowStyle}>
                    <span>Mode</span>
                    <strong>{def.webhookBased ? "Webhook" : "Direct Bot"}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Required fields</span>
                    <strong>{readyCount}/{requiredFields.length || 0}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Readiness</span>
                    <strong>{readiness}%</strong>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {def.fields.map(field => (
                    <span
                      key={`${def.id}-${field.key}`}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: (config.fields[field.key] ?? "").trim()
                          ? "rgba(var(--success-rgb), 0.12)"
                          : "rgba(255,255,255,0.04)",
                        color: (config.fields[field.key] ?? "").trim() ? "var(--success)" : "var(--text-muted)",
                        fontSize: 11,
                      }}
                    >
                      {field.label}
                    </span>
                  ))}
                </div>

                {def.webhookBased && (
                  <div
                    style={{
                      fontSize: 11,
                      lineHeight: 1.7,
                      color: "var(--warning)",
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.18)",
                      borderRadius: 12,
                      padding: "10px 12px",
                    }}
                  >
                    This channel needs a public callback endpoint before it can behave like a live bridge.
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <span style={{ fontSize: 11, color: config.enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
                    {config.enabled ? "Enabled in shell" : "Disabled in shell"}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      去远程值守
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                      配置字段
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => toggleChannel(def.id)}>
                      {config.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChannelMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

const channelRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  color: "var(--text-muted)",
};
