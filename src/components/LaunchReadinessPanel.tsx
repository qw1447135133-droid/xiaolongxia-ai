"use client";

import { useMemo } from "react";
import { filterByProjectScope, getRunProjectScopeKey } from "@/lib/project-context";
import { isPlatformOperationalStatus } from "@/lib/platform-connectors";
import { useStore } from "@/store";
import type { ControlCenterSectionId } from "@/store/types";

export function LaunchReadinessPanel({
  compact = false,
  onSelectSection,
}: {
  compact?: boolean;
  onSelectSection?: (section: ControlCenterSectionId) => void;
}) {
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
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const semanticKnowledgeDocs = useStore(s => s.semanticKnowledgeDocs);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const desktopRuntime = useStore(s => s.desktopRuntime);
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
  const scopedLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );
  const scopedMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, activeSession ?? {}),
    [activeSession, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, activeSession ?? {}),
    [activeSession, workspaceDeskNotes],
  );
  const scopedKnowledgeDocs = useMemo(
    () => filterByProjectScope(semanticKnowledgeDocs, activeSession ?? {}),
    [activeSession, semanticKnowledgeDocs],
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
  const verificationPassed = scopedRuns.some(run => run.verificationStatus === "passed");
  const blockedOperations = scopedLogs.filter(log =>
    log.status === "blocked" || log.status === "failed",
  ).length;
  const contextReady = scopedMemories.length + scopedDeskNotes.length + scopedKnowledgeDocs.length > 0;
  const desktopReady = desktopRuntime.fetchState === "ready" && desktopRuntime.totalClients > 0;
  const pendingReplySessions = scopedChannelSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const publishFailureCount = scopedContentTasks.reduce(
    (count, task) => count + task.publishedResults.filter(result => result.status === "failed").length,
    0,
  );
  const publishBacklogCount = scopedContentTasks.filter(task =>
    task.status === "review" || task.status === "scheduled",
  ).length;
  const automationReady = wsStatus === "connected" && !automationPaused && remoteSupervisorEnabled && automationMode !== "manual";
  const desktopTakeoverReady = desktopInputSession.state !== "manual-required";

  const checks = [
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
      id: "automation",
      label: "自动化策略",
      ok: automationReady,
      detail: automationPaused
        ? "自动化当前处于暂停状态"
        : !remoteSupervisorEnabled
          ? "远程值守尚未开启"
          : automationMode === "manual"
            ? "当前仍是纯人工模式"
            : `当前模式 ${automationMode}`,
      section: "remote" as const,
    },
    {
      id: "verification",
      label: "验证覆盖",
      ok: verificationPassed,
      detail: verificationPassed ? "至少有一条已通过验证的 run" : "还没有通过验证的执行样本",
      section: "execution" as const,
    },
    {
      id: "desktop",
      label: "桌面能力",
      ok: desktopReady,
      detail: desktopReady ? "桌面运行时已在线" : "桌面运行时未就绪",
      section: "desktop" as const,
    },
    {
      id: "takeover",
      label: "桌面接管",
      ok: desktopTakeoverReady,
      detail: desktopTakeoverReady ? "当前没有卡在人工接管" : "桌面输入仍等待人工处理",
      section: "desktop" as const,
    },
    {
      id: "context",
      label: "项目上下文",
      ok: contextReady,
      detail: contextReady ? "已有项目记忆 / Desk Notes / 知识文档" : "项目上下文仍然过薄",
      section: "workspace" as const,
    },
    {
      id: "sessions",
      label: "会话待办",
      ok: pendingReplySessions === 0,
      detail: pendingReplySessions === 0 ? "当前没有待回复会话" : `${pendingReplySessions} 个会话仍待回复或未读`,
      section: "channels" as const,
    },
    {
      id: "publishing",
      label: "发布闭环",
      ok: publishFailureCount === 0,
      detail: publishFailureCount === 0
        ? (publishBacklogCount > 0 ? `${publishBacklogCount} 条内容仍在 review/scheduled` : "没有待补救的发布失败")
        : `${publishFailureCount} 条发布失败记录待回补`,
      section: "entities" as const,
    },
  ];

  const passedChecks = checks.filter(item => item.ok).length;
  const readinessPercent = Math.round((passedChecks / checks.length) * 100);
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
    !automationReady
      ? {
        id: "risk-automation",
        severity: "warning" as const,
        title: "自动化策略未闭环",
        detail: [
          automationPaused ? "自动化已暂停" : "",
          automationMode === "manual" ? "当前为人工模式" : "",
          !remoteSupervisorEnabled ? "远程值守已关闭" : "",
          wsStatus !== "connected" ? "实时链路离线" : "",
        ].filter(Boolean).join("；"),
        section: "remote" as const,
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
    publishFailureCount > 0
      ? {
        id: "risk-publish",
        severity: "warning" as const,
        title: "发布失败待补救",
        detail: `${publishFailureCount} 条发布失败记录仍需回写、重试或转人工。`,
        section: "entities" as const,
      }
      : null,
    blockedOperations > 0
      ? {
        id: "risk-ops",
        severity: "info" as const,
        title: "审计链路存在失败项",
        detail: `${blockedOperations} 条业务日志目前处于 blocked/failed。`,
        section: "remote" as const,
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
            Launch Readiness
          </div>
          <div style={{ marginTop: 4, fontSize: compact ? 16 : 18, fontWeight: 700 }}>
            上线前最后收口看板
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
        {checks.map(check => (
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
                {check.ok ? "OK" : "待处理"}
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
          Top Risks
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
                    {item.severity === "critical" ? "阻断" : item.severity === "warning" ? "关注" : "提示"}
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
            当前没有明显的上线阻断，剩余工作主要是补更多真实连接器样本和验证覆盖。
          </div>
        )}
      </div>
    </div>
  );
}
