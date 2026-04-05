import type { DesktopInputRetrySuggestion } from "@/types/electron-api";

export type AgentId = "orchestrator" | "explorer" | "writer" | "designer" | "performer" | "greeter";
export type AgentStatus = "idle" | "running" | "error";
export type TaskComplexity = "high" | "medium" | "low";
export type TaskStatus = "pending" | "running" | "done" | "failed";
export type AppTab = "dashboard" | "tasks" | "workspace" | "dispatch" | "meeting" | "settings";
export type AutomationMode = "manual" | "supervised" | "autonomous";
export type ControlCenterSectionId =
  | "overview"
  | "readiness"
  | "entities"
  | "remote"
  | "execution"
  | "desktop"
  | "workspace"
  | "workflow"
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

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  category: string;
}

export const AGENT_SKILLS = [
  {
    id: "frontend",
    name: "前端开发",
    description: "构建页面、组件、交互和样式改造。",
    category: "基础技能",
  },
  {
    id: "doc_word",
    name: "Word 文档",
    description: "编写和整理 Word 文档、方案、报告。",
    category: "文档编写",
  },
  {
    id: "doc_ppt",
    name: "PPT 演示",
    description: "编写和生成汇报、方案、路演幻灯片。",
    category: "文档编写",
  },
  {
    id: "doc_excel",
    name: "Excel 表格",
    description: "整理表格、数据台账、公式与统计内容。",
    category: "文档编写",
  },
  {
    id: "screenshot",
    name: "截图处理",
    description: "截取界面、保存关键画面并辅助问题说明。",
    category: "图像处理",
  },
  {
    id: "image_edit",
    name: "图片修改",
    description: "裁剪、标注、替换和优化现有图片素材。",
    category: "图像处理",
  },
] as const satisfies readonly AgentSkill[];

export type AgentSkillId = typeof AGENT_SKILLS[number]["id"];

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
    name: "虾总管",
    emoji: "🦞",
    badge: "badge-orchestrator",
    defaultPersonality: "你是跨境电商 AI 团队的总调度员，负责任务拆解和团队协调。",
  },
  explorer: {
    name: "探海龙虾",
    emoji: "🔎",
    badge: "badge-explorer",
    defaultPersonality: "你是跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析，提供具体可执行的洞察。",
  },
  writer: {
    name: "执笔龙虾",
    emoji: "✍️",
    badge: "badge-writer",
    defaultPersonality: "你是跨境电商文案专家，专注多语种文案创作、SEO 标题优化和商品详情页撰写，输出高转化率文案。",
  },
  designer: {
    name: "幻影龙虾",
    emoji: "🎨",
    badge: "badge-designer",
    defaultPersonality: "你是电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出设计方案说明。",
  },
  performer: {
    name: "戏精龙虾",
    emoji: "🎭",
    badge: "badge-performer",
    defaultPersonality: "你是短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。",
  },
  greeter: {
    name: "迎客龙虾",
    emoji: "💬",
    badge: "badge-greeter",
    defaultPersonality: "你是多语种客服专家，专注客服话术、评论回复模板和买家互动策略，保持友好专业语气。",
  },
};

export const PROVIDER_PRESETS: Omit<ModelProvider, "apiKey">[] = [
  { id: "anthropic", name: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "siliconflow", name: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "aliyun", name: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "aliyun-coding", name: "阿里云百炼 Coding Plan", baseUrl: "https://coding.dashscope.aliyuncs.com/v1" },
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
  aliyun: [
    "qwen3.5-plus",
    "qwen3-max-2026-01-23",
    "qwen3-coder-next",
    "qwen3-coder-plus",
    "glm-5",
    "glm-4.7",
    "kimi-k2.5",
    "MiniMax-M2.5",
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
  aliyun: {
    reasoning: "qwen3-max-2026-01-23",
    balanced: "qwen3.5-plus",
    budget: "glm-4.7",
  },
  "aliyun-coding": {
    reasoning: "qwen3-coder-next",
    balanced: "qwen3-coder-plus",
    budget: "glm-4.7",
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
    statusCopy: "优先盯执行链路、工作流和工作区上下文，适合产品搭建、联调和交付闭环。",
    recommendedSectionIds: ["execution", "workflow", "workspace", "settings"],
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
        id: "engineering-workspace",
        eyebrow: "Desk",
        title: "打开工作区整理上下文",
        copy: "把文件、记忆、Desk Notes 和引用面板收束到当前项目里。",
        actionLabel: "进入工作区",
        tab: "workspace",
      },
      {
        id: "engineering-control",
        eyebrow: "Control",
        title: "检查模型与工作流",
        copy: "确认团队档位、插件与工作流是否适合当前开发阶段。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "workflow",
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
        id: "support-workspace",
        eyebrow: "Desk",
        title: "整理口径与知识上下文",
        copy: "把 SOP、退款规范和话术记忆收进当前项目工作区。",
        actionLabel: "进入工作区",
        tab: "workspace",
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
    statusCopy: "优先看工作流、内容任务和产物输出，适合脚本、视觉和发布协同。",
    recommendedSectionIds: ["workflow", "entities", "artifacts", "execution"],
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
        id: "content-workspace",
        eyebrow: "Desk",
        title: "整理素材与知识记忆",
        copy: "把参考素材、封面方向和内容规范收进工作区一起复用。",
        actionLabel: "进入工作区",
        tab: "workspace",
      },
      {
        id: "content-control",
        eyebrow: "Control",
        title: "查看工作流与产物面板",
        copy: "把内容工单、产物货架和执行记录串起来看，形成发布闭环。",
        actionLabel: "打开控制台",
        tab: "settings",
        controlCenterSectionId: "workflow",
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

function resolveProviderPresetId(providerId: string): string | null {
  if (PROVIDER_MODELS[providerId] || PROVIDER_MODEL_PRESETS[providerId]) return providerId;
  const preset = PROVIDER_PRESETS.find(p => providerId.startsWith(`${p.id}-`) || providerId === p.id);
  return preset?.id ?? null;
}

export function getRecommendedModelForProvider(providerId: string, tier: ModelPresetTier): string | null {
  const presetId = resolveProviderPresetId(providerId);
  if (!presetId) return null;
  return PROVIDER_MODEL_PRESETS[presetId]?.[tier] ?? null;
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
  return AGENT_RECOMMENDED_MODEL_TIERS[agentId];
}

export function getTeamOperatingTemplate(id: TeamOperatingTemplateId): TeamOperatingTemplate | null {
  return TEAM_OPERATING_TEMPLATES.find(template => template.id === id) ?? null;
}
