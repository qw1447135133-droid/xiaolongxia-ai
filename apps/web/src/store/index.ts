import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentId, AgentState, AgentStatus, Task, Activity, CostSummary, AgentConfig, ModelProvider, PlatformConfig } from "./types";
import { AGENT_META, PLATFORM_DEFINITIONS } from "./types";
import {
  type ChatSession,
  DEFAULT_CHAT_TITLE,
  ensureChatHydration,
  capTaskList,
  capSessions,
  makeEmptySession,
  newSessionId,
} from "@/lib/chat-sessions";

// ── Agent slice ──
interface AgentSlice {
  agents: Record<AgentId, AgentState>;
  setAgentStatus: (id: AgentId, status: AgentStatus, currentTask?: string) => void;
  addTokens: (id: AgentId, tokens: number) => void;
}

// ── Task slice ──
interface TaskSlice {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  clearTasks: () => void;
}

// ── Chat sessions ──
interface ChatSlice {
  chatSessions: ChatSession[];
  activeSessionId: string;
  createChatSession: () => void;
  setActiveChatSession: (id: string) => void;
  deleteChatSession: (id: string) => void;
}

// ── Activity slice ──
interface ActivitySlice {
  activities: Activity[];
  addActivity: (activity: Activity) => void;
}

// ── 活动 → 对话跳转 ──
interface TaskNavigationSlice {
  pendingScrollTaskId: string | null;
  highlightTaskId: string | null;
  navigateToTask: (taskId: string) => void;
  finishPendingScroll: () => void;
  clearHighlightTask: () => void;
}

// ── Cost slice ──
interface CostSlice {
  cost: CostSummary;
  addCost: (agentId: AgentId, tokens: number) => void;
}

// ── Meeting slice ──
export interface MeetingSpeech {
  id: string;
  agentId: string;
  role: "open" | "speak" | "rebuttal" | "summary";
  text: string;
  timestamp: number;
}

export interface MeetingRecord {
  topic: string;
  summary: string;
  speeches: MeetingSpeech[];
  finishedAt: number;
}

interface MeetingSlice {
  meetingSpeeches: MeetingSpeech[];
  meetingActive: boolean;
  meetingTopic: string;
  latestMeetingRecord: MeetingRecord | null;
  addMeetingSpeech: (s: MeetingSpeech) => void;
  clearMeeting: () => void;
  setMeetingActive: (v: boolean) => void;
  setMeetingTopic: (topic: string) => void;
  finalizeMeeting: (payload: { topic: string; summary: string; finishedAt?: number }) => void;
}

// ── Settings slice（持久化到 localStorage）──
interface SettingsSlice {
  providers: ModelProvider[];
  agentConfigs: Record<AgentId, AgentConfig>;
  platformConfigs: Record<string, PlatformConfig>;
  addProvider: (p: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  updateAgentConfig: (id: AgentId, updates: Partial<AgentConfig>) => void;
  updatePlatformConfig: (id: string, updates: Partial<PlatformConfig>) => void;
  updatePlatformField: (platformId: string, fieldKey: string, value: string) => void;
}

// ── UI slice ──
interface UISlice {
  theme: "dark" | "coral" | "jade";
  leftOpen: boolean;
  rightOpen: boolean;
  activeTab: "dashboard" | "tasks" | "meeting" | "settings";
  setTheme: (t: UISlice["theme"]) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setTab: (t: UISlice["activeTab"]) => void;
}

// ── Connection slice ──
interface ConnectionSlice {
  wsStatus: "connecting" | "connected" | "disconnected";
  setWsStatus: (s: ConnectionSlice["wsStatus"]) => void;
}

// ── Dispatch slice ──
interface DispatchSlice {
  isDispatching: boolean;
  lastInstruction: string;
  setDispatching: (v: boolean) => void;
  setLastInstruction: (v: string) => void;
}

type Store = AgentSlice & TaskSlice & ChatSlice & ActivitySlice & TaskNavigationSlice & CostSlice & SettingsSlice & UISlice & ConnectionSlice & DispatchSlice & MeetingSlice;

function initAgents(): Record<AgentId, AgentState> {
  const result = {} as Record<AgentId, AgentState>;
  for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
    result[id] = { id, name: meta.name, emoji: meta.emoji, status: "idle", tokenUsage: 0, lastUpdated: Date.now() };
  }
  return result;
}

function initAgentConfigs(): Record<AgentId, AgentConfig> {
  const result = {} as Record<AgentId, AgentConfig>;
  for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
    result[id] = {
      id: id as AgentId,
      name: meta.name,
      emoji: meta.emoji,
      personality: meta.defaultPersonality,
      model: "",        // 空 = 使用供应商默认
      providerId: "",   // 空 = 使用全局默认
    };
  }
  return result;
}

const seedSession = makeEmptySession();

export const useStore = create<Store>()(
  persist(
    (set) => ({
      // Agent slice
      agents: initAgents(),
      setAgentStatus: (id, status, currentTask) =>
        set(s => ({ agents: { ...s.agents, [id]: { ...s.agents[id], status, currentTask, lastUpdated: Date.now() } } })),
      addTokens: (id, tokens) =>
        set(s => ({ agents: { ...s.agents, [id]: { ...s.agents[id], tokenUsage: s.agents[id].tokenUsage + tokens } } })),

      // Task slice（与当前 activeSession.tasks 同步）
      tasks: seedSession.tasks,
      addTask: (task) =>
        set(s => {
          const sid = s.activeSessionId;
          const nextTasks = capTaskList([task, ...s.tasks]);
          const sessions = s.chatSessions.map(sess => {
            if (sess.id !== sid) return sess;
            let title = sess.title;
            if (title === DEFAULT_CHAT_TITLE && task.isUserMessage && task.description.trim()) {
              const d = task.description.trim();
              title = d.length > 28 ? `${d.slice(0, 28)}…` : d;
            }
            return { ...sess, tasks: nextTasks, updatedAt: Date.now(), title };
          }).sort((a, b) => b.updatedAt - a.updatedAt);
          return { tasks: nextTasks, chatSessions: sessions };
        }),
      updateTask: (id, updates) =>
        set(s => {
          const nextTasks = s.tasks.map(t => (t.id === id ? { ...t, ...updates } : t));
          const sid = s.activeSessionId;
          const sessions = s.chatSessions
            .map(sess => (sess.id === sid ? { ...sess, tasks: nextTasks, updatedAt: Date.now() } : sess))
            .sort((a, b) => b.updatedAt - a.updatedAt);
          return { tasks: nextTasks, chatSessions: sessions };
        }),
      clearTasks: () =>
        set(s => ({
          tasks: [],
          chatSessions: s.chatSessions.map(sess =>
            sess.id === s.activeSessionId
              ? { ...sess, tasks: [], updatedAt: Date.now(), title: DEFAULT_CHAT_TITLE }
              : sess
          ),
        })),

      // Chat slice
      chatSessions: [seedSession],
      activeSessionId: seedSession.id,
      createChatSession: () =>
        set(s => {
          const newSess: ChatSession = {
            id: newSessionId(),
            title: DEFAULT_CHAT_TITLE,
            updatedAt: Date.now(),
            tasks: [],
          };
          const sessions = capSessions([newSess, ...s.chatSessions]);
          return { chatSessions: sessions, activeSessionId: newSess.id, tasks: [] };
        }),
      setActiveChatSession: (id) =>
        set(s => {
          const sess = s.chatSessions.find(x => x.id === id);
          if (!sess) return {};
          return { activeSessionId: id, tasks: sess.tasks };
        }),
      deleteChatSession: (id) =>
        set(s => {
          let sessions = s.chatSessions.filter(sess => sess.id !== id);
          if (sessions.length === 0) {
            const empty = makeEmptySession();
            return { chatSessions: [empty], activeSessionId: empty.id, tasks: [] };
          }
          const nextActive =
            id === s.activeSessionId
              ? [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
              : s.activeSessionId;
          const active = sessions.find(x => x.id === nextActive)!;
          return { chatSessions: sessions, activeSessionId: nextActive, tasks: active.tasks };
        }),

      // Activity slice
      activities: [],
      addActivity: (activity) =>
        set(s => ({
          activities: [
            {
              ...activity,
              sessionId: activity.sessionId ?? s.activeSessionId,
            },
            ...s.activities,
          ].slice(0, 500),
        })),

      // 对话跳转（活动记录 → 气泡）
      pendingScrollTaskId: null,
      highlightTaskId: null,
      navigateToTask: (taskId) =>
        set(s => {
          const sess = s.chatSessions.find(se => se.tasks.some(t => t.id === taskId));
          if (!sess) return {};
          const needSwitch = sess.id !== s.activeSessionId;
          return {
            ...(needSwitch ? { activeSessionId: sess.id, tasks: sess.tasks } : {}),
            pendingScrollTaskId: taskId,
            highlightTaskId: taskId,
            activeTab: "tasks",
          };
        }),
      finishPendingScroll: () => set({ pendingScrollTaskId: null }),
      clearHighlightTask: () => set({ highlightTaskId: null }),

      // Cost slice
      cost: { totalTokens: 0, totalCostUsd: 0, byAgent: {} as Record<AgentId, number> },
      addCost: (agentId, tokens) =>
        set(s => {
          const costPerToken = 0.5 / 1_000_000;
          return {
            cost: {
              totalTokens: s.cost.totalTokens + tokens,
              totalCostUsd: s.cost.totalCostUsd + tokens * costPerToken,
              byAgent: { ...s.cost.byAgent, [agentId]: (s.cost.byAgent[agentId] ?? 0) + tokens },
            },
          };
        }),

      // Settings slice
      providers: [],
      agentConfigs: initAgentConfigs(),
      platformConfigs: Object.fromEntries(
        PLATFORM_DEFINITIONS.map(p => [p.id, { enabled: false, fields: {}, status: "idle" as const }])
      ),
      addProvider: (p) => set(s => ({ providers: [...s.providers, p] })),
      updateProvider: (id, updates) =>
        set(s => ({ providers: s.providers.map(p => (p.id === id ? { ...p, ...updates } : p)) })),
      removeProvider: (id) =>
        set(s => ({ providers: s.providers.filter(p => p.id !== id) })),
      updateAgentConfig: (id, updates) =>
        set(s => ({
          agentConfigs: { ...s.agentConfigs, [id]: { ...s.agentConfigs[id], ...updates } },
          // 同步更新 agents 显示名/emoji
          agents: updates.name || updates.emoji ? {
            ...s.agents,
            [id]: {
              ...s.agents[id],
              ...(updates.name ? { name: updates.name } : {}),
              ...(updates.emoji ? { emoji: updates.emoji } : {}),
            },
          } : s.agents,
        })),
      updatePlatformConfig: (id, updates) =>
        set(s => ({
          platformConfigs: {
            ...s.platformConfigs,
            [id]: { ...s.platformConfigs[id], ...updates },
          },
        })),
      updatePlatformField: (platformId, fieldKey, value) =>
        set(s => ({
          platformConfigs: {
            ...s.platformConfigs,
            [platformId]: {
              ...s.platformConfigs[platformId],
              fields: { ...s.platformConfigs[platformId]?.fields, [fieldKey]: value },
            },
          },
        })),

      // UI slice
      theme: "dark",
      leftOpen: true,
      rightOpen: true,
      activeTab: "dashboard",
      setTheme: (theme) => {
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", theme === "dark" ? "" : theme);
        }
        set({ theme });
      },
      toggleLeft: () => set(s => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set(s => ({ rightOpen: !s.rightOpen })),
      setTab: (activeTab) => set({ activeTab }),

      // Connection slice
      wsStatus: "disconnected",
      setWsStatus: (wsStatus) => set({ wsStatus }),

      // Dispatch slice
      isDispatching: false,
      lastInstruction: "",
      setDispatching: (isDispatching) => set({ isDispatching }),
      setLastInstruction: (lastInstruction) => set({ lastInstruction }),

      // Meeting slice
      meetingSpeeches: [],
      meetingActive: false,
      meetingTopic: "",
      latestMeetingRecord: null,
      addMeetingSpeech: (s) => set(st => ({ meetingSpeeches: [...st.meetingSpeeches, s] })),
      clearMeeting: () => set({ meetingSpeeches: [], meetingActive: false }),
      setMeetingActive: (v) => set({ meetingActive: v }),
      setMeetingTopic: (meetingTopic) => set({ meetingTopic }),
      finalizeMeeting: ({ topic, summary, finishedAt }) =>
        set(st => ({
          meetingActive: false,
          latestMeetingRecord: {
            topic,
            summary,
            speeches: st.meetingSpeeches,
            finishedAt: finishedAt ?? Date.now(),
          },
        })),
    }),
    {
      name: "xiaolongxia-settings",
      partialize: (s) => ({
        providers: s.providers,
        agentConfigs: s.agentConfigs,
        platformConfigs: s.platformConfigs,
        theme: s.theme,
        chatSessions: s.chatSessions,
        activeSessionId: s.activeSessionId,
        latestMeetingRecord: s.latestMeetingRecord,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        const merged = { ...current, ...p } as Store;
        return ensureChatHydration(merged) as Store;
      },
    }
  )
);
