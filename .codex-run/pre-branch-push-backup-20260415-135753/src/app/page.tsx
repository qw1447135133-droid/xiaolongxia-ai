"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import { sendWs } from "@/hooks/useWebSocket";
import { checkAndExecuteTasks } from "@/lib/scheduled-tasks";
import { ChatSessionsPanel } from "@/components/ChatSessionsPanel";
import { TaskPipeline } from "@/components/TaskPipeline";
import { ActivityPanel } from "@/components/ActivityPanel";
import { CommandInput } from "@/components/CommandInput";
import { PresetTasksPanel } from "@/components/PresetTasksPanel";
import { ScheduledTasksPanel } from "@/components/ScheduledTasksPanel";
import { MeetingRecordPanel } from "@/components/MeetingRecordPanel";
import { AgentGrid } from "@/components/AgentGrid";
import { WorkspaceWelcome } from "@/components/WorkspaceWelcome";
import { WorkspaceStatusBar } from "@/components/WorkspaceStatusBar";
import { DesktopShellBehaviors } from "@/components/DesktopShellBehaviors";
import { ControlCenter } from "@/components/ControlCenter";
import { PluginContributionPanel } from "@/components/PluginContributionPanel";
import { WorkspaceDesk } from "@/components/WorkspaceDesk";
<<<<<<< Updated upstream
=======
import {
  createSemanticMemoryProvider,
  registerSemanticMemoryProvider,
  resetSemanticMemoryProvider,
} from "@/lib/semantic-memory";
import { timeAgo } from "@/lib/utils";
import { AGENT_META, getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { AppTab, ControlCenterSectionId } from "@/store/types";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { buildContentWorkflowRunPayload, findLatestWorkflowRunForEntity } from "@/lib/workflow-runtime";
>>>>>>> Stashed changes

type AppTab = "dashboard" | "tasks" | "workspace" | "meeting" | "settings";

const TAB_LABELS: Array<{ id: AppTab; label: string }> = [
  { id: "dashboard", label: "概览" },
  { id: "tasks", label: "对话流" },
  { id: "workspace", label: "工作区" },
  { id: "meeting", label: "会议室" },
  { id: "settings", label: "控制中心" },
];

<<<<<<< Updated upstream
=======
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
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("desktop-client") === "electron"
    || params.get("electronSafe") === "1"
    || params.get("electron") === "1"
    || params.get("desktop") === "electron"
    || params.get("runtime") === "electron"
    || params.get("shell") === "electron"
    || params.get("target") === "electron"
    || params.get("platform") === "electron"
    || params.get("client") === "electron"
    || params.get("app") === "electron"
    || Boolean(window.__XLX_ELECTRON__)
    || Boolean(window.electronAPI?.isElectron)
    || document.documentElement?.dataset?.runtime === "electron"
    || document.documentElement?.classList?.contains("runtime-electron")
    || /electron/i.test(window.navigator.userAgent || "")
  );
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

function buildWorkflowContextSnapshotFromStore(store: ReturnType<typeof useStore.getState>) {
  const activeSession = store.chatSessions.find(session => session.id === store.activeSessionId) ?? null;
  return {
    deskRefs: store.workspacePinnedPreviews.length,
    deskNotes: filterByProjectScope(store.workspaceDeskNotes, activeSession ?? {}).length,
    contextPacks: filterByProjectScope(store.workspaceSavedBundles, activeSession ?? {}).length,
    plugins: store.enabledPluginIds.length,
  };
}

function prepareContentTaskWorkflowDispatch(
  store: ReturnType<typeof useStore.getState>,
  entityId: string,
) {
  const task = store.businessContentTasks.find(item => item.id === entityId) ?? null;
  if (!task) {
    return null;
  }

  const existingRun = findLatestWorkflowRunForEntity(store.workflowRuns, "contentTask", entityId);
  const reusableRun = existingRun && existingRun.status !== "completed" && existingRun.status !== "archived"
    ? existingRun
    : null;

  if (reusableRun) {
    store.startWorkflowRun(reusableRun.id);
    return {
      task,
      workflowRunId: reusableRun.id,
      instruction: reusableRun.draft,
      workflowTitle: reusableRun.title,
    };
  }

  const payload = buildContentWorkflowRunPayload(task, buildWorkflowContextSnapshotFromStore(store));
  const workflowRunId = store.queueWorkflowRun(payload);
  store.startWorkflowRun(workflowRunId);
  return {
    task,
    workflowRunId,
    instruction: payload.draft,
    workflowTitle: payload.title,
  };
}

>>>>>>> Stashed changes
export default function App() {
  useWebSocket();
  const runtimeTarget = useRuntimeTarget();
  const shouldRenderElectronSafeApp =
    runtimeTarget === "electron"
    || (typeof window !== "undefined" && detectElectronRuntime());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { providers, agentConfigs } = useStore.getState();
      sendWs({ type: "settings_sync", providers, agentConfigs });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
<<<<<<< Updated upstream
=======
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
        updateBusinessContentTask,
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

      const workflowDispatch = nextItem.entityType === "contentTask"
        ? prepareContentTaskWorkflowDispatch(store, nextItem.entityId)
        : null;

      const { ok, executionRunId } = sendExecutionDispatch({
        instruction: workflowDispatch?.instruction ?? nextItem.instruction,
        source: "remote-ops",
        includeUserMessage: true,
        taskDescription: `${nextItem.taskDescription} [自动值守]`,
        includeActiveProjectMemory: true,
      });

      if (workflowDispatch) {
        updateBusinessContentTask(workflowDispatch.task.id, {
          lastWorkflowRunId: workflowDispatch.workflowRunId,
          lastExecutionRunId: ok ? executionRunId : workflowDispatch.task.lastExecutionRunId,
          lastOperationAt: Date.now(),
        });
        recordBusinessOperation({
          entityType: "contentTask",
          entityId: workflowDispatch.task.id,
          eventType: "workflow",
          trigger: "auto",
          status: ok ? "sent" : "blocked",
          title: workflowDispatch.workflowTitle,
          detail: ok
            ? "系统已为内容任务关联工作流，并按工作流草稿发起自动值守执行。"
            : "系统已关联工作流，但执行链路未成功建立。",
          executionRunId: ok ? executionRunId : undefined,
        });
      }

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

>>>>>>> Stashed changes
    const checkInterval = window.setInterval(() => {
      checkAndExecuteTasks((task) => {
        const { providers, agentConfigs } = useStore.getState();
        sendWs({ type: "settings_sync", providers, agentConfigs });
        sendWs({ type: "dispatch", instruction: task.instruction });
      });
    }, 60000);

    return () => window.clearInterval(checkInterval);
  }, []);

  const {
    leftOpen,
    rightOpen,
    activeTab,
    toggleLeft,
    toggleRight,
    setTab,
    createChatSession,
    wsStatus,
    cost,
    agents,
  } = useStore();

  const running = useMemo(
    () => Object.values(agents).filter(agent => agent.status === "running").length,
    [agents],
  );

  const showLeftSidebar = activeTab === "tasks" || activeTab === "meeting";
  const showRightSidebar = activeTab === "tasks" || activeTab === "meeting";

  if (shouldRenderElectronSafeApp) {
    return <ElectronSafeApp />;
  }

  return (
    <div className="shell-root">
      <DesktopShellBehaviors />

<<<<<<< Updated upstream
      <header className="shell-header">
        <div className="shell-header__left">
          {showLeftSidebar && (
            <button type="button" className="shell-header__toggle" onClick={() => toggleLeft()} title="切换左侧栏">
              {leftOpen ? "◧" : "◨"}
            </button>
=======
      <div className="ios-chat-shell__layout animate-fade-in">
        <aside className={`ios-chat-shell__sidebar ${leftOpen ? "" : "is-collapsed"}`}>
          {leftOpen ? (
            <>
              <div className="ios-chat-shell__sidebar-top">
                <div className="ios-chat-shell__brand ios-chat-shell__brand--minimal">
                  <div className="ios-chat-shell__brand-copy">
                    <div className="ios-chat-shell__brand-title">貝伯盈CRAW</div>
                  </div>
                </div>

                <button
                  type="button"
                  className="ios-chat-shell__sidebar-collapse"
                  onClick={() => toggleLeft()}
                  aria-label={uiText.common.hideSidebar}
                  title={uiText.common.hideSidebar}
                >
                  <SidebarPanelIcon />
                </button>
              </div>

              <nav className="ios-chat-shell__nav">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ios-chat-shell__nav-item ${activeTab === item.id ? "is-active" : ""}`}
                    onClick={() => setTab(item.id)}
                  >
                    <span className="ios-chat-shell__nav-icon"><NavItemIcon id={item.id} /></span>
                    <span className="ios-chat-shell__nav-label">{item.label}</span>
                  </button>
                ))}
              </nav>

              <div className="ios-chat-shell__sidebar-footer">
                {sidebarSummary.map(item => (
                  <div key={item.label} className="ios-chat-shell__sidebar-mini">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="ios-chat-shell__sidebar-rail">
              <button
                type="button"
                className="ios-chat-shell__sidebar-collapse"
                onClick={() => toggleLeft()}
                aria-label={uiText.common.showSidebar}
                title={uiText.common.showSidebar}
              >
                <SidebarPanelIcon />
              </button>
            </div>
>>>>>>> Stashed changes
          )}
          <div className="shell-brand">
            <div className="shell-brand__mark">龙</div>
            <div>
              <div className="shell-brand__eyebrow">Lobster Crew OS</div>
              <div className="shell-brand__title">小龙虾 AI 工作台</div>
            </div>
          </div>
        </div>

        <nav className="shell-tabs">
          {TAB_LABELS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`shell-tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="shell-header__right">
          <div className="shell-metric">
            <span className="shell-metric__label">连接</span>
            <strong>{wsStatus === "connected" ? "在线" : wsStatus === "connecting" ? "连接中" : "离线"}</strong>
          </div>
          <div className="shell-metric">
            <span className="shell-metric__label">运行中</span>
            <strong>{running}</strong>
          </div>
          <div className="shell-metric">
            <span className="shell-metric__label">Tokens</span>
            <strong>{cost.totalTokens.toLocaleString()}</strong>
          </div>
          {showRightSidebar && (
            <button type="button" className="shell-header__toggle" onClick={() => toggleRight()} title="切换右侧栏">
              {rightOpen ? "◨" : "◧"}
            </button>
          )}
        </div>
      </header>

      <div className="shell-body">
        {showLeftSidebar && leftOpen && (
          <aside className="shell-sidebar shell-sidebar--left">
            <div className="shell-sidebar__header">
              <div>
                <div className="shell-sidebar__eyebrow">Sessions & Tasks</div>
                <div className="shell-sidebar__title">{activeTab === "tasks" ? "会话与任务" : "团队状态"}</div>
              </div>
              {activeTab === "tasks" && (
                <div className="shell-sidebar__actions">
                  <button type="button" className="btn-ghost" onClick={() => createChatSession()}>
                    新建
                  </button>
                </div>
              )}
            </div>

            <div className="shell-sidebar__scroll">
              {activeTab === "tasks" && (
                <>
                  <ChatSessionsPanel showHeader={false} />
                  <div style={{ marginTop: '1rem' }}>
                    <PresetTasksPanel onSelectTask={(instruction) => {
                      const { providers, agentConfigs } = useStore.getState();
                      sendWs({ type: "settings_sync", providers, agentConfigs });
                      sendWs({ type: "dispatch", instruction });
                    }} />
                    <ScheduledTasksPanel onExecuteTask={(instruction) => {
                      const { providers, agentConfigs } = useStore.getState();
                      sendWs({ type: "settings_sync", providers, agentConfigs });
                      sendWs({ type: "dispatch", instruction });
                    }} />
                  </div>
                </>
              )}
              {activeTab === "meeting" && (
                <AgentGrid />
              )}
            </div>
          </aside>
        )}

        <main className="shell-main">
          <div className="shell-main__content">
            {activeTab === "dashboard" && <DashboardTab />}
            {activeTab === "tasks" && <TasksTab />}
            {activeTab === "workspace" && <WorkspaceDesk />}
            {activeTab === "meeting" && <MeetingTab />}
            {activeTab === "settings" && <ControlCenter />}
          </div>

          {(activeTab === "tasks" || activeTab === "dashboard") && <CommandInput />}
        </main>

        {showRightSidebar && rightOpen && (
          <aside className="shell-sidebar shell-sidebar--right">
            <div className="shell-sidebar__header">
              <div>
                <div className="shell-sidebar__eyebrow">Activity & Records</div>
                <div className="shell-sidebar__title">运行与记录</div>
              </div>
            </div>

            <div className="shell-sidebar__stack">
              {activeTab === "meeting" && <MeetingRecordPanel />}
              {activeTab === "tasks" && (
                <div className="shell-sidebar__activity">
                  <ActivityPanel />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <WorkspaceStatusBar />
    </div>
  );
}

<<<<<<< Updated upstream
function DashboardTab() {
=======
function ElectronSafeApp() {
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
<<<<<<< Updated upstream
            <div className="desktop-workspace-shell__brand-mark">龙</div>
            <div>
              <div className="desktop-workspace-shell__eyebrow">Desktop Workspace</div>
              <div className="desktop-workspace-shell__title">小龙虾 AI 团队</div>
=======
            <div>
              <div className="desktop-workspace-shell__title">{uiText.common.desktopBrandTitle}</div>
>>>>>>> Stashed changes
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
          {activeTab === "tasks" ? (
            <DesktopChatWorkspace />
          ) : null}
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
  const tasks = useStore(s => s.tasks);
  const workflowRuns = useStore(s => s.workflowRuns);
  const executionRuns = useStore(s => s.executionRuns);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const chatStarters = activeSurface?.chatStarters ?? CHAT_STARTERS;
  const runningExecutions = executionRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const recentRun = executionRuns[0] ?? null;
  const recentFailedRun = executionRuns.find(run => run.status === "failed") ?? null;
  const canTakeOver = desktopInputSession.state === "manual-required" && Boolean(desktopInputSession.resumeInstruction);

  const openExecutionRun = (runId: string) => {
    setActiveExecutionRun(runId);
    setTab("settings");
  };

  const handoffToChat = () => {
    if (desktopInputSession.resumeInstruction) {
      useStore.getState().setCommandDraft(desktopInputSession.resumeInstruction);
    } else if (recentFailedRun) {
      useStore.getState().setCommandDraft(`继续处理这次失败执行，并优先给出接管建议：\n${recentFailedRun.instruction}`);
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
      setActiveExecutionRun(executionRunId);
      setTab("settings");
    } else {
      useStore.getState().setCommandDraft(`重试这次失败执行，并先分析失败原因后再继续：\n${run.instruction}`);
      setTab("tasks");
    }
  };

  return (
    <div className="desktop-workspace-shell__chat-layout">
      <section className="desktop-workspace-shell__chat-main">
        <TasksTab />
      </section>

      <aside className="desktop-workspace-shell__chat-rail">
        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">对话状态</div>
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
              <strong>{workflowRuns.length}</strong>
            </article>
          </div>
        </section>

        {recentRun ? (
          <section className="desktop-workspace-shell__rail-card">
            <div className="desktop-workspace-shell__section-eyebrow">最近执行</div>
            <div className="desktop-workspace-shell__rail-run">
              <strong>{recentRun.instruction}</strong>
              <div className="desktop-workspace-shell__rail-run-meta">
                <span>{getMobileExecutionLabel(recentRun.status)}</span>
                <span>{timeAgo(recentRun.updatedAt)}</span>
                <span>{recentRun.events.length} 条轨迹</span>
              </div>
            </div>
            <div className="desktop-workspace-shell__rail-actions">
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => openExecutionRun(recentRun.id)}>
                查看轨迹
              </button>
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={handoffToChat}>
                去聊天接管
              </button>
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
              <button type="button" className="desktop-workspace-shell__hero-action" onClick={handoffToChat}>
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
            <div className="desktop-workspace-shell__rail-actions">
              <button type="button" className="desktop-workspace-shell__hero-action is-primary" onClick={handoffToChat}>
                回到聊天接管
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
            </div>
          </section>
        ) : null}

        <section className="desktop-workspace-shell__rail-card">
          <div className="desktop-workspace-shell__section-eyebrow">推荐起手式</div>
          <div className="desktop-workspace-shell__rail-prompts">
            {chatStarters.map(prompt => (
              <button
                key={prompt}
                type="button"
                className="desktop-workspace-shell__rail-prompt"
                onClick={() => {
                  useStore.getState().setCommandDraft(prompt);
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
>>>>>>> Stashed changes
  const tasks = useStore(s => s.tasks);
  const cost = useStore(s => s.cost);
  const agents = useStore(s => s.agents);

  const running = Object.values(agents).filter(agent => agent.status === "running").length;
  const doneTasks = tasks.filter(task => task.status === "done").length;

  return (
    <div className="workspace-grid">
      <WorkspaceWelcome />

      <div className="workspace-grid__stats">
        {[
          { label: "运行中 Agent", value: running, color: "var(--warning)" },
          { label: "完成任务", value: doneTasks, color: "var(--success)" },
          { label: "总 Tokens", value: cost.totalTokens.toLocaleString(), color: "var(--accent)" },
          { label: "预估成本", value: `$${cost.totalCostUsd.toFixed(4)}`, color: "#c4b5fd" },
        ].map(stat => (
          <div key={stat.label} className="workspace-stat">
            <div className="workspace-stat__value" style={{ color: stat.color }}>{stat.value}</div>
            <div className="workspace-stat__label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="workspace-grid__split">
        <section className="workspace-card">
          <div className="workspace-card__head">
            <div>
              <div className="workspace-card__eyebrow">Team Matrix</div>
              <div className="workspace-card__title">团队状态</div>
            </div>
          </div>
          <AgentGrid />
        </section>

        <section className="workspace-card">
          <div className="workspace-card__head">
            <div>
              <div className="workspace-card__eyebrow">Plugin Contributions</div>
              <div className="workspace-card__title">插件贡献</div>
            </div>
          </div>
          <PluginContributionPanel />
        </section>
      </div>
    </div>
  );
}

function TasksTab() {
  return (
    <div className="tasks-layout">
      <section className="tasks-layout__main" style={{ width: '100%', height: '100%' }}>
        <div className="tasks-layout__workspace" style={{ padding: 0 }}>
          <section className="workspace-card tasks-layout__conversation" style={{ height: '100%', border: 'none', background: 'transparent' }}>
            <div className="workspace-card__head">
              <div>
                <div className="workspace-card__eyebrow">Conversation Flow</div>
                <div className="workspace-card__title">实时任务对话</div>
              </div>
            </div>
            <TaskPipeline fillHeight />
          </section>
        </div>
      </section>
    </div>
  );
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
    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    sendWs({ type: "meeting", topic: topic.trim() });
  };

  const agentInfo: Record<string, { name: string; emoji: string; color: string }> = {
    orchestrator: { name: "虾总管", emoji: "🦞", color: "var(--accent)" },
    explorer: { name: "探海龙虾", emoji: "🔎", color: "#38bdf8" },
    writer: { name: "执笔龙虾", emoji: "✍️", color: "#a3e635" },
    designer: { name: "幻影龙虾", emoji: "🎨", color: "#f472b6" },
    performer: { name: "戏精龙虾", emoji: "🎬", color: "#fb923c" },
    greeter: { name: "迎客龙虾", emoji: "💬", color: "#34d399" },
  };

  const roleLabel: Record<string, string> = {
    open: "开场",
    speak: "观点",
    rebuttal: "辩论",
    summary: "结论",
  };

  return (
    <section className="meeting-shell">
      <div className="meeting-shell__head">
        <div>
          <div className="meeting-shell__eyebrow">Round Table</div>
          <div className="meeting-shell__title">团队多主体会诊会议</div>
        </div>
      </div>

      <div className="meeting-shell__composer">
        <input
          className="input"
          placeholder="输入会议议题，例如：本周主推产品如何分工推进？"
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
        {meetingSpeeches.length > 0 && !meetingActive && (
          <button type="button" className="btn-ghost" onClick={() => { clearMeeting(); setTopic(""); }}>
            清空
          </button>
        )}
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
                  background: `color-mix(in srgb, ${info.color} 18%, var(--bg-card))`,
                  borderColor: isSummary ? info.color : "var(--border)",
                  boxShadow: isSummary ? `0 0 12px color-mix(in srgb, ${info.color} 30%, transparent)` : "none",
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
                      ? `color-mix(in srgb, ${info.color} 10%, var(--bg-card))`
                      : "var(--bg-card)",
                    borderColor: isSummary
                      ? `color-mix(in srgb, ${info.color} 55%, transparent)`
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