/**
 * 端到端流程测试：自然语言搜索
 *
 * 模拟流程：
 *   用户输入自然语言 → 路由判断 → 鹦鹉螺(orchestrator) → 浏览器搜索 → 返回结果
 *
 * 用法：
 *   cd apps/web
 *   node server/test-agent-search.js
 *   node server/test-agent-search.js "搜索 AirPods Pro 最新价格"
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { queryAgent, clearAllSessions } from "./agent-engine.js";
import { getAgentTools } from "./agent-tools.js";
import { closeBrowser } from "./browser-manager.js";

// ── 加载 .env.local ──────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = resolve(__dir, "../.env.local");
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      if (m[2].trim() === "") delete process.env[m[1]];
      else process.env[m[1]] = m[2].trim();
    }
  }
} catch {}

// ── 颜色输出 ─────────────────────────────────────────────────────────────────
const R = "\x1b[0m";
const G = "\x1b[32m";
const C = "\x1b[36m";
const Y = "\x1b[33m";
const B = "\x1b[34m";
const M = "\x1b[35m";

const ok   = (m) => console.log(`${G}✓ ${m}${R}`);
const info = (m) => console.log(`${C}→ ${m}${R}`);
const step = (m) => console.log(`${Y}▶ ${m}${R}`);
const agent= (m) => console.log(`${M}🦐 ${m}${R}`);
const sep  = ()  => console.log(`${B}${"─".repeat(50)}${R}`);

// ── 路由规则（与 ws-server.js 保持一致）──────────────────────────────────────
const ROUTING_RULES = [
  { keywords: ["浏览器","打开网页","打开网站","截图","爬取","爬虫","搜索网页","访问网址","访问网站","点击","填写表单","自动化操作","browser"], agent: "orchestrator" },
  { keywords: ["新闻","热点","资讯","时事","头条","舆情","列出","对比"], agent: "explorer" },
  { keywords: ["竞品","选品","趋势","数据","市场","分析"], agent: "explorer" },
  { keywords: ["文案","标题","seo","详情","描述","翻译","多语"], agent: "writer" },
  { keywords: ["图片","海报","设计","素材","banner","视觉","生图","绘图"], agent: "designer" },
  { keywords: ["视频","数字人","tiktok","抖音","发布","矩阵","脚本"], agent: "performer" },
  { keywords: ["客服","评论","回复","售后","问答","投诉","买家"], agent: "greeter" },
];

const AGENT_DISPLAY = {
  orchestrator: "鹦鹉螺（浏览器控制）",
  explorer: "探海鲸鱼（选品分析）",
  writer: "星海章鱼（文案）",
  designer: "珊瑚水母（设计）",
  performer: "逐浪海豚（视频）",
  greeter: "招潮蟹（客服）",
};

// 搜索类关键词强制走 orchestrator（浏览器搜索）
const SEARCH_KEYWORDS = ["搜索","查找","查询","找一下","帮我找","帮我搜","search"];

function routeMessage(text) {
  const t = text.toLowerCase();

  // 搜索意图 → orchestrator
  if (SEARCH_KEYWORDS.some(kw => t.includes(kw))) return "orchestrator";

  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some(kw => t.includes(kw.toLowerCase()))) {
      return rule.agent;
    }
  }
  return "orchestrator"; // 默认
}

// ── 系统提示词 ────────────────────────────────────────────────────────────────
const BREVITY = "\n\n【输出要求】言简意赅、直入主题；先结论后补充；避免冗长寒暄与套话；除必须条目外尽量控制在300字内。";

const SYSTEM_PROMPT_ORCHESTRATOR =
  "你是跨境电商 AI 团队的总协调员鹦鹉螺，负责任务拆解和团队协调。回复与汇报都要简短有力。"
  + "\n\n你拥有浏览器控制能力，可以使用以下工具：browser_goto（导航到URL）、browser_get_text（读取页面文字内容，搜索后必须用这个提取结果）、browser_page_info（获取页面信息）、browser_screenshot（截图识图）、browser_act（自然语言操作，如点击/填写/滚动）、browser_act_single（精确选择器操作）、browser_act_multi（批量操作）。"
  + "\n\n【搜索流程】：1.browser_goto 导航到搜索页 → 2.browser_get_text 读取页面内容 → 3.整理结果回复用户。不要反复跳转，读到内容就总结。"
  + "\n\n【遇到登录页】：换用百度/必应搜索该关键词，或直接总结已知信息。"
  + BREVITY;

// ── 主测试流程 ────────────────────────────────────────────────────────────────
async function runSearchFlow(userInput) {
  console.log("\n");
  sep();
  console.log(`${B}  鹦鹉螺 · 自然语言搜索流程测试${R}`);
  sep();

  // Step 1: 用户输入
  step(`[1/4] 用户输入`);
  console.log(`      "${userInput}"`);

  // Step 2: 路由判断
  step(`[2/4] 路由判断`);
  const targetAgent = routeMessage(userInput);
  ok(`  → 路由到：${AGENT_DISPLAY[targetAgent] || targetAgent}`);

  if (targetAgent !== "orchestrator") {
    console.log(`\n${Y}注意：该输入被路由到 ${targetAgent}，不走浏览器搜索流程。${R}`);
    console.log(`请使用包含"搜索"、"查找"等关键词的输入来触发浏览器搜索。\n`);
    return;
  }

  // Step 3: 初始化 Agent
  step(`[3/4] 初始化鹦鹉螺 Agent`);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`${"\x1b[31m"}✗ 未找到 ANTHROPIC_API_KEY，请在 .env.local 中配置${R}`);
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });
  const tools = getAgentTools("orchestrator");
  ok(`  工具已加载：${tools.map(t => t.name).join(", ")}`);

  clearAllSessions();
  const sessionId = `test-${Date.now()}`;

  // Step 4: 执行查询（Agent 自主控制浏览器）
  step(`[4/4] 鹦鹉螺执行任务（浏览器自动化中...）`);
  agent(`收到指令："${userInput}"`);
  console.log(`${C}  Agent 正在思考并调用浏览器工具，请稍候...${R}\n`);

  const startTime = Date.now();

  try {
    const result = await queryAgent({
      agentId: "orchestrator",
      sessionId,
      task: userInput,
      systemPrompt: SYSTEM_PROMPT_ORCHESTRATOR,
      tools,
      maxTokens: 2048,
      model: "claude-3-5-sonnet-20241022",
      client,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    sep();
    agent(`鹦鹉螺回复（耗时 ${elapsed}s，消耗 ${result.tokens} tokens）：`);
    sep();
    console.log(`\n${result.text}\n`);
    sep();
    ok("流程测试完成");

  } catch (err) {
    console.error(`${"\x1b[31m"}✗ 执行失败：${err.message}${R}`);
    console.error(err);
  }

  await closeBrowser();
  console.log();
}

// ── 入口 ──────────────────────────────────────────────────────────────────────
const userInput = process.argv[2] || "帮我搜索一下 iPhone 16 Pro 最新价格";

runSearchFlow(userInput).catch(err => {
  console.error("未捕获异常:", err);
  closeBrowser().finally(() => process.exit(1));
});
