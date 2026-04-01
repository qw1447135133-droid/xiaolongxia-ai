"use client";
import { useState, useEffect, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import { AgentGrid } from "@/components/AgentGrid";
import { TaskPipeline } from "@/components/TaskPipeline";
import { CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";
import { ChatSessionsPanel } from "@/components/ChatSessionsPanel";
import { ActivityPanel } from "@/components/ActivityPanel";
import { CommandInput } from "@/components/CommandInput";
import { CostBar } from "@/components/CostBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PresetTasksPanel } from "@/components/PresetTasksPanel";
import { ScheduledTasksPanel } from "@/components/ScheduledTasksPanel";
import { checkAndExecuteTasks } from "@/lib/scheduled-tasks";
import { randomId } from "@/lib/utils";
import { sendWs } from "@/hooks/useWebSocket";

export default function App() {
  useWebSocket();

  // 页面加载时把配置同步到 WS 服务器（WS 连接后会自动同步，这里是备用）
  useEffect(() => {
    const timer = setTimeout(() => {
      import("@/hooks/useWebSocket").then(({ sendWs }) => {
        const { providers, agentConfigs } = useStore.getState();
        sendWs({ type: "settings_sync", providers, agentConfigs });
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // 定时任务检查器 - 每分钟检查一次
  useEffect(() => {
    const checkInterval = setInterval(() => {
      checkAndExecuteTasks((task) => {
        // 执行定时任务
        const { providers, agentConfigs } = useStore.getState();
        sendWs({ type: "settings_sync", providers, agentConfigs });
        sendWs({ type: "dispatch", instruction: task.instruction });
      });
    }, 60000); // 每60秒检查一次

    return () => clearInterval(checkInterval);
  }, []);

  const { leftOpen, rightOpen, activeTab, toggleLeft, toggleRight, setTab, theme, setTheme } = useStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* 顶栏 */}
      <CostBar />

      {/* 三栏主体 */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* 左侧栏：Agent 状态 */}
        {leftOpen && (
          <div
            className="animate-slide-left"
            style={{
              width: "var(--sidebar-w)",
              flexShrink: 0,
              borderRight: "1px solid var(--border)",
              background: "var(--bg-sidebar)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
              团队状态
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              <AgentGrid />
            </div>

            {/* 主题切换 */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
              {(["dark", "coral", "jade"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 10,
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: theme === t ? "var(--accent-dim)" : "transparent",
                    color: theme === t ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {t === "dark" ? "深海" : t === "coral" ? "珊瑚" : "翡翠"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 中间主区域 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Tab 栏 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "0 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}>
            {/* 左侧折叠按钮 */}
            <button
              onClick={toggleLeft}
              style={{ padding: "8px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}
              title={leftOpen ? "收起左栏" : "展开左栏"}
            >
              {leftOpen ? "◀" : "▶"}
            </button>

            {(["dashboard", "tasks", "meeting", "settings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                style={{
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                  color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: activeTab === tab ? 600 : 400,
                  transition: "all 0.15s",
                }}
              >
                {tab === "dashboard" ? "📊 看板" : tab === "tasks" ? "📋 任务" : tab === "meeting" ? "🦐 会议" : "⚙️ 设置"}
              </button>
            ))}

            <button
              onClick={toggleRight}
              style={{ marginLeft: "auto", padding: "8px 8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}
              title={rightOpen ? "收起右栏" : "展开右栏"}
            >
              {rightOpen ? "▶" : "◀"}
            </button>
          </div>

          {/* 内容区 */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            <div style={{ display: activeTab === "dashboard" ? "block" : "none" }}>
              <DashboardTab />
            </div>
            <div style={{ display: activeTab === "tasks" ? "block" : "none" }}>
              <TasksTab />
            </div>
            <div style={{ display: activeTab === "meeting" ? "block" : "none" }}>
              <MeetingTab />
            </div>
            <div style={{ display: activeTab === "settings" ? "flex" : "none", height: "100%", margin: -16 }}>
              <SettingsPanel />
            </div>
          </div>

          {/* 指令输入框（设置页隐藏） */}
          {activeTab !== "settings" && <CommandInput />}
        </div>

        {/* 右侧栏：活动记录 */}
        {rightOpen && (
          <div
            className="animate-slide-right"
            style={{
              width: "var(--right-w)",
              flexShrink: 0,
              borderLeft: "1px solid var(--border)",
              background: "var(--bg-sidebar)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
              活动记录
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                padding: 10,
              }}
            >
              <ActivityPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TasksTab() {
  const handleSelectPresetTask = (instruction: string) => {
    // 直接执行预设任务
    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    sendWs({ type: "dispatch", instruction });
  };

  const handleExecuteScheduledTask = (instruction: string) => {
    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    sendWs({ type: "dispatch", instruction });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 预设任务 */}
      <PresetTasksPanel onSelectTask={handleSelectPresetTask} />

      {/* 定时任务 */}
      <ScheduledTasksPanel onExecuteTask={handleExecuteScheduledTask} />

      {/* 任务历史：侧栏会话 + 对话区（与右侧活动记录同 max-height，独立滚动） */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span>📜</span>
          <span>对话历史</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 0,
            alignItems: "stretch",
            minHeight: 280,
            height: CHAT_VIEWPORT_MAX,
            maxHeight: CHAT_VIEWPORT_MAX,
          }}
        >
          <ChatSessionsPanel />
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, paddingLeft: 12, display: "flex", flexDirection: "column" }}>
            <TaskPipeline fillHeight />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  const tasks = useStore(s => s.tasks);
  const cost = useStore(s => s.cost);
  const agents = useStore(s => s.agents);

  const running = Object.values(agents).filter(a => a.status === "running").length;
  const doneTasks = tasks.filter(t => t.status === "done").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 统计卡片 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "运行中 Agent", value: running, color: "var(--warning)" },
          { label: "完成任务", value: doneTasks, color: "var(--success)" },
          { label: "总 Tokens", value: cost.totalTokens.toLocaleString(), color: "var(--accent)" },
          { label: "预估成本", value: `$${cost.totalCostUsd.toFixed(4)}`, color: "#a78bfa" },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 最近任务 */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>最近任务</div>
        <TaskPipeline />
      </div>
    </div>
  );
}

function MeetingTab() {
  const [topic, setTopic] = useState("");
  const { wsStatus, meetingSpeeches, meetingActive, clearMeeting, setMeetingActive } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新发言自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [meetingSpeeches]);

  const startMeeting = () => {
    if (!topic.trim() || meetingActive || wsStatus !== "connected") return;
    clearMeeting();
    setMeetingActive(true);
    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    sendWs({ type: "meeting", topic });
  };

  const AGENT_INFO: Record<string, { name: string; emoji: string; color: string }> = {
    orchestrator: { name: "虾总管",   emoji: "🦞", color: "var(--accent)" },
    explorer:     { name: "探海龙虾", emoji: "🔍", color: "#38bdf8" },
    writer:       { name: "执笔龙虾", emoji: "✍️",  color: "#a3e635" },
    designer:     { name: "幻影龙虾", emoji: "🎨", color: "#f472b6" },
    performer:    { name: "戏精龙虾", emoji: "🎬", color: "#fb923c" },
    greeter:      { name: "迎客龙虾", emoji: "💬", color: "#34d399" },
  };

  const ROLE_LABEL: Record<string, string> = {
    open:     "📢 开场",
    speak:    "💡 观点",
    rebuttal: "⚡ 辩论",
    summary:  "🎯 最终方案",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 顶部输入区 */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
          🦐 发起议题 → 虾总管主持 → 各龙虾发言辩论 → 拍板最终方案
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="会议议题，例：双十一大促如何分工？产品定价策略？"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === "Enter" && startMeeting()}
            disabled={meetingActive}
            style={{ fontSize: 13 }}
          />
          <button
            className="btn-primary"
            onClick={startMeeting}
            disabled={meetingActive || !topic.trim() || wsStatus !== "connected"}
            style={{ flexShrink: 0, minWidth: 72 }}
          >
            {meetingActive
              ? <><span className="spinner" style={{ width: 10, height: 10, marginRight: 4 }} />进行中</>
              : "开会"}
          </button>
          {meetingSpeeches.length > 0 && !meetingActive && (
            <button className="btn-ghost" onClick={() => { clearMeeting(); setTopic(""); }} style={{ flexShrink: 0, fontSize: 11 }}>
              清空
            </button>
          )}
        </div>
      </div>

      {/* 会议气泡流 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {meetingSpeeches.length === 0 && !meetingActive && (
          <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "48px 0" }}>
            发起会议后，龙虾们的发言将实时显示在这里
          </div>
        )}

        {meetingSpeeches.map(speech => {
          const info = AGENT_INFO[speech.agentId] ?? { name: speech.agentId, emoji: "🦐", color: "var(--accent)" };
          const isSummary = speech.role === "summary";

          return (
            <div key={speech.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {/* 头像 */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: `color-mix(in srgb, ${info.color} 18%, var(--bg-card))`,
                border: `2px solid ${isSummary ? info.color : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, boxShadow: isSummary ? `0 0 8px color-mix(in srgb, ${info.color} 40%, transparent)` : "none",
              }}>
                {info.emoji}
              </div>

              {/* 气泡 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{info.name}</span>
                  <span style={{
                    fontSize: 10, padding: "1px 7px", borderRadius: 10,
                    background: `color-mix(in srgb, ${info.color} 15%, transparent)`,
                    color: info.color,
                    border: `1px solid color-mix(in srgb, ${info.color} 30%, transparent)`,
                  }}>
                    {ROLE_LABEL[speech.role] ?? speech.role}
                  </span>
                </div>
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap",
                  background: isSummary
                    ? `color-mix(in srgb, ${info.color} 10%, var(--bg-card))`
                    : "var(--bg-card)",
                  border: `1px solid ${isSummary
                    ? `color-mix(in srgb, ${info.color} 50%, transparent)`
                    : "var(--border)"}`,
                }}>
                  {speech.text}
                </div>
              </div>
            </div>
          );
        })}

        {meetingActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 46, color: "var(--text-muted)", fontSize: 12 }}>
            <span className="spinner" style={{ width: 10, height: 10 }} />
            讨论进行中...
          </div>
        )}
      </div>
    </div>
  );
}

