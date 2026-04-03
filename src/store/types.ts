export type AgentId = "orchestrator" | "explorer" | "writer" | "designer" | "performer" | "greeter";
export type AgentStatus = "idle" | "running" | "error";
export type TaskComplexity = "high" | "medium" | "low";
export type TaskStatus = "pending" | "running" | "done" | "failed";
export type AppTab = "dashboard" | "tasks" | "workspace" | "meeting" | "settings";
export type AutomationMode = "manual" | "supervised" | "autonomous";

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
  type: "task_start" | "task_done" | "task_fail" | "meeting" | "dispatch";
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
  status: ExecutionRunStatus;
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
  status: "idle" | "connected" | "error";
  errorMsg?: string;
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
    ],
  },
];

export function getModelsForProvider(providerId: string): string[] {
  if (PROVIDER_MODELS[providerId]) return PROVIDER_MODELS[providerId]!;

  const preset = PROVIDER_PRESETS.find(p => providerId.startsWith(`${p.id}-`) || providerId === p.id);
  return preset ? (PROVIDER_MODELS[preset.id] ?? []) : [];
}
