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
import { HermesDispatchCenter } from "@/components/HermesDispatchCenter";
import { ProjectHubCard } from "@/components/ProjectHubCard";
import { WorkspaceDesk } from "@/components/WorkspaceDesk";
import {
  createSemanticMemoryProvider,
  registerSemanticMemoryProvider,
  resetSemanticMemoryProvider,
} from "@/lib/semantic-memory";
import { timeAgo } from "@/lib/utils";
import { AGENT_META, getTeamOperatingTemplate, PLATFORM_DEFINITIONS, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { AppTab, ControlCenterSectionId, UiLocale } from "@/store/types";
import { retryExecutionDispatch, sendExecutionDispatch } from "@/lib/execution-dispatch";
import { detectElectronRuntimeWindow } from "@/lib/electron-runtime";
import { runExecutionVerification } from "@/lib/execution-verification";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import {
  UI_LOCALE_OPTIONS,
  formatAutomationModeLabel,
  formatWsStatusLabel,
  getDefaultChatStarters,
  getDefaultHomePrompts,
  getPrimaryNavItems,
  getUiText,
  pickLocaleText,
} from "@/lib/ui-locale";

function detectElectronRuntime() {
  if (typeof window === "undefined") return false;
  return detectElectronRuntimeWindow(window);
}

function useRuntimeTarget() {
  const [runtimeTarget, setRuntimeTarget] = useState<"web" | "electron">("web");

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
  const [isClientReady, setIsClientReady] = useState(false);
  const runtimeTarget = useRuntimeTarget();
  const shouldRenderDesktopWorkspace = runtimeTarget === "electron";
  const locale = useStore(s => s.locale);
  const navItems = useMemo(() => getPrimaryNavItems(locale), [locale]);
  const uiText = useMemo(() => getUiText(locale), [locale]);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncRuntimeSettings();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

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
    if (desktopRuntimeTone.tone === "ready") return uiText.common.online;
    if (desktopRuntimeTone.tone === "partial") return uiText.common.partial;
    return uiText.common.offline;
  }, [desktopRuntimeTone.tone, uiText.common.offline, uiText.common.online, uiText.common.partial]);

  const activeNav = navItems.find(item => item.id === activeTab) ?? navItems[0];
  const preferredControlSection = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]?.recommendedSectionIds[0] ?? "overview"
    : "overview";
  const openTopbarControlCenter = () => {
    if (activeControlCenterSectionId === "overview") {
      setActiveControlCenterSection(preferredControlSection);
    }
    setTab("settings");
  };

  if (!isClientReady) {
    return (
      <div
        suppressHydrationWarning
        style={{
          minHeight: "100vh",
          background: "#f6f8fb",
        }}
      />
    );
  }

  if (shouldRenderDesktopWorkspace) {
    return <DesktopWorkspaceApp />;
  }

  return (
    <div className="ios-chat-shell">
      <DesktopShellBehaviors />
      <DesktopRuntimeBridge />
      <ExecutionVerificationBridge />

      <div className="ios-chat-shell__layout animate-fade-in">
        <aside className={`ios-chat-shell__sidebar ${leftOpen ? "" : "is-collapsed"}`}>
          <div className="ios-chat-shell__sidebar-head">
            <div className="ios-chat-shell__brand">
              <div className="ios-chat-shell__brand-mark">龙</div>
              <div>
                <div className="ios-chat-shell__brand-eyebrow">{uiText.common.brandEyebrow}</div>
                <div className="ios-chat-shell__brand-title">
                  {pickLocaleText(locale, {
                    "zh-CN": "小龙虾 AI",
                    "zh-TW": "小龍蝦 AI",
                    en: "Lobster AI",
                    ja: "ロブスター AI",
                  })}
                </div>
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
              {uiText.common.newChat}
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
                <span className="ios-chat-shell__nav-eyebrow">{item.eyebrow}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </nav>

          <div className="ios-chat-shell__status-grid">
            <StatusPill label={uiText.common.connection} value={formatWsStatusLabel(locale, wsStatus)} />
            <StatusPill label={uiText.common.desktop} value={desktopRuntimeSummary} />
            <StatusPill label={uiText.common.running} value={String(runningCount)} />
            <StatusPill label={uiText.common.mode} value={formatAutomationModeLabel(locale, automationPaused, automationMode)} />
            <StatusPill label={uiText.common.tokens} value={cost.totalTokens.toLocaleString(locale)} />
            <StatusPill label={uiText.common.workflows} value={String(workflowRuns.length)} />
          </div>

          <div className="ios-chat-shell__sidebar-scroll">
            <SidebarSection title={uiText.common.currentProject} subtitle={uiText.common.currentProjectSubtitle}>
              <ProjectHubCard compact />
            </SidebarSection>

            <SidebarSection title={uiText.common.sessions} subtitle={uiText.common.sessionsSubtitle}>
              <ChatSessionsPanel showHeader={false} />
            </SidebarSection>

            {activeTab === "tasks" && (
              <>
                <SidebarSection title={uiText.common.quickTasks} subtitle={uiText.common.quickTasksSubtitle}>
                  <PresetTasksPanel onSelectTask={dispatchInstruction} />
                </SidebarSection>
                <SidebarSection title={uiText.common.scheduledTasks} subtitle={uiText.common.scheduledTasksSubtitle}>
                  <ScheduledTasksPanel onExecuteTask={dispatchInstruction} />
                </SidebarSection>
              </>
            )}

            {activeTab === "dashboard" && (
              <>
                <SidebarSection title={uiText.common.teamStatus} subtitle={uiText.common.teamStatusSubtitle}>
                  <AgentGrid />
                </SidebarSection>
                <SidebarSection title={uiText.common.activity} subtitle={uiText.common.activitySubtitle}>
                  <ActivityPanel />
                </SidebarSection>
              </>
            )}

            {activeTab === "meeting" && (
              <SidebarSection
                title={pickLocaleText(locale, {
                  "zh-CN": "会议记录",
                  "zh-TW": "會議記錄",
                  en: "Meeting Notes",
                  ja: "会議記録",
                })}
                subtitle={pickLocaleText(locale, {
                  "zh-CN": "最近一轮结论",
                  "zh-TW": "最近一輪結論",
                  en: "Latest round summary",
                  ja: "直近ラウンドの結論",
                })}
              >
                <MeetingRecordPanel />
              </SidebarSection>
            )}

            {activeTab === "dispatch" && (
              <SidebarSection title={uiText.common.executionTrail} subtitle={uiText.common.executionTrailSubtitle}>
                <ExecutionCenter compact />
              </SidebarSection>
            )}

            <SidebarSection title={uiText.common.systemSummary} subtitle={uiText.common.systemSummarySubtitle}>
              <div className="ios-chat-shell__summary-list">
                <div className="ios-chat-shell__summary-item">
                  <span>{uiText.common.provider}</span>
                  <strong>{providers.length}</strong>
                </div>
                <div className="ios-chat-shell__summary-item">
                  <span>{uiText.common.platforms}</span>
                  <strong>{enabledPlatforms}</strong>
                </div>
                <div className="ios-chat-shell__summary-item">
                  <span>{uiText.common.currentMode}</span>
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
                {leftOpen ? uiText.common.hideSidebar : uiText.common.openSidebar}
              </button>
              <div>
                <div className="ios-chat-shell__page-eyebrow">{activeNav.eyebrow}</div>
                <div className="ios-chat-shell__page-title">{activeNav.label}</div>
              </div>
            </div>

            <div className="ios-chat-shell__topbar-right">
              <LanguageSwitcher />
              <DesktopRuntimeBadge compact />
              <div className="ios-chat-shell__capsule">{uiText.common.iosCapsule}</div>
              <div className="ios-chat-shell__capsule">{uiText.common.gptCapsule}</div>
              <button type="button" className="ios-chat-shell__capsule is-button" onClick={openTopbarControlCenter}>
                {uiText.common.openControlCenter}
              </button>
            </div>
          </div>

          <div className="ios-chat-shell__canvas">
            {activeTab === "dashboard" && <DashboardTab onOpenTab={setTab} />}
            {activeTab === "tasks" && <TasksTab />}
            {activeTab === "workspace" && <WorkspaceTab />}
            {activeTab === "dispatch" && <DispatchTab />}
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
  const locale = useStore(s => s.locale);
  const setTab = useStore(s => s.setTab);
  const createChatSession = useStore(s => s.createChatSession);
  const wsStatus = useStore(s => s.wsStatus);
  const leftOpen = useStore(s => s.leftOpen);
  const toggleLeft = useStore(s => s.toggleLeft);
  const cost = useStore(s => s.cost);
  const agents = useStore(s => s.agents);
  const desktopRuntime = useStore(s => s.desktopRuntime);
  const navItems = useMemo(() => getPrimaryNavItems(locale), [locale]);
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const activeNav = navItems.find(item => item.id === activeTab) ?? navItems[0];
  const desktopRuntimeTone = getDesktopRuntimeTone(desktopRuntime);
  const desktopRuntimeLabel = useMemo(() => {
    if (desktopRuntimeTone.tone === "ready") return uiText.common.desktopOnline;
    if (desktopRuntimeTone.tone === "partial") return uiText.common.partial;
    return uiText.common.offline;
  }, [desktopRuntimeTone.tone, uiText.common.desktopOnline, uiText.common.offline, uiText.common.partial]);
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
            {leftOpen ? uiText.common.hideSidebar : uiText.common.showSidebar}
          </button>
          <div className="desktop-workspace-shell__brand">
            <div className="desktop-workspace-shell__brand-mark">龙</div>
            <div>
              <div className="desktop-workspace-shell__eyebrow">{uiText.common.desktopBrandEyebrow}</div>
              <div className="desktop-workspace-shell__title">{uiText.common.desktopBrandTitle}</div>
            </div>
          </div>
        </div>

        <div className="desktop-workspace-shell__topbar-right">
          <LanguageSwitcher />
          <button
            type="button"
            className="desktop-workspace-shell__new-chat"
            onClick={() => {
              createChatSession();
              setTab("tasks");
            }}
          >
            {uiText.common.newChat}
          </button>
          <div className="desktop-workspace-shell__status-rail">
            <div className={`desktop-workspace-shell__pill ${offline ? "is-warning" : "is-good"}`}>
              <span>{uiText.common.connection}</span>
              <strong>{formatWsStatusLabel(locale, wsStatus)}</strong>
            </div>
            <div className={`desktop-workspace-shell__pill ${desktopRuntimeTone.tone === "ready" ? "is-good" : "is-warning"}`}>
              <span>{uiText.common.desktop}</span>
              <strong>{desktopRuntimeLabel}</strong>
            </div>
            <div className="desktop-workspace-shell__pill">
              <span>{uiText.common.running}</span>
              <strong>{runningCount}</strong>
            </div>
            <div className="desktop-workspace-shell__pill">
              <span>{uiText.common.tokens}</span>
              <strong>{cost.totalTokens.toLocaleString(locale)}</strong>
            </div>
          </div>
        </div>
      </header>

      <div className={`desktop-workspace-shell__layout ${leftOpen ? "" : "is-sidebar-collapsed"}`}>
        {leftOpen ? (
          <aside className="desktop-workspace-shell__sidebar">
            <section className="desktop-workspace-shell__section">
              <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.navigation}</div>
              <div className="desktop-workspace-shell__nav">
                {navItems.map(item => (
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
              <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.sessions}</div>
              <div className="desktop-workspace-shell__panel">
                <ChatSessionsPanel showHeader={false} />
              </div>
            </section>

            {activeTab === "tasks" ? (
              <section className="desktop-workspace-shell__section">
                <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.quickTasks}</div>
                <div className="desktop-workspace-shell__panel">
                  <PresetTasksPanel onSelectTask={dispatchInstruction} />
                </div>
              </section>
            ) : null}

            {activeTab === "dashboard" ? (
              <section className="desktop-workspace-shell__section">
                <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.activity}</div>
                <div className="desktop-workspace-shell__panel">
                  <ActivityPanel />
                </div>
              </section>
            ) : null}

            {activeTab === "dispatch" ? (
              <section className="desktop-workspace-shell__section">
                <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.executionTrail}</div>
                <div className="desktop-workspace-shell__panel">
                  <ExecutionCenter compact />
                </div>
              </section>
            ) : null}

            <section className="desktop-workspace-shell__section">
              <div className="desktop-workspace-shell__section-eyebrow">{uiText.common.desktopSummary}</div>
              <div className="desktop-workspace-shell__summary-grid">
                <article className="desktop-workspace-shell__summary-card">
                  <span>{uiText.common.currentScene}</span>
                  <strong>{activeNav.label}</strong>
                </article>
                <article className="desktop-workspace-shell__summary-card">
                  <span>{uiText.common.sidebar}</span>
                  <strong>{leftOpen ? uiText.common.expanded : uiText.common.collapsed}</strong>
                </article>
                <article className="desktop-workspace-shell__summary-card">
                  <span>{uiText.common.workingMode}</span>
                  <strong>{desktopRuntimeTone.tone === "ready" ? uiText.common.desktopOnline : uiText.common.waitingTakeover}</strong>
                </article>
              </div>
            </section>
          </aside>
        ) : null}

        <main className="desktop-workspace-shell__main">
          {activeTab !== "tasks" && activeTab !== "dispatch" && activeTab !== "settings" ? (
            <section className="desktop-workspace-shell__hero">
            <div>
              <div className="desktop-workspace-shell__hero-eyebrow">{activeNav.eyebrow}</div>
              <h1 className="desktop-workspace-shell__hero-title">{activeNav.label}</h1>
              <p className="desktop-workspace-shell__hero-copy">
                {pickLocaleText(locale, {
                  "zh-CN": "桌面端保持稳定渲染优先，同时把聊天、工作台和控制面板收敛到同一条工作流里。",
                  "zh-TW": "桌面端優先保持穩定渲染，同時把聊天、工作台與控制面板收斂到同一條工作流裡。",
                  en: "Keep desktop rendering stable first while bringing chat, workspace, and control surfaces into one flow.",
                  ja: "デスクトップでは安定した描画を優先しつつ、チャット・ワークスペース・制御面を一つの流れにまとめます。",
                })}
              </p>
            </div>
            <div className="desktop-workspace-shell__hero-meta">
              <div className="desktop-workspace-shell__hero-meta-card">
                <span>{uiText.common.desktopConnection}</span>
                <strong>{desktopRuntimeLabel}</strong>
              </div>
              <div className="desktop-workspace-shell__hero-meta-card">
                <span>{uiText.common.messagePipeline}</span>
                <strong>{offline ? uiText.common.recoveryNeeded : uiText.common.synced}</strong>
              </div>
            </div>
            </section>
          ) : null}

          {(offline || desktopRuntimeTone.tone !== "ready") && activeTab !== "settings" ? (
            <section className="desktop-workspace-shell__alert">
              <div>
                <strong>{offline ? uiText.common.pipelineRecoveryTitle : uiText.common.desktopCapabilityTitle}</strong>
                <p>
                  {offline
                    ? pickLocaleText(locale, {
                        "zh-CN": "当前 WebSocket 未在线，自动派发和执行状态同步会受影响。",
                        "zh-TW": "目前 WebSocket 未在線，自動派發與執行同步會受到影響。",
                        en: "WebSocket is offline, so auto-dispatch and execution sync are affected.",
                        ja: "現在 WebSocket がオフラインのため、自動配信と実行同期に影響があります。",
                      })
                    : desktopRuntimeTone.detail}
                </p>
              </div>
              <div className="desktop-workspace-shell__alert-actions">
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("settings")}>
                  {uiText.common.checkSettings}
                </button>
                <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("tasks")}>
                  {uiText.common.manualTakeover}
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
          {activeTab === "dispatch" ? (
            <section className="desktop-workspace-shell__content-panel">
              <DispatchTab />
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
  return (
    <div className="desktop-workspace-shell__chat-layout">
      <section className="desktop-workspace-shell__chat-main">
        <TasksTab />
      </section>
    </div>
  );
}

function DashboardTab({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const agents = useStore(s => s.agents);
  const activities = useStore(s => s.activities);
  const locale = useStore(s => s.locale);
  const executionRuns = useStore(s => s.executionRuns);
  const workflowRuns = useStore(s => s.workflowRuns);
  const platformConfigs = useStore(s => s.platformConfigs);
  const desktopRuntime = useStore(s => s.desktopRuntime);
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
    () =>
      executionRuns
        .filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [chatSessions, currentProjectKey, executionRuns],
  );

  const runningCount = Object.values(agents).filter(agent => agent.status === "running").length;
  const activeTemplate = activeTeamOperatingTemplateId
    ? getTeamOperatingTemplate(activeTeamOperatingTemplateId)
    : null;
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const homePrompts = activeSurface?.homePrompts ?? getDefaultHomePrompts(locale);
  const businessFocusCards = useMemo(
    () => getDashboardBusinessFocus(locale, activeTeamOperatingTemplateId, {
      customers: scopedCustomers.length,
      leads: scopedLeads.length,
      tickets: scopedTickets.length,
      contentTasks: scopedContentTasks.length,
      channelSessions: scopedChannelSessions.length,
    }),
    [
      locale,
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
  const pendingApprovalsCount = mobileApprovalQueue.length;
  const activeRunCount = scopedExecutionRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const latestRun = scopedExecutionRuns[0] ?? null;
  const latestOperation = scopedOperationLogs[0] ?? null;
  const deskContextCount = workspacePinnedPreviews.length + scopedDeskNotes.length + scopedProjectMemories.length;
  const totalAgentCount = Object.keys(agents).length;
  const businessEntityCount =
    scopedCustomers.length + scopedLeads.length + scopedTickets.length + scopedContentTasks.length + scopedChannelSessions.length;
  const enabledPlatformEntries = useMemo(
    () => PLATFORM_DEFINITIONS.filter(platform => platformConfigs[platform.id]?.enabled),
    [platformConfigs],
  );
  const runningAgents = useMemo(
    () =>
      Object.values(agents)
        .filter(agent => agent.status === "running")
        .sort((left, right) => right.lastUpdated - left.lastUpdated),
    [agents],
  );
  const agentSnapshots = useMemo(
    () =>
      Object.values(agents)
        .map(agent => {
          const latestAgentActivity = activities.find(activity => activity.agentId === agent.id);
          return {
            ...agent,
            latestAgentActivity,
            summary: agent.currentTask
              || latestAgentActivity?.summary
              || pickLocaleText(locale, {
                "zh-CN": "当前没有挂载任务",
                "zh-TW": "目前沒有掛載任務",
                en: "No task is mounted right now",
                ja: "現在は担当タスクがありません",
              }),
          };
        })
        .sort((left, right) => {
          const leftRank = left.status === "running" ? 0 : left.status === "error" ? 1 : 2;
          const rightRank = right.status === "running" ? 0 : right.status === "error" ? 1 : 2;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return right.lastUpdated - left.lastUpdated;
        }),
    [activities, agents, locale],
  );
  const highlightedAgents = (runningAgents.length > 0 ? agentSnapshots.filter(agent => agent.status === "running") : agentSnapshots).slice(0, 4);
  const workflowRunCount = workflowRuns.filter(run => run.status === "queued" || run.status === "staged" || run.status === "in-progress").length;
  const latestRunAgentMeta = latestRun?.currentAgentId ? AGENT_META[latestRun.currentAgentId] : null;
  const desktopRuntimeTone = getDesktopRuntimeTone(desktopRuntime);
  const desktopRuntimeSummary = desktopRuntimeTone.tone === "ready"
    ? pickLocaleText(locale, { "zh-CN": "桌面可用", "zh-TW": "桌面可用", en: "Desktop Ready", ja: "デスクトップ準備完了" })
    : desktopRuntimeTone.tone === "partial"
      ? pickLocaleText(locale, { "zh-CN": "桌面部分可用", "zh-TW": "桌面部分可用", en: "Desktop Partial", ja: "デスクトップ一部可用" })
      : pickLocaleText(locale, { "zh-CN": "桌面离线", "zh-TW": "桌面離線", en: "Desktop Offline", ja: "デスクトップオフライン" });
  const supervisionModeLabel = automationPaused
    ? uiText.common.paused
    : automationMode === "manual"
      ? uiText.common.manual
      : automationMode === "supervised"
        ? uiText.common.supervised
        : uiText.common.autonomous;
  const homeActionCards = useMemo(
    () =>
      [
        ...businessFocusCards.slice(0, 2),
        ...(activeTemplate && activeSurface ? activeSurface.quickActions : []),
      ].slice(0, 2),
    [activeSurface, activeTemplate, businessFocusCards],
  );
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
      const blockedReason = getDispatchBlockedReason(locale, wsStatus, automationPaused, automationMode, remoteSupervisorEnabled);
      setHomeRailFeedback(formatApprovalFeedback(locale, "blocked", item.title, blockedReason));
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
        ? pickLocaleText(locale, {
            "zh-CN": "人工在桌面首页监督侧轨批准后立即派发了该业务对象。",
            "zh-TW": "人工在桌面首頁監督側軌批准後立即派發了該業務對象。",
            en: "The item was dispatched immediately after approval from the desktop home supervision rail.",
            ja: "デスクトップホームの監督レールで承認後、すぐにこの業務対象が派信されました。",
          })
        : pickLocaleText(locale, {
            "zh-CN": "人工在桌面首页监督侧轨批准了该业务对象，但发送链路未成功建立。",
            "zh-TW": "人工在桌面首頁監督側軌批准了該業務對象，但發送鏈路未成功建立。",
            en: "The item was approved from the desktop home supervision rail, but the dispatch link was not established.",
            ja: "デスクトップホームの監督レールで承認されましたが、配信リンクの確立に失敗しました。",
          }),
      executionRunId: ok ? executionRunId : undefined,
    });

    if (ok && executionRunId) {
      setActiveExecutionRun(executionRunId);
      setHomeRailFeedback(formatApprovalFeedback(locale, "sent", item.title));
      return;
    }

    setHomeRailFeedback(formatApprovalFeedback(locale, "failed", item.title));
  };

  const rejectDashboardItem = (item: BusinessAutomationQueueItem) => {
    setBusinessApprovalDecision({
      entityType: item.entityType,
      entityId: item.entityId,
      status: "rejected",
    });
    setHomeRailFeedback(formatApprovalFeedback(locale, "rejected", item.title));
  };

  const retryLatestExecution = (run: NonNullable<typeof latestRun>) => {
    const { ok, executionRunId } = retryExecutionDispatch(run, {
      includeUserMessage: true,
      includeActiveProjectMemory: true,
      taskDescription: pickLocaleText(locale, {
        "zh-CN": `[重试执行] ${run.instruction}`,
        "zh-TW": `[重試執行] ${run.instruction}`,
        en: `[Retry Run] ${run.instruction}`,
        ja: `[実行を再試行] ${run.instruction}`,
      }),
      lastRecoveryHint: pickLocaleText(locale, {
        "zh-CN": "从首页监督轨重新发起失败执行。",
        "zh-TW": "從首頁監督軌重新發起失敗執行。",
        en: "Retry the failed run again from the home supervision rail.",
        ja: "ホーム監督レールから失敗した実行を再度開始します。",
      }),
    });

    if (ok && executionRunId) {
      setActiveExecutionRun(executionRunId);
      setHomeRailFeedback(pickLocaleText(locale, {
        "zh-CN": "已重新发起这条执行指令。",
        "zh-TW": "已重新發起這條執行指令。",
        en: "The execution instruction has been sent again.",
        ja: "実行指示を再送しました。",
      }));
      return;
    }

    setHomeRailFeedback(pickLocaleText(locale, {
      "zh-CN": "重试已发起，但发送链路没有成功建立。",
      "zh-TW": "重試已發起，但發送鏈路沒有成功建立。",
      en: "Retry was requested, but the dispatch link was not established.",
      ja: "再試行を要求しましたが、配信リンクの確立に失敗しました。",
    }));
  };

  return (
    <div className="ios-home ios-home--desktop">
      <div className="ios-home__workspace ios-home__desktop-layout">
        <div className="ios-home__main ios-home__desktop-main">
          <section className="ios-home__hero">
            <div className="ios-home__hero-heading">
              <div className="ios-home__hero-meta">
                <span className="ios-home__hero-meta-pill">
                  {uiText.common.currentProject}: {activeSession ? getSessionProjectLabel(activeSession) : uiText.common.generalProject}
                </span>
                <span className="ios-home__hero-meta-pill">
                  {pickLocaleText(locale, {
                    "zh-CN": `值守模式 ${supervisionModeLabel}`,
                    "zh-TW": `值守模式 ${supervisionModeLabel}`,
                    en: `Supervision ${supervisionModeLabel}`,
                    ja: `監督 ${supervisionModeLabel}`,
                  })}
                </span>
                {activeTemplate && activeSurface ? (
                  <span className="ios-home__hero-meta-pill ios-home__hero-meta-pill--accent">
                    {uiText.dashboard.teamModePrefix} · {activeTemplate.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="ios-home__status">
              <StatusCard
                label={pickLocaleText(locale, { "zh-CN": "在岗 Agent", "zh-TW": "在線 Agent", en: "Active Agents", ja: "稼働 Agent" })}
                value={pickLocaleText(locale, {
                  "zh-CN": `${runningCount}/${totalAgentCount}`,
                  "zh-TW": `${runningCount}/${totalAgentCount}`,
                  en: `${runningCount}/${totalAgentCount}`,
                  ja: `${runningCount}/${totalAgentCount}`,
                })}
                hint={pickLocaleText(locale, {
                  "zh-CN": runningCount > 0 ? `${runningCount} 个 agent 正在处理任务` : "当前没有 agent 在主动处理任务",
                  "zh-TW": runningCount > 0 ? `${runningCount} 個 agent 正在處理任務` : "目前沒有 agent 在主動處理任務",
                  en: runningCount > 0 ? `${runningCount} agents are actively processing work` : "No agent is actively processing work",
                  ja: runningCount > 0 ? `${runningCount} 体の agent が作業中です` : "現在アクティブに作業中の agent はいません",
                })}
              />
              <StatusCard
                label={pickLocaleText(locale, { "zh-CN": "执行链路", "zh-TW": "執行鏈路", en: "Execution Flow", ja: "実行フロー" })}
                value={pickLocaleText(locale, {
                  "zh-CN": `${activeRunCount} 运行中`,
                  "zh-TW": `${activeRunCount} 運行中`,
                  en: `${activeRunCount} running`,
                  ja: `${activeRunCount} 件実行中`,
                })}
                hint={latestRun
                  ? pickLocaleText(locale, {
                      "zh-CN": `最近一条：${latestRun.instruction}`,
                      "zh-TW": `最近一條：${latestRun.instruction}`,
                      en: `Latest: ${latestRun.instruction}`,
                      ja: `最新: ${latestRun.instruction}`,
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "当前项目还没有执行 run",
                      "zh-TW": "目前專案還沒有執行 run",
                      en: "There is no execution run in this project yet",
                      ja: "このプロジェクトにはまだ実行 run がありません",
                    })}
              />
              <StatusCard
                label={pickLocaleText(locale, { "zh-CN": "审批与值守", "zh-TW": "審批與值守", en: "Approvals", ja: "承認と監督" })}
                value={pickLocaleText(locale, {
                  "zh-CN": `${pendingApprovalsCount} 待处理`,
                  "zh-TW": `${pendingApprovalsCount} 待處理`,
                  en: `${pendingApprovalsCount} pending`,
                  ja: `${pendingApprovalsCount} 件待ち`,
                })}
                hint={pickLocaleText(locale, {
                  "zh-CN": `当前模式 ${supervisionModeLabel}，远程值守 ${remoteSupervisorEnabled ? "开启" : "关闭"}`,
                  "zh-TW": `目前模式 ${supervisionModeLabel}，遠程值守 ${remoteSupervisorEnabled ? "開啟" : "關閉"}`,
                  en: `Mode ${supervisionModeLabel}, remote supervision ${remoteSupervisorEnabled ? "enabled" : "disabled"}`,
                  ja: `モード ${supervisionModeLabel}、遠隔監督 ${remoteSupervisorEnabled ? "有効" : "無効"}`,
                })}
              />
              <StatusCard
                label={pickLocaleText(locale, { "zh-CN": "系统接入", "zh-TW": "系統接入", en: "System Access", ja: "接続状況" })}
                value={pickLocaleText(locale, {
                  "zh-CN": `${enabledPlatformEntries.length} 平台 / ${workflowRunCount} 工作流`,
                  "zh-TW": `${enabledPlatformEntries.length} 平台 / ${workflowRunCount} 工作流`,
                  en: `${enabledPlatformEntries.length} platforms / ${workflowRunCount} workflows`,
                  ja: `${enabledPlatformEntries.length} プラットフォーム / ${workflowRunCount} ワークフロー`,
                })}
                hint={pickLocaleText(locale, {
                  "zh-CN": `${formatWsStatusLabel(locale, wsStatus)} · ${desktopRuntimeSummary}`,
                  "zh-TW": `${formatWsStatusLabel(locale, wsStatus)} · ${desktopRuntimeSummary}`,
                  en: `${formatWsStatusLabel(locale, wsStatus)} · ${desktopRuntimeSummary}`,
                  ja: `${formatWsStatusLabel(locale, wsStatus)} · ${desktopRuntimeSummary}`,
                })}
              />
            </div>

            <section className="ios-home__mission-card">
              <div className="ios-home__mission-head">
                <div>
                  <div className="ios-home__eyebrow">{pickLocaleText(locale, {
                    "zh-CN": "当前主任务",
                    "zh-TW": "目前主任務",
                    en: "Current Priority Run",
                    ja: "現在の優先実行",
                  })}</div>
                  <div className="ios-home__mission-title">
                    {latestRun?.instruction ?? pickLocaleText(locale, {
                      "zh-CN": "当前还没有需要推进的执行任务",
                      "zh-TW": "目前還沒有需要推進的執行任務",
                      en: "There is no active priority execution yet",
                      ja: "まだ進行中の優先実行はありません",
                    })}
                  </div>
                </div>
                <button type="button" className="btn-ghost" onClick={() => openControlCenterSection("execution")}>
                  {pickLocaleText(locale, {
                    "zh-CN": "打开执行中心",
                    "zh-TW": "打開執行中心",
                    en: "Open Execution",
                    ja: "実行センターを開く",
                  })}
                </button>
              </div>
              <div className="ios-home__mission-meta">
                <span>{pickLocaleText(locale, {
                  "zh-CN": `链路 ${formatWsStatusLabel(locale, wsStatus)}`,
                  "zh-TW": `鏈路 ${formatWsStatusLabel(locale, wsStatus)}`,
                  en: `Link ${formatWsStatusLabel(locale, wsStatus)}`,
                  ja: `経路 ${formatWsStatusLabel(locale, wsStatus)}`,
                })}</span>
                <span>{pickLocaleText(locale, {
                  "zh-CN": `桌面 ${desktopRuntimeSummary}`,
                  "zh-TW": `桌面 ${desktopRuntimeSummary}`,
                  en: `Desktop ${desktopRuntimeSummary}`,
                  ja: `デスクトップ ${desktopRuntimeSummary}`,
                })}</span>
                <span>{pickLocaleText(locale, {
                  "zh-CN": `来源 ${latestRun?.source ?? "home"}`,
                  "zh-TW": `來源 ${latestRun?.source ?? "home"}`,
                  en: `Source ${latestRun?.source ?? "home"}`,
                  ja: `ソース ${latestRun?.source ?? "home"}`,
                })}</span>
                <span>{latestRunAgentMeta ? `${latestRunAgentMeta.emoji} ${latestRunAgentMeta.name}` : pickLocaleText(locale, {
                  "zh-CN": "待分配 Agent",
                  "zh-TW": "待分配 Agent",
                  en: "Awaiting agent",
                  ja: "Agent 割当待ち",
                })}</span>
                <span>{latestRun ? `${pickLocaleText(locale, {
                  "zh-CN": "更新",
                  "zh-TW": "更新",
                  en: "Updated",
                  ja: "更新",
                })} ${timeAgo(latestRun.updatedAt, locale)}` : pickLocaleText(locale, {
                  "zh-CN": "等待首条执行",
                  "zh-TW": "等待首條執行",
                  en: "Waiting for the first run",
                  ja: "最初の実行を待機中",
                })}</span>
              </div>
              <div className="ios-home__mission-copy">
                {latestOperation
                  ? pickLocaleText(locale, {
                      "zh-CN": `最近结果：${latestOperation.title}`,
                      "zh-TW": `最近結果：${latestOperation.title}`,
                      en: `Latest outcome: ${latestOperation.title}`,
                      ja: `最新結果: ${latestOperation.title}`,
                    })
                  : activeSurface?.statusCopy ?? uiText.dashboard.copy}
              </div>
              <div className="ios-home__mission-actions">
                <button type="button" className="btn-ghost" onClick={() => onOpenTab("tasks")}>
                  {pickLocaleText(locale, {
                    "zh-CN": "去聊天接管",
                    "zh-TW": "去聊天接管",
                    en: "Take Over in Chat",
                    ja: "チャットで引き継ぐ",
                  })}
                </button>
                {latestRun?.status === "failed" ? (
                  <button type="button" className="btn-ghost" onClick={() => retryLatestExecution(latestRun)}>
                    {pickLocaleText(locale, {
                      "zh-CN": "失败后重试",
                      "zh-TW": "失敗後重試",
                      en: "Retry Failed Run",
                      ja: "失敗実行を再試行",
                    })}
                  </button>
                ) : null}
              </div>
              {homeRailFeedback ? <div className="ios-home__mission-feedback">{homeRailFeedback}</div> : null}
            </section>

            <div className="ios-home__overview-grid">
              <section className="ios-home__overview-card">
                <div className="ios-home__overview-head">
                  <div>
                    <div className="ios-home__eyebrow">{pickLocaleText(locale, { "zh-CN": "Agent 实时状态", "zh-TW": "Agent 即時狀態", en: "Live Agent Status", ja: "Agent の現在状況" })}</div>
                    <div className="ios-home__overview-title">{pickLocaleText(locale, { "zh-CN": "谁在工作、正在做什么", "zh-TW": "誰在工作、正在做什麼", en: "Who is working and what they are doing", ja: "誰が何をしているか" })}</div>
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => onOpenTab("settings")}>
                    {pickLocaleText(locale, { "zh-CN": "看控制台", "zh-TW": "看控制台", en: "Open Control", ja: "コントロールを見る" })}
                  </button>
                </div>
                <div className="ios-home__agent-list">
                  {highlightedAgents.slice(0, 3).map(agent => (
                    <article key={agent.id} className="ios-home__agent-row">
                      <div className="ios-home__agent-meta">
                        <div className="ios-home__agent-avatar">
                          {AGENT_META[agent.id].emoji}
                        </div>
                        <div className="ios-home__agent-copy">
                          <div className="ios-home__agent-name-row">
                            <strong>{AGENT_META[agent.id].name}</strong>
                            <span className={`ios-home__agent-badge is-${agent.status === "running" ? "running" : agent.status === "error" ? "error" : "idle"}`}>
                              {getAgentStatusLabel(locale, agent.status)}
                            </span>
                          </div>
                          <div className="ios-home__agent-task">{agent.summary}</div>
                          <div className="ios-home__agent-hint">
                            {agent.latestAgentActivity
                              ? `${timeAgo(agent.latestAgentActivity.timestamp, locale)} · ${agent.latestAgentActivity.detail || agent.latestAgentActivity.summary}`
                              : pickLocaleText(locale, {
                                  "zh-CN": "当前没有新的活动记录",
                                  "zh-TW": "目前沒有新的活動記錄",
                                  en: "No recent activity yet",
                                  ja: "直近のアクティビティはありません",
                                })}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="ios-home__overview-footer">
                  <span>{pickLocaleText(locale, {
                    "zh-CN": `总计 ${totalAgentCount} 个 agent，优先展示最近在工作的成员`,
                    "zh-TW": `總計 ${totalAgentCount} 個 agent，優先顯示最近在工作的成員`,
                    en: `${totalAgentCount} agents total, prioritizing the ones currently doing work`,
                    ja: `合計 ${totalAgentCount} 体。現在動いている agent を優先表示しています`,
                  })}</span>
                  <button type="button" className="btn-ghost" onClick={() => onOpenTab("settings")}>
                    {pickLocaleText(locale, {
                      "zh-CN": "看控制台",
                      "zh-TW": "看控制台",
                      en: "Open Control",
                      ja: "コントロールを見る",
                    })}
                  </button>
                </div>
              </section>

              <section className="ios-home__overview-card">
                <div className="ios-home__overview-head">
                  <div>
                    <div className="ios-home__eyebrow">{pickLocaleText(locale, { "zh-CN": "平台态势", "zh-TW": "平台態勢", en: "Platform Snapshot", ja: "プラットフォーム概況" })}</div>
                    <div className="ios-home__overview-title">{pickLocaleText(locale, { "zh-CN": "整个软件现在处于什么状态", "zh-TW": "整個軟體現在處於什麼狀態", en: "What state the whole platform is in now", ja: "今このソフト全体がどういう状態か" })}</div>
                  </div>
                </div>
                <div className="ios-home__overview-metrics">
                  <div className="ios-home__overview-metric">
                    <span>{pickLocaleText(locale, { "zh-CN": "消息链路", "zh-TW": "消息鏈路", en: "Message Link", ja: "メッセージ経路" })}</span>
                    <strong>{formatWsStatusLabel(locale, wsStatus)}</strong>
                  </div>
                  <div className="ios-home__overview-metric">
                    <span>{pickLocaleText(locale, { "zh-CN": "桌面能力", "zh-TW": "桌面能力", en: "Desktop", ja: "デスクトップ" })}</span>
                    <strong>{desktopRuntimeSummary}</strong>
                  </div>
                  <div className="ios-home__overview-metric">
                    <span>{pickLocaleText(locale, { "zh-CN": "工作区上下文", "zh-TW": "工作區上下文", en: "Desk Context", ja: "Desk コンテキスト" })}</span>
                    <strong>{pickLocaleText(locale, {
                      "zh-CN": `${deskContextCount} 项`,
                      "zh-TW": `${deskContextCount} 項`,
                      en: `${deskContextCount} assets`,
                      ja: `${deskContextCount} 件`,
                    })}</strong>
                  </div>
                  <div className="ios-home__overview-metric">
                    <span>{pickLocaleText(locale, { "zh-CN": "业务对象", "zh-TW": "業務對象", en: "Business Objects", ja: "業務オブジェクト" })}</span>
                    <strong>{pickLocaleText(locale, {
                      "zh-CN": `${businessEntityCount} 项`,
                      "zh-TW": `${businessEntityCount} 項`,
                      en: `${businessEntityCount} items`,
                      ja: `${businessEntityCount} 件`,
                    })}</strong>
                  </div>
                </div>
                <div className="ios-home__overview-summary">
                  <div className="ios-home__overview-summary-item">
                    <span>{pickLocaleText(locale, { "zh-CN": "最新处理结果", "zh-TW": "最新處理結果", en: "Latest Outcome", ja: "最新の処理結果" })}</span>
                    <strong>{latestOperation?.title ?? pickLocaleText(locale, { "zh-CN": "还没有新的业务操作记录", "zh-TW": "還沒有新的業務操作記錄", en: "No recent business operation yet", ja: "直近の業務操作記録はありません" })}</strong>
                  </div>
                  <div className="ios-home__overview-platforms">
                    {(enabledPlatformEntries.length > 0 ? enabledPlatformEntries : PLATFORM_DEFINITIONS.slice(0, 3)).slice(0, 4).map(platform => (
                      <span key={platform.id} className={`ios-home__platform-pill ${platformConfigs[platform.id]?.enabled ? "is-enabled" : ""}`}>
                        {platform.name}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <div className="ios-home__composer">
              <CommandInput
                variant="panel"
                title={uiText.dashboard.startTitle}
                hint={uiText.dashboard.startHint}
              />
            </div>

            <div className="ios-home__prompt-row">
              {homePrompts.slice(0, 2).map(prompt => (
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
                <div className="ios-home__eyebrow">{uiText.dashboard.continueEyebrow}</div>
                <div className="ios-home__copy" style={{ margin: 0 }}>
                  {pickLocaleText(locale, {
                    "zh-CN": "只保留两个最值得立刻进入的入口，避免首页再次堆满内容。",
                    "zh-TW": "只保留兩個最值得立刻進入的入口，避免首頁再次堆滿內容。",
                    en: "Only keep the next two most useful entries here so the home surface stays readable.",
                    ja: "ホームが再び情報で埋まらないよう、すぐ入るべき入口だけを二つ残します。",
                  })}
                </div>
              </div>
            </div>

            <div className="ios-home__grid ios-home__grid--compact">
              {homeActionCards.map(card => (
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
            </div>
          </section>
        </div>

        <aside className="ios-home__rail ios-home__desktop-rail">
          <DashboardSupervisionRail
            locale={locale}
            approvalCount={pendingApprovalsCount}
            activeRunCount={activeRunCount}
            latestRun={latestRun}
            latestOperation={latestOperation}
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
                const blockedReason = getDispatchBlockedReason(
                  locale,
                  wsStatus,
                  automationPaused,
                  automationMode,
                  remoteSupervisorEnabled,
                );

                return {
                  message: formatApprovalFeedback(locale, "blocked", item.title, blockedReason),
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
                  ? pickLocaleText(locale, {
                      "zh-CN": "人工在移动监督面板批准后立即派发了该业务对象。",
                      "zh-TW": "人工在移動監督面板批准後立即派發了該業務對象。",
                      en: "The item was approved in the mobile supervision panel and dispatched immediately.",
                      ja: "モバイル監督パネルで承認され、ただちに派信されました。",
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "人工在移动监督面板批准了该业务对象，但发送链路未成功建立。",
                      "zh-TW": "人工在移動監督面板批准了該業務對象，但發送鏈路未成功建立。",
                      en: "The item was approved in the mobile supervision panel, but the dispatch link was not established.",
                      ja: "モバイル監督パネルで承認されましたが、配信リンクの確立に失敗しました。",
                    }),
                executionRunId: ok ? executionRunId : undefined,
              });

              if (ok && executionRunId) {
                setActiveExecutionRun(executionRunId);
                return {
                  message: formatApprovalFeedback(locale, "sent", item.title),
                  executionRunId,
                };
              }

              return {
                message: formatApprovalFeedback(locale, "failed", item.title),
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
              const { ok, executionRunId } = retryExecutionDispatch(run, {
                includeUserMessage: true,
                includeActiveProjectMemory: true,
                taskDescription: pickLocaleText(locale, {
                  "zh-CN": `[重试执行] ${run.instruction}`,
                  "zh-TW": `[重試執行] ${run.instruction}`,
                  en: `[Retry Run] ${run.instruction}`,
                  ja: `[実行を再試行] ${run.instruction}`,
                }),
                lastRecoveryHint: pickLocaleText(locale, {
                  "zh-CN": "从移动监督面板重新发起失败执行。",
                  "zh-TW": "從移動監督面板重新發起失敗執行。",
                  en: "Retry the failed run again from the mobile supervision panel.",
                  ja: "モバイル監督パネルから失敗した実行を再試行します。",
                }),
              });

              if (ok && executionRunId) {
                setActiveExecutionRun(executionRunId);
                return {
                  message: pickLocaleText(locale, {
                    "zh-CN": "已重新发起这条执行指令。",
                    "zh-TW": "已重新發起這條執行指令。",
                    en: "The execution instruction was sent again.",
                    ja: "実行指示を再送しました。",
                  }),
                  executionRunId,
                };
              }

              return {
                message: pickLocaleText(locale, {
                  "zh-CN": "重试已发起，但发送链路没有成功建立。",
                  "zh-TW": "重試已發起，但發送鏈路沒有成功建立。",
                  en: "Retry was requested, but the dispatch link was not established.",
                  ja: "再試行は要求されましたが、配信リンクの確立に失敗しました。",
                }),
              };
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function DashboardSupervisionRail({
  locale,
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
  locale: UiLocale;
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
  const modeLabel = formatAutomationModeLabel(locale, automationPaused, automationMode);
  const approvalPreviewItems = approvalItems.slice(0, 2);

  return (
    <section className="ios-home__mobile-supervision">
      <div className="ios-home__mobile-supervision-head">
        <div>
          <div className="ios-home__eyebrow">{pickLocaleText(locale, {
            "zh-CN": "Mobile Supervision",
            "zh-TW": "Mobile Supervision",
            en: "Mobile Supervision",
            ja: "Mobile Supervision",
          })}</div>
          <div className="ios-home__action-title">{pickLocaleText(locale, {
            "zh-CN": "值守总览",
            "zh-TW": "值守總覽",
            en: "Supervision Overview",
            ja: "監督オーバービュー",
          })}</div>
        </div>
        <span className={`control-center__scenario-badge is-${automationPaused ? "blocked" : "ready"}`}>
          {modeLabel}
        </span>
      </div>

      <div className="ios-home__mobile-supervision-stack">
        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-label">{pickLocaleText(locale, {
            "zh-CN": "自动化状态",
            "zh-TW": "自動化狀態",
            en: "Automation Status",
            ja: "自動化ステータス",
          })}</div>
          <div className="ios-home__mobile-supervision-note">
            {pickLocaleText(locale, {
              "zh-CN": "这里保留值守开关、审批压力和失败恢复入口。",
              "zh-TW": "這裡保留值守開關、審批壓力與失敗恢復入口。",
              en: "This rail keeps the supervision switches, approval pressure, and failure recovery paths together.",
              ja: "このレールには監督スイッチ、承認負荷、失敗復旧の入口だけをまとめています。",
            })}
          </div>
          <div className="ios-home__mobile-supervision-meta">
            <span>{pickLocaleText(locale, {
              "zh-CN": `待审批 ${approvalCount}`,
              "zh-TW": `待審批 ${approvalCount}`,
              en: `Pending ${approvalCount}`,
              ja: `承認待ち ${approvalCount}`,
            })}</span>
            <span>{pickLocaleText(locale, {
              "zh-CN": `运行中 ${activeRunCount}`,
              "zh-TW": `運行中 ${activeRunCount}`,
              en: `Running ${activeRunCount}`,
              ja: `実行中 ${activeRunCount}`,
            })}</span>
            <span>{remoteSupervisorEnabled
              ? pickLocaleText(locale, { "zh-CN": "远程值守已开", "zh-TW": "遠程值守已開", en: "Remote on", ja: "遠隔監督オン" })
              : pickLocaleText(locale, { "zh-CN": "远程值守关闭", "zh-TW": "遠程值守關閉", en: "Remote off", ja: "遠隔監督オフ" })}</span>
          </div>
          <div className="ios-home__mobile-supervision-actions">
            <button type="button" className="btn-ghost" onClick={onToggleAutomationPaused}>
              {automationPaused
                ? pickLocaleText(locale, { "zh-CN": "恢复自动化", "zh-TW": "恢復自動化", en: "Resume Automation", ja: "自動化を再開" })
                : pickLocaleText(locale, { "zh-CN": "暂停自动化", "zh-TW": "暫停自動化", en: "Pause Automation", ja: "自動化を一時停止" })}
            </button>
            <button type="button" className="btn-ghost" onClick={onToggleRemoteSupervisor}>
              {remoteSupervisorEnabled
                ? pickLocaleText(locale, { "zh-CN": "关闭值守", "zh-TW": "關閉值守", en: "Disable Supervision", ja: "監督をオフ" })
                : pickLocaleText(locale, { "zh-CN": "开启值守", "zh-TW": "開啟值守", en: "Enable Supervision", ja: "監督をオン" })}
            </button>
            <button type="button" className="btn-ghost" onClick={onOpenRemoteOps}>
              {pickLocaleText(locale, { "zh-CN": "打开值守中心", "zh-TW": "打開值守中心", en: "Open Remote Ops", ja: "遠隔運營を開く" })}
            </button>
          </div>
        </article>

        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-inline-head">
            <div>
              <div className="ios-home__mobile-supervision-label">{pickLocaleText(locale, {
                "zh-CN": "待审批队列",
                "zh-TW": "待審批佇列",
                en: "Approval Queue",
                ja: "承認キュー",
              })}</div>
              <div className="ios-home__mobile-supervision-note">
                {approvalCount > 0
                  ? pickLocaleText(locale, {
                      "zh-CN": "优先展示最靠前的待审批对象，避免先进入深层面板。",
                      "zh-TW": "優先顯示最靠前的待審批對象，避免先進入深層面板。",
                      en: "Show the first approval items here so you do not need a deeper panel first.",
                      ja: "先頭の承認対象だけをここに表示し、最初から深いパネルへ入らずに済むようにします。",
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "当前没有等待人工确认的业务对象。",
                      "zh-TW": "目前沒有等待人工確認的業務對象。",
                      en: "No business items are waiting for manual review.",
                      ja: "手動確認待ちの業務項目はありません。",
                    })}
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setApprovalExpanded(current => !current)}
            >
              {approvalExpanded
                ? pickLocaleText(locale, { "zh-CN": "收起", "zh-TW": "收起", en: "Collapse", ja: "折りたたむ" })
                : approvalCount > 0
                  ? pickLocaleText(locale, {
                      "zh-CN": `查看全部 ${approvalCount}`,
                      "zh-TW": `查看全部 ${approvalCount}`,
                      en: `View All ${approvalCount}`,
                      ja: `すべて表示 ${approvalCount}`,
                    })
                  : pickLocaleText(locale, { "zh-CN": "查看", "zh-TW": "查看", en: "View", ja: "表示" })}
            </button>
          </div>
          {approvalFeedback ? (
            <div className="ios-home__mobile-supervision-feedback">
              <div>{approvalFeedback}</div>
              {approvalExecutionRunId ? (
                <div className="ios-home__mobile-supervision-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn-ghost" onClick={onOpenExecution}>
                    {pickLocaleText(locale, { "zh-CN": "查看刚刚执行", "zh-TW": "查看剛剛執行", en: "Open Latest Run", ja: "直近の実行を見る" })}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!approvalExpanded && approvalPreviewItems.length > 0 ? (
            <div className="ios-home__mobile-supervision-approval-list">
              {approvalPreviewItems.map(item => (
                <article key={`${item.entityType}-${item.entityId}`} className="ios-home__mobile-supervision-approval-item">
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong style={{ fontSize: 13 }}>{item.title}</strong>
                    <div className="ios-home__mobile-supervision-note">{item.subtitle}</div>
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
                      {pickLocaleText(locale, { "zh-CN": "批准", "zh-TW": "批准", en: "Approve", ja: "承認" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        onRejectItem(item);
                        setApprovalFeedback(formatApprovalFeedback(locale, "rejected", item.title));
                        setApprovalExecutionRunId(null);
                      }}
                    >
                      {pickLocaleText(locale, { "zh-CN": "驳回", "zh-TW": "駁回", en: "Reject", ja: "却下" })}
                    </button>
                  </div>
                </article>
              ))}
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
                      {pickLocaleText(locale, { "zh-CN": "批准", "zh-TW": "批准", en: "Approve", ja: "承認" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        onRejectItem(item);
                        setApprovalFeedback(formatApprovalFeedback(locale, "rejected", item.title));
                        setApprovalExecutionRunId(null);
                      }}
                    >
                      {pickLocaleText(locale, { "zh-CN": "驳回", "zh-TW": "駁回", en: "Reject", ja: "却下" })}
                    </button>
                  </div>
                </article>
              )) : (
                <div className="ios-home__mobile-supervision-note">
                  {pickLocaleText(locale, {
                    "zh-CN": "当前项目没有待审批对象，可以直接盯执行和远程值守状态。",
                    "zh-TW": "目前專案沒有待審批對象，可以直接盯執行和遠程值守狀態。",
                    en: "No approval items are waiting in this project.",
                    ja: "このプロジェクトで承認待ちの項目はありません。",
                  })}
                </div>
              )}
            </div>
          ) : null}
        </article>

        <article className="ios-home__mobile-supervision-card">
          <div className="ios-home__mobile-supervision-inline-head">
            <div>
              <div className="ios-home__mobile-supervision-label">{pickLocaleText(locale, {
                "zh-CN": "最近执行",
                "zh-TW": "最近執行",
                en: "Latest Run",
                ja: "最新の実行",
              })}</div>
              <div className="ios-home__mobile-supervision-note">
                {latestRun ? latestRun.instruction : pickLocaleText(locale, {
                  "zh-CN": "当前项目还没有执行 run。",
                  "zh-TW": "目前專案還沒有執行 run。",
                  en: "There is no execution run in the current project yet.",
                  ja: "現在のプロジェクトにはまだ実行 run がありません。",
                })}
              </div>
            </div>
            {latestRun ? (
              <span className={`control-center__scenario-badge is-${getMobileExecutionTone(latestRun.status)}`}>
                {getMobileExecutionLabel(locale, latestRun.status)}
              </span>
            ) : null}
          </div>
          {latestRun ? (
            <>
              <div className="ios-home__mobile-supervision-meta">
                <span>{pickLocaleText(locale, { "zh-CN": "来源", "zh-TW": "來源", en: "Source", ja: "ソース" })} {latestRun.source}</span>
                <span>{latestRunAgent ? `${latestRunAgent.emoji} ${latestRunAgent.name}` : pickLocaleText(locale, {
                  "zh-CN": "待分配",
                  "zh-TW": "待分配",
                  en: "Unassigned",
                  ja: "未割当",
                })}</span>
                <span>{pickLocaleText(locale, { "zh-CN": "更新于", "zh-TW": "更新於", en: "Updated", ja: "更新" })} {timeAgo(latestRun.updatedAt, locale)}</span>
              </div>
              {latestOperation ? (
                <div className="ios-home__mobile-supervision-note">
                  {pickLocaleText(locale, {
                    "zh-CN": `最近结果：${latestOperation.title}`,
                    "zh-TW": `最近結果：${latestOperation.title}`,
                    en: `Latest outcome: ${latestOperation.title}`,
                    ja: `最新結果: ${latestOperation.title}`,
                  })}
                </div>
              ) : null}
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
                        {pickLocaleText(locale, { "zh-CN": "查看重试执行", "zh-TW": "查看重試執行", en: "Open Retried Run", ja: "再試行した実行を見る" })}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="ios-home__mobile-supervision-actions">
            <button type="button" className="btn-ghost" onClick={onOpenExecution}>
              {pickLocaleText(locale, { "zh-CN": "打开执行中心", "zh-TW": "打開執行中心", en: "Open Execution", ja: "実行センターを開く" })}
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
                {pickLocaleText(locale, { "zh-CN": "一键重试", "zh-TW": "一鍵重試", en: "Retry", ja: "再試行" })}
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={onOpenChat}>
              {latestRun?.status === "failed"
                ? pickLocaleText(locale, { "zh-CN": "回到聊天接管", "zh-TW": "回到聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })
                : pickLocaleText(locale, { "zh-CN": "去聊天接管", "zh-TW": "去聊天接管", en: "Take Over in Chat", ja: "チャットで引き継ぐ" })}
            </button>
          </div>
        </article>

      </div>
    </section>
  );
}

function TasksTab() {
  const tasks = useStore(s => s.tasks);
  const locale = useStore(s => s.locale);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const chatStarters = activeSurface?.chatStarters ?? getDefaultChatStarters(locale);

  return (
    <div className="ios-chat-page">
      <section className="ios-chat-page__surface">
        <div className="ios-chat-page__header">
          <div>
            <div className="ios-chat-page__eyebrow">{uiText.tasks.eyebrow}</div>
            <div className="ios-chat-page__title">{uiText.tasks.title}</div>
          </div>
          <div className="ios-chat-page__meta">
            <span>
              {pickLocaleText(locale, {
                "zh-CN": `${tasks.length} 条消息`,
                "zh-TW": `${tasks.length} 條消息`,
                en: `${tasks.length} messages`,
                ja: `${tasks.length} 件のメッセージ`,
              })}
            </span>
            <span>{uiText.tasks.enterToSend}</span>
            <span>{uiText.tasks.shiftEnter}</span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="ios-chat-page__empty">
            <div className="ios-chat-page__empty-badge">{uiText.tasks.newChatBadge}</div>
            <div className="ios-chat-page__empty-title">{uiText.tasks.emptyTitle}</div>
            <div className="ios-chat-page__empty-copy">{uiText.tasks.emptyCopy}</div>
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
            showHeader={false}
            showFooter={false}
          />
        </div>
      </section>
    </div>
  );
}

function WorkspaceTab() {
  const locale = useStore(s => s.locale);
  return (
    <div className="ios-feature-page ios-feature-page--workspace">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">{pickLocaleText(locale, {
          "zh-CN": "工作区",
          "zh-TW": "工作區",
          en: "Workspace",
          ja: "ワークスペース",
        })}</div>
        <div className="ios-feature-page__title">{pickLocaleText(locale, {
          "zh-CN": "工作区与引用上下文",
          "zh-TW": "工作區與引用上下文",
          en: "Workspace and referenced context",
          ja: "ワークスペースと参照コンテキスト",
        })}</div>
      </div>
      <div className="ios-feature-page__canvas">
        <WorkspaceDesk />
      </div>
    </div>
  );
}

function DispatchTab() {
  const locale = useStore(s => s.locale);
  return (
    <div className="ios-feature-page ios-feature-page--dispatch">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">{pickLocaleText(locale, {
          "zh-CN": "调度",
          "zh-TW": "調度",
          en: "Dispatch",
          ja: "ディスパッチ",
        })}</div>
        <div className="ios-feature-page__title">{pickLocaleText(locale, {
          "zh-CN": "自动调度总览",
          "zh-TW": "自動調度總覽",
          en: "Automation dispatch overview",
          ja: "自動ディスパッチ概要",
        })}</div>
      </div>
      <div className="ios-feature-page__canvas">
        <HermesDispatchCenter compact />
      </div>
    </div>
  );
}

function SettingsTab() {
  const locale = useStore(s => s.locale);
  return (
    <div className="ios-feature-page ios-feature-page--settings">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">{pickLocaleText(locale, {
          "zh-CN": "控制台",
          "zh-TW": "控制台",
          en: "Control Center",
          ja: "コントロールセンター",
        })}</div>
        <div className="ios-feature-page__title">{pickLocaleText(locale, {
          "zh-CN": "人工接管与深层配置",
          "zh-TW": "人工接管與深層配置",
          en: "Manual takeover and deep controls",
          ja: "手動引き継ぎと詳細設定",
        })}</div>
      </div>
      <div className="ios-feature-page__canvas">
        <ControlCenter />
      </div>
    </div>
  );
}

function LanguageSwitcher() {
  const locale = useStore(s => s.locale);
  const setLocale = useStore(s => s.setLocale);

  return (
    <div className="locale-switcher" role="tablist" aria-label="Language Switcher">
      {UI_LOCALE_OPTIONS.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={locale === option.id}
          title={option.fullLabel}
          className={`locale-switcher__button ${locale === option.id ? "is-active" : ""}`}
          onClick={() => setLocale(option.id)}
        >
          {option.shortLabel}
        </button>
      ))}
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

function getAgentStatusLabel(
  locale: UiLocale,
  status: ReturnType<typeof useStore.getState>["agents"][keyof ReturnType<typeof useStore.getState>["agents"]]["status"],
) {
  switch (status) {
    case "running":
      return pickLocaleText(locale, { "zh-CN": "工作中", "zh-TW": "工作中", en: "Running", ja: "稼働中" });
    case "error":
      return pickLocaleText(locale, { "zh-CN": "异常", "zh-TW": "異常", en: "Error", ja: "エラー" });
    default:
      return pickLocaleText(locale, { "zh-CN": "待命", "zh-TW": "待命", en: "Idle", ja: "待機" });
  }
}

function getMobileExecutionTone(status: ReturnType<typeof useStore.getState>["executionRuns"][number]["status"]) {
  if (status === "completed") return "ready";
  if (status === "failed") return "blocked";
  return "partial";
}

function getMobileExecutionLabel(
  locale: UiLocale,
  status: ReturnType<typeof useStore.getState>["executionRuns"][number]["status"],
) {
  switch (status) {
    case "queued":
      return pickLocaleText(locale, { "zh-CN": "已排队", "zh-TW": "已排隊", en: "Queued", ja: "キュー済み" });
    case "analyzing":
      return pickLocaleText(locale, { "zh-CN": "分析中", "zh-TW": "分析中", en: "Analyzing", ja: "分析中" });
    case "running":
      return pickLocaleText(locale, { "zh-CN": "执行中", "zh-TW": "執行中", en: "Running", ja: "実行中" });
    case "completed":
      return pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" });
    case "failed":
      return pickLocaleText(locale, { "zh-CN": "已失败", "zh-TW": "已失敗", en: "Failed", ja: "失敗" });
    default:
      return status;
  }
}

function getVerificationLabel(
  locale: UiLocale,
  status: NonNullable<ReturnType<typeof useStore.getState>["executionRuns"][number]["verificationStatus"]>,
) {
  switch (status) {
    case "idle":
      return pickLocaleText(locale, { "zh-CN": "待验证", "zh-TW": "待驗證", en: "Pending", ja: "未検証" });
    case "running":
      return pickLocaleText(locale, { "zh-CN": "验证中", "zh-TW": "驗證中", en: "Running", ja: "検証中" });
    case "passed":
      return pickLocaleText(locale, { "zh-CN": "通过", "zh-TW": "通過", en: "Passed", ja: "合格" });
    case "failed":
      return pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" });
    case "skipped":
      return pickLocaleText(locale, { "zh-CN": "跳过", "zh-TW": "跳過", en: "Skipped", ja: "スキップ" });
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

function getWorkflowStatusLabel(
  locale: UiLocale,
  status: ReturnType<typeof useStore.getState>["workflowRuns"][number]["status"],
) {
  switch (status) {
    case "queued":
      return pickLocaleText(locale, { "zh-CN": "待排队", "zh-TW": "待排隊", en: "Queued", ja: "キュー待ち" });
    case "staged":
      return pickLocaleText(locale, { "zh-CN": "已暂存", "zh-TW": "已暫存", en: "Staged", ja: "一時保存" });
    case "in-progress":
      return pickLocaleText(locale, { "zh-CN": "进行中", "zh-TW": "進行中", en: "In Progress", ja: "進行中" });
    case "completed":
      return pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" });
    case "archived":
      return pickLocaleText(locale, { "zh-CN": "已归档", "zh-TW": "已歸檔", en: "Archived", ja: "アーカイブ済み" });
    default:
      return status;
  }
}

function getDispatchBlockedReason(
  locale: UiLocale,
  wsStatus: ReturnType<typeof useStore.getState>["wsStatus"],
  automationPaused: boolean,
  automationMode: ReturnType<typeof useStore.getState>["automationMode"],
  remoteSupervisorEnabled: boolean,
) {
  if (wsStatus !== "connected") {
    return pickLocaleText(locale, {
      "zh-CN": "远程通道还没连上",
      "zh-TW": "遠程通道還沒連上",
      en: "the remote channel is not connected",
      ja: "リモートチャネルが未接続です",
    });
  }
  if (automationPaused) {
    return pickLocaleText(locale, {
      "zh-CN": "自动化当前已暂停",
      "zh-TW": "自動化目前已暫停",
      en: "automation is paused",
      ja: "自動化が一時停止中です",
    });
  }
  if (automationMode === "manual") {
    return pickLocaleText(locale, {
      "zh-CN": "当前仍是人工模式",
      "zh-TW": "目前仍是人工模式",
      en: "manual mode is still active",
      ja: "手動モードのままです",
    });
  }
  if (!remoteSupervisorEnabled) {
    return pickLocaleText(locale, {
      "zh-CN": "远程值守当前关闭",
      "zh-TW": "遠程值守目前關閉",
      en: "remote supervision is disabled",
      ja: "遠隔監督が無効です",
    });
  }
  return pickLocaleText(locale, {
    "zh-CN": "量化结果仍建议先观察",
    "zh-TW": "量化結果仍建議先觀察",
    en: "the score still suggests observation first",
    ja: "まだ観察優先の判断です",
  });
}

function formatApprovalFeedback(
  locale: UiLocale,
  type: "blocked" | "sent" | "failed" | "rejected",
  title: string,
  blockedReason?: string,
) {
  switch (type) {
    case "blocked":
      return pickLocaleText(locale, {
        "zh-CN": `已批准 ${title}，但这次没有自动派发，因为${blockedReason}。`,
        "zh-TW": `已批准 ${title}，但這次沒有自動派發，因為${blockedReason}。`,
        en: `${title} was approved, but it was not auto-dispatched because ${blockedReason}.`,
        ja: `${title} は承認されましたが、${blockedReason} のため自動派信されませんでした。`,
      });
    case "sent":
      return pickLocaleText(locale, {
        "zh-CN": `已批准 ${title}，并已直接送入执行链路。`,
        "zh-TW": `已批准 ${title}，並已直接送入執行鏈路。`,
        en: `${title} was approved and sent directly into the execution flow.`,
        ja: `${title} は承認され、そのまま実行フローへ送られました。`,
      });
    case "failed":
      return pickLocaleText(locale, {
        "zh-CN": `已批准 ${title}，但派发链路没有成功建立。`,
        "zh-TW": `已批准 ${title}，但派發鏈路沒有成功建立。`,
        en: `${title} was approved, but the dispatch link was not established.`,
        ja: `${title} は承認されましたが、配信リンクの確立に失敗しました。`,
      });
    case "rejected":
      return pickLocaleText(locale, {
        "zh-CN": `已驳回 ${title}，审计记录会保留这次处理。`,
        "zh-TW": `已駁回 ${title}，審計記錄會保留這次處理。`,
        en: `${title} was rejected and the audit log will keep this action.`,
        ja: `${title} は却下され、この操作は監査ログに記録されます。`,
      });
  }
}

function getDashboardBusinessFocus(
  locale: UiLocale,
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
        title: pickLocaleText(locale, {
          "zh-CN": `客户与会话 · ${counts.customers + counts.channelSessions}`,
          "zh-TW": `客戶與會話 · ${counts.customers + counts.channelSessions}`,
          en: `Customers & Chats · ${counts.customers + counts.channelSessions}`,
          ja: `顧客と会話 · ${counts.customers + counts.channelSessions}`,
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": `当前项目下有 ${counts.customers} 个客户、${counts.channelSessions} 个渠道会话，适合先检查值守响应与接待质量。`,
          "zh-TW": `目前專案下有 ${counts.customers} 個客戶、${counts.channelSessions} 個渠道會話，適合先檢查值守響應與接待品質。`,
          en: `This project has ${counts.customers} customers and ${counts.channelSessions} channel sessions. Start by checking response quality.`,
          ja: `このプロジェクトには顧客 ${counts.customers} 件、チャネル会話 ${counts.channelSessions} 件があります。まず応答品質を確認しましょう。`,
        }),
        actionLabel: pickLocaleText(locale, { "zh-CN": "查看控制台", "zh-TW": "查看控制台", en: "Open Control", ja: "コントロールを見る" }),
        tab: "settings" as const,
        controlCenterSectionId: "entities",
      },
      {
        id: "support-tickets",
        eyebrow: "Tickets",
        title: pickLocaleText(locale, {
          "zh-CN": `待跟进工单 · ${counts.tickets}`,
          "zh-TW": `待跟進工單 · ${counts.tickets}`,
          en: `Open Tickets · ${counts.tickets}`,
          ja: `対応待ちチケット · ${counts.tickets}`,
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": "客服模式下先盯工单推进和售后处理，避免响应链路堆积。",
          "zh-TW": "客服模式下先盯工單推進和售後處理，避免響應鏈路堆積。",
          en: "In support mode, prioritize tickets and after-sales work to avoid response backlog.",
          ja: "サポートモードでは、チケットとアフターサポートを優先して滞留を防ぎます。",
        }),
        actionLabel: pickLocaleText(locale, { "zh-CN": "进入聊天", "zh-TW": "進入聊天", en: "Open Chat", ja: "チャットへ" }),
        tab: "tasks" as const,
      },
    ];
  }

  if (activeTemplateId === "content") {
    return [
      {
        id: "content-tasks",
        eyebrow: "Content",
        title: pickLocaleText(locale, {
          "zh-CN": `内容任务 · ${counts.contentTasks}`,
          "zh-TW": `內容任務 · ${counts.contentTasks}`,
          en: `Content Tasks · ${counts.contentTasks}`,
          ja: `コンテンツタスク · ${counts.contentTasks}`,
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": `当前项目下有 ${counts.contentTasks} 个内容任务，可优先推进脚本、视觉和发布节奏。`,
          "zh-TW": `目前專案下有 ${counts.contentTasks} 個內容任務，可優先推進腳本、視覺和發布節奏。`,
          en: `There are ${counts.contentTasks} content tasks in this project. Prioritize script, visuals, and publishing rhythm.`,
          ja: `このプロジェクトには ${counts.contentTasks} 件のコンテンツタスクがあります。脚本、ビジュアル、配信リズムを優先しましょう。`,
        }),
        actionLabel: pickLocaleText(locale, { "zh-CN": "查看控制台", "zh-TW": "查看控制台", en: "Open Control", ja: "コントロールを見る" }),
        tab: "settings" as const,
        controlCenterSectionId: "entities",
      },
      {
        id: "content-leads",
        eyebrow: "Signals",
        title: pickLocaleText(locale, {
          "zh-CN": `选题线索 · ${counts.leads}`,
          "zh-TW": `選題線索 · ${counts.leads}`,
          en: `Content Signals · ${counts.leads}`,
          ja: `企画シグナル · ${counts.leads}`,
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": "线索数量可以帮助判断哪些主题值得转成内容工单继续跟进。",
          "zh-TW": "線索數量可以幫助判斷哪些主題值得轉成內容工單繼續跟進。",
          en: "Signal volume helps decide which topics are worth turning into content tasks.",
          ja: "シグナル数は、どのテーマをコンテンツタスク化すべきか判断する助けになります。",
        }),
        actionLabel: pickLocaleText(locale, { "zh-CN": "进入工作区", "zh-TW": "進入工作區", en: "Open Desk", ja: "ワークスペースへ" }),
        tab: "workspace" as const,
      },
    ];
  }

  return [
    {
      id: "engineering-leads",
      eyebrow: "Pipeline",
      title: pickLocaleText(locale, {
        "zh-CN": `研发相关线索 · ${counts.leads}`,
        "zh-TW": `研發相關線索 · ${counts.leads}`,
        en: `Build Signals · ${counts.leads}`,
        ja: `開発シグナル · ${counts.leads}`,
      }),
      copy: pickLocaleText(locale, {
        "zh-CN": `当前项目有 ${counts.leads} 条业务线索，可以帮助判断最值得先实现或联调的能力。`,
        "zh-TW": `目前專案有 ${counts.leads} 條業務線索，可以幫助判斷最值得先實現或聯調的能力。`,
        en: `This project has ${counts.leads} business signals that can help prioritize what to build or integrate first.`,
        ja: `このプロジェクトには ${counts.leads} 件の業務シグナルがあり、何を先に実装・連携すべきか判断できます。`,
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "查看控制台", "zh-TW": "查看控制台", en: "Open Control", ja: "コントロールを見る" }),
      tab: "settings" as const,
      controlCenterSectionId: "entities",
    },
    {
      id: "engineering-tickets",
      eyebrow: "Execution",
      title: pickLocaleText(locale, {
        "zh-CN": `待收敛问题 · ${counts.tickets}`,
        "zh-TW": `待收斂問題 · ${counts.tickets}`,
        en: `Open Issues · ${counts.tickets}`,
        ja: `収束待ち課題 · ${counts.tickets}`,
      }),
      copy: pickLocaleText(locale, {
        "zh-CN": "工单与会话数量能反映当前产品缺口，适合转成研发修复和流程优化动作。",
        "zh-TW": "工單與會話數量能反映目前產品缺口，適合轉成研發修復和流程優化動作。",
        en: "Ticket and chat volume reflects product gaps and should be turned into fixes or flow improvements.",
        ja: "チケットと会話の量は製品の不足を示し、修正やフロー改善へ転換すべきです。",
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "进入聊天", "zh-TW": "進入聊天", en: "Open Chat", ja: "チャットへ" }),
      tab: "tasks" as const,
    },
  ];
}

function MeetingTab() {
  const locale = useStore(s => s.locale);
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
    void syncRuntimeSettings();
    sendWs({ type: "meeting", topic: topic.trim() });
  };

  const agentInfo: Record<string, { name: string; emoji: string; color: string }> = {
    orchestrator: { name: pickLocaleText(locale, { "zh-CN": "虾总管", "zh-TW": "蝦總管", en: "Orchestrator Lobster", ja: "統括ロブスター" }), emoji: "🦞", color: "var(--accent)" },
    explorer: { name: pickLocaleText(locale, { "zh-CN": "探海龙虾", "zh-TW": "探海龍蝦", en: "Explorer Lobster", ja: "探索ロブスター" }), emoji: "🔎", color: "#38bdf8" },
    writer: { name: pickLocaleText(locale, { "zh-CN": "执笔龙虾", "zh-TW": "執筆龍蝦", en: "Writer Lobster", ja: "執筆ロブスター" }), emoji: "✍️", color: "#34c759" },
    designer: { name: pickLocaleText(locale, { "zh-CN": "幻影龙虾", "zh-TW": "幻影龍蝦", en: "Designer Lobster", ja: "デザイナーロブスター" }), emoji: "🎨", color: "#ff5c8a" },
    performer: { name: pickLocaleText(locale, { "zh-CN": "戏精龙虾", "zh-TW": "戲精龍蝦", en: "Performer Lobster", ja: "パフォーマーロブスター" }), emoji: "🎬", color: "#ff9f0a" },
    greeter: { name: pickLocaleText(locale, { "zh-CN": "迎客龙虾", "zh-TW": "迎客龍蝦", en: "Greeter Lobster", ja: "接客ロブスター" }), emoji: "💬", color: "#00c7be" },
  };

  const roleLabel: Record<string, string> = {
    open: pickLocaleText(locale, { "zh-CN": "开场", "zh-TW": "開場", en: "Opening", ja: "導入" }),
    speak: pickLocaleText(locale, { "zh-CN": "观点", "zh-TW": "觀點", en: "View", ja: "見解" }),
    rebuttal: pickLocaleText(locale, { "zh-CN": "辩论", "zh-TW": "辯論", en: "Debate", ja: "議論" }),
    summary: pickLocaleText(locale, { "zh-CN": "结论", "zh-TW": "結論", en: "Summary", ja: "結論" }),
  };

  return (
    <section className="meeting-shell ios-feature-page">
      <div className="ios-feature-page__header">
        <div className="ios-feature-page__eyebrow">Meeting</div>
        <div className="ios-feature-page__title">{pickLocaleText(locale, {
          "zh-CN": "需要多人观点时，切到会议模式集中讨论",
          "zh-TW": "需要多人觀點時，切到會議模式集中討論",
          en: "Switch to meeting mode when you need multiple perspectives.",
          ja: "複数の視点が必要なときは会議モードに切り替えます。",
        })}</div>
      </div>

      <div ref={scrollRef} className="meeting-shell__stream">
        {meetingSpeeches.length === 0 && !meetingActive && (
          <div className="meeting-shell__empty">{pickLocaleText(locale, {
            "zh-CN": "发起议题后，团队发言会实时出现在这里。",
            "zh-TW": "發起議題後，團隊發言會即時出現在這裡。",
            en: "Team replies will appear here in real time after the topic starts.",
            ja: "議題を開始すると、チームの発言がここにリアルタイムで表示されます。",
          })}</div>
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

        {meetingActive && <div className="meeting-shell__loading">{pickLocaleText(locale, {
          "zh-CN": "团队正在讨论中...",
          "zh-TW": "團隊正在討論中...",
          en: "The team is discussing...",
          ja: "チームが議論中です...",
        })}</div>}
      </div>

      <div className="meeting-shell__composer">
        <input
          className="input"
          placeholder={pickLocaleText(locale, {
            "zh-CN": "输入会议议题，例如：下一版产品首页该怎么改？",
            "zh-TW": "輸入會議議題，例如：下一版產品首頁該怎麼改？",
            en: "Enter a meeting topic, e.g. how should the next product homepage change?",
            ja: "会議テーマを入力してください。例: 次の製品ホームページをどう改善するか？",
          })}
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
          {meetingActive
            ? pickLocaleText(locale, { "zh-CN": "讨论中...", "zh-TW": "討論中...", en: "Discussing...", ja: "議論中..." })
            : pickLocaleText(locale, { "zh-CN": "开始会议", "zh-TW": "開始會議", en: "Start Meeting", ja: "会議を開始" })}
        </button>
      </div>
    </section>
  );
}
