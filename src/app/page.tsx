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

type AppTab = "dashboard" | "tasks" | "workspace" | "meeting" | "settings";

const TAB_LABELS: Array<{ id: AppTab; label: string }> = [
  { id: "dashboard", label: "概览" },
  { id: "tasks", label: "对话流" },
  { id: "workspace", label: "工作区" },
  { id: "meeting", label: "会议室" },
  { id: "settings", label: "控制中心" },
];

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

  return (
    <div className="shell-root">
      <DesktopShellBehaviors />

      <header className="shell-header">
        <div className="shell-header__left">
          {showLeftSidebar && (
            <button type="button" className="shell-header__toggle" onClick={() => toggleLeft()} title="切换左侧栏">
              {leftOpen ? "◧" : "◨"}
            </button>
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

function DashboardTab() {
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