"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { useStore } from "@/store";
import {
  buildBusinessAutomationQueue,
  decorateBusinessDispatchQueue,
} from "@/lib/business-operations";
import { getScheduledTasks, type ScheduledTask } from "@/lib/scheduled-tasks";
import {
  filterByProjectScope,
  getRunProjectScopeKey,
  getSessionProjectLabel,
  getSessionProjectScope,
} from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES, type AutomationMode, type ControlCenterSectionId, PLATFORM_DEFINITIONS } from "@/store/types";
import type { BusinessOperationRecord } from "@/types/business-entities";

type AuditFocusRequest = {
  entityType: BusinessOperationRecord["entityType"];
  entityId: string;
  eventType: BusinessOperationRecord["eventType"];
  status: BusinessOperationRecord["status"];
  executionRunId?: string;
};

type ActionFeedback = {
  title: string;
  detail: string;
  executionRunId?: string;
  entitySection?: ControlCenterSectionId;
};

export function RemoteOpsCenter() {
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);
  const [highlightedAuditLogId, setHighlightedAuditLogId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [publishLinkDrafts, setPublishLinkDrafts] = useState<Record<string, string>>({});
  const [publishExternalIdDrafts, setPublishExternalIdDrafts] = useState<Record<string, string>>({});
  const [publishTargetDrafts, setPublishTargetDrafts] = useState<Record<string, string>>({});
  const auditSectionRef = useRef<HTMLDivElement | null>(null);
  const pendingAuditFocusRef = useRef<AuditFocusRequest | null>(null);

  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const workflowRuns = useStore(s => s.workflowRuns);
  const executionRuns = useStore(s => s.executionRuns);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const autoDispatchScheduledTasks = useStore(s => s.autoDispatchScheduledTasks);
  const setAutomationMode = useStore(s => s.setAutomationMode);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setRemoteSupervisorEnabled = useStore(s => s.setRemoteSupervisorEnabled);
  const setAutoDispatchScheduledTasks = useStore(s => s.setAutoDispatchScheduledTasks);
  const setBusinessApprovalDecision = useStore(s => s.setBusinessApprovalDecision);
  const updateBusinessContentTask = useStore(s => s.updateBusinessContentTask);
  const queueContentTaskWorkflowRun = useStore(s => s.queueContentTaskWorkflowRun);
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
  const recordContentPublishResult = useStore(s => s.recordContentPublishResult);
  const applyContentTaskGovernance = useStore(s => s.applyContentTaskGovernance);
  const continueContentTaskNextCycle = useStore(s => s.continueContentTaskNextCycle);
  const applyContentChannelGovernance = useStore(s => s.applyContentChannelGovernance);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const wsStatus = useStore(s => s.wsStatus);

  const openControlCenterSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const focusExecutionRun = (runId?: string | null) => {
    if (runId) {
      setActiveExecutionRun(runId);
    }
    openControlCenterSection("execution");
  };

  const scrollAuditSectionIntoView = () => {
    auditSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const queueAuditFocus = (request: AuditFocusRequest) => {
    pendingAuditFocusRef.current = request;
    window.setTimeout(() => {
      scrollAuditSectionIntoView();
    }, 60);
  };

  useEffect(() => {
    setScheduledTasks(getScheduledTasks());
  }, []);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const currentProjectScope = getSessionProjectScope(activeSession);

  const enabledPlatforms = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.enabled),
    [platformConfigs],
  );
  const connectedPlatforms = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.status === "connected"),
    [platformConfigs],
  );
  const enabledScheduledTasks = useMemo(
    () => scheduledTasks.filter(task => task.enabled),
    [scheduledTasks],
  );
  const projectRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey),
    [chatSessions, currentProjectKey, executionRuns],
  );
  const recentProjectRuns = useMemo(
    () => [...projectRuns].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 8),
    [projectRuns],
  );
  const scopedMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, currentProjectScope),
    [currentProjectScope, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, currentProjectScope),
    [currentProjectScope, workspaceDeskNotes],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, currentProjectScope),
    [businessApprovals, currentProjectScope],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, currentProjectScope),
    [businessOperationLogs, currentProjectScope],
  );
  const scopedCustomers = useMemo(
    () => filterByProjectScope(businessCustomers, currentProjectScope),
    [businessCustomers, currentProjectScope],
  );
  const scopedLeads = useMemo(
    () => filterByProjectScope(businessLeads, currentProjectScope),
    [businessLeads, currentProjectScope],
  );
  const scopedTickets = useMemo(
    () => filterByProjectScope(businessTickets, currentProjectScope),
    [businessTickets, currentProjectScope],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, currentProjectScope),
    [businessContentTasks, currentProjectScope],
  );
  const contentTaskMap = useMemo(
    () => Object.fromEntries(scopedContentTasks.map(task => [task.id, task])),
    [scopedContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, currentProjectScope),
    [businessChannelSessions, currentProjectScope],
  );

  const verificationReadyRuns = recentProjectRuns.filter(
    run => run.verificationStatus === "passed" || run.verificationStatus === "failed",
  ).length;
  const completedRuns = recentProjectRuns.filter(run => run.status === "completed").length;
  const failedRuns = recentProjectRuns.filter(run => run.status === "failed").length;
  const activeRuns = recentProjectRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const remoteReadinessScore = [
    providers.length > 0,
    enabledPlatforms.length > 0,
    enabledScheduledTasks.length > 0,
    recentProjectRuns.length > 0,
    verificationReadyRuns > 0,
  ].filter(Boolean).length;
  const remoteReadinessPercent = Math.round((remoteReadinessScore / 5) * 100);
  const businessAutomationQueue = useMemo(
    () =>
      buildBusinessAutomationQueue({
        approvals: scopedApprovals,
        customers: scopedCustomers,
        leads: scopedLeads,
        tickets: scopedTickets,
        contentTasks: scopedContentTasks,
        channelSessions: scopedChannelSessions,
      }),
    [scopedApprovals, scopedChannelSessions, scopedContentTasks, scopedCustomers, scopedLeads, scopedTickets],
  );
  const approvalQueue = useMemo(
    () => businessAutomationQueue.filter(item => item.decision.humanApprovalRequired),
    [businessAutomationQueue],
  );
  const pendingApprovals = approvalQueue.filter(item => item.approvalState === "pending").length;
  const approvedApprovals = approvalQueue.filter(item => item.approvalState === "approved").length;
  const rejectedApprovals = approvalQueue.filter(item => item.approvalState === "rejected").length;
  const entityReadyCount = businessAutomationQueue.filter(item => item.automationState === "ready").length;
  const entityBlockedCount = businessAutomationQueue.length - entityReadyCount;

  const dispatchQueue = useMemo(
    () =>
      decorateBusinessDispatchQueue(businessAutomationQueue, {
        wsStatus,
        automationMode,
        automationPaused,
        remoteSupervisorEnabled,
      }),
    [automationMode, automationPaused, businessAutomationQueue, remoteSupervisorEnabled, wsStatus],
  );
  const recentOperationLogs = useMemo(
    () => scopedOperationLogs.slice(0, 8),
    [scopedOperationLogs],
  );
  const contentOpsSummary = useMemo(() => {
    const publishedTasks = scopedContentTasks.filter(task => task.status === "published").length;
    const publishSuccessCount = scopedContentTasks.reduce(
      (count, task) => count + task.publishedResults.filter(result => result.status === "completed").length,
      0,
    );
    const publishFailureCount = scopedContentTasks.reduce(
      (count, task) => count + task.publishedResults.filter(result => result.status === "failed").length,
      0,
    );
    const postmortemReadyCount = scopedContentTasks.filter(task => Boolean(task.latestPostmortemSummary)).length;
    const latestPublishedResult = scopedContentTasks
      .flatMap(task => task.publishedResults.map(result => ({ taskTitle: task.title, result })))
      .sort((left, right) => right.result.publishedAt - left.result.publishedAt)[0] ?? null;

    return {
      publishedTasks,
      publishSuccessCount,
      publishFailureCount,
      postmortemReadyCount,
      latestPublishedResult,
    };
  }, [scopedContentTasks]);
  const contentOpsKpi = useMemo(() => {
    const totalPublishAttempts = contentOpsSummary.publishSuccessCount + contentOpsSummary.publishFailureCount;
    const publishSuccessRate = totalPublishAttempts > 0
      ? Math.round((contentOpsSummary.publishSuccessCount / totalPublishAttempts) * 100)
      : 0;
    const postmortemCoverage = contentOpsSummary.publishedTasks > 0
      ? Math.round((contentOpsSummary.postmortemReadyCount / contentOpsSummary.publishedTasks) * 100)
      : 0;

    const avgPostmortemLagHours = (() => {
      const lags: number[] = [];
      for (const task of scopedContentTasks) {
        const latestPublishAt = task.publishedResults
          .filter(result => result.status === "completed")
          .sort((left, right) => right.publishedAt - left.publishedAt)[0]?.publishedAt;
        const latestPostmortemAt = scopedOperationLogs
          .filter(log =>
            log.entityType === "contentTask"
            && log.entityId === task.id
            && log.eventType === "workflow"
            && log.status === "completed"
            && log.title.includes("发布复盘"),
          )
          .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.updatedAt;

        if (latestPublishAt && latestPostmortemAt && latestPostmortemAt >= latestPublishAt) {
          lags.push((latestPostmortemAt - latestPublishAt) / (1000 * 60 * 60));
        }
      }

      if (lags.length === 0) return null;
      return Math.round((lags.reduce((sum, value) => sum + value, 0) / lags.length) * 10) / 10;
    })();

    const recommendationBreakdown = scopedContentTasks.reduce(
      (acc, task) => {
        if (task.nextCycleRecommendation) {
          acc[task.nextCycleRecommendation] += 1;
        }
        return acc;
      },
      { reuse: 0, retry: 0, rewrite: 0 } as Record<"reuse" | "retry" | "rewrite", number>,
    );

    const channelPerformance = Object.values(
      scopedContentTasks
        .flatMap(task => task.publishedResults)
        .reduce((acc, result) => {
          const current = acc[result.channel] ?? {
            channel: result.channel,
            completed: 0,
            failed: 0,
          };

          if (result.status === "completed") {
            current.completed += 1;
          } else {
            current.failed += 1;
          }

          acc[result.channel] = current;
          return acc;
        }, {} as Record<string, { channel: string; completed: number; failed: number }>),
    )
      .sort((left, right) => (right.completed + right.failed) - (left.completed + left.failed))
      .slice(0, 6);

    return {
      totalPublishAttempts,
      publishSuccessRate,
      postmortemCoverage,
      avgPostmortemLagHours,
      recommendationBreakdown,
      channelPerformance,
    };
  }, [contentOpsSummary, scopedContentTasks, scopedOperationLogs]);
  const nextCycleQueue = useMemo(
    () =>
      scopedContentTasks
        .filter(task => Boolean(task.nextCycleRecommendation))
        .sort((left, right) => (right.lastOperationAt ?? right.updatedAt) - (left.lastOperationAt ?? left.updatedAt))
        .slice(0, 6),
    [scopedContentTasks],
  );
  const contentOpsAlerts = useMemo(() => {
    const now = Date.now();
    const alerts: Array<{
      id: string;
      severity: "critical" | "warning" | "info";
      title: string;
      detail: string;
      entityId?: string;
      action: "workflow" | "entities";
      remediation?: "queue_postmortem" | "governance_rewrite" | "channel_governance";
    }> = [];

    for (const task of scopedContentTasks) {
      const latestCompletedPublish = task.publishedResults
        .filter(result => result.status === "completed")
        .sort((left, right) => right.publishedAt - left.publishedAt)[0];

      if (
        latestCompletedPublish
        && !task.latestPostmortemSummary
        && now - latestCompletedPublish.publishedAt > 24 * 60 * 60 * 1000
      ) {
        alerts.push({
          id: `postmortem-overdue-${task.id}`,
          severity: "warning",
          title: "发布后超过 24 小时未复盘",
          detail: `${task.title} 最近一次成功发布后仍未形成复盘摘要，建议尽快进入发布复盘 workflow。`,
          entityId: task.id,
          action: "workflow",
          remediation: "queue_postmortem",
        });
      }

      const recentFailures = task.publishedResults
        .filter(result => result.status === "failed")
        .sort((left, right) => right.publishedAt - left.publishedAt)
        .slice(0, 2);

      if (recentFailures.length >= 2) {
        alerts.push({
          id: `publish-failure-streak-${task.id}`,
          severity: "critical",
          title: "内容任务连续发布失败",
          detail: `${task.title} 最近连续 ${recentFailures.length} 次发布失败，建议暂停直接外发，先回到改写或人工接管。`,
          entityId: task.id,
          action: "entities",
          remediation: "governance_rewrite",
        });
      }

      if (task.riskyChannels.length > 0 && task.publishTargets.some(target => task.riskyChannels.includes(target.channel))) {
        alerts.push({
          id: `channel-governance-${task.id}`,
          severity: "warning",
          title: "内容任务命中了高风险渠道",
          detail: `${task.title} 当前建议主发 ${task.recommendedPrimaryChannel ?? task.channel}，风险渠道 ${task.riskyChannels.join(" / ")}，建议先按治理策略重排发布目标。`,
          entityId: task.id,
          action: "entities",
          remediation: "channel_governance",
        });
      }
    }

    for (const channel of contentOpsKpi.channelPerformance) {
      if (channel.failed >= 2 && channel.failed > channel.completed) {
        alerts.push({
          id: `channel-risk-${channel.channel}`,
          severity: "warning",
          title: "渠道成功率偏低",
          detail: `${channel.channel} 当前成功 ${channel.completed} / 失败 ${channel.failed}，建议检查发布 SOP 或平台限制。`,
          action: "entities",
        });
      }
    }

    if (contentOpsKpi.recommendationBreakdown.rewrite >= 3) {
      alerts.push({
        id: "rewrite-backlog",
        severity: "info",
        title: "待改写内容积压",
        detail: `当前有 ${contentOpsKpi.recommendationBreakdown.rewrite} 条内容被建议改写，说明前序草稿或渠道匹配可能需要调整。`,
        action: "workflow",
      });
    }

    return alerts.slice(0, 8);
  }, [contentOpsKpi.channelPerformance, contentOpsKpi.recommendationBreakdown.rewrite, scopedContentTasks]);

  useEffect(() => {
    if (!pendingAuditFocusRef.current) {
      return;
    }

    const request = pendingAuditFocusRef.current;
    const matchedLog = scopedOperationLogs.find(log =>
      log.entityType === request.entityType
      && log.entityId === request.entityId
      && log.eventType === request.eventType
      && log.status === request.status
      && (request.executionRunId ? log.executionRunId === request.executionRunId : true),
    );

    if (!matchedLog) {
      return;
    }

    pendingAuditFocusRef.current = null;
    setHighlightedAuditLogId(matchedLog.id);
  }, [scopedOperationLogs]);

  useEffect(() => {
    setHighlightedAuditLogId(null);
    setActionFeedback(null);
    pendingAuditFocusRef.current = null;
  }, [currentProjectKey]);

  const scenarioCards = [
    buildScenarioCard({
      title: "自动化客服",
      description: "适合接 Webhook/机器人消息，自动分派给客服型数字员工并保留执行轨迹。",
      checks: {
        channels: enabledPlatforms.length > 0,
        supervision: recentProjectRuns.length > 0,
        memory: scopedMemories.length > 0 || scopedDeskNotes.length > 0,
      },
      missingMessage: enabledPlatforms.length === 0
        ? "还没有开启任何远程渠道，手机端无法真正接入消息。"
        : connectedPlatforms.length === 0
          ? "渠道已配置入口，但连接状态还没有打通成稳定桥接。"
          : "可以试运行，但仍缺用户鉴权、队列和 SLA 兜底。",
    }),
    buildScenarioCard({
      title: "自动化销售",
      description: "更像多步骤流程执行，需要预设工作流、定时触发、结果回传和上下文记忆。",
      checks: {
        channels: enabledPlatforms.length > 0,
        supervision: workflowRuns.length > 0 || enabledScheduledTasks.length > 0,
        memory: scopedMemories.length > 0,
      },
      missingMessage: workflowRuns.length === 0 && enabledScheduledTasks.length === 0
        ? "现在还缺稳定的销售编排层，更多是手动派发，不是真正自动销售流水线。"
        : "编排雏形已经有了，但缺 CRM 状态、客户分层、重试与回访闭环。",
    }),
    buildScenarioCard({
      title: "自动推文 / 社媒分发",
      description: "这类能力需要独立的社媒渠道适配器、内容审核、发布时间窗和平台回执。",
      checks: {
        channels: false,
        supervision: enabledScheduledTasks.length > 0,
        memory: true,
      },
      missingMessage: "当前仓库里还没有 X/Twitter 等社媒通道，也没有发布结果回执链路，所以这块还不能算已具备。",
    }),
  ];
  const activeTemplate = activeTeamOperatingTemplateId
    ? getTeamOperatingTemplate(activeTeamOperatingTemplateId)
    : null;
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const remoteRecommendation = activeSurface?.remoteOpsRecommendation ?? null;
  const recommendationMatches = remoteRecommendation
    ? automationMode === remoteRecommendation.automationMode
      && remoteSupervisorEnabled === remoteRecommendation.remoteSupervisorEnabled
      && autoDispatchScheduledTasks === remoteRecommendation.autoDispatchScheduledTasks
    : false;

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">Remote Ops</div>
        <div className="control-center__hero-title">
          当前更像“可进化中的数字员工工作台”，还不是完全合格的远程运营平台
        </div>
        <div className="control-center__hero-copy">
          它已经具备远程接入、任务派发、执行追踪、项目记忆和监督面板的骨架，但离“手机上放心托管一群数字员工自动跑业务”还差最后几层系统能力。
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"} · 远程运营就绪度 {remoteReadinessPercent}%
        </div>
      </div>

      {activeTemplate && remoteRecommendation ? (
        <div
          className="control-center__panel"
          style={{
            background: "linear-gradient(135deg, rgba(var(--accent-rgb), 0.12), rgba(255,255,255,0.02))",
            borderColor: "rgba(var(--accent-rgb), 0.22)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="control-center__panel-title">
                当前模式建议 · {activeTemplate.label}
              </div>
              <div className="control-center__copy">{remoteRecommendation.title}</div>
              <div className="control-center__copy">{remoteRecommendation.copy}</div>
            </div>
            <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
              <div className="control-center__copy">
                建议模式: <strong className="control-center__strong">{remoteRecommendation.automationMode === "manual" ? "人工" : remoteRecommendation.automationMode === "supervised" ? "监督" : "自治"}</strong>
              </div>
              <div className="control-center__copy">
                远程值守: <strong className="control-center__strong">{remoteRecommendation.remoteSupervisorEnabled ? "开启" : "关闭"}</strong>
              </div>
              <div className="control-center__copy">
                定时自动派发: <strong className="control-center__strong">{remoteRecommendation.autoDispatchScheduledTasks ? "开启" : "关闭"}</strong>
              </div>
              <button
                type="button"
                className={recommendationMatches ? "btn-primary" : "btn-ghost"}
                onClick={() => {
                  setAutomationMode(remoteRecommendation.automationMode);
                  setRemoteSupervisorEnabled(remoteRecommendation.remoteSupervisorEnabled);
                  setAutoDispatchScheduledTasks(remoteRecommendation.autoDispatchScheduledTasks);
                }}
              >
                {recommendationMatches ? "当前已符合建议" : "一键套用模式建议"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="control-center__stats">
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">已开启渠道</div>
          <div className="control-center__stat-value" style={{ color: "var(--accent)" }}>{enabledPlatforms.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">已连接渠道</div>
          <div className="control-center__stat-value" style={{ color: "var(--success)" }}>{connectedPlatforms.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">自动化计划</div>
          <div className="control-center__stat-value" style={{ color: "#7dd3fc" }}>{enabledScheduledTasks.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">最近项目 Runs</div>
          <div className="control-center__stat-value" style={{ color: "#fbbf24" }}>{recentProjectRuns.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">验证覆盖</div>
          <div className="control-center__stat-value" style={{ color: "#c4b5fd" }}>
            {verificationReadyRuns}/{recentProjectRuns.length || 0}
          </div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">可自动派发</div>
          <div className="control-center__stat-value" style={{ color: "#22c55e" }}>{entityReadyCount}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">待审批</div>
          <div className="control-center__stat-value" style={{ color: "#ef4444" }}>{pendingApprovals}</div>
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">内容运营概览</div>
        <div className="control-center__list">
          <div>已发布内容任务: <strong className="control-center__strong">{contentOpsSummary.publishedTasks}</strong></div>
          <div>成功发布次数: <strong className="control-center__strong">{contentOpsSummary.publishSuccessCount}</strong></div>
          <div>失败发布次数: <strong className="control-center__strong">{contentOpsSummary.publishFailureCount}</strong></div>
          <div>已完成复盘: <strong className="control-center__strong">{contentOpsSummary.postmortemReadyCount}</strong></div>
        </div>
        <div className="control-center__dispatch-note" style={{ marginTop: 10 }}>
          {contentOpsSummary.latestPublishedResult
            ? `最近一次发布: ${contentOpsSummary.latestPublishedResult.taskTitle} · ${contentOpsSummary.latestPublishedResult.result.channel}:${contentOpsSummary.latestPublishedResult.result.accountLabel} · ${contentOpsSummary.latestPublishedResult.result.status}${contentOpsSummary.latestPublishedResult.result.externalId ? ` · ${contentOpsSummary.latestPublishedResult.result.externalId}` : ""}`
            : "当前项目还没有发布结果回写。"}
        </div>
        <div className="control-center__stats" style={{ marginTop: 14 }}>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">发布成功率</div>
            <div className="control-center__stat-value" style={{ color: "#22c55e" }}>{contentOpsKpi.publishSuccessRate}%</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">复盘覆盖率</div>
            <div className="control-center__stat-value" style={{ color: "#60a5fa" }}>{contentOpsKpi.postmortemCoverage}%</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">平均复盘时长</div>
            <div className="control-center__stat-value" style={{ color: "#c084fc" }}>
              {contentOpsKpi.avgPostmortemLagHours === null ? "--" : `${contentOpsKpi.avgPostmortemLagHours}h`}
            </div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">发布尝试数</div>
            <div className="control-center__stat-value" style={{ color: "#f59e0b" }}>{contentOpsKpi.totalPublishAttempts}</div>
          </div>
        </div>
        <div className="control-center__columns" style={{ marginTop: 14 }}>
          <div className="control-center__panel">
            <div className="control-center__panel-title">建议分布</div>
            <div className="control-center__list control-center__list--dense">
              <div>待复用: <strong className="control-center__strong">{contentOpsKpi.recommendationBreakdown.reuse}</strong></div>
              <div>待重发: <strong className="control-center__strong">{contentOpsKpi.recommendationBreakdown.retry}</strong></div>
              <div>待改写: <strong className="control-center__strong">{contentOpsKpi.recommendationBreakdown.rewrite}</strong></div>
            </div>
          </div>
          <div className="control-center__panel">
            <div className="control-center__panel-title">渠道表现</div>
            {contentOpsKpi.channelPerformance.length === 0 ? (
              <div className="control-center__copy">当前还没有可统计的渠道发布表现。</div>
            ) : (
              <div className="control-center__list control-center__list--dense">
                {contentOpsKpi.channelPerformance.map(item => (
                  <div key={item.channel}>
                    {item.channel}: <strong className="control-center__strong">{item.completed}</strong> 成功 / <strong className="control-center__strong">{item.failed}</strong> 失败
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">内容运营告警</div>
        <div className="control-center__dispatch-list">
          {contentOpsAlerts.length === 0 ? (
            <div className="control-center__copy">当前没有明显的内容运营风险，SLA 状态正常。</div>
          ) : (
            contentOpsAlerts.map(alert => (
              <article key={alert.id} className="control-center__dispatch-card">
                <div className="control-center__approval-head">
                  <div>
                    <div className="control-center__panel-title">{alert.title}</div>
                    <div className="control-center__copy">{alert.detail}</div>
                  </div>
                  <span className={`control-center__scenario-badge is-${getContentAlertTone(alert.severity)}`}>
                    {getContentAlertLabel(alert.severity)}
                  </span>
                </div>
                <div className="control-center__quick-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => openControlCenterSection(alert.action)}
                  >
                    {alert.action === "workflow" ? "去工作流面板" : "去业务实体面板"}
                  </button>
                  {alert.entityId ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setActionFeedback({
                          title: "已定位到内容告警对象",
                          detail: "请在业务实体或工作流面板继续处理这条内容任务。",
                          entitySection: alert.action,
                        });
                        openControlCenterSection(alert.action);
                      }}
                    >
                      处理这条内容
                    </button>
                  ) : null}
                  {alert.entityId && alert.remediation === "queue_postmortem" ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        const workflowRunId = queueContentTaskWorkflowRun(alert.entityId!);
                        if (!workflowRunId) return;
                        setActionFeedback({
                          title: "已排队发布复盘",
                          detail: "系统已为这条逾期未复盘的内容任务补排一条发布复盘 workflow。",
                          entitySection: "workflow",
                        });
                        openControlCenterSection("workflow");
                      }}
                    >
                      自动排队复盘
                    </button>
                  ) : null}
                  {alert.entityId && alert.remediation === "governance_rewrite" ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        applyContentTaskGovernance({
                          contentTaskId: alert.entityId!,
                          recommendation: "rewrite",
                          status: "review",
                          detail: "从内容运营告警面板手动触发治理动作，已回退到 review 并建议改写。",
                          trigger: "manual",
                          queueWorkflow: true,
                        });
                        setActionFeedback({
                          title: "治理动作已应用",
                          detail: "内容任务已回退到 review，并自动排队了一条后续 workflow。",
                          entitySection: "workflow",
                        });
                        openControlCenterSection("workflow");
                      }}
                    >
                      应用治理动作
                    </button>
                  ) : null}
                  {alert.entityId && alert.remediation === "channel_governance" ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        applyContentChannelGovernance({
                          contentTaskId: alert.entityId!,
                          strategy: "prioritize_primary",
                          detail: "从内容运营告警面板应用渠道治理，已按推荐主发渠道重排目标并后移高风险渠道。",
                          trigger: "manual",
                        });
                        setActionFeedback({
                          title: "渠道治理已应用",
                          detail: "内容任务的发布目标已按推荐主发渠道重排，高风险渠道已后移。",
                          entitySection: "entities",
                        });
                        openControlCenterSection("entities");
                      }}
                    >
                      应用渠道治理
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">下一轮内容待办</div>
        <div className="control-center__dispatch-list">
          {nextCycleQueue.length === 0 ? (
            <div className="control-center__copy">当前还没有形成明确的下一轮内容建议。</div>
          ) : (
            nextCycleQueue.map(task => (
              <article key={task.id} className="control-center__dispatch-card">
                <div className="control-center__approval-head">
                  <div>
                    <div className="control-center__panel-title">{task.title}</div>
                    <div className="control-center__copy">
                      {task.channel} · {task.format} · {getNextCycleRecommendationLabel(task.nextCycleRecommendation!)}
                    </div>
                  </div>
                  <span className={`control-center__scenario-badge is-${getNextCycleRecommendationTone(task.nextCycleRecommendation!)}`}>
                    {getNextCycleRecommendationLabel(task.nextCycleRecommendation!)}
                  </span>
                </div>
                <div className="control-center__copy">
                  {task.latestPostmortemSummary ?? "复盘已完成，但还没有写出摘要。"}
                </div>
                <div className="control-center__dispatch-note">
                  渠道策略: 主发 {task.recommendedPrimaryChannel ?? task.channel}
                  {task.riskyChannels.length > 0 ? ` · 风险 ${task.riskyChannels.join(" / ")}` : " · 暂无高风险渠道"}
                </div>
                <div className="control-center__dispatch-note">
                  最近发布结果: {task.publishedResults[0]
                    ? `${task.publishedResults[0].channel}:${task.publishedResults[0].accountLabel} · ${task.publishedResults[0].status}${task.publishedResults[0].externalId ? ` · ${task.publishedResults[0].externalId}` : ""}`
                    : "暂无"}
                </div>
                <div className="control-center__quick-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const workflowRunId = continueContentTaskNextCycle({ contentTaskId: task.id, trigger: "manual" });
                      if (!workflowRunId) return;
                      setActionFeedback({
                        title: "已进入下一轮内容周期",
                        detail: `系统已按“${getNextCycleRecommendationLabel(task.nextCycleRecommendation!)}”建议推进内容任务，并沿用当前渠道治理策略接续下一轮 workflow。`,
                        entitySection: "workflow",
                      });
                      openControlCenterSection("workflow");
                    }}
                  >
                    进入下一轮 workflow
                  </button>
                  {task.channelGovernance.length > 0 ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        applyContentChannelGovernance({
                          contentTaskId: task.id,
                          strategy: "prioritize_primary",
                          detail: "从下一轮内容队列应用渠道治理，已按推荐主发渠道重排本轮发布目标。",
                          trigger: "manual",
                        });
                        setActionFeedback({
                          title: "已应用本轮渠道策略",
                          detail: "推荐主发渠道已同步到内容任务，下一轮 workflow 会沿用新的目标排序。",
                          entitySection: "entities",
                        });
                        openControlCenterSection("entities");
                      }}
                    >
                      同步渠道策略
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("entities")}>
                    查看内容实体
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">远程值守模式</div>
          <div className="control-center__mode-list">
            {([
              { id: "manual", label: "人工模式", hint: "只允许人工在聊天里手动下发任务" },
              { id: "supervised", label: "监督模式", hint: "允许自动化，但保留人工监督和随时接管" },
              { id: "autonomous", label: "自治模式", hint: "适合低风险重复工作，尽量自动推进" },
            ] satisfies Array<{ id: AutomationMode; label: string; hint: string }>).map(mode => (
              <button
                key={mode.id}
                type="button"
                className={`control-center__mode-card ${automationMode === mode.id ? "is-active" : ""}`}
                onClick={() => setAutomationMode(mode.id)}
              >
                <strong>{mode.label}</strong>
                <span>{mode.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">值守开关</div>
          <div className="control-center__toggle-list">
            <button
              type="button"
              className={`control-center__toggle-card ${automationPaused ? "is-alert" : "is-active"}`}
              onClick={() => setAutomationPaused(!automationPaused)}
            >
              <strong>{automationPaused ? "已暂停自动化" : "自动化运行中"}</strong>
              <span>暂停后会停止定时任务自动派发，便于手机端临时接管。</span>
            </button>
            <button
              type="button"
              className={`control-center__toggle-card ${remoteSupervisorEnabled ? "is-active" : ""}`}
              onClick={() => setRemoteSupervisorEnabled(!remoteSupervisorEnabled)}
            >
              <strong>{remoteSupervisorEnabled ? "远程值守开启" : "远程值守关闭"}</strong>
              <span>用于标记当前是否允许通过远程渠道继续监督和接管。</span>
            </button>
            <button
              type="button"
              className={`control-center__toggle-card ${autoDispatchScheduledTasks ? "is-active" : ""}`}
              onClick={() => setAutoDispatchScheduledTasks(!autoDispatchScheduledTasks)}
            >
              <strong>{autoDispatchScheduledTasks ? "定时任务自动派发开启" : "定时任务自动派发关闭"}</strong>
              <span>关闭后计划任务仍保留，但不会自动发起执行。</span>
            </button>
          </div>
        </div>
      </div>

      <div className="control-center__quick-actions">
        <button type="button" className="btn-ghost" onClick={() => reconnectWebSocket()}>
          重连远程通道
        </button>
        <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
          进入人工接管聊天
        </button>
        <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("execution")}>
          查看执行轨迹
        </button>
        <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("channels")}>
          打开执行与渠道面板
        </button>
      </div>

      {actionFeedback ? (
        <div
          className="control-center__panel"
          style={{
            background: "linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(255,255,255,0.03))",
            borderColor: "rgba(96, 165, 250, 0.24)",
          }}
        >
          <div className="control-center__panel-title">{actionFeedback.title}</div>
          <div className="control-center__copy">{actionFeedback.detail}</div>
          <div className="control-center__quick-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={() => scrollAuditSectionIntoView()}>
              查看审计记录
            </button>
            {actionFeedback.executionRunId ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => focusExecutionRun(actionFeedback.executionRunId)}
              >
                查看对应执行
              </button>
            ) : null}
            {actionFeedback.entitySection ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => openControlCenterSection(actionFeedback.entitySection!)}
              >
                打开相关面板
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => setActionFeedback(null)}>
              收起提示
            </button>
          </div>
        </div>
      ) : null}

      <div className="control-center__panel">
        <div className="control-center__panel-title">业务自动派发队列</div>
        <div className="control-center__list">
          <div>可自动派发: <strong className="control-center__strong">{entityReadyCount}</strong></div>
          <div>已阻断对象: <strong className="control-center__strong">{entityBlockedCount}</strong></div>
          <div>当前链路: <strong className="control-center__strong">{wsStatus === "connected" ? "在线" : wsStatus === "connecting" ? "连接中" : "离线"}</strong></div>
        </div>

        <div className="control-center__dispatch-list">
          {dispatchQueue.length === 0 ? (
            <div className="control-center__copy">当前项目还没有可进入业务自动化队列的对象。</div>
          ) : (
            dispatchQueue.map(item => {
              const badgeTone = item.canDispatch
                ? "ready"
                : item.approvalState === "pending"
                  ? "partial"
                  : "blocked";
              const badgeLabel = item.canDispatch
                ? "可派发"
                : item.approvalState === "pending"
                  ? "待审批"
                  : item.approvalState === "rejected"
                    ? "已驳回"
                    : "已阻断";
              const itemKey = `${item.entityType}-${item.entityId}`;
              const isDispatching = dispatchingKey === itemKey;

              return (
                <article key={itemKey} className="control-center__dispatch-card">
                  <div className="control-center__approval-head">
                    <div>
                      <div className="control-center__panel-title">{item.title}</div>
                      <div className="control-center__copy">{item.subtitle} · 风险分 {item.score}</div>
                    </div>
                    <span className={`control-center__scenario-badge is-${badgeTone}`}>
                      {badgeLabel}
                    </span>
                  </div>

                  <div className="control-center__copy">{item.summary}</div>
                  <div className="control-center__dispatch-meta">
                    <span>自动化判断: {item.decision.autoRunEligible ? "可推进" : "建议观察"}</span>
                    <span>审批状态: {item.approvalState === "not-required" ? "无需审批" : item.approvalState === "approved" ? "已批准" : item.approvalState === "rejected" ? "已驳回" : "待审批"}</span>
                  </div>
                  <div className="control-center__dispatch-meta">
                    <span>下一动作: {item.nextAction}</span>
                    <span>{item.requiresApproval ? "需要审批" : item.canAutoDispatch ? "可自动派发" : "建议人工判断"}</span>
                  </div>
                  <div className="control-center__dispatch-note">
                    {item.dispatchBlockedReason ?? "满足量化和审批条件，允许从远程运营面板直接派发执行。"}
                  </div>

                  <div className="control-center__quick-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={!item.canDispatch || isDispatching}
                      onClick={() => {
                        setDispatchingKey(itemKey);
                        const { ok, executionRunId } = sendExecutionDispatch({
                          instruction: item.instruction,
                          source: "remote-ops",
                          includeUserMessage: true,
                          taskDescription: item.taskDescription,
                          includeActiveProjectMemory: true,
                        });
                        recordBusinessOperation({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "dispatch",
                          trigger: "manual",
                          status: ok ? "sent" : "blocked",
                          title: item.title,
                          detail: ok
                            ? "人工从远程运营面板派发了该业务对象。"
                            : "人工尝试派发该业务对象，但发送链路未成功建立。",
                          executionRunId: ok ? executionRunId : undefined,
                        });
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "dispatch",
                          status: ok ? "sent" : "blocked",
                          executionRunId: ok ? executionRunId : undefined,
                        });
                        setActionFeedback({
                          title: ok ? "业务对象已进入执行链路" : "派发未成功建立",
                          detail: ok
                            ? "已写入审计日志，并把执行轨迹挂到了这次业务动作上。"
                            : "这次尝试已进入审计记录，方便回看是哪一步被阻断。",
                          executionRunId: ok ? executionRunId : undefined,
                          entitySection: ok ? "execution" : "channels",
                        });
                        if (ok && executionRunId) {
                          setActiveExecutionRun(executionRunId);
                        }
                        window.setTimeout(() => setDispatchingKey(current => (current === itemKey ? null : current)), 900);
                      }}
                    >
                      {isDispatching ? "派发中..." : "派发执行"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => focusExecutionRun(undefined)}
                    >
                      查看执行面板
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      去聊天页人工接管
                    </button>
                    {item.entityType === "contentTask" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          const workflowRunId = queueContentTaskWorkflowRun(item.entityId);
                          if (!workflowRunId) return;
                          setActionFeedback({
                            title: "内容 workflow 已排队",
                            detail: "系统已按内容任务当前阶段创建对应 workflow，并挂回该业务实体。",
                            entitySection: "workflow",
                          });
                          openControlCenterSection("workflow");
                        }}
                      >
                        创建内容 workflow
                      </button>
                    ) : null}
                    {item.entityType === "contentTask" && contentTaskMap[item.entityId]?.status === "scheduled" ? (
                      <>
                        <div className="scheduled-form__field" style={{ width: "100%" }}>
                          <label className="scheduled-form__label">发布目标账号</label>
                          <select
                            className="input scheduled-form__input"
                            value={publishTargetDrafts[item.entityId] ?? ""}
                            onChange={event =>
                              setPublishTargetDrafts(current => ({
                                ...current,
                                [item.entityId]: event.target.value,
                              }))
                            }
                          >
                            <option value="">默认第一个目标</option>
                            {(contentTaskMap[item.entityId]?.publishTargets ?? []).map(target => {
                              const key = `${target.channel}:${target.accountLabel}`;
                              return (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="scheduled-form__field" style={{ width: "100%" }}>
                          <label className="scheduled-form__label">发布链接 / 外部 ID</label>
                          <input
                            className="input scheduled-form__input"
                            value={publishLinkDrafts[item.entityId] ?? ""}
                            onChange={event =>
                              setPublishLinkDrafts(current => ({
                                ...current,
                                [item.entityId]: event.target.value,
                              }))
                            }
                            placeholder="https://... 或 平台返回的 post id"
                          />
                        </div>
                        <div className="scheduled-form__field" style={{ width: "100%" }}>
                          <label className="scheduled-form__label">外部发布 ID</label>
                          <input
                            className="input scheduled-form__input"
                            value={publishExternalIdDrafts[item.entityId] ?? ""}
                            onChange={event =>
                              setPublishExternalIdDrafts(current => ({
                                ...current,
                                [item.entityId]: event.target.value,
                              }))
                            }
                            placeholder="例如 tweet id / post id / message id"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            const publishLinks = splitPublishLinks(publishLinkDrafts[item.entityId]);
                            const selectedTarget = resolvePublishTarget(
                              contentTaskMap[item.entityId]?.publishTargets ?? [],
                              publishTargetDrafts[item.entityId],
                            );
                            recordContentPublishResult({
                              contentTaskId: item.entityId,
                              status: "completed",
                              detail: publishLinks.length > 0
                                ? `人工在远程值守面板确认该内容任务已完成发布回写，并录入了 ${publishLinks.length} 条链接/外部 ID。`
                                : "人工在远程值守面板确认该内容任务已完成发布回写。",
                              publishLinks,
                              channel: selectedTarget?.channel,
                              accountLabel: selectedTarget?.accountLabel,
                              externalId: publishExternalIdDrafts[item.entityId]?.trim() || undefined,
                              summary: "远程值守人工确认发布成功",
                            });
                            setPublishLinkDrafts(current => ({ ...current, [item.entityId]: "" }));
                            setPublishExternalIdDrafts(current => ({ ...current, [item.entityId]: "" }));
                            queueAuditFocus({
                              entityType: "contentTask",
                              entityId: item.entityId,
                              eventType: "publish",
                              status: "completed",
                            });
                            setActionFeedback({
                              title: "发布结果已回写",
                              detail: publishLinks.length > 0
                                ? "内容任务已进入 published 状态，发布链接已写回实体，并自动排队了一条发布复盘 workflow。"
                                : "内容任务已进入 published 状态，并自动排队了一条发布复盘 workflow。",
                              entitySection: "workflow",
                            });
                          }}
                        >
                          记录发布成功
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            const selectedTarget = resolvePublishTarget(
                              contentTaskMap[item.entityId]?.publishTargets ?? [],
                              publishTargetDrafts[item.entityId],
                            );
                            recordContentPublishResult({
                              contentTaskId: item.entityId,
                              status: "failed",
                              detail: "人工在远程值守面板记录了发布失败，建议回到聊天或 workflow 继续处理。",
                              channel: selectedTarget?.channel,
                              accountLabel: selectedTarget?.accountLabel,
                              externalId: publishExternalIdDrafts[item.entityId]?.trim() || undefined,
                              summary: "远程值守人工记录发布失败",
                              failureReason: "需要人工重试或调整发布内容",
                            });
                            setPublishExternalIdDrafts(current => ({ ...current, [item.entityId]: "" }));
                            queueAuditFocus({
                              entityType: "contentTask",
                              entityId: item.entityId,
                              eventType: "publish",
                              status: "failed",
                            });
                            setActionFeedback({
                              title: "发布失败已记录",
                              detail: "审计链路已保留失败原因，内容任务仍可回到聊天或 workflow 继续补救。",
                              entitySection: "workflow",
                            });
                          }}
                        >
                          记录发布失败
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">审批队列</div>
        <div className="control-center__list">
          <div>待审批: <strong className="control-center__strong">{pendingApprovals}</strong></div>
          <div>已批准: <strong className="control-center__strong">{approvedApprovals}</strong></div>
          <div>已驳回: <strong className="control-center__strong">{rejectedApprovals}</strong></div>
        </div>

        <div className="control-center__approval-list">
          {approvalQueue.length === 0 ? (
            <div className="control-center__copy">当前项目还没有需要人工审批的业务对象。</div>
          ) : (
            approvalQueue.map(item => {
              const status = item.approvalState === "not-required" ? "pending" : item.approvalState;
              const linkedContentTask = item.entityType === "contentTask" ? contentTaskMap[item.entityId] : undefined;
              const shouldPromoteToScheduled = linkedContentTask?.status === "review";
              const shouldQueuePublishWorkflow = linkedContentTask?.status === "scheduled" || shouldPromoteToScheduled;
              return (
                <article key={`${item.entityType}-${item.entityId}`} className="control-center__approval-card">
                  <div className="control-center__approval-head">
                    <div>
                      <div className="control-center__panel-title">{item.title}</div>
                      <div className="control-center__copy">{item.subtitle} · 风险分 {item.score}</div>
                    </div>
                    <span className={`control-center__scenario-badge is-${status === "approved" ? "ready" : status === "rejected" ? "blocked" : "partial"}`}>
                      {status === "approved" ? "已批准" : status === "rejected" ? "已驳回" : "待审批"}
                    </span>
                  </div>
                  <div className="control-center__copy">{item.summary}</div>
                  <div className="control-center__quick-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setBusinessApprovalDecision({ entityType: item.entityType, entityId: item.entityId, status: "approved" });
                        if (shouldPromoteToScheduled) {
                          updateBusinessContentTask(item.entityId, {
                            status: "scheduled",
                            lastOperationAt: Date.now(),
                          });
                        }
                        if (shouldQueuePublishWorkflow) {
                          queueContentTaskWorkflowRun(item.entityId);
                        }
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "approval",
                          status: "approved",
                        });
                        setActionFeedback({
                          title: shouldQueuePublishWorkflow ? "审批已批准并继续发布准备" : "审批已批准",
                          detail: shouldPromoteToScheduled
                            ? "系统已保留批准记录，把内容任务推进到 scheduled，并自动排队发布准备 workflow。"
                            : shouldQueuePublishWorkflow
                              ? "系统已保留批准记录，并为这条内容任务继续排队发布准备 workflow。"
                            : "这条业务对象已进入可自动推进状态，审计区会保留这次批准记录。",
                          entitySection: shouldQueuePublishWorkflow ? "workflow" : "execution",
                        });
                      }}
                    >
                      {shouldQueuePublishWorkflow ? "批准并继续发布" : "批准"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setBusinessApprovalDecision({ entityType: item.entityType, entityId: item.entityId, status: "rejected" });
                        if (linkedContentTask?.status === "scheduled") {
                          updateBusinessContentTask(item.entityId, { status: "review" });
                        }
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "approval",
                          status: "rejected",
                        });
                        setActionFeedback({
                          title: linkedContentTask?.status === "scheduled" ? "已驳回并退回定稿" : "审批已驳回",
                          detail: linkedContentTask?.status === "scheduled"
                            ? "系统已把这条内容任务退回 review，方便继续打磨定稿后再次进入发布链路。"
                            : "这次驳回会保留在审计记录里，后续可以回到业务实体面板继续调整。",
                          entitySection: "entities",
                        });
                      }}
                    >
                      {linkedContentTask?.status === "scheduled" ? "驳回并退回定稿" : "驳回"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setBusinessApprovalDecision({ entityType: item.entityType, entityId: item.entityId, status: "pending" });
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "approval",
                          status: "pending",
                        });
                        setActionFeedback({
                          title: "审批已重新打开",
                          detail: "系统已恢复待确认状态，审计记录会显示这次重新打开动作。",
                          entitySection: "entities",
                        });
                      }}
                    >
                      重新打开
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("entities")}>
                      去业务实体面板
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="control-center__panel" ref={auditSectionRef}>
        <div className="control-center__panel-title">业务审计记录</div>
        <div className="control-center__list">
          <div>最近记录: <strong className="control-center__strong">{recentOperationLogs.length}</strong></div>
          <div>人工动作会记录审批与派发，自动值守会记录自动派发。</div>
        </div>

        <div className="control-center__dispatch-list">
          {recentOperationLogs.length === 0 ? (
            <div className="control-center__copy">当前项目还没有业务审计记录。</div>
          ) : (
            recentOperationLogs.map(log => {
              const isHighlighted = log.id === highlightedAuditLogId;
              return (
                <article
                  key={log.id}
                  className="control-center__dispatch-card"
                  style={isHighlighted ? {
                    borderColor: "rgba(96, 165, 250, 0.38)",
                    background: "linear-gradient(135deg, rgba(96, 165, 250, 0.16), rgba(255,255,255,0.04))",
                    boxShadow: "0 0 0 1px rgba(96, 165, 250, 0.14) inset",
                  } : undefined}
                >
                  <div className="control-center__approval-head">
                    <div>
                      <div className="control-center__panel-title">{log.title}</div>
                      <div className="control-center__copy">
                        {getAuditEventLabel(log.eventType)} · {log.trigger === "auto" ? "自动值守" : "人工操作"}
                        {isHighlighted ? " · 最新定位" : ""}
                      </div>
                    </div>
                    <span className={`control-center__scenario-badge is-${getAuditStatusTone(log.status)}`}>
                      {getAuditStatusLabel(log.status)}
                    </span>
                  </div>
                  <div className="control-center__dispatch-note">{log.detail}</div>
                  <div className="control-center__quick-actions">
                    {log.executionRunId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => focusExecutionRun(log.executionRunId)}
                      >
                        查看对应执行
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openControlCenterSection("entities")}
                    >
                      去业务实体面板
                    </button>
                    {isHighlighted ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setHighlightedAuditLogId(null)}
                      >
                        取消高亮
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">这项目现在能做什么</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 通过 WebSocket + 渠道配置把任务派发进来，形成远程控制入口。</div>
            <div>2. 用执行 run、活动流、会议总结、项目记忆来监督数字员工过程，而不只是看最终结果。</div>
            <div>3. 用定时任务和工作流模板让一部分动作自动触发，适合做半自动运营。</div>
            <div>4. 用项目作用域把会话、工作区、记忆、执行历史绑定到具体项目，避免上下文串台。</div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">为什么还不能算完全合格</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 缺正式的手机端登录、权限和多用户协同，当前更像控制台而不是完整 SaaS。</div>
            <div>2. 缺渠道稳定性闭环：连接回执、失败重试、离线补偿、消息队列和任务 SLA 还不完整。</div>
            <div>3. 缺真正业务适配器，比如 CRM、社媒发布、客服工单、销售漏斗，而不只是通用指令分发。</div>
            <div>4. 缺审计与治理：谁批准、谁发送、谁回滚、谁接管，目前监督面板有了，但制度层还弱。</div>
          </div>
        </div>
      </div>

      <div className="control-center__scenario-grid">
        {scenarioCards.map(card => (
          <article key={card.title} className={`control-center__scenario control-center__scenario--${card.tone}`}>
            <div className="control-center__scenario-head">
              <div>
                <div className="control-center__panel-title">{card.title}</div>
                <div className="control-center__copy">{card.description}</div>
              </div>
              <span className={`control-center__scenario-badge is-${card.tone}`}>{card.label}</span>
            </div>
            <div className="control-center__scenario-checks">
              <ScenarioCheck label="远程入口" passed={card.checks.channels} />
              <ScenarioCheck label="监督追踪" passed={card.checks.supervision} />
              <ScenarioCheck label="业务记忆" passed={card.checks.memory} />
            </div>
            <div className="control-center__copy">{card.missingMessage}</div>
          </article>
        ))}
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">当前监督视图</div>
          <div className="control-center__list">
            <div>运行中任务: <strong className="control-center__strong">{activeRuns}</strong></div>
            <div>最近完成: <strong className="control-center__strong">{completedRuns}</strong></div>
            <div>最近失败: <strong className="control-center__strong">{failedRuns}</strong></div>
            <div>项目记忆: <strong className="control-center__strong">{scopedMemories.length}</strong></div>
            <div>Desk Notes: <strong className="control-center__strong">{scopedDeskNotes.length}</strong></div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">最值得继续补的 4 层</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 手机端真实控制入口：登录、消息通知、审批、接管、暂停。</div>
            <div>2. 业务连接器：客服渠道、CRM、社媒发布器、工单和线索状态同步。</div>
            <div>3. 后台稳定性：任务队列、失败重试、幂等、回执、告警。</div>
            <div>4. 组织治理：多租户、角色权限、审计日志、人工接管和交付标准。</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioCheck({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className={`control-center__scenario-check ${passed ? "is-passed" : "is-missing"}`}>
      <span>{passed ? "已具备" : "缺失"}</span>
      <strong>{label}</strong>
    </div>
  );
}

function buildScenarioCard({
  title,
  description,
  checks,
  missingMessage,
}: {
  title: string;
  description: string;
  checks: Record<string, boolean>;
  missingMessage: string;
}) {
  const passedCount = Object.values(checks).filter(Boolean).length;
  if (passedCount === 3) {
    return { title, description, checks, missingMessage, tone: "ready" as const, label: "可试运行" };
  }
  if (passedCount >= 1) {
    return { title, description, checks, missingMessage, tone: "partial" as const, label: "半成品" };
  }
  return { title, description, checks, missingMessage, tone: "blocked" as const, label: "未就绪" };
}

function getAuditEventLabel(eventType: BusinessOperationRecord["eventType"]) {
  switch (eventType) {
    case "approval":
      return "审批";
    case "workflow":
      return "Workflow";
    case "publish":
      return "发布回写";
    case "governance":
      return "治理动作";
    default:
      return "派发";
  }
}

function getAuditStatusTone(status: BusinessOperationRecord["status"]) {
  if (status === "approved" || status === "sent" || status === "completed") {
    return "ready";
  }
  if (status === "pending") {
    return "partial";
  }
  return "blocked";
}

function getAuditStatusLabel(status: BusinessOperationRecord["status"]) {
  switch (status) {
    case "approved":
      return "已批准";
    case "rejected":
      return "已驳回";
    case "sent":
      return "已派发";
    case "completed":
      return "已完成";
    case "failed":
      return "已失败";
    case "pending":
      return "待处理";
    default:
      return "已阻断";
  }
}

function splitPublishLinks(value: string | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n|,|\s+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function resolvePublishTarget(
  targets: Array<{ channel: "x" | "telegram" | "line" | "feishu" | "wecom" | "blog"; accountLabel: string }>,
  encodedTarget?: string,
) {
  if (!encodedTarget) return targets[0];
  return targets.find(target => `${target.channel}:${target.accountLabel}` === encodedTarget) ?? targets[0];
}

function getNextCycleRecommendationLabel(value: "reuse" | "retry" | "rewrite") {
  switch (value) {
    case "reuse":
      return "待复用";
    case "retry":
      return "待重发";
    default:
      return "待改写";
  }
}

function getNextCycleRecommendationTone(value: "reuse" | "retry" | "rewrite") {
  switch (value) {
    case "reuse":
      return "ready";
    case "retry":
      return "partial";
    default:
      return "blocked";
  }
}

function getContentAlertTone(value: "critical" | "warning" | "info") {
  switch (value) {
    case "critical":
      return "blocked";
    case "warning":
      return "partial";
    default:
      return "ready";
  }
}

function getContentAlertLabel(value: "critical" | "warning" | "info") {
  switch (value) {
    case "critical":
      return "高风险";
    case "warning":
      return "需关注";
    default:
      return "提示";
  }
}
