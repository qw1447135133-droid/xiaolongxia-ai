import type { AgentId, AgentState, AgentStatus, CostReport, Task, TaskComplexity } from "./types.js";
import { AGENT_META } from "./types.js";
import EventEmitter from "eventemitter3";

// 算力路由：根据任务复杂度选择模型
export class ModelRouter {
  // 优先使用 SiliconFlow 聚合接口，降低成本
  static route(complexity: TaskComplexity): { model: string; baseUrl: string } {
    switch (complexity) {
      case "high":
        return { model: "deepseek-r1", baseUrl: "https://api.siliconflow.cn/v1" };
      case "medium":
        return { model: "Qwen/Qwen2.5-72B-Instruct", baseUrl: "https://api.siliconflow.cn/v1" };
      case "low":
        return { model: "Qwen/Qwen2.5-7B-Instruct", baseUrl: "https://api.siliconflow.cn/v1" };
    }
  }
}

// 全局看板状态管理
export class Dashboard extends EventEmitter {
  private agents: Map<AgentId, AgentState> = new Map();
  private tasks: Task[] = [];
  private costReports: CostReport[] = [];

  constructor() {
    super();
    // 初始化所有 agent 为 idle
    for (const [id, meta] of Object.entries(AGENT_META) as [AgentId, typeof AGENT_META[AgentId]][]) {
      this.agents.set(id, {
        id,
        name: meta.name,
        emoji: meta.emoji,
        status: "idle",
        tokenUsage: 0,
        lastUpdated: Date.now(),
      });
    }
  }

  setAgentStatus(id: AgentId, status: AgentStatus, currentTask?: string) {
    const agent = this.agents.get(id)!;
    agent.status = status;
    agent.currentTask = currentTask;
    agent.lastUpdated = Date.now();
    this.emit("agent:update", agent);
  }

  addTokenUsage(id: AgentId, tokens: number, model: string) {
    const agent = this.agents.get(id)!;
    agent.tokenUsage += tokens;
    // 粗略估算成本 (每 1M token ~$0.5)
    const estimatedCostUsd = (tokens / 1_000_000) * 0.5;
    const report: CostReport = { agentId: id, model, tokens, estimatedCostUsd, timestamp: Date.now() };
    this.costReports.push(report);
    this.emit("cost:update", report);
  }

  addTask(task: Task) {
    this.tasks.push(task);
    this.emit("task:add", task);
  }

  updateTask(id: string, updates: Partial<Task>) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      Object.assign(task, updates);
      this.emit("task:update", task);
    }
  }

  getSnapshot() {
    return {
      agents: Array.from(this.agents.values()),
      tasks: this.tasks,
      totalTokens: this.costReports.reduce((s, r) => s + r.tokens, 0),
      totalCostUsd: this.costReports.reduce((s, r) => s + r.estimatedCostUsd, 0),
    };
  }

  printStatus() {
    const STATUS_EMOJI: Record<AgentStatus, string> = { idle: "🟢", running: "🟡", error: "🔴" };
    console.log("\n=== 小龙虾团队状态 ===");
    for (const agent of this.agents.values()) {
      const s = STATUS_EMOJI[agent.status];
      const task = agent.currentTask ? ` → ${agent.currentTask}` : "";
      console.log(`${s} ${agent.emoji} ${agent.name}${task}`);
    }
    const snap = this.getSnapshot();
    console.log(`\n💰 总消耗: ${snap.totalTokens.toLocaleString()} tokens (~$${snap.totalCostUsd.toFixed(4)})`);
    console.log("====================\n");
  }
}
