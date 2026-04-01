// 核心类型定义
export type AgentId =
  | "orchestrator"   // 虾总管
  | "explorer"       // 探海龙虾
  | "writer"         // 执笔龙虾
  | "designer"       // 幻影龙虾
  | "performer"      // 戏精龙虾
  | "greeter";       // 迎客龙虾

export type AgentStatus = "idle" | "running" | "error";

export type TaskComplexity = "high" | "medium" | "low";

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
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  createdAt: number;
  completedAt?: number;
}

export interface CostReport {
  agentId: AgentId;
  model: string;
  tokens: number;
  estimatedCostUsd: number;
  timestamp: number;
}

export const AGENT_META: Record<AgentId, { name: string; emoji: string; description: string }> = {
  orchestrator: { name: "虾总管", emoji: "🦞", description: "接收指令，拆解任务并调度其他龙虾" },
  explorer:     { name: "探海龙虾", emoji: "🔍", description: "爬取全网竞品数据与选品趋势" },
  writer:       { name: "执笔龙虾", emoji: "✍️", description: "多语种文案、SEO 标题与详情页撰写" },
  designer:     { name: "幻影龙虾", emoji: "🎨", description: "生成商品图、海报与短视频素材" },
  performer:    { name: "戏精龙虾", emoji: "🎬", description: "数字人视频生成与多平台矩阵发布" },
  greeter:      { name: "迎客龙虾", emoji: "💬", description: "多语种智能客服与评论互动" },
};
