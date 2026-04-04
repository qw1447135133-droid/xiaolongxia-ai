"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWebSocket, sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import {
  filterByProjectScope,
  getRunProjectScopeKey,
  getSessionProjectLabel,
} from "@/lib/project-context";
import {
  buildBusinessAutomationQueue,
  decorateBusinessDispatchQueue,
  pickNextAutoDispatchItem,
  type BusinessAutomationQueueItem,
} from "@/lib/business-operations";
import { checkAndExecuteTasks } from "@/lib/scheduled-tasks";
import { ChatSessionsPanel } from "@/components/ChatSessionsPanel";
import { TaskPipeline } from "@/components/TaskPipeline";
import { ActivityPanel } from "@/components/ActivityPanel";
import { CommandInput } from "@/components/CommandInput";
import { PresetTasksPanel } from "@/components/PresetTasksPanel";
import { ScheduledTasksPanel } from "@/components/ScheduledTasksPanel";
import { MeetingRecordPanel } from "@/components/MeetingRecordPanel";
import { AgentGrid } from "@/components/AgentGrid";
import { WorkspaceStatusBar } from "@/components/WorkspaceStatusBar";
import { DesktopShellBehaviors } from "@/components/DesktopShellBehaviors";
import { DesktopRuntimeBadge, getDesktopRuntimeTone } from "@/components/DesktopRuntimeBadge";
import { DesktopRuntimeBridge } from "@/components/DesktopRuntimeBridge";
import { ExecutionVerificationBridge } from "@/components/ExecutionVerificationBridge";
import { ControlCenter } from "@/components/ControlCenter";
import { ExecutionCenter } from "@/components/ExecutionCenter";
import { ProjectHubCard } from "@/components/ProjectHubCard";
import { WorkspaceDesk } from "@/components/WorkspaceDesk";
import {
  createSemanticMemoryProvider,
  registerSemanticMemoryProvider,
  resetSemanticMemoryProvider,
} from "@/lib/semantic-memory";
import { timeAgo } from "@/lib/utils";
import { AGENT_META, getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { AppTab, ControlCenterSectionId } from "@/store/types";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { detectElectronRuntimeWindow } from "@/lib/electron-runtime";
import { runExecutionVerification } from "@/lib/execution-verification";

const NAV_ITEMS: Array<{ id: AppTab; label: string; eyebrow: string }> = [
  { id: "dashboard", label: "首页", eyebrow: "Home" },
  { id: "tasks", label: "聊天", eyebrow: "Chat" },
  { id: "workspace", label: "工作区", eyebrow: "Desk" },
  { id: "meeting", label: "会议", eyebrow: "Meet" },
  { id: "settings", label: "控制台", eyebrow: "Control" },
];

const HOME_PROMPTS = [
  "帮我梳理今天最值得推进的一项任务，并自动拆成执行步骤。",
  "从当前会话和工作区上下文里，给我一版可以直接开工的开发计划。",
  "检查一下团队配置、插件和工作流，告诉我哪里还不顺手。",
];

const CHAT_STARTERS = [
  "基于当前工程上下文，先告诉我最值得做的下一步。",
  "帮我 review 当前方案，优先指出风险和遗漏。",
  "把这个任务拆成 3 个可以立即执行的小步骤。",
];

function detectElectronRuntime() {
  if (typeof window === "undefined") return false;
  return detectElectronRuntimeWindow(window);
}

function useRuntimeTarget() {
  const [runtimeTarget, setRuntimeTarget] = useState<"web" | "electron">(() =>
    detectElectronRuntime() ? "electron" : "web",
  );

  useEffect(() => {
    setRuntimeTarget(detectElectronRuntime() ? "electron" : "web");
  }, []);

  return runtimeTarget;
}

function dispatchInstruction(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) return;
  sendExecutionDispatch({
    instruction: trimmed,
    source: "workflow",
    includeActiveProjectMemory: true,
  });
}

function openControlCenterSection(section: ControlCenterSectionId) {
  const { setActiveControlCenterSection, setTab } = useStore.getState();
  setActiveControlCenterSection(section);
  setTab("settings");
}

export default function App() {
  useWebSocket();
  const runtimeTarget = useRuntimeTarget();
  const shouldRenderDesktopWorkspace =
    runtimeTarget === "electron"
    || (typeof window !== "undefined" && detectElectronRuntime());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { providers, agentConfigs, userNickname, desktopProgramSettings } = useStore.getState();
      sendWs({ type: "settings_sync", providers, agentConfigs, userNickname, desktopProgramSettings });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const checkBusinessQueue = () => {
      const store = useStore.getState();
      const {
        automationPaused,
        autoDispatchScheduledTasks,
        automationMode,
        remoteSupervisorEnabled,
        wsStatus,
        activeSessionId,
        chatSessions,
        businessApprovals,
        businessOperationLogs,
        businessCustomers,
        businessLeads,
        businessTickets,
        businessContentTasks,
        businessChannelSessions,
        executionRuns,
        recordBusinessOperation,
      } = store;

      if (
        automationPaused ||
        !autoDispatchScheduledTasks ||
        automationMode === "manual" ||
        !remoteSupervisorEnabled ||
        wsStatus !== "connected"
      ) {
        return;
      }

      const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null;
      const currentProjectKey = activeSession
        ? getRunProjectScopeKey(activeSession, chatSessions)
        : "project:general";
      const activeProjectRuns = executionRuns.filter(
        run =>
          getRunProjectScopeKey(run, chatSessions) === currentProjectKey &&
          (run.status === "analyzing" || run.status === "running"),
      );

      if (activeProjectRuns.length > 0) return;

      const businessQueue = buildBusinessAutomationQueue({
        approvals: filterByProjectScope(businessApprovals, activeSession ?? {}),
        customers: filterByProjectScope(businessCustomers, activeSession ?? {}),
        leads: filterByProjectScope(businessLeads, activeSession ?? {}),
        tickets: filterByProjectScope(businessTickets, activeSession ?? {}),
        contentTasks: filterByProjectScope(businessContentTasks, activeSession ?? {}),
        channelSessions: filterByProjectScope(businessChannelSessions, activeSession ?? {}),
      });

      const dispatchQueue = decorateBusinessDispatchQueue(businessQueue, {
        wsStatus,
        automationMode,
        automationPaused,
        remoteSupervisorEnabled,
      });

      const nextItem = pickNextAutoDispatchItem(
        dispatchQueue,
        filterByProjectScope(businessOperationLogs, activeSession ?? {}),
      );

      if (!nextItem) return;

      const { ok, executionRunId } = sendExecutionDispatch({
        instruction: nextItem.instruction,
        source: "remote-ops",
        includeUserMessage: true,
        taskDescription: `${nextItem.taskDescription} [自动值守]`,
        includeActiveProjectMemory: true,
      });

      recordBusinessOperation({
        entityType: nextItem.entityType,
        entityId: nextItem.entityId,
        eventType: "dispatch",
        trigger: "auto",
        status: ok ? "sent" : "blocked",
        title: nextItem.title,
        detail: ok
          ? "系统在值守模式下自动派发了该业务对象。"
          : "系统尝试自动派发，但发送链路未成功建立。",
        executionRunId: ok ? executionRunId : undefined,
      });
    };

    const checkInterval = window.setInterval(() => {
      const { automationPaused, autoDispatchScheduledTasks, automationMode } = useStore.getState();
      if (automationPaused || !autoDispatchScheduledTasks || automationMode === "manual") return;
      checkAndExecuteTasks(task => {
        dispatchInstruction(task.instruction);
      });
      checkBusinessQueue();
    }, 60000);

    const bootTimer = window.setTimeout(() => {
      checkBusinessQueue();
    }, 8000);

    return () => {
      window.clearInterval(checkInterval);
      window.clearTimeout(bootTimer);
    };
  }, []);

  const leftOpen = useStore(s => s.leftOpen);
  const toggleLeft = useStore(s => s.toggleLeft);
  const activeTab = useStore(s => s.activeTab);
  const setTab = useStore(s => s.setTab);
  const createChatSession = useStore(s => s.createChatSession);
  const wsStatus = useStore(s => s.wsStatus);
  const cost = useStore(s => s.cost);
  const agents = useStore(s => s.agents);
  const workflowRuns = useStore(s => s.workflowRuns);
  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const automationPaused = useStore(s => s.automationPaused);
  const automationMode = useStore(s => s.automationMode);
  const desktopRuntime = useStore(s => s.desktopRuntime);
  const semanticMemoryConfig = useStore(s => s.semanticMemoryConfig);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const setBusinessApprovalDecision = useStore(s => s.setBusinessApprovalDecision);
  const activeControlCenterSectionId = useStore(s => s.activeControlCenterSectionId);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);

  useEffect(() => {
    registerSemanticMemoryProvider(createSemanticMemoryProvider(semanticMemoryConfig));
    return () => resetSemanticMemoryProvider();
  }, [semanticMemoryConfig]);

  const runningCount = useMemo(
    () => Object.values(agents).filter(agent => agent.status === "running").length,
    [agents],
  );

  const enabledPlatforms = useMemo(
    () => Object.values(platformConfigs).filter(platform => platform.enabled).length,
    [platformConfigs],
  );
  const desktopRuntimeTone = useMemo(
    () => getDesktopRuntimeTone(desktopRuntime),
    [desktopRuntime],
  );
  const desktopRuntimeSummary = useMemo(() => {
    if (desktopRuntimeTone.tone === "ready") return "已连接";
    if (desktopRuntimeTone.tone === "partial") return "部分";
    return "未连接";
  }, [desktopRuntimeTone.tone]);

  const activeNav = NAV_ITEMS.find(item => item.id === activeTab) ?? NAV_ITEMS[0];
  const preferredControlSection = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]?.recommendedSectionIds[0] ?? "overview"
    : "overview";
  const openTopbarControlCenter = () => {
    if (activeControlCenterSectionId === "overview") {
      setActiveControlCenterSection(preferredControlSection);
    }
    setTab("settings");
  };

  if (shouldRenderDesktopWorkspace) {
    return <DesktopWorkspaceApp />;
  }

  return (
    <div className="ios-chat-shell">
      <DesktopShellBehaviors />
      <DesktopRuntimeBridge />
      <ExecutionVerificationBridge />

      <div className="ios-chat-shell__layout">
        <aside className={`ios-chat-shell__sidebar ${leftOpen ? "" : "is-collapsed"}`}>
          <div className="ios-chat-shell__sidebar-head">
            <div className="ios-chat-shell__brand">
              <div className="ios-chat-shell__brand-mark">龙</div>
              <div>
                <div className="ios-chat-shell__brand-eyebrow">Lobster Crew OS</div>
                <div className="ios-chat-shell__brand-title">小龙虾 AI</div>
              </div>
            </div>

            <button
              type="button"
              className="ios-chat-shell__new-chat"
              onClick={() => {
                createChatSession();
                setTab("tasks");
              }}
            >
              新对话
            </button>
          </div>

          <nav className="ios-chat-shell__nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`ios-chat-shell__nav-item ${activeTab === item.id ? "is-active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span className="ios-chat-shell__nav-eyebrow">{item.eyebrow}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>

          <div className="ios-chat-shell__status-grid">
            <StatusPill label="连接" value={wsStatus === "connected" ? "在线" : wsStatus === "connecting" ? "连接中" : "离线"} />
            <StatusPill label="桌面态" value={desktopRuntimeSummary} />
            <StatusPill label="运行中" value={String(runningCount)} />
            <StatusPill label="模式" value={automationPaused ? "已暂停" : automationMode === "manual" ? "人工" : automationMode === "supervised" ? "监督" : "自治"} />
            <StatusPill label="Tokens" value={cost.totalTokens.toLocaleString()} />
            <StatusPill label="工作流" value={String(workflowRuns.length)} />
          </div>

          <div className="ios-chat-shell__sidebar-scroll">
            <SidebarSection title="当前项目" subtitle="当前会话所属项目摘要">
              <ProjectHubCard compact />
            </SidebarSection>

            <SidebarSection title="会话" subtitle="最近聊天与草稿">
              <ChatSessionsPanel showHeader={false} />
            </SidebarSection>

            {activeTab === "tasks" && (
              <>
                <SidebarSection title="快捷任务" subtitle="一键派发常用动作">
                  <PresetTasksPanel onSelectTask={dispatchInstruction} />
                </SidebarSection>
                <SidebarSection title="计划任务" subtitle="定时与补跑入口">
                  <ScheduledTasksPanel onExecuteTask={dispatchInstruction} />
                </SidebarSection>
              </>
            )}

            {activeTab === "dashboard" && (
              <>
                <SidebarSection title="团队状态" subtitle="当前角色与负载">
                  <AgentGrid />
                </SidebarSection>
                <SidebarSection title="动态记录" subtitle="最近执行结果">
                  <ActivityPanel />
                </SidebarSection>
              </>
            )}

            {activeTab === "meeting" && (
              <SidebarSection title="会议记录" subtitle="最近一轮结论">
                <MeetingRecordPanel />
              </SidebarSection>
            )}

            <SidebarSection title="系统摘要" subtitle="当前工作台能力">
              <div className="ios-chat-shell__summary-list">
                <div className="ios-chat-shell__summary-item">
                  <span>Provider</span>
                  <strong>{providers.length}</strong>
                </div>
                <div className="ios-chat-shell__summary-item">
                  <span>平台</span>
                  <strong>{enabledPlatforms}</strong>
                </div>
                <div className="ios-chat-shell__summary-item">
                  <span>当前模式</span>
                  <strong>{activeNav.label}</strong>
                </div>
              </div>
            </SidebarSection>
          </div>
        </aside>

        <main className="ios-chat-shell__main">
          <div className="ios-chat-shell__topbar">
            <div className="ios-chat-shell__topbar-left">
              <button type="button" className="ios-chat-shell__menu-btn" onClick={() => toggleLeft()}>
                {leftOpen ? "隐藏侧栏" : "打开侧栏"}
              </button>
              <div>
                <div className="ios-chat-shell__page-eyebrow">{activeNav.eyebrow}</div>
                <div className="ios-chat-shell__page-title">{activeNav.label}</div>
              </div>
            </div>

            <div className="ios-chat-shell__topbar-right">
              <DesktopRuntimeBadge compact />
              <div className="ios-chat-shell__capsule">iOS Glass</div>
              <div className="ios-chat-shell__capsule">GPT-style Flow</div>
              <button type="button" className="ios-chat-shell__capsule is-button" onClick={openTopbarControlCenter}>
                打开控制台
              </button>
            </div>
          </div>

          <div className="ios-chat-shell__canvas">
            {activeTab === "dashboard" && <DashboardTab onOpenTab={setTab} />}
            {activeTab === "tasks" && <TasksTab />}
            {activeTab === "workspace" && <WorkspaceTab />}
            {activeTab === "meeting" && <MeetingTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        </main>
      </div>

      <WorkspaceStatusBar />
    </div>
  );
}

function DesktopWorkspaceApp() {
  const activeTab = useStore(s => s.activeTab);
  const setTab = useStore(s => s.setTab);
  const createChatSession = useStore(s => s.createChatSession);
  const wsStatus = useStore(s => s.wsStatus);
  const leftOpen = useStore(s => s.leftOpen);
  const toggleLeft = useStore(s => s.toggleLeft);
  const cost = useStore(s => s.cost);
  const agents = useStore(s => s.agents);
  const desktopRuntime = useStore(s => s.desktopRuntime);
  const activeNav = NAV_ITEMS.find(item => item.id === activeTab) ?? NAV_ITEMS[0];
  const desktopRuntimeTone = getDesktopRuntimeTone(desktopRuntime);
  const runningCount = useMemo(
    () => Object.values(agents).filter(agent => agent.status === "running").length,
    [agents],
  );
  const offline = wsStatus !== "connected";

  return (
    <div className="desktop-workspace-shell">
      <DesktopShellBehaviors />
      <DesktopRuntimeBridge />
      <ExecutionVerificationBridge />

      <header className="desktop-workspace-shell__topbar">
        <div className="desktop-workspace-shell__topbar-left">
          <button
            type="button"
            className="desktop-workspace-shell__menu-btn"
            onClick={() => toggleLeft()}
          >
            {leftOpen ? "隐藏侧栏" : "显示侧栏"}
          </button>
          <div className="desktop-workspace-shell__brand">
            <div className="desktop-workspace-shell__brand-mark">龙</div>
            <div>
              <div className="desktop-workspace-shell__eyebrow">Desktop Workspace</div>
              <div className="desktop-workspace-shell__title">小龙虾 AI 团队</div>
            </div>
          </div>
        </div>

        <div className="desktop-workspace-shell__topbar-right">
          <button
            type="button"
            className="desktop-workspace-shell__new-chat"
            onClick={() => {
              createChatSession();
              setTab("tasks");
            }}
          >
            新对话
          </button>
          <div className="desktop-workspace-shell__status-rail">
            <div className={`desktop-workspace-shell__pill ${offline ? "is-warning" : "is-good"}`}>
              <span>连接</span>
              <strong>{wsStatus === "connected" ? "在线" : wsStatus}</strong>
            </div>
            <div className={`desktop-workspace-shell__pill ${desktopRuntimeTone.tone === "ready" ? "is-good" : "is-warning"}`}>
              <span>桌面</span>
              <strong>{desktopRuntimeTone.label}</strong>
            </div>
            <div className="desktop-workspace-shell__pill">
              <span>运行中</span>
              <strong>{runningCount}</strong>
            </div>
            <div className="desktop-workspace-shell__pill">
              <span>Tokens</span>
              <strong>{cost.totalTokens.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </header>

      <div className={`desktop-workspace-shell__layout ${leftOpen ? "" : "is-sidebar-collapsed"}`}>
        {leftOpen ? (
          <aside className="desktop-workspace-shell__sidebar">
            <section className="desktop-workspace-shell__section">
              <div className="desktop-workspace-shell__section-eyebrow">导航</div>
              <div className="desktop-workspace-shell__nav">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`desktop-workspace-shell__nav-item ${activeTab === item.id ? "is-active" : ""}`}
                  >
                    <span>{item.eyebrow}</span>
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="desktop-workspace-shell__section">
              <div className="desktop-workspace-shell__section-eyebrow">会话</div>
              <div className="desktop-workspace-shell__panel">
                <ChatSessionsPanel showHeader={false} />
              </div>
            </section>

            {activeTab === "tasks" ? (
              <section className="desktop-workspace-shell__section">
                <div className="desktop-workspace-shell__section-eyebrow">快捷任务</div>
                <div className="desktop-workspace-shell__panel">
                  <PresetTasksPanel onSelectTask={dispatchInstruction} />
                </div>
              </section>
            ) : null}

            {activeTab === "dashboard" ? (
              <section className="desktop-workspace-shell__section">
                <div className="desktop-workspace-shell__section-eyebrow">动态记录</div>
                <div className="desktop-workspace-shell__panel">
                  <ActivityPanel />
                </div>
              </section>
            ) : null}

            <section className="desktop-workspace-shell__section">
              <div className="desktop-workspace-shell__section-eyebrow">桌面态摘要</div>
              <div className="desktop-workspace-shell__summary-grid">
                <article className="desktop-workspace-shell__summary-card">
                  <span>当前场景</span>
                  <strong>{activeNav.label}</strong>
                </article>
                <article className="desktop-workspace-shell__summary-card">
                  <span>侧栏</span>
                  <strong>{leftOpen ? "展开" : "收起"}</strong>
                </article>
                <article className="desktop-workspace-shell__summary-card">
                  <span>工作模式</span>
                  <strong>{desktopRuntimeTone.tone === "ready" ? "桌面在线" : "等待接管"}</strong>
                </article>
              </div>
            </section>
          </aside>
        ) : null}

        <main className="desktop-workspace-shell__main">
          <section className="desktop-workspace-shell__hero">
            <div>
              <div className="desktop-workspace-shell__hero-eyebrow">{activeNav.eyebrow}</div>
              <h1 className="desktop-workspace-shell__hero-title">{activeNav.label}</h1>
              <p className="desktop-workspace-shell__hero-copy">
                桌面端保持稳定渲染优先，同时把聊天、工作台和控制面板收敛到同一条工作流里。
              </p>
              <div className="desktop-workspace-shell__hero-actions">
                <button type="button" className="desktop-workspace-shell__hero-action is-primary" onClick={() => setTab("tasks")}>
                  回到聊天
                </button>
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("settings")}>
                  打开控制台
                </button>
              </div>
            </div>
            <div className="desktop-workspace-shell__hero-meta">
              <div className="desktop-workspace-shell__hero-meta-card">
                <span>桌面连接</span>
                <strong>{desktopRuntimeTone.label}</strong>
              </div>
              <div className="desktop-workspace-shell__hero-meta-card">
                <span>消息链路</span>
                <strong>{offline ? "待恢复" : "已同步"}</strong>
              </div>
            </div>
          </section>

          {offline || desktopRuntimeTone.tone !== "ready" ? (
            <section className="desktop-workspace-shell__alert">
              <div>
                <strong>{offline ? "消息链路需要恢复" : "桌面能力尚未完全接入"}</strong>
                <p>
                  {offline
                    ? "当前 WebSocket 未在线，自动派发和执行状态同步会受影响。"
                    : desktopRuntimeTone.detail}
                </p>
              </div>
              <div className="desktop-workspace-shell__alert-actions">
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("settings")}>
                  去检查设置
                </button>
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("tasks")}>
                  手动接管
                </button>
              </div>
            </section>
          ) : null}

          {activeTab === "dashboard" ? <DashboardTab onOpenTab={setTab} /> : null}
          {activeTab === "tasks" ? <DesktopChatWorkspace /> : null}
          {activeTab === "workspace" ? (
            <section className="desktop-workspace-shell__content-panel">
              <WorkspaceTab />
            </section>
          ) : null}
          {activeTab === "meeting" ? (
            <section className="desktop-workspace-shell__content-panel">
              <MeetingTab />
            </section>
          ) : null}
          {activeTab === "settings" ? (
            <section className="desktop-workspace-shell__content-panel">
              <SettingsTab />
            </section>
          ) : null}
        </main>
      </div>

      <WorkspaceStatusBar />
    </div>
  );
}

function DesktopChatWorkspace() {
  const setTab = useStore(s => s.setTab);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setBusinessApprovalDecision = useStore(s => s.setBusinessApprovalDecision);
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
  const clearDesktopInputSession = useStore(s => s.clearDesktopInputSession);
  const tasks = useStore(s => s.tasks);
  const workflowRuns = useStore(s => s.workflowRuns);
  const restageWorkflowRun = useStore(s => s.restageWorkflowRun);
  const startWorkflowRun = useStore(s => s.startWorkflowRun);
  const completeWorkflowRun = useStore(s => s.completeWorkflowRun);
  const executionRuns = useStore(s => s.executionRuns);
  const activeExecutionRunId = useStore(s => s.activeExecutionRunId);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const wsStatus = useStore(s => s.wsStatus);
  const automationPaused = useStore(s => s.automationPaused);
  const automationMode = useStore(s => s.automationMode);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const chatStarters = activeSurface?.chatStarters ?? CHAT_STARTERS;
  const [desktopApprovalFeedback, setDesktopApprovalFeedback] = useState<string | null>(null);
  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const scopedExecutionRuns = useMemo(
    () =>
      executionRuns
        .filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [chatSessions, currentProjectKey, executionRuns],
  );
  const runningExecutions = scopedExecutionRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const recentRuns = scopedExecutionRuns.slice(0, 3);
  const activeRun = scopedExecutionRuns.find(run => run.id === activeExecutionRunId) ?? scopedExecutionRuns[0] ?? null;
  const recentRun = scopedExecutionRuns[0] ?? null;
  const recentFailedRun = scopedExecutionRuns.find(run => run.status === "failed") ?? null;
  const workflowQueue = workflowRuns
    .filter(run => run.status === "queued" || run.status === "staged" || run.status === "in-progress")
    .slice(0, 3);
  const pendingWorkbenchQueue = useMemo(() => {
    const executionItems = recentRuns
      .filter(run => run.id !== activeRun?.id)
      .map(run => ({
        kind: "execution" as const,
        id: run.id,
        title: run.instruction,
        updatedAt: run.updatedAt,
        meta: [
          getMobileExecutionLabel(run.status),
          `${run.events.length} 条轨迹`,
          run.verificationStatus ? `验证 ${getVerificationLabel(run.verificationStatus)}` : null,
        ].filter(Boolean) as string[],
        summary: null as string | null,
        primaryLabel: "查看轨迹",
        onPrimary: () => openExecutionRun(run.id),
        secondaryLabel: "回到聊天",
        onSecondary: () => handoffToChat(run.sessionId),
      }));

    const workflowItems = workflowQueue.map(run => ({
      kind: "workflow" as const,
      id: run.id,
      title: run.title,
      updatedAt: run.updatedAt,
      meta: [
        getWorkflowStatusLabel(run.status),
        `${run.launchCount} 次启动`,
        run.nextTab === "tasks" ? "聊天页继续" : "工作区继续",
      ],
      summary: run.summary,
      primaryLabel: run.status === "in-progress" ? "标记完成" : run.status === "queued" || run.status === "staged" ? "启动" : "回填草稿",
      onPrimary: () => {
        if (run.status === "in-progress") {
          completeWorkflowRun(run.id);
          return;
        }
        if (run.status === "queued" || run.status === "staged") {
          startWorkflowRun(run.id);
          setCommandDraft(run.draft);
          setTab(run.nextTab);
          return;
        }
        restageWorkflowRun(run.id);
        setCommandDraft(run.draft);
        setTab(run.nextTab);
      },
      secondaryLabel: "回填草稿",
      onSecondary: () => {
        restageWorkflowRun(run.id);
        setCommandDraft(run.draft);
        setTab(run.nextTab);
      },
    }));

    return [...executionItems, ...workflowItems]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 4);
  }, [
    activeRun?.id,
    completeWorkflowRun,
    recentRuns,
    restageWorkflowRun,
    setCommandDraft,
    setTab,
    startWorkflowRun,
    workflowQueue,
  ]);
  const canTakeOver = desktopInputSession.state === "manual-required" && Boolean(desktopInputSession.resumeInstruction);
  const latestEvent = activeRun?.events[activeRun.events.length - 1] ?? null;
  const activeRunTimeline = activeRun ? activeRun.events.slice(-3) : [];
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, activeSession ?? {}),
    [activeSession, businessApprovals],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );
  const scopedCustomers = useMemo(
    () => filterByProjectScope(businessCustomers, activeSession ?? {}),
    [activeSession, businessCustomers],
  );
  const scopedLeads = useMemo(
    () => filterByProjectScope(businessLeads, activeSession ?? {}),
    [activeSession, businessLeads],
  );
  const scopedTickets = useMemo(
    () => filterByProjectScope(businessTickets, activeSession ?? {}),
    [activeSession, businessTickets],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );
  const railApprovalQueue = useMemo(
    () =>
      buildBusinessAutomationQueue({
        approvals: scopedApprovals,
        customers: scopedCustomers,
        leads: scopedLeads,
        tickets: scopedTickets,
        contentTasks: scopedContentTasks,
        channelSessions: scopedChannelSessions,
      }).filter(item => item.approvalState === "pending").slice(0, 2),
    [
      scopedApprovals,
      scopedChannelSessions,
      scopedContentTasks,
      scopedCustomers,
      scopedLeads,
      scopedTickets,
    ],
  );
  const pendingApprovalCount = scopedApprovals.filter(item => item.status === "pending").length;
  const latestOperation = scopedOperationLogs[0] ?? null;

  const openExecutionRun = (runId: string) => {
    setActiveExecutionRun(runId);
    setActiveControlCenterSection("execution");
    setTab("settings");
  };

  const focusChatSession = (sessionId?: string | null) => {
    if (sessionId) {
      setActiveChatSession(sessionId);
    }
  };

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const handoffToChat = (sessionId?: string | null) => {
    focusChatSession(sessionId ?? desktopInputSession.sessionId ?? recentFailedRun?.sessionId ?? null);
    if (desktopInputSession.resumeInstruction) {
      setCommandDraft(desktopInputSession.resumeInstruction);
    } else if (recentFailedRun) {
      setCommandDraft(`继续处理这次失败执行，并优先给出接管建议：\n${recentFailedRun.instruction}`);
    }
    setTab("tasks");
  };

  const retryRun = (run: NonNullable<typeof recentFailedRun>) => {
    const { ok, executionRunId } = sendExecutionDispatch({
      instruction: run.instruction,
      source: run.source,
      includeUserMessage: true,
      includeActiveProjectMemory: true,
      sessionId: run.sessionId,
      taskDescription: `${run.instruction} [重试]`,
    });
    if (ok && executionRunId) {
      focusChatSession(run.sessionId);
      setActiveExecutionRun(executionRunId);
      setActiveControlCenterSection("execution");
      setTab("settings");
    } else {
      focusChatSession(run.sessionId);
      setCommandDraft(`重试这次失败执行，并先分析失败原因后再继续：\n${run.instruction}`);
      setTab("tasks");
    }
  };

  const continueAfterTakeover = () => {
    if (!desktopInputSession.resumeInstruction) return;

    focusChatSession(desktopInputSession.sessionId);
    const { ok, executionRunId } = sendExecutionDispatch({
      instruction: desktopInputSession.resumeInstruction,
      source: "chat",
      includeUserMessage: false,
      includeActiveProjectMemory: true,
      sessionId: desktopInputSession.sessionId,
      taskDescription: "验证完成后继续执行",
    });

    if (ok) {
      setAutomationPaused(false);
      clearDesktopInputSession();
      if (executionRunId) {
        setActiveExecutionRun(executionRunId);
        setActiveControlCenterSection("execution");
        setTab("settings");
        return;
      }
    }

    setTab("tasks");
  };

  const approveRailItem = (item: BusinessAutomationQueueItem) => {
    setBusinessApprovalDecision({
      entityType: item.entityType,
      entityId: item.entityId,
      status: "approved",
    });

    const canAutoDispatch =
      wsStatus === "connected"
      && !automationPaused
      && automationMode !== "manual"
      && remoteSupervisorEnabled
      && item.decision.autoRunEligible;

    if (!canAutoDispatch) {
      const blockedReason =
        wsStatus !== "connected"
          ? "远程通道还没连上"
          : automationPaused
            ? "自动化当前已暂停"
            : automationMode === "manual"
              ? "当前仍是人工模式"
              : !remoteSupervisorEnabled
                ? "远程值守当前关闭"
                : "量化结果仍建议先观察";
      setDesktopApprovalFeedback(`已批准 ${item.title}，但这次没有自动派发，因为${blockedReason}。`);
      return;
    }

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
        ? "人工在 Electron 聊天工作台批准后立即派发了该业务对象。"
        : "人工在 Electron 聊天工作台批准了该业务对象，但发送链路未成功建立。",
      executionRunId: ok ? executionRunId : undefined,
    });

    if (ok && executionRunId) {
      setActiveExecutionRun(executionRunId);
      setActiveControlCenterSection("execution");
      setTab("settings");
      setDesktopApprovalFeedback(`已批准 ${item.title}，并已直接送入执行链路。`);
      return;
    }

    setDesktopApprovalFeedback(`已批准 ${item.title}，但派发链路没有成功建立。`);
  };

  const rejectRailItem = (item: BusinessAutomationQueueItem) => {
    setBusinessApprovalDecision({
      entityType: item.entityType,
      entityId: item.entityId,
      status: "rejected",
    });
    setDesktopApprovalFeedback(`已驳回 ${item.title}，审计记录会保留这次处理。`);
  };

  return (
    <div className="desktop-workspace-shell__chat-layout">
      <section className="desktop-workspace-shell__chat-main">
        <TasksTab />
      </section>

      <aside className="desktop-workspace-shell__chat-rail">
        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">执行总览</div>
          <div className="desktop-workspace-shell__rail-stats">
            <article className="desktop-workspace-shell__summary-card">
              <span>消息数</span>
              <strong>{tasks.length}</strong>
            </article>
            <article className="desktop-workspace-shell__summary-card">
              <span>运行中</span>
              <strong>{runningExecutions}</strong>
            </article>
            <article className="desktop-workspace-shell__summary-card">
              <span>工作流</span>
              <strong>{workflowQueue.length}</strong>
            </article>
          </div>
          <div className="desktop-workspace-shell__rail-copy">
            当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
          </div>
          <div className="desktop-workspace-shell__rail-actions">
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("execution")}>
              打开执行中心
            </button>
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("workflow")}>
              打开工作流中心
            </button>
          </div>
        </section>

        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">审批与值守</div>
          <div className="desktop-workspace-shell__rail-stats">
            <article className="desktop-workspace-shell__summary-card">
              <span>待审批</span>
              <strong>{pendingApprovalCount}</strong>
            </article>
            <article className="desktop-workspace-shell__summary-card">
              <span>值守</span>
              <strong>{remoteSupervisorEnabled ? "已开启" : "已关闭"}</strong>
            </article>
            <article className="desktop-workspace-shell__summary-card">
              <span>模式</span>
              <strong>{automationPaused ? "已暂停" : automationMode === "manual" ? "人工" : automationMode === "supervised" ? "监督" : "自治"}</strong>
            </article>
          </div>
          {desktopApprovalFeedback ? (
            <div className="desktop-workspace-shell__rail-inline-panel">
              <div className="desktop-workspace-shell__rail-inline-label">刚刚处理</div>
              <div className="desktop-workspace-shell__rail-copy">{desktopApprovalFeedback}</div>
            </div>
          ) : null}
          {railApprovalQueue.length > 0 ? (
            <div className="desktop-workspace-shell__rail-stack">
              {railApprovalQueue.map(item => (
                <article key={`${item.entityType}-${item.entityId}`} className="desktop-workspace-shell__rail-list-item">
                  <div className="desktop-workspace-shell__rail-run">
                    <strong>{item.title}</strong>
                    <div className="desktop-workspace-shell__rail-copy">{item.subtitle}</div>
                    <div className="desktop-workspace-shell__rail-copy">{item.summary}</div>
                  </div>
                  <div className="desktop-workspace-shell__rail-actions is-inline">
                    <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => approveRailItem(item)}>
                      批准
                    </button>
                    <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => rejectRailItem(item)}>
                      驳回
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="desktop-workspace-shell__rail-copy">
              当前项目没有等待人工确认的业务对象，可以直接盯执行和桌面接管状态。
            </div>
          )}
          {latestOperation ? (
            <div className="desktop-workspace-shell__rail-inline-panel">
              <div className="desktop-workspace-shell__rail-inline-label">最近审计动作</div>
              <strong>{latestOperation.title}</strong>
              <div className="desktop-workspace-shell__rail-copy">{latestOperation.detail}</div>
              <div className="desktop-workspace-shell__rail-actions is-inline">
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("remote")}>
                  打开远程值守
                </button>
                {latestOperation.executionRunId ? (
                  <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openExecutionRun(latestOperation.executionRunId!)}>
                    查看对应执行
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {activeRun ? (
          <section className="desktop-workspace-shell__rail-card">
            <div className="desktop-workspace-shell__section-eyebrow">当前执行</div>
            <div className="desktop-workspace-shell__run-inspector">
              <div className="desktop-workspace-shell__run-inspector-top">
                <div className="desktop-workspace-shell__run-inspector-head">
                  <strong>{activeRun.instruction}</strong>
                  <div className="desktop-workspace-shell__rail-copy">
                    {activeRun.currentAgentId
                      ? `当前角色 ${AGENT_META[activeRun.currentAgentId].emoji} ${AGENT_META[activeRun.currentAgentId].name}`
                      : "当前角色待分配"}
                  </div>
                </div>
                <div className="desktop-workspace-shell__rail-run-meta">
                  <span>{getMobileExecutionLabel(activeRun.status)}</span>
                  <span>{timeAgo(activeRun.updatedAt)}</span>
                  <span>{activeRun.events.length} 条轨迹</span>
                </div>
              </div>

              <div className="desktop-workspace-shell__run-inspector-progress">
                <div className="desktop-workspace-shell__run-inspector-progress-head">
                  <span>任务进度</span>
                  <strong>{activeRun.completedTasks}/{activeRun.totalTasks || 0}</strong>
                </div>
                <div className="desktop-workspace-shell__run-inspector-progress-bar">
                  <div
                    className="desktop-workspace-shell__run-inspector-progress-fill"
                    style={{ width: `${getExecutionProgressPercent(activeRun)}%` }}
                  />
                </div>
                <div className="desktop-workspace-shell__rail-run-meta">
                  <span>{activeRun.failedTasks > 0 ? `${activeRun.failedTasks} 个失败` : "暂无失败"}</span>
                  <span>{activeRun.verificationStatus ? `验证 ${getVerificationLabel(activeRun.verificationStatus)}` : "尚未验证"}</span>
                </div>
              </div>

              {activeRunTimeline.length > 0 ? (
                <div className="desktop-workspace-shell__run-inspector-timeline">
                  {activeRunTimeline.map((event, index) => (
                    <div key={event.id} className="desktop-workspace-shell__run-inspector-event">
                      <div className="desktop-workspace-shell__run-inspector-marker">
                        <span />
                        {index < activeRunTimeline.length - 1 ? <i /> : null}
                      </div>
                      <div className="desktop-workspace-shell__run-inspector-event-body">
                        <div className="desktop-workspace-shell__run-inspector-event-head">
                          <strong>{event.title}</strong>
                          <span>{timeAgo(event.timestamp)}</span>
                        </div>
                        {event.detail ? (
                          <div className="desktop-workspace-shell__rail-copy">{event.detail}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {latestEvent ? (
                <div className="desktop-workspace-shell__rail-inline-panel">
                  <div className="desktop-workspace-shell__rail-inline-label">最新节点摘要</div>
                  <strong>{latestEvent.title}</strong>
                  {latestEvent.detail ? (
                    <div className="desktop-workspace-shell__rail-copy">{latestEvent.detail}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="desktop-workspace-shell__rail-actions is-inline">
              <button type="button" className="desktop-workspace-shell__hero-action is-primary" onClick={() => openExecutionRun(activeRun.id)}>
                查看轨迹
              </button>
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => void runExecutionVerification(activeRun.id)}>
                重新验证
              </button>
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => handoffToChat(activeRun.sessionId)}>
                去聊天接管
              </button>
            </div>
          </section>
        ) : null}

        {pendingWorkbenchQueue.length > 0 ? (
          <section className="desktop-workspace-shell__rail-card">
            <div className="desktop-workspace-shell__section-eyebrow">待处理队列</div>
            <div className="desktop-workspace-shell__rail-stack">
              {pendingWorkbenchQueue.map(item => (
                <article key={`${item.kind}-${item.id}`} className="desktop-workspace-shell__rail-list-item">
                  <div className="desktop-workspace-shell__rail-run">
                    <strong>{item.title}</strong>
                    <div className="desktop-workspace-shell__rail-run-meta">
                      <span>{item.kind === "execution" ? "执行" : "工作流"}</span>
                      {item.meta.map(label => (
                        <span key={label}>{label}</span>
                      ))}
                      <span>{timeAgo(item.updatedAt)}</span>
                    </div>
                    {item.summary ? (
                      <div className="desktop-workspace-shell__rail-copy">{item.summary}</div>
                    ) : null}
                  </div>
                  <div className="desktop-workspace-shell__rail-actions is-inline">
                    <button type="button" className="desktop-workspace-shell__hero-action" onClick={item.onPrimary}>
                      {item.primaryLabel}
                    </button>
                    <button type="button" className="desktop-workspace-shell__hero-action" onClick={item.onSecondary}>
                      {item.secondaryLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {recentFailedRun ? (
          <section className="desktop-workspace-shell__rail-card is-danger">
            <div className="desktop-workspace-shell__section-eyebrow">失败恢复</div>
            <div className="desktop-workspace-shell__rail-run">
              <strong>最近一次失败执行需要处理</strong>
              <div className="desktop-workspace-shell__rail-copy">
                {recentFailedRun.instruction}
              </div>
            </div>
            <div className="desktop-workspace-shell__rail-actions">
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => retryRun(recentFailedRun)}>
                一键重试
              </button>
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openExecutionRun(recentFailedRun.id)}>
                看失败轨迹
              </button>
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => handoffToChat(recentFailedRun.sessionId)}>
                回到聊天接管
              </button>
            </div>
          </section>
        ) : null}

        {canTakeOver ? (
          <section className="desktop-workspace-shell__rail-card is-warning">
            <div className="desktop-workspace-shell__section-eyebrow">人工接管</div>
            <div className="desktop-workspace-shell__rail-copy">
              {desktopInputSession.message || "当前桌面交互需要你人工确认后再继续。"}
            </div>
            <div className="desktop-workspace-shell__rail-run-meta">
              {desktopInputSession.lastAction ? <span>动作 {desktopInputSession.lastAction}</span> : null}
              {desktopInputSession.target ? <span>目标 {desktopInputSession.target}</span> : null}
              {desktopInputSession.lastIntent ? <span>意图已记录</span> : null}
            </div>
            <div className="desktop-workspace-shell__rail-actions">
              <button
                type="button"
                className="desktop-workspace-shell__hero-action is-primary"
                onClick={() => handoffToChat(desktopInputSession.sessionId)}
              >
                回到聊天接管
              </button>
              <button
                type="button"
                className="desktop-workspace-shell__hero-action"
                onClick={continueAfterTakeover}
              >
                验证完成继续
              </button>
              {desktopInputSession.executionRunId ? (
                <button
                  type="button"
                  className="desktop-workspace-shell__hero-action"
                  onClick={() => openExecutionRun(desktopInputSession.executionRunId!)}
                >
                  看当前执行
                </button>
              ) : null}
              <button
                type="button"
                className="desktop-workspace-shell__hero-action"
                onClick={clearDesktopInputSession}
              >
                清空接管
              </button>
            </div>
          </section>
        ) : null}

        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">桌面诊断</div>
          <div className="desktop-workspace-shell__rail-copy">
            当下一个动作依赖本机程序、截图定位或人工验证时，从这里直接跳到对应控制面板，不再在聊天页里来回找入口。
          </div>
          <div className="desktop-workspace-shell__rail-actions is-inline">
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("desktop")}>
              桌面程序中心
            </button>
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("execution")}>
              执行追踪
            </button>
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openControlSection("artifacts")}>
              产物面板
            </button>
          </div>
        </section>

        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">推荐起手式</div>
          <div className="desktop-workspace-shell__rail-prompts">
            {chatStarters.map(prompt => (
              <button
                key={prompt}
                type="button"
                className="desktop-workspace-shell__rail-prompt"
                onClick={() => {
                  setCommandDraft(prompt);
                  setTab("tasks");
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">切换工作流</div>
          <div className="desktop-workspace-shell__rail-actions">
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("workspace")}>
              打开工作区
            </button>
            <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("settings")}>
              打开控制台
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function DashboardTab({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const tasks = useStore(s => s.tasks);
  const agents = useStore(s => s.agents);
  const workflowRuns = useStore(s => s.workflowRuns);
  const executionRuns = useStore(s => s.executionRuns);
  const workspacePinnedPreviews = useStore(s => s.workspacePinnedPreviews);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const wsStatus = useStore(s => s.wsStatus);
  const automationPaused = useStore(s => s.automationPaused);
  const automationMode = useStore(s => s.automationMode);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setRemoteSupervisorEnabled = useStore(s => s.setRemoteSupervisorEnabled);
  const setBusinessApprovalDecision = useStore(s => s.setBusinessApprovalDecision);
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, activeSession ?? {}),
    [activeSession, workspaceDeskNotes],
  );
  const scopedProjectMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, activeSession ?? {}),
    [activeSession, workspaceProjectMemories],
  );
  const scopedCustomers = useMemo(
    () => filterByProjectScope(businessCustomers, activeSession ?? {}),
    [activeSession, businessCustomers],
  );
  const scopedLeads = useMemo(
    () => filterByProjectScope(businessLeads, activeSession ?? {}),
    [activeSession, businessLeads],
  );
  const scopedTickets = useMemo(
    () => filterByProjectScope(businessTickets, activeSession ?? {}),
    [activeSession, businessTickets],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, activeSession ?? {}),
    [activeSession, businessApprovals],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const scopedExecutionRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey),
    [chatSessions, currentProjectKey, executionRuns],
  );

  const runningCount = Object.values(agents).filter(agent => agent.status === "running").length;
  const completedCount = tasks.filter(task => task.status === "done" && !task.isUserMessage).length;
  const activeTemplate = activeTeamOperatingTemplateId
    ? getTeamOperatingTemplate(activeTeamOperatingTemplateId)
    : null;
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const homePrompts = activeSurface?.homePrompts ?? HOME_PROMPTS;
  const businessFocusCards = useMemo(
    () => getDashboardBusinessFocus(activeTeamOperatingTemplateId, {
      customers: scopedCustomers.length,
      leads: scopedLeads.length,
      tickets: scopedTickets.length,
      contentTasks: scopedContentTasks.length,
      channelSessions: scopedChannelSessions.length,
    }),
    [
      activeTeamOperatingTemplateId,
      scopedChannelSessions.length,
      scopedContentTasks.length,
      scopedCustomers.length,
      scopedLeads.length,
      scopedTickets.length,
    ],
  );
  const mobileApprovalQueue = useMemo(
    () =>
      buildBusinessAutomationQueue({
        approvals: scopedApprovals,
        customers: scopedCustomers,
        leads: scopedLeads,
        tickets: scopedTickets,
        contentTasks: scopedContentTasks,
        channelSessions: scopedChannelSessions,
      }).filter(item => item.approvalState === "pending"),
    [
      scopedApprovals,
      scopedChannelSessions,
      scopedContentTasks,
      scopedCustomers,
      scopedLeads,
      scopedTickets,
    ],
  );
  const latestRun = scopedExecutionRuns[0] ?? null;
  const latestOperation = scopedOperationLogs[0] ?? null;
  const deskContextCount = workspacePinnedPreviews.length + scopedDeskNotes.length + scopedProjectMemories.length;
  const supervisionModeLabel = automationPaused
    ? "已暂停"
    : automationMode === "manual"
      ? "人工"
      : automationMode === "supervised"
        ? "监督"
        : "自治";
  const [homeRailFeedback, setHomeRailFeedback] = useState<string | null>(null);

  const approveDashboardItem = (item: BusinessAutomationQueueItem) => {
    setBusinessApprovalDecision({
      entityType: item.entityType,
      entityId: item.entityId,
      status: "approved",
    });

    const canAutoDispatch =
      wsStatus === "connected"
      && !automationPaused
      && automationMode !== "manual"
      && remoteSupervisorEnabled
      && item.decision.autoRunEligible;

    if (!canAutoDispatch) {
      const blockedReason =
        wsStatus !== "connected"
          ? "远程通道还没连上"
          : automationPaused
            ? "自动化当前已暂停"
            : automationMode === "manual"
              ? "当前仍是人工模式"
              : !remoteSupervisorEnabled
                ? "远程值守当前关闭"
                : "量化结果仍建议先观察";

      setHomeRailFeedback(`已批准 ${item.title}，但这次没有自动派发，因为${blockedReason}。`);
      return;
    }

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
        ? "人工在桌面首页监督侧轨批准后立即派发了该业务对象。"
        : "人工在桌面首页监督侧轨批准了该业务对象，但发送链路未成功建立。",
      executionRunId: ok ? executionRunId : undefined,
    });

    if (ok && executionRunId) {
      setActiveExecutionRun(executionRunId);
      setHomeRailFeedback(`已批准 ${item.title}，并已直接送入执行链路。`);
      return;
    }

    setHomeRailFeedback(`已批准 ${item.title}，但派发链路没有成功建立。`);
  };

  const rejectDashboardItem = (item: BusinessAutomationQueueItem) => {
    setBusinessApprovalDecision({
      entityType: item.entityType,
      entityId: item.entityId,
      status: "rejected",
    });
    setHomeRailFeedback(`已驳回 ${item.title}，审计记录会保留这次处理。`);
  };

  const retryLatestExecution = (run: NonNullable<typeof latestRun>) => {
    const { ok, executionRunId } = sendExecutionDispatch({
      instruction: run.instruction,
      source: run.source,
      includeUserMessage: true,
      taskDescription: `[重试执行] ${run.instruction}`,
      includeActiveProjectMemory: true,
    });

    if (ok && executionRunId) {
      setActiveExecutionRun(executionRunId);
      setHomeRailFeedback("已重新发起这条执行指令。");
      return;
    }

    setHomeRailFeedback("重试已发起，但发送链路没有成功建立。");
  };

  return (
    <div className="ios-home">
      <div className="ios-home__workspace">
        <div className="ios-home__main">
          <section className="ios-home__hero">
            <div className="ios-home__eyebrow">A ChatGPT-like command center</div>
            <h1 className="ios-home__title">今天想让小龙虾团队帮你完成什么？</h1>
            <p className="ios-home__copy">
              主界面只保留一个清晰的对话入口，其他工具和状态都收进侧栏。你可以像用 ChatGPT 一样先说目标，再从工作区、会议、控制台继续深挖。
            </p>
            <p className="ios-home__copy" style={{ marginTop: 6 }}>
              当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
            </p>
            {activeTemplate && activeSurface ? (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 14,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(var(--accent-rgb), 0.24)",
                    background: "rgba(var(--accent-rgb), 0.08)",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  当前团队模式 · {activeTemplate.label}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.7 }}>
                  {activeSurface.statusCopy}
                </span>
              </div>
            ) : null}

            <div className="ios-home__composer">
              <CommandInput
                variant="panel"
                title="像 ChatGPT 一样开始"
                hint="直接提问、下发任务，或把工作区上下文塞进来。主页只负责开始，深入工作去左侧功能区。"
              />
            </div>

            <div className="ios-home__prompt-row">
              {homePrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className="ios-home__prompt"
                  onClick={() => {
                    const { setCommandDraft, setTab } = useStore.getState();
                    setCommandDraft(prompt);
                    setTab("tasks");
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="ios-home__focus-section">
            <div className="ios-home__focus-head">
              <div>
                <div className="ios-home__eyebrow">Continue Working</div>
                <div className="ios-home__copy" style={{ margin: 0 }}>
                  首页只保留最值得继续推进的入口，其余状态交给右侧监督侧轨。
                </div>
              </div>
            </div>

            <div className="ios-home__grid ios-home__grid--compact">
              {businessFocusCards.slice(0, 2).map(card => (
                <ActionCard
                  key={card.id}
                  eyebrow={card.eyebrow}
                  title={card.title}
                  copy={card.copy}
                  actionLabel={card.actionLabel}
                  onClick={() => {
                    if (card.tab === "settings" && card.controlCenterSectionId) {
                      openControlCenterSection(card.controlCenterSectionId);
                      return;
                    }
                    onOpenTab(card.tab);
                  }}
                />
              ))}
              {activeTemplate && activeSurface
                ? activeSurface.quickActions.slice(0, 2).map(action => (
                  <ActionCard
                    key={action.id}
                    eyebrow={action.eyebrow}
                    title={action.title}
                    copy={action.copy}
                    actionLabel={action.actionLabel}
                    onClick={() => {
                      if (action.tab === "settings" && action.controlCenterSectionId) {
                        openControlCenterSection(action.controlCenterSectionId);
                        return;
                      }
                      onOpenTab(action.tab);
                    }}
                  />
                ))
                : null}
            </div>
          </section>

          <section className="ios-home__focus-section">
            <div className="ios-home__focus-head">
              <div>
                <div className="ios-home__eyebrow">Core Surfaces</div>
                <div className="ios-home__copy" style={{ margin: 0 }}>
                  需要深入处理时，从这里切到具体工作面，不在首页堆更多仪表盘。
                </div>
              </div>
            </div>

            <div className="ios-home__grid ios-home__grid--compact">
              <ActionCard
                eyebrow="Chat"
                title="进入对话页"
                copy="把输入框固定到底部，中间专心看对话，就像 ChatGPT 主聊天页。"
                actionLabel="打开聊天"
                onClick={() => onOpenTab("tasks")}
              />
              <ActionCard
                eyebrow="Desk"
                title="打开工作区"
                copy="文件预览、上下文包、Desk Notes 都还在，但不再抢占主聊天空间。"
                actionLabel="进入工作区"
                onClick={() => onOpenTab("workspace")}
              />
              <ActionCard
                eyebrow="Meet"
                title="发起团队会议"
                copy="当任务需要多角色辩论时，直接切到会议页，不打断聊天页心智。"
                actionLabel="打开会议"
                onClick={() => onOpenTab("meeting")}
              />
              <ActionCard
                eyebrow="Control"
                title="配置与扩展"
                copy="模型、插件、技能、工作流模板都放进控制台，侧边统一收纳。"
                actionLabel="打开控制台"
                onClick={() => onOpenTab("settings")}
              />
            </div>
          </section>
        </div>

        <aside className="ios-home__rail">
          <MobileSupervisionPanel
            approvalCount={scopedApprovals.filter(item => item.status === "pending").length}
            activeRunCount={scopedExecutionRuns.filter(run => run.status === "analyzing" || run.status === "running").length}
            latestRun={scopedExecutionRuns[0] ?? null}
            latestOperation={scopedOperationLogs[0] ?? null}
            approvalItems={mobileApprovalQueue.slice(0, 3)}
            automationPaused={automationPaused}
            automationMode={automationMode}
            remoteSupervisorEnabled={remoteSupervisorEnabled}
            onApproveItem={(item) => {
              setBusinessApprovalDecision({
                entityType: item.entityType,
                entityId: item.entityId,
                status: "approved",
              });

              const canAutoDispatch =
                wsStatus === "connected"
                && !automationPaused
                && automationMode !== "manual"
                && remoteSupervisorEnabled
                && item.decision.autoRunEligible;

              if (!canAutoDispatch) {
                const blockedReason =
                  wsStatus !== "connected"
                    ? "远程通道还没连上"
                    : automationPaused
                      ? "自动化当前已暂停"
                      : automationMode === "manual"
                        ? "当前仍是人工模式"
                        : !remoteSupervisorEnabled
                          ? "远程值守当前关闭"
                          : "量化结果仍建议先观察";

                return {
                  message: `已批准 ${item.title}，但这次没有自动派发，因为${blockedReason}。`,
                };
              }

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
                  ? "人工在移动监督面板批准后立即派发了该业务对象。"
                  : "人工在移动监督面板批准了该业务对象，但发送链路未成功建立。",
                executionRunId: ok ? executionRunId : undefined,
              });

              if (ok && executionRunId) {
                setActiveExecutionRun(executionRunId);
                return {
                  message: `已批准 ${item.title}，并已直接送入执行链路。`,
                  executionRunId,
                };
              }

              return {
                message: `已批准 ${item.title}，但派发链路没有成功建立。`,
              };
            }}
            onRejectItem={(item) => setBusinessApprovalDecision({
              entityType: item.entityType,
              entityId: item.entityId,
              status: "rejected",
            })}
            onToggleAutomationPaused={() => setAutomationPaused(!automationPaused)}
            onToggleRemoteSupervisor={() => setRemoteSupervisorEnabled(!remoteSupervisorEnabled)}
            onOpenRemoteOps={() => openControlCenterSection("remote")}
            onOpenExecution={() => openControlCenterSection("execution")}
            onOpenChat={() => onOpenTab("tasks")}
            onRetryExecution={(run) => {
              const { ok, executionRunId } = sendExecutionDispatch({
                instruction: run.instruction,
                source: run.source,
                includeUserMessage: true,
                taskDescription: `[重试执行] ${run.instruction}`,
                includeActiveProjectMemory: true,
              });

              if (ok && executionRunId) {
                setActiveExecutionRun(executionRunId);
                return {
                  message: "已重新发起这条执行指令。",
                  executionRunId,
                };
              }

              return {
                message: "重试已发起，但发送链路没有成功建立。",
              };
            }}
          />

          <section className="ios-home__rail-panel">
            <ProjectHubCard compact />
            <div className="ios-home__rail-metrics">
              <StatusCard label="运行中角色" value={String(runningCount)} hint="团队当前正在处理的任务数量" />
              <StatusCard label="已完成回复" value={String(completedCount)} hint="本轮会话里已经产出的有效结果" />
              <StatusCard label="工作流 Run" value={String(workflowRuns.length)} hint="可复用的编排入口与历史记录" />
              <StatusCard label="Desk 上下文" value={`${workspacePinnedPreviews.length + scopedDeskNotes.length + scopedProjectMemories.length}`} hint="当前项目下的固定引用、异步笔记和项目记忆总量" />
            </div>
          </section>

          <section className="ios-home__rail-panel ios-home__rail-panel--compact">
            <div className="ios-home__eyebrow">Execution Snapshot</div>
            <ExecutionCenter compact />
          </section>
        </aside>
      </div>
    </div>
  );
}

function MobileSupervisionPanel({
  approvalCount,
  activeRunCount,
  latestRun,
  latestOperation,
  approvalItems,
  automationPaused,
  automationMode,
  remoteSupervisorEnabled,
  onApproveItem,
  onRejectItem,
  onToggleAutomationPaused,
  onToggleRemoteSupervisor,
  onOpenRemoteOps,
  onOpenExecution,
  onOpenChat,
  onRetryExecution,
}: {
  approvalCount: number;
  activeRunCount: number;
  latestRun: ReturnType<typeof useStore.getState>["executionRuns"][number] | null;
  latestOperation: ReturnType<typeof useStore.getState>["businessOperationLogs"][number] | null;
  approvalItems: BusinessAutomationQueueItem[];
  automationPaused: ReturnType<typeof useStore.getState>["automationPaused"];
  automationMode: ReturnType<typeof useStore.getState>["automationMode"];
  remoteSupervisorEnabled: boolean;
  onApproveItem: (item: BusinessAutomationQueueItem) => { message: string; executionRunId?: string };
  onRejectItem: (item: BusinessAutomationQueueItem) => void;
  onToggleAutomationPaused: () => void;
  onToggleRemoteSupervisor: () => void;
  onOpenRemoteOps: () => void;
  onOpenExecution: () => void;
  onOpenChat: () => void;
  onRetryExecution: (
    run: NonNullable<ReturnType<typeof useStore.getState>["executionRuns"][number]>,
  ) => { message: string; executionRunId?: string };
}) {
  const [approvalExpanded, setApprovalExpanded] = useState(false);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [approvalExecutionRunId, setApprovalExecutionRunId] = useState<string | null>(null);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);
  const [retriedExecutionRunId, setRetriedExecutionRunId] = useState<string | null>(null);
  const latestRunEvents = latestRun ? [...latestRun.events].slice(-3).reverse() : [];
  const latestRunAgent = latestRun?.currentAgentId ? AGENT_META[latestRun.currentAgentId] : null;
  const modeLabel = automationPaused
    ? "已暂停"
    : automationMode === "manual"
      ? "人工"
      : automationMode === "supervised"
        ? "监督"
        : "自治";

  return (
    <section className="ios-home__mobile-supervision">
      <div className="ios-home__mobile-supervision-head">
        <div>
          <div className="ios-home__eyebrow">Mobile Supervision</div>
          <div className="ios-home__action-title">手机值守面板</div>
        </div>
        <span className={`control-center__scenario-badge is-${automationPaused ? "blocked" : "ready"}`}>
          {modeLabel}
        </span>
      </div>

      <div className="ios-home__mobile-supervision-grid">
        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-label">待审批</div>
          <div className="ios-home__mobile-supervision-value">{approvalCount}</div>
          <div className="ios-home__mobile-supervision-note">适合手机端先看有没有需要人工拍板的对象。</div>
        </article>
        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-label">运行中</div>
          <div className="ios-home__mobile-supervision-value">{activeRunCount}</div>
          <div className="ios-home__mobile-supervision-note">可以直接跳去执行中心看最新轨迹。</div>
        </article>
      </div>

      <div className="ios-home__mobile-supervision-stack">
        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-label">自动化状态</div>
          <div className="ios-home__mobile-supervision-note">
            当前为 <strong>{modeLabel}</strong>，远程值守 {remoteSupervisorEnabled ? "开启" : "关闭"}。
          </div>
          <div className="ios-home__mobile-supervision-actions">
            <button type="button" className="btn-ghost" onClick={onToggleAutomationPaused}>
              {automationPaused ? "恢复自动化" : "暂停自动化"}
            </button>
            <button type="button" className="btn-ghost" onClick={onToggleRemoteSupervisor}>
              {remoteSupervisorEnabled ? "关闭值守" : "开启值守"}
            </button>
          </div>
        </article>

        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-inline-head">
            <div>
              <div className="ios-home__mobile-supervision-label">待审批队列</div>
              <div className="ios-home__mobile-supervision-note">
                {approvalCount > 0 ? "首页可直接批准或驳回高风险对象。" : "当前没有等待人工确认的业务对象。"}
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setApprovalExpanded(current => !current)}
            >
              {approvalExpanded ? "收起" : approvalCount > 0 ? `展开 ${approvalCount}` : "查看"}
            </button>
          </div>
          {approvalFeedback ? (
            <div className="ios-home__mobile-supervision-feedback">
              <div>{approvalFeedback}</div>
              {approvalExecutionRunId ? (
                <div className="ios-home__mobile-supervision-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn-ghost" onClick={onOpenExecution}>
                    查看刚刚执行
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {approvalExpanded ? (
            <div className="ios-home__mobile-supervision-approval-list">
              {approvalItems.length > 0 ? approvalItems.map(item => (
                <article key={`${item.entityType}-${item.entityId}`} className="ios-home__mobile-supervision-approval-item">
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong style={{ fontSize: 13 }}>{item.title}</strong>
                    <div className="ios-home__mobile-supervision-note">{item.subtitle}</div>
                    <div className="ios-home__mobile-supervision-note">{item.summary}</div>
                  </div>
                  <div className="ios-home__mobile-supervision-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        const result = onApproveItem(item);
                        setApprovalFeedback(result.message);
                        setApprovalExecutionRunId(result.executionRunId ?? null);
                      }}
                    >
                      批准
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        onRejectItem(item);
                        setApprovalFeedback(`已驳回 ${item.title}，审计记录会保留这次处理。`);
                        setApprovalExecutionRunId(null);
                      }}
                    >
                      驳回
                    </button>
                  </div>
                </article>
              )) : (
                <div className="ios-home__mobile-supervision-note">
                  当前项目没有待审批对象，可以直接盯执行和远程值守状态。
                </div>
              )}
            </div>
          ) : null}
        </article>

        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-inline-head">
            <div>
              <div className="ios-home__mobile-supervision-label">最近执行</div>
              <div className="ios-home__mobile-supervision-note">
                {latestRun ? latestRun.instruction : "当前项目还没有执行 run。"}
              </div>
            </div>
            {latestRun ? (
              <span className={`control-center__scenario-badge is-${getMobileExecutionTone(latestRun.status)}`}>
                {getMobileExecutionLabel(latestRun.status)}
              </span>
            ) : null}
          </div>
          {latestRun ? (
            <>
              <div className="ios-home__mobile-supervision-meta">
                <span>来源 {latestRun.source}</span>
                <span>{latestRunAgent ? `${latestRunAgent.emoji} ${latestRunAgent.name}` : "待分配"}</span>
                <span>更新于 {timeAgo(latestRun.updatedAt)}</span>
              </div>
              {latestRunEvents.length > 0 ? (
                <div className="ios-home__mobile-supervision-event-list">
                  {latestRunEvents.map(event => (
                    <div key={event.id} className="ios-home__mobile-supervision-event">
                      <div className="ios-home__mobile-supervision-event-title">{event.title}</div>
                      {event.detail ? (
                        <div className="ios-home__mobile-supervision-note">{event.detail}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {executionFeedback ? (
                <div className="ios-home__mobile-supervision-feedback">
                  <div>{executionFeedback}</div>
                  {retriedExecutionRunId ? (
                    <div className="ios-home__mobile-supervision-actions" style={{ marginTop: 8 }}>
                      <button type="button" className="btn-ghost" onClick={onOpenExecution}>
                        查看重试执行
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="ios-home__mobile-supervision-actions">
            <button type="button" className="btn-ghost" onClick={onOpenExecution}>
              打开执行中心
            </button>
            {latestRun?.status === "failed" ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const result = onRetryExecution(latestRun);
                  setExecutionFeedback(result.message);
                  setRetriedExecutionRunId(result.executionRunId ?? null);
                }}
              >
                一键重试
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={onOpenChat}>
              {latestRun?.status === "failed" ? "回到聊天接管" : "去聊天接管"}
            </button>
          </div>
        </article>

        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-label">最近审计动作</div>
          <div className="ios-home__mobile-supervision-note">
            {latestOperation
              ? `${latestOperation.title} · ${latestOperation.detail}`
              : "当前项目还没有业务审计记录。"}
          </div>
          <div className="ios-home__mobile-supervision-actions">
            <button type="button" className="btn-ghost" onClick={onOpenRemoteOps}>
              打开远程值守
            </button>
            {latestOperation?.executionRunId ? (
              <button type="button" className="btn-ghost" onClick={onOpenExecution}>
                查看对应执行
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}

function TasksTab() {
  const tasks = useStore(s => s.tasks);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const chatStarters = activeSurface?.chatStarters ?? CHAT_STARTERS;

  return (
    <div className="ios-chat-page">
      <section className="ios-chat-page__surface">
        <div className="ios-chat-page__header">
          <div>
            <div className="ios-chat-page__eyebrow">Conversation</div>
            <div className="ios-chat-page__title">中轴对话区</div>
          </div>
          <div className="ios-chat-page__meta">
            <span>{tasks.length} 条消息</span>
            <span>Enter 发送</span>
            <span>Shift + Enter 换行</span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="ios-chat-page__empty">
            <div className="ios-chat-page__empty-badge">New Chat</div>
            <div className="ios-chat-page__empty-title">先用一句话告诉团队，你现在想推进什么。</div>
            <div className="ios-chat-page__empty-copy">
              这里保留和 ChatGPT 类似的中轴对话体验。你可以直接发目标，也可以先点一个起手式，再继续补充上下文。
            </div>
            <div className="ios-chat-page__empty-actions">
              {chatStarters.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className="ios-chat-page__empty-prompt"
                  onClick={() => setCommandDraft(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ios-chat-page__stream">
            <TaskPipeline fillHeight />
          </div>
        )}

        <div className="ios-chat-page__composer">
          <CommandInput
            variant="dock"
            title="给团队继续发消息"
            hint="主对话区保持干净，中间只看消息流；所有辅助能力都放在左侧。"
          />
        </div>
      </section>
    </div>
  );
}

function WorkspaceTab() {
  return (
    <div className="ios-feature-page">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">Workspace</div>
        <div className="ios-feature-page__title">工作区与引用上下文</div>
      </div>
      <WorkspaceDesk />
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="ios-feature-page">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">Control Center</div>
        <div className="ios-feature-page__title">所有功能都在侧栏入口，深层配置留在这里</div>
      </div>
      <ControlCenter />
    </div>
  );
}

function SidebarSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="ios-chat-shell__sidebar-section">
      <div className="ios-chat-shell__sidebar-section-head">
        <div className="ios-chat-shell__sidebar-section-title">{title}</div>
        <div className="ios-chat-shell__sidebar-section-subtitle">{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="ios-chat-shell__status-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="ios-home__status-card">
      <div className="ios-home__status-label">{label}</div>
      <div className="ios-home__status-value">{value}</div>
      <div className="ios-home__status-hint">{hint}</div>
    </article>
  );
}

function ActionCard({
  eyebrow,
  title,
  copy,
  actionLabel,
  onClick,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <article className="ios-home__action-card">
      <div className="ios-home__action-eyebrow">{eyebrow}</div>
      <div className="ios-home__action-title">{title}</div>
      <div className="ios-home__action-copy">{copy}</div>
      <button type="button" className="btn-ghost" onClick={onClick}>
        {actionLabel}
      </button>
    </article>
  );
}

function getMobileExecutionTone(status: ReturnType<typeof useStore.getState>["executionRuns"][number]["status"]) {
  if (status === "completed") return "ready";
  if (status === "failed") return "blocked";
  return "partial";
}

function getMobileExecutionLabel(status: ReturnType<typeof useStore.getState>["executionRuns"][number]["status"]) {
  switch (status) {
    case "queued":
      return "已排队";
    case "analyzing":
      return "分析中";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "failed":
      return "已失败";
    default:
      return status;
  }
}

function getVerificationLabel(status: NonNullable<ReturnType<typeof useStore.getState>["executionRuns"][number]["verificationStatus"]>) {
  switch (status) {
    case "idle":
      return "待验证";
    case "running":
      return "验证中";
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "skipped":
      return "跳过";
    default:
      return status;
  }
}

function getExecutionProgressPercent(run: ReturnType<typeof useStore.getState>["executionRuns"][number]) {
  if (!run.totalTasks || run.totalTasks <= 0) {
    if (run.status === "completed") return 100;
    return run.status === "failed" ? 100 : 12;
  }

  const ratio = Math.max(0, Math.min(1, run.completedTasks / run.totalTasks));
  const percent = Math.round(ratio * 100);

  if (run.status === "completed") return 100;
  if (run.status === "failed") return Math.max(percent, 18);
  if (run.status === "running" || run.status === "analyzing") return Math.max(percent, 12);
  return Math.max(percent, 6);
}

function getWorkflowStatusLabel(status: ReturnType<typeof useStore.getState>["workflowRuns"][number]["status"]) {
  switch (status) {
    case "queued":
      return "待排队";
    case "staged":
      return "已暂存";
    case "in-progress":
      return "进行中";
    case "completed":
      return "已完成";
    case "archived":
      return "已归档";
    default:
      return status;
  }
}

function getDashboardBusinessFocus(
  activeTemplateId: ReturnType<typeof useStore.getState>["activeTeamOperatingTemplateId"],
  counts: {
    customers: number;
    leads: number;
    tickets: number;
    contentTasks: number;
    channelSessions: number;
  },
): Array<{
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  actionLabel: string;
  tab: AppTab;
  controlCenterSectionId?: ControlCenterSectionId;
}> {
  if (activeTemplateId === "support") {
    return [
      {
        id: "support-customers",
        eyebrow: "Customers",
        title: `客户与会话 · ${counts.customers + counts.channelSessions}`,
        copy: `当前项目下有 ${counts.customers} 个客户、${counts.channelSessions} 个渠道会话，适合先检查值守响应与接待质量。`,
        actionLabel: "查看控制台",
        tab: "settings" as const,
        controlCenterSectionId: "entities",
      },
      {
        id: "support-tickets",
        eyebrow: "Tickets",
        title: `待跟进工单 · ${counts.tickets}`,
        copy: `客服模式下先盯工单推进和售后处理，避免响应链路堆积。`,
        actionLabel: "进入聊天",
        tab: "tasks" as const,
      },
    ];
  }

  if (activeTemplateId === "content") {
    return [
      {
        id: "content-tasks",
        eyebrow: "Content",
        title: `内容任务 · ${counts.contentTasks}`,
        copy: `当前项目下有 ${counts.contentTasks} 个内容任务，可优先推进脚本、视觉和发布节奏。`,
        actionLabel: "查看控制台",
        tab: "settings" as const,
        controlCenterSectionId: "entities",
      },
      {
        id: "content-leads",
        eyebrow: "Signals",
        title: `选题线索 · ${counts.leads}`,
        copy: `线索数量可以帮助判断哪些主题值得转成内容工单继续跟进。`,
        actionLabel: "进入工作区",
        tab: "workspace" as const,
      },
    ];
  }

  return [
    {
      id: "engineering-leads",
      eyebrow: "Pipeline",
      title: `研发相关线索 · ${counts.leads}`,
      copy: `当前项目有 ${counts.leads} 条业务线索，可以帮助判断最值得先实现或联调的能力。`,
      actionLabel: "查看控制台",
      tab: "settings" as const,
      controlCenterSectionId: "entities",
    },
    {
      id: "engineering-tickets",
      eyebrow: "Execution",
      title: `待收敛问题 · ${counts.tickets}`,
      copy: `工单与会话数量能反映当前产品缺口，适合转成研发修复和流程优化动作。`,
      actionLabel: "进入聊天",
      tab: "tasks" as const,
    },
  ];
}

function MeetingTab() {
  const [topic, setTopic] = useState("");
  const { wsStatus, meetingSpeeches, meetingActive, clearMeeting, setMeetingActive, setMeetingTopic } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [meetingSpeeches]);

  const startMeeting = () => {
    if (!topic.trim() || meetingActive || wsStatus !== "connected") return;
    clearMeeting();
    setMeetingTopic(topic.trim());
    setMeetingActive(true);
    const { providers, agentConfigs, userNickname, desktopProgramSettings } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs, userNickname, desktopProgramSettings });
    sendWs({ type: "meeting", topic: topic.trim() });
  };

  const agentInfo: Record<string, { name: string; emoji: string; color: string }> = {
    orchestrator: { name: "虾总管", emoji: "🦞", color: "var(--accent)" },
    explorer: { name: "探海龙虾", emoji: "🔎", color: "#38bdf8" },
    writer: { name: "执笔龙虾", emoji: "✍️", color: "#34c759" },
    designer: { name: "幻影龙虾", emoji: "🎨", color: "#ff5c8a" },
    performer: { name: "戏精龙虾", emoji: "🎬", color: "#ff9f0a" },
    greeter: { name: "迎客龙虾", emoji: "💬", color: "#00c7be" },
  };

  const roleLabel: Record<string, string> = {
    open: "开场",
    speak: "观点",
    rebuttal: "辩论",
    summary: "结论",
  };

  return (
    <section className="meeting-shell ios-feature-page">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">Meeting</div>
        <div className="ios-feature-page__title">需要多人观点时，切到会议模式集中讨论</div>
      </div>

      <div className="meeting-shell__composer">
        <input
          className="input"
          placeholder="输入会议议题，例如：下一版产品首页该怎么改？"
          value={topic}
          onChange={event => setTopic(event.target.value)}
          onKeyDown={event => event.key === "Enter" && startMeeting()}
          disabled={meetingActive}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={startMeeting}
          disabled={meetingActive || !topic.trim() || wsStatus !== "connected"}
        >
          {meetingActive ? "讨论中..." : "开始会议"}
        </button>
      </div>

      <div ref={scrollRef} className="meeting-shell__stream">
        {meetingSpeeches.length === 0 && !meetingActive && (
          <div className="meeting-shell__empty">发起议题后，团队发言会实时出现在这里。</div>
        )}

        {meetingSpeeches.map(speech => {
          const info = agentInfo[speech.agentId] ?? { name: speech.agentId, emoji: "🦞", color: "var(--accent)" };
          const isSummary = speech.role === "summary";

          return (
            <div key={speech.id} className="meeting-shell__item">
              <div
                className="meeting-shell__avatar"
                style={{
                  background: `color-mix(in srgb, ${info.color} 18%, white)`,
                  borderColor: isSummary ? info.color : "var(--border)",
                  boxShadow: isSummary ? `0 0 16px color-mix(in srgb, ${info.color} 18%, transparent)` : "none",
                }}
              >
                {info.emoji}
              </div>

              <div className="meeting-shell__bubble-wrap">
                <div className="meeting-shell__meta">
                  <span style={{ color: info.color, fontWeight: 700 }}>{info.name}</span>
                  <span className="meeting-shell__role" style={{ color: info.color }}>
                    {roleLabel[speech.role] ?? speech.role}
                  </span>
                </div>
                <div
                  className="meeting-shell__bubble"
                  style={{
                    background: isSummary
                      ? `color-mix(in srgb, ${info.color} 10%, rgba(255,255,255,0.88))`
                      : "rgba(255,255,255,0.86)",
                    borderColor: isSummary
                      ? `color-mix(in srgb, ${info.color} 46%, transparent)`
                      : "var(--border)",
                  }}
                >
                  {speech.text}
                </div>
              </div>
            </div>
          );
        })}

        {meetingActive && <div className="meeting-shell__loading">团队正在讨论中...</div>}
      </div>
    </section>
  );
}
