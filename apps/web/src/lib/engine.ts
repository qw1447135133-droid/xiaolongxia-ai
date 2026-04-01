// 核心 Agent 引擎 - 直接用 OpenAI SDK，不依赖 Codex CLI
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { generateImage } from "./image-gen";
import { getAgentClientParams } from "./runtime-settings";
import { broadcast } from "./ws-server";  // 直接 import 单例，不再注入

export type AgentId = "orchestrator" | "explorer" | "writer" | "designer" | "performer" | "greeter";
export type AgentStatus = "idle" | "running" | "error";
export type TaskComplexity = "high" | "medium" | "low";

export interface Task {
  id: string;
  description: string;
  assignedTo: AgentId;
  complexity: TaskComplexity;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  imageUrl?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Activity {
  agentId: AgentId;
  type: "task_start" | "task_done" | "task_fail" | "meeting" | "dispatch";
  summary: string;
  timestamp: number;
  durationMs?: number;
  taskId?: string;
}

// 路由规则
const ROUTING_RULES: Array<{ keywords: string[]; agent: AgentId; complexity: TaskComplexity }> = [
  { keywords: ["新闻", "热点", "资讯", "时事", "头条", "舆情", "列出", "对比"], agent: "explorer", complexity: "medium" },
  { keywords: ["竞品", "选品", "爬取", "趋势", "数据", "市场", "分析"], agent: "explorer", complexity: "medium" },
  { keywords: ["文案", "标题", "seo", "详情", "描述", "翻译", "多语"], agent: "writer", complexity: "medium" },
  { keywords: ["图片", "海报", "设计", "素材", "banner", "视觉", "生图", "画"], agent: "designer", complexity: "high" },
  { keywords: ["视频", "数字人", "tiktok", "抖音", "发布", "矩阵", "脚本"], agent: "performer", complexity: "high" },
  { keywords: ["客服", "评论", "回复", "售后", "问答", "投诉", "买家"], agent: "greeter", complexity: "low" },
];

const BREVITY = "\n\n【输出要求】言简意赅、直入主题；先结论后补充；避免冗长寒暄与套话；除必须条目外尽量控制在300字内。";

const SYSTEM_PROMPTS: Record<AgentId, string> = {
  orchestrator: "你是跨境电商 AI 团队的总调度员虾总管，负责任务拆解和团队协调。回应与汇报都要简短有力。" + BREVITY,
  explorer:     "你是探海龙虾，跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析。提供具体可操作的洞察。" + BREVITY,
  writer:       "你是执笔龙虾，跨境电商文案专家，专注多语种文案创作、SEO 优化标题和商品详情页撰写。输出高转化率文案。" + BREVITY,
  designer:     "你是幻影龙虾，电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出简短设计方案说明。" + BREVITY,
  performer:    "你是戏精龙虾，短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。" + BREVITY,
  greeter:      "你是迎客龙虾，多语种客服专家，专注客服话术、评论回复模板和买家互动策略。语气友好专业。" + BREVITY,
};

const AGENT_IDS: AgentId[] = ["orchestrator", "explorer", "writer", "designer", "performer", "greeter"];

const AGENT_DISPLAY: Record<AgentId, string> = {
  orchestrator: "虾总管",
  explorer: "探海龙虾",
  writer: "执笔龙虾",
  designer: "幻影龙虾",
  performer: "戏精龙虾",
  greeter: "迎客龙虾",
};

function idleAllExcept(keepId: AgentId) {
  for (const id of AGENT_IDS) {
    if (id !== keepId) {
      broadcast({ type: "agent_status", agentId: id, status: "idle" });
    }
  }
}

function shouldForceDecomposition(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (/^(你好|在吗|hi|hello|谢谢|感谢|再见|拜拜)[!！。.…\s]*$/i.test(t)) return false;
  if (/分析|列出|对比|总结|梳理|拆解|建议|方案|分别|既要|还要|并且|以及|和.+和|第一|第二/i.test(t)) return true;
  if (/新闻|资讯|热点|趋势|舆情|时事/i.test(t)) return true;
  return false;
}

let _timeSeq = 0;
function nextTaskTimestamp(): number {
  _timeSeq += 1;
  return Date.now() + _timeSeq;
}

function routeTask(instruction: string): { agent: AgentId; complexity: TaskComplexity } {
  const lower = instruction.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return { agent: rule.agent, complexity: rule.complexity };
    }
  }
  return { agent: "writer", complexity: "medium" };
}

function getModel(complexity: TaskComplexity): string {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (process.env.SILICONFLOW_API_KEY) {
    switch (complexity) {
      case "high":   return "deepseek-ai/DeepSeek-R1";
      case "medium": return "Qwen/Qwen2.5-72B-Instruct";
      case "low":    return "Qwen/Qwen2.5-7B-Instruct";
    }
  }
  switch (complexity) {
    case "high":   return "gpt-4o";
    case "medium": return "gpt-4o-mini";
    case "low":    return "gpt-4o-mini";
  }
}

export function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? null;
}

function buildClient(agentId: AgentId, complexity: TaskComplexity) {
  const { apiKey, baseURL, model, systemPrompt } = getAgentClientParams(agentId);
  const resolvedKey = apiKey || getApiKey() || "";
  const resolvedBase = baseURL
    || (process.env.SILICONFLOW_API_KEY ? "https://api.siliconflow.cn/v1" : undefined)
    || process.env.OPENAI_BASE_URL;
  const resolvedModel = model || getModel(complexity);
  const defaultPrompt = SYSTEM_PROMPTS[agentId];
  const finalPrompt = systemPrompt ? `${defaultPrompt}\n\n个性补充：${systemPrompt}` : defaultPrompt;

  // 阿里云百炼 Coding Plan 需要 User-Agent: OpenAI/Codex 才能通过鉴权
  const isCodingPlan = resolvedBase?.includes("coding.dashscope.aliyuncs.com");
  const defaultHeaders = isCodingPlan ? { "User-Agent": "OpenAI/Codex" } : {};

  return {
    client: new OpenAI({
      apiKey: resolvedKey,
      ...(resolvedBase ? { baseURL: resolvedBase } : {}),
      defaultHeaders,
    }),
    model: resolvedModel,
    systemPrompt: finalPrompt,
  };
}

async function callAgent(
  agentId: AgentId,
  task: string,
  complexity: TaskComplexity,
  maxTokensOverride?: number
): Promise<{ text: string; tokens: number }> {
  const { client, model, systemPrompt } = buildClient(agentId, complexity);

  const isThinkingModel = model.includes("qwen3") || model.includes("qwq") || model.includes("glm-5") || model.includes("kimi");
  const defaultMax = complexity === "high" ? 600 : complexity === "medium" ? 450 : 350;
  const max_tokens = maxTokensOverride ?? defaultMax;
  // 非高复杂度任务关闭深度思考，避免不必要的延迟
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: task },
    ],
    max_tokens,
  };
  if (isThinkingModel && complexity !== "high") body.enable_thinking = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await client.chat.completions.create(body as any);
  return {
    text: (completion as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "(无输出)",
    tokens: (completion as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0,
  };
}

async function handleDesignerOutput(text: string): Promise<{ text: string; imageUrl?: string }> {
  const match = text.match(/\[IMAGE_PROMPT\]\s*(.+?)(?:\n|$)/i);
  if (!match) return { text };
  const prompt = match[1]!.trim();
  try {
    const imageUrl = await generateImage(prompt);
    return { text: text.replace(/\[IMAGE_PROMPT\].*?(?:\n|$)/i, "").trim(), imageUrl };
  } catch (err) {
    console.error("Image generation failed:", err);
    return { text };
  }
}

// 主调度函数
export async function dispatch(instruction: string): Promise<void> {
  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "理解指令中..." });

  const { client, model } = buildClient("orchestrator", "medium");
  const isThinkingModel = model.includes("qwen3") || model.includes("qwq") || model.includes("glm-5") || model.includes("kimi");

  let needsDecomposition = false;
  let orchestratorResponse = "";

  try {
    const judgeBody: Record<string, unknown> = {
      model,
      messages: [
        {
          role: "system",
          content: `你是虾主管，负责接话并决策是否拆给专员执行。团队能做的是：选品与市场分析、文案、视觉、短视频、客服话术等跨境电商相关产出（无法联网实时爬取，但可基于常识与经验做归纳分析）。

【不要拆解】仅回复正常句子，不要说「需要拆解」：纯寒暄、无指向的短问候、或一句话能说清的极简问题。

【需要拆解】回复且仅回复：需要拆解 —— 在以下情况必须拆解，交给对应专员：
- 用户要「分析、列出、对比、总结、建议、方案」等需结构化产出
- 提到新闻/热点/资讯/趋势等，需改写为「对卖家的启示、选品方向、内容选题」等可执行任务
- 明显涉及多种能力（如既要分析又要文案）

不要输出「需要拆解」以外的固定口令。`,
        },
        { role: "user", content: instruction },
      ],
      max_tokens: 150,
    };
    if (isThinkingModel) judgeBody.enable_thinking = false;

    const judgeResult = await client.chat.completions.create(judgeBody as any);
    const judgeResponse = (judgeResult as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content ?? "";

    needsDecomposition = judgeResponse.includes("需要拆解");
    orchestratorResponse = judgeResponse;

    if ((judgeResult as { usage?: { total_tokens?: number } }).usage?.total_tokens) {
      broadcast({ type: "cost", agentId: "orchestrator", tokens: (judgeResult as { usage?: { total_tokens?: number } }).usage!.total_tokens! });
    }
  } catch (err) {
    console.error("[dispatch] judgment failed:", err);
    needsDecomposition = false;
    orchestratorResponse = "抱歉，我这边判断出了点问题，请换种说法再试一次。";
  }

  if (shouldForceDecomposition(instruction)) {
    needsDecomposition = true;
  }

  if (!needsDecomposition) {
    const responseTaskId = randomUUID();
    const ts = nextTaskTimestamp();
    console.log('[dispatch] Simple response, task ID:', responseTaskId);
    broadcast({
      type: "task_add",
      task: {
        id: responseTaskId,
        description: instruction,
        assignedTo: "orchestrator",
        complexity: "low",
        status: "done",
        result: orchestratorResponse,
        createdAt: ts,
        completedAt: ts
      }
    });
    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
    console.log('[dispatch] Simple response completed');
    return;
  }

  const reportTaskId = randomUUID();
  broadcast({ type: "activity", activity: { agentId: "orchestrator", type: "dispatch", summary: instruction, timestamp: Date.now(), taskId: reportTaskId } });
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "拆解任务中..." });

  let subtasks: string[] = [];
  try {
    const planBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: `你是任务拆解专家。将用户指令改写为1-5条可执行的跨境电商相关子任务（每行一条，不要编号）。

规则：
- 用户问新闻/热点/资讯时：不要拒绝；改为「从卖家视角归纳热点方向、对选品或内容的启示、可落地的行动建议」等，交给选品分析或文案
- 含「分析、列出」时：写成明确的分析或归纳任务
- 优先合并为一条；确需多种交付再拆多条
- 不要输出「无法完成」「无法抓取」之类拒答，只输出任务句` },
        { role: "user", content: instruction },
      ],
      max_tokens: 300,
    };
    if (isThinkingModel) planBody.enable_thinking = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await client.chat.completions.create(planBody as any);
    const planResult = plan as { choices: Array<{ message: { content: string } }>; usage?: { total_tokens?: number } };
    subtasks = (planResult.choices[0]?.message?.content ?? "")
      .split("\n")
      .map((l: string) => l.replace(/^[\d.\-*\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    if (planResult.usage?.total_tokens) {
      broadcast({ type: "cost", agentId: "orchestrator", tokens: planResult.usage.total_tokens });
    }
  } catch (err) {
    console.error("[dispatch] task decomposition failed:", err);
    subtasks = [instruction];
  }

  const tasks: Task[] = subtasks.map(desc => {
    const { agent, complexity } = routeTask(desc);
    return { id: randomUUID(), description: desc, assignedTo: agent, complexity, status: "pending" as const, createdAt: 0 };
  });

  const reportLines = tasks.map((t, i) => `${i + 1}. ${t.description} → 由 ${AGENT_DISPLAY[t.assignedTo]} 执行`);
  const orchestratorReport = `收到指令：${instruction}\n\n我已将任务拆解为 ${tasks.length} 个子任务：\n${reportLines.join("\n")}\n\n将按顺序执行，请先看下一条消息。`;

  const reportTs = nextTaskTimestamp();
  broadcast({
    type: "task_add",
    task: {
      id: reportTaskId,
      description: "虾主管汇报",
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      result: orchestratorReport,
      createdAt: reportTs,
      completedAt: reportTs
    }
  });

  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });

  for (const task of tasks) {
    const start = Date.now();
    idleAllExcept(task.assignedTo);
    const subTs = nextTaskTimestamp();
    broadcast({
      type: "task_add",
      task: {
        ...task,
        status: "running",
        createdAt: subTs,
      },
    });
    broadcast({ type: "agent_status", agentId: task.assignedTo, status: "running", currentTask: task.description });
    broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_start", summary: task.description, timestamp: Date.now(), taskId: task.id } });

    try {
      const { text, tokens } = await callAgent(task.assignedTo, task.description, task.complexity);
      const durationMs = Date.now() - start;

      let result = text;
      let imageUrl: string | undefined;
      if (task.assignedTo === "designer") {
        const out = await handleDesignerOutput(text);
        result = out.text;
        imageUrl = out.imageUrl;
      }

      broadcast({ type: "task_update", taskId: task.id, updates: { status: "done", result, imageUrl, completedAt: Date.now() } });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "idle" });
      broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_done", summary: task.description, timestamp: Date.now(), durationMs, taskId: task.id } });
      if (tokens > 0) broadcast({ type: "cost", agentId: task.assignedTo, tokens });
    } catch (err) {
      console.error(`[dispatch] agent ${task.assignedTo} failed:`, err);
      broadcast({ type: "task_update", taskId: task.id, updates: { status: "failed" } });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "error" });
      broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_fail", summary: String(err), timestamp: Date.now(), taskId: task.id } });
    }
  }
}

// 小龙虾会议
export async function meeting(
  topic: string,
  participants: AgentId[] = ["explorer", "writer", "performer"]
): Promise<string> {
  let context = `会议主题: ${topic}\n\n`;

  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: `会议开场: ${topic}` });
  try {
    const { text: openText, tokens: openTok } = await callAgent(
      "orchestrator",
      `会议主题：${topic}\n请先用一两句定议程、说明讨论重点（不超过80字），不要长篇。`,
      "low",
      200
    );
    context += `[虾总管开场]: ${openText}\n\n`;
    if (openTok > 0) broadcast({ type: "cost", agentId: "orchestrator", tokens: openTok });
  } catch (err) {
    console.error("[meeting] orchestrator opening failed:", err);
  }
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });

  for (const agentId of participants) {
    idleAllExcept(agentId);
    broadcast({ type: "agent_status", agentId, status: "running", currentTask: `参与会议: ${topic}` });
    try {
      const { text, tokens } = await callAgent(
        agentId,
        `${context}\n请从你的专业角度提出建议（80字以内、条目优先）：`,
        "medium",
        220
      );
      context += `[${agentId}的意见]: ${text}\n\n`;
      broadcast({ type: "agent_status", agentId, status: "idle" });
      broadcast({ type: "activity", activity: { agentId, type: "meeting", summary: `参与会议: ${topic}`, timestamp: Date.now() } });
      if (tokens > 0) broadcast({ type: "cost", agentId, tokens });
    } catch (err) {
      console.error(`[meeting] ${agentId} failed:`, err);
      broadcast({ type: "agent_status", agentId, status: "error" });
    }
  }

  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "汇总会议结论..." });
  const { text: summary, tokens } = await callAgent(
    "orchestrator",
    `以下是团队会议记录：\n${context}\n请综合所有意见，给出最终方案（180字以内、分条）：`,
    "high",
    400
  );
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
  if (tokens > 0) broadcast({ type: "cost", agentId: "orchestrator", tokens });

  return summary;
}
