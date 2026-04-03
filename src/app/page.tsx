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
import { ExecutionVerificationBridge } from "@/components/ExecutionVerificationBridge";
import { ControlCenter } from "@/components/ControlCenter";
import { ExecutionCenter } from "@/components/ExecutionCenter";
import { PluginContributionPanel } from "@/components/PluginContributionPanel";
import { ProjectHubCard } from "@/components/ProjectHubCard";
import { WorkspaceDesk } from "@/components/WorkspaceDesk";
import {
  createSemanticMemoryProvider,
  registerSemanticMemoryProvider,
  resetSemanticMemoryProvider,
} from "@/lib/semantic-memory";
import type { AppTab } from "@/store/types";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";

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

function dispatchInstruction(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) return;
  sendExecutionDispatch({
    instruction: trimmed,
    source: "workflow",
    includeActiveProjectMemory: true,
  });
}

export default function App() {
  useWebSocket();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { providers, agentConfigs } = useStore.getState();
      sendWs({ type: "settings_sync", providers, agentConfigs });
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
  const semanticMemoryConfig = useStore(s => s.semanticMemoryConfig);

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

  const activeNav = NAV_ITEMS.find(item => item.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="ios-chat-shell">
      <DesktopShellBehaviors />
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
              <div className="ios-chat-shell__capsule">iOS Glass</div>
              <div className="ios-chat-shell__capsule">GPT-style Flow</div>
              <button type="button" className="ios-chat-shell__capsule is-button" onClick={() => setTab("settings")}>
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

function DashboardTab({ onOpenTab }: { onOpenTab: (tab: AppTab) => void }) {
  const tasks = useStore(s => s.tasks);
  const agents = useStore(s => s.agents);
  const workflowRuns = useStore(s => s.workflowRuns);
  const workspacePinnedPreviews = useStore(s => s.workspacePinnedPreviews);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);

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

  const runningCount = Object.values(agents).filter(agent => agent.status === "running").length;
  const completedCount = tasks.filter(task => task.status === "done" && !task.isUserMessage).length;

  return (
    <div className="ios-home">
      <section className="ios-home__hero">
        <div className="ios-home__eyebrow">A ChatGPT-like command center</div>
        <h1 className="ios-home__title">今天想让小龙虾团队帮你完成什么？</h1>
        <p className="ios-home__copy">
          主界面只保留一个清晰的对话入口，其他工具和状态都收进侧栏。你可以像用 ChatGPT 一样先说目标，再从工作区、会议、控制台继续深挖。
        </p>
        <p className="ios-home__copy" style={{ marginTop: 6 }}>
          当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </p>

        <div className="ios-home__composer">
          <CommandInput
            variant="panel"
            title="像 ChatGPT 一样开始"
            hint="直接提问、下发任务，或把工作区上下文塞进来。主页只负责开始，深入工作去左侧功能区。"
          />
        </div>

        <div className="ios-home__prompt-row">
          {HOME_PROMPTS.map(prompt => (
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

      <section className="ios-home__status">
        <ProjectHubCard />
        <StatusCard label="运行中角色" value={String(runningCount)} hint="团队当前正在处理的任务数量" />
        <StatusCard label="已完成回复" value={String(completedCount)} hint="本轮会话里已经产出的有效结果" />
        <StatusCard label="工作流 Run" value={String(workflowRuns.length)} hint="可复用的编排入口与历史记录" />
        <StatusCard label="Desk 上下文" value={`${workspacePinnedPreviews.length + scopedDeskNotes.length + scopedProjectMemories.length}`} hint="当前项目下的固定引用、异步笔记和项目记忆总量" />
      </section>

      <section className="ios-home__grid">
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
      </section>

      <div className="ios-home__plugins">
        <PluginContributionPanel />
      </div>

      <div className="ios-home__plugins">
        <ExecutionCenter compact />
      </div>
    </div>
  );
}

function TasksTab() {
  const tasks = useStore(s => s.tasks);
  const setCommandDraft = useStore(s => s.setCommandDraft);

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
              {CHAT_STARTERS.map(prompt => (
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
