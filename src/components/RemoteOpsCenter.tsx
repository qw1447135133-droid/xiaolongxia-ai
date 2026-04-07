"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { getProjectContentChannelSummaries } from "@/lib/content-governance";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { isPlatformOperationalStatus } from "@/lib/platform-connectors";
import { useStore } from "@/store";
import {
  buildBusinessAutomationQueue,
  decorateBusinessDispatchQueue,
} from "@/lib/business-operations";
import { getScheduledTasks, type ScheduledTask } from "@/lib/scheduled-tasks";
import {
  getChannelSessionNextAction,
  getChannelSessionRecentAction,
  getChannelSessionStateLabel,
  shouldSuggestDesktopTakeover,
} from "@/lib/channel-session-presentation";
import {
  filterByProjectScope,
  getRunProjectScopeKey,
  getSessionProjectScope,
} from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES, type AutomationMode, type ControlCenterSectionId, PLATFORM_DEFINITIONS } from "@/store/types";
import type { BusinessChannelSession, BusinessOperationRecord } from "@/types/business-entities";
import { LaunchReadinessPanel } from "./LaunchReadinessPanel";

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
  auditFocusRequest?: AuditFocusRequest;
  contentTaskId?: string;
  workflowRunId?: string;
};

function formatRemoteTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

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
  const applyContentTaskApprovalDecision = useStore(s => s.applyContentTaskApprovalDecision);
  const queueContentTaskWorkflowRun = useStore(s => s.queueContentTaskWorkflowRun);
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
  const recordContentPublishResult = useStore(s => s.recordContentPublishResult);
  const applyContentTaskGovernance = useStore(s => s.applyContentTaskGovernance);
  const continueContentTaskNextCycle = useStore(s => s.continueContentTaskNextCycle);
  const applyContentChannelGovernance = useStore(s => s.applyContentChannelGovernance);
  const enforceManualApprovalForContentTasks = useStore(s => s.enforceManualApprovalForContentTasks);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const focusWorkflowRun = useStore(s => s.focusWorkflowRun);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const setCommandDraft = useStore(s => s.setCommandDraft);
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

  const handoffChannelSessionToChat = (session: BusinessChannelSession) => {
    const linkedRun = session.lastExecutionRunId
      ? executionRuns.find(run => run.id === session.lastExecutionRunId) ?? null
      : null;
    setActiveChatSession(activeSessionId);
    setCommandDraft(
      linkedRun
        ? `继续接管这条渠道会话，并先处理失败或待人工节点：\n${linkedRun.instruction}`
        : `继续接管这条渠道会话，并先回复用户当前问题：\n会话标题：${session.title}\n会话摘要：${session.summary}\n最近消息：${session.lastMessagePreview ?? "无"}`,
    );
    setTab("tasks");
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
    () => PLATFORM_DEFINITIONS.filter(def => isPlatformOperationalStatus(platformConfigs[def.id]?.status ?? "idle")),
    [platformConfigs],
  );
  const connectorAttentionCount = useMemo(
    () =>
      enabledPlatforms.filter(def => {
        const status = platformConfigs[def.id]?.status ?? "idle";
        return !isPlatformOperationalStatus(status) && status !== "configured" && status !== "syncing";
      }).length,
    [enabledPlatforms, platformConfigs],
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
  const contentApprovalStateMap = useMemo(
    () =>
      new Map(
        scopedApprovals
          .filter(item => item.entityType === "contentTask")
          .map(item => [item.entityId, item.status] as const),
      ),
    [scopedApprovals],
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
  const channelSessionWatchQueue = useMemo(
    () =>
      [...scopedChannelSessions]
        .sort((left, right) => {
          const leftPriority = left.lastDeliveryStatus === "failed" ? 3 : left.status === "waiting" ? 2 : left.requiresReply || (left.unreadCount ?? 0) > 0 ? 1 : 0;
          const rightPriority = right.lastDeliveryStatus === "failed" ? 3 : right.status === "waiting" ? 2 : right.requiresReply || (right.unreadCount ?? 0) > 0 ? 1 : 0;
          if (leftPriority !== rightPriority) return rightPriority - leftPriority;
          return right.lastMessageAt - left.lastMessageAt;
        })
        .slice(0, 6),
    [scopedChannelSessions],
  );
  const workflowRunMap = useMemo(
    () => Object.fromEntries(workflowRuns.map(run => [run.id, run])),
    [workflowRuns],
  );

  const verificationReadyRuns = recentProjectRuns.filter(
    run => run.verificationStatus === "passed" || run.verificationStatus === "failed",
  ).length;
  const completedRuns = recentProjectRuns.filter(run => run.status === "completed").length;
  const failedRuns = recentProjectRuns.filter(run => run.status === "failed").length;
  const activeRuns = recentProjectRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
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
  const latestApprovalLogByContentTask = useMemo(() => {
    const map = new Map<string, BusinessOperationRecord>();
    for (const log of scopedOperationLogs) {
      if (log.entityType === "contentTask" && log.eventType === "approval" && !map.has(log.entityId)) {
        map.set(log.entityId, log);
      }
    }
    return map;
  }, [scopedOperationLogs]);
  const recentExecutionCards = useMemo(
    () =>
      recentProjectRuns.slice(0, 6).map(run => {
        const linkedWorkflowRun = run.workflowRunId ? workflowRunMap[run.workflowRunId] ?? null : null;
        const linkedContentTask = run.entityType === "contentTask" && run.entityId
          ? contentTaskMap[run.entityId] ?? null
          : null;
        const approvalState = linkedContentTask ? contentApprovalStateMap.get(linkedContentTask.id) : undefined;
        const latestRelatedLog = scopedOperationLogs.find(log =>
          (log.executionRunId && log.executionRunId === run.id)
          || (
            run.entityType
            && run.entityId
            && log.entityType === run.entityType
            && log.entityId === run.entityId
          ),
        ) ?? null;

        return {
          run,
          linkedWorkflowRun,
          linkedContentTask,
          approvalState,
          latestApprovalLog: linkedContentTask ? latestApprovalLogByContentTask.get(linkedContentTask.id) ?? null : null,
          latestRelatedLog,
        };
      }),
    [contentApprovalStateMap, contentTaskMap, latestApprovalLogByContentTask, recentProjectRuns, scopedOperationLogs, workflowRunMap],
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
  const projectChannelBoard = useMemo(
    () => getProjectContentChannelSummaries(scopedContentTasks).slice(0, 8),
    [scopedContentTasks],
  );
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
      title: "自动客服回复",
      description: "渠道消息进入后自动建会话、自动生成回复，并把处理轨迹挂到执行与审计里。",
      checks: {
        channels: connectedPlatforms.length > 0 && scopedChannelSessions.length > 0,
        supervision: recentProjectRuns.length > 0 && recentOperationLogs.length > 0,
        memory: scopedMemories.length > 0 || scopedDeskNotes.length > 0,
      },
      missingMessage: scopedChannelSessions.length === 0
        ? "还没有真实或模拟入站会话，建议先从平台设置注入一条模拟入站。"
        : "当前已经能演示自动接待主链，下一步重点是补更强的失败重试和离线补偿。",
      playbook: [
        "先在平台设置里发送测试消息或模拟入站。",
        "回到渠道/远程值守页展示会话进入“待回复”。",
        "查看对应执行与审计，讲清自动回复是如何被追踪的。",
      ],
    }),
    buildScenarioCard({
      title: "低置信度转人工",
      description: "当会话进入 waiting、待审批或上下文不足时，系统应停在人工边界，并保留回聊天继续的入口。",
      checks: {
        channels: scopedChannelSessions.some(session => session.status === "waiting" || session.requiresReply),
        supervision: recentExecutionCards.some(item => item.run.recoveryState === "manual-required" || item.run.recoveryState === "blocked"),
        memory: true,
      },
      missingMessage: scopedChannelSessions.some(session => session.status === "waiting" || session.requiresReply)
        ? "当前已经能演示转人工和回聊天接管，后面再把审批和SLA提醒做得更硬一些。"
        : "当前缺少明显的待人工会话，建议用 demo 种子或模拟入站制造一条 waiting 场景。",
      playbook: [
        "打开值守队列，展示 waiting 会话与“下一步: 回聊天接管”。",
        "点击回聊天接管，让草稿或恢复指令进入聊天输入框。",
        "说明这一类消息默认停在人工边界，不会直接外发。",
      ],
    }),
    buildScenarioCard({
      title: "桌面端接管后续跑",
      description: "回复失败或桌面验证节点出现时，切到桌面接管，再从原执行链路继续往下跑。",
      checks: {
        channels: scopedChannelSessions.some(session => shouldSuggestDesktopTakeover(session)),
        supervision: recentProjectRuns.some(run => run.recoveryState === "manual-required" || run.recoveryState === "retryable"),
        memory: true,
      },
      missingMessage: scopedChannelSessions.some(session => shouldSuggestDesktopTakeover(session))
        ? "当前已能讲清楚桌面接管与续跑闭环，下一步主要是补更多客户端预设与动作证据链。"
        : "当前没有明显的失败发送或桌面阻断案例，建议用 demo 种子里的失败会话来演示。",
      playbook: [
        "选中发送失败会话，展示“去桌面接管”和失败原因。",
        "跳到桌面控制台或执行中心，说明人工验证后可继续执行。",
        "再回到执行/审计页，讲清楚恢复链路没有丢上下文。",
      ],
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

  const compactApprovalQueue = approvalQueue.slice(0, 3);
  const compactSessionQueue = channelSessionWatchQueue.slice(0, 3);
  const compactExecutionQueue = recentExecutionCards.slice(0, 3);
  const automationModePresets: Record<
    AutomationMode,
    {
      remoteSupervisorEnabled: boolean;
      automationPaused: boolean;
      autoDispatchScheduledTasks: boolean;
    }
  > = {
    manual: {
      remoteSupervisorEnabled: false,
      automationPaused: true,
      autoDispatchScheduledTasks: false,
    },
    supervised: {
      remoteSupervisorEnabled: true,
      automationPaused: false,
      autoDispatchScheduledTasks: false,
    },
    autonomous: {
      remoteSupervisorEnabled: true,
      automationPaused: false,
      autoDispatchScheduledTasks: true,
    },
  };

  return (
    <div
      className="control-center"
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        gridTemplateRows: "auto auto minmax(0, 1fr)",
      }}
    >
      <div
        className="control-center__panel"
        style={{
          padding: 16,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div className="control-center__eyebrow">Remote Ops</div>
            <div className="control-center__hero-title" style={{ marginTop: 0 }}>
              远程值守总览
            </div>
          </div>
          <div className="control-center__quick-actions" style={{ gap: 8 }}>
            {wsStatus !== "connected" ? (
              <button type="button" className="btn-ghost" onClick={() => reconnectWebSocket()}>
                重连通道
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
              人工接管
            </button>
          </div>
        </div>

        <div
          className="control-center__stats"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          }}
        >
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">运行中</div>
            <div className="control-center__stat-value" style={{ color: "#f59e0b" }}>{activeRuns}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">待审批</div>
            <div className="control-center__stat-value" style={{ color: "#ef4444" }}>{pendingApprovals}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">待值守会话</div>
            <div className="control-center__stat-value" style={{ color: "#2563eb" }}>{channelSessionWatchQueue.length}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">最近失败</div>
            <div className="control-center__stat-value" style={{ color: "#fb7185" }}>{failedRuns}</div>
          </div>
        </div>

        <div
          className="control-center__columns"
          style={{
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: 10,
          }}
        >
          <div className="control-center__quick-actions" style={{ gap: 8 }}>
            {([
              { id: "manual", label: "人工" },
              { id: "supervised", label: "监督" },
              { id: "autonomous", label: "自治" },
            ] satisfies Array<{ id: AutomationMode; label: string }>).map(mode => (
              <button
                key={mode.id}
                type="button"
                className={automationMode === mode.id ? "btn-primary" : "btn-ghost"}
                onClick={() => {
                  const preset = automationModePresets[mode.id];
                  setAutomationMode(mode.id);
                  setRemoteSupervisorEnabled(preset.remoteSupervisorEnabled);
                  setAutomationPaused(preset.automationPaused);
                  setAutoDispatchScheduledTasks(preset.autoDispatchScheduledTasks);
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="control-center__quick-actions" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              className={remoteSupervisorEnabled ? "btn-primary" : "btn-ghost"}
              disabled
              aria-disabled="true"
              style={{ cursor: "default", pointerEvents: "none" }}
            >
              {remoteSupervisorEnabled ? "值守已开" : "值守关闭"}
            </button>
            <button
              type="button"
              className={automationPaused ? "btn-ghost" : "btn-primary"}
              disabled
              aria-disabled="true"
              style={{ cursor: "default", pointerEvents: "none" }}
            >
              {automationPaused ? "已暂停" : "自动化运行"}
            </button>
            <button
              type="button"
              className={autoDispatchScheduledTasks ? "btn-primary" : "btn-ghost"}
              disabled
              aria-disabled="true"
              style={{ cursor: "default", pointerEvents: "none" }}
            >
              {autoDispatchScheduledTasks ? "计划自动派发" : "计划不自动派发"}
            </button>
          </div>
        </div>
      </div>

      {actionFeedback ? (
        <div
          className="control-center__panel"
          style={{
            padding: "12px 16px",
            background: "linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(255,255,255,0.03))",
            borderColor: "rgba(96, 165, 250, 0.24)",
          }}
        >
          <div className="control-center__panel-title">{actionFeedback.title}</div>
          <div className="control-center__copy" style={{ marginTop: 4 }}>{actionFeedback.detail}</div>
        </div>
      ) : null}

      <div
        className="control-center__columns"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        <div className="control-center__panel" style={{ minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <div>
            <div className="control-center__panel-title">审批队列</div>
            <div className="control-center__copy" style={{ marginTop: 4 }}>只保留最需要处理的审批对象。</div>
          </div>
          <div className="control-center__approval-list" style={{ minHeight: 0, overflow: "auto" }}>
            {compactApprovalQueue.length === 0 ? (
              <div className="control-center__copy">当前没有待处理审批。</div>
            ) : (
              compactApprovalQueue.map(item => {
                const linkedContentTask = item.entityType === "contentTask" ? contentTaskMap[item.entityId] : undefined;
                const shouldQueuePublishWorkflow = linkedContentTask?.status === "scheduled" || linkedContentTask?.status === "review";
                return (
                  <article key={`${item.entityType}-${item.entityId}`} className="control-center__approval-card">
                    <div className="control-center__approval-head">
                      <div>
                        <div className="control-center__panel-title">{item.title}</div>
                        <div className="control-center__copy">{item.subtitle}</div>
                      </div>
                      <span className="control-center__scenario-badge is-partial">待审批</span>
                    </div>
                    <div className="control-center__dispatch-note">{item.nextAction}</div>
                    <div className="control-center__quick-actions" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          const outcome = applyContentTaskApprovalDecision({
                            contentTaskId: item.entityId,
                            decision: "approved",
                          });
                          if (!outcome) return;
                          setActionFeedback({
                            title: outcome.title,
                            detail: outcome.detail,
                            entitySection: shouldQueuePublishWorkflow ? "workflow" : "execution",
                          });
                        }}
                      >
                        {shouldQueuePublishWorkflow ? "批准并继续" : "批准"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          const outcome = applyContentTaskApprovalDecision({
                            contentTaskId: item.entityId,
                            decision: "rejected",
                          });
                          if (!outcome) return;
                          setActionFeedback({
                            title: outcome.title,
                            detail: outcome.detail,
                            entitySection: "entities",
                          });
                        }}
                      >
                        驳回
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="control-center__panel" style={{ minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <div>
            <div className="control-center__panel-title">会话值守</div>
            <div className="control-center__copy" style={{ marginTop: 4 }}>优先关注待回复、失败和需要接管的会话。</div>
          </div>
          <div className="control-center__dispatch-list" style={{ minHeight: 0, overflow: "auto" }}>
            {compactSessionQueue.length === 0 ? (
              <div className="control-center__copy">当前没有需要值守的会话。</div>
            ) : (
              compactSessionQueue.map(session => {
                const stateLabel = getChannelSessionStateLabel(session);
                const nextAction = getChannelSessionNextAction(session);
                const needsDesktopTakeover = shouldSuggestDesktopTakeover(session);
                const linkedRun = session.lastExecutionRunId
                  ? executionRuns.find(run => run.id === session.lastExecutionRunId) ?? null
                  : null;

                return (
                  <article key={session.id} className="control-center__dispatch-card">
                    <div className="control-center__approval-head">
                      <div>
                        <div className="control-center__panel-title">{session.title}</div>
                        <div className="control-center__copy">{session.channel} · {session.accountLabel ?? "默认账号"}</div>
                      </div>
                      <span className={`control-center__scenario-badge is-${session.lastDeliveryStatus === "failed" ? "blocked" : stateLabel === "已处理" ? "ready" : "partial"}`}>
                        {stateLabel}
                      </span>
                    </div>
                    <div className="control-center__dispatch-note">{session.lastMessagePreview ?? session.summary}</div>
                    <div className="control-center__dispatch-meta">
                      <span>下一步: {nextAction}</span>
                      <span>{formatRemoteTimestamp(session.lastMessageAt)}</span>
                    </div>
                    <div className="control-center__quick-actions" style={{ gap: 8 }}>
                      <button type="button" className="btn-primary" onClick={() => handoffChannelSessionToChat(session)}>
                        聊天接管
                      </button>
                      {linkedRun ? (
                        <button type="button" className="btn-ghost" onClick={() => focusExecutionRun(linkedRun.id)}>
                          查看执行
                        </button>
                      ) : null}
                      {needsDesktopTakeover ? (
                        <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("desktop")}>
                          桌面接管
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="control-center__panel" style={{ minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
          <div>
            <div className="control-center__panel-title">最近执行</div>
            <div className="control-center__copy" style={{ marginTop: 4 }}>只看最近执行链路和恢复入口。</div>
          </div>
          <div className="control-center__dispatch-list" style={{ minHeight: 0, overflow: "auto" }}>
            {compactExecutionQueue.length === 0 ? (
              <div className="control-center__copy">当前项目还没有最近执行记录。</div>
            ) : (
              compactExecutionQueue.map(({ run, linkedWorkflowRun, linkedContentTask }) => (
                <article key={run.id} className="control-center__dispatch-card">
                  <div className="control-center__approval-head">
                    <div>
                      <div className="control-center__panel-title">
                        {linkedContentTask?.title ?? linkedWorkflowRun?.title ?? (run.instruction.slice(0, 48) || run.id)}
                      </div>
                      <div className="control-center__copy">{formatRemoteTimestamp(run.updatedAt)} · {run.source}</div>
                    </div>
                    <span className={`control-center__scenario-badge is-${getExecutionRunTone(run.status)}`}>
                      {getExecutionRunLabel(run.status)}
                    </span>
                  </div>
                  <div className="control-center__dispatch-note">
                    {linkedContentTask
                      ? `当前内容状态: ${linkedContentTask.status}`
                      : run.instruction.slice(0, 110)}
                  </div>
                  <div className="control-center__quick-actions" style={{ gap: 8 }}>
                    <button type="button" className="btn-primary" onClick={() => focusExecutionRun(run.id)}>
                      查看执行
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      聊天续跑
                    </button>
                    {run.workflowRunId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          focusWorkflowRun(run.workflowRunId!);
                          openControlCenterSection("workflow");
                        }}
                      >
                        Workflow
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildScenarioCard({
  title,
  description,
  checks,
  missingMessage,
  playbook,
}: {
  title: string;
  description: string;
  checks: Record<string, boolean>;
  missingMessage: string;
  playbook: string[];
}) {
  const passedCount = Object.values(checks).filter(Boolean).length;
  if (passedCount === 3) {
    return { title, description, checks, missingMessage, playbook, tone: "ready" as const, label: "可试运行" };
  }
  if (passedCount >= 1) {
    return { title, description, checks, missingMessage, playbook, tone: "partial" as const, label: "半成品" };
  }
  return { title, description, checks, missingMessage, playbook, tone: "blocked" as const, label: "未就绪" };
}

function getAuditEventLabel(eventType: BusinessOperationRecord["eventType"]) {
  switch (eventType) {
    case "approval":
      return "审批";
    case "connector":
      return "连接器";
    case "desktop":
      return "桌面动作";
    case "message":
      return "消息";
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

function getExecutionRunTone(status: "queued" | "analyzing" | "running" | "completed" | "failed") {
  if (status === "completed") return "ready";
  if (status === "queued" || status === "analyzing" || status === "running") return "partial";
  return "blocked";
}

function getExecutionRunLabel(status: "queued" | "analyzing" | "running" | "completed" | "failed") {
  switch (status) {
    case "queued":
      return "排队中";
    case "analyzing":
      return "分析中";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    default:
      return "已失败";
  }
}

function getVerificationStatusTone(status: "idle" | "pending" | "running" | "passed" | "failed" | "skipped") {
  if (status === "passed") return "ready";
  if (status === "idle" || status === "pending" || status === "running") return "partial";
  return "blocked";
}

function getVerificationStatusLabel(status: "idle" | "pending" | "running" | "passed" | "failed" | "skipped") {
  switch (status) {
    case "idle":
      return "未验证";
    case "pending":
      return "待验证";
    case "running":
      return "验证中";
    case "passed":
      return "已验证";
    case "skipped":
      return "已跳过";
    default:
      return "验证失败";
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
