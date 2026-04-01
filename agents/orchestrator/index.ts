import { Codex } from "@openai/codex-sdk";
import { Dashboard, ModelRouter } from "../../core/index.js";
import type { AgentId, Task, TaskComplexity } from "../../core/index.js";
import { randomUUID } from "crypto";

// 任务分配规则：根据关键词判断交给哪只龙虾
const ROUTING_RULES: Array<{ keywords: string[]; agent: AgentId; complexity: TaskComplexity }> = [
  { keywords: ["竞品", "选品", "爬取", "趋势", "数据分析", "市场调研"], agent: "explorer", complexity: "medium" },
  { keywords: ["文案", "标题", "SEO", "详情页", "描述", "翻译", "多语种"], agent: "writer", complexity: "medium" },
  { keywords: ["图片", "海报", "设计", "素材", "banner", "视觉"], agent: "designer", complexity: "high" },
  { keywords: ["视频", "数字人", "TikTok", "抖音", "发布", "矩阵"], agent: "performer", complexity: "high" },
  { keywords: ["客服", "评论", "回复", "售后", "问答", "投诉"], agent: "greeter", complexity: "low" },
];

export class Orchestrator {
  private codex: Codex;
  private dashboard: Dashboard;
  private agentThreads: Map<AgentId, ReturnType<Codex["startThread"]>> = new Map();

  constructor(dashboard: Dashboard, apiKey: string, baseUrl?: string) {
    this.dashboard = dashboard;
    this.codex = new Codex({
      env: { OPENAI_API_KEY: apiKey, ...(baseUrl ? { OPENAI_BASE_URL: baseUrl } : {}) },
    });
  }

  // 根据指令内容路由到对应 agent
  private routeTask(instruction: string): { agent: AgentId; complexity: TaskComplexity } {
    for (const rule of ROUTING_RULES) {
      if (rule.keywords.some(kw => instruction.includes(kw))) {
        return { agent: rule.agent, complexity: rule.complexity };
      }
    }
    // 默认交给执笔龙虾处理通用任务
    return { agent: "writer", complexity: "medium" };
  }

  // 获取或创建 agent 的 Codex Thread
  private getThread(agentId: AgentId): ReturnType<Codex["startThread"]> {
    if (!this.agentThreads.has(agentId)) {
      const thread = this.codex.startThread({
        skipGitRepoCheck: true,
      } as any);
      this.agentThreads.set(agentId, thread);
    }
    return this.agentThreads.get(agentId)!;
  }

  // 执行单个任务
  async runTask(task: Task): Promise<string> {
    const { agent, complexity } = { agent: task.assignedTo, complexity: task.complexity };
    const { model, baseUrl } = ModelRouter.route(complexity);

    this.dashboard.setAgentStatus(agent, "running", task.description);
    this.dashboard.updateTask(task.id, { status: "running" });

    try {
      const thread = this.getThread(agent);
      const systemPrompt = buildSystemPrompt(agent);
      const turn = await thread.run(`${systemPrompt}\n\n任务：${task.description}`);

      const result = turn.finalResponse ?? "(无输出)";
      this.dashboard.setAgentStatus(agent, "idle");
      this.dashboard.updateTask(task.id, { status: "done", result, completedAt: Date.now() });

      // 记录 token 消耗
      if (turn.usage) {
        const totalTokens = (turn.usage as any).total_tokens ?? 0;
        this.dashboard.addTokenUsage(agent, totalTokens, model);
      }

      return result;
    } catch (err) {
      this.dashboard.setAgentStatus(agent, "error");
      this.dashboard.updateTask(task.id, { status: "failed" });
      throw err;
    }
  }

  // 主入口：接收用户指令，拆解并调度
  async dispatch(userInstruction: string): Promise<void> {
    console.log(`\n🦞 虾总管收到指令: "${userInstruction}"\n`);
    this.dashboard.setAgentStatus("orchestrator", "running", "拆解任务中...");

    // 用 Codex 做任务拆解
    const planThread = this.codex.startThread({ skipGitRepoCheck: true });
    const planTurn = await planThread.run(
      `你是一个跨境电商 AI 团队的调度员。用户指令如下：\n"${userInstruction}"\n\n` +
      `请将其拆解为 1-5 个具体子任务，每行一个，格式：[子任务描述]。只输出任务列表，不要解释。`
    );

    const subtasks = (planTurn.finalResponse ?? "")
      .split("\n")
      .map(l => l.replace(/^\[|\]$/g, "").trim())
      .filter(Boolean);

    console.log(`📋 拆解为 ${subtasks.length} 个子任务:`);
    subtasks.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

    this.dashboard.setAgentStatus("orchestrator", "idle");

    // 创建任务并并行调度
    const tasks: Task[] = subtasks.map(desc => {
      const { agent, complexity } = this.routeTask(desc);
      const task: Task = {
        id: randomUUID(),
        description: desc,
        assignedTo: agent,
        complexity,
        status: "pending",
        createdAt: Date.now(),
      };
      this.dashboard.addTask(task);
      return task;
    });

    // 并行执行所有子任务
    const results = await Promise.allSettled(tasks.map(t => this.runTask(t)));

    console.log("\n✅ 所有任务完成:\n");
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        console.log(`[${tasks[i]!.assignedTo}] ${tasks[i]!.description}\n→ ${r.value}\n`);
      } else {
        console.log(`[${tasks[i]!.assignedTo}] ${tasks[i]!.description}\n→ ❌ 失败: ${r.reason}\n`);
      }
    });

    this.dashboard.printStatus();
  }

  // 小龙虾会议：多 agent 协作审阅，用于复杂项目
  async meeting(topic: string, participants: AgentId[]): Promise<string> {
    console.log(`\n🦐 小龙虾会议开始: ${topic}`);
    console.log(`参与者: ${participants.join(", ")}\n`);

    let context = `会议主题: ${topic}\n\n`;

    for (const agentId of participants) {
      this.dashboard.setAgentStatus(agentId, "running", `参与会议: ${topic}`);
      const thread = this.getThread(agentId);
      const systemPrompt = buildSystemPrompt(agentId);
      const turn = await thread.run(
        `${systemPrompt}\n\n${context}\n请从你的专业角度提出建议（100字以内）：`
      );
      const opinion = turn.finalResponse ?? "";
      context += `[${agentId}的意见]: ${opinion}\n\n`;
      this.dashboard.setAgentStatus(agentId, "idle");
      console.log(`💬 ${agentId}: ${opinion}\n`);
    }

    // 虾总管汇总
    const summaryThread = this.codex.startThread({ skipGitRepoCheck: true });
    const summary = await summaryThread.run(
      `以下是小龙虾团队的会议记录：\n${context}\n请综合所有意见，给出最终方案（200字以内）：`
    );

    const finalPlan = summary.finalResponse ?? "";
    console.log(`\n🦞 虾总管最终方案:\n${finalPlan}\n`);
    return finalPlan;
  }
}

function buildSystemPrompt(agentId: AgentId): string {
  const prompts: Record<AgentId, string> = {
    orchestrator: "你是跨境电商 AI 团队的总调度员虾总管，负责任务拆解和团队协调。",
    explorer: "你是探海龙虾，专注于跨境电商竞品分析、选品趋势研究和市场数据分析。请提供具体、可操作的数据洞察。",
    writer: "你是执笔龙虾，专注于跨境电商多语种文案创作、SEO 优化标题和商品详情页撰写。请输出高转化率的文案。",
    designer: "你是幻影龙虾，专注于电商视觉设计方向，包括商品图构思、海报设计方案和短视频素材规划。",
    performer: "你是戏精龙虾，专注于数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。",
    greeter: "你是迎客龙虾，专注于多语种客服话术、评论回复模板和买家互动策略。请保持友好专业的语气。",
  };
  return prompts[agentId];
}
