/**
 * ws-server.js — 独立 WebSocket 服务器（参考 openhanako 架构）
 *
 * 与 Next.js 完全分离，运行在独立端口（3001）
 * 前端通过 ws://localhost:3001 连接
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { startPlatform, stopPlatform, sendToPlatform } from './platforms/platform-manager.js';

// 防止平台适配器的未捕获错误把整个进程崩掉
process.on('uncaughtException', (err) => {
  console.error('[ws-server] uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[ws-server] unhandledRejection:', reason);
});

const PORT = process.env.WS_PORT || 3001;

// ── 全局状态 ──
let settings = { providers: [], agentConfigs: {} };
const clients = new Set();

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// ── 路由规则 ──
const ROUTING_RULES = [
  { keywords: ['新闻','热点','资讯','时事','头条','舆情','列出','对比'], agent: 'explorer', complexity: 'medium' },
  { keywords: ['竞品','选品','爬取','趋势','数据','市场','分析'], agent: 'explorer', complexity: 'medium' },
  { keywords: ['文案','标题','seo','详情','描述','翻译','多语'],   agent: 'writer',   complexity: 'medium' },
  { keywords: ['图片','海报','设计','素材','banner','视觉','生图','画'], agent: 'designer', complexity: 'high' },
  { keywords: ['视频','数字人','tiktok','抖音','发布','矩阵','脚本'], agent: 'performer', complexity: 'high' },
  { keywords: ['客服','评论','回复','售后','问答','投诉','买家'],   agent: 'greeter',  complexity: 'low' },
];

const BREVITY = '\n\n【输出要求】言简意赅、直入主题；先结论后补充；避免冗长寒暄与套话；除必须条目外尽量控制在300字内。';

const SYSTEM_PROMPTS = {
  orchestrator: '你是跨境电商 AI 团队的总调度员虾总管，负责任务拆解和团队协调。回应与汇报都要简短有力。' + BREVITY,
  explorer:     '你是探海龙虾，跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析。提供具体可操作的洞察。' + BREVITY,
  writer:       '你是执笔龙虾，跨境电商文案专家，专注多语种文案创作、SEO 优化标题和商品详情页撰写。输出高转化率文案。' + BREVITY,
  designer:     '你是幻影龙虾，电商视觉设计专家。当需要生成图片时，请先输出一段英文图片生成提示词（以 [IMAGE_PROMPT] 开头），然后再输出简短设计方案说明。' + BREVITY,
  performer:    '你是戏精龙虾，短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布计划。' + BREVITY,
  greeter:      '你是迎客龙虾，多语种客服专家，专注客服话术、评论回复模板和买家互动策略。语气友好专业。' + BREVITY,
};

const AGENT_IDS = ['orchestrator', 'explorer', 'writer', 'designer', 'performer', 'greeter'];

const AGENT_DISPLAY = {
  orchestrator: '虾总管',
  explorer: '探海龙虾',
  writer: '执笔龙虾',
  designer: '幻影龙虾',
  performer: '戏精龙虾',
  greeter: '迎客龙虾',
};

function idleAllExcept(keepId) {
  for (const id of AGENT_IDS) {
    if (id !== keepId) {
      broadcast({ type: 'agent_status', agentId: id, status: 'idle' });
    }
  }
}

/** 用户明显需要产出或多步时，强制进入拆解，由虾总管分配专员执行（避免总管一句拒答） */
function shouldForceDecomposition(s) {
  const t = s.trim();
  if (t.length < 4) return false;
  if (/^(你好|在吗|hi|hello|谢谢|感谢|再见|拜拜)[!！。.…\s]*$/i.test(t)) return false;
  if (/分析|列出|对比|总结|梳理|拆解|建议|方案|分别|既要|还要|并且|以及|和.+和|第一|第二/i.test(t)) return true;
  if (/新闻|资讯|热点|趋势|舆情|时事/i.test(t)) return true;
  return false;
}

let _timeSeq = 0;
function nextTaskTimestamp() {
  _timeSeq += 1;
  return Date.now() + _timeSeq;
}

// ── 广播到所有客户端 ──
function broadcast(msg) {
  const data = JSON.stringify(msg);
  console.log(`[broadcast] Sending to ${clients.size} clients, type=${msg.type}, id=${msg.task?.id || msg.activity?.timestamp || 'N/A'}`);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
  // 同步通知平台消息监听器（用于将结果回传给外部平台用户）
  if (global.__platformResultListener) {
    global.__platformResultListener(msg);
  }
}

// ── 路由任务 ──
function routeTask(instruction) {
  const lower = instruction.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return { agent: rule.agent, complexity: rule.complexity };
    }
  }
  return { agent: 'writer', complexity: 'medium' };
}

// ── 构建 OpenAI 客户端 ──
function buildClient(agentId) {
  const config = settings.agentConfigs[agentId];
  const provider = config?.providerId
    ? settings.providers.find(p => p.id === config.providerId)
    : null;

  const apiKey = provider?.apiKey || process.env.OPENAI_API_KEY || process.env.SILICONFLOW_API_KEY || '';
  const baseURL = provider?.baseUrl
    || (process.env.SILICONFLOW_API_KEY ? 'https://api.siliconflow.cn/v1' : undefined)
    || process.env.OPENAI_BASE_URL;
  const model = config?.model || getDefaultModel(baseURL);
  const isCodingPlan = baseURL?.includes('coding.dashscope.aliyuncs.com');
  const defaultHeaders = isCodingPlan ? { 'User-Agent': 'OpenAI/Codex' } : {};
  const systemPrompt = config?.personality
    ? `${SYSTEM_PROMPTS[agentId]}\n\n个性补充：${config.personality}`
    : SYSTEM_PROMPTS[agentId];

  return {
    client: new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), defaultHeaders }),
    model,
    systemPrompt,
  };
}

function getDefaultModel(baseURL) {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (baseURL?.includes('siliconflow')) return 'Qwen/Qwen2.5-72B-Instruct';
  if (baseURL?.includes('dashscope')) return 'qwen3.5-plus';
  if (baseURL?.includes('deepseek')) return 'deepseek-chat';
  return 'gpt-4o-mini';
}

// ── 调用 Agent ──
async function callAgent(agentId, task, complexity, maxTokensOverride) {
  const { client, model, systemPrompt } = buildClient(agentId);
  const isThinking = model.includes('qwen3') || model.includes('qwq') || model.includes('glm-5') || model.includes('kimi');
  const defaultMax = complexity === 'high' ? 600 : complexity === 'medium' ? 450 : 350;
  const max_tokens = maxTokensOverride ?? defaultMax;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ],
    max_tokens,
  };
  if (isThinking && complexity !== 'high') body.enable_thinking = false;

  const completion = await client.chat.completions.create(body);
  return {
    text: completion.choices[0]?.message?.content ?? '(无输出)',
    tokens: completion.usage?.total_tokens ?? 0,
  };
}

// ── 主调度 ──
async function dispatch(instruction) {
  idleAllExcept('orchestrator');
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'running', currentTask: '理解指令中...' });

  const { client, model } = buildClient('orchestrator');
  const isThinking = model.includes('qwen3') || model.includes('qwq') || model.includes('glm-5') || model.includes('kimi');

  // 先让虾主管判断是否需要拆解任务
  let needsDecomposition = false;
  let orchestratorResponse = '';

  try {
    const judgeBody = {
      model,
      messages: [
        {
          role: 'system',
          content: `你是虾主管，负责接话并决策是否拆给专员执行。团队能做的是：选品与市场分析、文案、视觉、短视频、客服话术等跨境电商相关产出（无法联网实时爬取，但可基于常识与经验做归纳分析）。

【不要拆解】仅回复正常句子，不要说「需要拆解」：纯寒暄、无指向的短问候、或一句话能说清的极简问题。

【需要拆解】回复且仅回复：需要拆解 —— 在以下情况必须拆解，交给对应专员：
- 用户要「分析、列出、对比、总结、建议、方案」等需结构化产出
- 提到新闻/热点/资讯/趋势等，需改写为「对卖家的启示、选品方向、内容选题」等可执行任务
- 明显涉及多种能力（如既要分析又要文案）

不要输出「需要拆解」以外的固定口令。`
        },
        { role: 'user', content: instruction },
      ],
      max_tokens: 150,
    };
    if (isThinking) judgeBody.enable_thinking = false;

    const judgeResult = await client.chat.completions.create(judgeBody);
    const judgeResponse = judgeResult.choices[0]?.message?.content ?? '';

    needsDecomposition = judgeResponse.includes('需要拆解');
    orchestratorResponse = judgeResponse;

    if (judgeResult.usage?.total_tokens) {
      broadcast({ type: 'cost', agentId: 'orchestrator', tokens: judgeResult.usage.total_tokens });
    }
  } catch (err) {
    console.error('[dispatch] judgment failed:', err.message);
    needsDecomposition = false;
    orchestratorResponse = '抱歉，我这边判断出了点问题，请换种说法再试一次。';
  }

  if (shouldForceDecomposition(instruction)) {
    needsDecomposition = true;
  }

  // 如果不需要拆解，虾主管直接回应
  if (!needsDecomposition) {
    const responseTaskId = randomUUID();
    console.log('[dispatch] Simple response, task ID:', responseTaskId);
    const ts = nextTaskTimestamp();
    const responseTask = {
      id: responseTaskId,
      description: instruction,
      assignedTo: 'orchestrator',
      complexity: 'low',
      status: 'done',
      result: orchestratorResponse,
      createdAt: ts,
      completedAt: ts
    };
    console.log('[dispatch] Broadcasting task:', responseTask.id);
    broadcast({ type: 'task_add', task: responseTask });
    broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'idle' });
    console.log('[dispatch] Simple response completed');
    return;
  }

  // 需要拆解任务：先定汇报任务 id，调度活动与「虾主管汇报」气泡共用 taskId
  const reportTaskId = randomUUID();
  console.log('[dispatch] Task needs decomposition, dispatch + reportTaskId=', reportTaskId);
  broadcast({ type: 'activity', activity: { agentId: 'orchestrator', type: 'dispatch', summary: instruction, timestamp: Date.now(), taskId: reportTaskId } });
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'running', currentTask: '拆解任务中...' });

  let subtasks = [];
  try {
    const planBody = {
      model,
      messages: [
        {
          role: 'system',
          content: `你是任务拆解专家。将用户指令改写为1-3条可执行的跨境电商相关子任务（每行一条，不要编号）。

规则：
- 用户问新闻/热点/资讯时：不要拒绝；改为「从卖家视角归纳热点方向、对选品或内容的启示、可落地的行动建议」等，交给选品分析（探海）或文案（执笔）
- 含「分析、列出」时：写成明确的分析或归纳任务，匹配关键词路由到对应专员
- 优先合并为一条；确需多种交付再拆多条
- 不要输出「无法完成」「无法抓取」之类拒答，只输出任务句

示例：
用户："今天新闻是什么" → 输出：从跨境电商卖家视角，归纳近期可关注的行业热点方向及对选品的启示（基于公开信息常识）
用户："分析市场并写文案" → 输出两行：分析目标细分市场与竞品；撰写对应产品营销短文案`
        },
        { role: 'user', content: instruction },
      ],
      max_tokens: 300,
    };
    if (isThinking) planBody.enable_thinking = false;

    const plan = await client.chat.completions.create(planBody);
    subtasks = (plan.choices[0]?.message?.content ?? '')
      .split('\n')
      .map(l => l.replace(/^[\d.\-*\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (plan.usage?.total_tokens) {
      broadcast({ type: 'cost', agentId: 'orchestrator', tokens: plan.usage.total_tokens });
    }
  } catch (err) {
    console.error('[dispatch] decomposition failed:', err.message);
    subtasks = [instruction];
  }

  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'idle' });

  // 子任务仅内存排队，不在此批量插入对话流；轮到谁才 task_add
  const tasks = subtasks.map(desc => {
    const { agent, complexity } = routeTask(desc);
    return { id: randomUUID(), description: desc, assignedTo: agent, complexity, status: 'pending' };
  });

  const reportLines = tasks.map((t, i) => `${i + 1}. ${t.description} → 由 ${AGENT_DISPLAY[t.assignedTo] || t.assignedTo} 执行`);
  const orchestratorReport = `收到指令：${instruction}\n\n我已将任务拆解为 ${tasks.length} 个子任务：\n${reportLines.join('\n')}\n\n将按顺序执行，请先看下一条消息。`;

  const reportTs = nextTaskTimestamp();
  console.log('[dispatch] Broadcasting orchestrator report, task ID:', reportTaskId);
  broadcast({
    type: 'task_add',
    task: {
      id: reportTaskId,
      description: '虾主管汇报',
      assignedTo: 'orchestrator',
      complexity: 'low',
      status: 'done',
      result: orchestratorReport,
      createdAt: reportTs,
      completedAt: reportTs
    }
  });

  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'idle' });

  // 按顺序执行：轮到该专员时才加入对话（避免多只龙虾同时出现在时间线）
  for (const task of tasks) {
    const start = Date.now();
    idleAllExcept(task.assignedTo);
    const subTs = nextTaskTimestamp();
    broadcast({
      type: 'task_add',
      task: {
        ...task,
        status: 'running',
        createdAt: subTs,
      },
    });
    broadcast({ type: 'agent_status', agentId: task.assignedTo, status: 'running', currentTask: task.description });
    broadcast({ type: 'activity', activity: { agentId: task.assignedTo, type: 'task_start', summary: task.description, timestamp: Date.now(), taskId: task.id } });

    try {
      const { text, tokens } = await callAgent(task.assignedTo, task.description, task.complexity);
      const durationMs = Date.now() - start;
      broadcast({ type: 'task_update', taskId: task.id, updates: { status: 'done', result: text, completedAt: Date.now() } });
      broadcast({ type: 'agent_status', agentId: task.assignedTo, status: 'idle' });
      broadcast({ type: 'activity', activity: { agentId: task.assignedTo, type: 'task_done', summary: task.description, timestamp: Date.now(), durationMs, taskId: task.id } });
      if (tokens > 0) broadcast({ type: 'cost', agentId: task.assignedTo, tokens });
    } catch (err) {
      console.error(`[dispatch] agent ${task.assignedTo} failed:`, err.message);
      broadcast({ type: 'task_update', taskId: task.id, updates: { status: 'failed' } });
      broadcast({ type: 'agent_status', agentId: task.assignedTo, status: 'error' });
      broadcast({ type: 'activity', activity: { agentId: task.assignedTo, type: 'task_fail', summary: err.message, timestamp: Date.now(), taskId: task.id } });
    }
  }
}

// ── 小龙虾会议：虾总管主持 → 多轮辩论 → 虾总管收尾 ──
async function meeting(topic, participants = ['explorer', 'writer', 'performer', 'greeter']) {
  const meetingId = randomUUID();
  let context = `会议主题：${topic}\n\n`;

  function broadcastSpeech(agentId, role, text) {
    broadcast({
      type: 'meeting_speech',
      meetingId,
      agentId,
      role,          // 'open' | 'speak' | 'rebuttal' | 'summary'
      text,
      timestamp: Date.now(),
    });
  }

  // ── 1. 虾总管开场，拟定议程 ──
  idleAllExcept('orchestrator');
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'running', currentTask: `主持会议：${topic}` });
  try {
    const { text: openText, tokens } = await callAgent(
      'orchestrator',
      `你正在主持一场团队会议，主题：「${topic}」。\n请简短开场（60字内）：点明问题、说明今天要讨论什么、请各位专员发表看法。`,
      'low', 180
    );
    context += `[虾总管开场]: ${openText}\n\n`;
    broadcastSpeech('orchestrator', 'open', openText);
    if (tokens > 0) broadcast({ type: 'cost', agentId: 'orchestrator', tokens });
  } catch (err) {
    console.error('[meeting] open failed:', err.message);
  }
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'idle' });

  // ── 2. 第一轮：各专员独立发表观点 ──
  for (const agentId of participants) {
    idleAllExcept(agentId);
    broadcast({ type: 'agent_status', agentId, status: 'running', currentTask: `发表意见` });
    try {
      const { text, tokens } = await callAgent(
        agentId,
        `${context}\n轮到你发言了。请从你的专业角度提出具体观点或方案（100字以内，直接说重点）：`,
        'medium', 250
      );
      context += `[${AGENT_DISPLAY[agentId]}的观点]: ${text}\n\n`;
      broadcastSpeech(agentId, 'speak', text);
      if (tokens > 0) broadcast({ type: 'cost', agentId, tokens });
    } catch (err) {
      console.error(`[meeting] ${agentId} speak failed:`, err.message);
    }
    broadcast({ type: 'agent_status', agentId, status: 'idle' });
  }

  // ── 3. 第二轮：交叉辩论（每人针对前面的讨论补充或反驳） ──
  for (const agentId of participants) {
    idleAllExcept(agentId);
    broadcast({ type: 'agent_status', agentId, status: 'running', currentTask: `辩论补充` });
    try {
      const { text, tokens } = await callAgent(
        agentId,
        `${context}\n以上是各位的初步观点。现在进入辩论环节，请你针对其他人的观点提出补充、质疑或反驳（80字以内，有观点有态度）：`,
        'medium', 220
      );
      context += `[${AGENT_DISPLAY[agentId]}的补充/反驳]: ${text}\n\n`;
      broadcastSpeech(agentId, 'rebuttal', text);
      if (tokens > 0) broadcast({ type: 'cost', agentId, tokens });
    } catch (err) {
      console.error(`[meeting] ${agentId} rebuttal failed:`, err.message);
    }
    broadcast({ type: 'agent_status', agentId, status: 'idle' });
  }

  // ── 4. 虾总管收尾：综合辩论，拍板最终方案 ──
  idleAllExcept('orchestrator');
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'running', currentTask: '拍板最终方案...' });
  let summary = '';
  try {
    const { text, tokens } = await callAgent(
      'orchestrator',
      `${context}\n以上是完整会议记录。现在你作为主持人拍板：\n1. 综合各方观点，指出哪些建议被采纳、哪些被否决及原因\n2. 给出清晰可执行的最终方案（分条列出，200字以内）`,
      'high', 450
    );
    summary = text;
    broadcastSpeech('orchestrator', 'summary', text);
    if (tokens > 0) broadcast({ type: 'cost', agentId: 'orchestrator', tokens });
  } catch (err) {
    console.error('[meeting] summary failed:', err.message);
    summary = '会议总结生成失败，请重试。';
  }
  broadcast({ type: 'agent_status', agentId: 'orchestrator', status: 'idle' });
  idleAllExcept(null);

  return summary;
}

// ── 平台消息回调：每个 Agent 完成后立即推送，消息头带 Agent 名称 ──
async function handlePlatformMessage(userId, text, platformId) {
  console.log(`[platform:${platformId}] message from ${userId}: ${text}`);

  // taskId → agentId 映射（task_add 时记录，task_update done 时查询）
  const taskAgentMap = {};

  global.__platformResultListener = (msg) => {
    // task_add：记录归属关系；已完成的（虾总管汇报）直接推送
    if (msg.type === 'task_add' && msg.task) {
      const { id, assignedTo, status, result } = msg.task;
      taskAgentMap[id] = assignedTo;
      if (status === 'done' && result) {
        const label = AGENT_DISPLAY[assignedTo] || assignedTo;
        sendToPlatform(platformId, userId, `【${label}】\n\n${result}`).catch(() => {});
      }
    }
    // task_update done：子任务完成，带名称推送
    if (msg.type === 'task_update' && msg.updates?.status === 'done' && msg.updates?.result) {
      const agentId = taskAgentMap[msg.taskId];
      const label = AGENT_DISPLAY[agentId] || agentId || '龙虾';
      sendToPlatform(platformId, userId, `【${label}】\n\n${msg.updates.result}`).catch(() => {});
    }
  };

  try {
    await dispatch(text);
    // 等待最后一批异步推送完成
    await new Promise(r => setTimeout(r, 1500));
  } finally {
    global.__platformResultListener = null;
  }
}

// ── HTTP 服务器（WebSocket 升级 + Webhook 路由）──
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    writeJson(res, 200, settings);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/settings') {
    try {
      const body = await readJson(req);
      if (body.providers) settings.providers = body.providers;
      if (body.agentConfigs) settings.agentConfigs = body.agentConfigs;
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: '设置数据格式错误' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/test-model') {
    try {
      const { apiKey, baseUrl, model } = await readJson(req);

      if (!apiKey?.trim()) {
        writeJson(res, 200, { ok: false, error: 'API Key 不能为空' });
        return;
      }
      if (!model?.trim()) {
        writeJson(res, 200, { ok: false, error: '模型名不能为空' });
        return;
      }

      const start = Date.now();
      const isCodingPlan = baseUrl?.includes('coding.dashscope.aliyuncs.com');
      const client = new OpenAI({
        apiKey,
        ...(baseUrl?.trim() ? { baseURL: baseUrl.trim() } : {}),
        ...(isCodingPlan ? { defaultHeaders: { 'User-Agent': 'OpenAI/Codex' } } : {}),
      });

      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
      });

      writeJson(res, 200, {
        ok: true,
        reply: completion.choices[0]?.message?.content ?? '',
        latencyMs: Date.now() - start,
        model: completion.model,
        tokens: completion.usage?.total_tokens ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = msg.includes('401') ? 'API Key 无效或已过期'
        : msg.includes('404') ? '模型不存在，请检查模型名'
        : msg.includes('429') ? '请求频率超限，稍后重试'
        : msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') ? '无法连接到 API 地址，请检查 Base URL'
        : msg.slice(0, 120);
      writeJson(res, 200, { ok: false, error: friendly, detail: msg.slice(0, 300) });
    }
    return;
  }

  // LINE Webhook
  if (req.method === 'POST' && url.pathname === '/webhook/line') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      const adapter = globalThis.__lineAdapter;
      if (!adapter) { res.writeHead(404); res.end(); return; }
      try {
        const events = JSON.parse(body).events ?? [];
        await adapter.handleWebhookEvents(events);
        res.writeHead(200); res.end('OK');
      } catch { res.writeHead(500); res.end(); }
    });
    return;
  }

  // 飞书 Webhook
  if ((req.method === 'POST' || req.method === 'GET') && url.pathname === '/webhook/feishu') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      const adapter = globalThis.__feishuAdapter;
      if (!adapter) { res.writeHead(404); res.end(); return; }
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = await adapter.handleWebhookEvent(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch { res.writeHead(500); res.end(); }
    });
    return;
  }

  // 企业微信 Webhook（GET 验证 + POST 消息）
  if (url.pathname === '/webhook/wecom') {
    const adapter = globalThis.__wecomAdapter;
    if (!adapter) { res.writeHead(404); res.end(); return; }
    if (req.method === 'GET') {
      const echostr = url.searchParams.get('echostr') ?? '';
      const query = Object.fromEntries(url.searchParams);
      if (adapter.verifySignature({ ...query, echostr })) {
        res.writeHead(200); res.end(echostr);
      } else {
        res.writeHead(403); res.end();
      }
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', async () => {
        const query = Object.fromEntries(url.searchParams);
        const result = await adapter.handleWebhookMessage(body, query);
        res.writeHead(200); res.end(result);
      });
      return;
    }
  }

  res.writeHead(404); res.end();
});

// ── WebSocket 服务器 ──
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected, total=${clients.size}`);

  // 发送连接确认
  ws.send(JSON.stringify({ type: 'connected' }));

  ws.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      case 'settings_sync':
        if (msg.providers) settings.providers = msg.providers;
        if (msg.agentConfigs) settings.agentConfigs = msg.agentConfigs;
        console.log(`[ws] settings synced, providers=${settings.providers.length}`);
        ws.send(JSON.stringify({ type: 'settings_ack' }));
        break;

      case 'platform_sync':
        if (!msg.platformId) break;
        if (msg.enabled && msg.fields) {
          startPlatform(msg.platformId, msg.fields, handlePlatformMessage).catch(err => {
            console.error(`[ws] platform ${msg.platformId} start failed:`, err.message);
            ws.send(JSON.stringify({ type: 'platform_error', platformId: msg.platformId, error: err.message }));
          });
        } else {
          stopPlatform(msg.platformId);
        }
        break;

      case 'dispatch':
        if (!msg.instruction?.trim()) break;
        dispatch(msg.instruction).catch(err => console.error('[ws] dispatch error:', err.message));
        break;

      case 'meeting':
        if (!msg.topic?.trim()) break;
        meeting(msg.topic, msg.participants).then(result => {
          ws.send(JSON.stringify({ type: 'meeting_result', result }));
        }).catch(err => {
          ws.send(JSON.stringify({ type: 'meeting_result', error: err.message }));
        });
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected, total=${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[ws] client error:', err.message);
    clients.delete(ws);
  });
});

wss.on('error', (err) => {
  console.error('[ws-server] error:', err.message);
});

httpServer.listen(PORT, () => {
  console.log(`[ws-server] listening on ws://localhost:${PORT}`);
  console.log(`[ws-server] webhooks: POST /webhook/line | POST /webhook/feishu | GET|POST /webhook/wecom`);
});

export function stopServer() {
  for (const ws of clients) {
    try { ws.close(); } catch {}
  }
  try { wss.close(); } catch {}
  try { httpServer.close(); } catch {}
}
