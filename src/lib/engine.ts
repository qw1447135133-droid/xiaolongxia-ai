// 核心 Agent 引擎 - 直接用 OpenAI SDK，不依赖 Codex CLI
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { generateImage } from "./image-gen";
import { getAgentClientParams } from "./runtime-settings";
import { broadcast } from "./ws-server";

export type AgentId =
  | "orchestrator"
  | "explorer"
  | "writer"
  | "designer"
  | "performer"
  | "greeter";
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

const ROUTING_RULES: Array<{
  keywords: string[];
  agent: AgentId;
  complexity: TaskComplexity;
}> = [
  { keywords: ["新闻", "热点", "资讯", "时事", "头条", "舆情", "列出", "对比"], agent: "explorer", complexity: "medium" },
  { keywords: ["竞品", "选品", "爬取", "趋势", "数据", "市场", "分析"], agent: "explorer", complexity: "medium" },
  { keywords: ["文案", "标题", "seo", "详情", "描述", "翻译", "多语"], agent: "writer", complexity: "medium" },
  { keywords: ["图片", "海报", "设计", "素材", "banner", "视觉", "生图", "画"], agent: "designer", complexity: "high" },
  { keywords: ["视频", "数字人", "tiktok", "抖音", "发布", "矩阵", "脚本"], agent: "performer", complexity: "high" },
  { keywords: ["客服", "评论", "回复", "售后", "问答", "投诉", "买家"], agent: "greeter", complexity: "low" },
];

const BREVITY =
  "\n\n【输出要求】言简意赅、直入主题；先结论后补充；避免冗长寒暄与套话；除必须条目外尽量控制在300字内。";

const SYSTEM_PROMPTS: Record<AgentId, string> = {
  orchestrator:
    "你是跨境电商 AI 团队的总调度员虾总管，负责任务拆解和团队协调。回应与汇报都要简短有力。" + BREVITY,
  explorer:
    "你是探海龙虾，跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析。提供具体可操作的洞察。" +
    BREVITY,
  writer:
    "你是执笔龙虾，跨境电商文案专家，专注多语种文案创作、SEO 优化标题和商品详情页撰写。输出高转化率文案。" +
    BREVITY,
  designer:
    "你是幻影龙虾，电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出简短设计方案说明。" +
    BREVITY,
  performer:
    "你是戏精龙虾，短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。" +
    BREVITY,
  greeter:
    "你是迎客龙虾，多语种客服专家，专注客服话术、评论回复模板和买家互动策略。语气友好专业。" + BREVITY,
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

function idleAllExcept(keepId: AgentId | null) {
  for (const id of AGENT_IDS) {
    if (id !== keepId) {
      broadcast({ type: "agent_status", agentId: id, status: "idle" });
    }
  }
}

function shouldForceDecomposition(text: string): boolean {
  const value = text.trim();
  if (value.length < 4) return false;
  if (/^(你好|在吗|hi|hello|谢谢|感谢|再见|拜拜)[!！。.…\s]*$/i.test(value)) return false;
  if (/分析|列出|对比|总结|梳理|拆解|建议|方案|分别|既要|还要|并且|以及|和.+和|第一|第二/i.test(value)) return true;
  if (/新闻|资讯|热点|趋势|舆情|时事/i.test(value)) return true;
  return false;
}

let timeSeq = 0;
function nextTaskTimestamp(): number {
  timeSeq += 1;
  return Date.now() + timeSeq;
}

function routeTask(instruction: string): { agent: AgentId; complexity: TaskComplexity } {
  const lower = instruction.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      return { agent: rule.agent, complexity: rule.complexity };
    }
  }
  return { agent: "writer", complexity: "medium" };
}

function getModel(complexity: TaskComplexity): string {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (process.env.SILICONFLOW_API_KEY) {
    switch (complexity) {
      case "high":
        return "deepseek-ai/DeepSeek-R1";
      case "medium":
        return "Qwen/Qwen2.5-72B-Instruct";
      case "low":
        return "Qwen/Qwen2.5-7B-Instruct";
    }
  }

  switch (complexity) {
    case "high":
      return "gpt-4o";
    case "medium":
      return "gpt-4o-mini";
    case "low":
      return "gpt-4o-mini";
  }
}

export function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? process.env.SILICONFLOW_API_KEY ?? null;
}

function buildClient(agentId: AgentId, complexity: TaskComplexity) {
  const { apiKey, baseURL, model, systemPrompt } = getAgentClientParams(agentId);
  const resolvedKey = apiKey || getApiKey() || "";
  const resolvedBase =
    baseURL ||
    (process.env.SILICONFLOW_API_KEY ? "https://api.siliconflow.cn/v1" : undefined) ||
    process.env.OPENAI_BASE_URL;
  const resolvedModel = model || getModel(complexity);
  const defaultPrompt = SYSTEM_PROMPTS[agentId];
  const finalPrompt = systemPrompt ? `${defaultPrompt}\n\n个性补充：${systemPrompt}` : defaultPrompt;

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
  maxTokensOverride?: number,
): Promise<{ text: string; tokens: number }> {
  const { client, model, systemPrompt } = buildClient(agentId, complexity);

  const isThinkingModel =
    model.includes("qwen3") || model.includes("qwq") || model.includes("glm-5") || model.includes("kimi");
  const defaultMax = complexity === "high" ? 600 : complexity === "medium" ? 450 : 350;
  const max_tokens = maxTokensOverride ?? defaultMax;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: task },
    ],
    max_tokens,
  };

  if (isThinkingModel && complexity !== "high") {
    body.enable_thinking = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await client.chat.completions.create(body as any);

  return {
    text: completion.choices[0]?.message?.content ?? "(无输出)",
    tokens: completion.usage?.total_tokens ?? 0,
  };
}

async function handleDesignerOutput(text: string): Promise<{ text: string; imageUrl?: string }> {
  const match = text.match(/\[IMAGE_PROMPT\]\s*(.+?)(?:\n|$)/i);
  if (!match) return { text };

  const prompt = match[1]?.trim();
  if (!prompt) return { text };

  try {
    const imageUrl = await generateImage(prompt);
    return {
      text: text.replace(/\[IMAGE_PROMPT\].*?(?:\n|$)/i, "").trim(),
      imageUrl,
    };
  } catch (err) {
    console.error("Image generation failed:", err);
    return { text };
  }
}

export async function dispatch(instruction: string): Promise<void> {
  idleAllExcept("orchestrator");
  broadcast({
    type: "agent_status",
    agentId: "orchestrator",
    status: "running",
    currentTask: "理解指令中...",
  });

  const { client, model } = buildClient("orchestrator", "medium");
  const isThinkingModel =
    model.includes("qwen3") || model.includes("qwq") || model.includes("glm-5") || model.includes("kimi");

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

【需要拆解】回复且仅回复：需要拆解。以下情况必须拆解，交给对应专员：
- 用户要「分析、列出、对比、总结、建议、方案」等需结构化产出
- 提到新闻、热点、资讯、趋势等，需改写为「对卖家的启示、选品方向、内容选题」等可执行任务
- 明显涉及多种能力，如既要分析又要文案

不要输出「需要拆解」以外的固定口令。`,
        },
        { role: "user", content: instruction },
      ],
      max_tokens: 150,
    };

    if (isThinkingModel) {
      judgeBody.enable_thinking = false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const judgeResult = await client.chat.completions.create(judgeBody as any);
    const judgeResponse = judgeResult.choices[0]?.message?.content ?? "";

    needsDecomposition = judgeResponse.includes("需要拆解");
    orchestratorResponse = judgeResponse;

    if (judgeResult.usage?.total_tokens) {
      broadcast({ type: "cost", agentId: "orchestrator", tokens: judgeResult.usage.total_tokens });
    }
  } catch (err) {
    console.error("[dispatch] judgment failed:", err);
    orchestratorResponse = "抱歉，我这边判断出了点问题，请换种说法再试一次。";
  }

  if (shouldForceDecomposition(instruction)) {
    needsDecomposition = true;
  }

  if (!needsDecomposition) {
    const responseTaskId = randomUUID();
    const ts = nextTaskTimestamp();
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
        completedAt: ts,
      },
    });
    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
    return;
  }

  const reportTaskId = randomUUID();
  broadcast({
    type: "activity",
    activity: {
      agentId: "orchestrator",
      type: "dispatch",
      summary: instruction,
      timestamp: Date.now(),
      taskId: reportTaskId,
    },
  });
  broadcast({
    type: "agent_status",
    agentId: "orchestrator",
    status: "running",
    currentTask: "拆解任务中...",
  });

  let subtasks: string[] = [];
  try {
    const planBody: Record<string, unknown> = {
      model,
      messages: [
        {
          role: "system",
          content: `你是任务拆解专家。将用户指令改写为 1-5 条可执行的跨境电商相关子任务，每行一条，不要编号。

规则：
- 用户问新闻、热点、资讯时：不要拒绝；改为「从卖家视角归纳热点方向、对选品或内容的启示、可落地的行动建议」等任务
- 含「分析、列出」时：写成明确的分析或归纳任务
- 优先合并为一条；确需多种交付再拆多条
- 不要输出「无法完成」「无法抓取」之类拒答，只输出任务句`,
        },
        { role: "user", content: instruction },
      ],
      max_tokens: 300,
    };

    if (isThinkingModel) {
      planBody.enable_thinking = false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await client.chat.completions.create(planBody as any);
    subtasks = (plan.choices[0]?.message?.content ?? "")
      .split("\n")
      .map((line: string) => line.replace(/^[\d.\-*\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);

    if (plan.usage?.total_tokens) {
      broadcast({ type: "cost", agentId: "orchestrator", tokens: plan.usage.total_tokens });
    }
  } catch (err) {
    console.error("[dispatch] task decomposition failed:", err);
    subtasks = [instruction];
  }

  const tasks: Task[] = subtasks.map((description) => {
    const { agent, complexity } = routeTask(description);
    return {
      id: randomUUID(),
      description,
      assignedTo: agent,
      complexity,
      status: "pending",
      createdAt: 0,
    };
  });

  const reportLines = tasks.map(
    (task, index) => `${index + 1}. ${task.description} -> 由 ${AGENT_DISPLAY[task.assignedTo]} 执行`,
  );
  const orchestratorReport =
    `收到指令：${instruction}\n\n` +
    `我已将任务拆解为 ${tasks.length} 个子任务：\n${reportLines.join("\n")}\n\n` +
    "将按顺序执行，请先看下一条消息。";

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
      completedAt: reportTs,
    },
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
    broadcast({
      type: "agent_status",
      agentId: task.assignedTo,
      status: "running",
      currentTask: task.description,
    });
    broadcast({
      type: "activity",
      activity: {
        agentId: task.assignedTo,
        type: "task_start",
        summary: task.description,
        timestamp: Date.now(),
        taskId: task.id,
      },
    });

    try {
      const { text, tokens } = await callAgent(task.assignedTo, task.description, task.complexity);
      const durationMs = Date.now() - start;

      let result = text;
      let imageUrl: string | undefined;
      if (task.assignedTo === "designer") {
        const designerOutput = await handleDesignerOutput(text);
        result = designerOutput.text;
        imageUrl = designerOutput.imageUrl;
      }

      broadcast({
        type: "task_update",
        taskId: task.id,
        updates: {
          status: "done",
          result,
          imageUrl,
          completedAt: Date.now(),
        },
      });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "idle" });
      broadcast({
        type: "activity",
        activity: {
          agentId: task.assignedTo,
          type: "task_done",
          summary: task.description,
          timestamp: Date.now(),
          durationMs,
          taskId: task.id,
        },
      });
      if (tokens > 0) {
        broadcast({ type: "cost", agentId: task.assignedTo, tokens });
      }
    } catch (err) {
      console.error(`[dispatch] agent ${task.assignedTo} failed:`, err);
      broadcast({ type: "task_update", taskId: task.id, updates: { status: "failed" } });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "error" });
      broadcast({
        type: "activity",
        activity: {
          agentId: task.assignedTo,
          type: "task_fail",
          summary: String(err),
          timestamp: Date.now(),
          taskId: task.id,
        },
      });
    }
  }
}

type MeetingRole = "open" | "speak" | "rebuttal" | "summary";

function broadcastMeetingSpeech(meetingId: string, agentId: AgentId, role: MeetingRole, text: string) {
  broadcast({
    type: "meeting_speech",
    meetingId,
    agentId,
    role,
    text,
    timestamp: Date.now(),
  });
}

export async function meeting(
  topic: string,
  participants: AgentId[] = ["explorer", "writer", "performer", "greeter"],
): Promise<string> {
  const meetingId = randomUUID();
  const activeParticipants = participants.filter((agentId) => agentId !== "orchestrator");
  const finalParticipants: AgentId[] = activeParticipants.length > 0
    ? activeParticipants
    : ["explorer", "writer", "performer", "greeter"];

  let context = `会议主题：${topic}\n\n`;

  async function runMeetingTurn(
    agentId: AgentId,
    role: MeetingRole,
    currentTask: string,
    prompt: string,
    complexity: TaskComplexity = "medium",
    maxTokens = 170,
  ): Promise<string> {
    idleAllExcept(agentId);
    broadcast({ type: "agent_status", agentId, status: "running", currentTask });

    try {
      const { text, tokens } = await callAgent(agentId, prompt, complexity, maxTokens);
      const cleanText = String(text || "").trim();

      if (cleanText) {
        context += `[${AGENT_DISPLAY[agentId]}/${role}]: ${cleanText}\n\n`;
        broadcastMeetingSpeech(meetingId, agentId, role, cleanText);
        broadcast({
          type: "activity",
          activity: {
            agentId,
            type: "meeting",
            summary: currentTask,
            timestamp: Date.now(),
          },
        });
      }

      if (tokens > 0) {
        broadcast({ type: "cost", agentId, tokens });
      }

      return cleanText;
    } catch (err) {
      console.error("[meeting] turn failed:", agentId, role, err);
      return "";
    } finally {
      broadcast({ type: "agent_status", agentId, status: "idle" });
    }
  }

  await runMeetingTurn(
    "orchestrator",
    "open",
    `主持会议: ${topic}`,
    `你是会议主持人。请用强势、直接的语气开场：点明本次会议必须解决的核心矛盾，并要求各位不要客套、直接站队、给出可执行观点。控制在60字内。会议主题：${topic}`,
    "low",
    120,
  );

  for (const agentId of finalParticipants) {
    await runMeetingTurn(
      agentId,
      "speak",
      "第一轮立场陈述",
      `${context}
现在进入第一轮立场陈述。
请你从自己的专业视角直接表态：
1. 你的主张是什么
2. 为什么这么做
3. 最大收益点是什么
要求：有态度、别圆滑、尽量具体，80-120字。`,
      "medium",
      160,
    );
  }

  await runMeetingTurn(
    "orchestrator",
    "rebuttal",
    "抛出争议点",
    `${context}
你是主持人。请快速总结刚才最冲突的2个分歧点，并明确点名要求大家第二轮围绕这些分歧正面交锋。控制在70字内。`,
    "low",
    120,
  );

  for (const agentId of finalParticipants) {
    await runMeetingTurn(
      agentId,
      "rebuttal",
      "第二轮交锋反驳",
      `${context}
现在进入第二轮交锋。
请你明确挑一位其他成员的观点进行反驳或修正：
1. 你不同意哪一点
2. 风险在哪里
3. 你给出的替代方案是什么
要求：语气更锋利一点，但不要做人身攻击；80-120字。`,
      "medium",
      150,
    );
  }

  await runMeetingTurn(
    "orchestrator",
    "rebuttal",
    "压缩讨论焦点",
    `${context}
你是主持人。请用一句话收束争论，指出现在真正要拍板的1个核心选择题，并要求所有人用最短的话给出最终投票与底线。控制在60字内。`,
    "low",
    110,
  );

  for (const agentId of finalParticipants) {
    await runMeetingTurn(
      agentId,
      "rebuttal",
      "第三轮快速表决",
      `${context}
现在进入第三轮快速表决。
请只回答三件事：
1. 你支持的方案
2. 你的底线
3. 你最担心的风险
要求：50-80字，短句，像会议里抢话发言一样干脆。`,
      "low",
      110,
    );
  }

  idleAllExcept("orchestrator");
  broadcast({
    type: "agent_status",
    agentId: "orchestrator",
    status: "running",
    currentTask: "拍板最终方案...",
  });

  let summary = "";
  try {
    const { text, tokens } = await callAgent(
      "orchestrator",
      `${context}
你是最后拍板的主管。
请输出更丰富但节奏快的会议结论，按下面结构给出：
一、最终决策
二、采纳了谁的关键观点
三、否决了谁的观点及原因
四、接下来3条执行动作
要求：明确、像真正在定方案，不要温吞，不超过280字。`,
      "medium",
      260,
    );
    summary = String(text || "").trim() || "会议总结生成失败，请重试。";
    broadcastMeetingSpeech(meetingId, "orchestrator", "summary", summary);
    if (tokens > 0) {
      broadcast({ type: "cost", agentId: "orchestrator", tokens });
    }
  } catch (err) {
    console.error("[meeting] summary failed:", err);
    summary = "会议总结生成失败，请重试。";
  } finally {
    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
    idleAllExcept(null);
  }

  return summary;
}
