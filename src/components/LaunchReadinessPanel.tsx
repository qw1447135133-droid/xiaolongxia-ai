"use client";

import { useMemo } from "react";
import { filterByProjectScope, getRunProjectScopeKey } from "@/lib/project-context";
import { isPlatformOperationalStatus } from "@/lib/platform-connectors";
import { useStore } from "@/store";
import type { ControlCenterSectionId } from "@/store/types";
import { formatAutomationModeLabel, pickLocaleText } from "@/lib/ui-locale";

export function LaunchReadinessPanel({
  compact = false,
  onSelectSection,
}: {
  compact?: boolean;
  onSelectSection?: (section: ControlCenterSectionId) => void;
}) {
  const locale = useStore(s => s.locale);
  type RiskItem = {
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
    section: ControlCenterSectionId;
  };

  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const platformConfigs = useStore(s => s.platformConfigs);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const executionRuns = useStore(s => s.executionRuns);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const wsStatus = useStore(s => s.wsStatus);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const scopedRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey),
    [chatSessions, currentProjectKey, executionRuns],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, activeSession ?? {}),
    [activeSession, businessApprovals],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );

  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled);
  const operationalPlatforms = enabledPlatforms.filter(platform => isPlatformOperationalStatus(platform.status));
  const connectorBlockers = enabledPlatforms.filter(platform =>
    platform.status !== "connected" && platform.status !== "configured" && platform.status !== "degraded",
  );
  const recoveredSourceIds = new Set(scopedRuns.map(run => run.retryOfRunId).filter(Boolean));
  const recoveryRuns = scopedRuns.filter(run => {
    if (recoveredSourceIds.has(run.id)) return false;
    return run.status === "failed" || (run.recoveryState && run.recoveryState !== "none");
  });
  const pendingApprovals = scopedApprovals.filter(item => item.status === "pending").length;
  const pendingReplySessions = scopedChannelSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const desktopTakeoverReady = desktopInputSession.state !== "manual-required";

  const visibleChecks = [
    {
      id: "ws",
      label: "实时链路",
      ok: wsStatus === "connected",
      detail: wsStatus === "connected" ? "WebSocket 已联机" : "WebSocket 当前离线，远程状态无法实时回流",
      section: "remote" as const,
    },
    {
      id: "connectors",
      label: "连接器",
      ok: enabledPlatforms.length > 0 && operationalPlatforms.length > 0,
      detail: `${operationalPlatforms.length}/${enabledPlatforms.length} 已进入可运行状态`,
      section: "channels" as const,
    },
    {
      id: "recovery",
      label: "执行恢复",
      ok: recoveryRuns.length === 0,
      detail: recoveryRuns.length === 0 ? "当前没有待恢复 run" : `${recoveryRuns.length} 条待恢复`,
      section: "execution" as const,
    },
    {
      id: "approvals",
      label: "审批积压",
      ok: pendingApprovals === 0,
      detail: pendingApprovals === 0 ? "没有待审批阻塞" : `${pendingApprovals} 条待审批`,
      section: "remote" as const,
    },
    {
      id: "takeover",
      label: "桌面接管",
      ok: desktopTakeoverReady,
      detail: desktopTakeoverReady ? "当前没有卡在人工接管" : "桌面输入仍等待人工处理",
      section: "desktop" as const,
    },
    {
      id: "sessions",
      label: "会话待办",
      ok: pendingReplySessions === 0,
      detail: pendingReplySessions === 0 ? "当前没有待回复会话" : `${pendingReplySessions} 个会话仍待回复或未读`,
      section: "channels" as const,
    },
  ];

  const passedChecks = visibleChecks.filter(item => item.ok).length;
  const readinessPercent = Math.round((passedChecks / visibleChecks.length) * 100);
  const blockerItems = ([
    wsStatus !== "connected"
      ? {
        id: "risk-ws",
        severity: "critical" as const,
        title: "实时链路离线",
        detail: "WebSocket 未连接，远程消息、连接器状态和执行结果无法实时回流。",
        section: "remote" as const,
      }
      : null,
    enabledPlatforms.length === 0 || operationalPlatforms.length === 0
      ? {
        id: "risk-connectors",
        severity: "critical" as const,
        title: "缺少可运行连接器",
        detail: enabledPlatforms.length === 0
          ? "当前还没有启用任何真实连接器。"
          : `${connectorBlockers.length} 个连接器仍处于异常、等待回调或未完成握手状态。`,
        section: "channels" as const,
      }
      : null,
    recoveryRuns.length > 0
      ? {
        id: "risk-recovery",
        severity: "critical" as const,
        title: "恢复队列未清空",
        detail: `${recoveryRuns.length} 条执行仍需重试、验证完成继续，或回到聊天接管。`,
        section: "execution" as const,
      }
      : null,
    pendingApprovals > 0
      ? {
        id: "risk-approvals",
        severity: "warning" as const,
        title: "审批仍在积压",
        detail: `${pendingApprovals} 条业务对象等待审批，默认不应自动越过这道边界。`,
        section: "remote" as const,
      }
      : null,
    !desktopTakeoverReady
      ? {
        id: "risk-desktop",
        severity: "critical" as const,
        title: "桌面接管仍待人工",
        detail: desktopInputSession.message || "当前存在一条桌面交互卡在人工接管状态。",
        section: "desktop" as const,
      }
      : null,
    pendingReplySessions > 0
      ? {
        id: "risk-replies",
        severity: "warning" as const,
        title: "渠道会话待回复",
        detail: `${pendingReplySessions} 个渠道会话仍有未读或待回复消息。`,
        section: "channels" as const,
      }
      : null,
  ] as Array<RiskItem | null>).filter((item): item is RiskItem => item !== null);
  const riskItems = compact ? blockerItems.slice(0, 3) : blockerItems.slice(0, 6);

  return (
    <div
      className="card"
      style={{
        padding: compact ? 14 : 16,
        display: "grid",
        gap: 12,
        borderColor: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.24)" : "rgba(251, 191, 36, 0.24)",
        background: "linear-gradient(135deg, rgba(125, 211, 252, 0.08), rgba(255,255,255,0.02))",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {pickLocaleText(locale, {
              "zh-CN": "上线准备度",
              "zh-TW": "上線準備度",
              en: "Launch Readiness",
              ja: "公開準備度",
            })}
          </div>
          <div style={{ marginTop: 4, fontSize: compact ? 16 : 18, fontWeight: 700 }}>
            人工收口看板
          </div>
        </div>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: `1px solid ${readinessPercent >= 80 ? "rgba(34, 197, 94, 0.32)" : "rgba(251, 191, 36, 0.32)"}`,
            background: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.12)" : "rgba(251, 191, 36, 0.12)",
            color: readinessPercent >= 80 ? "var(--success)" : "var(--warning)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {readinessPercent}%
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        {[
          { label: "可运行连接器", value: `${operationalPlatforms.length}/${enabledPlatforms.length}`, accent: "var(--success)" },
          { label: "恢复队列", value: recoveryRuns.length, accent: recoveryRuns.length === 0 ? "var(--success)" : "var(--warning)" },
          { label: "待审批", value: pendingApprovals, accent: pendingApprovals === 0 ? "var(--success)" : "var(--warning)" },
          { label: "待回复会话", value: pendingReplySessions, accent: pendingReplySessions === 0 ? "var(--success)" : "#60a5fa" },
        ].map(item => (
          <div
            key={item.label}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
            <div style={{ marginTop: 6, fontSize: compact ? 18 : 20, fontWeight: 700, color: item.accent }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {visibleChecks.map(check => (
          <button
            key={check.id}
            type="button"
            className="btn-ghost"
            style={{
              textAlign: "left",
              padding: 12,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.03)",
            }}
            onClick={() => onSelectSection?.(check.section)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 12 }}>{check.label}</strong>
              <span style={{ color: check.ok ? "var(--success)" : "var(--warning)", fontSize: 11 }}>
                {check.ok
                  ? pickLocaleText(locale, { "zh-CN": "正常", "zh-TW": "正常", en: "OK", ja: "正常" })
                  : pickLocaleText(locale, { "zh-CN": "待处理", "zh-TW": "待處理", en: "Pending", ja: "要対応" })}
              </span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {check.detail}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {pickLocaleText(locale, {
            "zh-CN": "最高风险",
            "zh-TW": "最高風險",
            en: "Top Risks",
            ja: "主要リスク",
          })}
        </div>
        {riskItems.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {riskItems.map(item => (
              <button
                key={item.id}
                type="button"
                className="btn-ghost"
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: item.severity === "critical"
                    ? "rgba(248, 113, 113, 0.08)"
                    : item.severity === "warning"
                      ? "rgba(251, 191, 36, 0.08)"
                      : "rgba(255,255,255,0.03)",
                }}
                onClick={() => onSelectSection?.(item.section)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 12 }}>{item.title}</strong>
                  <span style={{ fontSize: 11, color: item.severity === "critical" ? "var(--danger)" : item.severity === "warning" ? "var(--warning)" : "var(--text-muted)" }}>
                    {item.severity === "critical"
                      ? pickLocaleText(locale, { "zh-CN": "阻断", "zh-TW": "阻斷", en: "Blocking", ja: "阻害" })
                      : item.severity === "warning"
                        ? pickLocaleText(locale, { "zh-CN": "关注", "zh-TW": "關注", en: "Warning", ja: "注意" })
                        : pickLocaleText(locale, { "zh-CN": "提示", "zh-TW": "提示", en: "Info", ja: "情報" })}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  {item.detail}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
            当前没有明显的人工阻断项。自动执行、验证和策略细节已从这个面板隐藏，继续查看对应子面板即可。
          </div>
        )}
      </div>
    </div>
  );
}
