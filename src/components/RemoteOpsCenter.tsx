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
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
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
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "approval",
                          status: "approved",
                        });
                        setActionFeedback({
                          title: "审批已批准",
                          detail: "这条业务对象已进入可自动推进状态，审计区会保留这次批准记录。",
                          entitySection: "execution",
                        });
                      }}
                    >
                      批准
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setBusinessApprovalDecision({ entityType: item.entityType, entityId: item.entityId, status: "rejected" });
                        queueAuditFocus({
                          entityType: item.entityType,
                          entityId: item.entityId,
                          eventType: "approval",
                          status: "rejected",
                        });
                        setActionFeedback({
                          title: "审批已驳回",
                          detail: "这次驳回会保留在审计记录里，后续可以回到业务实体面板继续调整。",
                          entitySection: "entities",
                        });
                      }}
                    >
                      驳回
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
                        {log.eventType === "approval" ? "审批" : "派发"} · {log.trigger === "auto" ? "自动值守" : "人工操作"}
                        {isHighlighted ? " · 最新定位" : ""}
                      </div>
                    </div>
                    <span className={`control-center__scenario-badge is-${log.status === "approved" || log.status === "sent" ? "ready" : log.status === "pending" ? "partial" : "blocked"}`}>
                      {log.status === "approved"
                        ? "已批准"
                        : log.status === "rejected"
                          ? "已驳回"
                          : log.status === "sent"
                            ? "已派发"
                            : log.status === "pending"
                              ? "待处理"
                              : "已阻断"}
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
