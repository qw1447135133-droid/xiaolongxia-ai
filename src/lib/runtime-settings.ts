// 服务端运行时配置存储（内存单例）
// 前端通过 POST /api/settings 同步配置到服务端
import type { AgentId, AgentConfig, ModelProvider } from "@/store/types";

export interface RuntimeSettings {
  providers: ModelProvider[];
  agentConfigs: Record<AgentId, AgentConfig>;
}

let _settings: RuntimeSettings = {
  providers: [],
  agentConfigs: {} as Record<AgentId, AgentConfig>,
};

export function getSettings(): RuntimeSettings {
  return _settings;
}

// 检查是否有任何可用的 API Key（env 变量 或 settings 里配置的 provider）
export function hasAnyApiKey(): boolean {
  if (process.env.OPENAI_API_KEY || process.env.SILICONFLOW_API_KEY) return true;
  return _settings.providers.some(p => p.apiKey.trim().length > 0);
}

export function updateSettings(s: Partial<RuntimeSettings>) {
  _settings = { ..._settings, ...s };
}

// 根据 agentId 获取该 agent 应使用的 OpenAI client 参数
export function getAgentClientParams(agentId: AgentId): {
  apiKey: string;
  baseURL: string | undefined;
  model: string;
  systemPrompt: string;
} {
  const config = _settings.agentConfigs[agentId];
  const provider = config?.providerId
    ? _settings.providers.find(p => p.id === config.providerId)
    : null;

  // 优先级：agent 专属 provider > 环境变量
  const apiKey = provider?.apiKey
    || process.env.OPENAI_API_KEY
    || process.env.SILICONFLOW_API_KEY
    || "";

  const baseURL = provider?.baseUrl
    || (process.env.SILICONFLOW_API_KEY ? "https://api.siliconflow.cn/v1" : undefined)
    || process.env.OPENAI_BASE_URL;

  const model = config?.model || getDefaultModel(baseURL);

  const systemPrompt = config?.personality || "";

  return { apiKey, baseURL, model, systemPrompt };
}

function getDefaultModel(baseURL?: string): string {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (baseURL?.includes("siliconflow")) return "Qwen/Qwen2.5-72B-Instruct";
  if (baseURL?.includes("dashscope")) return "qwen3.5-plus";
  if (baseURL?.includes("deepseek")) return "deepseek-chat";
  return "gpt-4o-mini";
}
