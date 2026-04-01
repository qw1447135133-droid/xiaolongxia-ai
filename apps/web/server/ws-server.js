import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { promises as fs, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Anthropic from "@anthropic-ai/sdk";

// ── 加载 .env.local（强制覆盖系统环境变量）──
const __dirname_ws = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname_ws, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      if (m[2].trim() === '') delete process.env[m[1]];
      else process.env[m[1]] = m[2].trim();
    }
  }
}
import { randomUUID } from "crypto";
import { startPlatform, stopPlatform, sendToPlatform, sendFileToPlatform } from "./platforms/platform-manager.js";
import { exportMeetingDocument } from "./meeting-exporter.js";
import { queryAgent, clearAllSessions } from "./agent-engine.js";
import { getAgentTools } from "./agent-tools.js";

process.on("uncaughtException", (err) => {
  console.error("[ws-server] uncaughtException:", err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[ws-server] unhandledRejection:", reason);
});

const PORT = Number(process.env.WS_PORT || 3001);
const clients = new Set();
let settings = { providers: [], agentConfigs: {} };

const ROUTING_RULES = [
  { keywords: ["浏览器", "打开网页", "打开网站", "截图", "爬取", "爬虫", "搜索网页", "访问网址", "访问网站", "点击", "填写表单", "自动化操作", "browser"], agent: "orchestrator", complexity: "medium" },
  { keywords: ["新闻", "热点", "资讯", "时事", "头条", "舆情", "列出", "对比"], agent: "explorer", complexity: "medium" },
  { keywords: ["竞品", "选品", "趋势", "数据", "市场", "分析"], agent: "explorer", complexity: "medium" },
  { keywords: ["文案", "标题", "seo", "详情", "描述", "翻译", "多语"], agent: "writer", complexity: "medium" },
  { keywords: ["图片", "海报", "设计", "素材", "banner", "视觉", "生图", "绘图"], agent: "designer", complexity: "high" },
  { keywords: ["视频", "数字人", "tiktok", "抖音", "发布", "矩阵", "脚本"], agent: "performer", complexity: "high" },
  { keywords: ["客服", "评论", "回复", "售后", "问答", "投诉", "买家"], agent: "greeter", complexity: "low" },
];

const BREVITY = "\n\n【输出要求】言简意赅、直入主题；先结论后补充；避免冗长寒暄与套话；除必须条目外尽量控制在300字内。";

const SYSTEM_PROMPTS = {
  orchestrator: "你是跨境电商 AI 团队的总协调员虾总管，负责任务拆解和团队协调。回复与汇报都要简短有力。"
    + "\n\n你拥有浏览器控制能力，可以使用以下工具：browser_goto（导航到URL）、browser_get_text（读取页面文字内容，搜索后必须用这个提取结果）、browser_page_info（获取页面信息）、browser_screenshot（截图识图）、browser_act（自然语言操作，如点击/填写/滚动）、browser_act_single（精确选择器操作）、browser_act_multi（批量操作）。"
    + "\n\n【搜索流程】：1.browser_goto 导航到搜索页 → 2.browser_get_text 读取页面内容 → 3.整理结果回复用户。不要反复跳转，读到内容就总结。"
    + "\n\n【遇到登录页】：换用百度/必应搜索该关键词，或直接总结已知信息。"
    + BREVITY,
  explorer: "你是探海龙虾，跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析，提供可执行洞察。" + BREVITY,
  writer: "你是执笔龙虾，跨境电商文案专家，专注多语种文案创作、SEO 标题和详情页撰写，输出高转化文案。" + BREVITY,
  designer: "你是幻影龙虾，电商视觉设计专家；需要出图时先给出 [IMAGE_PROMPT] 英文提示词，再补充设计说明。" + BREVITY,
  performer: "你是戏精龙虾，短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布。" + BREVITY,
  greeter: "你是迎客龙虾，多语种客服专家，专注客服话术、评论回复模板和买家互动策略。" + BREVITY,
};

const AGENT_IDS = ["orchestrator", "explorer", "writer", "designer", "performer", "greeter"];

const AGENT_DISPLAY = {
  orchestrator: "虾总管",
  explorer: "探海龙虾",
  writer: "执笔龙虾",
  designer: "幻影龙虾",
  performer: "戏精龙虾",
  greeter: "迎客龙虾",
};

function writeJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

async function writeFileResponse(res, fileResult) {
  const buffer = await fs.readFile(fileResult.filePath);
  res.writeHead(200, {
    "Content-Type": fileResult.mimeType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileResult.fileName)}`,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buffer);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
  if (global.__platformResultListener) {
    global.__platformResultListener(msg);
  }
}

function idleAllExcept(keepId) {
  for (const id of AGENT_IDS) {
    if (id !== keepId) {
      broadcast({ type: "agent_status", agentId: id, status: "idle" });
    }
  }
}

function shouldForceDecomposition(text) {
  const t = String(text || "").trim();
  if (t.length < 4) return false;
  if (/^(?:你好|在吗|hi|hello|谢谢|感谢|再见|拜拜)[!！.?\s]*$/i.test(t)) return false;
  if (/(?:分析|列出|对比|总结|梳理|拆解|建议|方案|分别|既要|还要|并且|以及|第一|第二)/i.test(t)) return true;
  if (/(?:新闻|资讯|热点|趋势|舆情|时事)/i.test(t)) return true;
  return false;
}

function shouldReplyDirectlyByOrchestrator(text) {
  const t = String(text || "").trim();
  if (!t) return true;

  if (/^(?:你好|您好|嗨|哈喽|hello|hi|在吗|早上好|中午好|下午好|晚上好|谢谢|感谢|再见|拜拜)[!！。.?？\s]*$/i.test(t)) {
    return true;
  }

  if (/^(?:你是谁|你是干什么的|你能做什么|怎么用|介绍一下自己)[!！。.?？\s]*$/i.test(t)) {
    return true;
  }

  if (shouldForceDecomposition(t)) {
    return false;
  }

  const hasRoutingKeyword = ROUTING_RULES.some((rule) =>
    rule.keywords.some((kw) => t.toLowerCase().includes(String(kw).toLowerCase())),
  );

  if (hasRoutingKeyword) {
    return false;
  }

  return t.length <= 12;
}

function buildDirectOrchestratorReply(text) {
  const t = String(text || "").trim();

  if (!t) return "我在，超哥可以直接说需求。";
  if (/^(?:你好|您好|嗨|哈喽|hello|hi|早上好|中午好|下午好|晚上好)[!！。.?？\s]*$/i.test(t)) {
    return "我在，超哥可以直接说需求，我来帮你判断是我直接回复，还是分给对应龙虾执行。";
  }
  if (/^(?:在吗)[!！。.?？\s]*$/i.test(t)) {
    return "在，超哥直接说。";
  }
  if (/^(?:谢谢|感谢)[!！。.?？\s]*$/i.test(t)) {
    return "不客气，超哥。";
  }
  if (/^(?:再见|拜拜)[!！。.?？\s]*$/i.test(t)) {
    return "好，超哥，有需要随时叫我。";
  }
  if (/^(?:你是谁|介绍一下自己)[!！。.?？\s]*$/i.test(t)) {
    return "我是虾总管，超哥可以把需求直接发给我，我会判断是由我直接回复，还是分配给选品、文案、设计、视频、客服这些执行龙虾。";
  }
  if (/^(?:你是干什么的|你能做什么|怎么用)[!！。.?？\s]*$/i.test(t)) {
    return "我是负责调度的小龙虾主管。超哥可以直接发任务，比如选品分析、文案、海报、短视频脚本、客服话术，我会直接处理或安排合适的龙虾执行。";
  }

  return "";
}

let timeSeq = 0;
function nextTaskTimestamp() {
  timeSeq += 1;
  return Date.now() + timeSeq;
}

function routeTask(instruction) {
  const lower = String(instruction || "").toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some((kw) => lower.includes(String(kw).toLowerCase()))) {
      return { agent: rule.agent, complexity: rule.complexity };
    }
  }
  return { agent: "orchestrator", complexity: "medium" };
}

function getDefaultModel() {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  return "claude-haiku-4-5-20251001";
}

function getModelForComplexity(complexity) {
  if (complexity === "high") return "claude-sonnet-4-6";
  return "claude-haiku-4-5-20251001";
}

function buildClient(agentId) {
  const config = settings.agentConfigs?.[agentId];
  const provider = config?.providerId
    ? settings.providers.find((p) => p.id === config.providerId)
    : null;

  const apiKey = provider?.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const baseURL = provider?.baseUrl || process.env.ANTHROPIC_BASE_URL;
  const model = config?.model || getDefaultModel();
  const personality = config?.personality ? `\n\n个性补充：${config.personality}` : "";
  const systemPrompt = `${SYSTEM_PROMPTS[agentId]}${personality}`;

  return {
    client: new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) }),
    model,
    systemPrompt,
  };
}

async function callAgent(agentId, task, complexity, maxTokensOverride, sessionId = "default") {
  const { client, model, systemPrompt } = buildClient(agentId);
  // 若 Agent 已显式配置了模型则尊重该设置，否则按复杂度自动选择
  const hasCustomModel = !!settings.agentConfigs?.[agentId]?.model;
  const actualModel = hasCustomModel ? model : getModelForComplexity(complexity);
  const defaultMax = complexity === "high" ? 1024 : complexity === "medium" ? 600 : 400;

  return await queryAgent({
    agentId,
    sessionId,
    task,
    systemPrompt,
    tools: getAgentTools(agentId),
    maxTokens: maxTokensOverride ?? defaultMax,
    model: actualModel,
    client,
  });
}

async function dispatch(instruction, sessionId = "default") {
  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "理解指令中..." });

  if (shouldReplyDirectlyByOrchestrator(instruction)) {
    try {
      const directReply = buildDirectOrchestratorReply(instruction);
      let text = directReply;
      let tokens = 0;

      if (!text) {
        const response = await callAgent(
          "orchestrator",
          `用户发来的是简单对话或短问句，请你以虾总管身份直接接话回复。

要求：
- 不要拆解任务
- 不要提及其他 agent
- 不要写“收到指令”“本次由某某处理”这类调度话术
- 像真实对话一样自然、简短、友好

用户消息：${instruction}`,
          "low",
          220,
          sessionId,
        );
        text = response.text;
        tokens = response.tokens;
      }

      const ts = nextTaskTimestamp();
      broadcast({
        type: "task_add",
        task: {
          id: randomUUID(),
          description: instruction,
          assignedTo: "orchestrator",
          complexity: "low",
          status: "done",
          result: text,
          createdAt: ts,
          completedAt: ts,
        },
      });
      if (tokens > 0) {
        broadcast({ type: "cost", agentId: "orchestrator", tokens });
      }
    } catch (err) {
      const ts = nextTaskTimestamp();
      broadcast({
        type: "task_add",
        task: {
          id: randomUUID(),
          description: instruction,
          assignedTo: "orchestrator",
          complexity: "low",
          status: "done",
          result: "我在，超哥可以直接说需求。",
          createdAt: ts,
          completedAt: ts,
        },
      });
      console.error("[dispatch] direct orchestrator reply failed:", err?.message || err);
    }

    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
    return;
  }

  const reportTaskId = randomUUID();
  broadcast({ type: "activity", activity: { agentId: "orchestrator", type: "dispatch", summary: instruction, timestamp: Date.now(), taskId: reportTaskId } });

  let tasks = [];

  if (shouldForceDecomposition(instruction)) {
    const candidateTasks = [
      "先分析用户需求并提炼核心目标",
      instruction,
    ];
    tasks = candidateTasks.map((desc) => {
      const routed = routeTask(desc);
      return {
        id: randomUUID(),
        description: desc === instruction ? instruction : `围绕“${instruction}”：${desc}`,
        assignedTo: routed.agent,
        complexity: routed.complexity,
      };
    });
  } else {
    const routed = routeTask(instruction);
    tasks = [{
      id: randomUUID(),
      description: instruction,
      assignedTo: routed.agent,
      complexity: routed.complexity,
    }];
  }

  const reportText = tasks.length > 1
    ? `收到指令：${instruction}\n\n我已拆解为 ${tasks.length} 个子任务：\n${tasks.map((t, i) => `${i + 1}. ${t.description} -> ${AGENT_DISPLAY[t.assignedTo]}`).join("\n")}`
    : `收到指令：${instruction}\n\n本次由 ${AGENT_DISPLAY[tasks[0].assignedTo]} 直接处理。`;

  const reportTs = nextTaskTimestamp();
  broadcast({
    type: "task_add",
    task: {
      id: reportTaskId,
      description: "虾总管汇报",
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      result: reportText,
      createdAt: reportTs,
      completedAt: reportTs,
    },
  });
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });

  for (const task of tasks) {
    const start = Date.now();
    const createdAt = nextTaskTimestamp();
    idleAllExcept(task.assignedTo);
    broadcast({
      type: "task_add",
      task: {
        ...task,
        status: "running",
        createdAt,
      },
    });
    broadcast({ type: "agent_status", agentId: task.assignedTo, status: "running", currentTask: task.description });
    broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_start", summary: task.description, timestamp: Date.now(), taskId: task.id } });

    try {
      const { text, tokens } = await callAgent(task.assignedTo, task.description, task.complexity, undefined, sessionId);
      broadcast({
        type: "task_update",
        taskId: task.id,
        updates: {
          status: "done",
          result: text,
          completedAt: Date.now(),
        },
      });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "idle" });
      broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_done", summary: task.description, timestamp: Date.now(), durationMs: Date.now() - start, taskId: task.id } });
      if (tokens > 0) broadcast({ type: "cost", agentId: task.assignedTo, tokens });
    } catch (err) {
      broadcast({ type: "task_update", taskId: task.id, updates: { status: "failed" } });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "error" });
      broadcast({ type: "activity", activity: { agentId: task.assignedTo, type: "task_fail", summary: String(err?.message || err), timestamp: Date.now(), taskId: task.id } });
    }
  }
}

async function meeting(topic, participants = ["explorer", "writer", "performer", "greeter"]) {
  const meetingId = randomUUID();
  const activeParticipants = participants.length > 0 ? participants : ["explorer", "writer", "performer", "greeter"];
  let context = `会议主题：${topic}\n\n`;

  function broadcastSpeech(agentId, role, text) {
    broadcast({
      type: "meeting_speech",
      meetingId,
      agentId,
      role,
      text,
      timestamp: Date.now(),
    });
  }

  async function runMeetingTurn(agentId, role, currentTask, prompt, complexity = "medium", maxTokens = 170) {
    idleAllExcept(agentId);
    broadcast({ type: "agent_status", agentId, status: "running", currentTask });
    try {
      const { text, tokens } = await callAgent(agentId, prompt, complexity, maxTokens, meetingId);
      const cleanText = String(text || "").trim();
      if (cleanText) {
        context += `[${AGENT_DISPLAY[agentId] || agentId}/${role}]: ${cleanText}\n\n`;
        broadcastSpeech(agentId, role, cleanText);
      }
      if (tokens > 0) broadcast({ type: "cost", agentId, tokens });
      return cleanText;
    } catch (err) {
      console.error("[meeting] turn failed:", agentId, role, err?.message || err);
      return "";
    } finally {
      broadcast({ type: "agent_status", agentId, status: "idle" });
    }
  }

  await runMeetingTurn("orchestrator", "open", `主持会议: ${topic}`, `你是会议主持人。请用强势、直接的语气开场：点明本次会议必须解决的核心矛盾，并要求各位不要客套、直接站队、给出可执行观点。控制在60字内。会议主题：${topic}`, "low", 120);

  for (const agentId of activeParticipants) {
    await runMeetingTurn(agentId, "speak", "第一轮立场陈述", `${context}\n现在进入第一轮立场陈述。\n请你从自己的专业视角直接表态：\n1. 你的主张是什么\n2. 为什么这么做\n3. 最大收益点是什么\n要求：有态度、别圆滑、尽量具体，80-120字。`, "medium", 160);
  }

  await runMeetingTurn("orchestrator", "rebuttal", "抛出争议点", `${context}\n你是主持人。请快速总结刚才最冲突的2个分歧点，并明确点名要求大家第二轮围绕这些分歧正面交锋。控制在70字内。`, "low", 120);

  for (const agentId of activeParticipants) {
    await runMeetingTurn(agentId, "rebuttal", "第二轮交锋反驳", `${context}\n现在进入第二轮交锋。\n请你明确挑一位其他成员的观点进行反驳或修正：\n1. 你不同意哪一点\n2. 风险在哪里\n3. 你给出的替代方案是什么\n要求：语气更锋利一点，但不要做人身攻击；80-120字。`, "medium", 150);
  }

  await runMeetingTurn("orchestrator", "rebuttal", "压缩讨论焦点", `${context}\n你是主持人。请用一句话收束争论，指出现在真正要拍板的1个核心选择题，并要求所有人用最短的话给出最终投票与底线。控制在60字内。`, "low", 110);

  for (const agentId of activeParticipants) {
    await runMeetingTurn(agentId, "rebuttal", "第三轮快速表决", `${context}\n现在进入第三轮快速表决。\n请只回答三件事：\n1. 你支持的方案\n2. 你的底线\n3. 你最担心的风险\n要求：50-80字，短句，像会议里抢话发言一样干脆。`, "low", 110);
  }

  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "拍板最终方案..." });
  let summary = "";
  try {
    const { text, tokens } = await callAgent("orchestrator", `${context}\n你是最后拍板的主管。\n请输出更丰富但节奏快的会议结论，按下面结构给出：\n一、最终决策\n二、采纳了谁的关键观点\n三、否决了谁的观点及原因\n四、接下来3条执行动作\n要求：明确、像真正在定方案，不要温吞，不超过280字。`, "medium", 260, meetingId);
    summary = text;
    broadcastSpeech("orchestrator", "summary", text);
    if (tokens > 0) broadcast({ type: "cost", agentId: "orchestrator", tokens });
  } catch (err) {
    summary = "会议总结生成失败，请重试。";
  }
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle" });
  idleAllExcept(null);
  return summary;
}

async function handlePlatformMessage(userId, text, platformId) {
  const taskAgentMap = {};

  global.__platformResultListener = (msg) => {
    if (msg.type === "task_add" && msg.task) {
      taskAgentMap[msg.task.id] = msg.task.assignedTo;
      if (msg.task.status === "done" && msg.task.result) {
        const label = AGENT_DISPLAY[msg.task.assignedTo] || msg.task.assignedTo;
        sendToPlatform(platformId, userId, `【${label}】\n\n${msg.task.result}`).catch(() => {});
      }
    }
    if (msg.type === "task_update" && msg.updates?.status === "done" && msg.updates?.result) {
      const agentId = taskAgentMap[msg.taskId];
      const label = AGENT_DISPLAY[agentId] || agentId || "龙虾";
      sendToPlatform(platformId, userId, `【${label}】\n\n${msg.updates.result}`).catch(() => {});
    }
  };

  try {
    await dispatch(text);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } finally {
    global.__platformResultListener = null;
  }
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    writeJson(res, 200, settings);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    try {
      const body = await readJson(req);
      if (body.providers) settings.providers = body.providers;
      if (body.agentConfigs) settings.agentConfigs = body.agentConfigs;
      writeJson(res, 200, { ok: true });
    } catch {
      writeJson(res, 400, { ok: false, error: "设置数据格式错误" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test-model") {
    try {
      const { apiKey, baseUrl, model } = await readJson(req);
      if (!apiKey?.trim()) return writeJson(res, 200, { ok: false, error: "API Key 不能为空" });
      if (!model?.trim()) return writeJson(res, 200, { ok: false, error: "模型名不能为空" });

      const client = new Anthropic({
        apiKey,
        ...(baseUrl?.trim() ? { baseURL: baseUrl.trim() } : {}),
      });

      const start = Date.now();
      const response = await client.messages.create({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
      });

      const reply = response.content.find((b) => b.type === "text")?.text ?? "";
      const tokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      writeJson(res, 200, {
        ok: true,
        reply,
        latencyMs: Date.now() - start,
        model: response.model,
        tokens,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeJson(res, 200, { ok: false, error: msg.slice(0, 120), detail: msg.slice(0, 300) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/meeting/export") {
    try {
      const { format, meeting } = await readJson(req);
      const fileResult = await exportMeetingDocument({ format, meeting });
      await writeFileResponse(res, fileResult);
    } catch (err) {
      writeJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/meeting/send") {
    try {
      const { format, meeting, platformId } = await readJson(req);
      if (!platformId?.trim()) return writeJson(res, 400, { ok: false, error: "platformId 不能为空" });
      const fileResult = await exportMeetingDocument({ format, meeting });
      const caption = `虾总管会议结论：${meeting?.topic ?? ""}\n${String(meeting?.summary ?? "").slice(0, 1800)}`;
      await sendFileToPlatform(platformId, null, {
        filePath: fileResult.filePath,
        fileName: fileResult.fileName,
        caption,
      });
      writeJson(res, 200, { ok: true, message: `已发送到 ${platformId}`, fileName: fileResult.fileName });
    } catch (err) {
      writeJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/webhook/line") {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", async () => {
      const adapter = globalThis.__lineAdapter;
      if (!adapter) { res.writeHead(404); res.end(); return; }
      try {
        const events = JSON.parse(body).events ?? [];
        await adapter.handleWebhookEvents(events);
        res.writeHead(200);
        res.end("OK");
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  if ((req.method === "POST" || req.method === "GET") && url.pathname === "/webhook/feishu") {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", async () => {
      const adapter = globalThis.__feishuAdapter;
      if (!adapter) { res.writeHead(404); res.end(); return; }
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = await adapter.handleWebhookEvent(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  if (url.pathname === "/webhook/wecom") {
    const adapter = globalThis.__wecomAdapter;
    if (!adapter) { res.writeHead(404); res.end(); return; }
    if (req.method === "GET") {
      const echostr = url.searchParams.get("echostr") ?? "";
      const query = Object.fromEntries(url.searchParams);
      if (adapter.verifySignature({ ...query, echostr })) {
        res.writeHead(200);
        res.end(echostr);
      } else {
        res.writeHead(403);
        res.end();
      }
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (d) => { body += d; });
      req.on("end", async () => {
        const query = Object.fromEntries(url.searchParams);
        const result = await adapter.handleWebhookMessage(body, query);
        res.writeHead(200);
        res.end(result);
      });
      return;
    }
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "connected" }));

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "settings_sync":
        if (msg.providers) settings.providers = msg.providers;
        if (msg.agentConfigs) settings.agentConfigs = msg.agentConfigs;
        ws.send(JSON.stringify({ type: "settings_ack" }));
        break;
      case "platform_sync":
        if (!msg.platformId) break;
        if (msg.enabled && msg.fields) {
          startPlatform(msg.platformId, msg.fields, handlePlatformMessage).catch((err) => {
            ws.send(JSON.stringify({ type: "platform_error", platformId: msg.platformId, error: err.message }));
          });
        } else {
          stopPlatform(msg.platformId);
        }
        break;
      case "dispatch":
        if (msg.instruction?.trim()) {
          const sessionId = msg.sessionId || "default";
          dispatch(msg.instruction, sessionId).catch((err) => console.error("[dispatch] error:", err?.message || err));
        }
        break;
      case "new_session":
        clearAllSessions();
        ws.send(JSON.stringify({ type: "session_cleared" }));
        break;
      case "meeting":
        if (msg.topic?.trim()) {
          meeting(msg.topic, msg.participants).then((result) => {
            ws.send(JSON.stringify({ type: "meeting_result", topic: msg.topic, result }));
          }).catch((err) => {
            ws.send(JSON.stringify({ type: "meeting_result", topic: msg.topic, error: err.message }));
          });
        }
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on ws://localhost:${PORT}`);
});

export function stopServer() {
  for (const ws of clients) {
    try { ws.close(); } catch {}
  }
  try { wss.close(); } catch {}
  try { httpServer.close(); } catch {}
}
