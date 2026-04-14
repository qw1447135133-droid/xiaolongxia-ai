import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentConfig,
  AgentId,
  AgentGovernance,
  AgentSkill,
  AgentState,
  AgentStatus,
  Activity,
  AssistantReasoningTrace,
  AppTab,
  AutomationMode,
  CostSummary,
  DesktopEvidenceRecord,
  DesktopInputSession,
  DesktopScreenshotState,
  DesktopProgramEntry,
  DesktopProgramSettings,
  HermesDispatchSettings,
  HermesPlannerProfile,
  DesktopRuntimeState,
  ExecutionAuditReceipt,
  ExecutionEvent,
  ExecutionRecoveryState,
  ExecutionRun,
  ExecutionRunSource,
  ExecutionRunStatus,
  VerificationStatus,
  VerificationStepResult,
  ModelProvider,
  UserProfile,
  UserProfileOnboardingState,
  PlatformConfig,
  AssistantFeedbackProfile,
  AssistantMessageFeedback,
  Task,
  ControlCenterSectionId,
  TeamOperatingTemplateId,
  UiLocale,
} from "./types";
import { AGENT_META, AGENT_SKILLS, PLATFORM_DEFINITIONS, createDefaultAgentGovernance } from "./types";
import type { ContextMentionRef } from "@/types/context-mentions";
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
  applyChannelSessionToCustomerProfile,
  buildCustomerIdentityFromSession,
  findCustomerByChannelSession,
  inferCustomerDisplayNameFromSession,
  normalizeBusinessCustomer,
  scoreCustomerCampaignFit,
} from "@/lib/customer-profile-schema";
import {
  buildContentChannelGovernancePlan,
  getProjectContentChannelSummaries,
  getProjectRiskyContentChannels,
  getNextCycleActionDetail,
  getNextCycleStatusFromRecommendation,
} from "@/lib/content-governance";
import {
  createEmptyUserProfile,
  createIdleUserProfileOnboarding,
  getUserProfileMissingFields,
  normalizeUserProfile,
} from "@/lib/user-profile";
import { getWorkflowTemplateById } from "@/lib/workflow-runtime";
import { buildProjectContext, getProjectScopeKey, matchProjectScope } from "@/lib/project-context";
import { derivePlatformProvisionState, getPlatformDefinition } from "@/lib/platform-connectors";
import { DEFAULT_ENABLED_PLUGIN_IDS, PLUGIN_PACKS } from "@/lib/plugin-runtime";
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
  WorkspaceProjectFact,
  WorkspaceProjectMemory,
  WorkspacePreview,
  WorkspaceReferenceBundle,
} from "@/types/desktop-workspace";
import type {
  SemanticKnowledgeDocument,
  SemanticMemoryConfig,
} from "@/types/semantic-memory";
import type { WorkflowContextSnapshot, WorkflowRun, WorkflowTemplate } from "@/types/workflows";

type UiTheme = "light" | "dark";

function sanitizeUiTheme(value: unknown, fallback: UiTheme = "light"): UiTheme {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "light" || raw === "dark") return raw;
  return fallback;
}

function migrateLegacyUiTheme(value: unknown): UiTheme {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "coral" || raw === "jade") return "dark";
  if (raw === "dark") return "light";
  return sanitizeUiTheme(raw, "light");
}

function applyUiTheme(theme: UiTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

interface AgentSlice {
  agents: Record<AgentId, AgentState>;
  setAgentStatus: (id: AgentId, status: AgentStatus, currentTask?: string) => void;
  addTokens: (id: AgentId, tokens: number) => void;
}

interface TaskSlice {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  appendTaskResult: (id: string, delta: string) => void;
  truncateTasksAfter: (id: string) => void;
  clearTasks: () => void;
}

interface AssistantReasoningSlice {
  assistantReasoning: Record<string, AssistantReasoningTrace>;
  upsertAssistantReasoning: (payload: {
    taskId: string;
    sessionId: string;
    agentId: AgentId;
    executionRunId?: string;
    summary?: string;
    detail?: string;
    status?: AssistantReasoningTrace["status"];
    updatedAt?: number;
  }) => void;
  clearAssistantReasoning: (taskId: string) => void;
}

interface AssistantFeedbackSlice {
  assistantFeedbackProfile: AssistantFeedbackProfile;
  rateAssistantTask: (payload: {
    taskId: string;
    feedback: AssistantMessageFeedback;
    sessionId?: string;
  }) => void;
}

interface ChatSlice {
  chatSessions: ChatSession[];
  activeSessionId: string;
  createChatSession: (projectRoot?: string | null) => void;
  openChannelSessionChat: (channelSessionId: string) => void;
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

interface TaskSearchBridgeSlice {
  pendingTaskSearchQuery: string;
  pendingTaskSearchSessionId: string | null;
  seedTaskSearch: (sessionId: string, query: string) => void;
  clearTaskSearchSeed: () => void;
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
  id: string;
  topic: string;
  summary: string;
  speeches: MeetingSpeech[];
  finishedAt: number;
  sessionId?: string | null;
  projectId?: string | null;
  rootPath?: string | null;
}

interface MeetingSlice {
  meetingSpeeches: MeetingSpeech[];
  meetingActive: boolean;
  meetingTopic: string;
  meetingContextMentions: ContextMentionRef[];
  latestMeetingRecord: MeetingRecord | null;
  meetingHistory: MeetingRecord[];
  addMeetingSpeech: (s: MeetingSpeech) => void;
  clearMeeting: () => void;
  setMeetingActive: (v: boolean) => void;
  setMeetingTopic: (topic: string) => void;
  setMeetingContextMentions: (mentions: ContextMentionRef[]) => void;
  finalizeMeeting: (payload: {
    topic: string;
    summary: string;
    finishedAt?: number;
    sessionId?: string | null;
    projectId?: string | null;
    rootPath?: string | null;
  }) => void;
}

interface SettingsSlice {
  providers: ModelProvider[];
  agentConfigs: Record<AgentId, AgentConfig>;
  runtimeAgentSkills: AgentSkill[];
  platformConfigs: Record<string, PlatformConfig>;
  enabledPluginIds: string[];
  userNickname: string;
  userProfile: UserProfile;
  userProfileOnboarding: UserProfileOnboardingState;
  activeTeamOperatingTemplateId: TeamOperatingTemplateId | null;
  semanticMemoryConfig: SemanticMemoryConfig;
  desktopProgramSettings: DesktopProgramSettings;
  hermesDispatchSettings: HermesDispatchSettings;
  addProvider: (p: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  setRuntimeAgentSkills: (skills: AgentSkill[]) => void;
  updateAgentConfig: (id: AgentId, updates: Partial<AgentConfig>) => void;
  updatePlatformConfig: (id: string, updates: Partial<PlatformConfig>) => void;
  updatePlatformField: (platformId: string, fieldKey: string, value: string) => void;
  reconcilePlatformConfig: (platformId: string) => void;
  togglePlugin: (id: string) => void;
  applyPluginPack: (id: string) => void;
  setUserNickname: (nickname: string) => void;
  setUserProfile: (updates: Partial<UserProfile>) => void;
  resetUserProfile: () => void;
  setUserProfileOnboarding: (updates: Partial<UserProfileOnboardingState>) => void;
  startUserProfileOnboarding: (sessionId: string, resetProfile?: boolean) => void;
  setActiveTeamOperatingTemplate: (id: TeamOperatingTemplateId | null) => void;
  updateSemanticMemoryConfig: (updates: Partial<SemanticMemoryConfig>) => void;
  updateSemanticMemoryPgvectorConfig: (updates: Partial<SemanticMemoryConfig["pgvector"]>) => void;
  resetSemanticMemory: () => void;
  updateDesktopProgramSettings: (updates: Partial<DesktopProgramSettings>) => void;
  replaceHermesDispatchSettings: (updates: Partial<HermesDispatchSettings>) => void;
  setHermesDispatchActivePlannerProfile: (id: string) => void;
  updateHermesDispatchPlannerProfile: (id: string, updates: Partial<Omit<HermesPlannerProfile, "id">>) => void;
  saveDesktopFavorite: (payload: Pick<DesktopProgramEntry, "label" | "target" | "args" | "cwd" | "notes" | "source">) => void;
  removeDesktopFavorite: (id: string) => void;
  saveDesktopWhitelistEntry: (payload: Pick<DesktopProgramEntry, "label" | "target" | "args" | "cwd" | "notes" | "source">) => void;
  removeDesktopWhitelistEntry: (id: string) => void;
}

interface UISlice {
  theme: UiTheme;
  locale: UiLocale;
  leftOpen: boolean;
  rightOpen: boolean;
  activeTab: AppTab;
  activeControlCenterSectionId: ControlCenterSectionId;
  focusedBusinessContentTaskId: string | null;
  focusedWorkflowRunId: string | null;
  setTheme: (t: UISlice["theme"]) => void;
  setLocale: (locale: UiLocale) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setTab: (t: AppTab) => void;
  setActiveControlCenterSection: (section: ControlCenterSectionId) => void;
  focusBusinessContentTask: (id: string | null) => void;
  focusWorkflowRun: (id: string | null) => void;
}

interface ConnectionSlice {
  wsStatus: "connecting" | "connected" | "disconnected";
  desktopRuntime: DesktopRuntimeState;
  desktopInputSession: DesktopInputSession;
  desktopScreenshot: DesktopScreenshotState;
  desktopEvidenceLog: DesktopEvidenceRecord[];
  channelActionResult: {
    requestId: string;
    sessionId?: string;
    ok: boolean;
    message: string;
    failureReason?: string;
    at: number;
  } | null;
  setWsStatus: (s: ConnectionSlice["wsStatus"]) => void;
  setDesktopRuntime: (runtime: Partial<DesktopRuntimeState>) => void;
  setDesktopInputSession: (session: Partial<DesktopInputSession>) => void;
  clearDesktopInputSession: () => void;
  setDesktopScreenshot: (screenshot: Partial<DesktopScreenshotState>) => void;
  clearDesktopScreenshot: () => void;
  appendDesktopEvidence: (
    evidence: Omit<DesktopEvidenceRecord, "id" | "createdAt"> & Partial<Pick<DesktopEvidenceRecord, "id" | "createdAt">>,
  ) => void;
  clearDesktopEvidenceLog: () => void;
  setChannelActionResult: (result: ConnectionSlice["channelActionResult"]) => void;
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
  commandContextMentions: ContextMentionRef[];
  setDispatching: (v: boolean) => void;
  setLastInstruction: (v: string) => void;
  setCommandDraft: (value: string) => void;
  setCommandContextMentions: (mentions: ContextMentionRef[]) => void;
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
  updateBusinessCustomer: (id: string, updates: Partial<Omit<BusinessCustomer, "id" | "projectId" | "rootPath" | "createdAt">>) => void;
  upsertBusinessCustomerFromChannelSession: (channelSessionId: string) => string | null;
  assessBusinessCustomerCampaignFit: (payload: { customerId: string; campaignBrief: string }) => BusinessCustomer["lastCampaignAssessment"] | null;
  createBusinessLead: (payload: Pick<BusinessLead, "title" | "customerId" | "source" | "stage" | "score" | "nextAction">) => void;
  createBusinessTicket: (payload: Pick<BusinessTicket, "subject" | "customerId" | "channelSessionId" | "status" | "priority" | "summary">) => void;
  createBusinessContentTask: (
    payload: Pick<
      BusinessContentTask,
      "title" | "customerId" | "leadId" | "channel" | "format" | "goal" | "publishTargets" | "status" | "priority" | "brief" | "scheduledFor"
    >,
  ) => void;
  updateBusinessContentTask: (id: string, updates: Partial<Omit<BusinessContentTask, "id" | "projectId" | "rootPath" | "createdAt">>) => void;
  createBusinessChannelSession: (
    payload: Pick<BusinessChannelSession, "title" | "customerId" | "channel" | "externalRef" | "status" | "summary">
      & Partial<Omit<BusinessChannelSession, "id" | "projectId" | "rootPath" | "createdAt" | "updatedAt" | "title" | "customerId" | "channel" | "externalRef" | "status" | "summary">>,
  ) => void;
  upsertBusinessChannelSession: (
    payload: Pick<BusinessChannelSession, "channel" | "externalRef">
      & Partial<Omit<BusinessChannelSession, "createdAt" | "updatedAt">>,
  ) => string;
  updateBusinessChannelSession: (id: string, updates: Partial<Omit<BusinessChannelSession, "id" | "projectId" | "rootPath" | "createdAt">>) => void;
  markBusinessChannelSessionHandled: (payload: {
    channelSessionId: string;
    trigger?: BusinessOperationRecord["trigger"];
    detail?: string;
    handledBy?: BusinessChannelSession["handledBy"];
  }) => void;
  setBusinessLeadStage: (payload: {
    id: string;
    stage: BusinessLead["stage"];
    trigger?: BusinessOperationRecord["trigger"];
    detail?: string;
  }) => void;
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
  applyContentTaskApprovalDecision: (payload: {
    contentTaskId: string;
    decision: BusinessApprovalRecord["status"];
  }) => {
    title: string;
    note: string;
    detail: string;
    nextStatus: BusinessContentTask["status"];
    queuedWorkflowRunId: string | null;
    archivedWorkflowRunIds: string[];
  } | null;
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
  enforceManualApprovalForContentTasks: (payload: {
    contentTaskIds: string[];
    detail: string;
    trigger?: BusinessOperationRecord["trigger"];
  }) => number;
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
  upsertSemanticKnowledgeDoc: (
    payload: Omit<SemanticKnowledgeDocument, "createdAt" | "updatedAt"> & Partial<Pick<SemanticKnowledgeDocument, "createdAt" | "updatedAt">>,
  ) => string;
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
    retryOfRunId?: string;
    lastRecoveryHint?: string;
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
    retryCount?: number;
    retryOfRunId?: string;
    lastFailureReason?: string;
    recoveryState?: ExecutionRecoveryState;
    lastRecoveryHint?: string;
    contextReceipt?: ExecutionAuditReceipt;
    event?: ExecutionEvent;
  }) => void;
  failExecutionRun: (runId: string, detail: string, options?: {
    recoveryState?: Exclude<ExecutionRecoveryState, "none">;
    lastRecoveryHint?: string;
  }) => void;
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
  recordWorkspaceProjectFacts: (payload: {
    projectId?: string | null;
    rootPath?: string | null;
    executionRunId?: string;
    sourceLabel?: string;
    facts: WorkspaceProjectFact[];
  }) => void;
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
  & AssistantReasoningSlice
  & AssistantFeedbackSlice
  & ChatSlice
  & ActivitySlice
  & TaskNavigationSlice
  & TaskSearchBridgeSlice
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
  const allSkillIds = AGENT_SKILLS.map(skill => skill.id);
  const result = {} as Record<AgentId, AgentConfig>;
  for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
    result[id] = {
      id,
      name: meta.name,
      emoji: meta.emoji,
      personality: meta.defaultPersonality,
      model: "",
      providerId: "",
      skills: allSkillIds,
      governance: createDefaultAgentGovernance(id),
    };
  }
  return result;
}

const LEGACY_AGENT_NAMES: Record<AgentId, string[]> = {
  orchestrator: ["虾总管", "蝦總管", "Orchestrator Lobster", "統括ロブスター"],
  explorer: ["探海龙虾", "探海龍蝦", "Explorer Lobster", "探索ロブスター"],
  writer: ["执笔龙虾", "執筆龍蝦", "Writer Lobster", "執筆ロブスター"],
  designer: ["幻影龙虾", "幻影龍蝦", "Designer Lobster", "デザイナーロブスター"],
  performer: ["戏精龙虾", "戲精龍蝦", "Performer Lobster", "パフォーマーロブスター"],
  greeter: ["迎客龙虾", "迎客龍蝦", "Greeter Lobster", "接客ロブスター"],
};

const LEGACY_AGENT_EMOJIS: Record<AgentId, string[]> = {
  orchestrator: ["🦞"],
  explorer: ["🔎"],
  writer: ["✍️"],
  designer: ["🎨"],
  performer: ["🎭", "🎬"],
  greeter: ["💬"],
};

const LEGACY_AGENT_PERSONALITIES: Record<AgentId, string[]> = {
  orchestrator: ["你是跨境电商 AI 团队的总调度员，负责任务拆解和团队协调。"],
  explorer: ["你是跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析，提供具体可执行的洞察。"],
  writer: ["你是跨境电商文案专家，专注多语种文案创作、SEO 标题优化和商品详情页撰写，输出高转化率文案。"],
  designer: ["你是电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出设计方案说明。"],
  performer: ["你是短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。"],
  greeter: ["你是多语种客服专家，专注客服话术、评论回复模板和买家互动策略，保持友好专业语气。"],
};

function shouldMigrateLegacyAgentName(agentId: AgentId, value?: string) {
  if (!value) return false;
  return LEGACY_AGENT_NAMES[agentId]?.includes(value.trim()) ?? false;
}

function shouldMigrateLegacyAgentEmoji(agentId: AgentId, value?: string) {
  if (!value) return false;
  return LEGACY_AGENT_EMOJIS[agentId]?.includes(value.trim()) ?? false;
}

function shouldMigrateLegacyAgentPersonality(agentId: AgentId, value?: string) {
  if (!value) return false;
  return LEGACY_AGENT_PERSONALITIES[agentId]?.includes(value.trim()) ?? false;
}

function normalizeAgentGovernanceList(values: unknown, fallback: string[] = []) {
  const source = Array.isArray(values) ? values : fallback;
  return Array.from(
    new Set(
      source
        .map(value => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeAgentGovernance(
  agentId: AgentId,
  currentGovernance?: Partial<AgentGovernance>,
  persistedGovernance?: Partial<AgentGovernance>,
): AgentGovernance {
  const fallback = {
    ...createDefaultAgentGovernance(agentId),
    ...(currentGovernance ?? {}),
  };
  const incoming = persistedGovernance ?? {};

  return {
    toolAccess:
      incoming.toolAccess === "standard"
      || incoming.toolAccess === "meeting_only"
      || incoming.toolAccess === "no_desktop"
      || incoming.toolAccess === "full"
        ? incoming.toolAccess
        : fallback.toolAccess,
    memoryWriteScope:
      incoming.memoryWriteScope === "none"
      || incoming.memoryWriteScope === "execution_events"
      || incoming.memoryWriteScope === "project_memory"
        ? incoming.memoryWriteScope
        : fallback.memoryWriteScope,
    escalationMode:
      incoming.escalationMode === "auto" || incoming.escalationMode === "manual_first"
        ? incoming.escalationMode
        : fallback.escalationMode,
    responseStyle:
      incoming.responseStyle === "neutral"
      || incoming.responseStyle === "assertive"
      || incoming.responseStyle === "combative"
        ? incoming.responseStyle
        : fallback.responseStyle,
    meetingRoleMode:
      incoming.meetingRoleMode === "participant" || incoming.meetingRoleMode === "judge"
        ? incoming.meetingRoleMode
        : fallback.meetingRoleMode,
    forbiddenTopics: normalizeAgentGovernanceList(incoming.forbiddenTopics, fallback.forbiddenTopics),
    stopConditions: normalizeAgentGovernanceList(incoming.stopConditions, fallback.stopConditions),
  };
}

function normalizeAgentConfigs(
  currentConfigs: Record<AgentId, AgentConfig>,
  persistedConfigs?: Partial<Record<AgentId, Partial<AgentConfig>>>
): Record<AgentId, AgentConfig> {
  const allSkillIds = AGENT_SKILLS.map(skill => skill.id);
  return Object.fromEntries(
    (Object.keys(AGENT_META) as AgentId[]).map(id => {
      const fallback = currentConfigs[id];
      const persisted = persistedConfigs?.[id];
      return [
        id,
          {
            ...fallback,
            ...persisted,
            name: shouldMigrateLegacyAgentName(id, persisted?.name) ? fallback.name : (persisted?.name ?? fallback.name),
            emoji: shouldMigrateLegacyAgentEmoji(id, persisted?.emoji) ? fallback.emoji : (persisted?.emoji ?? fallback.emoji),
            personality: shouldMigrateLegacyAgentPersonality(id, persisted?.personality) ? fallback.personality : (persisted?.personality ?? fallback.personality),
            skills: Array.from(new Set([
              ...allSkillIds,
              ...(Array.isArray(persisted?.skills) ? persisted.skills : fallback.skills),
            ])),
            governance: normalizeAgentGovernance(id, fallback.governance, persisted?.governance),
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

function buildDefaultHermesSessionStateFile(profileId: string): string {
  const normalizedId = profileId.trim() || "default";
  return `output/hermes-dispatch/planner-sessions/${normalizedId}.json`;
}

function normalizeHermesSessionStateFile(profileId: string, value: unknown): string {
  const fallback = buildDefaultHermesSessionStateFile(profileId);
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const normalized = trimmed.replace(/\\/g, "/");
  if (
    normalized.startsWith("/")
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized.includes("../")
    || !normalized.startsWith("output/hermes-dispatch/")
    || normalized === "output/hermes-dispatch/"
  ) {
    return fallback;
  }

  return normalized;
}

function normalizeHermesPlannerProfiles(profiles: unknown): HermesPlannerProfile[] {
  if (!Array.isArray(profiles)) return [];

  return profiles
    .map((profile) => {
      const item = profile as Partial<HermesPlannerProfile>;
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const label = typeof item?.label === "string" ? item.label.trim() : "";
      const sessionStateFile = normalizeHermesSessionStateFile(id, item?.sessionStateFile);
      if (!id || !label || !sessionStateFile) return null;
      const normalizedModels = item?.models && typeof item.models === "object"
        ? Object.fromEntries(
            Object.entries(item.models)
              .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
              .filter(([, value]) => Boolean(value)),
          )
        : null;

      return {
        id,
        label,
        sessionStateFile,
        ...(typeof item?.description === "string" && item.description.trim()
          ? { description: item.description.trim() }
          : {}),
        ...(normalizedModels && Object.keys(normalizedModels).length > 0
          ? { models: normalizedModels as HermesPlannerProfile["models"] }
          : {}),
      } satisfies HermesPlannerProfile;
    })
    .filter((item): item is HermesPlannerProfile => Boolean(item))
    .filter((item, index, list) => list.findIndex(candidate => candidate.id === item.id) === index)
    .slice(0, 6);
}

function normalizeHermesDispatchSettings(
  currentSettings: HermesDispatchSettings,
  persistedSettings?: Partial<HermesDispatchSettings>,
): HermesDispatchSettings {
  const normalizedProfiles = normalizeHermesPlannerProfiles(
    persistedSettings?.plannerProfiles ?? currentSettings.plannerProfiles,
  );
  const plannerProfiles = normalizedProfiles.length > 0 ? normalizedProfiles : currentSettings.plannerProfiles;
  const activePlannerProfileId = plannerProfiles.some(
    profile => profile.id === persistedSettings?.activePlannerProfileId,
  )
    ? String(persistedSettings?.activePlannerProfileId)
    : plannerProfiles[0].id;

  return {
    activePlannerProfileId,
    plannerProfiles,
  };
}

const seedSession = makeEmptySession();
const MAX_EXECUTION_RUNS = 24;
const MAX_EXECUTION_EVENTS = 40;
const MAX_DESKTOP_EVIDENCE_RECORDS = 24;
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
    autoOpenPanelOnAction: false,
    requireManualTakeoverForVerification: true,
  },
};

const DEFAULT_ASSISTANT_FEEDBACK_PROFILE: AssistantFeedbackProfile = {
  liked: [],
  disliked: [],
  updatedAt: null,
};

function capAssistantFeedbackRecords(records: AssistantFeedbackProfile["liked"]) {
  return records.slice(0, 8);
}

function normalizeAssistantFeedbackProfile(
  profile: Partial<AssistantFeedbackProfile> | undefined,
): AssistantFeedbackProfile {
  return {
    liked: Array.isArray(profile?.liked) ? capAssistantFeedbackRecords(profile.liked) : [],
    disliked: Array.isArray(profile?.disliked) ? capAssistantFeedbackRecords(profile.disliked) : [],
    updatedAt: typeof profile?.updatedAt === "number" ? profile.updatedAt : null,
  };
}

function buildAssistantFeedbackExcerpt(task: Task) {
  const raw = (task.result ?? task.description ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "未记录具体片段";
  return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
}

const DEFAULT_HERMES_DISPATCH_SETTINGS: HermesDispatchSettings = {
  activePlannerProfileId: "default",
  plannerProfiles: [
    {
      id: "default",
      label: "Default Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/default.json",
      description: "Default Hermes planner conversation.",
      models: {},
    },
    {
      id: "research",
      label: "Research Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/research.json",
      description: "Separate planner context for research and discovery.",
      models: {},
    },
    {
      id: "scratch",
      label: "Scratch Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/scratch.json",
      description: "Temporary planner context for experiments and dry runs.",
      models: {},
    },
  ],
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

function normalizeDesktopEvidenceLog(entries: unknown): DesktopEvidenceRecord[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) => {
      const item = entry as Partial<DesktopEvidenceRecord>;
      const kind = item?.kind;
      const status = item?.status;
      const source = item?.source;
      const summary = typeof item?.summary === "string" ? item.summary.trim() : "";
      const createdAt = typeof item?.createdAt === "number" ? item.createdAt : Date.now() - index;

      if (
        !summary
        || (kind !== "input" && kind !== "screenshot" && kind !== "takeover" && kind !== "resume")
        || (status !== "completed" && status !== "failed" && status !== "blocked" && status !== "info")
        || (source !== "agent" && source !== "manual")
      ) {
        return null;
      }

      return {
        id: typeof item?.id === "string" && item.id.trim()
          ? item.id
          : `desktop-evidence-${createdAt}-${index}`,
        kind,
        status,
        source,
        summary,
        createdAt,
        ...(typeof item?.action === "string" && item.action.trim() ? { action: item.action.trim() } : {}),
        ...(typeof item?.intent === "string" && item.intent.trim() ? { intent: item.intent.trim() } : {}),
        ...(typeof item?.target === "string" && item.target.trim() ? { target: item.target.trim() } : {}),
        ...(typeof item?.sessionId === "string" && item.sessionId.trim() ? { sessionId: item.sessionId.trim() } : {}),
        ...(typeof item?.executionRunId === "string" && item.executionRunId.trim() ? { executionRunId: item.executionRunId.trim() } : {}),
        ...(typeof item?.taskId === "string" && item.taskId.trim() ? { taskId: item.taskId.trim() } : {}),
        ...(typeof item?.failureReason === "string" && item.failureReason.trim() ? { failureReason: item.failureReason.trim() } : {}),
        ...(item?.retryStrategy === "visual-recheck-offset" ? { retryStrategy: item.retryStrategy } : {}),
        ...(Array.isArray(item?.retrySuggestions) ? { retrySuggestions: item.retrySuggestions } : {}),
        ...(typeof item?.imageCaptured === "boolean" ? { imageCaptured: item.imageCaptured } : {}),
        ...(typeof item?.width === "number" ? { width: item.width } : {}),
        ...(typeof item?.height === "number" ? { height: item.height } : {}),
        ...(item?.format === "png" || item?.format === "jpeg" ? { format: item.format } : {}),
        ...(item?.takeoverBy === "agent" || item?.takeoverBy === "manual" ? { takeoverBy: item.takeoverBy } : {}),
        ...(typeof item?.takeoverReason === "string" && item.takeoverReason.trim() ? { takeoverReason: item.takeoverReason.trim() } : {}),
        ...(typeof item?.resumeInstruction === "string" && item.resumeInstruction.trim() ? { resumeInstruction: item.resumeInstruction.trim() } : {}),
        ...(typeof item?.resumeFrom === "string" && item.resumeFrom.trim() ? { resumeFrom: item.resumeFrom.trim() } : {}),
      } satisfies DesktopEvidenceRecord;
    })
    .filter((item): item is DesktopEvidenceRecord => Boolean(item))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_DESKTOP_EVIDENCE_RECORDS);
}

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

function removeAssistantReasoningByTaskIds(
  reasoning: Record<string, AssistantReasoningTrace>,
  taskIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(reasoning).filter(([taskId]) => !taskIds.has(taskId)),
  );
}

function removeAssistantReasoningBySessionId(
  reasoning: Record<string, AssistantReasoningTrace>,
  sessionId: string,
) {
  return Object.fromEntries(
    Object.entries(reasoning).filter(([, trace]) => trace.sessionId !== sessionId),
  );
}

function deriveExecutionRecoveryState(params: {
  status: ExecutionRunStatus;
  explicitRecoveryState?: ExecutionRecoveryState;
  currentRecoveryState?: ExecutionRecoveryState;
}) {
  const { status, explicitRecoveryState, currentRecoveryState } = params;
  if (explicitRecoveryState) return explicitRecoveryState;
  if (status === "completed") return "none";
  if (status === "failed") return currentRecoveryState === "blocked" ? "blocked" : "retryable";
  return currentRecoveryState ?? "none";
}

function capWorkspaceProjectMemories(memories: WorkspaceProjectMemory[]): WorkspaceProjectMemory[] {
  return [...memories]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_WORKSPACE_PROJECT_MEMORIES);
}

function capWorkspaceProjectFacts(facts: WorkspaceProjectFact[]) {
  return [...facts]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 40);
}

function upsertWorkspaceProjectFacts(
  currentFacts: WorkspaceProjectFact[] | undefined,
  nextFacts: WorkspaceProjectFact[],
) {
  const existing = Array.isArray(currentFacts) ? currentFacts : [];
  const merged = [...existing];

  for (const fact of nextFacts) {
    const index = merged.findIndex(item => item.key === fact.key);
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...fact,
        id: merged[index].id || fact.id,
        createdAt: merged[index].createdAt,
        updatedAt: fact.updatedAt,
        sourceIds: Array.from(new Set([...(merged[index].sourceIds ?? []), ...(fact.sourceIds ?? [])])),
      };
    } else {
      merged.push(fact);
    }
  }

  return capWorkspaceProjectFacts(merged);
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
  state: Pick<Store, "workspacePinnedPreviews" | "workspaceDeskNotes" | "workspaceSavedBundles" | "enabledPluginIds" | "businessContentTasks">,
  task: BusinessContentTask,
): WorkflowContextSnapshot {
  const scopedTasks = state.businessContentTasks.filter(item => matchProjectScope(item, task));
  const projectRiskyChannels = getProjectRiskyContentChannels(scopedTasks);
  const projectChannelBoard = getProjectContentChannelSummaries(scopedTasks);
  const preferredContentChannel = task.recommendedPrimaryChannel
    ?? projectChannelBoard[0]?.channel
    ?? task.channel;
  const taskNeedsManualApproval = task.status === "review"
    || task.status === "scheduled"
    || task.publishTargets.some(target => projectRiskyChannels.includes(target.channel));

  return {
    deskRefs: state.workspacePinnedPreviews.length,
    deskNotes: state.workspaceDeskNotes.filter(note => matchProjectScope(note, task)).length,
    contextPacks: state.workspaceSavedBundles.filter(bundle => matchProjectScope(bundle, task)).length,
    plugins: state.enabledPluginIds.length,
    preferredContentChannel,
    riskyContentChannels: projectRiskyChannels,
    manualApprovalRequired: taskNeedsManualApproval,
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
    `Recommended Channel: ${context.preferredContentChannel ?? task.recommendedPrimaryChannel ?? task.channel}`,
    `Project Risky Channels: ${context.riskyContentChannels?.join(", ") || "none"}`,
    `Manual Approval Before Publish: ${context.manualApprovalRequired ? "required" : "not required"}`,
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

function buildContentTaskApprovalOutcome(
  task: BusinessContentTask,
  decision: BusinessApprovalRecord["status"],
) {
  if (decision === "approved") {
    if (task.status === "review") {
      return {
        title: "审批已批准并继续发布准备",
        note: "审批已批准并继续发布准备，系统已把内容任务推进到 scheduled。",
        detail: "系统已保留批准记录，把内容任务推进到 scheduled，并自动排队发布准备 workflow。",
        nextStatus: "scheduled" as const,
        queuePublishPrepWorkflow: true,
        archivePublishPrepWorkflows: false,
      };
    }

    if (task.status === "scheduled") {
      return {
        title: "审批已批准并继续发布准备",
        note: "审批已批准并继续发布准备，系统将继续排队发布准备 workflow。",
        detail: "系统已保留批准记录，并为这条内容任务继续排队发布准备 workflow。",
        nextStatus: task.status,
        queuePublishPrepWorkflow: true,
        archivePublishPrepWorkflows: false,
      };
    }

    return {
      title: "审批已批准",
      note: "审批已批准，这条业务对象已进入可自动推进状态。",
      detail: "这条业务对象已进入可自动推进状态，审计区会保留这次批准记录。",
      nextStatus: task.status,
      queuePublishPrepWorkflow: false,
      archivePublishPrepWorkflows: false,
    };
  }

  if (decision === "rejected") {
    if (task.status === "scheduled") {
      return {
        title: "已驳回并退回定稿",
        note: "审批已驳回并退回定稿，建议重新确认内容和渠道策略。",
        detail: "系统已把这条内容任务退回 review，方便继续打磨定稿后再次进入发布链路。",
        nextStatus: "review" as const,
        queuePublishPrepWorkflow: false,
        archivePublishPrepWorkflows: true,
      };
    }

    return {
      title: "审批已驳回",
      note: "审批已驳回，建议继续打磨后重新提交。",
      detail: "这次驳回会保留在审计记录里，后续可以回到业务实体面板继续调整。",
      nextStatus: task.status,
      queuePublishPrepWorkflow: false,
      archivePublishPrepWorkflows: true,
    };
  }

  return {
    title: "审批已重新打开",
    note: "审批已重新打开，当前流程恢复为待人工确认状态。",
    detail: "系统已恢复待确认状态，审计记录会显示这次重新打开动作。",
    nextStatus: task.status,
    queuePublishPrepWorkflow: false,
    archivePublishPrepWorkflows: true,
  };
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
  overrides?: Partial<Pick<Store, "chatSessions" | "activeSessionId" | "assistantReasoning">>,
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
      appendTaskResult: (id, delta) =>
        set(s => {
          if (!delta) return {};
          const nextTasks = s.tasks.map(task =>
            task.id === id
              ? { ...task, result: `${task.result ?? ""}${delta}` }
              : task,
          );
          const sid = s.activeSessionId;
          const sessions = s.chatSessions
            .map(sess => (sess.id === sid ? { ...sess, tasks: nextTasks, updatedAt: Date.now() } : sess));
          return { tasks: nextTasks, chatSessions: sortChatSessions(sessions) };
        }),
      truncateTasksAfter: (id) =>
        set(s => {
          const targetIndex = s.tasks.findIndex(task => task.id === id);
          if (targetIndex === -1) return {};

          const nextTasks = s.tasks.slice(targetIndex);
          const removedTaskIds = new Set(
            s.tasks
              .slice(0, targetIndex)
              .map(task => task.id),
          );
          const sid = s.activeSessionId;
          const sessions = s.chatSessions
            .map(sess => (sess.id === sid ? { ...sess, tasks: nextTasks, updatedAt: Date.now() } : sess));

          return {
            tasks: nextTasks,
            chatSessions: sortChatSessions(sessions),
            assistantReasoning: removeAssistantReasoningByTaskIds(s.assistantReasoning, removedTaskIds),
          };
        }),
      clearTasks: () =>
        set(s => ({
          tasks: [],
          assistantReasoning: removeAssistantReasoningBySessionId(s.assistantReasoning, s.activeSessionId),
          chatSessions: s.chatSessions.map(sess =>
            sess.id === s.activeSessionId
              ? { ...sess, tasks: [], updatedAt: Date.now(), title: DEFAULT_CHAT_TITLE }
              : sess
          ),
        })),

      assistantReasoning: {},
      upsertAssistantReasoning: ({ taskId, sessionId, agentId, executionRunId, summary, detail, status = "running", updatedAt }) =>
        set(s => {
          const current = s.assistantReasoning[taskId];
          const nextDetails = detail
            ? [...(current?.details ?? []), detail].filter((item, index, list) => list.indexOf(item) === index).slice(-8)
            : (current?.details ?? []);

          return {
            assistantReasoning: {
              ...s.assistantReasoning,
              [taskId]: {
                taskId,
                sessionId,
                agentId,
                executionRunId: executionRunId ?? current?.executionRunId,
                summary: summary ?? current?.summary ?? "",
                details: nextDetails,
                status,
                updatedAt: updatedAt ?? Date.now(),
              },
            },
          };
        }),
      clearAssistantReasoning: (taskId) =>
        set(s => {
          if (!s.assistantReasoning[taskId]) return {};
          const nextReasoning = { ...s.assistantReasoning };
          delete nextReasoning[taskId];
          return { assistantReasoning: nextReasoning };
        }),

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
      openChannelSessionChat: (channelSessionId) =>
        set(s => {
          const linkedChannelSession = s.businessChannelSessions.find(item => item.id === channelSessionId) ?? null;
          if (!linkedChannelSession) return {};

          const resolvedRoot = linkedChannelSession.rootPath ?? s.workspaceRoot ?? null;
          const project = buildProjectContext(resolvedRoot);
          const existingSession = s.chatSessions.find(session => session.linkedChannelSessionId === channelSessionId) ?? null;
          const resolvedTitle = existingSession?.title && existingSession.title !== DEFAULT_CHAT_TITLE
            ? existingSession.title
            : linkedChannelSession.title || DEFAULT_CHAT_TITLE;

          if (existingSession) {
            const nextSession: ChatSession = {
              ...existingSession,
              title: resolvedTitle,
              projectId: linkedChannelSession.projectId ?? project.projectId,
              projectName: project.projectName,
              workspaceRoot: resolvedRoot,
              linkedChannelSessionId: channelSessionId,
              updatedAt: Date.now(),
            };
            const sessions = sortChatSessions(
              s.chatSessions.map(session => (session.id === existingSession.id ? nextSession : session)),
            );
            return buildSessionActivationState(s, nextSession, {
              chatSessions: sessions,
              activeSessionId: nextSession.id,
            });
          }

          const newSess: ChatSession = {
            ...makeEmptySession({
              projectId: linkedChannelSession.projectId ?? project.projectId,
              projectName: project.projectName,
              workspaceRoot: resolvedRoot,
            }),
            id: newSessionId(),
            title: linkedChannelSession.title || DEFAULT_CHAT_TITLE,
            linkedChannelSessionId: channelSessionId,
            updatedAt: Date.now(),
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
          const nextReasoning = removeAssistantReasoningBySessionId(s.assistantReasoning, id);
          if (sessions.length === 0) {
            const empty = makeEmptySession();
            return buildSessionActivationState(s, empty, {
              chatSessions: [empty],
              activeSessionId: empty.id,
              assistantReasoning: nextReasoning,
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
            assistantReasoning: nextReasoning,
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
      pendingTaskSearchQuery: "",
      pendingTaskSearchSessionId: null,
      seedTaskSearch: (sessionId, query) =>
        set({
          pendingTaskSearchSessionId: sessionId,
          pendingTaskSearchQuery: query.trim(),
        }),
      clearTaskSearchSeed: () =>
        set({
          pendingTaskSearchSessionId: null,
          pendingTaskSearchQuery: "",
        }),

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
      runtimeAgentSkills: AGENT_SKILLS,
      enabledPluginIds: DEFAULT_ENABLED_PLUGIN_IDS,
      userNickname: "您",
      userProfile: createEmptyUserProfile(),
      userProfileOnboarding: createIdleUserProfileOnboarding(),
      activeTeamOperatingTemplateId: null,
      assistantFeedbackProfile: DEFAULT_ASSISTANT_FEEDBACK_PROFILE,
      semanticMemoryConfig: DEFAULT_SEMANTIC_MEMORY_CONFIG,
      desktopProgramSettings: DEFAULT_DESKTOP_PROGRAM_SETTINGS,
      hermesDispatchSettings: DEFAULT_HERMES_DISPATCH_SETTINGS,
      rateAssistantTask: ({ taskId, feedback, sessionId }) =>
        set(s => {
          const now = Date.now();
          const resolvedSessionId = sessionId ?? s.activeSessionId;
          const task =
            s.tasks.find(item => item.id === taskId)
            ?? s.chatSessions.flatMap(session => session.tasks).find(item => item.id === taskId)
            ?? null;

          if (!task || task.isUserMessage) return {};

          const excerpt = buildAssistantFeedbackExcerpt(task);
          const record = {
            taskId,
            sessionId: resolvedSessionId,
            agentId: task.assignedTo,
            feedback,
            excerpt,
            createdAt: now,
          };

          const updateTaskFeedback = (items: Task[]) =>
            items.map(item =>
              item.id === taskId
                ? {
                    ...item,
                    feedback,
                  }
                : item,
            );

          const liked = s.assistantFeedbackProfile.liked.filter(item => item.taskId !== taskId);
          const disliked = s.assistantFeedbackProfile.disliked.filter(item => item.taskId !== taskId);
          const nextProfile: AssistantFeedbackProfile = {
            liked: capAssistantFeedbackRecords(feedback === "up" ? [record, ...liked] : liked),
            disliked: capAssistantFeedbackRecords(feedback === "down" ? [record, ...disliked] : disliked),
            updatedAt: now,
          };

          return {
            tasks: updateTaskFeedback(s.tasks),
            chatSessions: sortChatSessions(
              s.chatSessions.map(session => ({
                ...session,
                tasks: updateTaskFeedback(session.tasks),
                updatedAt: session.tasks.some(item => item.id === taskId) ? now : session.updatedAt,
              })),
            ),
            assistantFeedbackProfile: nextProfile,
          };
        }),
      setUserNickname: (nickname) => set({ userNickname: nickname }),
      setUserProfile: (updates) =>
        set(s => ({
          userProfile: normalizeUserProfile({
            ...s.userProfile,
            ...updates,
            updatedAt: typeof updates.updatedAt === "number" ? updates.updatedAt : Date.now(),
          }),
        })),
      resetUserProfile: () =>
        set({
          userProfile: createEmptyUserProfile(),
          userProfileOnboarding: createIdleUserProfileOnboarding(),
        }),
      setUserProfileOnboarding: (updates) =>
        set(s => ({
          userProfileOnboarding: {
            ...s.userProfileOnboarding,
            ...updates,
            missingFields: Array.isArray(updates.missingFields)
              ? updates.missingFields
              : s.userProfileOnboarding.missingFields,
          },
        })),
      startUserProfileOnboarding: (sessionId, resetProfile = false) =>
        set(s => {
          const nextProfile = resetProfile ? createEmptyUserProfile() : s.userProfile;
          return {
            userProfile: nextProfile,
            userProfileOnboarding: {
              status: "collecting",
              sessionId,
              startedAt: Date.now(),
              completedAt: null,
              lastUserInputAt: null,
              missingFields: getUserProfileMissingFields(nextProfile),
            },
          };
        }),
      setActiveTeamOperatingTemplate: (activeTeamOperatingTemplateId) => set({ activeTeamOperatingTemplateId }),
      platformConfigs: Object.fromEntries(
        PLATFORM_DEFINITIONS.map(p => [p.id, { enabled: false, fields: {}, status: "idle" as const, healthScore: 0 }])
      ),
      addProvider: (p) => set(s => ({ providers: [...s.providers, p] })),
      updateProvider: (id, updates) =>
        set(s => ({ providers: s.providers.map(p => (p.id === id ? { ...p, ...updates } : p)) })),
      removeProvider: (id) =>
        set(s => ({ providers: s.providers.filter(p => p.id !== id) })),
      setRuntimeAgentSkills: (skills) =>
        set(s => {
          const normalizedSkills = Array.isArray(skills) && skills.length > 0 ? skills : AGENT_SKILLS;
          const allSkillIds = normalizedSkills.map(skill => skill.id);
          return {
            runtimeAgentSkills: normalizedSkills,
            agentConfigs: Object.fromEntries(
              (Object.keys(s.agentConfigs) as AgentId[]).map(id => [
                id,
                {
                  ...s.agentConfigs[id],
                  skills: Array.from(new Set([...allSkillIds, ...s.agentConfigs[id].skills])),
                },
              ]),
            ) as Record<AgentId, AgentConfig>,
          };
        }),
      updateAgentConfig: (id, updates) =>
        set(s => ({
          agentConfigs: {
            ...s.agentConfigs,
            [id]: {
              ...s.agentConfigs[id],
              ...updates,
              skills: Array.isArray(updates.skills) ? updates.skills : s.agentConfigs[id].skills,
              governance: updates.governance
                ? normalizeAgentGovernance(id, s.agentConfigs[id].governance, updates.governance)
                : s.agentConfigs[id].governance,
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
      reconcilePlatformConfig: (platformId) =>
        set(s => {
          const definition = getPlatformDefinition(platformId);
          const current = s.platformConfigs[platformId];
          if (!definition || !current) return {};

          const derived = derivePlatformProvisionState(definition, current);
          return {
            platformConfigs: {
              ...s.platformConfigs,
              [platformId]: {
                ...current,
                status: derived.status,
                detail: derived.detail,
                healthScore: derived.healthScore,
                errorMsg:
                  derived.status === "idle"
                  || derived.status === "configured"
                  || derived.status === "webhook_missing"
                    ? undefined
                    : current.errorMsg,
              },
            },
          };
        }),
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
          const allEnabled = pack.pluginIds.every(pluginId => s.enabledPluginIds.includes(pluginId));
          return {
            enabledPluginIds: allEnabled
              ? s.enabledPluginIds.filter(pluginId => !pack.pluginIds.includes(pluginId))
              : Array.from(new Set([...s.enabledPluginIds, ...pack.pluginIds])),
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
      resetSemanticMemory: () =>
        set(s => ({
          semanticMemoryConfig: s.semanticMemoryConfig,
          semanticKnowledgeDocs: [],
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
      replaceHermesDispatchSettings: (updates) =>
        set(s => ({
          hermesDispatchSettings: normalizeHermesDispatchSettings(s.hermesDispatchSettings, updates),
        })),
      setHermesDispatchActivePlannerProfile: (id) =>
        set(s => ({
          hermesDispatchSettings: {
            ...s.hermesDispatchSettings,
            activePlannerProfileId: s.hermesDispatchSettings.plannerProfiles.some(profile => profile.id === id)
              ? id
              : s.hermesDispatchSettings.activePlannerProfileId,
          },
        })),
      updateHermesDispatchPlannerProfile: (id, updates) =>
        set(s => ({
          hermesDispatchSettings: {
            ...s.hermesDispatchSettings,
            plannerProfiles: s.hermesDispatchSettings.plannerProfiles.map(profile => (
              profile.id === id
                ? {
                    ...profile,
                    ...(typeof updates.label === "string" ? { label: updates.label } : {}),
                    ...(typeof updates.sessionStateFile === "string"
                      ? { sessionStateFile: updates.sessionStateFile }
                      : {}),
                    ...(typeof updates.description === "string"
                      ? { description: updates.description }
                      : {}),
                    ...(updates.models && typeof updates.models === "object"
                      ? { models: updates.models }
                      : {}),
                  }
                : profile
            )),
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

      theme: "light",
      locale: "zh-CN",
      leftOpen: true,
      rightOpen: true,
      activeTab: "tasks",
      activeControlCenterSectionId: "overview",
      focusedBusinessContentTaskId: null,
      focusedWorkflowRunId: null,
      setTheme: (theme) => {
        const nextTheme = sanitizeUiTheme(theme, "light");
        applyUiTheme(nextTheme);
        set({ theme: nextTheme });
      },
      setLocale: (locale) => {
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
        set({ locale });
      },
      toggleLeft: () => set(s => ({ leftOpen: !s.leftOpen })),
      toggleRight: () => set(s => ({ rightOpen: !s.rightOpen })),
      setTab: (activeTab) => set({ activeTab }),
      setActiveControlCenterSection: (activeControlCenterSectionId) => set({ activeControlCenterSectionId }),
      focusBusinessContentTask: (focusedBusinessContentTaskId) => set({ focusedBusinessContentTaskId }),
      focusWorkflowRun: (focusedWorkflowRunId) => set({ focusedWorkflowRunId }),

      wsStatus: "disconnected",
      desktopRuntime: DEFAULT_DESKTOP_RUNTIME_STATE,
      desktopInputSession: DEFAULT_DESKTOP_INPUT_SESSION,
      desktopScreenshot: DEFAULT_DESKTOP_SCREENSHOT_STATE,
      desktopEvidenceLog: [],
      channelActionResult: null,
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
      appendDesktopEvidence: (evidence) =>
        set(s => {
          const createdAt = typeof evidence.createdAt === "number" ? evidence.createdAt : Date.now();
          const nextEvidence: DesktopEvidenceRecord = {
            ...evidence,
            id: evidence.id ?? `desktop-evidence-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
            createdAt,
          };
          return {
            desktopEvidenceLog: [nextEvidence, ...s.desktopEvidenceLog].slice(0, MAX_DESKTOP_EVIDENCE_RECORDS),
          };
        }),
      clearDesktopEvidenceLog: () => set({ desktopEvidenceLog: [] }),
      setChannelActionResult: (channelActionResult) => set({ channelActionResult }),

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
      commandContextMentions: [],
      setDispatching: (isDispatching) => set({ isDispatching }),
      setLastInstruction: (lastInstruction) => set({ lastInstruction }),
      setCommandDraft: (commandDraft) => set({ commandDraft }),
      setCommandContextMentions: (commandContextMentions) => set({ commandContextMentions }),
      appendCommandDraft: (value) =>
        set(s => ({
          commandDraft: s.commandDraft.trim()
            ? `${s.commandDraft.trim()}\n\n${value}`
            : value,
        })),
      clearCommandDraft: () => set({ commandDraft: "", commandContextMentions: [] }),

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
        const template = getWorkflowTemplateById(templateId, state.enabledPluginIds, state.locale);
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
              normalizeBusinessCustomer({
                id: `customer-${now}-${Math.random().toString(36).slice(2, 7)}`,
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
                ownerAgentId: "greeter",
                tags: [],
                ...payload,
              }),
              ...s.businessCustomers,
            ],
          };
        }),
      updateBusinessCustomer: (id, updates) =>
        set(s => ({
          businessCustomers: s.businessCustomers.map(item =>
            item.id === id
              ? normalizeBusinessCustomer({
                  ...item,
                  ...updates,
                  updatedAt: Date.now(),
                  profileLastUpdatedAt:
                    "crmProfile" in updates
                    || "campaignPreferences" in updates
                    || "channelIdentities" in updates
                    || "linkedSessionIds" in updates
                    || "lastCampaignAssessment" in updates
                      ? Date.now()
                      : item.profileLastUpdatedAt,
                })
              : item,
          ),
        })),
      upsertBusinessCustomerFromChannelSession: (channelSessionId) => {
        const state = get();
        const now = Date.now();
        const session = state.businessChannelSessions.find(item => item.id === channelSessionId);
        if (!session) return null;

        const existing = session.customerId
          ? state.businessCustomers.find(item => item.id === session.customerId) ?? null
          : findCustomerByChannelSession(state.businessCustomers, session);
        const inferredName = inferCustomerDisplayNameFromSession(session) || `${session.channel} 客户`;
        const nextIdentity = buildCustomerIdentityFromSession(session);
        const nextCustomer = normalizeBusinessCustomer({
          ...(existing ?? {}),
          id: existing?.id ?? `customer-${now}-${Math.random().toString(36).slice(2, 7)}`,
          projectId: existing?.projectId ?? session.projectId ?? null,
          rootPath: existing?.rootPath ?? session.rootPath ?? null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          name: existing?.name ?? inferredName,
          tier: existing?.tier ?? "prospect",
          primaryChannel: existing?.primaryChannel ?? session.channel,
          company: existing?.company,
          ownerAgentId: existing?.ownerAgentId ?? "greeter",
          tags: existing?.tags ?? [],
          summary: session.summary || existing?.summary || "已根据渠道会话自动沉淀客户画像。",
          crmProfile: applyChannelSessionToCustomerProfile(existing?.crmProfile, session, {
            name: existing?.name ?? inferredName,
            company: existing?.company,
          }),
          channelIdentities: [
            nextIdentity,
            ...(existing?.channelIdentities ?? []),
          ],
          linkedSessionIds: Array.from(new Set([channelSessionId, ...(existing?.linkedSessionIds ?? [])])),
          profileLastUpdatedAt: now,
          campaignPreferences: existing?.campaignPreferences,
          lastCampaignAssessment: existing?.lastCampaignAssessment,
        });

        set(s => ({
          businessCustomers: [
            nextCustomer,
            ...s.businessCustomers.filter(item => item.id !== nextCustomer.id),
          ],
          businessChannelSessions: s.businessChannelSessions.map(item =>
            item.id === channelSessionId
              ? {
                  ...item,
                  customerId: nextCustomer.id,
                  updatedAt: now,
                }
              : item,
          ),
        }));

        return nextCustomer.id;
      },
      assessBusinessCustomerCampaignFit: ({ customerId, campaignBrief }) => {
        const state = get();
        const customer = state.businessCustomers.find(item => item.id === customerId);
        if (!customer) return null;
        const assessment = scoreCustomerCampaignFit(customer, campaignBrief);
        get().updateBusinessCustomer(customerId, {
          lastCampaignAssessment: assessment,
        });
        return assessment;
      },
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
                lastMessageAt: payload.lastMessageAt ?? now,
                ...payload,
              },
              ...s.businessChannelSessions,
            ],
          };
        }),
      upsertBusinessChannelSession: (payload) => {
        const state = get();
        const now = Date.now();
        const scope = resolveBusinessScope(state);
        const existing = state.businessChannelSessions.find(item =>
          (payload.id && item.id === payload.id)
          || (
            item.channel === payload.channel
            && (
              item.externalRef === payload.externalRef
              || (payload.replyTargetId ? item.externalRef === payload.replyTargetId : false)
              || (item.replyTargetId ? item.replyTargetId === payload.externalRef : false)
              || (payload.replyTargetId && item.replyTargetId === payload.replyTargetId)
            )
          ),
        );
        const nextId = payload.id ?? existing?.id ?? `channel-session-${now}-${Math.random().toString(36).slice(2, 7)}`;
        const mergedSession: BusinessChannelSession = {
          ...existing,
          ...payload,
          id: nextId,
          projectId: payload.projectId ?? existing?.projectId ?? scope.projectId,
          rootPath: payload.rootPath ?? existing?.rootPath ?? scope.rootPath,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          title: payload.title ?? existing?.title ?? `${payload.channel}:${payload.externalRef}`,
          customerId: payload.customerId ?? existing?.customerId ?? null,
          channel: payload.channel,
          externalRef: payload.externalRef,
          status: payload.status ?? existing?.status ?? "open",
          summary: payload.summary ?? existing?.summary ?? "已同步新的渠道会话。",
          lastMessageAt: payload.lastMessageAt ?? existing?.lastMessageAt ?? now,
        };

        set(s => ({
          businessChannelSessions: [
            mergedSession,
            ...s.businessChannelSessions.filter(item => item.id !== nextId),
          ],
        }));

        return nextId;
      },
      updateBusinessChannelSession: (id, updates) =>
        set(s => ({
          businessChannelSessions: s.businessChannelSessions.map(item =>
            item.id === id
              ? {
                  ...item,
                  ...updates,
                  updatedAt: Date.now(),
                }
              : item,
          ),
        })),
      markBusinessChannelSessionHandled: ({
        channelSessionId,
        trigger = "manual",
        detail,
        handledBy = "manual",
      }) => {
        const state = get();
        const session = state.businessChannelSessions.find(item => item.id === channelSessionId);
        if (!session) return;

        const now = Date.now();
        get().updateBusinessChannelSession(channelSessionId, {
          requiresReply: false,
          unreadCount: 0,
          handledBy,
          lastHandledAt: now,
          status: session.status === "closed" ? "closed" : "active",
          summary: detail?.trim() || session.summary,
        });
        get().recordBusinessOperation({
          entityType: "channelSession",
          entityId: channelSessionId,
          eventType: "message",
          trigger,
          status: "completed",
          title: "渠道会话已处理",
          detail: detail?.trim() || "已从渠道看板标记为已处理，未读与待回复标记已清空。",
          externalRef: session.externalRef,
        });
      },
      setBusinessLeadStage: ({
        id,
        stage,
        trigger = "manual",
        detail,
      }) => {
        const state = get();
        const lead = state.businessLeads.find(item => item.id === id);
        if (!lead || lead.stage === stage) return;

        set(s => ({
          businessLeads: s.businessLeads.map(item =>
            item.id === id
              ? { ...item, stage, updatedAt: Date.now() }
              : item,
          ),
        }));

        get().recordBusinessOperation({
          entityType: "lead",
          entityId: id,
          eventType: "workflow",
          trigger,
          status: "completed",
          title: "线索阶段已更新",
          detail: detail?.trim() || `线索阶段已切换为 ${stage}。`,
        });
      },
      advanceBusinessLeadStage: (id) => {
        const lead = get().businessLeads.find(item => item.id === id);
        if (!lead) return;

        const nextStage = getNextLeadStage(lead.stage);
        if (nextStage === lead.stage) return;

        get().setBusinessLeadStage({
          id,
          stage: nextStage,
          trigger: "auto",
          detail: `AI 自动将线索推进到 ${nextStage} 阶段。`,
        });
      },
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
                  note?.trim()
                  || (status === "approved"
                    ? "人工批准该业务对象进入自动执行链路。"
                    : status === "rejected"
                      ? "人工驳回该业务对象的自动执行请求。"
                      : "重新打开审批，等待人工进一步确认。"),
                projectId: scope.projectId,
                rootPath: scope.rootPath,
                createdAt: now,
                updatedAt: now,
              },
              ...s.businessOperationLogs,
            ]),
          };
        }),
      applyContentTaskApprovalDecision: ({ contentTaskId, decision }) => {
        const state = get();
        const contentTask = state.businessContentTasks.find(task => task.id === contentTaskId) ?? null;
        if (!contentTask) return null;

        const outcome = buildContentTaskApprovalOutcome(contentTask, decision);
        get().setBusinessApprovalDecision({
          entityType: "contentTask",
          entityId: contentTaskId,
          status: decision,
          note: outcome.note,
        });

        const archivedWorkflowRunIds = outcome.archivePublishPrepWorkflows
          ? get().workflowRuns
              .filter(run =>
                run.entityType === "contentTask"
                && run.entityId === contentTaskId
                && run.templateId === "content-publish-prep"
                && (run.status === "queued" || run.status === "staged" || run.status === "in-progress"),
              )
              .map(run => run.id)
          : [];

        archivedWorkflowRunIds.forEach(workflowRunId => {
          get().archiveWorkflowRun(workflowRunId);
        });

        if (outcome.nextStatus !== contentTask.status) {
          get().updateBusinessContentTask(contentTaskId, {
            status: outcome.nextStatus,
            lastOperationAt: Date.now(),
          });
        }

        const queuedWorkflowRunId = outcome.queuePublishPrepWorkflow
          ? get().queueContentTaskWorkflowRun(contentTaskId)
          : null;

        return {
          title: outcome.title,
          note: outcome.note,
          detail: outcome.detail,
          nextStatus: outcome.nextStatus,
          queuedWorkflowRunId,
          archivedWorkflowRunIds,
        };
      },
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
      enforceManualApprovalForContentTasks: ({
        contentTaskIds,
        detail,
        trigger = "manual",
      }) => {
        const state = get();
        const taskIdSet = new Set(contentTaskIds);
        const tasks = state.businessContentTasks.filter(task => taskIdSet.has(task.id));
        if (tasks.length === 0) return 0;

        const now = Date.now();
        const existingApprovals = new Map(
          state.businessApprovals
            .filter(item => item.entityType === "contentTask" && taskIdSet.has(item.entityId))
            .map(item => [item.entityId, item] as const),
        );

        set(s => ({
          businessApprovals: [
            ...tasks.map((task, index) => {
              const existing = existingApprovals.get(task.id);
              const timestamp = now + index;
              return existing
                ? {
                    ...existing,
                    status: "pending" as const,
                    note: detail,
                    decidedAt: undefined,
                    updatedAt: timestamp,
                  }
                : {
                    id: `approval-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
                    entityType: "contentTask" as const,
                    entityId: task.id,
                    status: "pending" as const,
                    projectId: task.projectId,
                    rootPath: task.rootPath,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    requestedAt: timestamp,
                    note: detail,
                  };
            }),
            ...s.businessApprovals.filter(item => !(item.entityType === "contentTask" && taskIdSet.has(item.entityId))),
          ].slice(0, 200),
          businessContentTasks: s.businessContentTasks.map(task =>
            taskIdSet.has(task.id)
              ? {
                  ...task,
                  lastOperationAt: now,
                  updatedAt: now,
                }
              : task,
          ),
          businessOperationLogs: capBusinessOperationLogs([
            ...tasks.map((task, index) => ({
              id: `biz-op-${now + index}-${Math.random().toString(36).slice(2, 7)}`,
              entityType: "contentTask" as const,
              entityId: task.id,
              eventType: "approval" as const,
              trigger,
              status: "pending" as const,
              title: task.title,
              detail,
              projectId: task.projectId,
              rootPath: task.rootPath,
              createdAt: now + index,
              updatedAt: now + index,
            })),
            ...s.businessOperationLogs,
          ]),
        }));

        return tasks.length;
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
      upsertSemanticKnowledgeDoc: (payload) => {
        const now = Date.now();
        const nextDoc: SemanticKnowledgeDocument = {
          ...payload,
          createdAt: payload.createdAt ?? now,
          updatedAt: payload.updatedAt ?? now,
        };
        set(s => ({
          semanticKnowledgeDocs: [
            nextDoc,
            ...s.semanticKnowledgeDocs.filter(item => item.id !== nextDoc.id),
          ].slice(0, 120),
        }));
        return nextDoc.id;
      },
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
      createExecutionRun: ({
        id,
        sessionId,
        instruction,
        source = "chat",
        workflowRunId,
        entityType,
        entityId,
        retryOfRunId,
        lastRecoveryHint,
      }) => {
        const timestamp = Date.now();
        const runId = id ?? `run-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const currentState = useStore.getState();
        const activeSession = currentState.chatSessions.find(session => session.id === sessionId) ?? null;
        const retrySourceRun = retryOfRunId
          ? currentState.executionRuns.find(run => run.id === retryOfRunId) ?? null
          : null;
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
          retryCount: retrySourceRun ? (retrySourceRun.retryCount ?? 0) + 1 : 0,
          retryOfRunId,
          recoveryState: "none",
          ...(lastRecoveryHint ? { lastRecoveryHint } : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          events: capExecutionEvents([
            {
              id: `evt-${timestamp}`,
              type: "user",
              title: retrySourceRun ? "重试任务已创建" : "任务已创建",
              detail: retrySourceRun
                ? `${instruction}\n\n重试来源: ${retrySourceRun.id} · 原因: ${retrySourceRun.lastFailureReason ?? retrySourceRun.lastRecoveryHint ?? "沿用原执行上下文继续处理"}`
                : instruction,
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
        retryCount,
        retryOfRunId,
        lastFailureReason,
        recoveryState,
        lastRecoveryHint,
        contextReceipt,
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
              retryCount: 0,
              recoveryState: "none",
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
          const resolvedRecoveryState = deriveExecutionRecoveryState({
            status: resolvedStatus,
            explicitRecoveryState: recoveryState,
            currentRecoveryState: baseRun.recoveryState,
          });
          const resolvedFailureReason =
            lastFailureReason !== undefined
              ? lastFailureReason || undefined
              : resolvedStatus === "failed"
                ? (event?.type === "error" ? event.detail : baseRun.lastFailureReason)
                : resolvedRecoveryState === "none"
                  ? undefined
                  : baseRun.lastFailureReason;
          const resolvedRecoveryHint =
            lastRecoveryHint !== undefined
              ? lastRecoveryHint || undefined
              : resolvedRecoveryState === "none"
                ? undefined
                : baseRun.lastRecoveryHint;
          const nextRun: ExecutionRun = {
            ...baseRun,
            ...(sessionId ? { sessionId } : {}),
            ...(instruction ? { instruction } : {}),
            ...(source ? { source } : {}),
            ...(workflowRunId === undefined ? {} : { workflowRunId }),
            ...(entityType === undefined ? {} : { entityType }),
            ...(entityId === undefined ? {} : { entityId }),
            ...(status ? { status } : {}),
            ...(typeof retryCount === "number" ? { retryCount } : {}),
            ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
            lastFailureReason: resolvedFailureReason,
            recoveryState: resolvedRecoveryState,
            lastRecoveryHint: resolvedRecoveryHint,
            ...(contextReceipt !== undefined ? { contextReceipt } : {}),
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
      failExecutionRun: (runId, detail, options) =>
        set(s => {
          const now = Date.now();
          return {
            executionRuns: capExecutionRuns(
              s.executionRuns.map(run =>
                run.id === runId
                  ? {
                      ...run,
                      status: "failed",
                      lastFailureReason: detail,
                      recoveryState: options?.recoveryState ?? "retryable",
                      lastRecoveryHint: options?.lastRecoveryHint ?? "可查看失败原因后重试，或回到聊天接管。",
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
            facts: [],
          };

          return {
            workspaceProjectMemories: capWorkspaceProjectMemories([
              nextMemory,
              ...s.workspaceProjectMemories.filter(memory => memory.name !== trimmedName),
            ]),
            activeWorkspaceProjectMemoryId: nextMemory.id,
          };
        }),
      recordWorkspaceProjectFacts: ({ projectId, rootPath, executionRunId, sourceLabel, facts }) =>
        set(s => {
          if (!Array.isArray(facts) || facts.length === 0) return {};

          const now = Date.now();
          const resolvedProjectId = projectId ?? s.chatSessions.find(session => session.id === s.activeSessionId)?.projectId ?? null;
          const resolvedRootPath = rootPath ?? s.workspaceRoot ?? null;
          const targetMemory =
            (s.activeWorkspaceProjectMemoryId
              ? s.workspaceProjectMemories.find(item => item.id === s.activeWorkspaceProjectMemoryId) ?? null
              : null)
            ?? s.workspaceProjectMemories.find(item =>
              (item.projectId ?? null) === resolvedProjectId
              && (item.rootPath ?? null) === resolvedRootPath,
            )
            ?? null;

          const preparedFacts = facts.map(fact => ({
            ...fact,
            sourceLabel: sourceLabel?.trim() || fact.sourceLabel,
            sourceRunId: executionRunId ?? fact.sourceRunId,
          }));

          if (targetMemory) {
            const nextMemory: WorkspaceProjectMemory = {
              ...targetMemory,
              updatedAt: now,
              facts: upsertWorkspaceProjectFacts(targetMemory.facts, preparedFacts),
            };

            return {
              workspaceProjectMemories: capWorkspaceProjectMemories([
                nextMemory,
                ...s.workspaceProjectMemories.filter(item => item.id !== nextMemory.id),
              ]),
            };
          }

          const autoMemory: WorkspaceProjectMemory = {
            id: `memory-auto-${now}`,
            name: "Hermes World Facts",
            createdAt: now,
            updatedAt: now,
            projectId: resolvedProjectId,
            rootPath: resolvedRootPath,
            focusPath: null,
            previews: [],
            scratchpad: "",
            deskNotes: [],
            facts: upsertWorkspaceProjectFacts([], preparedFacts),
          };

          return {
            workspaceProjectMemories: capWorkspaceProjectMemories([
              autoMemory,
              ...s.workspaceProjectMemories,
            ]),
            activeWorkspaceProjectMemoryId: s.activeWorkspaceProjectMemoryId ?? autoMemory.id,
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
      meetingContextMentions: [],
      latestMeetingRecord: null,
      meetingHistory: [],
      addMeetingSpeech: (speech) => set(st => ({ meetingSpeeches: [...st.meetingSpeeches, speech] })),
      clearMeeting: () => set({ meetingSpeeches: [], meetingActive: false, meetingTopic: "", meetingContextMentions: [] }),
      setMeetingActive: (meetingActive) => set({ meetingActive }),
      setMeetingTopic: (meetingTopic) => set({ meetingTopic }),
      setMeetingContextMentions: (meetingContextMentions) => set({ meetingContextMentions }),
      finalizeMeeting: ({ topic, summary, finishedAt, sessionId, projectId, rootPath }) =>
        set(st => {
          const resolvedFinishedAt = finishedAt ?? Date.now();
          const linkedSession = sessionId
            ? st.chatSessions.find(session => session.id === sessionId) ?? null
            : null;
          const record = {
            id: `meeting-${resolvedFinishedAt}`,
            topic,
            summary,
            speeches: st.meetingSpeeches,
            finishedAt: resolvedFinishedAt,
            sessionId: sessionId ?? null,
            projectId: projectId ?? linkedSession?.projectId ?? null,
            rootPath: rootPath ?? linkedSession?.workspaceRoot ?? null,
          };
          return {
            meetingActive: false,
            meetingTopic: "",
            latestMeetingRecord: record,
            meetingHistory: [
              record,
              ...st.meetingHistory.filter(item => item.id !== record.id),
            ].slice(0, 24),
          };
        }),
    }),
    {
      name: "xiaolongxia-settings",
      version: 3,
      partialize: (s) => ({
        providers: s.providers,
        agentConfigs: s.agentConfigs,
        enabledPluginIds: s.enabledPluginIds,
        platformConfigs: s.platformConfigs,
        userNickname: s.userNickname,
        userProfile: s.userProfile,
        userProfileOnboarding: s.userProfileOnboarding,
        activeTeamOperatingTemplateId: s.activeTeamOperatingTemplateId,
        assistantFeedbackProfile: s.assistantFeedbackProfile,
        semanticMemoryConfig: s.semanticMemoryConfig,
        desktopProgramSettings: s.desktopProgramSettings,
        hermesDispatchSettings: s.hermesDispatchSettings,
        theme: s.theme,
        locale: s.locale,
        leftOpen: s.leftOpen,
        rightOpen: s.rightOpen,
        automationMode: s.automationMode,
        automationPaused: s.automationPaused,
        remoteSupervisorEnabled: s.remoteSupervisorEnabled,
        autoDispatchScheduledTasks: s.autoDispatchScheduledTasks,
        desktopInputSession: s.desktopInputSession,
        desktopScreenshot: s.desktopScreenshot,
        desktopEvidenceLog: s.desktopEvidenceLog,
        chatSessions: s.chatSessions,
        activeSessionId: s.activeSessionId,
        executionRuns: s.executionRuns,
        activeExecutionRunId: s.activeExecutionRunId,
        workflowRuns: s.workflowRuns,
        commandContextMentions: s.commandContextMentions,
        latestMeetingRecord: s.latestMeetingRecord,
        meetingHistory: s.meetingHistory,
        meetingContextMentions: s.meetingContextMentions,
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
      migrate: (persisted, version) => {
        const persistedStore = (persisted ?? {}) as Partial<Store>;
        return {
          ...persistedStore,
          theme: version < 2
            ? migrateLegacyUiTheme(persistedStore.theme)
            : sanitizeUiTheme(persistedStore.theme, "light"),
        } as Store;
      },
      merge: (persisted, current) => {
        const persistedStore = (persisted ?? {}) as Partial<Store>;
        const merged = { ...current, ...persistedStore } as Store;
        const agentConfigs = normalizeAgentConfigs(current.agentConfigs, persistedStore.agentConfigs);
        const agents = syncAgentsWithConfigs(current.agents, agentConfigs, persistedStore.agents);
        const assistantFeedbackProfile = normalizeAssistantFeedbackProfile(
          persistedStore.assistantFeedbackProfile,
        );
        const semanticMemoryConfig = normalizeSemanticMemoryConfig(
          current.semanticMemoryConfig,
          persistedStore.semanticMemoryConfig,
        );
        const desktopProgramSettings = normalizeDesktopProgramSettings(
          current.desktopProgramSettings,
          persistedStore.desktopProgramSettings,
        );
        const hermesDispatchSettings = normalizeHermesDispatchSettings(
          current.hermesDispatchSettings,
          persistedStore.hermesDispatchSettings,
        );
        const desktopInputSession = {
          ...current.desktopInputSession,
          ...(persistedStore.desktopInputSession ?? {}),
        };
        const desktopScreenshot = {
          ...current.desktopScreenshot,
          ...(persistedStore.desktopScreenshot ?? {}),
        };
        const desktopEvidenceLog = normalizeDesktopEvidenceLog(persistedStore.desktopEvidenceLog);
        const userProfile = normalizeUserProfile(persistedStore.userProfile ?? current.userProfile);
        const userProfileOnboarding = {
          ...current.userProfileOnboarding,
          ...(persistedStore.userProfileOnboarding ?? {}),
          missingFields: Array.isArray(persistedStore.userProfileOnboarding?.missingFields)
            ? persistedStore.userProfileOnboarding?.missingFields ?? current.userProfileOnboarding.missingFields
            : getUserProfileMissingFields(userProfile),
        };

        return ensureChatHydration({
          ...merged,
          activeTab: current.activeTab,
          theme: sanitizeUiTheme(persistedStore.theme, current.theme),
          agentConfigs,
          agents,
          assistantFeedbackProfile,
          userProfile,
          userProfileOnboarding,
          semanticMemoryConfig,
          desktopProgramSettings,
          hermesDispatchSettings,
          desktopInputSession,
          desktopScreenshot,
          desktopEvidenceLog,
          businessCustomers: Array.isArray(persistedStore.businessCustomers)
            ? persistedStore.businessCustomers
                .filter((item): item is BusinessCustomer => Boolean(item?.id && item?.name))
                .map(item => normalizeBusinessCustomer(item))
            : current.businessCustomers,
          semanticKnowledgeDocs: Array.isArray(persistedStore.semanticKnowledgeDocs)
            ? persistedStore.semanticKnowledgeDocs
            : current.semanticKnowledgeDocs,
        }) as Store;
      },
    }
  )
);
