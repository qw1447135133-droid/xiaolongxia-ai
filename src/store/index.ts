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
  DesktopInputSession,
  DesktopScreenshotState,
  DesktopProgramEntry,
  DesktopProgramSettings,
  DesktopRuntimeState,
  ExecutionEvent,
  ExecutionRun,
  ExecutionRunSource,
  ExecutionRunStatus,
  VerificationStatus,
  VerificationStepResult,
  ModelProvider,
  PlatformConfig,
  Task,
  ControlCenterSectionId,
  TeamOperatingTemplateId,
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
import {
  createDemoBusinessDataset,
  getNextChannelSessionStatus,
  getNextContentTaskStatus,
  getNextLeadStage,
  getNextTicketStatus,
} from "@/lib/business-entities";
import {
  buildContentChannelGovernancePlan,
  getNextCycleActionDetail,
  getNextCycleStatusFromRecommendation,
} from "@/lib/content-governance";
import { getWorkflowTemplateById } from "@/lib/workflow-runtime";
import { buildProjectContext, getProjectScopeKey, matchProjectScope } from "@/lib/project-context";
import { PLUGIN_PACKS } from "@/lib/plugin-runtime";
import type {
  BusinessApprovalRecord,
  BusinessChannelSession,
  BusinessContentChannel,
  BusinessContentChannelGovernance,
  BusinessContentTask,
  BusinessContentNextCycleRecommendation,
  BusinessContentPublishResult,
  BusinessCustomer,
  BusinessEntityType,
  BusinessLead,
  BusinessOperationRecord,
  BusinessTicket,
} from "@/types/business-entities";
import type {
  WorkspaceDeskNote,
  WorkspaceEntry,
  WorkspaceProjectMemory,
  WorkspacePreview,
  WorkspaceReferenceBundle,
} from "@/types/desktop-workspace";
import type {
  SemanticKnowledgeDocument,
  SemanticMemoryConfig,
} from "@/types/semantic-memory";
import type { WorkflowContextSnapshot, WorkflowRun, WorkflowTemplate } from "@/types/workflows";

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
  activeTeamOperatingTemplateId: TeamOperatingTemplateId | null;
  semanticMemoryConfig: SemanticMemoryConfig;
  desktopProgramSettings: DesktopProgramSettings;
  addProvider: (p: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  updateAgentConfig: (id: AgentId, updates: Partial<AgentConfig>) => void;
  updatePlatformConfig: (id: string, updates: Partial<PlatformConfig>) => void;
  updatePlatformField: (platformId: string, fieldKey: string, value: string) => void;
  togglePlugin: (id: string) => void;
  applyPluginPack: (id: string) => void;
  setUserNickname: (nickname: string) => void;
  setActiveTeamOperatingTemplate: (id: TeamOperatingTemplateId | null) => void;
  updateSemanticMemoryConfig: (updates: Partial<SemanticMemoryConfig>) => void;
  updateSemanticMemoryPgvectorConfig: (updates: Partial<SemanticMemoryConfig["pgvector"]>) => void;
  updateDesktopProgramSettings: (updates: Partial<DesktopProgramSettings>) => void;
  saveDesktopFavorite: (payload: Pick<DesktopProgramEntry, "label" | "target" | "args" | "cwd" | "notes" | "source">) => void;
  removeDesktopFavorite: (id: string) => void;
  saveDesktopWhitelistEntry: (payload: Pick<DesktopProgramEntry, "label" | "target" | "args" | "cwd" | "notes" | "source">) => void;
  removeDesktopWhitelistEntry: (id: string) => void;
}

interface UISlice {
  theme: "dark" | "coral" | "jade";
  leftOpen: boolean;
  rightOpen: boolean;
  activeTab: AppTab;
  activeControlCenterSectionId: ControlCenterSectionId;
  setTheme: (t: UISlice["theme"]) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setTab: (t: AppTab) => void;
  setActiveControlCenterSection: (section: ControlCenterSectionId) => void;
}

interface ConnectionSlice {
  wsStatus: "connecting" | "connected" | "disconnected";
  desktopRuntime: DesktopRuntimeState;
  desktopInputSession: DesktopInputSession;
  desktopScreenshot: DesktopScreenshotState;
  setWsStatus: (s: ConnectionSlice["wsStatus"]) => void;
  setDesktopRuntime: (runtime: Partial<DesktopRuntimeState>) => void;
  setDesktopInputSession: (session: Partial<DesktopInputSession>) => void;
  clearDesktopInputSession: () => void;
  setDesktopScreenshot: (screenshot: Partial<DesktopScreenshotState>) => void;
  clearDesktopScreenshot: () => void;
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
  completeWorkflowRun: (workflowRunId: string, payload?: { latestDraftSummary?: string }) => void;
  archiveWorkflowRun: (workflowRunId: string) => void;
  removeWorkflowRun: (workflowRunId: string) => void;
  queueContentTaskWorkflowRun: (contentTaskId: string) => string | null;
}

interface BusinessEntitiesSlice {
  businessApprovals: BusinessApprovalRecord[];
  businessOperationLogs: BusinessOperationRecord[];
  businessCustomers: BusinessCustomer[];
  businessLeads: BusinessLead[];
  businessTickets: BusinessTicket[];
  businessContentTasks: BusinessContentTask[];
  businessChannelSessions: BusinessChannelSession[];
  createBusinessCustomer: (payload: Pick<BusinessCustomer, "name" | "tier" | "primaryChannel" | "company" | "summary">) => void;
  createBusinessLead: (payload: Pick<BusinessLead, "title" | "customerId" | "source" | "stage" | "score" | "nextAction">) => void;
  createBusinessTicket: (payload: Pick<BusinessTicket, "subject" | "customerId" | "channelSessionId" | "status" | "priority" | "summary">) => void;
  createBusinessContentTask: (
    payload: Pick<
      BusinessContentTask,
      "title" | "customerId" | "leadId" | "channel" | "format" | "goal" | "publishTargets" | "status" | "priority" | "brief" | "scheduledFor"
    >,
  ) => void;
  updateBusinessContentTask: (id: string, updates: Partial<Omit<BusinessContentTask, "id" | "projectId" | "rootPath" | "createdAt">>) => void;
  createBusinessChannelSession: (payload: Pick<BusinessChannelSession, "title" | "customerId" | "channel" | "externalRef" | "status" | "summary">) => void;
  advanceBusinessLeadStage: (id: string) => void;
  advanceBusinessTicketStatus: (id: string) => void;
  advanceBusinessContentTaskStatus: (id: string) => void;
  advanceBusinessChannelSessionStatus: (id: string) => void;
  setBusinessApprovalDecision: (payload: {
    entityType: BusinessEntityType;
    entityId: string;
    status: BusinessApprovalRecord["status"];
    note?: string;
  }) => void;
  recordBusinessOperation: (payload: {
    entityType: BusinessEntityType;
    entityId: string;
    eventType: BusinessOperationRecord["eventType"];
    trigger: BusinessOperationRecord["trigger"];
    status: BusinessOperationRecord["status"];
    title: string;
    detail: string;
    executionRunId?: string;
    workflowRunId?: string;
    externalRef?: string;
    failureReason?: string;
  }) => void;
  recordContentPublishResult: (payload: {
    contentTaskId: string;
    status: Extract<BusinessOperationRecord["status"], "completed" | "failed">;
    title?: string;
    detail: string;
    publishLinks?: string[];
    channel?: BusinessContentPublishResult["channel"];
    accountLabel?: string;
    externalId?: string;
    publishedAt?: number;
    summary?: string;
    executionRunId?: string;
    workflowRunId?: string;
    externalRef?: string;
    failureReason?: string;
  }) => void;
  applyContentTaskGovernance: (payload: {
    contentTaskId: string;
    recommendation: BusinessContentNextCycleRecommendation;
    status?: BusinessContentTask["status"];
    detail: string;
    trigger?: BusinessOperationRecord["trigger"];
    queueWorkflow?: boolean;
  }) => void;
  continueContentTaskNextCycle: (payload: {
    contentTaskId: string;
    trigger?: BusinessOperationRecord["trigger"];
  }) => string | null;
  applyContentChannelGovernance: (payload: {
    contentTaskId: string;
    strategy?: "prioritize_primary" | "drop_risky";
    detail?: string;
    trigger?: BusinessOperationRecord["trigger"];
  }) => void;
  launchContentTaskNextCycle: (payload: {
    contentTaskId: string;
    recommendation?: BusinessContentNextCycleRecommendation;
    detail?: string;
    trigger?: BusinessOperationRecord["trigger"];
  }) => string | null;
  seedBusinessEntitiesForProject: (scope?: { projectId?: string | null; rootPath?: string | null }) => void;
  clearBusinessEntitiesForProject: (scope?: { projectId?: string | null; rootPath?: string | null }) => void;
}

interface SemanticKnowledgeSlice {
  semanticKnowledgeDocs: SemanticKnowledgeDocument[];
  createSemanticKnowledgeDoc: (payload: Pick<SemanticKnowledgeDocument, "title" | "content" | "tags" | "sourceLabel">) => void;
  updateSemanticKnowledgeDoc: (
    id: string,
    updates: Partial<Pick<SemanticKnowledgeDocument, "title" | "content" | "tags" | "sourceLabel">>,
  ) => void;
  deleteSemanticKnowledgeDoc: (id: string) => void;
}

interface ExecutionSlice {
  executionRuns: ExecutionRun[];
  activeExecutionRunId: string | null;
  createExecutionRun: (payload: {
    id?: string;
    sessionId: string;
    instruction: string;
    source?: ExecutionRunSource;
    workflowRunId?: string;
    entityType?: BusinessEntityType;
    entityId?: string;
  }) => string;
  updateExecutionRun: (payload: {
    id: string;
    sessionId?: string;
    instruction?: string;
    status?: ExecutionRunStatus;
    source?: ExecutionRunSource;
    workflowRunId?: string;
    entityType?: BusinessEntityType;
    entityId?: string;
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
  & BusinessEntitiesSlice
  & SemanticKnowledgeSlice
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

function normalizeSemanticMemoryConfig(
  currentConfig: SemanticMemoryConfig,
  persistedConfig?: Partial<SemanticMemoryConfig>,
): SemanticMemoryConfig {
  return {
    ...currentConfig,
    ...persistedConfig,
    pgvector: {
      ...currentConfig.pgvector,
      ...persistedConfig?.pgvector,
    },
  };
}

function normalizeDesktopProgramEntries(entries: unknown): DesktopProgramEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) => {
      const item = entry as Partial<DesktopProgramEntry>;
      const target = typeof item?.target === "string" ? item.target.trim() : "";
      if (!target) return null;

      const now = Date.now();
      return {
        id: typeof item?.id === "string" && item.id.trim() ? item.id : `desktop-entry-${now}-${index}`,
        label: typeof item?.label === "string" && item.label.trim() ? item.label.trim() : target,
        target,
        args: Array.isArray(item?.args)
          ? item.args.map(value => String(value ?? "").trim()).filter(Boolean)
          : [],
        ...(typeof item?.cwd === "string" && item.cwd.trim() ? { cwd: item.cwd.trim() } : {}),
        ...(typeof item?.notes === "string" && item.notes.trim() ? { notes: item.notes.trim() } : {}),
        source:
          item?.source === "preset" || item?.source === "scan" || item?.source === "manual"
            ? item.source
            : "manual",
        createdAt: typeof item?.createdAt === "number" ? item.createdAt : now,
        updatedAt: typeof item?.updatedAt === "number" ? item.updatedAt : now,
      } satisfies DesktopProgramEntry;
    })
    .filter((item): item is DesktopProgramEntry => Boolean(item));
}

function normalizeDesktopProgramSettings(
  currentSettings: DesktopProgramSettings,
  persistedSettings?: Partial<DesktopProgramSettings>,
): DesktopProgramSettings {
  return {
    enabled: persistedSettings?.enabled ?? currentSettings.enabled,
    whitelistMode: persistedSettings?.whitelistMode ?? currentSettings.whitelistMode,
    favorites: normalizeDesktopProgramEntries(persistedSettings?.favorites ?? currentSettings.favorites),
    whitelist: normalizeDesktopProgramEntries(persistedSettings?.whitelist ?? currentSettings.whitelist),
    inputControl: {
      enabled: persistedSettings?.inputControl?.enabled ?? currentSettings.inputControl.enabled,
      autoOpenPanelOnAction:
        persistedSettings?.inputControl?.autoOpenPanelOnAction ?? currentSettings.inputControl.autoOpenPanelOnAction,
      requireManualTakeoverForVerification:
        persistedSettings?.inputControl?.requireManualTakeoverForVerification
        ?? currentSettings.inputControl.requireManualTakeoverForVerification,
    },
  };
}

const seedSession = makeEmptySession();
const MAX_EXECUTION_RUNS = 24;
const MAX_EXECUTION_EVENTS = 40;
const MAX_WORKSPACE_PROJECT_MEMORIES = 16;
const MAX_BUSINESS_OPERATION_LOGS = 240;
const DEFAULT_SEMANTIC_MEMORY_CONFIG: SemanticMemoryConfig = {
  providerId: "local",
  autoRecallProjectMemories: true,
  autoRecallDeskNotes: true,
  autoRecallKnowledgeDocs: true,
  pgvector: {
    enabled: false,
    connectionString: "",
    schema: "public",
    table: "semantic_memory_documents",
    embeddingModel: "text-embedding-3-small",
    dimensions: 1536,
  },
};

const DEFAULT_DESKTOP_PROGRAM_SETTINGS: DesktopProgramSettings = {
  enabled: true,
  whitelistMode: false,
  favorites: [],
  whitelist: [],
  inputControl: {
    enabled: false,
    autoOpenPanelOnAction: true,
    requireManualTakeoverForVerification: true,
  },
};

const DEFAULT_DESKTOP_RUNTIME_STATE: DesktopRuntimeState = {
  totalClients: 0,
  launchCapable: 0,
  installedAppsCapable: 0,
  inputCapable: 0,
  screenshotCapable: 0,
  lastCheckedAt: null,
  fetchState: "idle",
};

const DEFAULT_DESKTOP_INPUT_SESSION: DesktopInputSession = {
  state: "idle",
  source: null,
  updatedAt: null,
};

const DEFAULT_DESKTOP_SCREENSHOT_STATE: DesktopScreenshotState = {
  status: "idle",
  source: null,
  updatedAt: null,
};

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

function capBusinessOperationLogs(records: BusinessOperationRecord[]): BusinessOperationRecord[] {
  return [...records]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_BUSINESS_OPERATION_LOGS);
}

function upsertDesktopProgramEntry(
  entries: DesktopProgramEntry[],
  payload: Pick<DesktopProgramEntry, "label" | "target" | "args" | "cwd" | "notes" | "source">,
): DesktopProgramEntry[] {
  const now = Date.now();
  const normalizedTarget = payload.target.trim().toLowerCase();
  const existing = entries.find(item => item.target.trim().toLowerCase() === normalizedTarget);
  const nextEntry: DesktopProgramEntry = {
    id: existing?.id ?? `desktop-entry-${now}-${Math.random().toString(36).slice(2, 7)}`,
    label: payload.label.trim() || payload.target.trim(),
    target: payload.target.trim(),
    args: payload.args.map(value => String(value ?? "").trim()).filter(Boolean),
    ...(payload.cwd?.trim() ? { cwd: payload.cwd.trim() } : {}),
    ...(payload.notes?.trim() ? { notes: payload.notes.trim() } : {}),
    source: payload.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return [
    nextEntry,
    ...entries.filter(item => item.id !== nextEntry.id),
  ].slice(0, 32);
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

function resolveBusinessScope(state: Pick<Store, "chatSessions" | "activeSessionId" | "workspaceRoot">) {
  const activeSession = state.chatSessions.find(session => session.id === state.activeSessionId) ?? null;
  return {
    projectId: activeSession?.projectId ?? null,
    rootPath: activeSession?.workspaceRoot ?? state.workspaceRoot,
  };
}

function getBusinessEntityTitle(
  state: Pick<
    Store,
    "businessCustomers" | "businessLeads" | "businessTickets" | "businessContentTasks" | "businessChannelSessions"
  >,
  entityType: BusinessEntityType,
  entityId: string,
) {
  switch (entityType) {
    case "customer":
      return state.businessCustomers.find(item => item.id === entityId)?.name ?? entityId;
    case "lead":
      return state.businessLeads.find(item => item.id === entityId)?.title ?? entityId;
    case "ticket":
      return state.businessTickets.find(item => item.id === entityId)?.subject ?? entityId;
    case "contentTask":
      return state.businessContentTasks.find(item => item.id === entityId)?.title ?? entityId;
    case "channelSession":
      return state.businessChannelSessions.find(item => item.id === entityId)?.title ?? entityId;
  }
}

function getContentTaskWorkflowTemplateId(status: BusinessContentTask["status"]) {
  switch (status) {
    case "review":
      return "content-final-review";
    case "scheduled":
      return "content-publish-prep";
    case "published":
      return "content-postmortem";
    default:
      return "content-topic-draft";
  }
}

function buildContentTaskWorkflowContext(
  state: Pick<Store, "workspacePinnedPreviews" | "workspaceDeskNotes" | "workspaceSavedBundles" | "enabledPluginIds">,
  task: BusinessContentTask,
): WorkflowContextSnapshot {
  return {
    deskRefs: state.workspacePinnedPreviews.length,
    deskNotes: state.workspaceDeskNotes.filter(note => matchProjectScope(note, task)).length,
    contextPacks: state.workspaceSavedBundles.filter(bundle => matchProjectScope(bundle, task)).length,
    plugins: state.enabledPluginIds.length,
  };
}

function buildContentTaskWorkflowDraft(
  task: BusinessContentTask,
  template: WorkflowTemplate,
  context: WorkflowContextSnapshot,
) {
  const publishTargets = task.publishTargets.length > 0
    ? task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(", ")
    : "未设置";
  const scheduledFor = task.scheduledFor
    ? new Date(task.scheduledFor).toLocaleString("zh-CN", { hour12: false })
    : "未排期";
  const publishResultSummary = task.publishedResults.length > 0
    ? task.publishedResults
        .slice(0, 3)
        .map(result => {
          const parts = [`${result.channel}:${result.accountLabel}`, result.status];
          if (result.externalId) parts.push(`externalId ${result.externalId}`);
          if (result.link) parts.push(`link ${result.link}`);
          if (result.failureReason) parts.push(`reason ${result.failureReason}`);
          return parts.join(" · ");
        })
        .join("\n")
    : "暂无";

  return [
    `Workflow: ${template.title}`,
    `Content Task: ${task.title}`,
    `Status: ${task.status}`,
    `Format: ${task.format}`,
    `Primary Channel: ${task.channel}`,
    `Goal: ${task.goal}`,
    `Publish Targets: ${publishTargets}`,
    `Scheduled For: ${scheduledFor}`,
    `Context: desk refs ${context.deskRefs}, desk notes ${context.deskNotes}, context packs ${context.contextPacks}, plugins ${context.plugins}`,
    "",
    `Brief: ${task.brief}`,
    task.latestDraftSummary ? `Latest Draft Summary: ${task.latestDraftSummary}` : "Latest Draft Summary: 暂无",
    task.latestPostmortemSummary ? `Latest Postmortem Summary: ${task.latestPostmortemSummary}` : "Latest Postmortem Summary: 暂无",
    `Publish Results: ${publishResultSummary}`,
    "",
    template.brief,
  ].join("\n");
}

function mergePublishedLinks(currentLinks: string[], nextLinks?: string[], fallbackRefs?: string[]) {
  const normalized = [
    ...(nextLinks ?? []),
    ...(fallbackRefs ?? []),
  ]
    .map(link => link.trim())
    .filter(Boolean);

  if (normalized.length === 0) return currentLinks;
  return Array.from(new Set([...currentLinks, ...normalized]));
}

function mergePublishedResults(
  currentResults: BusinessContentPublishResult[],
  nextResult?: BusinessContentPublishResult,
) {
  if (!nextResult) return currentResults;

  return [
    nextResult,
    ...currentResults.filter(result => result.id !== nextResult.id),
  ].slice(0, 24);
}

function resolveContentChannelGovernance(
  task: Pick<BusinessContentTask, "channel" | "publishTargets" | "publishedResults">,
): Pick<BusinessContentTask, "channelGovernance" | "recommendedPrimaryChannel" | "riskyChannels"> {
  const governanceMap = new Map<BusinessContentChannel, BusinessContentChannelGovernance>();
  const touchedChannels = new Set<BusinessContentChannel>([
    task.channel,
    ...task.publishTargets.map(target => target.channel),
    ...task.publishedResults.map(result => result.channel),
  ]);

  for (const channel of touchedChannels) {
    governanceMap.set(channel, {
      channel,
      completed: 0,
      failed: 0,
      recommendation: "secondary",
    });
  }

  const sortedResults = [...task.publishedResults].sort((left, right) => right.publishedAt - left.publishedAt);
  for (const result of sortedResults) {
    const current = governanceMap.get(result.channel) ?? {
      channel: result.channel,
      completed: 0,
      failed: 0,
      recommendation: "secondary" as const,
    };
    if (result.status === "completed") {
      current.completed += 1;
    } else {
      current.failed += 1;
      if (!current.lastFailureReason && result.failureReason) {
        current.lastFailureReason = result.failureReason;
      }
    }
    if (!current.lastPublishedAt) {
      current.lastPublishedAt = result.publishedAt;
    }
    governanceMap.set(result.channel, current);
  }

  const channelGovernance = Array.from(governanceMap.values())
    .map(item => {
      const recommendation: BusinessContentChannelGovernance["recommendation"] = item.failed >= 2 && item.failed > item.completed
        ? "risky"
        : item.completed > 0 && item.completed >= item.failed
          ? "primary"
          : "secondary";
      return {
        ...item,
        recommendation,
      };
    })
    .sort((left, right) => {
      const leftScore = left.completed * 2 - left.failed;
      const rightScore = right.completed * 2 - right.failed;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (right.lastPublishedAt ?? 0) - (left.lastPublishedAt ?? 0);
    });

  const riskyChannels = channelGovernance
    .filter(item => item.recommendation === "risky")
    .map(item => item.channel);

  const recommendedPrimaryChannel = channelGovernance.find(item => item.recommendation === "primary")?.channel
    ?? task.publishTargets.find(target => !riskyChannels.includes(target.channel))?.channel
    ?? task.publishTargets[0]?.channel
    ?? task.channel;

  return {
    channelGovernance,
    recommendedPrimaryChannel,
    riskyChannels,
  };
}

function hasActiveContentWorkflowRun(
  workflowRuns: WorkflowRun[],
  contentTaskId: string,
  templateId?: WorkflowRun["templateId"],
) {
  return workflowRuns.some(run =>
    run.entityType === "contentTask"
    && run.entityId === contentTaskId
    && (!templateId || run.templateId === templateId)
    && (run.status === "queued" || run.status === "staged" || run.status === "in-progress"),
  );
}

function findActiveContentWorkflowRun(
  workflowRuns: WorkflowRun[],
  contentTaskId: string,
  templateId?: WorkflowRun["templateId"],
) {
  return workflowRuns.find(run =>
    run.entityType === "contentTask"
    && run.entityId === contentTaskId
    && (!templateId || run.templateId === templateId)
    && (run.status === "queued" || run.status === "staged" || run.status === "in-progress"),
  ) ?? null;
}

function resolveContentTaskStatusAfterWorkflow(
  task: BusinessContentTask,
  workflowRun: Pick<WorkflowRun, "templateId">,
): BusinessContentTask["status"] {
  if (workflowRun.templateId === "content-topic-draft" && task.status === "draft") {
    return "review";
  }

  return task.status;
}

function inferNextCycleRecommendation(
  task: BusinessContentTask,
  workflowSummary?: string,
): BusinessContentNextCycleRecommendation {
  const normalizedSummary = workflowSummary?.toLowerCase() ?? "";

  if (
    normalizedSummary.includes("rewrite")
    || normalizedSummary.includes("rework")
    || normalizedSummary.includes("改写")
    || normalizedSummary.includes("重写")
    || normalizedSummary.includes("重做")
  ) {
    return "rewrite";
  }

  if (
    normalizedSummary.includes("retry")
    || normalizedSummary.includes("repost")
    || normalizedSummary.includes("重发")
    || normalizedSummary.includes("补发")
    || normalizedSummary.includes("再发")
  ) {
    return "retry";
  }

  if (
    normalizedSummary.includes("reuse")
    || normalizedSummary.includes("repurpose")
    || normalizedSummary.includes("复用")
    || normalizedSummary.includes("沿用")
    || normalizedSummary.includes("扩散")
  ) {
    return "reuse";
  }

  const successCount = task.publishedResults.filter(result => result.status === "completed").length;
  const failureCount = task.publishedResults.filter(result => result.status === "failed").length;

  if (failureCount > successCount) return "retry";
  if (successCount > 0) return "reuse";
  return "rewrite";
}

function hasActiveContentPostmortemRun(
  workflowRuns: WorkflowRun[],
  contentTaskId: string,
) {
  return hasActiveContentWorkflowRun(workflowRuns, contentTaskId, "content-postmortem");
}

function getContentFailureStreak(task: BusinessContentTask) {
  let streak = 0;
  const sortedResults = [...task.publishedResults].sort((left, right) => right.publishedAt - left.publishedAt);

  for (const result of sortedResults) {
    if (result.status !== "failed") break;
    streak += 1;
  }

  return streak;
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
    (set, get) => ({
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
      activeTeamOperatingTemplateId: null,
      semanticMemoryConfig: DEFAULT_SEMANTIC_MEMORY_CONFIG,
      desktopProgramSettings: DEFAULT_DESKTOP_PROGRAM_SETTINGS,
      setUserNickname: (nickname) => set({ userNickname: nickname }),
      setActiveTeamOperatingTemplate: (activeTeamOperatingTemplateId) => set({ activeTeamOperatingTemplateId }),
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
      updateSemanticMemoryConfig: (updates) =>
        set(s => ({
          semanticMemoryConfig: normalizeSemanticMemoryConfig(s.semanticMemoryConfig, updates),
        })),
      updateSemanticMemoryPgvectorConfig: (updates) =>
        set(s => ({
          semanticMemoryConfig: {
            ...s.semanticMemoryConfig,
            pgvector: {
              ...s.semanticMemoryConfig.pgvector,
              ...updates,
            },
          },
        })),
      updateDesktopProgramSettings: (updates) =>
        set(s => ({
          desktopProgramSettings: {
            ...s.desktopProgramSettings,
            ...updates,
            favorites: updates.favorites ?? s.desktopProgramSettings.favorites,
            whitelist: updates.whitelist ?? s.desktopProgramSettings.whitelist,
            inputControl: updates.inputControl
              ? {
                  ...s.desktopProgramSettings.inputControl,
                  ...updates.inputControl,
                }
              : s.desktopProgramSettings.inputControl,
          },
        })),
      saveDesktopFavorite: (payload) =>
        set(s => ({
          desktopProgramSettings: {
            ...s.desktopProgramSettings,
            favorites: upsertDesktopProgramEntry(s.desktopProgramSettings.favorites, payload),
          },
        })),
      removeDesktopFavorite: (id) =>
        set(s => ({
          desktopProgramSettings: {
            ...s.desktopProgramSettings,
            favorites: s.desktopProgramSettings.favorites.filter(item => item.id !== id),
          },
        })),
      saveDesktopWhitelistEntry: (payload) =>
        set(s => ({
          desktopProgramSettings: {
            ...s.desktopProgramSettings,
            whitelist: upsertDesktopProgramEntry(s.desktopProgramSettings.whitelist, payload),
          },
        })),
      removeDesktopWhitelistEntry: (id) =>
        set(s => ({
          desktopProgramSettings: {
            ...s.desktopProgramSettings,
            whitelist: s.desktopProgramSettings.whitelist.filter(item => item.id !== id),
          },
        })),

      theme: "dark",
      leftOpen: true,
      rightOpen: true,
      activeTab: "dashboard",
      activeControlCenterSectionId: "overview",
      setTheme: (theme) => {
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", theme === "dark" ? "" : theme);
        }
        set({ theme });
      },
      toggleLeft: () => set(s => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set(s => ({ rightOpen: !s.rightOpen })),
      setTab: (activeTab) => set({ activeTab }),
      setActiveControlCenterSection: (activeControlCenterSectionId) => set({ activeControlCenterSectionId }),

      wsStatus: "disconnected",
      desktopRuntime: DEFAULT_DESKTOP_RUNTIME_STATE,
      desktopInputSession: DEFAULT_DESKTOP_INPUT_SESSION,
      desktopScreenshot: DEFAULT_DESKTOP_SCREENSHOT_STATE,
      setWsStatus: (wsStatus) => set({ wsStatus }),
      setDesktopRuntime: (desktopRuntime) =>
        set(s => ({
          desktopRuntime: {
            ...s.desktopRuntime,
            ...desktopRuntime,
          },
        })),
      setDesktopInputSession: (desktopInputSession) =>
        set(s => ({
          desktopInputSession: {
            ...s.desktopInputSession,
            ...desktopInputSession,
            updatedAt: Date.now(),
          },
        })),
      clearDesktopInputSession: () => set({ desktopInputSession: DEFAULT_DESKTOP_INPUT_SESSION }),
      setDesktopScreenshot: (desktopScreenshot) =>
        set(s => ({
          desktopScreenshot: {
            ...s.desktopScreenshot,
            ...desktopScreenshot,
            updatedAt: Date.now(),
          },
        })),
      clearDesktopScreenshot: () => set({ desktopScreenshot: DEFAULT_DESKTOP_SCREENSHOT_STATE }),

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
      completeWorkflowRun: (workflowRunId, payload) =>
        set(s => {
          const now = Date.now();
          const completedRun = s.workflowRuns.find(run => run.id === workflowRunId) ?? null;
          const linkedContentTask = completedRun?.entityType === "contentTask" && completedRun.entityId
            ? s.businessContentTasks.find(task => task.id === completedRun.entityId) ?? null
            : null;
          const workflowSummary = payload?.latestDraftSummary?.trim() || completedRun?.summary;
          const isPostmortemWorkflow = completedRun?.templateId === "content-postmortem";
          const nextContentTaskStatus = linkedContentTask && completedRun
            ? resolveContentTaskStatusAfterWorkflow(linkedContentTask, completedRun)
            : null;
          const nextCycleRecommendation = linkedContentTask && isPostmortemWorkflow
            ? inferNextCycleRecommendation(linkedContentTask, workflowSummary)
            : undefined;

          return {
            workflowRuns: s.workflowRuns.map(run =>
              run.id === workflowRunId
                ? {
                    ...run,
                    status: "completed",
                    completedAt: now,
                    updatedAt: now,
                  }
                : run,
            ),
            businessContentTasks:
              completedRun?.entityType === "contentTask" && completedRun.entityId
                ? s.businessContentTasks.map(task =>
                    task.id === completedRun.entityId
                      ? {
                          ...task,
                          status: nextContentTaskStatus ?? task.status,
                          ...(isPostmortemWorkflow
                            ? {
                                latestPostmortemSummary: workflowSummary,
                                nextCycleRecommendation,
                              }
                            : { latestDraftSummary: workflowSummary }),
                          lastWorkflowRunId: completedRun.id,
                          lastOperationAt: now,
                          updatedAt: now,
                        }
                      : task,
                  )
                : s.businessContentTasks,
            businessOperationLogs:
              completedRun?.entityType === "contentTask" && completedRun.entityId
                ? capBusinessOperationLogs([
                    {
                      id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
                      entityType: completedRun.entityType,
                      entityId: completedRun.entityId,
                      eventType: "workflow",
                      trigger: "manual",
                      status: "completed",
                      title: completedRun.title,
                      detail: linkedContentTask && nextContentTaskStatus && nextContentTaskStatus !== linkedContentTask.status
                        ? `Workflow completed. ${workflowSummary ?? completedRun.summary} · 状态已推进到 ${nextContentTaskStatus}`
                        : `Workflow completed. ${workflowSummary ?? completedRun.summary}`,
                      workflowRunId: completedRun.id,
                      projectId: linkedContentTask?.projectId ?? null,
                      rootPath: linkedContentTask?.rootPath ?? null,
                      createdAt: now,
                      updatedAt: now,
                    },
                    ...s.businessOperationLogs,
                  ])
                : s.businessOperationLogs,
          };
        }),
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
      queueContentTaskWorkflowRun: (contentTaskId) => {
        const state = get();
        const contentTask = state.businessContentTasks.find(task => task.id === contentTaskId) ?? null;
        if (!contentTask) return null;

        const templateId = getContentTaskWorkflowTemplateId(contentTask.status);
        const template = getWorkflowTemplateById(templateId, state.enabledPluginIds);
        if (!template) return null;
        const activeWorkflowRun = findActiveContentWorkflowRun(state.workflowRuns, contentTaskId, templateId);
        if (activeWorkflowRun) {
          get().updateBusinessContentTask(contentTask.id, {
            lastWorkflowRunId: activeWorkflowRun.id,
            lastOperationAt: Date.now(),
          });
          return activeWorkflowRun.id;
        }

        const workflowContext = buildContentTaskWorkflowContext(state, contentTask);
        const draft = buildContentTaskWorkflowDraft(contentTask, template, workflowContext);

        const workflowRunId = get().queueWorkflowRun({
          templateId: template.id,
          title: `${template.title} · ${contentTask.title}`,
          summary: `${template.summary} · ${contentTask.goal}`,
          nextTab: template.nextTab,
          brief: template.brief,
          draft,
          accent: template.accent,
          steps: template.steps,
          context: workflowContext,
          source: template.source,
          entityType: "contentTask",
          entityId: contentTask.id,
          pluginId: template.pluginId,
          pluginName: template.pluginName,
        });

        get().updateBusinessContentTask(contentTask.id, {
          lastWorkflowRunId: workflowRunId,
          lastOperationAt: Date.now(),
        });
        get().recordBusinessOperation({
          entityType: "contentTask",
          entityId: contentTask.id,
          eventType: "workflow",
          trigger: "manual",
          status: "pending",
          title: contentTask.title,
          detail: `Workflow queued. ${template.summary}`,
          workflowRunId,
        });

        return workflowRunId;
      },

      businessApprovals: [],
      businessOperationLogs: [],
      businessCustomers: [],
      businessLeads: [],
      businessTickets: [],
      businessContentTasks: [],
      businessChannelSessions: [],
      createBusinessCustomer: (payload) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          return {
            businessCustomers: [
              {
                id: `customer-${now}-${Math.random().toString(36).slice(2, 7)}`,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                ownerAgentId: "greeter",
                tags: [],
                ...payload,
              },
              ...s.businessCustomers,
            ],
          };
        }),
      createBusinessLead: (payload) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          return {
            businessLeads: [
              {
                id: `lead-${now}-${Math.random().toString(36).slice(2, 7)}`,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                ownerAgentId: "explorer",
                ...payload,
              },
              ...s.businessLeads,
            ],
          };
        }),
      createBusinessTicket: (payload) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          return {
            businessTickets: [
              {
                id: `ticket-${now}-${Math.random().toString(36).slice(2, 7)}`,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                ownerAgentId: "greeter",
                ...payload,
              },
              ...s.businessTickets,
            ],
          };
        }),
      createBusinessContentTask: (payload) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          const baseTask = {
            id: `content-${now}-${Math.random().toString(36).slice(2, 7)}`,
            projectId: scope.projectId,
            rootPath: scope.rootPath,
            createdAt: now,
            updatedAt: now,
            ownerAgentId: "writer" as const,
            publishedLinks: [],
            publishedResults: [],
            ...payload,
          };
          const channelStrategy = resolveContentChannelGovernance(baseTask);
          return {
            businessContentTasks: [
              {
                ...baseTask,
                ...channelStrategy,
              },
              ...s.businessContentTasks,
            ],
          };
        }),
      updateBusinessContentTask: (id, updates) =>
        set(s => ({
          businessContentTasks: s.businessContentTasks.map(item =>
            item.id === id
              ? (() => {
                  const nextTask = {
                    ...item,
                    ...updates,
                    updatedAt: Date.now(),
                  };
                  return "channel" in updates || "publishTargets" in updates || "publishedResults" in updates
                    ? {
                        ...nextTask,
                        ...resolveContentChannelGovernance(nextTask),
                      }
                    : nextTask;
                })()
              : item,
          ),
        })),
      createBusinessChannelSession: (payload) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          return {
            businessChannelSessions: [
              {
                id: `channel-session-${now}-${Math.random().toString(36).slice(2, 7)}`,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                lastMessageAt: now,
                ...payload,
              },
              ...s.businessChannelSessions,
            ],
          };
        }),
      advanceBusinessLeadStage: (id) =>
        set(s => ({
          businessLeads: s.businessLeads.map(item =>
            item.id === id
              ? { ...item, stage: getNextLeadStage(item.stage), updatedAt: Date.now() }
              : item,
          ),
        })),
      advanceBusinessTicketStatus: (id) =>
        set(s => ({
          businessTickets: s.businessTickets.map(item =>
            item.id === id
              ? { ...item, status: getNextTicketStatus(item.status), updatedAt: Date.now() }
              : item,
          ),
        })),
      advanceBusinessContentTaskStatus: (id) =>
        set(s => ({
          businessContentTasks: s.businessContentTasks.map(item =>
            item.id === id
              ? { ...item, status: getNextContentTaskStatus(item.status), updatedAt: Date.now() }
              : item,
          ),
        })),
      advanceBusinessChannelSessionStatus: (id) =>
        set(s => ({
          businessChannelSessions: s.businessChannelSessions.map(item =>
            item.id === id
              ? { ...item, status: getNextChannelSessionStatus(item.status), updatedAt: Date.now() }
              : item,
          ),
        })),
      setBusinessApprovalDecision: ({ entityType, entityId, status, note }) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          const entityTitle = getBusinessEntityTitle(s, entityType, entityId);
          const existing = s.businessApprovals.find(
            item => item.entityType === entityType && item.entityId === entityId,
          );
          const nextRecord: BusinessApprovalRecord = existing
            ? {
                ...existing,
                status,
                note: note?.trim() || existing.note,
                decidedAt: status === "pending" ? undefined : now,
                updatedAt: now,
              }
            : {
                id: `approval-${now}-${Math.random().toString(36).slice(2, 7)}`,
                entityType,
                entityId,
                status,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                requestedAt: now,
                decidedAt: status === "pending" ? undefined : now,
                note: note?.trim() || undefined,
              };

          return {
            businessApprovals: [
              nextRecord,
              ...s.businessApprovals.filter(item => item.id !== nextRecord.id),
            ].slice(0, 200),
            businessOperationLogs: capBusinessOperationLogs([
              {
                id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
                entityType,
                entityId,
                eventType: "approval",
                trigger: "manual",
                status,
                title: entityTitle,
                detail:
                  status === "approved"
                    ? "人工批准该业务对象进入自动执行链路。"
                    : status === "rejected"
                      ? "人工驳回该业务对象的自动执行请求。"
                      : "重新打开审批，等待人工进一步确认。",
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
              },
              ...s.businessOperationLogs,
            ]),
          };
        }),
      recordBusinessOperation: ({ entityType, entityId, eventType, trigger, status, title, detail, executionRunId, workflowRunId, externalRef, failureReason }) =>
        set(s => {
          const now = Date.now();
          const scope = resolveBusinessScope(s);
          return {
            businessContentTasks:
              entityType === "contentTask"
                ? s.businessContentTasks.map(task =>
                    task.id === entityId
                      ? {
                          ...task,
                          lastExecutionRunId: executionRunId ?? task.lastExecutionRunId,
                          lastWorkflowRunId: workflowRunId ?? task.lastWorkflowRunId,
                          lastOperationAt: now,
                          updatedAt: now,
                        }
                      : task,
                  )
                : s.businessContentTasks,
            businessOperationLogs: capBusinessOperationLogs([
              {
                id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
                entityType,
                entityId,
                eventType,
                trigger,
                status,
                title,
                detail,
                executionRunId,
                workflowRunId,
                externalRef,
                failureReason,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
              },
              ...s.businessOperationLogs,
            ]),
          };
        }),
      recordContentPublishResult: ({
        contentTaskId,
        status,
        title,
        detail,
        publishLinks,
        channel,
        accountLabel,
        externalId,
        publishedAt,
        summary,
        executionRunId,
        workflowRunId,
        externalRef,
        failureReason,
      }) => {
        const currentState = get();
        const shouldQueuePostmortem = status === "completed"
          && (currentState.businessContentTasks.find(task => task.id === contentTaskId)?.status !== "published")
          && !hasActiveContentPostmortemRun(currentState.workflowRuns, contentTaskId);

        set(s => {
          const now = Date.now();
          const contentTask = s.businessContentTasks.find(task => task.id === contentTaskId) ?? null;
          if (!contentTask) {
            return {};
          }

          const resolvedTitle = title?.trim() || contentTask.title;
          const resolvedTarget = contentTask.publishTargets.find(target =>
            target.channel === channel && (!accountLabel || target.accountLabel === accountLabel),
          ) ?? contentTask.publishTargets[0];
          const resolvedChannel = channel ?? resolvedTarget?.channel ?? contentTask.channel;
          const resolvedAccountLabel = accountLabel?.trim() || resolvedTarget?.accountLabel || "默认账号";
          const resolvedTargetLabel = `${resolvedChannel}:${resolvedAccountLabel}`;
          const resultTimestamp = publishedAt ?? now;
          const nextLinks = mergePublishedLinks(contentTask.publishedLinks, publishLinks, [
            externalId?.trim() ?? "",
            externalRef?.trim() ?? "",
          ]);
          const primaryLink = nextLinks[0];
          const nextPublishResult: BusinessContentPublishResult = {
            id: `publish-result-${resultTimestamp}-${Math.random().toString(36).slice(2, 7)}`,
            channel: resolvedChannel,
            accountLabel: resolvedAccountLabel,
            status,
            publishedAt: resultTimestamp,
            ...(primaryLink ? { link: primaryLink } : {}),
            ...(externalId?.trim() ? { externalId: externalId.trim() } : {}),
            ...(summary?.trim() ? { summary: summary.trim() } : {}),
            ...(executionRunId ? { executionRunId } : {}),
            ...(workflowRunId ? { workflowRunId } : {}),
            ...(failureReason ? { failureReason } : {}),
          };
          const nextPublishedResults = mergePublishedResults(contentTask.publishedResults, nextPublishResult);
          const channelStrategy = resolveContentChannelGovernance({
            channel: contentTask.channel,
            publishTargets: contentTask.publishTargets,
            publishedResults: nextPublishedResults,
          });

          return {
            businessContentTasks: s.businessContentTasks.map(task =>
              task.id === contentTaskId
                ? {
                    ...task,
                    status: status === "completed" ? "published" : task.status,
                    channel: channelStrategy.recommendedPrimaryChannel ?? task.channel,
                    publishedLinks: nextLinks,
                    publishedResults: nextPublishedResults,
                    ...channelStrategy,
                    lastExecutionRunId: executionRunId ?? task.lastExecutionRunId,
                    lastWorkflowRunId: workflowRunId ?? task.lastWorkflowRunId,
                    lastOperationAt: now,
                    updatedAt: now,
                  }
                : task,
            ),
            businessOperationLogs: capBusinessOperationLogs([
              {
                id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
                entityType: "contentTask",
                entityId: contentTaskId,
                eventType: "publish",
                trigger: "manual",
                status,
                title: resolvedTitle,
                detail,
                executionRunId,
                workflowRunId,
                externalRef: externalRef ?? resolvedTargetLabel,
                failureReason,
                projectId: contentTask.projectId,
                rootPath: contentTask.rootPath,
                createdAt: now,
                updatedAt: now,
              },
              ...s.businessOperationLogs,
            ]),
          };
        });

        if (shouldQueuePostmortem) {
          get().queueContentTaskWorkflowRun(contentTaskId);
        }

        const latestTask = get().businessContentTasks.find(task => task.id === contentTaskId) ?? null;
        if (status === "failed" && latestTask && getContentFailureStreak(latestTask) >= 2) {
          get().applyContentChannelGovernance({
            contentTaskId,
            strategy: "prioritize_primary",
            detail: "连续发布失败后已自动重排发布目标，并将高风险渠道后移。",
            trigger: "auto",
          });
          get().applyContentTaskGovernance({
            contentTaskId,
            recommendation: "rewrite",
            status: "review",
            detail: "连续发布失败后已自动回退到 review，建议先改写并重新确认内容后再外发。",
            trigger: "auto",
            queueWorkflow: !hasActiveContentWorkflowRun(get().workflowRuns, contentTaskId, "content-final-review"),
          });
        }
      },
      applyContentTaskGovernance: ({
        contentTaskId,
        recommendation,
        status,
        detail,
        trigger = "manual",
        queueWorkflow = false,
      }) => {
        const state = get();
        const task = state.businessContentTasks.find(item => item.id === contentTaskId) ?? null;
        if (!task) return;

        const now = Date.now();
        set(s => ({
          businessContentTasks: s.businessContentTasks.map(item =>
            item.id === contentTaskId
              ? {
                  ...item,
                  status: status ?? item.status,
                  nextCycleRecommendation: recommendation,
                  lastOperationAt: now,
                  updatedAt: now,
                }
              : item,
          ),
          businessOperationLogs: capBusinessOperationLogs([
            {
              id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
              entityType: "contentTask",
              entityId: contentTaskId,
              eventType: "governance",
              trigger,
              status: "blocked",
              title: task.title,
              detail,
              projectId: task.projectId,
              rootPath: task.rootPath,
              createdAt: now,
              updatedAt: now,
            },
            ...s.businessOperationLogs,
          ]),
        }));

        if (queueWorkflow) {
          get().queueContentTaskWorkflowRun(contentTaskId);
        }
      },
      continueContentTaskNextCycle: ({
        contentTaskId,
        trigger = "manual",
      }) => {
        const state = get();
        const task = state.businessContentTasks.find(item => item.id === contentTaskId) ?? null;
        if (!task) return null;

        const nextStatus = getNextCycleStatusFromRecommendation(task.nextCycleRecommendation);
        const nextTemplateId = getContentTaskWorkflowTemplateId(nextStatus);
        const activeRun = findActiveContentWorkflowRun(state.workflowRuns, contentTaskId, nextTemplateId);
        const channelGovernancePlan = buildContentChannelGovernancePlan(task);
        const nextChannel = channelGovernancePlan?.channel ?? task.channel;
        const nextPublishTargets = channelGovernancePlan?.publishTargets ?? task.publishTargets;
        const nextChannelStrategy = resolveContentChannelGovernance({
          channel: nextChannel,
          publishTargets: nextPublishTargets,
          publishedResults: task.publishedResults,
        });
        const now = Date.now();

        set(s => ({
          businessContentTasks: s.businessContentTasks.map(item =>
            item.id === contentTaskId
              ? {
                  ...item,
                  status: nextStatus,
                  channel: nextChannel,
                  publishTargets: nextPublishTargets,
                  ...nextChannelStrategy,
                  lastOperationAt: now,
                  updatedAt: now,
                }
              : item,
          ),
          businessOperationLogs: capBusinessOperationLogs([
            {
              id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
              entityType: "contentTask",
              entityId: contentTaskId,
              eventType: "governance",
              trigger,
              status: activeRun ? "approved" : "pending",
              title: task.title,
              detail: channelGovernancePlan
                ? `已按下一轮建议推进到 ${nextStatus}。${getNextCycleActionDetail(task.nextCycleRecommendation)} ${channelGovernancePlan.detail}。`
                : `已按下一轮建议推进到 ${nextStatus}。${getNextCycleActionDetail(task.nextCycleRecommendation)}`,
              projectId: task.projectId,
              rootPath: task.rootPath,
              createdAt: now,
              updatedAt: now,
            },
            ...s.businessOperationLogs,
          ]),
        }));

        if (activeRun) {
          return activeRun.id;
        }

        return get().queueContentTaskWorkflowRun(contentTaskId);
      },
      launchContentTaskNextCycle: ({
        contentTaskId,
        recommendation,
        detail,
        trigger = "manual",
      }) => {
        const task = get().businessContentTasks.find(item => item.id === contentTaskId) ?? null;
        if (!task) return null;

        if (recommendation && recommendation !== task.nextCycleRecommendation) {
          get().applyContentTaskGovernance({
            contentTaskId,
            recommendation,
            status: getNextCycleStatusFromRecommendation(recommendation),
            detail: detail ?? `已更新下一轮建议为 ${recommendation}。${getNextCycleActionDetail(recommendation)}`,
            trigger,
          });
        }

        return get().continueContentTaskNextCycle({ contentTaskId, trigger });
      },
      applyContentChannelGovernance: ({
        contentTaskId,
        strategy = "prioritize_primary",
        detail,
        trigger = "manual",
      }) => {
        const state = get();
        const task = state.businessContentTasks.find(item => item.id === contentTaskId) ?? null;
        if (!task) return;

        const recommendedPrimaryChannel = task.recommendedPrimaryChannel
          ?? task.channelGovernance.find(item => item.recommendation === "primary")?.channel
          ?? task.channel;
        const riskyChannels = new Set(task.riskyChannels);
        const prioritizedTargets = [...task.publishTargets].sort((left, right) => {
          const leftScore = (left.channel === recommendedPrimaryChannel ? 2 : 0) - (riskyChannels.has(left.channel) ? 1 : 0);
          const rightScore = (right.channel === recommendedPrimaryChannel ? 2 : 0) - (riskyChannels.has(right.channel) ? 1 : 0);
          return rightScore - leftScore;
        });
        const nextTargets = strategy === "drop_risky"
          ? prioritizedTargets.filter(target => !riskyChannels.has(target.channel))
          : prioritizedTargets;
        const fallbackTargets = nextTargets.length > 0 ? nextTargets : prioritizedTargets;
        const nextTask = {
          ...task,
          channel: recommendedPrimaryChannel,
          publishTargets: fallbackTargets,
        };
        const channelStrategy = resolveContentChannelGovernance(nextTask);
        const now = Date.now();

        set(s => ({
          businessContentTasks: s.businessContentTasks.map(item =>
            item.id === contentTaskId
              ? {
                  ...item,
                  ...nextTask,
                  ...channelStrategy,
                  lastOperationAt: now,
                  updatedAt: now,
                }
              : item,
          ),
          businessOperationLogs: capBusinessOperationLogs([
            {
              id: `biz-op-${now}-${Math.random().toString(36).slice(2, 7)}`,
              entityType: "contentTask",
              entityId: contentTaskId,
              eventType: "governance",
              trigger,
              status: "approved",
              title: task.title,
              detail: detail ?? (
                strategy === "drop_risky"
                  ? `已移除高风险渠道，并将主发渠道切换到 ${recommendedPrimaryChannel}。`
                  : `已将推荐主发渠道切换到 ${recommendedPrimaryChannel}，并把高风险渠道后移。`
              ),
              projectId: task.projectId,
              rootPath: task.rootPath,
              createdAt: now,
              updatedAt: now,
            },
            ...s.businessOperationLogs,
          ]),
        }));
      },
      seedBusinessEntitiesForProject: (scope) =>
        set(s => {
          const activeSession = s.chatSessions.find(session => session.id === s.activeSessionId) ?? null;
          const resolvedScope = {
            projectId: scope?.projectId ?? activeSession?.projectId ?? null,
            rootPath: scope?.rootPath ?? activeSession?.workspaceRoot ?? s.workspaceRoot,
          };
          const existingInScope =
            s.businessCustomers.some(item => matchProjectScope(item, resolvedScope)) ||
            s.businessLeads.some(item => matchProjectScope(item, resolvedScope)) ||
            s.businessTickets.some(item => matchProjectScope(item, resolvedScope)) ||
            s.businessContentTasks.some(item => matchProjectScope(item, resolvedScope)) ||
            s.businessChannelSessions.some(item => matchProjectScope(item, resolvedScope));

          if (existingInScope) return {};

          const demo = createDemoBusinessDataset(resolvedScope);
          return {
            businessCustomers: [...demo.customers, ...s.businessCustomers],
            businessLeads: [...demo.leads, ...s.businessLeads],
            businessTickets: [...demo.tickets, ...s.businessTickets],
            businessContentTasks: [...demo.contentTasks, ...s.businessContentTasks],
            businessChannelSessions: [...demo.channelSessions, ...s.businessChannelSessions],
          };
        }),
      clearBusinessEntitiesForProject: (scope) =>
        set(s => {
          const activeSession = s.chatSessions.find(session => session.id === s.activeSessionId) ?? null;
          const resolvedScope = {
            projectId: scope?.projectId ?? activeSession?.projectId ?? null,
            rootPath: scope?.rootPath ?? activeSession?.workspaceRoot ?? s.workspaceRoot,
          };
          return {
            businessApprovals: s.businessApprovals.filter(item => !matchProjectScope(item, resolvedScope)),
            businessOperationLogs: s.businessOperationLogs.filter(item => !matchProjectScope(item, resolvedScope)),
            businessCustomers: s.businessCustomers.filter(item => !matchProjectScope(item, resolvedScope)),
            businessLeads: s.businessLeads.filter(item => !matchProjectScope(item, resolvedScope)),
            businessTickets: s.businessTickets.filter(item => !matchProjectScope(item, resolvedScope)),
            businessContentTasks: s.businessContentTasks.filter(item => !matchProjectScope(item, resolvedScope)),
            businessChannelSessions: s.businessChannelSessions.filter(item => !matchProjectScope(item, resolvedScope)),
          };
        }),

      semanticKnowledgeDocs: [],
      createSemanticKnowledgeDoc: (payload) =>
        set(s => {
          const now = Date.now();
          const activeSession = s.chatSessions.find(session => session.id === s.activeSessionId) ?? null;
          const nextDoc: SemanticKnowledgeDocument = {
            id: `knowledge-${now}-${Math.random().toString(36).slice(2, 7)}`,
            projectId: activeSession?.projectId ?? null,
            rootPath: activeSession?.workspaceRoot ?? s.workspaceRoot,
            createdAt: now,
            updatedAt: now,
            title: payload.title.trim() || "未命名知识文档",
            content: payload.content.trim(),
            tags: payload.tags
              .map(tag => tag.trim())
              .filter(Boolean),
            sourceLabel: payload.sourceLabel.trim() || "手动录入",
          };

          return {
            semanticKnowledgeDocs: [
              nextDoc,
              ...s.semanticKnowledgeDocs.filter(item => item.id !== nextDoc.id),
            ].slice(0, 120),
          };
        }),
      updateSemanticKnowledgeDoc: (id, updates) =>
        set(s => ({
          semanticKnowledgeDocs: s.semanticKnowledgeDocs.map(item =>
            item.id === id
              ? {
                  ...item,
                  ...(updates.title !== undefined ? { title: updates.title.trim() || item.title } : {}),
                  ...(updates.content !== undefined ? { content: updates.content.trim() || item.content } : {}),
                  ...(updates.tags !== undefined
                    ? {
                        tags: updates.tags
                          .map(tag => tag.trim())
                          .filter(Boolean),
                      }
                    : {}),
                  ...(updates.sourceLabel !== undefined
                    ? { sourceLabel: updates.sourceLabel.trim() || item.sourceLabel }
                    : {}),
                  updatedAt: Date.now(),
                }
              : item,
          ),
        })),
      deleteSemanticKnowledgeDoc: (id) =>
        set(s => ({
          semanticKnowledgeDocs: s.semanticKnowledgeDocs.filter(item => item.id !== id),
        })),

      executionRuns: [],
      activeExecutionRunId: null,
      createExecutionRun: ({ id, sessionId, instruction, source = "chat", workflowRunId, entityType, entityId }) => {
        const timestamp = Date.now();
        const runId = id ?? `run-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const activeSession = useStore.getState().chatSessions.find(session => session.id === sessionId) ?? null;
        const nextRun: ExecutionRun = {
          id: runId,
          sessionId,
          projectId: activeSession?.projectId ?? null,
          instruction,
          source,
          workflowRunId,
          entityType,
          entityId,
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
          businessContentTasks:
            entityType === "contentTask" && entityId
              ? s.businessContentTasks.map(task =>
                  task.id === entityId
                    ? {
                        ...task,
                        lastExecutionRunId: runId,
                        lastWorkflowRunId: workflowRunId ?? task.lastWorkflowRunId,
                        lastOperationAt: timestamp,
                        updatedAt: timestamp,
                      }
                    : task,
                )
              : s.businessContentTasks,
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
        workflowRunId,
        entityType,
        entityId,
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
              workflowRunId,
              entityType,
              entityId,
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
            ...(workflowRunId === undefined ? {} : { workflowRunId }),
            ...(entityType === undefined ? {} : { entityType }),
            ...(entityId === undefined ? {} : { entityId }),
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
            businessContentTasks:
              nextRun.entityType === "contentTask" && nextRun.entityId
                ? s.businessContentTasks.map(task =>
                    task.id === nextRun.entityId
                      ? {
                          ...task,
                          lastExecutionRunId: id,
                          lastWorkflowRunId: nextRun.workflowRunId ?? task.lastWorkflowRunId,
                          lastOperationAt: updateTime,
                          updatedAt: updateTime,
                        }
                      : task,
                  )
                : s.businessContentTasks,
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
        activeTeamOperatingTemplateId: s.activeTeamOperatingTemplateId,
        semanticMemoryConfig: s.semanticMemoryConfig,
        desktopProgramSettings: s.desktopProgramSettings,
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
        businessApprovals: s.businessApprovals,
        businessOperationLogs: s.businessOperationLogs,
        businessCustomers: s.businessCustomers,
        businessLeads: s.businessLeads,
        businessTickets: s.businessTickets,
        businessContentTasks: s.businessContentTasks,
        businessChannelSessions: s.businessChannelSessions,
        semanticKnowledgeDocs: s.semanticKnowledgeDocs,
      }),
      merge: (persisted, current) => {
        const persistedStore = (persisted ?? {}) as Partial<Store>;
        const merged = { ...current, ...persistedStore } as Store;
        const agentConfigs = normalizeAgentConfigs(current.agentConfigs, persistedStore.agentConfigs);
        const agents = syncAgentsWithConfigs(current.agents, agentConfigs, persistedStore.agents);
        const semanticMemoryConfig = normalizeSemanticMemoryConfig(
          current.semanticMemoryConfig,
          persistedStore.semanticMemoryConfig,
        );
        const desktopProgramSettings = normalizeDesktopProgramSettings(
          current.desktopProgramSettings,
          persistedStore.desktopProgramSettings,
        );

        return ensureChatHydration({
          ...merged,
          agentConfigs,
          agents,
          semanticMemoryConfig,
          desktopProgramSettings,
          semanticKnowledgeDocs: Array.isArray(persistedStore.semanticKnowledgeDocs)
            ? persistedStore.semanticKnowledgeDocs
            : current.semanticKnowledgeDocs,
        }) as Store;
      },
    }
  )
);
