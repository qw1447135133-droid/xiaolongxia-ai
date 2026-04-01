// 核心类型（内联，避免 workspace 依赖问题）
export type AgentId = "orchestrator" | "explorer" | "writer" | "designer" | "performer" | "greeter";
export type AgentStatus = "idle" | "running" | "error";
export type TaskComplexity = "high" | "medium" | "low";
export type TaskStatus = "pending" | "running" | "done" | "failed";

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
  isUserMessage?: boolean;  // 标记是否为用户消息
}

export interface Activity {
  id: string;
  agentId: AgentId;
  type: "task_start" | "task_done" | "task_fail" | "meeting" | "dispatch";
  summary: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
  /** 关联对话任务 id，用于从活动记录跳转到气泡 */
  taskId?: string;
  /** 产生该活动时的会话 id（前端写入） */
  sessionId?: string;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byAgent: Record<AgentId, number>;
}

// ── 模型供应商配置 ──
export interface ModelProvider {
  id: string;          // 唯一标识，如 "openai" / "siliconflow" / "custom-1"
  name: string;        // 显示名称
  apiKey: string;
  baseUrl: string;     // 如 https://api.openai.com/v1
}

// ── 单个 Agent 的个性化配置 ──
export interface AgentConfig {
  id: AgentId;
  name: string;        // 自定义名字
  emoji: string;       // 自定义 emoji
  personality: string; // 性格/system prompt 补充
  model: string;       // 模型名，如 gpt-4o / Qwen/Qwen2.5-72B-Instruct
  providerId: string;  // 关联的 ModelProvider.id
}

// 默认 agent 元数据（不可变，用于初始化）
export const AGENT_META: Record<AgentId, { name: string; emoji: string; badge: string; defaultPersonality: string }> = {
  orchestrator: { name: "虾总管",   emoji: "🦞", badge: "badge-orchestrator", defaultPersonality: "你是跨境电商 AI 团队的总调度员，负责任务拆解和团队协调。" },
  explorer:     { name: "探海龙虾", emoji: "🔍", badge: "badge-explorer",     defaultPersonality: "你是跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析。提供具体可操作的洞察。" },
  writer:       { name: "执笔龙虾", emoji: "✍️", badge: "badge-writer",       defaultPersonality: "你是跨境电商文案专家，专注多语种文案创作、SEO 优化标题和商品详情页撰写。输出高转化率文案。" },
  designer:     { name: "幻影龙虾", emoji: "🎨", badge: "badge-designer",     defaultPersonality: "你是电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出设计方案说明。" },
  performer:    { name: "戏精龙虾", emoji: "🎬", badge: "badge-performer",    defaultPersonality: "你是短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。" },
  greeter:      { name: "迎客龙虾", emoji: "💬", badge: "badge-greeter",      defaultPersonality: "你是多语种客服专家，专注客服话术、评论回复模板和买家互动策略。保持友好专业语气。" },
};

// 内置供应商预设
export const PROVIDER_PRESETS: Omit<ModelProvider, "apiKey">[] = [
  { id: "anthropic",     name: "Anthropic (Claude)",  baseUrl: "https://api.anthropic.com" },
  { id: "openai",          name: "OpenAI",              baseUrl: "https://api.openai.com/v1" },
  { id: "siliconflow",     name: "SiliconFlow",         baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "deepseek",        name: "DeepSeek",            baseUrl: "https://api.deepseek.com/v1" },
  { id: "aliyun",          name: "阿里云百炼",           baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "aliyun-coding",   name: "阿里云百炼 Coding Plan", baseUrl: "https://coding.dashscope.aliyuncs.com/v1" },
  { id: "4sapi",           name: "4sAPI",               baseUrl: "https://api.4sapi.com/v1" },
  { id: "custom",          name: "自定义",               baseUrl: "" },
];

// 各供应商常用模型
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
  // 阿里云百炼 - 标准接口（普通 API Key）
  aliyun: [
    "qwen3.5-plus",           // 文本生成、深度思考、视觉理解
    "qwen3-max-2026-01-23",   // 文本生成、深度思考
    "qwen3-coder-next",       // 代码生成
    "qwen3-coder-plus",       // 代码生成
    "glm-5",                  // 智谱 - 文本生成、深度思考
    "glm-4.7",                // 智谱 - 文本生成、深度思考
    "kimi-k2.5",              // Kimi - 文本生成、深度思考、视觉理解
    "MiniMax-M2.5",           // MiniMax - 文本生成、深度思考
  ],
  // 阿里云百炼 Coding Plan - 需要专属 API Key
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

// ── 消息平台集成 ──

export interface PlatformFieldDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret?: boolean;
  hint?: string;
  toggleable?: boolean; // 带开关，关闭时不传该字段
}

export interface PlatformDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  webhookBased: boolean; // true = 需要公网 Webhook 地址
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
    description: "通过 Telegram Bot 接收指令，Agent 执行后自动回复",
    webhookBased: false,
    fields: [
      { key: "botToken", label: "Bot Token", placeholder: "1234567890:ABCdefGHIjklMNO...", required: true, secret: true, hint: "从 @BotFather 创建 Bot 后获取" },
      { key: "proxy", label: "代理地址", placeholder: "http://127.0.0.1:7890 或 socks5://127.0.0.1:7890", required: false, hint: "Clash 默认 7890，V2Ray 默认 10809", toggleable: true },
      { key: "defaultChatId", label: "默认 Chat ID", placeholder: "123456789", required: false, hint: "用于会议结束后主动发送文档" },
    ],
  },
  {
    id: "line",
    name: "LINE",
    emoji: "💚",
    description: "通过 LINE Official Account Webhook 接收消息并回复",
    webhookBased: true,
    fields: [
      { key: "channelAccessToken", label: "Channel Access Token", placeholder: "Long lived channel access token...", required: true, secret: true, hint: "LINE Developers Console → Messaging API" },
      { key: "channelSecret", label: "Channel Secret", placeholder: "Channel secret...", required: true, secret: true },
    ],
  },
  {
    id: "feishu",
    name: "飞书",
    emoji: "🪶",
    description: "通过飞书机器人 Webhook 接收消息并回复",
    webhookBased: true,
    fields: [
      { key: "appId", label: "App ID", placeholder: "cli_xxxxxxxxxx", required: true, hint: "飞书开放平台 → 应用凭证" },
      { key: "appSecret", label: "App Secret", placeholder: "App Secret...", required: true, secret: true },
      { key: "verifyToken", label: "Verification Token", placeholder: "Verification Token...", required: true, secret: true },
      { key: "encryptKey", label: "Encrypt Key（可选）", placeholder: "留空则不加密", required: false, secret: true },
      { key: "defaultOpenId", label: "默认 Open ID", placeholder: "ou_xxxxxxxxxx", required: false, hint: "用于会议结束后主动发送文档" },
    ],
  },
  {
    id: "wecom",
    name: "企业微信",
    emoji: "💼",
    description: "通过企业微信自建应用接收员工消息",
    webhookBased: true,
    fields: [
      { key: "corpId", label: "Corp ID", placeholder: "ww...", required: true, hint: "企业微信管理后台 → 我的企业" },
      { key: "agentId", label: "Agent ID", placeholder: "1000001", required: true, hint: "应用管理 → 自建应用 → AgentId" },
      { key: "secret", label: "Secret", placeholder: "应用 Secret...", required: true, secret: true },
      { key: "token", label: "Token", placeholder: "自定义 Token...", required: true, secret: true },
      { key: "encodingAESKey", label: "EncodingAESKey", placeholder: "43 位字符...", required: true, secret: true },
    ],
  },
];

// 根据 provider id（可能带随机后缀如 aliyun-coding-abc123）找模型列表
export function getModelsForProvider(providerId: string): string[] {
  // 精确匹配
  if (PROVIDER_MODELS[providerId]) return PROVIDER_MODELS[providerId]!;
  // 前缀匹配：aliyun-coding-abc123 → aliyun-coding
  const preset = PROVIDER_PRESETS.find(p => providerId.startsWith(p.id + "-") || providerId === p.id);
  return preset ? (PROVIDER_MODELS[preset.id] ?? []) : [];
}
