import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentConfig,
  AgentId,
  AgentState,
  AgentStatus,
  Activity,
  AppTab,
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
import { PLUGIN_PACKS } from "@/lib/plugin-runtime";
import type {
  WorkspaceDeskNote,
  WorkspaceEntry,
  WorkspacePreview,
  WorkspaceReferenceBundle,
} from "@/types/desktop-workspace";
import type { WorkflowRun } from "@/types/workflows";

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
  enabledPluginIds: string[];
  userNickname: string;
  addProvider: (p: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  updateAgentConfig: (id: AgentId, updates: Partial<AgentConfig>) => void;
  updatePlatformConfig: (id: string, updates: Partial<PlatformConfig>) => void;
  updatePlatformField: (platformId: string, fieldKey: string, value: string) => void;
  togglePlugin: (id: string) => void;
  applyPluginPack: (id: string) => void;
  setUserNickname: (nickname: string) => void;
}

interface UISlice {
  theme: "dark" | "coral" | "jade";
  leftOpen: boolean;
  rightOpen: boolean;
  activeTab: AppTab;
  setTheme: (t: UISlice["theme"]) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setTab: (t: AppTab) => void;
}

interface ConnectionSlice {
  wsStatus: "connecting" | "connected" | "disconnected";
  setWsStatus: (s: ConnectionSlice["wsStatus"]) => void;
}

interface DispatchSlice {
  isDispatching: boolean;
  lastInstruction: string;
  commandDraft: string;
  setDispatching: (v: boolean) => void;
  setLastInstruction: (v: string) => void;
  setCommandDraft: (value: string) => void;
  appendCommandDraft: (value: string) => void;
  clearCommandDraft: () => void;
}

interface WorkflowSlice {
  workflowRuns: WorkflowRun[];
  queueWorkflowRun: (payload: Omit<WorkflowRun, "id" | "createdAt" | "updatedAt" | "launchCount" | "status">) => string;
  restageWorkflowRun: (workflowRunId: string) => void;
  startWorkflowRun: (workflowRunId: string) => void;
  completeWorkflowRun: (workflowRunId: string) => void;
  archiveWorkflowRun: (workflowRunId: string) => void;
  removeWorkflowRun: (workflowRunId: string) => void;
}

interface WorkspaceSlice {
  workspaceRoot: string | null;
  workspaceCurrentPath: string | null;
  workspaceParentPath: string | null;
  workspaceEntries: WorkspaceEntry[];
  workspaceSelectedPath: string | null;
  workspacePreview: WorkspacePreview | null;
  workspaceLoading: boolean;
  workspacePreviewLoading: boolean;
  workspacePreviewOpen: boolean;
  workspaceError: string | null;
  workspacePreviewTabs: WorkspacePreview[];
  workspaceActivePreviewPath: string | null;
  workspaceRecentPreviews: WorkspacePreview[];
  workspacePinnedPreviews: WorkspacePreview[];
  workspaceSavedBundles: WorkspaceReferenceBundle[];
  workspaceDeskNotes: WorkspaceDeskNote[];
  workspaceScratchpad: string;
  setWorkspaceRoot: (path: string | null) => void;
  setWorkspaceCurrentPath: (path: string | null) => void;
  setWorkspaceParentPath: (path: string | null) => void;
  setWorkspaceEntries: (entries: WorkspaceEntry[]) => void;
  setWorkspaceSelectedPath: (path: string | null) => void;
  setWorkspacePreview: (preview: WorkspacePreview | null) => void;
  setWorkspaceLoading: (value: boolean) => void;
  setWorkspacePreviewLoading: (value: boolean) => void;
  setWorkspacePreviewOpen: (value: boolean) => void;
  setWorkspaceError: (message: string | null) => void;
  openWorkspacePreviewTab: (preview: WorkspacePreview) => void;
  setWorkspaceActivePreviewPath: (path: string | null) => void;
  closeWorkspacePreviewTab: (path: string) => void;
  pinWorkspacePreview: (preview: WorkspacePreview) => void;
  unpinWorkspacePreview: (path: string) => void;
  saveWorkspaceBundle: (name: string) => void;
  applyWorkspaceBundle: (id: string) => void;
  deleteWorkspaceBundle: (id: string) => void;
  createWorkspaceDeskNote: (payload: {
    title: string;
    content: string;
    tone: WorkspaceDeskNote["tone"];
    linkedPreview: WorkspacePreview | null;
  }) => void;
  toggleWorkspaceDeskNotePin: (id: string) => void;
  deleteWorkspaceDeskNote: (id: string) => void;
  setWorkspaceScratchpad: (value: string) => void;
  resetWorkspace: () => void;
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
  & WorkflowSlice
  & MeetingSlice
  & WorkspaceSlice
  & WorkflowSlice;

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
      enabledPluginIds: [],
      userNickname: "您",
      setUserNickname: (nickname) => set({ userNickname: nickname }),
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
      togglePlugin: (id) =>
        set(s => ({
          enabledPluginIds: s.enabledPluginIds.includes(id)
            ? s.enabledPluginIds.filter(pluginId => pluginId !== id)
            : [...s.enabledPluginIds, id],
        })),
      applyPluginPack: (id) =>
        set(s => {
          const pack = PLUGIN_PACKS.find(item => item.id === id);
          if (!pack) return {};
          return {
            enabledPluginIds: Array.from(new Set([...s.enabledPluginIds, ...pack.pluginIds])),
          };
        }),

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
      commandDraft: "",
      setDispatching: (isDispatching) => set({ isDispatching }),
      setLastInstruction: (lastInstruction) => set({ lastInstruction }),
      setCommandDraft: (commandDraft) => set({ commandDraft }),
      appendCommandDraft: (value) =>
        set(s => ({
          commandDraft: s.commandDraft.trim()
            ? `${s.commandDraft.trim()}\n\n${value}`
            : value,
        })),
      clearCommandDraft: () => set({ commandDraft: "" }),

      workflowRuns: [],
      queueWorkflowRun: (payload) => {
        const timestamp = Date.now();
        const workflowRunId = `workflow-${timestamp}-${Math.random().toString(36).slice(2, 6)}`;
        const nextRun: WorkflowRun = {
          ...payload,
          id: workflowRunId,
          createdAt: timestamp,
          updatedAt: timestamp,
          launchCount: 0,
          status: "queued",
        };

        set(s => ({
          workflowRuns: [nextRun, ...s.workflowRuns].slice(0, 24),
        }));

        return workflowRunId;
      },
      restageWorkflowRun: (workflowRunId) =>
        set(s => ({
          workflowRuns: s.workflowRuns.map(run =>
            run.id === workflowRunId
              ? {
                  ...run,
                  status: "staged",
                  completedAt: undefined,
                  updatedAt: Date.now(),
                }
              : run,
          ),
        })),
      startWorkflowRun: (workflowRunId) =>
        set(s => ({
          workflowRuns: s.workflowRuns.map(run =>
            run.id === workflowRunId
              ? {
                  ...run,
                  status: "in-progress",
                  lastLaunchedAt: Date.now(),
                  updatedAt: Date.now(),
                  launchCount: run.launchCount + 1,
                }
              : run,
          ),
        })),
      completeWorkflowRun: (workflowRunId) =>
        set(s => ({
          workflowRuns: s.workflowRuns.map(run =>
            run.id === workflowRunId
              ? {
                  ...run,
                  status: "completed",
                  completedAt: Date.now(),
                  updatedAt: Date.now(),
                }
              : run,
          ),
        })),
      archiveWorkflowRun: (workflowRunId) =>
        set(s => ({
          workflowRuns: s.workflowRuns.map(run =>
            run.id === workflowRunId
              ? {
                  ...run,
                  status: "archived",
                  updatedAt: Date.now(),
                }
              : run,
          ),
        })),
      removeWorkflowRun: (workflowRunId) =>
        set(s => ({
          workflowRuns: s.workflowRuns.filter(run => run.id !== workflowRunId),
        })),

      workspaceRoot: null,
      workspaceCurrentPath: null,
      workspaceParentPath: null,
      workspaceEntries: [],
      workspaceSelectedPath: null,
      workspacePreview: null,
      workspaceLoading: false,
      workspacePreviewLoading: false,
      workspacePreviewOpen: false,
      workspaceError: null,
      workspacePreviewTabs: [],
      workspaceActivePreviewPath: null,
      workspaceRecentPreviews: [],
      workspacePinnedPreviews: [],
      workspaceSavedBundles: [],
      workspaceDeskNotes: [],
      workspaceScratchpad: "",
      setWorkspaceRoot: (workspaceRoot) => set({ workspaceRoot }),
      setWorkspaceCurrentPath: (workspaceCurrentPath) => set({ workspaceCurrentPath }),
      setWorkspaceParentPath: (workspaceParentPath) => set({ workspaceParentPath }),
      setWorkspaceEntries: (workspaceEntries) => set({ workspaceEntries }),
      setWorkspaceSelectedPath: (workspaceSelectedPath) => set({ workspaceSelectedPath }),
      setWorkspacePreview: (workspacePreview) => set({ workspacePreview }),
      setWorkspaceLoading: (workspaceLoading) => set({ workspaceLoading }),
      setWorkspacePreviewLoading: (workspacePreviewLoading) => set({ workspacePreviewLoading }),
      setWorkspacePreviewOpen: (workspacePreviewOpen) => set({ workspacePreviewOpen }),
      setWorkspaceError: (workspaceError) => set({ workspaceError }),
      setWorkspaceScratchpad: (workspaceScratchpad) => set({ workspaceScratchpad }),
      pinWorkspacePreview: (preview) =>
        set(s => ({
          workspacePinnedPreviews: [
            preview,
            ...s.workspacePinnedPreviews.filter(item => item.path !== preview.path),
          ].slice(0, 6),
        })),
      unpinWorkspacePreview: (targetPath) =>
        set(s => ({
          workspacePinnedPreviews: s.workspacePinnedPreviews.filter(item => item.path !== targetPath),
        })),
      saveWorkspaceBundle: (name) =>
        set(s => {
          const trimmedName = name.trim() || `Context Pack ${s.workspaceSavedBundles.length + 1}`;
          const nextBundle: WorkspaceReferenceBundle = {
            id: `bundle-${Date.now()}`,
            name: trimmedName,
            createdAt: Date.now(),
            rootPath: s.workspaceRoot,
            previews: s.workspacePinnedPreviews.slice(0, 6),
            notes: s.workspaceScratchpad,
          };

          return {
            workspaceSavedBundles: [
              nextBundle,
              ...s.workspaceSavedBundles.filter(bundle => bundle.name !== trimmedName),
            ].slice(0, 12),
          };
        }),
      applyWorkspaceBundle: (id) =>
        set(s => {
          const bundle = s.workspaceSavedBundles.find(item => item.id === id);
          if (!bundle) return {};

          const firstPreview = bundle.previews[0] ?? null;
          return {
            workspacePinnedPreviews: bundle.previews,
            workspaceScratchpad: bundle.notes,
            workspacePreviewTabs: bundle.previews,
            workspaceRecentPreviews: [
              ...bundle.previews,
              ...s.workspaceRecentPreviews.filter(
                preview => !bundle.previews.some(saved => saved.path === preview.path),
              ),
            ].slice(0, 8),
            workspacePreview: firstPreview,
            workspacePreviewOpen: Boolean(firstPreview),
            workspaceActivePreviewPath: firstPreview?.path ?? null,
            workspaceSelectedPath: firstPreview?.path ?? null,
          };
        }),
      deleteWorkspaceBundle: (id) =>
        set(s => ({
          workspaceSavedBundles: s.workspaceSavedBundles.filter(bundle => bundle.id !== id),
        })),
      createWorkspaceDeskNote: ({ title, content, tone, linkedPreview }) =>
        set(s => {
          const now = Date.now();
          const nextNote: WorkspaceDeskNote = {
            id: `desk-note-${now}`,
            title,
            content,
            createdAt: now,
            updatedAt: now,
            pinned: false,
            tone,
            rootPath: s.workspaceRoot,
            linkedPath: linkedPreview?.path ?? null,
            linkedName: linkedPreview?.name ?? null,
            linkedKind: linkedPreview?.kind ?? null,
          };

          return {
            workspaceDeskNotes: [nextNote, ...s.workspaceDeskNotes].slice(0, 18),
          };
        }),
      toggleWorkspaceDeskNotePin: (id) =>
        set(s => ({
          workspaceDeskNotes: s.workspaceDeskNotes.map(note =>
            note.id === id
              ? { ...note, pinned: !note.pinned, updatedAt: Date.now() }
              : note,
          ),
        })),
      deleteWorkspaceDeskNote: (id) =>
        set(s => ({
          workspaceDeskNotes: s.workspaceDeskNotes.filter(note => note.id !== id),
        })),
      openWorkspacePreviewTab: (preview) =>
        set(s => {
          const workspacePreviewTabs = [
            ...s.workspacePreviewTabs.filter(item => item.path !== preview.path),
            preview,
          ];
          const workspaceRecentPreviews = [
            preview,
            ...s.workspaceRecentPreviews.filter(item => item.path !== preview.path),
          ].slice(0, 8);

          return {
            workspacePreview: preview,
            workspacePreviewOpen: true,
            workspaceActivePreviewPath: preview.path,
            workspacePreviewTabs,
            workspaceRecentPreviews,
          };
        }),
      setWorkspaceActivePreviewPath: (workspaceActivePreviewPath) =>
        set(s => ({
          workspaceActivePreviewPath,
          workspacePreview:
            s.workspacePreviewTabs.find(item => item.path === workspaceActivePreviewPath) ?? null,
          workspacePreviewOpen: Boolean(workspaceActivePreviewPath),
          workspaceSelectedPath: workspaceActivePreviewPath,
        })),
      closeWorkspacePreviewTab: (targetPath) =>
        set(s => {
          const closingIndex = s.workspacePreviewTabs.findIndex(item => item.path === targetPath);
          const workspacePreviewTabs = s.workspacePreviewTabs.filter(item => item.path !== targetPath);
          if (s.workspaceActivePreviewPath !== targetPath) {
            return {
              workspacePreviewTabs,
            };
          }

          const fallbackPreview =
            workspacePreviewTabs[Math.max(0, closingIndex - 1)] ??
            workspacePreviewTabs[0] ??
            null;

          return {
            workspacePreviewTabs,
            workspaceActivePreviewPath: fallbackPreview?.path ?? null,
            workspacePreview: fallbackPreview,
            workspacePreviewOpen: Boolean(fallbackPreview),
            workspaceSelectedPath: fallbackPreview?.path ?? null,
          };
        }),
      resetWorkspace: () =>
        set({
          workspaceRoot: null,
          workspaceCurrentPath: null,
          workspaceParentPath: null,
          workspaceEntries: [],
          workspaceSelectedPath: null,
          workspacePreview: null,
          workspaceLoading: false,
          workspacePreviewLoading: false,
          workspacePreviewOpen: false,
          workspaceError: null,
          workspacePreviewTabs: [],
          workspaceActivePreviewPath: null,
          workspaceRecentPreviews: [],
          workspacePinnedPreviews: [],
          workspaceScratchpad: "",
        }),

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
        enabledPluginIds: s.enabledPluginIds,
        platformConfigs: s.platformConfigs,
        userNickname: s.userNickname,
        theme: s.theme,
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        activeTab: s.activeTab,
        chatSessions: s.chatSessions,
        activeSessionId: s.activeSessionId,
        workflowRuns: s.workflowRuns,
        latestMeetingRecord: s.latestMeetingRecord,
        workspacePinnedPreviews: s.workspacePinnedPreviews,
        workspaceSavedBundles: s.workspaceSavedBundles,
        workspaceDeskNotes: s.workspaceDeskNotes,
        workspaceScratchpad: s.workspaceScratchpad,
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
