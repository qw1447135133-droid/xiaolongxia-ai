import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { promises as fs, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { spawn } from "child_process";
import Anthropic from "@anthropic-ai/sdk";

// ── 加载 .env.local（强制覆盖系统环境变量）──
const __dirname_ws = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname_ws, '..', '.env.local');
const repoRoot = join(__dirname_ws, "..");
const hermesDispatchPrototypePath = join(repoRoot, "prototypes", "hermes-dispatch", "run.mjs");
const hermesDispatchSamplePlanPath = join(repoRoot, "prototypes", "hermes-dispatch", "sample-plan.json");
const hermesDispatchOutputRoot = join(repoRoot, "output", "hermes-dispatch");
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
import {
  cleanupClientLaunchRequests,
  getDesktopRuntimeSummary,
  handleDesktopInputControlResult,
  handleDesktopInstalledApplicationsResult,
  handleDesktopLaunchResult,
  handleDesktopScreenshotResult,
  removeClientRuntime,
  updateClientRuntime,
} from "./desktop-bridge.js";

process.on("uncaughtException", (err) => {
  console.error("[ws-server] uncaughtException:", err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[ws-server] unhandledRejection:", reason);
});

const PORT = Number(process.env.WS_PORT || 3001);
const clients = new Set();
let settings = {
  providers: [],
  agentConfigs: {},
  userNickname: "您",
  desktopProgramSettings: {
    enabled: true,
    whitelistMode: false,
    favorites: [],
    whitelist: [],
    inputControl: {
      enabled: false,
      autoOpenPanelOnAction: true,
      requireManualTakeoverForVerification: true,
    },
  },
};
const hermesDispatchRuns = new Map();

const ROUTING_RULES = [
  { keywords: ["浏览器", "打开网页", "打开网站", "截图", "爬取", "爬虫", "搜索网页", "访问网址", "访问网站", "点击", "填写表单", "自动化操作", "browser"], agent: "orchestrator", complexity: "medium" },
  { keywords: ["列出", "对比"], agent: "explorer", complexity: "medium" },
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
    + "\n\n你还可以使用 desktop_list_installed_applications 工具先读取本机已安装程序列表，再用 desktop_launch_native_application 启动对应程序，例如微信、飞书、Chrome、VS Code、资源管理器或指定 exe。只有当用户明确要求打开/启动本机程序，或任务确实需要调用本机应用时才使用。"
    + "\n\n当桌面端应用无法通过代码或普通浏览器自动化完成时，你还可以先用 desktop_capture_screenshot 观察当前桌面，再用 desktop_control_input 模拟鼠标和键盘，处理桌面端应用、系统弹窗和纯 UI 交互。若任务涉及验证码、人机验证、OTP/2FA 或类似验证步骤，不要尝试自动绕过，应切换到人工接管。"
    + "\n\n【桌面视觉闭环】对于桌面点击/输入任务，优先采用这套顺序：1. desktop_capture_screenshot 获取当前桌面；2. 基于图片与尺寸估算目标元素中心点坐标（左上角为 0,0）；3. 用 desktop_control_input 执行 click/type/key/hotkey；4. 再次 desktop_capture_screenshot 验证是否成功；5. 若第一次验证仍失败，优先使用 desktop_control_input 返回的 retrySuggestions 做一次附近偏移重试；6. 再次截图确认；7. 如连续两次仍无法确认结果，停止自动操作并转人工接管。"
    + "\n\n【自主联网规则】：当任务依赖最新信息、网页资料、实时趋势、新闻、公告、价格、页面内容、链接内容或外部站点证据时，你应主动使用浏览器工具，不需要等用户明确要求“去搜索”或“打开网页”。"
    + "\n\n【搜索流程】：1.browser_goto 导航到搜索页或目标页 → 2.browser_get_text 读取页面内容 → 3.整理结果回复用户。不要反复跳转，读到内容就总结。"
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

function commandLocator() {
  return process.platform === "win32" ? "where" : "which";
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const child = spawn(commandLocator(), [command], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "run";
}

async function safeReadJson(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function safeReadText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function tailText(value, maxChars = 6000) {
  if (!value) return "";
  return value.length <= maxChars ? value : value.slice(-maxChars);
}

async function getHermesDispatchAvailability() {
  const checks = await Promise.all([
    commandAvailable("hermes"),
    commandAvailable("codex"),
    commandAvailable("claude"),
    commandAvailable("gemini"),
  ]);

  return {
    hermes: { command: "hermes", available: checks[0] },
    codex: { command: "codex", available: checks[1] },
    claude: { command: "claude", available: checks[2] },
    gemini: { command: "gemini", available: checks[3] },
  };
}

async function collectHermesDispatchRunFromDirectory(dirName) {
  const runDir = join(hermesDispatchOutputRoot, dirName);
  const plan = await safeReadJson(join(runDir, "plan.json"));
  const summary = await safeReadJson(join(runDir, "summary.json"));
  const results = await safeReadJson(join(runDir, "results.json"));
  const plannerStdout = await safeReadText(join(runDir, "planner-stdout.txt"));
  const latestTaskStdout = await collectLatestTaskLog(runDir, "stdout.txt");
  const latestTaskStderr = await collectLatestTaskLog(runDir, "stderr.txt");
  const createdAt = Number.isFinite(Date.parse(dirName.split("-run-")[0] || dirName))
    ? Date.parse(dirName.split("-run-")[0] || dirName)
    : Date.now();

  return {
    id: dirName,
    instruction: plan?.summary || "",
    mode: summary ? "execute" : "plan-only",
    planner: "hermes",
    status: summary ? (summary.failed > 0 ? "failed" : "completed") : "planned",
    createdAt,
    updatedAt: createdAt,
    outputDir: runDir,
    plan,
    summary,
    results,
    stdoutTail: tailText(latestTaskStdout || plannerStdout),
    stderrTail: tailText(latestTaskStderr),
    error: null,
  };
}

async function collectLatestTaskLog(runDir, fileName) {
  try {
    const entries = await fs.readdir(runDir, { withFileTypes: true });
    const taskDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
      .reverse();

    for (const taskDir of taskDirs) {
      const filePath = join(runDir, taskDir, fileName);
      if (existsSync(filePath)) {
        return await safeReadText(filePath);
      }
    }
  } catch {}

  return "";
}

async function listHermesDispatchRuns() {
  await fs.mkdir(hermesDispatchOutputRoot, { recursive: true });
  const directoryEntries = await fs.readdir(hermesDispatchOutputRoot, { withFileTypes: true });
  const finishedRuns = await Promise.all(
    directoryEntries
      .filter(entry => entry.isDirectory())
      .map(entry => collectHermesDispatchRunFromDirectory(entry.name)),
  );

  const merged = new Map(finishedRuns.map(run => [run.id, run]));
  for (const [runId, run] of hermesDispatchRuns.entries()) {
    merged.set(runId, {
      ...merged.get(runId),
      ...run,
    });
  }

  return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 20);
}

async function startHermesDispatchRun({ instruction, planOnly = false, useSamplePlan = false }) {
  await fs.mkdir(hermesDispatchOutputRoot, { recursive: true });

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-run-${slugify(instruction || "sample")}`;
  const outputDir = join(hermesDispatchOutputRoot, runId);
  await fs.mkdir(outputDir, { recursive: true });

  const args = [hermesDispatchPrototypePath, "--output-dir", outputDir];
  if (planOnly) args.push("--plan-only");
  if (useSamplePlan) {
    args.push("--plan-file", hermesDispatchSamplePlanPath);
  } else {
    args.push(instruction);
  }

  const runState = {
    id: runId,
    instruction: instruction || "样例计划演示",
    mode: planOnly ? "plan-only" : "execute",
    planner: useSamplePlan ? "sample" : "hermes",
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    outputDir,
    stdoutTail: "",
    stderrTail: "",
    error: null,
  };
  hermesDispatchRuns.set(runId, runState);

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  runState.status = "running";
  runState.updatedAt = Date.now();

  child.stdout.on("data", chunk => {
    runState.stdoutTail = tailText(`${runState.stdoutTail}${chunk.toString()}`);
    runState.updatedAt = Date.now();
  });

  child.stderr.on("data", chunk => {
    runState.stderrTail = tailText(`${runState.stderrTail}${chunk.toString()}`);
    runState.updatedAt = Date.now();
  });

  child.on("error", error => {
    runState.status = "failed";
    runState.error = error.message;
    runState.updatedAt = Date.now();
  });

  child.on("close", async (code) => {
    const plan = await safeReadJson(join(outputDir, "plan.json"));
    const summary = await safeReadJson(join(outputDir, "summary.json"));
    const results = await safeReadJson(join(outputDir, "results.json"));

    runState.status = summary
      ? (summary.failed > 0 || code !== 0 ? "failed" : "completed")
      : (code === 0 ? "planned" : "failed");
    runState.updatedAt = Date.now();
    runState.exitCode = code;
    runState.plan = plan;
    runState.summary = summary;
    runState.results = results;
    if (code !== 0 && !runState.error) {
      runState.error = tailText(runState.stderrTail) || `dispatch process exited with code ${code}`;
    }
  });

  return runState;
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

function makeExecutionEvent({ type, title, detail, agentId, taskId, timestamp = Date.now() }) {
  return {
    id: randomUUID(),
    type,
    title,
    detail,
    agentId,
    taskId,
    timestamp,
  };
}

function broadcastExecutionUpdate(payload) {
  broadcast({
    type: "execution_update",
    ...payload,
  });
}

function parseToolResultPayload(result) {
  if (typeof result !== "string") return result ?? null;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function buildDesktopToolEvent({ toolName, phase, input, result, error, agentId, taskId }) {
  const target = typeof input?.target === "string" ? input.target.trim() : "";
  const query = typeof input?.query === "string" ? input.query.trim() : "";
  const resolvedResult = parseToolResultPayload(result);

  if (toolName === "desktop_launch_native_application") {
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "请求启动本机程序",
        detail: target ? `目标程序：${target}` : "已发起本机程序启动请求。",
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const message = typeof resolvedResult === "object" && resolvedResult && "message" in resolvedResult
        ? String(resolvedResult.message || "")
        : "";
      return makeExecutionEvent({
        type: "result",
        title: "本机程序已启动",
        detail: message || (target ? `已启动 ${target}` : "桌面客户端已确认启动。"),
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "本机程序启动被拒绝" : "本机程序启动失败",
        detail: String(error || target || "桌面客户端未能启动目标程序。"),
        agentId,
        taskId,
      });
    }
  }

  if (toolName === "desktop_control_input") {
    const action = typeof input?.action === "string" ? input.action : "桌面接管";
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "请求桌面鼠标键盘接管",
        detail: target
          ? `目标：${target} · 动作：${action}`
          : `动作：${action}`,
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const manualRequired = typeof resolvedResult === "object" && resolvedResult && "manualRequired" in resolvedResult
        ? Boolean(resolvedResult.manualRequired)
        : false;
      const message = typeof resolvedResult === "object" && resolvedResult && "message" in resolvedResult
        ? String(resolvedResult.message || "")
        : "";
      return makeExecutionEvent({
        type: manualRequired ? "system" : "result",
        title: manualRequired ? "已切换人工接管" : "桌面输入已执行",
        detail: message || `动作：${action}`,
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "桌面接管被拒绝" : "桌面接管失败",
        detail: String(error || action || "桌面客户端未能完成鼠标键盘接管。"),
        agentId,
        taskId,
      });
    }
  }

  if (toolName === "desktop_capture_screenshot") {
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "请求桌面截图",
        detail: target ? `目标：${target}` : "已发起桌面截图请求。",
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const message = typeof resolvedResult === "object" && resolvedResult && "message" in resolvedResult
        ? String(resolvedResult.message || "")
        : "";
      return makeExecutionEvent({
        type: "result",
        title: "桌面截图已返回",
        detail: message || "桌面客户端已返回当前截图。",
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "桌面截图被拒绝" : "桌面截图失败",
        detail: String(error || target || "桌面客户端未能返回桌面截图。"),
        agentId,
        taskId,
      });
    }
  }

  if (toolName === "desktop_list_installed_applications") {
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "开始读取本机程序列表",
        detail: query ? `筛选关键词：${query}` : "正在读取桌面客户端已安装程序列表。",
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const matched = typeof resolvedResult === "object" && resolvedResult && "totalMatched" in resolvedResult
        ? Number(resolvedResult.totalMatched || 0)
        : undefined;
      return makeExecutionEvent({
        type: "result",
        title: "已获取本机程序列表",
        detail: typeof matched === "number"
          ? `共匹配 ${matched} 个程序${query ? `，关键词：${query}` : ""}`
          : (query ? `已返回关键词“${query}”的候选程序。` : "桌面客户端已返回程序清单。"),
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "读取本机程序列表被拒绝" : "读取本机程序列表失败",
        detail: String(error || query || "桌面客户端未能返回程序清单。"),
        agentId,
        taskId,
      });
    }
  }

  return null;
}

function buildDesktopToolActivity({ toolName, phase, input, result, error, agentId, taskId }) {
  const target = typeof input?.target === "string" ? input.target.trim() : "";
  const query = typeof input?.query === "string" ? input.query.trim() : "";
  const resolvedResult = parseToolResultPayload(result);
  const timestamp = Date.now();

  if (toolName === "desktop_launch_native_application") {
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: target ? `请求启动 ${target}` : "请求启动本机程序",
        detail: typeof input?.reason === "string" && input.reason.trim() ? input.reason.trim() : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      const message = typeof resolvedResult === "object" && resolvedResult && "message" in resolvedResult
        ? String(resolvedResult.message || "")
        : "";
      return {
        agentId,
        type: "tool_done",
        summary: target ? `已启动 ${target}` : "本机程序已启动",
        detail: message || undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: target ? `${target} 启动失败` : "本机程序启动失败",
        detail: String(error || "桌面客户端未能启动目标程序。"),
        timestamp,
        taskId,
      };
    }
  }

  if (toolName === "desktop_control_input") {
    const action = typeof input?.action === "string" ? input.action : "桌面接管";
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: target ? `接管 ${target}` : "请求桌面鼠标键盘接管",
        detail: typeof input?.intent === "string" && input.intent.trim() ? input.intent.trim() : `动作：${action}`,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      const manualRequired = typeof resolvedResult === "object" && resolvedResult && "manualRequired" in resolvedResult
        ? Boolean(resolvedResult.manualRequired)
        : false;
      const message = typeof resolvedResult === "object" && resolvedResult && "message" in resolvedResult
        ? String(resolvedResult.message || "")
        : "";
      return {
        agentId,
        type: "tool_done",
        summary: manualRequired ? "已切到人工接管" : `桌面动作已执行：${action}`,
        detail: message || undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: `桌面接管失败：${action}`,
        detail: String(error || "桌面客户端未能完成鼠标键盘接管。"),
        timestamp,
        taskId,
      };
    }
  }

  if (toolName === "desktop_capture_screenshot") {
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: target ? `请求桌面截图：${target}` : "请求桌面截图",
        detail: typeof input?.intent === "string" && input.intent.trim() ? input.intent.trim() : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      return {
        agentId,
        type: "tool_done",
        summary: "桌面截图已返回",
        detail: target ? `目标：${target}` : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: "桌面截图失败",
        detail: String(error || "桌面客户端未能返回桌面截图。"),
        timestamp,
        taskId,
      };
    }
  }

  if (toolName === "desktop_list_installed_applications") {
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: query ? `扫描程序列表：${query}` : "读取本机程序列表",
        detail: typeof input?.source === "string" && input.source !== "all" ? `来源：${input.source}` : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      const matched = typeof resolvedResult === "object" && resolvedResult && "totalMatched" in resolvedResult
        ? Number(resolvedResult.totalMatched || 0)
        : undefined;
      return {
        agentId,
        type: "tool_done",
        summary: typeof matched === "number" ? `已获取 ${matched} 个程序候选` : "已获取本机程序列表",
        detail: query ? `关键词：${query}` : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: query ? `程序列表读取失败：${query}` : "程序列表读取失败",
        detail: String(error || "桌面客户端未能返回程序清单。"),
        timestamp,
        taskId,
      };
    }
  }

  return null;
}

function createToolEventReporter({ executionRunId, sessionId, agentId, taskId }) {
  return async ({ toolName, phase, input, result, error }) => {
    if (!toolName?.startsWith("desktop_")) return;
    const event = buildDesktopToolEvent({
      toolName,
      phase,
      input,
      result,
      error,
      agentId,
      taskId,
    });
    if (!event) return;

    const activity = buildDesktopToolActivity({
      toolName,
      phase,
      input,
      result,
      error,
      agentId,
      taskId,
    });
    if (activity) {
      broadcast({
        type: "activity",
        executionRunId,
        activity,
      });
    }

    broadcastExecutionUpdate({
      executionRunId,
      sessionId,
      currentAgentId: agentId,
      timestamp: event.timestamp,
      event,
    });
  };
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

function shouldPreferOrchestratorForWebResearch(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;

  return [
    "最新",
    "今天",
    "今日",
    "实时",
    "新闻",
    "热点",
    "资讯",
    "头条",
    "舆情",
    "公告",
    "资料",
    "官网",
    "网页",
    "页面",
    "链接",
    "网站",
    "查一下",
    "搜一下",
    "搜索",
  ].some(keyword => t.includes(keyword));
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
  const nick = settings.userNickname || "您";

  if (!t) return `我在，${nick}可以直接说需求。`;
  if (/^(?:你好|您好|嗨|哈喽|hello|hi|早上好|中午好|下午好|晚上好)[!！。.?？\s]*$/i.test(t)) {
    return `我在，${nick}可以直接说需求，我来帮你判断是我直接回复，还是分给对应龙虾执行。`;
  }
  if (/^(?:在吗)[!！。.?？\s]*$/i.test(t)) {
    return `在，${nick}直接说。`;
  }
  if (/^(?:谢谢|感谢)[!！。.?？\s]*$/i.test(t)) {
    return `不客气，${nick}。`;
  }
  if (/^(?:再见|拜拜)[!！。.?？\s]*$/i.test(t)) {
    return `好，${nick}，有需要随时叫我。`;
  }
  if (/^(?:你是谁|介绍一下自己)[!！。.?？\s]*$/i.test(t)) {
    return `我是虾总管，${nick}可以把需求直接发给我，我会判断是由我直接回复，还是分配给选品、文案、设计、视频、客服这些执行龙虾。`;
  }
  if (/^(?:你是干什么的|你能做什么|怎么用)[!！。.?？\s]*$/i.test(t)) {
    return `我是负责调度的小龙虾主管。${nick}可以直接发任务，比如选品分析、文案、海报、短视频脚本、客服话术，我会直接处理或安排合适的龙虾执行。`;
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
  if (shouldPreferOrchestratorForWebResearch(lower)) {
    return { agent: "orchestrator", complexity: "medium" };
  }
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

async function callAgent(agentId, task, complexity, maxTokensOverride, sessionId = "default", executionMeta = {}) {
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
    onToolEvent: executionMeta.executionRunId
      ? createToolEventReporter({
          executionRunId: executionMeta.executionRunId,
          sessionId,
          agentId,
          taskId: executionMeta.taskId,
        })
      : undefined,
    toolContext: executionMeta.requesterWs
      ? {
          desktopClientWs: executionMeta.requesterWs,
          executionRunId: executionMeta.executionRunId,
          taskId: executionMeta.taskId,
          sessionId,
        }
      : undefined,
  });
}

async function dispatch(instruction, sessionId = "default", executionRunId = randomUUID(), source = "chat", requesterWs = null) {
  const runId = executionRunId || randomUUID();
  const createdAt = Date.now();
  broadcastExecutionUpdate({
    executionRunId: runId,
    sessionId,
    instruction,
    source,
    status: "analyzing",
    timestamp: createdAt,
    event: makeExecutionEvent({
      type: "dispatch",
      title: "开始分析需求",
      detail: instruction,
      timestamp: createdAt,
    }),
  });

  idleAllExcept("orchestrator");
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "理解指令中...", executionRunId: runId });

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
          { executionRunId: runId, requesterWs },
        );
        text = response.text;
        tokens = response.tokens;
      }

      const ts = nextTaskTimestamp();
      broadcast({
        type: "task_add",
        executionRunId: runId,
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
      broadcastExecutionUpdate({
        executionRunId: runId,
        sessionId,
        status: "completed",
        totalTasks: 1,
        completedTasks: 1,
        currentAgentId: "orchestrator",
        completedAt: Date.now(),
        event: makeExecutionEvent({
          type: "result",
          title: "虾总管直接完成回复",
          detail: String(text || "").slice(0, 200),
          agentId: "orchestrator",
        }),
      });
    } catch (err) {
      const ts = nextTaskTimestamp();
      broadcast({
        type: "task_add",
        executionRunId: runId,
        task: {
          id: randomUUID(),
          description: instruction,
          assignedTo: "orchestrator",
          complexity: "low",
          status: "done",
          result: `我在，${settings.userNickname || "您"}可以直接说需求。`,
          createdAt: ts,
          completedAt: ts,
        },
      });
      console.error("[dispatch] direct orchestrator reply failed:", err?.message || err);
      broadcastExecutionUpdate({
        executionRunId: runId,
        sessionId,
        status: "failed",
        totalTasks: 1,
        failedTasks: 1,
        currentAgentId: "orchestrator",
        completedAt: Date.now(),
        event: makeExecutionEvent({
          type: "error",
          title: "虾总管回复时发生异常",
          detail: String(err?.message || err),
          agentId: "orchestrator",
        }),
      });
    }

    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle", executionRunId: runId });
    return;
  }

  const reportTaskId = randomUUID();
  broadcast({ type: "activity", executionRunId: runId, activity: { agentId: "orchestrator", type: "dispatch", summary: instruction, timestamp: Date.now(), taskId: reportTaskId } });

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
    executionRunId: runId,
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
  broadcastExecutionUpdate({
    executionRunId: runId,
    sessionId,
    status: "running",
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    currentAgentId: "orchestrator",
    event: makeExecutionEvent({
      type: "dispatch",
      title: `任务已拆解为 ${tasks.length} 个步骤`,
      detail: tasks.map((task, index) => `${index + 1}. ${task.description} -> ${AGENT_DISPLAY[task.assignedTo]}`).join("\n"),
      agentId: "orchestrator",
      taskId: reportTaskId,
    }),
  });
  broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle", executionRunId: runId });

  let completedTasks = 0;
  let failedTasks = 0;
  for (const task of tasks) {
    const start = Date.now();
    const createdAt = nextTaskTimestamp();
    idleAllExcept(task.assignedTo);
    broadcast({
      type: "task_add",
      executionRunId: runId,
      task: {
        ...task,
        status: "running",
        createdAt,
      },
    });
    broadcast({ type: "agent_status", agentId: task.assignedTo, status: "running", currentTask: task.description, executionRunId: runId });
    broadcast({ type: "activity", executionRunId: runId, activity: { agentId: task.assignedTo, type: "task_start", summary: task.description, timestamp: Date.now(), taskId: task.id } });
    broadcastExecutionUpdate({
      executionRunId: runId,
      sessionId,
      status: "running",
      totalTasks: tasks.length,
      completedTasks,
      failedTasks,
      currentAgentId: task.assignedTo,
      event: makeExecutionEvent({
        type: "agent",
        title: `${AGENT_DISPLAY[task.assignedTo]} 开始执行`,
        detail: task.description,
        agentId: task.assignedTo,
        taskId: task.id,
      }),
    });

    try {
      const { text, tokens } = await callAgent(
        task.assignedTo,
        task.description,
        task.complexity,
        undefined,
        sessionId,
        { executionRunId: runId, taskId: task.id, requesterWs },
      );
      broadcast({
        type: "task_update",
        executionRunId: runId,
        taskId: task.id,
        updates: {
          status: "done",
          result: text,
          completedAt: Date.now(),
        },
      });
      completedTasks += 1;
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "idle", executionRunId: runId });
      broadcast({ type: "activity", executionRunId: runId, activity: { agentId: task.assignedTo, type: "task_done", summary: task.description, timestamp: Date.now(), durationMs: Date.now() - start, taskId: task.id } });
      broadcastExecutionUpdate({
        executionRunId: runId,
        sessionId,
        status: "running",
        totalTasks: tasks.length,
        completedTasks,
        failedTasks,
        currentAgentId: task.assignedTo,
        event: makeExecutionEvent({
          type: "result",
          title: `${AGENT_DISPLAY[task.assignedTo]} 已完成`,
          detail: String(text || "").slice(0, 200),
          agentId: task.assignedTo,
          taskId: task.id,
        }),
      });
      if (tokens > 0) broadcast({ type: "cost", agentId: task.assignedTo, tokens });
    } catch (err) {
      failedTasks += 1;
      broadcast({ type: "task_update", executionRunId: runId, taskId: task.id, updates: { status: "failed" } });
      broadcast({ type: "agent_status", agentId: task.assignedTo, status: "error", executionRunId: runId });
      broadcast({ type: "activity", executionRunId: runId, activity: { agentId: task.assignedTo, type: "task_fail", summary: String(err?.message || err), timestamp: Date.now(), taskId: task.id } });
      broadcastExecutionUpdate({
        executionRunId: runId,
        sessionId,
        status: "running",
        totalTasks: tasks.length,
        completedTasks,
        failedTasks,
        currentAgentId: task.assignedTo,
        event: makeExecutionEvent({
          type: "error",
          title: `${AGENT_DISPLAY[task.assignedTo]} 执行失败`,
          detail: String(err?.message || err),
          agentId: task.assignedTo,
          taskId: task.id,
        }),
      });
    }
  }

  const finalStatus = failedTasks > 0 ? "failed" : "completed";
  broadcastExecutionUpdate({
    executionRunId: runId,
    sessionId,
    status: finalStatus,
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    completedAt: Date.now(),
    event: makeExecutionEvent({
      type: finalStatus === "completed" ? "system" : "error",
      title: finalStatus === "completed" ? "本轮执行完成" : "本轮执行结束，包含失败步骤",
      detail: `完成 ${completedTasks} / ${tasks.length}，失败 ${failedTasks}`,
    }),
  });
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

  if (req.method === "GET" && url.pathname === "/api/desktop-runtime") {
    writeJson(res, 200, getDesktopRuntimeSummary());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/hermes-dispatch/status") {
    const [availability, runs] = await Promise.all([
      getHermesDispatchAvailability(),
      listHermesDispatchRuns(),
    ]);
    writeJson(res, 200, {
      ok: true,
      availability,
      runs,
      prototypePath: hermesDispatchPrototypePath,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/run") {
    try {
      const { instruction, planOnly, useSamplePlan } = await readJson(req);
      const normalizedInstruction = String(instruction || "").trim();
      if (!useSamplePlan && !normalizedInstruction) {
        writeJson(res, 400, { ok: false, error: "instruction 不能为空" });
        return;
      }

      const availability = await getHermesDispatchAvailability();
      if (!useSamplePlan && !availability.hermes.available) {
        writeJson(res, 400, { ok: false, error: 'Planner command "hermes" is not available in PATH.' });
        return;
      }

      const run = await startHermesDispatchRun({
        instruction: normalizedInstruction,
        planOnly: Boolean(planOnly),
        useSamplePlan: Boolean(useSamplePlan),
      });

      writeJson(res, 200, { ok: true, run });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    try {
      const body = await readJson(req);
      if (body.providers) settings.providers = body.providers;
      if (body.agentConfigs) settings.agentConfigs = body.agentConfigs;
      if (body.userNickname !== undefined) settings.userNickname = body.userNickname;
      if (body.desktopProgramSettings) settings.desktopProgramSettings = body.desktopProgramSettings;
      writeJson(res, 200, { ok: true });
    } catch {
      writeJson(res, 400, { ok: false, error: "设置数据格式错误" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test-model") {
    let requestBaseUrl = "";
    let requestApiKey = "";
    let requestModel = "";
    try {
      const { apiKey, baseUrl, model } = await readJson(req);
      requestBaseUrl = String(baseUrl || "");
      requestApiKey = String(apiKey || "");
      requestModel = String(model || "");
      if (!apiKey?.trim()) return writeJson(res, 200, { ok: false, error: "API Key 不能为空" });
      if (!model?.trim()) return writeJson(res, 200, { ok: false, error: "模型名不能为空" });

      const { OpenAI } = await import("openai");
      const resolvedBaseUrl = baseUrl?.trim() || "https://api.openai.com/v1";
      const isCodingPlan = resolvedBaseUrl.includes("coding.dashscope.aliyuncs.com");
      const client = new OpenAI({
        apiKey,
        baseURL: resolvedBaseUrl,
        defaultHeaders: isCodingPlan ? { "User-Agent": "OpenAI/Codex" } : undefined,
      });

      const start = Date.now();
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
      });

      const reply = response.choices[0]?.message?.content ?? "";
      const tokens = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

      writeJson(res, 200, {
        ok: true,
        reply,
        latencyMs: Date.now() - start,
        model: response.model,
        tokens,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const detail = msg.slice(0, 300);
      const normalizedBaseUrl = requestBaseUrl.trim();
      const isCodingPlan = normalizedBaseUrl.includes("coding.dashscope.aliyuncs.com");
      if (isCodingPlan && /404 status code/i.test(msg)) {
        try {
          const fallbackStart = Date.now();
          const modelsUrl = `${normalizedBaseUrl.replace(/\/+$/, "")}/models`;
          const fallbackRes = await fetch(modelsUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${requestApiKey}`,
              "Content-Type": "application/json",
              "User-Agent": "OpenAI/Codex",
            },
          });

          if (fallbackRes.ok) {
            const payload = await fallbackRes.json().catch(() => ({}));
            const models = Array.isArray(payload?.data)
              ? payload.data.map(item => item?.id).filter(Boolean).slice(0, 5)
              : [];
            return writeJson(res, 200, {
              ok: true,
              reply: models.length > 0 ? `Models: ${models.join(", ")}` : "Models endpoint reachable",
              latencyMs: Date.now() - fallbackStart,
              model: requestModel,
              tokens: 0,
            });
          }
        } catch (fallbackErr) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          return writeJson(res, 200, {
            ok: false,
            error: "Coding Plan 对话接口返回 404，且模型列表探测也失败。请确认使用的是 Coding Plan 专属 API Key（通常为 sk-sp- 前缀），且 Base URL 为 https://coding.dashscope.aliyuncs.com/v1。",
            detail: `${detail}\nFallback /models probe failed: ${fallbackMsg}`.slice(0, 300),
          });
        }

        return writeJson(res, 200, {
          ok: false,
          error: "Coding Plan 对话接口返回 404。连接可能已通，但当前测试模型或接口不兼容；请确认使用的是 Coding Plan 专属 API Key（通常为 sk-sp- 前缀），或换一个该方案支持的模型再试。",
          detail,
        });
      }

      const error = msg.slice(0, 120);
      writeJson(res, 200, { ok: false, error, detail });
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
        if (msg.userNickname !== undefined) settings.userNickname = msg.userNickname;
        if (msg.desktopProgramSettings) settings.desktopProgramSettings = msg.desktopProgramSettings;
        if (msg.runtime) updateClientRuntime(ws, msg.runtime);
        ws.send(JSON.stringify({ type: "settings_ack" }));
        break;
      case "desktop_launch_result":
        handleDesktopLaunchResult(ws, msg);
        break;
      case "desktop_installed_apps_result":
        handleDesktopInstalledApplicationsResult(ws, msg);
        break;
      case "desktop_input_result":
        handleDesktopInputControlResult(ws, msg);
        break;
      case "desktop_capture_result":
        handleDesktopScreenshotResult(ws, msg);
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
          dispatch(msg.instruction, sessionId, msg.executionRunId, msg.source || "chat", ws).catch((err) => console.error("[dispatch] error:", err?.message || err));
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
    cleanupClientLaunchRequests(ws);
    removeClientRuntime(ws);
    clients.delete(ws);
  });

  ws.on("error", () => {
    cleanupClientLaunchRequests(ws);
    removeClientRuntime(ws);
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
