"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type SVGProps } from "react";
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
import { TaskPipeline } from "@/components/TaskPipeline";
import { ActivityPanel } from "@/components/ActivityPanel";
import { CommandInput } from "@/components/CommandInput";
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
import { ChatSessionsPanel } from "@/components/ChatSessionsPanel";
import {
  createSemanticMemoryProvider,
  registerSemanticMemoryProvider,
  resetSemanticMemoryProvider,
} from "@/lib/semantic-memory";
import { randomId, timeAgo } from "@/lib/utils";
import { AGENT_META, getTeamOperatingTemplate, PLATFORM_DEFINITIONS, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { AppTab, ControlCenterSectionId, UiLocale } from "@/store/types";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { detectElectronRuntimeWindow } from "@/lib/electron-runtime";
import { runExecutionVerification } from "@/lib/execution-verification";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import {
  UI_LOCALE_OPTIONS,
  formatAutomationModeLabel,
  formatWsStatusLabel,
  getDefaultChatStarters,
  getPrimaryNavItems,
  getUiText,
  pickLocaleText,
} from "@/lib/ui-locale";
import { DEFAULT_CHAT_TITLE, sortChatSessions } from "@/lib/chat-sessions";
import { AgentIcon, getAgentIconColor } from "@/components/AgentIcon";

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
  void sendExecutionDispatch({
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
    const checkBusinessQueue = async () => {
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

      const { ok, executionRunId } = await sendExecutionDispatch({
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
      void checkBusinessQueue();
    }, 60000);

    const bootTimer = window.setTimeout(() => {
      void checkBusinessQueue();
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
    if (activeTab === "workspace") {
      setTab("tasks");
    }
  }, [activeTab, setTab]);

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
  const sidebarSummary = useMemo(
    () => [
      {
        label: uiText.common.connection,
        value: formatWsStatusLabel(locale, wsStatus),
      },
      {
        label: uiText.common.mode,
        value: formatAutomationModeLabel(locale, automationPaused, automationMode),
      },
      {
        label: uiText.common.running,
        value: String(runningCount),
      },
    ],
    [automationMode, automationPaused, locale, runningCount, uiText.common.connection, uiText.common.mode, uiText.common.running, wsStatus],
  );

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
          {leftOpen ? (
            <>
              <div className="ios-chat-shell__sidebar-top">
                <div className="ios-chat-shell__brand ios-chat-shell__brand--minimal">
                  <div className="ios-chat-shell__brand-mark" aria-hidden="true" />
                  <div className="ios-chat-shell__brand-copy">
                    <div className="ios-chat-shell__brand-eyebrow">{uiText.common.brandEyebrow}</div>
                    <div className="ios-chat-shell__brand-title">
                      {pickLocaleText(locale, {
                        "zh-CN": "STARCRAW",
                        "zh-TW": "STARCRAW",
                        en: "STARCRAW",
                        ja: "STARCRAW",
                      })}
                    </div>
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
          )}
        </aside>

        <main className="ios-chat-shell__main">
          <div className="ios-chat-shell__topbar">
            <div className="ios-chat-shell__topbar-left">
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
  const sidebarSummary = useMemo(
    () => [
      {
        label: uiText.common.connection,
        value: formatWsStatusLabel(locale, wsStatus),
      },
      {
        label: uiText.common.desktop,
        value: desktopRuntimeLabel,
      },
      {
        label: uiText.common.running,
        value: String(runningCount),
      },
    ],
    [desktopRuntimeLabel, locale, runningCount, uiText.common.connection, uiText.common.desktop, uiText.common.running, wsStatus],
  );
  useEffect(() => {
    if (activeTab === "workspace") {
      setTab("tasks");
    }
  }, [activeTab, setTab]);

  const offline = wsStatus !== "connected";
  const shouldShowPipelineAlert = (offline || desktopRuntimeTone.tone !== "ready") && activeTab !== "settings";
  const sidebarAlert = shouldShowPipelineAlert ? (
    <section className="desktop-workspace-shell__section desktop-workspace-shell__section--sidebar-alert">
      <div className="desktop-workspace-shell__alert desktop-workspace-shell__alert--sidebar">
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
          <button
            type="button"
            className="desktop-workspace-shell__hero-action"
            onClick={() => openControlCenterSection("overview")}
          >
            {uiText.common.checkSettings}
          </button>
          <button type="button" className="desktop-workspace-shell__hero-action" onClick={() => setTab("tasks")}>
            {uiText.common.manualTakeover}
          </button>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <div className="desktop-workspace-shell">
      <DesktopShellBehaviors />
      <DesktopRuntimeBridge />
      <ExecutionVerificationBridge />

      <header className="desktop-workspace-shell__topbar">
        <div className="desktop-workspace-shell__topbar-left">
          <div className="desktop-workspace-shell__brand">
            <div className="desktop-workspace-shell__brand-mark" aria-hidden="true" />
            <div>
              <div className="desktop-workspace-shell__eyebrow">{uiText.common.desktopBrandEyebrow}</div>
              <div className="desktop-workspace-shell__title">{uiText.common.desktopBrandTitle}</div>
            </div>
          </div>
        </div>

        <div className="desktop-workspace-shell__topbar-right">
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
        <aside className={`desktop-workspace-shell__sidebar ${leftOpen ? "" : "is-collapsed"}`}>
          {leftOpen ? (
            <>
              <div className="desktop-workspace-shell__sidebar-top">
                <div className="desktop-workspace-shell__sidebar-brand">
                  <div className="desktop-workspace-shell__brand-mark" aria-hidden="true" />
                  <div className="desktop-workspace-shell__sidebar-brand-copy">
                    <span>{uiText.common.desktopBrandEyebrow}</span>
                    <strong>{uiText.common.desktopBrandTitle}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="desktop-workspace-shell__sidebar-collapse"
                  onClick={() => toggleLeft()}
                  aria-label={uiText.common.hideSidebar}
                  title={uiText.common.hideSidebar}
                >
                  <SidebarPanelIcon />
                </button>
              </div>

              <div className="desktop-workspace-shell__nav">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`desktop-workspace-shell__nav-item ${activeTab === item.id ? "is-active" : ""}`}
                  >
                    <span className="desktop-workspace-shell__nav-icon"><NavItemIcon id={item.id} /></span>
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>

              <div className="desktop-workspace-shell__sidebar-footer">
                {sidebarSummary.map(item => (
                  <div key={item.label} className="desktop-workspace-shell__sidebar-mini">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
                {sidebarAlert ? <div className="desktop-workspace-shell__sidebar-alert-mini">{sidebarAlert}</div> : null}
                <DesktopSidebarQuickSettings />
              </div>
            </>
          ) : (
            <div className="desktop-workspace-shell__sidebar-rail">
              <button
                type="button"
                className="desktop-workspace-shell__sidebar-collapse"
                onClick={() => toggleLeft()}
                aria-label={uiText.common.showSidebar}
                title={uiText.common.showSidebar}
              >
                <SidebarPanelIcon />
              </button>
            </div>
          )}
        </aside>

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

          {activeTab === "dashboard" ? <DashboardTab onOpenTab={setTab} /> : null}
          {activeTab === "tasks" ? <DesktopChatWorkspace /> : null}
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
  const setAutomationMode = useStore(s => s.setAutomationMode);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setRemoteSupervisorEnabled = useStore(s => s.setRemoteSupervisorEnabled);
  const setAutoDispatchScheduledTasks = useStore(s => s.setAutoDispatchScheduledTasks);
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
  const compactMetrics = [
    {
      label: pickLocaleText(locale, { "zh-CN": "Agent", "zh-TW": "Agent", en: "Agents", ja: "Agents" }),
      value: `${runningCount}/${totalAgentCount}`,
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "执行", "zh-TW": "執行", en: "Runs", ja: "実行" }),
      value: String(activeRunCount),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "审批", "zh-TW": "審批", en: "Approvals", ja: "承認" }),
      value: String(pendingApprovalsCount),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "平台", "zh-TW": "平台", en: "Platforms", ja: "接続" }),
      value: String(enabledPlatformEntries.length),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "上下文", "zh-TW": "上下文", en: "Context", ja: "文脈" }),
      value: String(deskContextCount),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "业务", "zh-TW": "業務", en: "Entities", ja: "業務" }),
      value: String(businessEntityCount),
    },
  ];

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
                {activeTemplate && activeSurface ? (
                  <span className="ios-home__hero-meta-pill ios-home__hero-meta-pill--accent">
                    {uiText.dashboard.teamModePrefix} · {activeTemplate.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="ios-home__metric-strip">
              {compactMetrics.map(metric => (
                <article key={metric.label} className="ios-home__metric-tile">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              ))}
            </div>

            <div className="ios-home__overview-grid">
              <section className="ios-home__overview-card">
                <div className="ios-home__overview-head">
                  <div>
                    <div className="ios-home__eyebrow">{pickLocaleText(locale, { "zh-CN": "Agent 实时状态", "zh-TW": "Agent 即時狀態", en: "Live Agent Status", ja: "Agent の現在状況" })}</div>
                    <div className="ios-home__overview-title">{pickLocaleText(locale, { "zh-CN": "谁在工作、正在做什么", "zh-TW": "誰在工作、正在做什麼", en: "Who is working and what they are doing", ja: "誰が何をしているか" })}</div>
                  </div>
                </div>
                <div className="ios-home__agent-compact-grid">
                  {agentSnapshots.map(agent => (
                    <article key={agent.id} className="ios-home__agent-compact-card">
                      <div className="ios-home__agent-compact-head">
                        <div className="ios-home__agent-avatar">
                          <AgentIcon agentId={agent.id} size={20} />
                        </div>
                        <div className="ios-home__agent-compact-name">
                          <strong>{AGENT_META[agent.id].name}</strong>
                          <span className={`ios-home__agent-badge is-${agent.status === "running" ? "running" : agent.status === "error" ? "error" : "idle"}`}>
                            {getAgentStatusLabel(locale, agent.status)}
                          </span>
                        </div>
                      </div>
                      <div className="ios-home__agent-compact-task" title={agent.summary}>{agent.summary}</div>
                    </article>
                  ))}
                </div>
                <div className="ios-home__overview-footer">
                  <span>{pickLocaleText(locale, {
                    "zh-CN": `总计 ${totalAgentCount} 个 agent，状态全部在这里展示`,
                    "zh-TW": `總計 ${totalAgentCount} 個 agent，狀態全部在這裡展示`,
                    en: `${totalAgentCount} agents are all shown here`,
                    ja: `${totalAgentCount} 体の agent 状態をここにまとめて表示しています`,
                  })}</span>
                </div>
              </section>
            </div>

            <div className="ios-home__inline-summary">
              <div className="ios-home__inline-summary-item">
                <span>{pickLocaleText(locale, { "zh-CN": "消息链路", "zh-TW": "消息鏈路", en: "Message Link", ja: "メッセージ経路" })}</span>
                <strong>{formatWsStatusLabel(locale, wsStatus)}</strong>
              </div>
              <div className="ios-home__inline-summary-item">
                <span>{pickLocaleText(locale, { "zh-CN": "桌面能力", "zh-TW": "桌面能力", en: "Desktop", ja: "デスクトップ" })}</span>
                <strong>{desktopRuntimeSummary}</strong>
              </div>
              <div className="ios-home__inline-summary-item">
                <span>{pickLocaleText(locale, { "zh-CN": "工作区上下文", "zh-TW": "工作區上下文", en: "Desk Context", ja: "Desk コンテキスト" })}</span>
                <strong>{pickLocaleText(locale, {
                  "zh-CN": `${deskContextCount} 项`,
                  "zh-TW": `${deskContextCount} 項`,
                  en: `${deskContextCount} assets`,
                  ja: `${deskContextCount} 件`,
                })}</strong>
              </div>
              <div className="ios-home__inline-summary-item">
                <span>{pickLocaleText(locale, { "zh-CN": "业务对象", "zh-TW": "業務對象", en: "Business Objects", ja: "業務オブジェクト" })}</span>
                <strong>{pickLocaleText(locale, {
                  "zh-CN": `${businessEntityCount} 项`,
                  "zh-TW": `${businessEntityCount} 項`,
                  en: `${businessEntityCount} items`,
                  ja: `${businessEntityCount} 件`,
                })}</strong>
              </div>
              <div className="ios-home__inline-summary-item ios-home__inline-summary-item--wide">
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

            {homeActionCards.length > 0 ? (
              <div className="ios-home__hero-actions-block">
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
              </div>
            ) : null}

          </section>
        </div>

        <aside className="ios-home__rail ios-home__desktop-rail">
          <DashboardSupervisionRail
            locale={locale}
            approvalCount={pendingApprovalsCount}
            activeRunCount={activeRunCount}
            approvalItems={mobileApprovalQueue.slice(0, 3)}
            automationPaused={automationPaused}
            automationMode={automationMode}
            remoteSupervisorEnabled={remoteSupervisorEnabled}
            onApproveItem={async (item) => {
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

              const { ok, executionRunId } = await sendExecutionDispatch({
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
            onSetAutomationMode={(mode) => {
              const modePresets = {
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
              } as const;
              const preset = modePresets[mode];
              setAutomationMode(mode);
              setRemoteSupervisorEnabled(preset.remoteSupervisorEnabled);
              setAutomationPaused(preset.automationPaused);
              setAutoDispatchScheduledTasks(preset.autoDispatchScheduledTasks);
            }}
            onOpenRemoteOps={() => openControlCenterSection("remote")}
          />
          <DashboardLiveTaskPanel
            locale={locale}
            scopedExecutionRuns={scopedExecutionRuns}
            scopedOperationLogs={scopedOperationLogs}
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
  approvalItems,
  automationPaused,
  automationMode,
  remoteSupervisorEnabled,
  onApproveItem,
  onRejectItem,
  onSetAutomationMode,
  onOpenRemoteOps,
}: {
  locale: UiLocale;
  approvalCount: number;
  activeRunCount: number;
  approvalItems: BusinessAutomationQueueItem[];
  automationPaused: ReturnType<typeof useStore.getState>["automationPaused"];
  automationMode: ReturnType<typeof useStore.getState>["automationMode"];
  remoteSupervisorEnabled: boolean;
  onApproveItem: (item: BusinessAutomationQueueItem) => Promise<{ message: string; executionRunId?: string }>;
  onRejectItem: (item: BusinessAutomationQueueItem) => void;
  onSetAutomationMode: (mode: ReturnType<typeof useStore.getState>["automationMode"]) => void;
  onOpenRemoteOps: () => void;
}) {
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [approvalExecutionRunId, setApprovalExecutionRunId] = useState<string | null>(null);
  const modeLabel = formatAutomationModeLabel(locale, automationPaused, automationMode);
  const approvalPreviewItems = approvalItems.slice(0, 2);
  const modeOptions = [
    { id: "manual", label: pickLocaleText(locale, { "zh-CN": "人工", "zh-TW": "人工", en: "Manual", ja: "手動" }) },
    { id: "supervised", label: pickLocaleText(locale, { "zh-CN": "监督", "zh-TW": "監督", en: "Supervised", ja: "監督" }) },
    { id: "autonomous", label: pickLocaleText(locale, { "zh-CN": "自治", "zh-TW": "自治", en: "Autonomous", ja: "自律" }) },
  ] as const;

  return (
    <section className="ios-home__mobile-supervision">
      <div className="ios-home__mobile-supervision-head">
        <div>
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
            {modeOptions.map(mode => (
              <button
                key={mode.id}
                type="button"
                className={automationMode === mode.id ? "btn-primary" : "btn-ghost"}
                onClick={() => onSetAutomationMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
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
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={onOpenRemoteOps}
            >
              {approvalCount > 0
                ? pickLocaleText(locale, {
                    "zh-CN": `查看全部 ${approvalCount}`,
                    "zh-TW": `查看全部 ${approvalCount}`,
                    en: `View All ${approvalCount}`,
                    ja: `すべて表示 ${approvalCount}`,
                  })
                : pickLocaleText(locale, { "zh-CN": "打开值守", "zh-TW": "打開值守", en: "Open Ops", ja: "値守りを開く" })}
            </button>
          </div>
          {approvalFeedback ? (
            <div className="ios-home__mobile-supervision-feedback">
              <div>{approvalFeedback}</div>
            </div>
          ) : null}
          {approvalPreviewItems.length > 0 ? (
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
                      onClick={async () => {
                        const result = await onApproveItem(item);
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
          {approvalPreviewItems.length === 0 ? (
            <div className="ios-home__mobile-supervision-note">
              {pickLocaleText(locale, {
                "zh-CN": "当前没有待审批对象",
                "zh-TW": "目前沒有待審批對象",
                en: "No pending approvals",
                ja: "承認待ちはありません",
              })}
            </div>
          ) : null}
        </article>

      </div>
    </section>
  );
}

function DashboardLiveTaskPanel({
  locale,
  scopedExecutionRuns,
  scopedOperationLogs,
}: {
  locale: UiLocale;
  scopedExecutionRuns: ReturnType<typeof useStore.getState>["executionRuns"];
  scopedOperationLogs: ReturnType<typeof useStore.getState>["businessOperationLogs"];
}) {
  const activeRuns = useMemo(
    () =>
      scopedExecutionRuns
        .filter(run => run.status === "queued" || run.status === "analyzing" || run.status === "running")
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [scopedExecutionRuns],
  );

  const liveItems = useMemo(() => {
    return activeRuns.slice(0, 8).map(run => {
      const latestEvent = run.events[run.events.length - 1] ?? null;
      const relatedOperation = scopedOperationLogs.find(log => log.executionRunId === run.id) ?? null;
      const headline = summarizeLiveFeedText(
        latestEvent?.title
        || relatedOperation?.title
        || run.instruction
        || pickLocaleText(locale, {
          "zh-CN": "正在处理中",
          "zh-TW": "正在處理中",
          en: "Processing",
          ja: "処理中",
        }),
        58,
      );
      const detail = summarizeLiveFeedText(
        latestEvent?.detail
        || relatedOperation?.detail
        || run.instruction
        || "",
        84,
      );

      return {
        id: run.id,
        statusLabel: getMobileExecutionLabel(locale, run.status),
        tone: getLiveFeedTone(run.status),
        headline,
        detail,
        progress: getExecutionProgressPercent(run),
        meta: [
          getExecutionSourceLabel(locale, run.source),
          run.currentAgentId ? AGENT_META[run.currentAgentId]?.name ?? null : null,
          timeAgo(run.updatedAt),
        ].filter(Boolean) as string[],
      };
    });
  }, [activeRuns, locale, scopedOperationLogs]);

  const queuedCount = activeRuns.filter(run => run.status === "queued").length;
  const runningCount = activeRuns.filter(run => run.status === "running" || run.status === "analyzing").length;

  return (
    <section className="ios-home__rail-panel ios-home__live-feed-panel">
      <div className="ios-home__live-feed-head">
        <div>
          <div className="ios-home__eyebrow">{pickLocaleText(locale, {
            "zh-CN": "实时任务日志",
            "zh-TW": "即時任務日誌",
            en: "Live Task Log",
            ja: "リアルタイムタスクログ",
          })}</div>
          <div className="ios-home__overview-title">{pickLocaleText(locale, {
            "zh-CN": "自动任务进程",
            "zh-TW": "自動任務進程",
            en: "Automation Progress",
            ja: "自動タスク進行",
          })}</div>
        </div>
        <div className="ios-home__live-feed-metrics">
          <span>{pickLocaleText(locale, { "zh-CN": `运行中 ${runningCount}`, "zh-TW": `運行中 ${runningCount}`, en: `Running ${runningCount}`, ja: `実行中 ${runningCount}` })}</span>
          <span>{pickLocaleText(locale, { "zh-CN": `排队中 ${queuedCount}`, "zh-TW": `排隊中 ${queuedCount}`, en: `Queued ${queuedCount}`, ja: `待機 ${queuedCount}` })}</span>
        </div>
      </div>

      <div className="ios-home__live-feed-list">
        {liveItems.map(item => (
          <article key={item.id} className="ios-home__live-feed-item">
            <div className="ios-home__live-feed-item-head">
              <span className={`ios-home__live-feed-badge is-${item.tone}`}>{item.statusLabel}</span>
              <div className="ios-home__live-feed-headline" title={item.headline}>{item.headline}</div>
              <div className="ios-home__live-feed-progress-label">{item.progress}%</div>
            </div>
            {item.detail ? <div className="ios-home__live-feed-detail" title={item.detail}>{item.detail}</div> : null}
            <div className="ios-home__live-feed-meta">
              {item.meta.map(entry => (
                <span key={`${item.id}-${entry}`}>{entry}</span>
              ))}
            </div>
            <div className="ios-home__live-feed-progress">
              <div className={`ios-home__live-feed-progress-bar is-${item.tone}`} style={{ width: `${item.progress}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TasksTab() {
  const tasks = useStore(s => s.tasks);
  const locale = useStore(s => s.locale);
  const workspaceRoot = useStore(s => s.workspaceRoot);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const createChatSession = useStore(s => s.createChatSession);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const chatStarters = activeSurface?.chatStarters ?? getDefaultChatStarters(locale);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);
  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  useEffect(() => {
    if (!historyOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (historyDropdownRef.current?.contains(target)) return;
      setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [historyOpen]);

  useEffect(() => {
    setHistoryOpen(false);
  }, [activeSessionId]);

  const handleCreateChat = () => {
    createChatSession(activeSession?.workspaceRoot ?? workspaceRoot ?? null);
    setHistoryOpen(false);
  };

  return (
    <div className="ios-chat-page">
      <div className="ios-chat-page__frame">
        <section className="ios-chat-page__surface">
          <div className="ios-chat-page__header">
            <div className="ios-chat-page__header-main">
              <div className="ios-chat-page__eyebrow">{uiText.tasks.eyebrow}</div>
              <div className="ios-chat-page__title">{uiText.tasks.title}</div>
            </div>
            <div className="ios-chat-page__header-side">
              <div className="ios-chat-page__actions">
                <div className="ios-chat-page__history-dropdown" ref={historyDropdownRef}>
                  <button
                    type="button"
                    className={`ios-chat-page__toolbar-btn ios-chat-page__history-trigger ${historyOpen ? "is-active" : ""}`}
                    onClick={() => setHistoryOpen(open => !open)}
                    title={uiText.common.sessions}
                    aria-label={uiText.common.sessions}
                    aria-haspopup="dialog"
                    aria-expanded={historyOpen}
                  >
                    <HistoryIcon />
                    <span className="ios-chat-page__history-trigger-count">{chatSessions.length}</span>
                  </button>

                  {historyOpen ? (
                    <div className="ios-chat-page__history-menu" role="dialog" aria-label={uiText.common.sessions}>
                      <div className="ios-chat-page__history-head">
                        <div>
                          <div className="ios-chat-page__eyebrow">{uiText.common.sessions}</div>
                          <div className="ios-chat-page__history-title">{uiText.common.sessions}</div>
                          <div className="ios-chat-page__history-copy">{uiText.common.sessionsSubtitle}</div>
                        </div>
                      </div>
                      <div className="ios-chat-page__history-body">
                        <ChatSessionsPanel showHeader={false} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="ios-chat-page__meta">
                  <span>{activeSession?.title || DEFAULT_CHAT_TITLE}</span>
                </div>
                <button
                  type="button"
                  className="ios-chat-page__toolbar-btn is-primary"
                  onClick={handleCreateChat}
                >
                  <NewChatIcon />
                  <span>{uiText.common.newChat}</span>
                </button>
              </div>
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
            <>
              <div className="ios-chat-page__stream">
                <TaskPipeline fillHeight />
              </div>
            </>
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
    </div>
  );
}

function WorkspaceTab() {
  const locale = useStore(s => s.locale);
  const workspaceRoot = useStore(s => s.workspaceRoot);
  const workspacePinnedPreviews = useStore(s => s.workspacePinnedPreviews);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceScratchpad = useStore(s => s.workspaceScratchpad);
  const workspacePreviewTabs = useStore(s => s.workspacePreviewTabs);
  const workspaceEntries = useStore(s => s.workspaceEntries);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const setTab = useStore(s => s.setTab);
  const [deskPanelOpen, setDeskPanelOpen] = useState(false);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scopedWorkspaceSavedBundles = useMemo(
    () => filterByProjectScope(workspaceSavedBundles, activeSession ?? {}),
    [activeSession, workspaceSavedBundles],
  );
  const scopedWorkspaceProjectMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, activeSession ?? {}),
    [activeSession, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, activeSession ?? {}),
    [activeSession, workspaceDeskNotes],
  );

  useEffect(() => {
    if (!deskPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeskPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deskPanelOpen]);

  const workspaceSummaryCards = [
    {
      label: pickLocaleText(locale, { "zh-CN": "当前目录", "zh-TW": "目前目錄", en: "Current Folder", ja: "現在のフォルダ" }),
      value: workspaceRoot
        ? workspaceRoot.split(/[\\/]+/).filter(Boolean).at(-1) ?? workspaceRoot
        : pickLocaleText(locale, { "zh-CN": "未选择", "zh-TW": "未選擇", en: "Not Selected", ja: "未選択" }),
      accent: "var(--accent)",
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "固定引用", "zh-TW": "固定引用", en: "Pinned Context", ja: "固定コンテキスト" }),
      value: String(workspacePinnedPreviews.length),
      accent: "#2563eb",
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "项目记忆", "zh-TW": "專案記憶", en: "Project Memory", ja: "プロジェクト記憶" }),
      value: String(scopedWorkspaceProjectMemories.length),
      accent: "#14b8a6",
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "草稿与便签", "zh-TW": "草稿與便箋", en: "Drafts & Notes", ja: "草稿とノート" }),
      value: String(scopedDeskNotes.length + (workspaceScratchpad.trim() ? 1 : 0)),
      accent: "#f59e0b",
    },
  ];

  const retainedCapabilities = [
    pickLocaleText(locale, { "zh-CN": "选择本地文件夹并浏览文件", "zh-TW": "選擇本地資料夾並瀏覽檔案", en: "Choose a local folder and browse files", ja: "ローカルフォルダを選んでファイルを閲覧" }),
    pickLocaleText(locale, { "zh-CN": "预览文件并固定为引用上下文", "zh-TW": "預覽檔案並固定為引用上下文", en: "Preview files and pin them as context", ja: "ファイルをプレビューして文脈として固定" }),
    pickLocaleText(locale, { "zh-CN": "保存项目记忆和上下文包", "zh-TW": "保存專案記憶與上下文包", en: "Save project memories and context packs", ja: "プロジェクト記憶とコンテキストパックを保存" }),
    pickLocaleText(locale, { "zh-CN": "维护草稿、便签和工作台临时上下文", "zh-TW": "維護草稿、便箋與工作台臨時上下文", en: "Maintain drafts, notes, and temporary desk context", ja: "草稿・ノート・一時コンテキストを維持" }),
  ];

  const latestMemory = scopedWorkspaceProjectMemories[0] ?? null;
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
        <div className="workspace-lite">
          <section className="workspace-lite__hero">
            <div>
              <div className="workspace-lite__eyebrow">
                {pickLocaleText(locale, {
                  "zh-CN": "轻量工作区",
                  "zh-TW": "輕量工作區",
                  en: "Light Workspace",
                  ja: "ライトワークスペース",
                })}
              </div>
              <div className="workspace-lite__title">
                {pickLocaleText(locale, {
                  "zh-CN": "把工作区收成一个上下文入口，而不是整页操作台",
                  "zh-TW": "把工作區收斂成一個上下文入口，而不是整頁操作台",
                  en: "Keep workspace as a context entry point instead of a full-page control surface",
                  ja: "ワークスペースを全面操作台ではなく文脈入口として保つ",
                })}
              </div>
              <div className="workspace-lite__copy">
                {pickLocaleText(locale, {
                  "zh-CN": "文件浏览、引用固定、项目记忆和草稿能力都还保留，但改为需要时再展开，避免主页面长期被大面积空态占住。",
                  "zh-TW": "檔案瀏覽、引用固定、專案記憶和草稿能力都會保留，但改成需要時再展開，避免主頁長期被大面積空態佔住。",
                  en: "File browsing, pinned references, project memory, and drafts all remain available, but now open on demand so the main page does not stay occupied by a large empty workspace.",
                  ja: "ファイル閲覧、固定参照、プロジェクト記憶、草稿は維持しつつ、必要時だけ展開する形にして、空状態の大きな画面占有を避けます。",
                })}
              </div>
            </div>
            <div className="workspace-lite__hero-actions">
              <button type="button" className="btn-primary" onClick={() => setDeskPanelOpen(true)}>
                {pickLocaleText(locale, {
                  "zh-CN": workspaceRoot ? "打开工作区面板" : "选择文件夹并打开",
                  "zh-TW": workspaceRoot ? "打開工作區面板" : "選擇資料夾並打開",
                  en: workspaceRoot ? "Open Workspace Panel" : "Choose Folder and Open",
                  ja: workspaceRoot ? "ワークスペースを開く" : "フォルダを選んで開く",
                })}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                {pickLocaleText(locale, {
                  "zh-CN": "回到聊天",
                  "zh-TW": "回到聊天",
                  en: "Back to Chat",
                  ja: "チャットへ戻る",
                })}
              </button>
            </div>
          </section>

          <div className="workspace-lite__stats">
            {workspaceSummaryCards.map(card => (
              <article key={card.label} className="workspace-lite__stat">
                <span>{card.label}</span>
                <strong style={{ color: card.accent }}>{card.value}</strong>
              </article>
            ))}
          </div>

          <div className="workspace-lite__grid">
            <section className="workspace-lite__panel">
              <div className="workspace-lite__panel-eyebrow">
                {pickLocaleText(locale, {
                  "zh-CN": "当前状态",
                  "zh-TW": "目前狀態",
                  en: "Current State",
                  ja: "現在の状態",
                })}
              </div>
              <div className="workspace-lite__status">
                <div className="workspace-lite__status-item">
                  <span>{pickLocaleText(locale, { "zh-CN": "根目录", "zh-TW": "根目錄", en: "Root", ja: "ルート" })}</span>
                  <strong>{workspaceRoot ?? pickLocaleText(locale, { "zh-CN": "还没有选择本地文件夹", "zh-TW": "還沒有選擇本地資料夾", en: "No local folder selected yet", ja: "ローカルフォルダはまだ未選択です" })}</strong>
                </div>
                <div className="workspace-lite__status-item">
                  <span>{pickLocaleText(locale, { "zh-CN": "当前文件数", "zh-TW": "目前檔案數", en: "Visible Entries", ja: "表示中の項目" })}</span>
                  <strong>
                    {pickLocaleText(locale, {
                      "zh-CN": `${workspaceEntries.length} 项`,
                      "zh-TW": `${workspaceEntries.length} 項`,
                      en: `${workspaceEntries.length} items`,
                      ja: `${workspaceEntries.length} 件`,
                    })}
                  </strong>
                </div>
                <div className="workspace-lite__status-item">
                  <span>{pickLocaleText(locale, { "zh-CN": "当前引用标签", "zh-TW": "目前引用標籤", en: "Preview Tabs", ja: "プレビュータブ" })}</span>
                  <strong>
                    {pickLocaleText(locale, {
                      "zh-CN": `${workspacePreviewTabs.length} 个标签`,
                      "zh-TW": `${workspacePreviewTabs.length} 個標籤`,
                      en: `${workspacePreviewTabs.length} tabs`,
                      ja: `${workspacePreviewTabs.length} タブ`,
                    })}
                  </strong>
                </div>
                <div className="workspace-lite__status-item">
                  <span>{pickLocaleText(locale, { "zh-CN": "最近记忆", "zh-TW": "最近記憶", en: "Latest Memory", ja: "最新の記憶" })}</span>
                  <strong>{latestMemory?.name ?? pickLocaleText(locale, { "zh-CN": "还没有保存项目记忆", "zh-TW": "還沒有保存專案記憶", en: "No saved project memory yet", ja: "保存済み記憶はまだありません" })}</strong>
                </div>
              </div>
            </section>

            <section className="workspace-lite__panel">
              <div className="workspace-lite__panel-eyebrow">
                {pickLocaleText(locale, {
                  "zh-CN": "保留能力",
                  "zh-TW": "保留能力",
                  en: "Retained Capabilities",
                  ja: "保持する機能",
                })}
              </div>
              <div className="workspace-lite__list">
                {retainedCapabilities.map(item => (
                  <div key={item} className="workspace-lite__list-item">
                    {item}
                  </div>
                ))}
              </div>
              <div className="workspace-lite__footnote">
                {pickLocaleText(locale, {
                  "zh-CN": `当前项目下还有 ${scopedWorkspaceSavedBundles.length} 个上下文包、${scopedDeskNotes.length} 条便签可在面板中继续使用。`,
                  "zh-TW": `目前專案下還有 ${scopedWorkspaceSavedBundles.length} 個上下文包、${scopedDeskNotes.length} 條便箋可在面板中繼續使用。`,
                  en: `${scopedWorkspaceSavedBundles.length} saved context packs and ${scopedDeskNotes.length} notes remain available inside the panel.`,
                  ja: `パネル内では ${scopedWorkspaceSavedBundles.length} 件のコンテキストパックと ${scopedDeskNotes.length} 件のノートを引き続き使えます。`,
                })}
              </div>
            </section>
          </div>

          {deskPanelOpen ? (
            <div className="workspace-lite__overlay" onClick={() => setDeskPanelOpen(false)}>
              <div className="workspace-lite__overlay-shell" onClick={event => event.stopPropagation()}>
                <div className="workspace-lite__overlay-head">
                  <div>
                    <div className="workspace-lite__eyebrow">
                      {pickLocaleText(locale, {
                        "zh-CN": "工作区面板",
                        "zh-TW": "工作區面板",
                        en: "Workspace Panel",
                        ja: "ワークスペースパネル",
                      })}
                    </div>
                    <div className="workspace-lite__overlay-title">
                      {pickLocaleText(locale, {
                        "zh-CN": "需要操作文件、引用和记忆时再展开",
                        "zh-TW": "需要操作檔案、引用和記憶時再展開",
                        en: "Open only when you need files, references, or memory operations",
                        ja: "ファイル・参照・記憶操作が必要なときだけ開く",
                      })}
                    </div>
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => setDeskPanelOpen(false)}>
                    {pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })}
                  </button>
                </div>
                <div className="workspace-lite__overlay-body">
                  <WorkspaceDesk />
                </div>
              </div>
            </div>
          ) : null}
        </div>
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
          "zh-CN": "实时任务日志",
          "zh-TW": "即時任務日誌",
          en: "Live Task Log",
          ja: "リアルタイムタスクログ",
        })}</div>
        <div className="ios-feature-page__title">{pickLocaleText(locale, {
          "zh-CN": "任务进程与任务历史",
          "zh-TW": "任務進程與任務歷史",
          en: "Task progress and task history",
          ja: "タスク進行とタスク履歴",
        })}</div>
      </div>
      <div className="ios-feature-page__canvas">
        <ExecutionCenter />
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

function DesktopSidebarQuickSettings() {
  const locale = useStore(s => s.locale);
  const setLocale = useStore(s => s.setLocale);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const quickSettingsLabel = pickLocaleText(locale, {
    "zh-CN": "快速设置",
    "zh-TW": "快速設定",
    en: "Quick Settings",
    ja: "クイック設定",
  });
  const languageLabel = pickLocaleText(locale, {
    "zh-CN": "语言",
    "zh-TW": "語言",
    en: "Language",
    ja: "言語",
  });
  const appearanceLabel = pickLocaleText(locale, {
    "zh-CN": "外观",
    "zh-TW": "外觀",
    en: "Appearance",
    ja: "外観",
  });

  const languageOptions: Array<{ id: UiLocale; label: string }> = [
    { id: "zh-CN", label: "简" },
    { id: "zh-TW", label: "繁" },
    { id: "en", label: "EN" },
    { id: "ja", label: "日" },
  ];

  const themeOptions: Array<{ id: "dark" | "coral" | "jade"; label: string }> = [
    {
      id: "dark",
      label: pickLocaleText(locale, {
        "zh-CN": "浅色",
        "zh-TW": "淺色",
        en: "Light",
        ja: "ライト",
      }),
    },
    {
      id: "coral",
      label: pickLocaleText(locale, {
        "zh-CN": "暖珊瑚",
        "zh-TW": "暖珊瑚",
        en: "Coral",
        ja: "コーラル",
      }),
    },
    {
      id: "jade",
      label: pickLocaleText(locale, {
        "zh-CN": "翡翠",
        "zh-TW": "翡翠",
        en: "Jade",
        ja: "ジェイド",
      }),
    },
  ];

  return (
    <div className={`desktop-workspace-shell__quick-settings ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`desktop-workspace-shell__nav-item desktop-workspace-shell__quick-settings-trigger ${open ? "is-active" : ""}`}
        onClick={() => setOpen(value => !value)}
        aria-label={quickSettingsLabel}
        title={quickSettingsLabel}
      >
        <span className="desktop-workspace-shell__nav-icon"><QuickSettingsIcon /></span>
        <strong>{appearanceLabel}</strong>
      </button>

      {open ? (
        <div className="desktop-workspace-shell__quick-settings-panel">
          <div className="desktop-workspace-shell__quick-settings-group">
            <span>{languageLabel}</span>
            <div className="desktop-workspace-shell__quick-settings-options">
              {languageOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={`desktop-workspace-shell__quick-settings-option ${locale === option.id ? "is-active" : ""}`}
                  onClick={() => setLocale(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="desktop-workspace-shell__quick-settings-group">
            <span>{appearanceLabel}</span>
            <div className="desktop-workspace-shell__quick-settings-options is-theme-list">
              {themeOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={`desktop-workspace-shell__quick-settings-option ${theme === option.id ? "is-active" : ""}`}
                  onClick={() => setTheme(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
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

function NavItemIcon({ id }: { id: AppTab }) {
  switch (id) {
    case "dashboard":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4 4.5h5.2v5.2H4zM10.8 4.5H16v8h-5.2zM4 11.3h5.2v4.2H4zM10.8 14H16" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4.5 14.9V5.1a1.1 1.1 0 0 1 1.1-1.1h9.3A1.1 1.1 0 0 1 16 5.1v9.8a1.1 1.1 0 0 1-1.1 1.1H5.6a1.1 1.1 0 0 1-1.1-1.1Z" stroke="currentColor" strokeWidth="1.45"/>
          <path d="m7.3 9.5 2 2 4-4" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "dispatch":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case "meeting":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M6.2 9.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM13.8 9.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.35"/>
          <path d="M2.9 15.5c.4-2 2-3.2 3.9-3.2s3.5 1.2 3.9 3.2M9.3 15.5c.36-1.72 1.84-2.8 3.57-2.8 1.72 0 3.2 1.08 3.56 2.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M10 6.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" stroke="currentColor" strokeWidth="1.35"/>
          <path d="M10 2.8v1.7M10 15.5v1.7M4.9 4.9l1.2 1.2M13.9 13.9l1.2 1.2M2.8 10h1.7M15.5 10h1.7M4.9 15.1l1.2-1.2M13.9 6.1l1.2-1.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
        </svg>
      );
    default:
      return null;
  }
}

function SidebarPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <rect x="3.2" y="4" width="13.6" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M9.1 4.4v11.2" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

function QuickSettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <path d="M4 5.5h8.5M4 10h12M4 14.5h7.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round"/>
      <circle cx="14.5" cy="5.5" r="1.75" fill="currentColor"/>
      <circle cx="8.2" cy="10" r="1.75" fill="currentColor"/>
      <circle cx="13.2" cy="14.5" r="1.75" fill="currentColor"/>
    </svg>
  );
}

function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" {...props}>
      <path d="M5 5.2h10M5 10h7.6M5 14.8h6.1" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round"/>
      <path d="M13.9 14.4 15 15.5l2-2.3" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function NewChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" {...props}>
      <path d="M10 4.2v11.6M4.2 10h11.6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round"/>
    </svg>
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

function getExecutionSourceLabel(
  locale: UiLocale,
  source: ReturnType<typeof useStore.getState>["executionRuns"][number]["source"],
) {
  switch (source) {
    case "remote-ops":
      return pickLocaleText(locale, { "zh-CN": "值守触发", "zh-TW": "值守觸發", en: "Ops Trigger", ja: "監督起動" });
    case "workflow":
      return pickLocaleText(locale, { "zh-CN": "工作流", "zh-TW": "工作流", en: "Workflow", ja: "ワークフロー" });
    case "workspace":
      return pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" });
    case "quick-start":
      return pickLocaleText(locale, { "zh-CN": "快捷触发", "zh-TW": "快捷觸發", en: "Quick Start", ja: "クイック起動" });
    default:
      return pickLocaleText(locale, { "zh-CN": "聊天任务", "zh-TW": "聊天任務", en: "Chat Task", ja: "チャット起動" });
  }
}

function getLiveFeedTone(
  status: ReturnType<typeof useStore.getState>["executionRuns"][number]["status"],
) {
  if (status === "failed") return "blocked";
  if (status === "completed") return "ready";
  if (status === "running" || status === "analyzing") return "running";
  return "idle";
}

function summarizeLiveFeedText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
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
        actionLabel: pickLocaleText(locale, { "zh-CN": "进入聊天", "zh-TW": "進入聊天", en: "Open Chat", ja: "チャットへ" }),
        tab: "tasks" as const,
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

type MeetingAttachmentKind = "image" | "document" | "audio" | "video" | "other";

type MeetingAttachmentItem = {
  id: string;
  file: File;
  kind: MeetingAttachmentKind;
};

const MEETING_ACCEPTED_FILE_TYPES = [
  "image/*",
  "audio/*",
  "video/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".zip",
  ".rar",
  ".7z",
].join(",");

function detectMeetingAttachmentKind(file: File): MeetingAttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (
    file.type.includes("pdf") ||
    file.type.includes("word") ||
    file.type.includes("sheet") ||
    file.type.includes("excel") ||
    file.type.includes("powerpoint") ||
    file.type.startsWith("text/")
  ) {
    return "document";
  }
  return "other";
}

function getMeetingAttachmentBadge(kind: MeetingAttachmentKind) {
  switch (kind) {
    case "image":
      return "IMG";
    case "document":
      return "DOC";
    case "audio":
      return "AUDIO";
    case "video":
      return "VIDEO";
    default:
      return "FILE";
  }
}

function formatMeetingFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function MeetingTab() {
  const locale = useStore(s => s.locale);
  const [topic, setTopic] = useState("");
  const [attachments, setAttachments] = useState<MeetingAttachmentItem[]>([]);
  const { wsStatus, meetingSpeeches, meetingActive, clearMeeting, setMeetingActive, setMeetingTopic } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [meetingSpeeches]);

  const startMeeting = () => {
    if (!topic.trim() || meetingActive || wsStatus !== "connected") return;
    const composedTopic = attachments.length
      ? `${topic.trim()}\n\nAttachments: ${attachments.map(item => item.file.name).join(", ")}`
      : topic.trim();
    clearMeeting();
    setMeetingTopic(composedTopic);
    setMeetingActive(true);
    setAttachments([]);
    void syncRuntimeSettings();
    sendWs({ type: "meeting", topic: composedTopic });
  };

  const openFilePicker = () => {
    if (meetingActive) return;
    fileInputRef.current?.click();
  };

  const removeAttachment = (id: string) => {
    setAttachments(current => current.filter(item => item.id !== id));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setAttachments(current => [
      ...current,
      ...files.map(file => ({
        id: randomId(),
        file,
        kind: detectMeetingAttachmentKind(file),
      })),
    ]);
    event.target.value = "";
  };

  const agentInfo: Record<string, { name: string; color: string }> = {
    orchestrator: { name: pickLocaleText(locale, { "zh-CN": "鹦鹉螺", "zh-TW": "鸚鵡螺", en: "Nautilus", ja: "オウムガイ" }), color: "var(--accent)" },
    explorer: { name: pickLocaleText(locale, { "zh-CN": "探海鲸鱼", "zh-TW": "探海鯨魚", en: "Scout Whale", ja: "探海クジラ" }), color: "#38bdf8" },
    writer: { name: pickLocaleText(locale, { "zh-CN": "星海章鱼", "zh-TW": "星海章魚", en: "Starsea Octopus", ja: "星海タコ" }), color: "#34c759" },
    designer: { name: pickLocaleText(locale, { "zh-CN": "珊瑚水母", "zh-TW": "珊瑚水母", en: "Coral Jellyfish", ja: "サンゴクラゲ" }), color: "#ff5c8a" },
    performer: { name: pickLocaleText(locale, { "zh-CN": "逐浪海豚", "zh-TW": "逐浪海豚", en: "Surf Dolphin", ja: "波乗りイルカ" }), color: "#ff9f0a" },
    greeter: { name: pickLocaleText(locale, { "zh-CN": "招潮蟹", "zh-TW": "招潮蟹", en: "Fiddler Crab", ja: "シオマネキ" }), color: "#00c7be" },
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
          const info = agentInfo[speech.agentId] ?? { name: speech.agentId, color: "var(--accent)" };
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
                <AgentIcon
                  agentId={(speech.agentId in AGENT_META ? speech.agentId : "orchestrator") as keyof typeof AGENT_META}
                  size={20}
                  color={speech.agentId in AGENT_META ? getAgentIconColor(speech.agentId as keyof typeof AGENT_META) : info.color}
                />
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

      {attachments.length > 0 ? (
        <div className="attachment-list meeting-shell__attachments">
          {attachments.map(({ id, file, kind }) => (
            <div key={id} className="attachment-chip">
              <span className="attachment-chip__type">{getMeetingAttachmentBadge(kind)}</span>
              <span className="attachment-chip__name">{file.name}</span>
              <span className="attachment-chip__size">{formatMeetingFileSize(file.size)}</span>
              <button
                type="button"
                className="attachment-chip__remove"
                onClick={() => removeAttachment(id)}
                disabled={meetingActive}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="meeting-shell__composer command-input__row">
        <input
          ref={fileInputRef}
          type="file"
          accept={MEETING_ACCEPTED_FILE_TYPES}
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="command-input__upload command-input__send2"
          onClick={openFilePicker}
          disabled={meetingActive}
          title={pickLocaleText(locale, {
            "zh-CN": "添加附件",
            "zh-TW": "新增附件",
            en: "Add attachment",
            ja: "添付を追加",
          })}
        >
          +
        </button>
        <input
          className="input meeting-shell__topic-input"
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
          className={`meeting-shell__start-btn ${!meetingActive && topic.trim() && wsStatus === "connected" ? "is-ready" : ""}`}
          onClick={startMeeting}
          disabled={meetingActive || !topic.trim() || wsStatus !== "connected"}
        >
          {meetingActive
            ? pickLocaleText(locale, { "zh-CN": "讨论中...", "zh-TW": "討論中...", en: "Discussing...", ja: "議論中..." })
            : pickLocaleText(locale, { "zh-CN": "开始会议", "zh-TW": "開始會議", en: "Start Meeting", ja: "会議を開始" })}
        </button>
      </div>
      <div className="meeting-shell__composer-hint">
        {attachments.length > 0
          ? pickLocaleText(locale, {
              "zh-CN": `已准备 ${attachments.length} 个附件，发起会议后会连同文件名一起带入讨论上下文。`,
              "zh-TW": `已準備 ${attachments.length} 個附件，發起會議後會連同檔名一起帶入討論上下文。`,
              en: `${attachments.length} attachment(s) ready. The file names will be injected into the meeting context when you start.`,
              ja: `${attachments.length} 件の添付を準備済みです。会議開始時にファイル名も議論コンテキストへ渡されます。`,
            })
          : pickLocaleText(locale, {
              "zh-CN": "可像对话区一样添加附件，把文档、图片或素材文件一起带进会议讨论。",
              "zh-TW": "可像對話區一樣新增附件，把文件、圖片或素材一起帶進會議討論。",
              en: "Add attachments like chat to bring docs, images, or asset files into the meeting context.",
              ja: "チャットと同じように添付を追加して、文書・画像・素材を会議コンテキストに含められます。",
            })}
      </div>
    </section>
  );
}
