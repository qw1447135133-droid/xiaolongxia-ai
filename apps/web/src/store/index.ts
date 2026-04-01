import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentConfig,
  AgentId,
  AgentState,
  AgentStatus,
  Activity,
  CostSummary,
  ModelProvider,
  PlatformConfig,
  Task,
} from "./types";
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

interface AgentSlice {
  agents: Record<AgentId, AgentState>;
  setAgentStatus: (id: AgentId, status: AgentStatus, currentTask?: string) => void;
  addTokens: (id: AgentId, tokens: number) => void;
}

interface TaskSlice {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  clearTasks: () => void;
}

interface ChatSlice {
  chatSessions: ChatSession[];
  activeSessionId: string;
  createChatSession: () => void;
  setActiveChatSession: (id: string) => void;
  deleteChatSession: (id: string) => void;
}

interface ActivitySlice {
  activities: Activity[];
  addActivity: (activity: Activity) => void;
}

interface TaskNavigationSlice {
  pendingScrollTaskId: string | null;
  highlightTaskId: string | null;
  navigateToTask: (taskId: string) => void;
  finishPendingScroll: () => void;
  clearHighlightTask: () => void;
}

interface CostSlice {
  cost: CostSummary;
  addCost: (agentId: AgentId, tokens: number) => void;
}

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

interface ConnectionSlice {
  wsStatus: "connecting" | "connected" | "disconnected";
  setWsStatus: (s: ConnectionSlice["wsStatus"]) => void;
}

interface DispatchSlice {
  isDispatching: boolean;
  lastInstruction: string;
  setDispatching: (v: boolean) => void;
  setLastInstruction: (v: string) => void;
}

type Store =
  & AgentSlice
  & TaskSlice
  & ChatSlice
  & ActivitySlice
  & TaskNavigationSlice
  & CostSlice
  & SettingsSlice
  & UISlice
  & ConnectionSlice
  & DispatchSlice
  & MeetingSlice;

function initAgents(): Record<AgentId, AgentState> {
  const result = {} as Record<AgentId, AgentState>;
  for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
    result[id] = {
      id,
      name: meta.name,
      emoji: meta.emoji,
      status: "idle",
      tokenUsage: 0,
      lastUpdated: Date.now(),
    };
  }
  return result;
}

function initAgentConfigs(): Record<AgentId, AgentConfig> {
  const result = {} as Record<AgentId, AgentConfig>;
  for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
    result[id] = {
      id,
      name: meta.name,
      emoji: meta.emoji,
      personality: meta.defaultPersonality,
      model: "",
      providerId: "",
      skills: [],
    };
  }
  return result;
}

function normalizeAgentConfigs(
  currentConfigs: Record<AgentId, AgentConfig>,
  persistedConfigs?: Partial<Record<AgentId, Partial<AgentConfig>>>
): Record<AgentId, AgentConfig> {
  return Object.fromEntries(
    (Object.keys(AGENT_META) as AgentId[]).map(id => {
      const fallback = currentConfigs[id];
      const persisted = persistedConfigs?.[id];
      return [
        id,
        {
          ...fallback,
          ...persisted,
          skills: Array.isArray(persisted?.skills) ? persisted.skills : fallback.skills,
        },
      ];
    })
  ) as Record<AgentId, AgentConfig>;
}

function syncAgentsWithConfigs(
  currentAgents: Record<AgentId, AgentState>,
  configs: Record<AgentId, AgentConfig>,
  persistedAgents?: Partial<Record<AgentId, Partial<AgentState>>>
): Record<AgentId, AgentState> {
  return Object.fromEntries(
    (Object.keys(AGENT_META) as AgentId[]).map(id => [
      id,
      {
        ...currentAgents[id],
        ...persistedAgents?.[id],
        name: configs[id].name || currentAgents[id].name,
        emoji: configs[id].emoji || currentAgents[id].emoji,
      },
    ])
  ) as Record<AgentId, AgentState>;
}

const seedSession = makeEmptySession();

export const useStore = create<Store>()(
  persist(
    (set) => ({
      agents: initAgents(),
      setAgentStatus: (id, status, currentTask) =>
        set(s => ({
          agents: {
            ...s.agents,
            [id]: { ...s.agents[id], status, currentTask, lastUpdated: Date.now() },
          },
        })),
      addTokens: (id, tokens) =>
        set(s => ({
          agents: {
            ...s.agents,
            [id]: { ...s.agents[id], tokenUsage: s.agents[id].tokenUsage + tokens },
          },
        })),

      tasks: seedSession.tasks,
      addTask: (task) =>
        set(s => {
          const sid = s.activeSessionId;
          const nextTasks = capTaskList([task, ...s.tasks]);
          const sessions = s.chatSessions
            .map(sess => {
              if (sess.id !== sid) return sess;
              let title = sess.title;
              if (title === DEFAULT_CHAT_TITLE && task.isUserMessage && task.description.trim()) {
                const desc = task.description.trim();
                title = desc.length > 28 ? `${desc.slice(0, 28)}...` : desc;
              }
              return { ...sess, tasks: nextTasks, updatedAt: Date.now(), title };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt);
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
          const session = s.chatSessions.find(x => x.id === id);
          if (!session) return {};
          return { activeSessionId: id, tasks: session.tasks };
        }),
      deleteChatSession: (id) =>
        set(s => {
          const sessions = s.chatSessions.filter(sess => sess.id !== id);
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

      pendingScrollTaskId: null,
      highlightTaskId: null,
      navigateToTask: (taskId) =>
        set(s => {
          const session = s.chatSessions.find(se => se.tasks.some(t => t.id === taskId));
          if (!session) return {};
          const needSwitch = session.id !== s.activeSessionId;
          return {
            ...(needSwitch ? { activeSessionId: session.id, tasks: session.tasks } : {}),
            pendingScrollTaskId: taskId,
            highlightTaskId: taskId,
            activeTab: "tasks",
          };
        }),
      finishPendingScroll: () => set({ pendingScrollTaskId: null }),
      clearHighlightTask: () => set({ highlightTaskId: null }),

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
          agentConfigs: {
            ...s.agentConfigs,
            [id]: {
              ...s.agentConfigs[id],
              ...updates,
              skills: Array.isArray(updates.skills) ? updates.skills : s.agentConfigs[id].skills,
            },
          },
          agents: updates.name || updates.emoji
            ? {
                ...s.agents,
                [id]: {
                  ...s.agents[id],
                  ...(updates.name ? { name: updates.name } : {}),
                  ...(updates.emoji ? { emoji: updates.emoji } : {}),
                },
              }
            : s.agents,
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

      wsStatus: "disconnected",
      setWsStatus: (wsStatus) => set({ wsStatus }),

      isDispatching: false,
      lastInstruction: "",
      setDispatching: (isDispatching) => set({ isDispatching }),
      setLastInstruction: (lastInstruction) => set({ lastInstruction }),

      meetingSpeeches: [],
      meetingActive: false,
      meetingTopic: "",
      latestMeetingRecord: null,
      addMeetingSpeech: (speech) => set(st => ({ meetingSpeeches: [...st.meetingSpeeches, speech] })),
      clearMeeting: () => set({ meetingSpeeches: [], meetingActive: false }),
      setMeetingActive: (meetingActive) => set({ meetingActive }),
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
        const persistedStore = (persisted ?? {}) as Partial<Store>;
        const merged = { ...current, ...persistedStore } as Store;
        const agentConfigs = normalizeAgentConfigs(current.agentConfigs, persistedStore.agentConfigs);
        const agents = syncAgentsWithConfigs(current.agents, agentConfigs, persistedStore.agents);

        return ensureChatHydration({
          ...merged,
          agentConfigs,
          agents,
        }) as Store;
      },
    }
  )
);
