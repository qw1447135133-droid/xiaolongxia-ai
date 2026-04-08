import type { DesktopInputRetrySuggestion } from "@/types/electron-api";
import SKILL_CATALOG from "@/generated/skills-catalog.json";

export type AgentId = "orchestrator" | "explorer" | "writer" | "designer" | "performer" | "greeter";
export type AgentStatus = "idle" | "running" | "error";
export type TaskComplexity = "high" | "medium" | "low";
export type TaskStatus = "pending" | "running" | "done" | "failed";
export type AssistantMessageFeedback = "up" | "down";
export type AssistantReasoningStatus = "running" | "done" | "failed";
export type AppTab = "dashboard" | "tasks" | "workspace" | "dispatch" | "meeting" | "settings";
export type UiLocale = "zh-CN" | "zh-TW" | "en" | "ja";
export type AutomationMode = "manual" | "supervised" | "autonomous";
export type ControlCenterSectionId =
  | "overview"
  | "entities"
  | "remote"
  | "execution"
  | "workflow"
  | "agent-models"
  | "api-providers"
  | "desktop"
  | "workspace"
  | "skills"
  | "plugins"
  | "artifacts"
  | "channels"
  | "settings"
  | "about";

export interface AgentState {
  id: AgentId;
  name: string;
  emoji: string;
  status: AgentStatus;
  currentTask?: string;
  tokenUsage: number;
  lastUpdated: number;
}

export interface Task {
  id: string;
  description: string;
  assignedTo: AgentId;
  complexity: TaskComplexity;
  status: TaskStatus;
  result?: string;
  imageUrl?: string;
  createdAt: number;
  completedAt?: number;
  isUserMessage?: boolean;
  feedback?: AssistantMessageFeedback;
}

export interface AssistantReasoningTrace {
  taskId: string;
  sessionId: string;
  agentId: AgentId;
  executionRunId?: string;
  summary: string;
  details: string[];
  status: AssistantReasoningStatus;
  updatedAt: number;
}

export interface AssistantFeedbackRecord {
  taskId: string;
  sessionId: string;
  agentId: AgentId;
  feedback: AssistantMessageFeedback;
  excerpt: string;
  createdAt: number;
}

export interface AssistantFeedbackProfile {
  liked: AssistantFeedbackRecord[];
  disliked: AssistantFeedbackRecord[];
  updatedAt: number | null;
}

export interface Activity {
  id: string;
  agentId: AgentId;
  type: "task_start" | "task_done" | "task_fail" | "meeting" | "dispatch" | "tool_start" | "tool_done" | "tool_fail";
  summary: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
  taskId?: string;
  sessionId?: string;
}

export type ExecutionRunStatus = "queued" | "analyzing" | "running" | "completed" | "failed";
export type ExecutionRunSource = "chat" | "workspace" | "workflow" | "quick-start" | "remote-ops";
export type ExecutionEventType = "user" | "dispatch" | "agent" | "result" | "error" | "system";
export type VerificationStatus = "idle" | "running" | "passed" | "failed" | "skipped";
export type ExecutionRecoveryState = "none" | "retryable" | "manual-required" | "blocked";

export interface VerificationStepResult {
  id: "build" | "typecheck" | "lint";
  label: string;
  status: "passed" | "failed" | "skipped";
  command: string;
  output: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
}

export interface ExecutionEvent {
  id: string;
  type: ExecutionEventType;
  title: string;
  timestamp: number;
  detail?: string;
  agentId?: AgentId;
  taskId?: string;
  matchedSkillIds?: string[];
  createdSkillIds?: string[];
}

export interface ExecutionRun {
  id: string;
  sessionId: string;
  projectId?: string | null;
  instruction: string;
  source: ExecutionRunSource;
  workflowRunId?: string;
  entityType?: "customer" | "lead" | "ticket" | "contentTask" | "channelSession";
  entityId?: string;
  status: ExecutionRunStatus;
  retryCount?: number;
  retryOfRunId?: string;
  lastFailureReason?: string;
  recoveryState?: ExecutionRecoveryState;
  lastRecoveryHint?: string;
  blockedReason?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  currentAgentId?: AgentId;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  events: ExecutionEvent[];
  verificationStatus?: VerificationStatus;
  verificationResults?: VerificationStepResult[];
  verificationUpdatedAt?: number;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byAgent: Record<AgentId, number>;
}

export interface ModelProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
}

export interface DesktopProgramEntry {
  id: string;
  label: string;
  target: string;
  args: string[];
  cwd?: string;
  notes?: string;
  source: "preset" | "scan" | "manual";
  createdAt: number;
  updatedAt: number;
}

export interface DesktopProgramSettings {
  enabled: boolean;
  whitelistMode: boolean;
  favorites: DesktopProgramEntry[];
  whitelist: DesktopProgramEntry[];
  inputControl: {
    enabled: boolean;
    autoOpenPanelOnAction: boolean;
    requireManualTakeoverForVerification: boolean;
  };
}

export interface HermesPlannerProfile {
  id: string;
  label: string;
  sessionStateFile: string;
  description?: string;
  models?: {
    planner?: string;
    codex?: string;
    claude?: string;
    gemini?: string;
  };
}

export interface HermesDispatchSettings {
  activePlannerProfileId: string;
  plannerProfiles: HermesPlannerProfile[];
}

export interface DesktopRuntimeSummary {
  totalClients: number;
  launchCapable: number;
  installedAppsCapable: number;
  inputCapable: number;
  screenshotCapable: number;
  updatedAt: number | null;
}

export type DesktopRuntimeFetchState = "idle" | "loading" | "ready" | "error";

export interface DesktopRuntimeState {
  totalClients: number;
  launchCapable: number;
  installedAppsCapable: number;
  inputCapable: number;
  screenshotCapable: number;
  lastCheckedAt: number | null;
  fetchState: DesktopRuntimeFetchState;
  error?: string;
}

export type DesktopInputSessionState = "idle" | "running" | "executed" | "manual-required" | "error";

export interface DesktopInputSession {
  state: DesktopInputSessionState;
  source: "agent" | "manual" | null;
  lastAction?: string;
  lastIntent?: string;
  target?: string;
  message?: string;
  sessionId?: string;
  executionRunId?: string;
  taskId?: string;
  resumeInstruction?: string;
  retryStrategy?: "visual-recheck-offset";
  retrySuggestions?: DesktopInputRetrySuggestion[];
  cursor?: {
    x: number;
    y: number;
  };
  updatedAt: number | null;
}

export interface DesktopScreenshotState {
  status: "idle" | "capturing" | "ready" | "error";
  imageDataUrl?: string;
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  source: "agent" | "manual" | null;
  target?: string;
  intent?: string;
  message?: string;
  sessionId?: string;
  executionRunId?: string;
  updatedAt: number | null;
}

export type DesktopEvidenceKind = "input" | "screenshot" | "takeover" | "resume";
export type DesktopEvidenceStatus = "completed" | "failed" | "blocked" | "info";

export interface DesktopEvidenceRecord {
  id: string;
  kind: DesktopEvidenceKind;
  status: DesktopEvidenceStatus;
  source: "agent" | "manual";
  summary: string;
  action?: string;
  intent?: string;
  target?: string;
  sessionId?: string;
  executionRunId?: string;
  taskId?: string;
  failureReason?: string;
  retryStrategy?: "visual-recheck-offset";
  retrySuggestions?: DesktopInputRetrySuggestion[];
  imageCaptured?: boolean;
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  takeoverBy?: "agent" | "manual";
  takeoverReason?: string;
  resumeInstruction?: string;
  resumeFrom?: string;
  createdAt: number;
}

export interface AgentSkill {
  id: string;
  order?: number;
  category: string;
  sourceType: "built-in" | "clawhub" | "local";
  sourceLabel: string;
  sourceUrl?: string;
  accent: string;
  icon: string;
  tags: string[];
  recommendedAgents: AgentId[];
  locales: Record<UiLocale, {
    name: string;
    short: string;
    description: string;
    dispatch: string;
    typicalTasks: string;
    outputs: string;
  }>;
}

export const AGENT_SKILLS = SKILL_CATALOG as AgentSkill[];

export type AgentSkillId = string;

export interface AgentConfig {
  id: AgentId;
  name: string;
  emoji: string;
  personality: string;
  model: string;
  providerId: string;
  skills: AgentSkillId[];
}

export type ModelPresetTier = "reasoning" | "balanced" | "budget";
export type TeamOperatingTemplateId = "engineering" | "support" | "content";
export type PlatformConnectionStatus =
  | "idle"
  | "syncing"
  | "configured"
  | "connected"
  | "degraded"
  | "error"
  | "auth_failed"
  | "webhook_missing"
  | "webhook_unreachable"
  | "rate_limited";

export const AGENT_META: Record<AgentId, { name: string; emoji: string; badge: string; defaultPersonality: string }> = {
  orchestrator: {
    name: "鹦鹉螺",
    emoji: "🐚",
    badge: "badge-orchestrator",
    defaultPersonality: "你是跨境电商 AI 团队的总调度员，负责任务拆解和团队协调。",
  },
  explorer: {
    name: "探海鲸鱼",
    emoji: "🐋",
    badge: "badge-explorer",
    defaultPersonality: "你是跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析，提供具体可执行的洞察。",
  },
  writer: {
    name: "星海章鱼",
    emoji: "🐙",
    badge: "badge-writer",
    defaultPersonality: "你是跨境电商文案专家，专注多语种文案创作、SEO 标题优化和商品详情页撰写，输出高转化率文案。",
  },
  designer: {
    name: "珊瑚水母",
    emoji: "🪼",
    badge: "badge-designer",
    defaultPersonality: "你是电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出设计方案说明。",
  },
  performer: {
    name: "逐浪海豚",
    emoji: "🐬",
    badge: "badge-performer",
    defaultPersonality: "你是短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。",
  },
  greeter: {
    name: "招潮蟹",
    emoji: "🦀",
    badge: "badge-greeter",
    defaultPersonality: "你是多语种客服专家，专注客服话术、评论回复模板和买家互动策略，保持友好专业语气。",
  },
};

export const PROVIDER_PRESETS: Omit<ModelProvider, "apiKey">[] = [
  { id: "anthropic", name: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "aliyun-coding", name: "阿里云百炼 Coding Plan", baseUrl: "https://coding.dashscope.aliyuncs.com/v1" },
  { id: "volcengine-coding", name: "火山方舟 Coding Plan", baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3" },
  { id: "4sapi", name: "4sAPI", baseUrl: "https://api.4sapi.com/v1" },
  { id: "custom", name: "自定义", baseUrl: "" },
];

export const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5-20251001",
  ],
  openai: [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o1-mini",
    "o3-mini",
  ],
  siliconflow: [
    "deepseek-ai/DeepSeek-R1",
    "deepseek-ai/DeepSeek-V3",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/QwQ-32B",
  ],
  deepseek: [
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  "aliyun-coding": [
    "qwen3.5-plus",
    "qwen3-max-2026-01-23",
    "qwen3-coder-next",
    "qwen3-coder-plus",
    "glm-5",
    "glm-4.7",
    "kimi-k2.5",
    "MiniMax-M2.5",
  ],
  "volcengine-coding": [
    "doubao-seed-2.0-code",
    "doubao-seed-2.0-pro",
    "doubao-seed-2.0-lite",
    "doubao-seed-code",
    "minimax-m2.5",
    "glm-4.7",
    "deepseek-v3.2",
    "kimi-k2.5",
    "ark-code-latest",
  ],
  "4sapi": [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
  ],
  custom: [],
};

const PROVIDER_MODEL_PRESETS: Record<string, Record<ModelPresetTier, string>> = {
  anthropic: {
    reasoning: "claude-opus-4-6",
    balanced: "claude-sonnet-4-6",
    budget: "claude-haiku-4-5-20251001",
  },
  openai: {
    reasoning: "gpt-5.4",
    balanced: "gpt-5.4-mini",
    budget: "gpt-5.4-nano",
  },
  siliconflow: {
    reasoning: "deepseek-ai/DeepSeek-R1",
    balanced: "deepseek-ai/DeepSeek-V3",
    budget: "Qwen/Qwen2.5-7B-Instruct",
  },
  deepseek: {
    reasoning: "deepseek-reasoner",
    balanced: "deepseek-chat",
    budget: "deepseek-chat",
  },
  "aliyun-coding": {
    reasoning: "qwen3-coder-next",
    balanced: "qwen3-coder-plus",
    budget: "glm-4.7",
  },
  "volcengine-coding": {
    reasoning: "doubao-seed-2.0-pro",
    balanced: "doubao-seed-2.0-code",
    budget: "doubao-seed-2.0-lite",
  },
  "4sapi": {
    reasoning: "claude-3-7-sonnet-20250219",
    balanced: "gpt-4o",
    budget: "gpt-4o-mini",
  },
};

export const AGENT_RECOMMENDED_MODEL_TIERS: Record<AgentId, ModelPresetTier> = {
  orchestrator: "balanced",
  explorer: "reasoning",
  writer: "balanced",
  designer: "balanced",
  performer: "balanced",
  greeter: "budget",
};

export interface AgentModelRoutingProfile {
  defaultTier: ModelPresetTier;
  focusLabel: string;
  summary: string;
  allowProviderFallback: boolean;
  preferredProviderIds?: string[];
}

export const AGENT_MODEL_ROUTING_PROFILES: Record<AgentId, AgentModelRoutingProfile> = {
  orchestrator: {
    defaultTier: "reasoning",
    focusLabel: "多模态总控",
    summary: "永远优先分配可处理复杂桌面、视觉和高复杂度协同任务的多模态模型。",
    allowProviderFallback: true,
    preferredProviderIds: ["openai", "volcengine-coding", "aliyun-coding", "4sapi", "anthropic"],
  },
  explorer: {
    defaultTier: "reasoning",
    focusLabel: "深度研究",
    summary: "优先推理、检索和结构化分析能力。",
    allowProviderFallback: false,
  },
  writer: {
    defaultTier: "balanced",
    focusLabel: "文案写作",
    summary: "优先语言质量、改写和多语种表达能力。",
    allowProviderFallback: false,
  },
  designer: {
    defaultTier: "balanced",
    focusLabel: "视觉多模态",
    summary: "优先支持视觉理解和图像创作提示的多模态模型。",
    allowProviderFallback: true,
    preferredProviderIds: ["openai", "volcengine-coding", "aliyun-coding", "4sapi", "anthropic"],
  },
  performer: {
    defaultTier: "balanced",
    focusLabel: "音视频多模态",
    summary: "优先支持视频脚本、分镜和多模态内容理解的模型。",
    allowProviderFallback: true,
    preferredProviderIds: ["openai", "volcengine-coding", "aliyun-coding", "4sapi", "anthropic"],
  },
  greeter: {
    defaultTier: "budget",
    focusLabel: "客服对话",
    summary: "优先成本稳定、响应快、持续在线的对话模型。",
    allowProviderFallback: false,
  },
};

const PROVIDER_AGENT_MODEL_OVERRIDES: Partial<Record<string, Partial<Record<AgentId, Partial<Record<ModelPresetTier, string[]>>>>>> = {
  openai: {
    orchestrator: {
      reasoning: ["gpt-4o", "gpt-5.4"],
      balanced: ["gpt-4o", "gpt-5.4-mini"],
      budget: ["gpt-4o-mini", "gpt-5.4-nano"],
    },
    designer: {
      reasoning: ["gpt-4o", "gpt-5.4"],
      balanced: ["gpt-4o", "gpt-5.4-mini"],
      budget: ["gpt-4o-mini", "gpt-5.4-nano"],
    },
    performer: {
      reasoning: ["gpt-4o", "gpt-5.4"],
      balanced: ["gpt-4o", "gpt-5.4-mini"],
      budget: ["gpt-4o-mini", "gpt-5.4-nano"],
    },
  },
  anthropic: {
    orchestrator: {
      reasoning: ["claude-opus-4-6", "claude-sonnet-4-6"],
      balanced: ["claude-sonnet-4-6", "claude-opus-4-6"],
      budget: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    },
    designer: {
      reasoning: ["claude-opus-4-6", "claude-sonnet-4-6"],
      balanced: ["claude-sonnet-4-6", "claude-opus-4-6"],
      budget: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
    },
    performer: {
      reasoning: ["claude-opus-4-6", "claude-sonnet-4-6"],
      balanced: ["claude-sonnet-4-6", "claude-opus-4-6"],
      budget: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
    },
  },
  "aliyun-coding": {
    orchestrator: {
      reasoning: ["qwen3-max-2026-01-23", "qwen3.5-plus", "MiniMax-M2.5", "glm-5"],
      balanced: ["qwen3.5-plus", "qwen3-max-2026-01-23", "MiniMax-M2.5", "glm-5"],
      budget: ["qwen3.5-plus", "MiniMax-M2.5", "glm-5", "qwen3-max-2026-01-23"],
    },
    designer: {
      reasoning: ["qwen3-max-2026-01-23", "qwen3.5-plus", "MiniMax-M2.5", "glm-5"],
      balanced: ["qwen3.5-plus", "qwen3-max-2026-01-23", "MiniMax-M2.5", "glm-5"],
      budget: ["qwen3.5-plus", "MiniMax-M2.5", "glm-5", "qwen3-max-2026-01-23"],
    },
    performer: {
      reasoning: ["qwen3-max-2026-01-23", "qwen3.5-plus", "kimi-k2.5", "MiniMax-M2.5"],
      balanced: ["qwen3.5-plus", "qwen3-max-2026-01-23", "kimi-k2.5", "MiniMax-M2.5"],
      budget: ["qwen3.5-plus", "kimi-k2.5", "MiniMax-M2.5", "glm-5"],
    },
  },
  "volcengine-coding": {
    orchestrator: {
      reasoning: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "minimax-m2.5", "deepseek-v3.2"],
      balanced: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "minimax-m2.5", "glm-4.7"],
      budget: ["doubao-seed-2.0-lite", "glm-4.7", "kimi-k2.5", "ark-code-latest"],
    },
    designer: {
      reasoning: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "minimax-m2.5", "deepseek-v3.2"],
      balanced: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "minimax-m2.5", "glm-4.7"],
      budget: ["doubao-seed-2.0-lite", "glm-4.7", "kimi-k2.5", "ark-code-latest"],
    },
    performer: {
      reasoning: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "deepseek-v3.2", "minimax-m2.5"],
      balanced: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "kimi-k2.5", "minimax-m2.5"],
      budget: ["doubao-seed-2.0-lite", "glm-4.7", "kimi-k2.5", "ark-code-latest"],
    },
  },
  "4sapi": {
    orchestrator: {
      reasoning: ["gpt-4o", "claude-3-7-sonnet-20250219"],
      balanced: ["gpt-4o", "claude-3-5-sonnet-20241022"],
      budget: ["gpt-4o-mini", "claude-3-5-sonnet-20241022"],
    },
    designer: {
      reasoning: ["gpt-4o", "claude-3-7-sonnet-20250219"],
      balanced: ["gpt-4o", "claude-3-5-sonnet-20241022"],
      budget: ["gpt-4o-mini", "claude-3-5-sonnet-20241022"],
    },
    performer: {
      reasoning: ["gpt-4o", "claude-3-7-sonnet-20250219"],
      balanced: ["gpt-4o", "claude-3-5-sonnet-20241022"],
      budget: ["gpt-4o-mini", "claude-3-5-sonnet-20241022"],
    },
  },
};

export interface TeamOperatingTemplate {
  id: TeamOperatingTemplateId;
  label: string;
  description: string;
  summary: string;
  agentTiers: Record<AgentId, ModelPresetTier>;
  agentSkills: Partial<Record<AgentId, AgentSkillId[]>>;
}

export type TeamOperatingFocusSectionId = Exclude<ControlCenterSectionId, "overview" | "about">;

export interface TeamOperatingQuickAction {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  actionLabel: string;
  tab: AppTab;
  controlCenterSectionId?: ControlCenterSectionId;
}

export interface TeamOperatingSurface {
  statusLabel: string;
  statusCopy: string;
  recommendedSectionIds: TeamOperatingFocusSectionId[];
  quickActions: TeamOperatingQuickAction[];
  homePrompts: string[];
  chatStarters: string[];
  recommendedWorkflowTemplateIds: string[];
  remoteOpsRecommendation: {
    automationMode: AutomationMode;
    remoteSupervisorEnabled: boolean;
    autoDispatchScheduledTasks: boolean;
    title: string;
    copy: string;
  };
}

export const TEAM_OPERATING_TEMPLATES: TeamOperatingTemplate[] = [
  {
    id: "engineering",
    label: "研发模式",
    description: "偏向规划、代码分析、实现和文档沉淀，适合产品搭建与迭代开发。",
    summary: "总调度与研究走更高质量，设计和内容保持平衡，客服降成本待命。",
    agentTiers: {
      orchestrator: "reasoning",
      explorer: "reasoning",
      writer: "balanced",
      designer: "balanced",
      performer: "budget",
      greeter: "budget",
    },
    agentSkills: {
      orchestrator: ["frontend", "doc_word"],
      explorer: ["frontend", "doc_excel"],
      writer: ["doc_word", "doc_ppt"],
      designer: ["frontend", "image_edit"],
      performer: ["doc_ppt"],
      greeter: ["doc_word"],
    },
  },
  {
    id: "support",
    label: "客服值守模式",
    description: "偏向高频对话、售后处理、口径统一和低成本持续在线。",
    summary: "客服与文案保持高频响应，总调度居中，研究和设计退到辅助位。",
    agentTiers: {
      orchestrator: "balanced",
      explorer: "budget",
      writer: "balanced",
      designer: "budget",
      performer: "budget",
      greeter: "balanced",
    },
    agentSkills: {
      orchestrator: ["doc_word"],
      explorer: ["doc_excel"],
      writer: ["doc_word"],
      designer: ["image_edit"],
      performer: ["doc_ppt"],
      greeter: ["doc_word", "doc_excel"],
    },
  },
  {
    id: "content",
    label: "内容矩阵模式",
    description: "偏向选题、脚本、视觉和发布协同，适合自动推文、视频和内容工单。",
    summary: "研究与脚本创作提权，视觉保持平衡，总调度负责节奏和分发。",
    agentTiers: {
      orchestrator: "balanced",
      explorer: "reasoning",
      writer: "balanced",
      designer: "balanced",
      performer: "reasoning",
      greeter: "budget",
    },
    agentSkills: {
      orchestrator: ["doc_word", "doc_ppt"],
      explorer: ["doc_excel", "doc_word"],
      writer: ["doc_word", "doc_ppt"],
      designer: ["image_edit", "screenshot"],
      performer: ["doc_ppt", "doc_word"],
      greeter: ["doc_word"],
    },
  },
];

export const TEAM_OPERATING_SURFACES: Record<TeamOperatingTemplateId, TeamOperatingSurface> = {
  engineering: {
    statusLabel: "研发推进",
    statusCopy: "优先盯执行链路和工作区上下文，适合产品搭建、联调和交付闭环。",
    recommendedSectionIds: ["execution", "workspace", "settings"],
    quickActions: [
      {
        id: "engineering-chat",
        eyebrow: "Build",
        title: "进入聊天推进实现",
        copy: "把需求拆成执行步骤，直接在主对话区继续研发上下文。",
        actionLabel: "打开聊天",
        tab: "tasks",
      },
      {
        id: "engineering-context",
        eyebrow: "Context",
        title: "进入聊天继续当前上下文",
        copy: "把文件、记忆和项目上下文带进主对话区，直接继续研发推进。",
        actionLabel: "打开聊天",
        tab: "tasks",
      },
      {
        id: "engineering-control",
        eyebrow: "Control",
        title: "检查模型与执行配置",
        copy: "确认团队档位、插件与执行设置是否适合当前开发阶段。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "execution",
      },
    ],
    homePrompts: [
      "基于当前项目上下文，帮我拆出今天最值得推进的研发任务，并给出最短交付路径。",
      "检查当前工作区、项目记忆和执行记录，告诉我下一步该改哪一块代码。",
      "按研发模式帮我生成一版可以直接开工的实现计划，优先标出风险和验证步骤。",
    ],
    chatStarters: [
      "先 review 当前方案，按研发模式告诉我最大的风险和遗漏。",
      "把这个开发任务拆成 3 个可以立即执行的小步骤。",
      "结合当前项目记忆和工作区上下文，直接给我一版实现方案。",
    ],
    recommendedWorkflowTemplateIds: ["launch-sprint", "research-loop", "meeting-debrief"],
    remoteOpsRecommendation: {
      automationMode: "supervised",
      remoteSupervisorEnabled: true,
      autoDispatchScheduledTasks: true,
      title: "研发模式建议保持监督自动化",
      copy: "研发阶段适合保留自动派发和远程监督，但不要直接切全自治，便于随时人工接管验证。",
    },
  },
  support: {
    statusLabel: "客服值守",
    statusCopy: "优先看业务实体、远程值守和渠道会话，让客户、工单和会话状态更直观。",
    recommendedSectionIds: ["entities", "remote", "channels", "execution"],
    quickActions: [
      {
        id: "support-chat",
        eyebrow: "Ops",
        title: "进入聊天处理当前问题",
        copy: "直接输入客户诉求、退款场景或待处理事项，让团队立即响应。",
        actionLabel: "打开聊天",
        tab: "tasks",
      },
      {
        id: "support-control",
        eyebrow: "Control",
        title: "查看值守与渠道面板",
        copy: "从控制台快速定位客户、线索、工单与渠道会话的积压情况。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "remote",
      },
      {
        id: "support-knowledge",
        eyebrow: "Knowledge",
        title: "查看知识与处理规则",
        copy: "把 SOP、退款规范和回复口径集中放到控制台统一维护。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "plugins",
      },
    ],
    homePrompts: [
      "帮我按客服值守模式梳理当前待处理客户、工单和渠道会话，并给出优先级。",
      "基于当前知识文档和 Desk Notes，生成一版客服值守 SOP 和接管建议。",
      "检查远程值守、审批队列和自动派发状态，告诉我哪里最容易卡住服务响应。",
    ],
    chatStarters: [
      "按客服值守模式，先告诉我当前最该优先处理的客户问题。",
      "结合现有 SOP 和知识文档，给我一版统一回复口径。",
      "把今天的客服待办拆成可自动处理与必须人工接管两部分。",
    ],
    recommendedWorkflowTemplateIds: ["research-loop", "meeting-debrief"],
    remoteOpsRecommendation: {
      automationMode: "autonomous",
      remoteSupervisorEnabled: true,
      autoDispatchScheduledTasks: true,
      title: "客服值守适合高自动化",
      copy: "客服场景更适合开启自动派发和远程监督，用自治模式持续值守，再由手机端做抽检和接管。",
    },
  },
  content: {
    statusLabel: "内容矩阵",
    statusCopy: "优先看内容任务和产物输出，适合脚本、视觉和发布协同。",
    recommendedSectionIds: ["entities", "artifacts", "execution"],
    quickActions: [
      {
        id: "content-chat",
        eyebrow: "Create",
        title: "进入聊天产出脚本",
        copy: "从一个选题开始，快速推进到脚本、标题和分发动作。",
        actionLabel: "打开聊天",
        tab: "tasks",
      },
      {
        id: "content-context",
        eyebrow: "Context",
        title: "进入聊天继续内容生产",
        copy: "把参考素材、内容规范和当前目标带回聊天区，直接推进脚本与发布动作。",
        actionLabel: "打开聊天",
        tab: "tasks",
      },
      {
        id: "content-control",
        eyebrow: "Control",
        title: "查看产物与实体面板",
        copy: "把内容工单、产物货架和执行记录串起来看，形成发布闭环。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "artifacts",
      },
    ],
    homePrompts: [
      "按内容矩阵模式，结合当前项目上下文给我今天的选题、脚本和发布优先级。",
      "检查内容任务、知识文档和工作流，给我一版可以直接执行的内容生产节奏表。",
      "帮我从当前上下文里提炼一轮内容选题，并拆成脚本、视觉和发布动作。",
    ],
    chatStarters: [
      "按内容矩阵模式，先给我今天最值得做的一个选题。",
      "把这个内容需求拆成脚本、视觉和分发三步。",
      "结合当前知识文档和项目记忆，给我一版可以直接发布的内容 brief。",
    ],
    recommendedWorkflowTemplateIds: ["content-topic-draft", "content-final-review", "content-publish-prep"],
    remoteOpsRecommendation: {
      automationMode: "supervised",
      remoteSupervisorEnabled: true,
      autoDispatchScheduledTasks: false,
      title: "内容模式建议半自动推进",
      copy: "内容生产适合保留远程监督，但默认关闭定时自动派发，避免未经确认就批量输出或发布。",
    },
  },
};

export interface PlatformFieldDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret?: boolean;
  hint?: string;
  toggleable?: boolean;
}

export interface PlatformDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  webhookBased: boolean;
  fields: PlatformFieldDef[];
}

export interface PlatformConfig {
  enabled: boolean;
  fields: Record<string, string>;
  requireOutboundApproval?: boolean;
  status: PlatformConnectionStatus;
  errorMsg?: string;
  detail?: string;
  accountLabel?: string;
  webhookUrl?: string;
  healthScore?: number;
  pendingEvents?: number;
  lastSyncedAt?: number;
  lastCheckedAt?: number;
  lastEventAt?: number;
  lastInboundAt?: number;
  lastInboundMessageKey?: string;
  lastInboundTarget?: string;
  lastOutboundSuccessAt?: number;
  lastOutboundFailureAt?: number;
  outboundRetryCount?: number;
  outboundCooldownUntil?: number;
  lastDebugAction?: "send_test_message" | "simulate_inbound" | "diagnose" | "probe_webhook";
  lastDebugOk?: boolean;
  lastDebugStatus?: "sent" | "completed" | "failed";
  lastDebugMessage?: string;
  lastDebugTarget?: string;
  lastDebugAt?: number;
  recentFailedMessages?: Array<{
    target: string;
    message: string;
    reason: string;
    at: number;
    retryCount: number;
  }>;
  debugHistory?: Array<{
    action: "send_test_message" | "simulate_inbound" | "diagnose" | "probe_webhook";
    ok: boolean;
    status: "sent" | "completed" | "failed";
    target?: string;
    message: string;
    at: number;
  }>;
}

export const PLATFORM_DEFINITIONS: PlatformDef[] = [
  {
    id: "telegram",
    name: "Telegram",
    emoji: "✈️",
    description: "通过 Telegram 机器人接收指令，智能体执行后自动回复。",
    webhookBased: false,
    fields: [
      {
        key: "botToken",
        label: "机器人令牌（Bot Token）",
        placeholder: "1234567890:ABCdefGHIjklMNO...",
        required: true,
        secret: true,
        hint: "从 @BotFather 创建机器人后获取",
      },
      {
        key: "proxy",
        label: "代理地址",
        placeholder: "http://127.0.0.1:7890 或 socks5://127.0.0.1:7890",
        required: false,
        hint: "Clash 默认 7890，V2Ray 默认 10809",
        toggleable: true,
      },
      {
        key: "defaultChatId",
        label: "默认会话 ID（Chat ID）",
        placeholder: "123456789",
        required: false,
        hint: "用于会议结束后主动发送文案",
      },
    ],
  },
  {
    id: "line",
    name: "LINE",
    emoji: "📱",
    description: "通过 LINE 官方账号 Webhook 接收消息并回复。",
    webhookBased: true,
    fields: [
      {
        key: "channelAccessToken",
        label: "频道访问令牌（Channel Access Token）",
        placeholder: "长期有效的频道访问令牌...",
        required: true,
        secret: true,
        hint: "LINE 开发者控制台 -> Messaging API",
      },
      {
        key: "channelSecret",
        label: "频道密钥（Channel Secret）",
        placeholder: "频道密钥...",
        required: true,
        secret: true,
      },
      {
        key: "webhookUrl",
        label: "Webhook 回调地址",
        placeholder: "https://your-domain.com/webhooks/line",
        required: false,
        hint: "用于标记已经配置公网回调地址",
      },
    ],
  },
  {
    id: "feishu",
    name: "飞书",
    emoji: "🪽",
    description: "通过飞书机器人 Webhook 接收消息并回复。",
    webhookBased: true,
    fields: [
      {
        key: "appId",
        label: "应用 ID（App ID）",
        placeholder: "cli_xxxxxxxxxx",
        required: true,
        hint: "飞书开放平台 -> 应用凭证",
      },
      {
        key: "appSecret",
        label: "应用密钥（App Secret）",
        placeholder: "应用密钥...",
        required: true,
        secret: true,
      },
      {
        key: "verifyToken",
        label: "验证令牌（Verification Token）",
        placeholder: "验证令牌...",
        required: true,
        secret: true,
      },
      {
        key: "encryptKey",
        label: "加密密钥（Encrypt Key，可选）",
        placeholder: "留空则不加密",
        required: false,
        secret: true,
      },
      {
        key: "defaultOpenId",
        label: "默认用户 Open ID",
        placeholder: "ou_xxxxxxxxxx",
        required: false,
        hint: "用于会议结束后主动发送文案",
      },
      {
        key: "webhookUrl",
        label: "Webhook 回调地址",
        placeholder: "https://your-domain.com/webhooks/feishu",
        required: false,
        hint: "用于标记已经配置公网回调地址",
      },
    ],
  },
  {
    id: "wecom",
    name: "企业微信",
    emoji: "💼",
    description: "通过企业微信自建应用接收员工消息。",
    webhookBased: true,
    fields: [
      {
        key: "corpId",
        label: "企业 ID（Corp ID）",
        placeholder: "ww...",
        required: true,
        hint: "企业微信管理后台 -> 我的企业",
      },
      {
        key: "agentId",
        label: "应用 ID（Agent ID）",
        placeholder: "1000001",
        required: true,
        hint: "应用管理 -> 自建应用 -> AgentId",
      },
      {
        key: "secret",
        label: "应用密钥（Secret）",
        placeholder: "应用密钥...",
        required: true,
        secret: true,
      },
      {
        key: "token",
        label: "回调令牌（Token）",
        placeholder: "自定义回调令牌...",
        required: true,
        secret: true,
      },
      {
        key: "encodingAESKey",
        label: "消息加密密钥（EncodingAESKey）",
        placeholder: "43 位字符...",
        required: true,
        secret: true,
      },
      {
        key: "webhookUrl",
        label: "Webhook 回调地址",
        placeholder: "https://your-domain.com/webhooks/wecom",
        required: false,
        hint: "用于标记已经配置公网回调地址",
      },
    ],
  },
];

export function getModelsForProvider(providerId: string): string[] {
  if (PROVIDER_MODELS[providerId]) return PROVIDER_MODELS[providerId]!;

  const preset = PROVIDER_PRESETS.find(p => providerId.startsWith(`${p.id}-`) || providerId === p.id);
  return preset ? (PROVIDER_MODELS[preset.id] ?? []) : [];
}

function inferProviderPresetIdFromBaseUrl(baseUrl: string | undefined): string | null {
  const normalizedBaseUrl = String(baseUrl || "").trim().toLowerCase();
  if (!normalizedBaseUrl) return null;
  if (normalizedBaseUrl.includes("coding.dashscope.aliyuncs.com") || normalizedBaseUrl.includes("dashscope")) return "aliyun-coding";
  if (normalizedBaseUrl.includes("ark.cn-beijing.volces.com") || normalizedBaseUrl.includes("volces.com/api/coding") || normalizedBaseUrl.includes("volcengine.com")) return "volcengine-coding";
  if (normalizedBaseUrl.includes("api.anthropic.com")) return "anthropic";
  if (normalizedBaseUrl.includes("api.openai.com")) return "openai";
  if (normalizedBaseUrl.includes("siliconflow")) return "siliconflow";
  if (normalizedBaseUrl.includes("api.deepseek.com") || normalizedBaseUrl.includes("deepseek")) return "deepseek";
  if (normalizedBaseUrl.includes("4sapi")) return "4sapi";
  return null;
}

function resolveProviderPresetId(providerId: string): string | null {
  if (PROVIDER_MODELS[providerId] || PROVIDER_MODEL_PRESETS[providerId]) return providerId;
  const preset = PROVIDER_PRESETS.find(p => providerId.startsWith(`${p.id}-`) || providerId === p.id);
  return preset?.id ?? null;
}

function resolveProviderPresetIdFromProvider(provider: Pick<ModelProvider, "id" | "baseUrl"> | null | undefined): string | null {
  if (!provider) return null;
  return resolveProviderPresetId(provider.id) ?? inferProviderPresetIdFromBaseUrl(provider.baseUrl);
}

export function isProviderConfigured(
  provider: Pick<ModelProvider, "id" | "apiKey" | "baseUrl"> | null | undefined,
): boolean {
  if (!provider) return false;

  const apiKey = provider.apiKey.trim();
  const baseUrl = provider.baseUrl.trim();
  const presetId = resolveProviderPresetId(provider.id) ?? inferProviderPresetIdFromBaseUrl(baseUrl);
  const isCustomProvider = !presetId || presetId === "custom";

  if (!apiKey) return false;
  if (isCustomProvider) return Boolean(baseUrl);
  return true;
}

export function getConfiguredProviders<T extends Pick<ModelProvider, "id" | "apiKey" | "baseUrl">>(providers: T[]): T[] {
  return providers.filter(provider => isProviderConfigured(provider));
}

export function getModelsForProviderInstance(
  provider: Pick<ModelProvider, "id" | "baseUrl"> | null | undefined,
): string[] {
  const presetId = resolveProviderPresetIdFromProvider(provider);
  if (!presetId) return [];
  return PROVIDER_MODELS[presetId] ?? [];
}

export function getRecommendedModelForProviderInstance(
  provider: Pick<ModelProvider, "id" | "baseUrl"> | null | undefined,
  tier: ModelPresetTier,
): string | null {
  const presetId = resolveProviderPresetIdFromProvider(provider);
  if (!presetId) return null;
  return PROVIDER_MODEL_PRESETS[presetId]?.[tier] ?? null;
}

export function getRecommendedModelForProvider(providerId: string, tier: ModelPresetTier): string | null {
  const presetId = resolveProviderPresetId(providerId);
  if (!presetId) return null;
  return PROVIDER_MODEL_PRESETS[presetId]?.[tier] ?? null;
}

function uniqueModels(models: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }
  return result;
}

function getRoleSpecificModelsForProvider(providerId: string, agentId: AgentId, tier: ModelPresetTier): string[] {
  const presetId = resolveProviderPresetId(providerId);
  if (!presetId) return [];

  const availableModels = getModelsForProvider(providerId);
  const availableSet = new Set(availableModels);
  const roleSpecific =
    PROVIDER_AGENT_MODEL_OVERRIDES[presetId]?.[agentId]?.[tier]
    ?? PROVIDER_AGENT_MODEL_OVERRIDES[presetId]?.[agentId]?.[AGENT_MODEL_ROUTING_PROFILES[agentId].defaultTier]
    ?? [];

  return uniqueModels(roleSpecific).filter(model => availableSet.has(model));
}

function getRoleSpecificModelsForConfiguredProvider(
  provider: Pick<ModelProvider, "id" | "baseUrl"> | null | undefined,
  agentId: AgentId,
  tier: ModelPresetTier,
): string[] {
  const presetId = resolveProviderPresetIdFromProvider(provider);
  if (!presetId) return [];

  const availableModels = getModelsForProviderInstance(provider);
  const availableSet = new Set(availableModels);
  const roleSpecific =
    PROVIDER_AGENT_MODEL_OVERRIDES[presetId]?.[agentId]?.[tier]
    ?? PROVIDER_AGENT_MODEL_OVERRIDES[presetId]?.[agentId]?.[AGENT_MODEL_ROUTING_PROFILES[agentId].defaultTier]
    ?? [];

  return uniqueModels(roleSpecific).filter(model => availableSet.has(model));
}

function getRoleAwareModelsForProvider(providerId: string, agentId: AgentId, tier: ModelPresetTier): string[] {
  const availableModels = getModelsForProvider(providerId);
  const availableSet = new Set(availableModels);
  const tierDefault = getRecommendedModelForProvider(providerId, tier);
  const roleSpecific = getRoleSpecificModelsForProvider(providerId, agentId, tier);

  return uniqueModels([...roleSpecific, tierDefault, ...availableModels]).filter(model => availableSet.has(model));
}

export function getAgentModelRoutingProfile(agentId: AgentId): AgentModelRoutingProfile {
  return AGENT_MODEL_ROUTING_PROFILES[agentId];
}

export interface AgentModelSelection {
  providerId: string;
  model: string | null;
  tier: ModelPresetTier;
  usedProviderFallback: boolean;
}

export function getRecommendedModelSelectionForAgent(
  providers: Array<Pick<ModelProvider, "id" | "apiKey" | "baseUrl">>,
  preferredProviderId: string | null | undefined,
  agentId: AgentId,
  tier: ModelPresetTier = getRecommendedTierForAgent(agentId),
): AgentModelSelection | null {
  const profile = getAgentModelRoutingProfile(agentId);
  const configuredProviders = getConfiguredProviders(providers);
  const configuredProviderIds = configuredProviders.map(provider => provider.id);
  const providerById = new Map(configuredProviders.map(provider => [provider.id, provider]));
  const preferredProviderPresetId = preferredProviderId ? resolveProviderPresetId(preferredProviderId) : null;
  const primaryProviderId =
    (preferredProviderId && providerById.has(preferredProviderId) ? preferredProviderId : null)
    ?? (preferredProviderPresetId
      ? configuredProviders.find(provider => resolveProviderPresetIdFromProvider(provider) === preferredProviderPresetId)?.id
      : null)
    ?? configuredProviderIds[0];

  if (!primaryProviderId) return null;

  const primaryProvider = providerById.get(primaryProviderId);

  const primaryRoleSpecific = getRoleSpecificModelsForConfiguredProvider(primaryProvider, agentId, tier);
  if (primaryRoleSpecific[0]) {
    return {
      providerId: primaryProviderId,
      model: primaryRoleSpecific[0],
      tier,
      usedProviderFallback: false,
    };
  }

  if (profile.allowProviderFallback) {
    const preferredConfiguredProviderIds = (profile.preferredProviderIds ?? []).flatMap(providerId =>
      configuredProviders
        .filter(provider => resolveProviderPresetIdFromProvider(provider) === providerId)
        .map(provider => provider.id),
    );
    const fallbackProviderIds = uniqueModels([
      ...preferredConfiguredProviderIds,
      ...configuredProviderIds,
    ]);

    for (const providerId of fallbackProviderIds) {
      if (!providerId || providerId === primaryProviderId) continue;
      const provider = providerById.get(providerId);
      const roleSpecificModels = getRoleSpecificModelsForConfiguredProvider(provider, agentId, tier);
      if (!roleSpecificModels[0]) continue;

      return {
        providerId,
        model: roleSpecificModels[0],
        tier,
        usedProviderFallback: true,
      };
    }
  }

  const defaultModel = getRecommendedModelForProviderInstance(primaryProvider, tier)
    ?? getModelsForProviderInstance(primaryProvider)[0]
    ?? null;
  return {
    providerId: primaryProviderId,
    model: defaultModel,
    tier,
    usedProviderFallback: false,
  };
}

export function inferRecommendedModelTier(providerId: string, model: string): ModelPresetTier | null {
  const presetId = resolveProviderPresetId(providerId);
  if (!presetId || !model) return null;
  const presets = PROVIDER_MODEL_PRESETS[presetId];
  if (!presets) return null;

  if (presets.reasoning === model) return "reasoning";
  if (presets.balanced === model) return "balanced";
  if (presets.budget === model) return "budget";
  return null;
}

export function getRecommendedTierForAgent(agentId: AgentId): ModelPresetTier {
  return AGENT_MODEL_ROUTING_PROFILES[agentId]?.defaultTier ?? AGENT_RECOMMENDED_MODEL_TIERS[agentId];
}

export function getTeamOperatingTemplate(id: TeamOperatingTemplateId): TeamOperatingTemplate | null {
  return TEAM_OPERATING_TEMPLATES.find(template => template.id === id) ?? null;
}
