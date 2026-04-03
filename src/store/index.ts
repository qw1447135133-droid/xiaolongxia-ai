import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentConfig,
  AgentId,
  AgentState,
  AgentStatus,
  Activity,
  AppTab,
  AutomationMode,
  CostSummary,
  ExecutionEvent,
  ExecutionRun,
  ExecutionRunSource,
  ExecutionRunStatus,
  VerificationStatus,
  VerificationStepResult,
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
  sortChatSessions,
} from "@/lib/chat-sessions";
import { buildProjectContext, getProjectScopeKey, matchProjectScope } from "@/lib/project-context";
import { PLUGIN_PACKS } from "@/lib/plugin-runtime";
import type {
  WorkspaceDeskNote,
  WorkspaceEntry,
  WorkspaceProjectMemory,
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
  createChatSession: (projectRoot?: string | null) => void;
  setActiveChatSession: (id: string) => void;
  deleteChatSession: (id: string) => void;
  renameChatSession: (id: string, title: string) => void;
  toggleChatSessionPin: (id: string) => void;
  bindActiveSessionProject: (rootPath: string | null) => void;
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

interface AutomationSlice {
  automationMode: AutomationMode;
  automationPaused: boolean;
  remoteSupervisorEnabled: boolean;
  autoDispatchScheduledTasks: boolean;
  setAutomationMode: (mode: AutomationMode) => void;
  setAutomationPaused: (value: boolean) => void;
  setRemoteSupervisorEnabled: (value: boolean) => void;
  setAutoDispatchScheduledTasks: (value: boolean) => void;
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

interface ExecutionSlice {
  executionRuns: ExecutionRun[];
  activeExecutionRunId: string | null;
  createExecutionRun: (payload: {
    id?: string;
    sessionId: string;
    instruction: string;
    source?: ExecutionRunSource;
  }) => string;
  updateExecutionRun: (payload: {
    id: string;
    sessionId?: string;
    instruction?: string;
    status?: ExecutionRunStatus;
    source?: ExecutionRunSource;
    currentAgentId?: AgentId;
    totalTasks?: number;
    completedTasks?: number;
    failedTasks?: number;
    verificationStatus?: VerificationStatus;
    verificationResults?: VerificationStepResult[];
    verificationUpdatedAt?: number;
    timestamp?: number;
    completedAt?: number;
    event?: ExecutionEvent;
  }) => void;
  failExecutionRun: (runId: string, detail: string) => void;
  setActiveExecutionRun: (runId: string | null) => void;
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
  workspaceProjectMemories: WorkspaceProjectMemory[];
  workspaceProjectViews: Record<string, WorkspaceProjectViewState>;
  activeWorkspaceProjectMemoryId: string | null;
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
  saveWorkspaceProjectMemory: (name?: string) => void;
  applyWorkspaceProjectMemory: (id: string) => void;
  deleteWorkspaceProjectMemory: (id: string) => void;
  setActiveWorkspaceProjectMemory: (id: string | null) => void;
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

interface WorkspaceProjectViewState {
  scratchpad: string;
  pinnedPreviews: WorkspacePreview[];
  previewTabs: WorkspacePreview[];
  recentPreviews: WorkspacePreview[];
  activePreviewPath: string | null;
  selectedPath: string | null;
  previewOpen: boolean;
  currentPath: string | null;
  parentPath: string | null;
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
  & AutomationSlice
  & DispatchSlice
  & WorkflowSlice
  & ExecutionSlice
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
const MAX_EXECUTION_RUNS = 24;
const MAX_EXECUTION_EVENTS = 40;
const MAX_WORKSPACE_PROJECT_MEMORIES = 16;

function makeEmptyWorkspaceProjectView(rootPath: string | null = null): WorkspaceProjectViewState {
  return {
    scratchpad: "",
    pinnedPreviews: [],
    previewTabs: [],
    recentPreviews: [],
    activePreviewPath: null,
    selectedPath: null,
    previewOpen: false,
    currentPath: rootPath,
    parentPath: null,
  };
}

function capExecutionEvents(events: ExecutionEvent[]): ExecutionEvent[] {
  return events
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_EXECUTION_EVENTS);
}

function capExecutionRuns(runs: ExecutionRun[]): ExecutionRun[] {
  return [...runs]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_EXECUTION_RUNS);
}

function capWorkspaceProjectMemories(memories: WorkspaceProjectMemory[]): WorkspaceProjectMemory[] {
  return [...memories]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_WORKSPACE_PROJECT_MEMORIES);
}

function resolveActiveProjectScope(state: Pick<Store, "chatSessions" | "activeSessionId" | "workspaceRoot">) {
  const activeSession = state.chatSessions.find(session => session.id === state.activeSessionId) ?? null;
  if (activeSession) {
    return {
      projectId: activeSession.projectId ?? null,
      workspaceRoot: activeSession.workspaceRoot ?? null,
    };
  }
  return {
    projectId: null,
    workspaceRoot: state.workspaceRoot,
  };
}

function resolveProjectViewKey(state: Pick<Store, "chatSessions" | "activeSessionId" | "workspaceRoot">) {
  return getProjectScopeKey(resolveActiveProjectScope(state));
}

function deriveWorkspacePreviewFromView(view: WorkspaceProjectViewState) {
  return view.previewTabs.find(item => item.path === view.activePreviewPath) ?? null;
}

function applyProjectViewState(
  state: Store,
  key: string,
  updater: (current: WorkspaceProjectViewState) => WorkspaceProjectViewState,
) {
  const current = state.workspaceProjectViews[key] ?? makeEmptyWorkspaceProjectView(state.workspaceRoot);
  const next = updater(current);
  return {
    workspaceProjectViews: {
      ...state.workspaceProjectViews,
      [key]: next,
    },
    workspaceScratchpad: next.scratchpad,
    workspacePinnedPreviews: next.pinnedPreviews,
    workspacePreviewTabs: next.previewTabs,
    workspaceRecentPreviews: next.recentPreviews,
    workspaceActivePreviewPath: next.activePreviewPath,
    workspaceSelectedPath: next.selectedPath,
    workspacePreviewOpen: next.previewOpen,
    workspaceCurrentPath: next.currentPath,
    workspaceParentPath: next.parentPath,
    workspacePreview: deriveWorkspacePreviewFromView(next),
  };
}

function selectProjectMemoryNotes(
  rootPath: string | null,
  previews: WorkspacePreview[],
  notes: WorkspaceDeskNote[],
) {
  const pinnedPaths = new Set(previews.map(preview => preview.path));

  return notes
    .filter(note => {
      if (rootPath && note.rootPath === rootPath) return true;
      if (note.linkedPath && pinnedPaths.has(note.linkedPath)) return true;
      return !rootPath && !note.rootPath;
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    })
    .slice(0, 4)
    .map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      tone: note.tone,
      linkedPath: note.linkedPath,
      linkedName: note.linkedName,
      linkedKind: note.linkedKind,
    }));
}

function buildSessionActivationState(
  state: Store,
  session: ChatSession,
  overrides?: Partial<Pick<Store, "chatSessions" | "activeSessionId">>,
) {
  const scope = {
    projectId: session.projectId,
    workspaceRoot: session.workspaceRoot,
  };
  const nextKey = getProjectScopeKey(scope);
  const nextView = state.workspaceProjectViews[nextKey] ?? makeEmptyWorkspaceProjectView(session.workspaceRoot ?? null);
  const workspaceRoot = session.workspaceRoot ?? null;
  const scopedActiveMemory = state.activeWorkspaceProjectMemoryId
    ? state.workspaceProjectMemories.find(memory => memory.id === state.activeWorkspaceProjectMemoryId) ?? null
    : null;

  return {
    ...overrides,
    activeSessionId: session.id,
    tasks: session.tasks,
    workspaceRoot,
    workspaceCurrentPath: nextView.currentPath ?? workspaceRoot,
    workspaceParentPath: nextView.parentPath,
    workspaceEntries: workspaceRoot !== state.workspaceRoot ? [] : state.workspaceEntries,
    workspaceSelectedPath: nextView.selectedPath,
    workspacePreview: deriveWorkspacePreviewFromView(nextView),
    workspacePreviewOpen: nextView.previewOpen,
    workspacePreviewTabs: nextView.previewTabs,
    workspaceRecentPreviews: nextView.recentPreviews,
    workspacePinnedPreviews: nextView.pinnedPreviews,
    workspaceScratchpad: nextView.scratchpad,
    workspaceActivePreviewPath: nextView.activePreviewPath,
    activeWorkspaceProjectMemoryId:
      scopedActiveMemory && matchProjectScope(scopedActiveMemory, session)
        ? scopedActiveMemory.id
        : null,
  };
}

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
          ;
          return { tasks: nextTasks, chatSessions: sortChatSessions(sessions) };
        }),
      updateTask: (id, updates) =>
        set(s => {
          const nextTasks = s.tasks.map(t => (t.id === id ? { ...t, ...updates } : t));
          const sid = s.activeSessionId;
          const sessions = s.chatSessions
            .map(sess => (sess.id === sid ? { ...sess, tasks: nextTasks, updatedAt: Date.now() } : sess));
          return { tasks: nextTasks, chatSessions: sortChatSessions(sessions) };
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
      createChatSession: (projectRoot) =>
        set(s => {
          const fallbackRoot = projectRoot ?? s.workspaceRoot;
          const project = buildProjectContext(fallbackRoot);
          const newSess: ChatSession = {
            ...makeEmptySession(project),
            id: newSessionId(),
          };
          const sessions = capSessions([newSess, ...s.chatSessions]);
          return buildSessionActivationState(s, newSess, {
            chatSessions: sessions,
            activeSessionId: newSess.id,
          });
        }),
      setActiveChatSession: (id) =>
        set(s => {
          const session = s.chatSessions.find(x => x.id === id);
          if (!session) return {};
          return buildSessionActivationState(s, session, {
            activeSessionId: id,
          });
        }),
      deleteChatSession: (id) =>
        set(s => {
          const sessions = s.chatSessions.filter(sess => sess.id !== id);
          if (sessions.length === 0) {
            const empty = makeEmptySession();
            return buildSessionActivationState(s, empty, {
              chatSessions: [empty],
              activeSessionId: empty.id,
            });
          }

          const nextActive =
            id === s.activeSessionId
              ? sortChatSessions(sessions)[0]!.id
              : s.activeSessionId;
          const active = sessions.find(x => x.id === nextActive)!;
          return buildSessionActivationState(s, active, {
            chatSessions: sessions,
            activeSessionId: nextActive,
          });
        }),
      renameChatSession: (id, title) =>
        set(s => ({
          chatSessions: sortChatSessions(
            s.chatSessions.map(session =>
              session.id === id
                ? {
                    ...session,
                    title: title.trim() || DEFAULT_CHAT_TITLE,
                    updatedAt: Date.now(),
                  }
                : session,
            ),
          ),
        })),
      toggleChatSessionPin: (id) =>
        set(s => ({
          chatSessions: sortChatSessions(
            s.chatSessions.map(session =>
              session.id === id
                ? { ...session, pinned: !session.pinned }
                : session,
            ),
          ),
        })),
      bindActiveSessionProject: (rootPath) =>
        set(s => {
          const activeSession = s.chatSessions.find(session => session.id === s.activeSessionId);
          if (!activeSession) return {};
          const project = buildProjectContext(rootPath);
          return {
            chatSessions: s.chatSessions.map(session =>
              session.id === s.activeSessionId
                ? {
                    ...session,
                    projectId: project.projectId,
                    projectName: project.projectName,
                    workspaceRoot: project.workspaceRoot,
                    updatedAt: Date.now(),
                  }
                : session,
            ),
          };
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
            ...(needSwitch ? buildSessionActivationState(s, session, { activeSessionId: session.id }) : {}),
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

      automationMode: "supervised",
      automationPaused: false,
      remoteSupervisorEnabled: true,
      autoDispatchScheduledTasks: true,
      setAutomationMode: (automationMode) =>
        set(s => ({
          automationMode,
          autoDispatchScheduledTasks: automationMode === "manual" ? false : s.autoDispatchScheduledTasks,
        })),
      setAutomationPaused: (automationPaused) => set({ automationPaused }),
      setRemoteSupervisorEnabled: (remoteSupervisorEnabled) => set({ remoteSupervisorEnabled }),
      setAutoDispatchScheduledTasks: (autoDispatchScheduledTasks) => set({ autoDispatchScheduledTasks }),

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

      executionRuns: [],
      activeExecutionRunId: null,
      createExecutionRun: ({ id, sessionId, instruction, source = "chat" }) => {
        const timestamp = Date.now();
        const runId = id ?? `run-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const activeSession = useStore.getState().chatSessions.find(session => session.id === sessionId) ?? null;
        const nextRun: ExecutionRun = {
          id: runId,
          sessionId,
          projectId: activeSession?.projectId ?? null,
          instruction,
          source,
          status: "queued",
          createdAt: timestamp,
          updatedAt: timestamp,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          events: capExecutionEvents([
            {
              id: `evt-${timestamp}`,
              type: "user",
              title: "任务已创建",
              detail: instruction,
              timestamp,
            },
          ]),
        };

        set(s => ({
          executionRuns: capExecutionRuns([
            nextRun,
            ...s.executionRuns.filter(run => run.id !== runId),
          ]),
          activeExecutionRunId: runId,
        }));

        return runId;
      },
      updateExecutionRun: ({
        id,
        sessionId,
        instruction,
        status,
        source,
        currentAgentId,
        totalTasks,
        completedTasks,
        failedTasks,
        verificationStatus,
        verificationResults,
        verificationUpdatedAt,
        timestamp,
        completedAt,
        event,
      }) =>
        set(s => {
          const updateTime = timestamp ?? completedAt ?? Date.now();
          const existing = s.executionRuns.find(run => run.id === id);
          const baseRun: ExecutionRun =
            existing ??
            {
              id,
              sessionId: sessionId ?? s.activeSessionId,
              projectId: s.chatSessions.find(session => session.id === (sessionId ?? s.activeSessionId))?.projectId ?? null,
              instruction: instruction ?? "待补充指令",
              source: source ?? "chat",
              status: "queued",
              createdAt: updateTime,
              updatedAt: updateTime,
              totalTasks: 0,
              completedTasks: 0,
              failedTasks: 0,
              events: [],
            };

          const nextEvents = event
            ? capExecutionEvents([
                ...baseRun.events.filter(item => item.id !== event.id),
                event,
              ])
            : baseRun.events;

          const resolvedStatus = status ?? baseRun.status;
          const nextRun: ExecutionRun = {
            ...baseRun,
            ...(sessionId ? { sessionId } : {}),
            ...(instruction ? { instruction } : {}),
            ...(source ? { source } : {}),
            ...(status ? { status } : {}),
            ...(currentAgentId === undefined ? {} : { currentAgentId }),
            ...(typeof totalTasks === "number" ? { totalTasks } : {}),
            ...(typeof completedTasks === "number" ? { completedTasks } : {}),
            ...(typeof failedTasks === "number" ? { failedTasks } : {}),
            ...(verificationStatus !== undefined ? { verificationStatus } : {}),
            ...(verificationResults !== undefined ? { verificationResults } : {}),
            ...(typeof verificationUpdatedAt === "number" ? { verificationUpdatedAt } : {}),
            ...(completedAt
              ? { completedAt }
              : resolvedStatus === "completed" || resolvedStatus === "failed"
                ? { completedAt: baseRun.completedAt ?? updateTime }
                : {}),
            updatedAt: updateTime,
            events: nextEvents,
          };

          return {
            executionRuns: capExecutionRuns([
              nextRun,
              ...s.executionRuns.filter(run => run.id !== id),
            ]),
            activeExecutionRunId: id,
          };
        }),
      failExecutionRun: (runId, detail) =>
        set(s => {
          const now = Date.now();
          return {
            executionRuns: capExecutionRuns(
              s.executionRuns.map(run =>
                run.id === runId
                  ? {
                      ...run,
                      status: "failed",
                      updatedAt: now,
                      completedAt: now,
                      events: capExecutionEvents([
                        ...run.events,
                        {
                          id: `evt-fail-${now}`,
                          type: "error",
                          title: "发送失败",
                          detail,
                          timestamp: now,
                        },
                      ]),
                    }
                  : run,
              ),
            ),
            activeExecutionRunId: runId,
          };
        }),
      setActiveExecutionRun: (activeExecutionRunId) => set({ activeExecutionRunId }),

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
      workspaceProjectMemories: [],
      workspaceProjectViews: {},
      activeWorkspaceProjectMemoryId: null,
      workspaceDeskNotes: [],
      workspaceScratchpad: "",
      setWorkspaceRoot: (workspaceRoot) =>
        set(s => {
          const project = buildProjectContext(workspaceRoot);
          const nextChatSessions = s.chatSessions.map(session =>
            session.id === s.activeSessionId
              ? {
                  ...session,
                  ...project,
                  updatedAt: Date.now(),
                }
              : session,
          );
          const nextKey = getProjectScopeKey(project);
          const nextView = s.workspaceProjectViews[nextKey] ?? makeEmptyWorkspaceProjectView(workspaceRoot);
          return {
            workspaceRoot,
            chatSessions: nextChatSessions,
            workspaceProjectViews: {
              ...s.workspaceProjectViews,
              [nextKey]: {
                ...nextView,
                currentPath: nextView.currentPath ?? workspaceRoot,
                parentPath: nextView.currentPath ? nextView.parentPath : null,
              },
            },
            workspaceCurrentPath: nextView.currentPath ?? workspaceRoot,
            workspaceParentPath: nextView.currentPath ? nextView.parentPath : null,
            workspaceSelectedPath: nextView.selectedPath,
            workspacePreview: deriveWorkspacePreviewFromView(nextView),
            workspacePreviewOpen: nextView.previewOpen,
            workspacePreviewTabs: nextView.previewTabs,
            workspaceActivePreviewPath: nextView.activePreviewPath,
            workspaceRecentPreviews: nextView.recentPreviews,
            workspacePinnedPreviews: nextView.pinnedPreviews,
            workspaceScratchpad: nextView.scratchpad,
            workspaceEntries: workspaceRoot !== s.workspaceRoot ? [] : s.workspaceEntries,
          };
        }),
      setWorkspaceCurrentPath: (workspaceCurrentPath) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            currentPath: workspaceCurrentPath,
          })),
        })),
      setWorkspaceParentPath: (workspaceParentPath) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            parentPath: workspaceParentPath,
          })),
        })),
      setWorkspaceEntries: (workspaceEntries) => set({ workspaceEntries }),
      setWorkspaceSelectedPath: (workspaceSelectedPath) =>
        set(s => ({
          workspaceSelectedPath,
          workspaceProjectViews: {
            ...s.workspaceProjectViews,
            [resolveProjectViewKey(s)]: {
              ...(s.workspaceProjectViews[resolveProjectViewKey(s)] ?? makeEmptyWorkspaceProjectView(s.workspaceRoot)),
              selectedPath: workspaceSelectedPath,
            },
          },
        })),
      setWorkspacePreview: (workspacePreview) => set({ workspacePreview }),
      setWorkspaceLoading: (workspaceLoading) => set({ workspaceLoading }),
      setWorkspacePreviewLoading: (workspacePreviewLoading) => set({ workspacePreviewLoading }),
      setWorkspacePreviewOpen: (workspacePreviewOpen) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            previewOpen: workspacePreviewOpen,
          })),
        })),
      setWorkspaceError: (workspaceError) => set({ workspaceError }),
      setWorkspaceScratchpad: (workspaceScratchpad) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            scratchpad: workspaceScratchpad,
          })),
        })),
      pinWorkspacePreview: (preview) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            pinnedPreviews: [
              preview,
              ...current.pinnedPreviews.filter(item => item.path !== preview.path),
            ].slice(0, 6),
          })),
        })),
      unpinWorkspacePreview: (targetPath) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            pinnedPreviews: current.pinnedPreviews.filter(item => item.path !== targetPath),
          })),
        })),
      saveWorkspaceBundle: (name) =>
        set(s => {
          const trimmedName = name.trim() || `Context Pack ${s.workspaceSavedBundles.length + 1}`;
          const nextBundle: WorkspaceReferenceBundle = {
            id: `bundle-${Date.now()}`,
            name: trimmedName,
            createdAt: Date.now(),
            projectId: s.chatSessions.find(session => session.id === s.activeSessionId)?.projectId ?? null,
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
            workspaceProjectViews: {
              ...s.workspaceProjectViews,
              [resolveProjectViewKey(s)]: {
                ...(s.workspaceProjectViews[resolveProjectViewKey(s)] ?? makeEmptyWorkspaceProjectView(s.workspaceRoot)),
                pinnedPreviews: bundle.previews,
                scratchpad: bundle.notes,
                previewTabs: bundle.previews,
                recentPreviews: [
                  ...bundle.previews,
                  ...s.workspaceRecentPreviews.filter(
                    preview => !bundle.previews.some(saved => saved.path === preview.path),
                  ),
                ].slice(0, 8),
                activePreviewPath: firstPreview?.path ?? null,
                selectedPath: firstPreview?.path ?? null,
                previewOpen: Boolean(firstPreview),
              },
            },
          };
        }),
      deleteWorkspaceBundle: (id) =>
        set(s => ({
          workspaceSavedBundles: s.workspaceSavedBundles.filter(bundle => bundle.id !== id),
        })),
      saveWorkspaceProjectMemory: (name) =>
        set(s => {
          const now = Date.now();
          const trimmedName = name?.trim() || `Project Memory ${s.workspaceProjectMemories.length + 1}`;
          const notesSnapshot = selectProjectMemoryNotes(
            s.workspaceRoot,
            s.workspacePinnedPreviews,
            s.workspaceDeskNotes,
          );
          const nextMemory: WorkspaceProjectMemory = {
            id: `memory-${now}`,
            name: trimmedName,
            createdAt: now,
            updatedAt: now,
            projectId: s.chatSessions.find(session => session.id === s.activeSessionId)?.projectId ?? null,
            rootPath: s.workspaceRoot,
            focusPath: s.workspaceActivePreviewPath ?? s.workspaceSelectedPath,
            previews: s.workspacePinnedPreviews.slice(0, 6),
            scratchpad: s.workspaceScratchpad,
            deskNotes: notesSnapshot,
          };

          return {
            workspaceProjectMemories: capWorkspaceProjectMemories([
              nextMemory,
              ...s.workspaceProjectMemories.filter(memory => memory.name !== trimmedName),
            ]),
            activeWorkspaceProjectMemoryId: nextMemory.id,
          };
        }),
      applyWorkspaceProjectMemory: (id) =>
        set(s => {
          const memory = s.workspaceProjectMemories.find(item => item.id === id);
          if (!memory) return {};

          const focusPreview =
            memory.previews.find(preview => preview.path === memory.focusPath) ??
            memory.previews[0] ??
            null;
          const rootChanged = memory.rootPath && memory.rootPath !== s.workspaceRoot;

          return {
            workspaceRoot: memory.rootPath ?? s.workspaceRoot,
            workspaceCurrentPath: memory.rootPath ?? s.workspaceCurrentPath,
            workspaceParentPath: memory.rootPath ? null : s.workspaceParentPath,
            workspaceEntries: rootChanged ? [] : s.workspaceEntries,
            workspacePinnedPreviews: memory.previews,
            workspaceScratchpad: memory.scratchpad,
            workspacePreviewTabs: memory.previews,
            workspaceRecentPreviews: [
              ...memory.previews,
              ...s.workspaceRecentPreviews.filter(
                preview => !memory.previews.some(saved => saved.path === preview.path),
              ),
            ].slice(0, 8),
            workspacePreview: focusPreview,
            workspacePreviewOpen: Boolean(focusPreview),
            workspaceActivePreviewPath: focusPreview?.path ?? null,
            workspaceSelectedPath: focusPreview?.path ?? null,
            workspaceProjectViews: {
              ...s.workspaceProjectViews,
              [getProjectScopeKey({
                projectId: memory.projectId,
                workspaceRoot: memory.rootPath ?? s.workspaceRoot,
              })]: {
                ...(s.workspaceProjectViews[
                  getProjectScopeKey({
                    projectId: memory.projectId,
                    workspaceRoot: memory.rootPath ?? s.workspaceRoot,
                  })
                ] ?? makeEmptyWorkspaceProjectView(memory.rootPath ?? s.workspaceRoot)),
                currentPath: memory.rootPath ?? s.workspaceCurrentPath,
                parentPath: memory.rootPath ? null : s.workspaceParentPath,
                pinnedPreviews: memory.previews,
                scratchpad: memory.scratchpad,
                previewTabs: memory.previews,
                recentPreviews: [
                  ...memory.previews,
                  ...s.workspaceRecentPreviews.filter(
                    preview => !memory.previews.some(saved => saved.path === preview.path),
                  ),
                ].slice(0, 8),
                activePreviewPath: focusPreview?.path ?? null,
                selectedPath: focusPreview?.path ?? null,
                previewOpen: Boolean(focusPreview),
              },
            },
            activeWorkspaceProjectMemoryId: id,
          };
        }),
      deleteWorkspaceProjectMemory: (id) =>
        set(s => ({
          workspaceProjectMemories: s.workspaceProjectMemories.filter(memory => memory.id !== id),
          activeWorkspaceProjectMemoryId:
            s.activeWorkspaceProjectMemoryId === id ? null : s.activeWorkspaceProjectMemoryId,
        })),
      setActiveWorkspaceProjectMemory: (activeWorkspaceProjectMemoryId) => set({ activeWorkspaceProjectMemoryId }),
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
            projectId: s.chatSessions.find(session => session.id === s.activeSessionId)?.projectId ?? null,
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
            workspaceProjectViews: {
              ...s.workspaceProjectViews,
              [resolveProjectViewKey(s)]: {
                ...(s.workspaceProjectViews[resolveProjectViewKey(s)] ?? makeEmptyWorkspaceProjectView(s.workspaceRoot)),
                previewTabs: workspacePreviewTabs,
                recentPreviews: workspaceRecentPreviews,
                activePreviewPath: preview.path,
                selectedPath: preview.path,
                previewOpen: true,
              },
            },
          };
        }),
      setWorkspaceActivePreviewPath: (workspaceActivePreviewPath) =>
        set(s => ({
          ...applyProjectViewState(s, resolveProjectViewKey(s), current => ({
            ...current,
            activePreviewPath: workspaceActivePreviewPath,
            selectedPath: workspaceActivePreviewPath,
            previewOpen: Boolean(workspaceActivePreviewPath),
          })),
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
            workspaceProjectViews: {
              ...s.workspaceProjectViews,
              [resolveProjectViewKey(s)]: {
                ...(s.workspaceProjectViews[resolveProjectViewKey(s)] ?? makeEmptyWorkspaceProjectView(s.workspaceRoot)),
                previewTabs: workspacePreviewTabs,
                activePreviewPath: fallbackPreview?.path ?? null,
                selectedPath: fallbackPreview?.path ?? null,
                previewOpen: Boolean(fallbackPreview),
              },
            },
          };
        }),
      resetWorkspace: () =>
        set(s => ({
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
          workspaceProjectViews: {
            ...s.workspaceProjectViews,
            [resolveProjectViewKey(s)]: makeEmptyWorkspaceProjectView(),
          },
        })),

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
        automationMode: s.automationMode,
        automationPaused: s.automationPaused,
        remoteSupervisorEnabled: s.remoteSupervisorEnabled,
        autoDispatchScheduledTasks: s.autoDispatchScheduledTasks,
        chatSessions: s.chatSessions,
        activeSessionId: s.activeSessionId,
        executionRuns: s.executionRuns,
        activeExecutionRunId: s.activeExecutionRunId,
        workflowRuns: s.workflowRuns,
        latestMeetingRecord: s.latestMeetingRecord,
        workspacePinnedPreviews: s.workspacePinnedPreviews,
        workspaceSavedBundles: s.workspaceSavedBundles,
        workspaceProjectMemories: s.workspaceProjectMemories,
        workspaceProjectViews: s.workspaceProjectViews,
        activeWorkspaceProjectMemoryId: s.activeWorkspaceProjectMemoryId,
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
