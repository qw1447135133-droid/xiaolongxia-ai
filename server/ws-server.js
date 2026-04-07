import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { promises as fs, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join } from "path";
import { spawn } from "child_process";
import os from "os";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ── 加载 .env.local（强制覆盖系统环境变量）──
const __dirname_ws = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname_ws, '..', '.env.local');
const repoRoot = join(__dirname_ws, "..");
const hermesDispatchPrototypePath = join(repoRoot, "prototypes", "hermes-dispatch", "run.mjs");
const hermesDispatchSamplePlanPath = join(repoRoot, "prototypes", "hermes-dispatch", "sample-plan.json");
const hermesDispatchOutputRoot = join(repoRoot, "output", "hermes-dispatch");
const runtimeSettingsPath = join(repoRoot, "output", "runtime-settings.json");
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
import { startPlatform, stopPlatform, sendToPlatform, sendFileToPlatform, isPlatformRunning } from "./platforms/platform-manager.js";
import { exportMeetingDocument } from "./meeting-exporter.js";
import { queryAgent, clearAllSessions } from "./agent-engine.js";
import { getAgentTools } from "./agent-tools.js";
import { checkSemanticMemoryStore, querySemanticMemoryStore } from "./semantic-memory-store.js";
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
const DEFAULT_HERMES_TOOL_COMMANDS = {
  planner: "codex",
  codex: "codex",
  claude: "claude",
  gemini: "gemini",
};
const HERMES_TOOL_COMMAND_ENV_KEYS = {
  planner: "HERMES_PLANNER_COMMAND",
  codex: "HERMES_CODEX_COMMAND",
  claude: "HERMES_CLAUDE_COMMAND",
  gemini: "HERMES_GEMINI_COMMAND",
};
const DEFAULT_HERMES_DISPATCH_SETTINGS = {
  activePlannerProfileId: "default",
  plannerProfiles: [
    {
      id: "default",
      label: "Default Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/default.json",
      description: "Default Hermes planner conversation.",
      models: {},
    },
    {
      id: "research",
      label: "Research Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/research.json",
      description: "Separate planner context for research and discovery.",
      models: {},
    },
    {
      id: "scratch",
      label: "Scratch Brain",
      sessionStateFile: "output/hermes-dispatch/planner-sessions/scratch.json",
      description: "Temporary planner context for experiments and dry runs.",
      models: {},
    },
  ],
};
let settings = {
  providers: [],
  agentConfigs: {},
  platformConfigs: {},
  userNickname: "您",
  semanticMemoryConfig: {
    providerId: "local",
    autoRecallProjectMemories: true,
    autoRecallDeskNotes: true,
    autoRecallKnowledgeDocs: true,
    pgvector: {
      enabled: false,
      connectionString: "",
      schema: "public",
      table: "semantic_memory_documents",
      embeddingModel: "text-embedding-3-small",
      dimensions: 1536,
    },
  },
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
  hermesDispatchSettings: DEFAULT_HERMES_DISPATCH_SETTINGS,
};
const hermesDispatchRuns = new Map();
const hermesDispatchRuntime = new Map();
const activeExecutionControllers = new Map();
const PLATFORM_WEBHOOK_PATHS = {
  line: "/webhook/line",
  feishu: "/webhook/feishu",
  wecom: "/webhook/wecom",
};
const PLATFORM_FIELD_REQUIREMENTS = {
  telegram: ["botToken"],
  line: ["channelAccessToken", "channelSecret"],
  feishu: ["appId", "appSecret", "verifyToken"],
  wecom: ["corpId", "agentId", "secret", "token", "encodingAESKey"],
};
const PLATFORM_RUNTIME_KEYS = [
  "status",
  "errorMsg",
  "detail",
  "accountLabel",
  "webhookUrl",
  "healthScore",
  "pendingEvents",
  "lastSyncedAt",
  "lastCheckedAt",
  "lastEventAt",
  "lastInboundAt",
  "lastInboundMessageKey",
  "lastOutboundSuccessAt",
  "lastOutboundFailureAt",
  "outboundRetryCount",
  "outboundCooldownUntil",
  "lastDebugAction",
  "lastDebugOk",
  "lastDebugStatus",
  "lastDebugMessage",
  "lastDebugTarget",
  "lastDebugAt",
  "recentFailedMessages",
  "debugHistory",
];
const PLATFORM_DEBUG_HISTORY_LIMIT = 8;
const PLATFORM_FAILED_MESSAGE_LIMIT = 6;
const PLATFORM_INBOUND_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const PLATFORM_INBOUND_DEDUPE_CACHE_LIMIT = 200;
const PLATFORM_OUTBOUND_MAX_ATTEMPTS = 2;
const PLATFORM_OUTBOUND_RETRY_DELAY_MS = 1200;
const PLATFORM_OUTBOUND_COOLDOWN_MS = 30 * 1000;
const platformInboundMessageCache = new Map();

function normalizePlatformDebugHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => {
      const action = String(entry?.action || "").trim();
      const status = String(entry?.status || "").trim();
      const message = String(entry?.message || "").trim();
      const at = Number(entry?.at || 0);
      if (!action || !status || !message || !Number.isFinite(at) || at <= 0) {
        return null;
      }

      return {
        action,
        ok: Boolean(entry?.ok),
        status,
        target: String(entry?.target || "").trim() || undefined,
        message,
        at,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.at - right.at)
    .slice(-PLATFORM_DEBUG_HISTORY_LIMIT);
}

function buildPlatformDebugHistory(platformId, entry, historyOverride) {
  const baseHistory = normalizePlatformDebugHistory(
    historyOverride ?? settings.platformConfigs?.[platformId]?.debugHistory,
  );
  if (!entry) {
    return baseHistory;
  }

  const nextEntry = {
    action: String(entry.action || "").trim(),
    ok: Boolean(entry.ok),
    status: String(entry.status || "").trim(),
    target: String(entry.target || "").trim() || undefined,
    message: String(entry.message || "").trim(),
    at: Number(entry.at || Date.now()),
  };

  if (!nextEntry.action || !nextEntry.status || !nextEntry.message || !Number.isFinite(nextEntry.at)) {
    return baseHistory;
  }

  return [...baseHistory, nextEntry].slice(-PLATFORM_DEBUG_HISTORY_LIMIT);
}

function normalizePlatformFailedMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => {
      const target = String(entry?.target || "").trim();
      const message = String(entry?.message || "").trim();
      const reason = String(entry?.reason || "").trim();
      const at = Number(entry?.at || 0);
      const retryCount = Number(entry?.retryCount || 0);
      if (!target || !message || !reason || !Number.isFinite(at) || at <= 0) {
        return null;
      }

      return {
        target,
        message,
        reason,
        at,
        retryCount: Number.isFinite(retryCount) && retryCount > 0 ? retryCount : 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.at - right.at)
    .slice(-PLATFORM_FAILED_MESSAGE_LIMIT);
}

function buildPlatformFailedMessageHistory(platformId, entry, historyOverride) {
  const baseHistory = normalizePlatformFailedMessages(
    historyOverride ?? settings.platformConfigs?.[platformId]?.recentFailedMessages,
  );
  if (!entry) {
    return baseHistory;
  }

  const nextEntry = {
    target: String(entry.target || "").trim(),
    message: String(entry.message || "").trim(),
    reason: String(entry.reason || "").trim(),
    at: Number(entry.at || Date.now()),
    retryCount: Number(entry.retryCount || 0),
  };

  if (!nextEntry.target || !nextEntry.message || !nextEntry.reason || !Number.isFinite(nextEntry.at)) {
    return baseHistory;
  }

  return [...baseHistory, nextEntry].slice(-PLATFORM_FAILED_MESSAGE_LIMIT);
}

function summarizePlatformMessage(text, maxLen = 160) {
  return String(text || "").trim().slice(0, maxLen);
}

function formatPlatformMoment(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function getPlatformInboundCache(platformId) {
  if (!platformInboundMessageCache.has(platformId)) {
    platformInboundMessageCache.set(platformId, new Map());
  }
  return platformInboundMessageCache.get(platformId);
}

function prunePlatformInboundCache(platformId, now = Date.now()) {
  const cache = getPlatformInboundCache(platformId);
  for (const [messageKey, at] of cache.entries()) {
    if (now - at > PLATFORM_INBOUND_DEDUPE_WINDOW_MS) {
      cache.delete(messageKey);
    }
  }

  const overflow = cache.size - PLATFORM_INBOUND_DEDUPE_CACHE_LIMIT;
  if (overflow > 0) {
    const staleKeys = [...cache.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, overflow)
      .map(([messageKey]) => messageKey);
    for (const messageKey of staleKeys) {
      cache.delete(messageKey);
    }
  }
}

function hasProcessedInboundMessage(platformId, messageKey, now = Date.now()) {
  const normalizedKey = String(messageKey || "").trim();
  if (!normalizedKey) return false;
  prunePlatformInboundCache(platformId, now);
  return getPlatformInboundCache(platformId).has(normalizedKey);
}

function markInboundMessageProcessed(platformId, messageKey, at = Date.now()) {
  const normalizedKey = String(messageKey || "").trim();
  if (!normalizedKey) return;
  const cache = getPlatformInboundCache(platformId);
  cache.set(normalizedKey, at);
  prunePlatformInboundCache(platformId, at);
}

function createPlatformError(message, code, meta = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, meta);
  return error;
}

function shouldRequirePlatformOutboundApproval(platformId, trigger = "auto") {
  if (trigger === "manual" || trigger === "debug") return false;
  return Boolean(settings.platformConfigs?.[platformId]?.requireOutboundApproval);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPlatformMessageWithRetry({
  platformId,
  targetId,
  text,
  trigger = "auto",
  bypassCooldown = false,
  successDetail = "最近一条出站消息已成功送达。",
  failureDetailPrefix = "最近一条出站消息发送失败",
}) {
  if (shouldRequirePlatformOutboundApproval(platformId, trigger)) {
    const blockedAt = Date.now();
    const message = "当前平台已开启“自动外发需审批”，自动发送已被阻止，请先人工批准或手动发送。";
    broadcastPlatformStatus(platformId, {
      status: "degraded",
      detail: message,
      healthScore: 72,
      pendingEvents: 1,
      lastEventAt: blockedAt,
      accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
    });
    throw createPlatformError(message, "OUTBOUND_APPROVAL_REQUIRED");
  }

  const cooldownUntil = Number(settings.platformConfigs?.[platformId]?.outboundCooldownUntil || 0);
  if (!bypassCooldown && cooldownUntil > Date.now()) {
    const blockedAt = Date.now();
    const message = `连接器最近外发失败，当前处于冷却中，请在 ${formatPlatformMoment(cooldownUntil)} 后重试。`;
    broadcastPlatformStatus(platformId, {
      status: "degraded",
      detail: message,
      healthScore: 68,
      pendingEvents: 1,
      lastEventAt: blockedAt,
      accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
    });
    throw createPlatformError(message, "OUTBOUND_COOLDOWN", { cooldownUntil });
  }

  let failureMessage = "";
  let retryCount = 0;

  for (let attempt = 1; attempt <= PLATFORM_OUTBOUND_MAX_ATTEMPTS; attempt += 1) {
    try {
      await sendToPlatform(platformId, targetId, text);
      const sentAt = Date.now();
      broadcastPlatformStatus(platformId, {
        status: "connected",
        detail: successDetail,
        errorMsg: undefined,
        healthScore: 100,
        pendingEvents: 0,
        lastEventAt: sentAt,
        lastOutboundSuccessAt: sentAt,
        outboundRetryCount: retryCount,
        outboundCooldownUntil: undefined,
        accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
      });
      return { sentAt, retryCount };
    } catch (error) {
      failureMessage = String(error?.message || error || "平台外发失败");
      retryCount = attempt - 1;
      if (attempt < PLATFORM_OUTBOUND_MAX_ATTEMPTS) {
        await sleep(PLATFORM_OUTBOUND_RETRY_DELAY_MS);
      }
    }
  }

  const failedAt = Date.now();
  const outboundCooldownUntil = failedAt + PLATFORM_OUTBOUND_COOLDOWN_MS;
  const recentFailedMessages = buildPlatformFailedMessageHistory(platformId, {
    target: String(targetId || "").trim() || "unknown-target",
    message: summarizePlatformMessage(text),
    reason: failureMessage,
    at: failedAt,
    retryCount,
  });
  broadcastPlatformStatus(platformId, {
    status: "degraded",
    detail: `${failureDetailPrefix}：${failureMessage}`,
    errorMsg: failureMessage,
    healthScore: 55,
    pendingEvents: 1,
    lastEventAt: failedAt,
    lastOutboundFailureAt: failedAt,
    outboundRetryCount: retryCount,
    outboundCooldownUntil,
    recentFailedMessages,
    accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
  });
  throw createPlatformError(failureMessage, "PLATFORM_SEND_FAILED", {
    retryCount,
    cooldownUntil: outboundCooldownUntil,
  });
}

function resolveOutboundFailurePresentation(error, {
  approvalSummary = "自动外发已被审批门阻止",
  cooldownSummary = "连接器处于失败冷却中",
  failureSummary = "平台回复发送失败",
} = {}) {
  const code = String(error?.code || "").trim();
  const detail = String(error?.message || error || failureSummary);

  if (code === "OUTBOUND_APPROVAL_REQUIRED") {
    return {
      channelStatus: "waiting",
      operationStatus: "blocked",
      eventType: "governance",
      summary: approvalSummary,
      detail,
      failureReason: "approval-required",
    };
  }

  if (code === "OUTBOUND_COOLDOWN") {
    return {
      channelStatus: "waiting",
      operationStatus: "blocked",
      eventType: "connector",
      summary: cooldownSummary,
      detail,
      failureReason: "cooldown-active",
    };
  }

  return {
    channelStatus: "waiting",
    operationStatus: "failed",
    eventType: "connector",
    summary: `${failureSummary}：${detail}`,
    detail,
    failureReason: detail,
  };
}

function summarizePlatformAccount(platformId, fields = {}) {
  switch (platformId) {
    case "telegram":
      return fields.defaultChatId?.trim() ? `chat:${fields.defaultChatId.trim()}` : "Telegram Bot";
    case "line":
      return "LINE OA";
    case "feishu":
      return fields.defaultOpenId?.trim() ? `open:${fields.defaultOpenId.trim()}` : "Feishu App";
    case "wecom":
      return fields.agentId?.trim() ? `agent:${fields.agentId.trim()}` : "WeCom App";
    default:
      return platformId;
  }
}

function classifyPlatformRuntimeStatus(platformId, err) {
  const message = String(err?.message || err || "连接器启动失败");
  const lower = message.toLowerCase();
  if (lower.includes("token") || lower.includes("secret") || lower.includes("access") || lower.includes("appid")) {
    return {
      status: "auth_failed",
      detail: `鉴权失败：${message}`,
      errorMsg: message,
      healthScore: 20,
    };
  }

  if (lower.includes("webhook") || lower.includes("callback")) {
    return {
      status: "webhook_unreachable",
      detail: `回调链路异常：${message}`,
      errorMsg: message,
      healthScore: 35,
    };
  }

  return {
    status: "error",
    detail: `连接器异常：${message}`,
    errorMsg: message,
    healthScore: 30,
  };
}

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
const DESKTOP_AUTOMATION_PROMPT =
  "\n\n【桌面执行能力】当任务要求真实打开本机程序、外部浏览器、网站页面，或通过鼠标键盘在桌面界面中点击、点开、播放、输入、滚动时，你可以使用桌面工具链：desktop_list_installed_applications、desktop_open_external_browser、desktop_launch_native_application、desktop_cdp_open_app、desktop_cdp_snapshot、desktop_cdp_act、desktop_capture_screenshot、desktop_control_input。对 Chrome、Edge、飞书、Figma、Notion 这类 Chromium / Electron 应用，优先进入 CDP App Mode，再读取结构化快照并基于 ref 操作；只有在结构化控制不可用时，才退回“先截图定位 → 再点击/输入 → 再截图验证”的物理桌面闭环。若第一次验证失败，优先参考 retrySuggestions 做一次偏移重试。只有验证码、人机验证、OTP/2FA 等验证场景必须转人工接管，不要口头假设自己没有鼠标键盘能力。若用户要求真实打开视频网站、视频页、播放器并点开/播放视频，不要先空口解释限制，必须先实际尝试桌面工具链。对于物理桌面操作请求，除验证场景外，不要只给文字建议而不动手。";

const SYSTEM_PROMPTS = {
  orchestrator: "你是跨境电商 AI 团队的总协调员鹦鹉螺，负责任务拆解和团队协调。回复与汇报都要简短有力。"
    + "\n\n你拥有浏览器控制能力，可以使用以下工具：browser_goto（导航到URL）、browser_get_text（读取页面文字内容，搜索后必须用这个提取结果）、browser_page_info（获取页面信息）、browser_screenshot（截图识图）、browser_act（自然语言操作，如点击/填写/滚动）、browser_act_single（精确选择器操作）、browser_act_multi（批量操作）。"
    + "\n\n你还拥有真实外部浏览器启动能力：desktop_open_external_browser 可打开 Chrome、Edge、Firefox 或系统默认浏览器。凡是用户明确要求打开浏览器，或要求打开/访问某个网站、链接、URL，都应优先使用它；只有自主搜索、读取网页、抓取资料、验证页面时，才继续使用内置 browser_*。"
    + "\n\n你还可以使用 desktop_list_installed_applications 工具先读取本机已安装程序列表，再用 desktop_launch_native_application 启动对应程序，例如微信、飞书、Chrome、VS Code、资源管理器或指定 exe。只有当用户明确要求打开/启动本机程序，或任务确实需要调用本机应用时才使用。"
    + "\n\n对于 Chrome、Edge、飞书、Figma、Notion 这类 Chromium / Electron 应用，应优先使用 desktop_cdp_open_app 进入 CDP App Mode，再用 desktop_cdp_snapshot 获取结构化 ref，最后用 desktop_cdp_act 执行 click/fill/type/press。只有当 CDP 模式不可用时，才回退到桌面截图 + 鼠标键盘链路。"
    + "\n\n当桌面端应用无法通过代码或普通浏览器自动化完成时，你还可以先用 desktop_capture_screenshot 观察当前桌面，再用 desktop_control_input 模拟鼠标和键盘，处理桌面端应用、系统弹窗和纯 UI 交互。若任务涉及验证码、人机验证、OTP/2FA 或类似验证步骤，不要尝试自动绕过，应切换到人工接管。"
    + "\n\n【桌面视觉闭环】只有在结构化控制不可用时，才采用这套顺序：1. desktop_capture_screenshot 获取当前桌面；2. 基于图片与尺寸估算目标元素中心点坐标（左上角为 0,0）；3. 用 desktop_control_input 执行 click/type/key/hotkey；4. 再次 desktop_capture_screenshot 验证是否成功；5. 若第一次验证仍失败，优先使用 desktop_control_input 返回的 retrySuggestions 做一次附近偏移重试；6. 再次截图确认；7. 如连续两次仍无法确认结果，停止自动操作并转人工接管。"
    + "\n\n【浏览器边界】：如果只是为了自主搜索、读取网页、抓取资料、验证页面或获取最新信息，一律优先使用内置 browser_* 工具，不要因为需要联网就启动外部浏览器。只要用户明确要求打开浏览器，或明确要求打开/访问某个网站、链接、URL，就优先使用 desktop_open_external_browser 或 desktop_launch_native_application。"
    + "\n\n【自主联网规则】：当任务依赖最新信息、网页资料、实时趋势、新闻、公告、价格、页面内容、链接内容或外部站点证据时，你应主动使用浏览器工具，不需要等用户明确要求“去搜索”或“打开网页”。"
    + "\n\n【搜索流程】：1.browser_goto 导航到搜索页或目标页 → 2.browser_get_text 读取页面内容 → 3.整理结果回复用户。不要反复跳转，读到内容就总结。"
    + "\n\n【遇到登录页】：换用百度/必应搜索该关键词，或直接总结已知信息。"
    + BREVITY,
  explorer: "你是探海鲸鱼，跨境电商选品专家，专注竞品分析、选品趋势研究和市场数据分析，提供可执行洞察。"
    + DESKTOP_AUTOMATION_PROMPT
    + BREVITY,
  writer: "你是星海章鱼，跨境电商文案专家，专注多语种文案创作、SEO 标题和详情页撰写，输出高转化文案。"
    + DESKTOP_AUTOMATION_PROMPT
    + BREVITY,
  designer: "你是珊瑚水母，电商视觉设计专家；需要出图时先给出 [IMAGE_PROMPT] 英文提示词，再补充设计说明。"
    + DESKTOP_AUTOMATION_PROMPT
    + BREVITY,
  performer: "你是逐浪海豚，短视频内容专家，专注数字人视频脚本、TikTok/抖音内容策略和多平台矩阵发布。"
    + DESKTOP_AUTOMATION_PROMPT
    + BREVITY,
  greeter: "你是招潮蟹，多语种客服专家，专注客服话术、评论回复模板和买家互动策略。"
    + DESKTOP_AUTOMATION_PROMPT
    + BREVITY,
};

const AGENT_IDS = ["orchestrator", "explorer", "writer", "designer", "performer", "greeter"];

const AGENT_DISPLAY = {
  orchestrator: "鹦鹉螺",
  explorer: "探海鲸鱼",
  writer: "星海章鱼",
  designer: "珊瑚水母",
  performer: "逐浪海豚",
  greeter: "招潮蟹",
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

function pickPlatformRuntimeFields(config = {}) {
  return Object.fromEntries(
    PLATFORM_RUNTIME_KEYS
      .filter((key) => config[key] !== undefined)
      .map((key) => [key, config[key]]),
  );
}

function mergePlatformConfigs(nextConfigs = {}) {
  const merged = {};
  const platformIds = new Set([
    ...Object.keys(settings.platformConfigs ?? {}),
    ...Object.keys(nextConfigs ?? {}),
  ]);

  for (const platformId of platformIds) {
    const currentConfig = settings.platformConfigs?.[platformId] ?? { enabled: false, fields: {} };
    const incomingConfig = nextConfigs?.[platformId];
    if (!incomingConfig) {
      merged[platformId] = currentConfig;
      continue;
    }

    merged[platformId] = {
      ...currentConfig,
      ...incomingConfig,
      fields: incomingConfig.fields ?? currentConfig.fields ?? {},
      ...pickPlatformRuntimeFields(currentConfig),
    };
  }

  return merged;
}

async function persistRuntimeSettings() {
  try {
    await fs.mkdir(join(repoRoot, "output"), { recursive: true });
    await fs.writeFile(runtimeSettingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("[ws-server] persist settings failed:", error?.message || error);
  }
}

async function restoreRuntimeSettings() {
  try {
    if (!existsSync(runtimeSettingsPath)) return;
    const raw = await fs.readFile(runtimeSettingsPath, "utf8");
    const parsed = JSON.parse(raw);
    settings = {
      ...settings,
      ...parsed,
      platformConfigs: mergePlatformConfigs(parsed.platformConfigs ?? {}),
    };
  } catch (error) {
    console.error("[ws-server] restore settings failed:", error?.message || error);
  }
}

async function ensureEnabledPlatformsRunning(trigger = "restore") {
  const entries = Object.entries(settings.platformConfigs ?? {});
  for (const [platformId, config] of entries) {
    const fields = config?.fields ?? {};
    if (!config?.enabled || Object.keys(fields).length === 0 || isPlatformRunning(platformId)) {
      continue;
    }

    try {
      broadcastPlatformStatus(platformId, {
        status: "syncing",
        detail: trigger === "restore" ? "正在恢复上次连接器状态。" : "正在自动恢复连接器运行态。",
        healthScore: 60,
        lastSyncedAt: Date.now(),
        webhookUrl: PLATFORM_WEBHOOK_PATHS[platformId] ?? undefined,
        accountLabel: summarizePlatformAccount(platformId, fields),
      });
      await startPlatform(platformId, fields, handlePlatformMessage);
      const isWebhookPlatform = Boolean(PLATFORM_WEBHOOK_PATHS[platformId]);
      broadcastPlatformStatus(platformId, {
        status: isWebhookPlatform ? "webhook_missing" : "connected",
        detail: isWebhookPlatform
          ? `连接器已恢复，等待公网回调打通 ${PLATFORM_WEBHOOK_PATHS[platformId]}。`
          : "连接器已自动恢复，可直接接收和发送消息。",
        healthScore: isWebhookPlatform ? 75 : 100,
        lastSyncedAt: Date.now(),
        webhookUrl: PLATFORM_WEBHOOK_PATHS[platformId] ?? undefined,
        accountLabel: summarizePlatformAccount(platformId, fields),
      });
    } catch (error) {
      const runtimeStatus = classifyPlatformRuntimeStatus(platformId, error);
      broadcastPlatformStatus(platformId, {
        ...runtimeStatus,
        lastSyncedAt: Date.now(),
        webhookUrl: PLATFORM_WEBHOOK_PATHS[platformId] ?? undefined,
        accountLabel: summarizePlatformAccount(platformId, fields),
      });
    }
  }
  await persistRuntimeSettings();
}

function commandLocator() {
  return process.platform === "win32" ? "where" : "which";
}

function normalizeCommandValue(command) {
  const trimmed = String(command || "").trim();
  return trimmed.replace(/^"(.*)"$/, "$1");
}

function isExplicitCommandPath(command) {
  const normalized = normalizeCommandValue(command);
  return /[\\/]/.test(normalized) || /^[a-zA-Z]:/.test(normalized);
}

function resolveCommandForExecution(command) {
  const normalized = normalizeCommandValue(command);
  if (!normalized) {
    return "";
  }

  if (!isExplicitCommandPath(normalized)) {
    return normalized;
  }

  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("\\\\")) {
    return normalized;
  }

  return join(repoRoot, normalized);
}

function getCommandFamily(command) {
  return basename(normalizeCommandValue(command))
    .toLowerCase()
    .replace(/\.(cmd|exe|bat|ps1)$/i, "");
}

function findBundledCodexExecutable() {
  if (process.platform !== "win32") {
    return "";
  }

  const extensionsRoot = join(os.homedir(), ".vscode", "extensions");
  if (!existsSync(extensionsRoot)) {
    return "";
  }

  const candidates = readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^openai\.chatgpt-/i.test(entry.name))
    .map((entry) => join(extensionsRoot, entry.name, "bin", "windows-x86_64", "codex.exe"))
    .filter((filePath) => existsSync(filePath))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return candidates[0] || "";
}

function getHermesToolCommand(tool) {
  const envKey = HERMES_TOOL_COMMAND_ENV_KEYS[tool];
  const explicit = normalizeCommandValue(process.env[envKey]);
  if (explicit) {
    return explicit;
  }

  if (tool === "planner" || tool === "codex") {
    const bundledCodex = findBundledCodexExecutable();
    if (bundledCodex) {
      return bundledCodex;
    }
  }

  return normalizeCommandValue(DEFAULT_HERMES_TOOL_COMMANDS[tool]);
}

function getHermesToolCommands() {
  return {
    planner: getHermesToolCommand("planner"),
    codex: getHermesToolCommand("codex"),
    claude: getHermesToolCommand("claude"),
    gemini: getHermesToolCommand("gemini"),
  };
}

function formatUnavailableCommandMessage(role, command) {
  const normalized = normalizeCommandValue(command);
  const family = getCommandFamily(normalized);
  const locationHint = isExplicitCommandPath(normalized)
    ? "configured path"
    : "PATH";

  if (family === "codex") {
    return `${role} command "${normalized}" is not available via ${locationHint}. The Codex VS Code extension is not the same as the codex CLI; install the Codex CLI or set ${HERMES_TOOL_COMMAND_ENV_KEYS[role === "Planner" ? "planner" : "codex"]}.`;
  }

  return `${role} command "${normalized}" is not available via ${locationHint}.`;
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    const normalized = normalizeCommandValue(command);
    const resolved = resolveCommandForExecution(normalized);

    if (!resolved) {
      resolve(false);
      return;
    }

    if (isExplicitCommandPath(normalized)) {
      resolve(existsSync(resolved));
      return;
    }

    const child = spawn(commandLocator(), [normalized], { stdio: "ignore" });
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

function writeHermesTerminalChunk(runId, streamName, chunk, targetStream) {
  const text = chunk?.toString?.() ?? String(chunk ?? "");
  if (!text) {
    return;
  }

  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const prefix = `[Hermes ${runId} ${streamName}] `;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isLastEmpty = index === lines.length - 1 && line === "";
    if (isLastEmpty) {
      continue;
    }
    targetStream.write(`${prefix}${line}\n`);
  }
}

function buildDefaultHermesSessionStateFile(profileId) {
  const id = String(profileId || "").trim() || "default";
  return `output/hermes-dispatch/planner-sessions/${id}.json`;
}

function normalizeHermesDispatchSettings(input) {
  const fallbackProfiles = DEFAULT_HERMES_DISPATCH_SETTINGS.plannerProfiles;
  const rawProfiles = Array.isArray(input?.plannerProfiles) ? input.plannerProfiles : fallbackProfiles;
  const plannerProfiles = rawProfiles
    .map((profile) => {
      const id = typeof profile?.id === "string" ? profile.id.trim() : "";
      const label = typeof profile?.label === "string" ? profile.label.trim() : "";
      const rawSessionStateFile = typeof profile?.sessionStateFile === "string" ? profile.sessionStateFile.trim() : "";
      const sessionStateFile = resolveHermesSessionStatePath(rawSessionStateFile)
        ? rawSessionStateFile
        : buildDefaultHermesSessionStateFile(id);
      if (!id || !label || !sessionStateFile) return null;
      const models = profile?.models && typeof profile.models === "object"
        ? Object.fromEntries(
            Object.entries(profile.models)
              .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
              .filter(([, value]) => Boolean(value)),
          )
        : null;

      return {
        id,
        label,
        sessionStateFile,
        ...(typeof profile?.description === "string" && profile.description.trim()
          ? { description: profile.description.trim() }
          : {}),
        ...(models && Object.keys(models).length > 0 ? { models } : {}),
      };
    })
    .filter(Boolean)
    .filter((profile, index, list) => list.findIndex(candidate => candidate.id === profile.id) === index)
    .slice(0, 6);

  const safeProfiles = plannerProfiles.length > 0 ? plannerProfiles : fallbackProfiles;
  const activePlannerProfileId = safeProfiles.some(profile => profile.id === input?.activePlannerProfileId)
    ? input.activePlannerProfileId
    : safeProfiles[0].id;

  return {
    activePlannerProfileId,
    plannerProfiles: safeProfiles,
  };
}

function getNormalizedHermesDispatchSettings() {
  return normalizeHermesDispatchSettings(settings.hermesDispatchSettings);
}

function getHermesPlannerProfileById(profileId) {
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) {
    return null;
  }

  return getNormalizedHermesDispatchSettings().plannerProfiles.find(profile => profile.id === normalizedProfileId) || null;
}

function resolveHermesSessionStatePath(sessionStateFile) {
  const relativePath = String(sessionStateFile || "").trim();
  if (!relativePath) {
    return null;
  }

  const outputRoot = join(repoRoot, "output", "hermes-dispatch");
  const resolvedPath = join(repoRoot, relativePath);
  const normalizedOutputRoot = `${outputRoot}${process.platform === "win32" ? "\\" : "/"}`;
  const normalizedResolvedPath = resolvedPath;

  if (normalizedResolvedPath !== outputRoot && !normalizedResolvedPath.startsWith(normalizedOutputRoot)) {
    return null;
  }

  return resolvedPath;
}

function resolveHermesPlannerProfile(selectedProfileId) {
  const hermesDispatchSettings = getNormalizedHermesDispatchSettings();
  return hermesDispatchSettings.plannerProfiles.find(profile => profile.id === selectedProfileId)
    || hermesDispatchSettings.plannerProfiles.find(profile => profile.id === hermesDispatchSettings.activePlannerProfileId)
    || hermesDispatchSettings.plannerProfiles[0];
}

function buildHermesControlFilePath(outputDir) {
  return join(outputDir, "control.json");
}

function createEmptyHermesControlState() {
  return {
    updatedAt: new Date().toISOString(),
    runAction: null,
    runReason: null,
    stopTasks: [],
  };
}

function normalizeHermesControlState(input) {
  const stopTasks = Array.isArray(input?.stopTasks)
    ? input.stopTasks
      .map((entry) => {
        const taskId = String(entry?.taskId || "").trim();
        if (!taskId) {
          return null;
        }

        return {
          taskId,
          reason: String(entry?.reason || "").trim() || null,
          requestedAt: String(entry?.requestedAt || "").trim() || new Date().toISOString(),
        };
      })
      .filter(Boolean)
    : [];

  const runAction = String(input?.runAction || "").trim().toLowerCase();
  return {
    updatedAt: String(input?.updatedAt || "").trim() || new Date().toISOString(),
    runAction: runAction === "cancel" ? "cancel" : null,
    runReason: String(input?.runReason || "").trim() || null,
    stopTasks,
  };
}

async function readHermesControlState(outputDir) {
  try {
    return normalizeHermesControlState(await safeReadJson(buildHermesControlFilePath(outputDir)));
  } catch {
    return createEmptyHermesControlState();
  }
}

async function writeHermesControlState(outputDir, payload) {
  const controlPath = buildHermesControlFilePath(outputDir);
  await fs.writeFile(controlPath, JSON.stringify(normalizeHermesControlState(payload), null, 2), "utf8");
}

function deriveHermesRunStatus(summary, progress, fallbackStatus = "planned") {
  if (summary?.status === "cancelled" || progress?.runStatus === "cancelled") {
    return "cancelled";
  }
  if (progress?.runStatus === "cancelling") {
    return "cancelling";
  }
  if (summary?.failed > 0) {
    return "failed";
  }
  if (summary && summary.failed === 0) {
    return "completed";
  }

  const progressSummary = progress?.summary || null;
  if (!progressSummary) {
    return fallbackStatus;
  }
  if (progress?.runStatus === "cancelling") {
    return "cancelling";
  }
  if (progressSummary.running > 0 || (progressSummary.queued > 0 && (progressSummary.completed > 0 || progressSummary.failed > 0 || progressSummary.cancelled > 0))) {
    return "running";
  }
  if (progressSummary.failed > 0 && progressSummary.completed + progressSummary.failed + (progressSummary.cancelled || 0) >= progressSummary.total) {
    return "failed";
  }
  if ((progressSummary.cancelled || 0) > 0 && progressSummary.completed + progressSummary.failed + (progressSummary.cancelled || 0) >= progressSummary.total) {
    return "cancelled";
  }
  if (progressSummary.completed >= progressSummary.total && progressSummary.total > 0) {
    return "completed";
  }
  if (progressSummary.queued > 0) {
    return "queued";
  }
  return fallbackStatus;
}

function isHermesRunActive(status) {
  return status === "queued" || status === "running" || status === "cancelling";
}

async function getHermesDispatchAvailability() {
  const commands = getHermesToolCommands();
  const checks = await Promise.all([
    commandAvailable(commands.planner),
    commandAvailable(commands.codex),
    commandAvailable(commands.claude),
    commandAvailable(commands.gemini),
  ]);

  return {
    planner: { command: commands.planner, available: checks[0] },
    codex: { command: commands.codex, available: checks[1] },
    claude: { command: commands.claude, available: checks[2] },
    gemini: { command: commands.gemini, available: checks[3] },
  };
}

async function collectHermesDispatchRunFromDirectory(dirName) {
  const runDir = join(hermesDispatchOutputRoot, dirName);
  const plan = await safeReadJson(join(runDir, "plan.json"));
  const progress = await safeReadJson(join(runDir, "progress.json"));
  const plannerMeta = await safeReadJson(join(runDir, "planner-meta.json"));
  const summary = await safeReadJson(join(runDir, "summary.json"));
  const results = await safeReadJson(join(runDir, "results.json"));
  const taskLogs = await collectHermesTaskLogs(runDir, plan, progress, results);
  const plannerStdout = await safeReadText(join(runDir, "planner-stdout.txt"));
  const latestTaskStdout = await collectLatestTaskLog(runDir, "stdout.txt");
  const latestTaskStderr = await collectLatestTaskLog(runDir, "stderr.txt");
  const createdAt = Number.isFinite(Date.parse(dirName.split("-run-")[0] || dirName))
    ? Date.parse(dirName.split("-run-")[0] || dirName)
    : Date.now();
  const progressUpdatedAt = Number.isFinite(Date.parse(progress?.updatedAt || ""))
    ? Date.parse(progress.updatedAt)
    : createdAt;
  const derivedStatus = deriveHermesRunStatus(summary, progress, "planned");

  return {
    id: dirName,
    instruction: plan?.summary || "",
    mode: summary ? "execute" : "plan-only",
    plannerProfileId: plannerMeta?.profileId ?? null,
    planner: String(plannerMeta?.label || "codex-brain"),
    plannerModel: plannerMeta?.model ?? null,
    plannerSessionId: plannerMeta?.sessionId ?? null,
    plannerSessionStateFile: plannerMeta?.sessionStateFile ?? null,
    executorModels: plannerMeta?.executorModels ?? null,
    status: derivedStatus,
    createdAt,
    updatedAt: progressUpdatedAt,
    outputDir: runDir,
    plan,
    progress,
    summary,
    results,
    taskLogs,
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

async function collectHermesTaskLogs(runDir, plan, progress, results) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const progressTasks = Array.isArray(progress?.tasks) ? progress.tasks : [];
  const resultItems = Array.isArray(results) ? results : [];
  const progressMap = new Map(progressTasks.map(task => [task.id, task]));
  const resultMap = new Map(resultItems.map(item => [item.taskId, item]));

  return Promise.all(
    tasks.map(async (task) => {
      const taskDir = join(runDir, task.id);
      const progressItem = progressMap.get(task.id) || null;
      const resultItem = resultMap.get(task.id) || null;

      return {
        taskId: task.id,
        title: task.title,
        executor: task.executor,
        status: progressItem?.status || (resultItem?.status === "fulfilled"
          ? "completed"
          : (resultItem?.status === "rejected"
            ? "failed"
            : (resultItem?.status === "cancelled" ? "cancelled" : "queued"))),
        writeTargets: Array.isArray(task.writeTargets) ? task.writeTargets : [],
        canUseSubagents: Boolean(task.canUseSubagents),
        startedAt: progressItem?.startedAt ?? resultItem?.startedAt ?? null,
        finishedAt: progressItem?.finishedAt ?? resultItem?.finishedAt ?? null,
        durationMs: progressItem?.durationMs ?? resultItem?.durationMs ?? null,
        stdoutTail: tailText(await safeReadText(join(taskDir, "stdout.txt")), 2000),
        stderrTail: tailText(await safeReadText(join(taskDir, "stderr.txt")), 2000),
        error: progressItem?.error ?? resultItem?.error ?? null,
      };
    }),
  );
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
    const persisted = merged.get(runId);
    merged.set(runId, {
      ...persisted,
      ...run,
      plannerProfileId: run.plannerProfileId ?? persisted?.plannerProfileId ?? null,
      plannerModel: run.plannerModel ?? persisted?.plannerModel ?? null,
      plannerSessionId: run.plannerSessionId ?? persisted?.plannerSessionId ?? null,
      plannerSessionStateFile: run.plannerSessionStateFile ?? persisted?.plannerSessionStateFile ?? null,
      executorModels: run.executorModels ?? persisted?.executorModels ?? null,
      plan: run.plan ?? persisted?.plan,
      progress: run.progress ?? persisted?.progress,
      summary: run.summary ?? persisted?.summary,
      results: run.results ?? persisted?.results,
      taskLogs: Array.isArray(run.taskLogs) && run.taskLogs.length > 0
        ? run.taskLogs
        : (persisted?.taskLogs ?? []),
      stdoutTail: run.stdoutTail || persisted?.stdoutTail || "",
      stderrTail: run.stderrTail || persisted?.stderrTail || "",
      error: run.error ?? persisted?.error ?? null,
    });
  }

  return [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 20);
}

function resolveHermesRunDirectory(runId) {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    return null;
  }

  const resolvedPath = join(hermesDispatchOutputRoot, normalizedRunId);
  const normalizedOutputRoot = `${hermesDispatchOutputRoot}${process.platform === "win32" ? "\\" : "/"}`;

  if (resolvedPath !== hermesDispatchOutputRoot && !resolvedPath.startsWith(normalizedOutputRoot)) {
    return null;
  }

  return resolvedPath;
}

async function deleteHermesDispatchRun(runId) {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    throw new Error("runId 不能为空。");
  }

  const inMemoryRun = hermesDispatchRuns.get(normalizedRunId);
  if (inMemoryRun) {
    await refreshHermesDispatchRunState(inMemoryRun);
  }
  if (inMemoryRun && isHermesRunActive(inMemoryRun.status)) {
    throw new Error("运行中的记录暂时不能删除，请等待结束后再删除。");
  }

  const runDir = resolveHermesRunDirectory(normalizedRunId);
  if (!runDir) {
    throw new Error("无效的 runId。");
  }

  const existedOnDisk = existsSync(runDir);
  if (!existedOnDisk && !inMemoryRun) {
    return {
      ok: true,
      runId: normalizedRunId,
      deleted: false,
      missing: true,
    };
  }

  if (existedOnDisk) {
    await fs.rm(runDir, { recursive: true, force: true });
  }
  hermesDispatchRuns.delete(normalizedRunId);
  hermesDispatchRuntime.delete(normalizedRunId);

  return {
    ok: true,
    runId: normalizedRunId,
    deleted: existedOnDisk || Boolean(inMemoryRun),
  };
}

async function refreshHermesDispatchRunState(runState) {
  if (!runState?.outputDir) {
    return runState;
  }

  const [plan, progress, plannerMeta, summary, results] = await Promise.all([
    safeReadJson(join(runState.outputDir, "plan.json")),
    safeReadJson(join(runState.outputDir, "progress.json")),
    safeReadJson(join(runState.outputDir, "planner-meta.json")),
    safeReadJson(join(runState.outputDir, "summary.json")),
    safeReadJson(join(runState.outputDir, "results.json")),
  ]);
  const taskLogs = await collectHermesTaskLogs(runState.outputDir, plan, progress, results);

  runState.plan = plan;
  runState.progress = progress;
  runState.summary = summary;
  runState.results = results;
  runState.taskLogs = taskLogs;
  runState.plannerProfileId = plannerMeta?.profileId ?? runState.plannerProfileId ?? null;
  runState.planner = plannerMeta?.label ?? runState.planner;
  runState.plannerModel = plannerMeta?.model ?? runState.plannerModel ?? null;
  runState.plannerSessionId = plannerMeta?.sessionId ?? runState.plannerSessionId ?? null;
  runState.plannerSessionStateFile = plannerMeta?.sessionStateFile ?? runState.plannerSessionStateFile ?? null;
  runState.executorModels = plannerMeta?.executorModels ?? runState.executorModels ?? null;
  runState.status = deriveHermesRunStatus(summary, progress, runState.status || "planned");
  runState.updatedAt = Date.now();
  return runState;
}

async function cancelHermesDispatchRun(runId) {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    throw new Error("runId 不能为空。");
  }

  const runState = hermesDispatchRuns.get(normalizedRunId);
  if (!runState) {
    throw new Error("找不到对应的运行记录，只有当前活跃运行支持取消。");
  }

  await refreshHermesDispatchRunState(runState);
  if (!isHermesRunActive(runState.status)) {
    throw new Error("当前运行已经结束，不能再取消。");
  }

  const control = await readHermesControlState(runState.outputDir);
  await writeHermesControlState(runState.outputDir, {
    ...control,
    runAction: "cancel",
    runReason: "Run cancelled from workbench.",
    updatedAt: new Date().toISOString(),
  });

  runState.status = "cancelling";
  runState.updatedAt = Date.now();
  return {
    ok: true,
    runId: normalizedRunId,
    status: runState.status,
  };
}

async function stopHermesDispatchTask(runId, taskId) {
  const normalizedRunId = String(runId || "").trim();
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedRunId) {
    throw new Error("runId 不能为空。");
  }
  if (!normalizedTaskId) {
    throw new Error("taskId 不能为空。");
  }

  const runState = hermesDispatchRuns.get(normalizedRunId);
  if (!runState) {
    throw new Error("找不到对应的运行记录，只有当前活跃运行支持停止任务。");
  }

  await refreshHermesDispatchRunState(runState);
  if (!isHermesRunActive(runState.status)) {
    throw new Error("当前运行已经结束，不能再停止任务。");
  }

  const progressTasks = Array.isArray(runState.progress?.tasks) ? runState.progress.tasks : [];
  const task = progressTasks.find((item) => item.id === normalizedTaskId);
  if (!task || task.status !== "running") {
    throw new Error("该任务当前不在运行中，无法停止。");
  }

  const control = await readHermesControlState(runState.outputDir);
  const stopTasks = [...control.stopTasks];
  if (!stopTasks.some((entry) => entry.taskId === normalizedTaskId)) {
    stopTasks.push({
      taskId: normalizedTaskId,
      reason: "Task stopped from workbench.",
      requestedAt: new Date().toISOString(),
    });
  }

  await writeHermesControlState(runState.outputDir, {
    ...control,
    stopTasks,
    updatedAt: new Date().toISOString(),
  });

  runState.updatedAt = Date.now();
  return {
    ok: true,
    runId: normalizedRunId,
    taskId: normalizedTaskId,
    status: runState.status,
  };
}

async function startHermesDispatchRun({ instruction, planOnly = false, useSamplePlan = false, plannerProfileId }) {
  await fs.mkdir(hermesDispatchOutputRoot, { recursive: true });

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-run-${slugify(instruction || "sample")}`;
  const outputDir = join(hermesDispatchOutputRoot, runId);
  await fs.mkdir(outputDir, { recursive: true });
  await writeHermesControlState(outputDir, createEmptyHermesControlState());

  const args = [hermesDispatchPrototypePath, "--output-dir", outputDir];
  const commandOverrides = getHermesToolCommands();
  const plannerProfile = useSamplePlan
    ? null
    : resolveHermesPlannerProfile(plannerProfileId);

  if (plannerProfile) {
    const plannerConfigPath = join(outputDir, "planner-profile.config.json");
    await fs.writeFile(
      plannerConfigPath,
      JSON.stringify(
        {
          planner: {
            profileId: plannerProfile.id,
            label: plannerProfile.label,
            command: commandOverrides.planner,
            sessionStateFile: plannerProfile.sessionStateFile,
            ...(plannerProfile.models?.planner ? { model: plannerProfile.models.planner } : {}),
          },
          executors: {
            codex: {
              command: commandOverrides.codex,
              ...(plannerProfile.models?.codex ? { model: plannerProfile.models.codex } : {}),
            },
            claude: {
              command: commandOverrides.claude,
              ...(plannerProfile.models?.claude ? { model: plannerProfile.models.claude } : {}),
            },
            gemini: {
              command: commandOverrides.gemini,
              ...(plannerProfile.models?.gemini ? { model: plannerProfile.models.gemini } : {}),
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    args.push("--config", plannerConfigPath);
  }
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
    plannerProfileId: plannerProfile?.id ?? null,
    planner: useSamplePlan ? "sample-plan" : (plannerProfile?.label ?? "codex-brain"),
    plannerModel: plannerProfile?.models?.planner ?? null,
    plannerSessionId: null,
    plannerSessionStateFile: plannerProfile?.sessionStateFile ?? null,
    executorModels: plannerProfile?.models ?? null,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    outputDir,
    progress: null,
    taskLogs: null,
    stdoutTail: "",
    stderrTail: "",
    error: null,
  };
  Object.defineProperty(runState, "child", {
    value: null,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  hermesDispatchRuns.set(runId, runState);

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  runState.child = child;

  runState.status = "running";
  runState.updatedAt = Date.now();
  console.log(`[Hermes ${runId}] started: ${runState.mode} · ${runState.instruction}`);

  child.stdout.on("data", chunk => {
    runState.stdoutTail = tailText(`${runState.stdoutTail}${chunk.toString()}`);
    runState.updatedAt = Date.now();
    writeHermesTerminalChunk(runId, "stdout", chunk, process.stdout);
  });

  child.stderr.on("data", chunk => {
    runState.stderrTail = tailText(`${runState.stderrTail}${chunk.toString()}`);
    runState.updatedAt = Date.now();
    writeHermesTerminalChunk(runId, "stderr", chunk, process.stderr);
  });

  child.on("error", error => {
    runState.status = runState.status === "cancelling" ? "cancelled" : "failed";
    runState.error = error.message;
    runState.updatedAt = Date.now();
  });

  child.on("close", async (code) => {
    const plan = await safeReadJson(join(outputDir, "plan.json"));
    const progress = await safeReadJson(join(outputDir, "progress.json"));
    const plannerMeta = await safeReadJson(join(outputDir, "planner-meta.json"));
    const summary = await safeReadJson(join(outputDir, "summary.json"));
    const results = await safeReadJson(join(outputDir, "results.json"));
    const taskLogs = await collectHermesTaskLogs(outputDir, plan, progress, results);

    runState.status = deriveHermesRunStatus(summary, progress, code === 0 ? "planned" : "failed");
    runState.updatedAt = Date.now();
    runState.exitCode = code;
    runState.child = null;
    runState.plannerProfileId = plannerMeta?.profileId ?? runState.plannerProfileId ?? null;
    runState.planner = plannerMeta?.label ?? runState.planner;
    runState.plannerModel = plannerMeta?.model ?? runState.plannerModel ?? null;
    runState.plannerSessionId = plannerMeta?.sessionId ?? runState.plannerSessionId ?? null;
    runState.plannerSessionStateFile = plannerMeta?.sessionStateFile ?? runState.plannerSessionStateFile ?? null;
    runState.executorModels = plannerMeta?.executorModels ?? runState.executorModels ?? null;
    runState.plan = plan;
    runState.progress = progress;
    runState.summary = summary;
    runState.results = results;
    runState.taskLogs = taskLogs;
    if (code !== 0 && runState.status !== "cancelled" && !runState.error) {
      runState.error = tailText(runState.stderrTail) || `dispatch process exited with code ${code}`;
    }
    console.log(`[Hermes ${runId}] finished: ${runState.status} (exit ${code})`);
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

function broadcastPlatformStatus(platformId, payload = {}) {
  const debugHistory = normalizePlatformDebugHistory(payload.debugHistory);
  const recentFailedMessages = normalizePlatformFailedMessages(payload.recentFailedMessages);
  const nextStatus = {
    ...(settings.platformConfigs?.[platformId] ?? { enabled: false, fields: {} }),
    ...payload,
    lastCheckedAt: payload.lastCheckedAt ?? Date.now(),
    ...(payload.debugHistory ? { debugHistory } : {}),
    ...(payload.recentFailedMessages ? { recentFailedMessages } : {}),
  };
  settings.platformConfigs = {
    ...settings.platformConfigs,
    [platformId]: nextStatus,
  };
  void persistRuntimeSettings();
  broadcast({
    type: "platform_status",
    platformId,
    ...nextStatus,
  });
}

function rememberPlatformDebug(platformId, entry, payload = {}) {
  const nextHistory = buildPlatformDebugHistory(platformId, entry);
  broadcastPlatformStatus(platformId, {
    ...payload,
    lastDebugAction: entry.action,
    lastDebugOk: entry.ok,
    lastDebugStatus: entry.status,
    lastDebugMessage: entry.message,
    lastDebugTarget: entry.target,
    lastDebugAt: entry.at,
    debugHistory: nextHistory,
  });
}

function mapPlatformToChannel(platformId) {
  if (platformId === "telegram" || platformId === "line" || platformId === "feishu" || platformId === "wecom") {
    return platformId;
  }
  return "web";
}

function resolvePlatformDebugTarget(platformId, targetId) {
  const normalizedTarget = String(targetId || "").trim();
  if (normalizedTarget) return normalizedTarget;

  const fields = settings.platformConfigs?.[platformId]?.fields ?? {};
  if (platformId === "telegram") {
    return String(fields.defaultChatId || "").trim();
  }
  if (platformId === "feishu") {
    return String(fields.defaultOpenId || "").trim();
  }
  return "";
}

async function executePlatformDebugAction({ action, platformId, targetId, text }) {
  if (action === "diagnose") {
    const report = buildPlatformDiagnosis(platformId);
    const debugAt = Date.now();
    rememberPlatformDebug(
      platformId,
      {
        action: "diagnose",
        ok: true,
        status: "completed",
        target: resolvePlatformDebugTarget(platformId, targetId) || undefined,
        message: report.summary,
        at: debugAt,
      },
      {},
    );

    return {
      httpStatus: 200,
      body: {
        ok: true,
        action,
        report,
        message: report.summary,
      },
    };
  }

  if (action === "probe_webhook") {
    const probe = await probePlatformWebhook(platformId);
    const probeOk = probe.localReachable && probe.adapterReady && (!probe.configuredPublicUrl || probe.pathMatches);
    const probeAt = Date.now();
    rememberPlatformDebug(
      platformId,
      {
        action: "probe_webhook",
        ok: probeOk,
        status: probeOk ? "completed" : "failed",
        target: probe.configuredPublicUrl || probe.webhookRoute,
        message: probe.summary,
        at: probeAt,
      },
      {
        detail: probe.summary,
        lastCheckedAt: probeAt,
      },
    );

    return {
      httpStatus: 200,
      body: {
        ok: probeOk,
        action,
        probe,
        message: probe.summary,
      },
    };
  }

  if (action === "send_test_message") {
    const resolvedTargetId = resolvePlatformDebugTarget(platformId, targetId);
    if (!resolvedTargetId) {
      return {
        httpStatus: 400,
        body: { ok: false, error: "缺少 targetId，或当前平台未配置默认目标。" },
      };
    }

    const outboundText = text || "这是一条平台联调测试消息。";
    const { sentAt: outboundTimestamp } = await sendPlatformMessageWithRetry({
      platformId,
      targetId: resolvedTargetId,
      text: outboundText,
      trigger: "debug",
      bypassCooldown: true,
      successDetail: `联调测试消息已发送到 ${resolvedTargetId}。`,
      failureDetailPrefix: "联调测试消息发送失败",
    });
    const message = `已向 ${resolvedTargetId} 发送测试消息`;

    rememberPlatformDebug(
      platformId,
      {
        action: "send_test_message",
        ok: true,
        status: "sent",
        target: resolvedTargetId,
        message,
        at: outboundTimestamp,
      },
      {
        status: "connected",
        lastEventAt: outboundTimestamp,
        accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
      },
    );
    broadcastChannelEvent({
      session: buildChannelSessionSnapshot({
        platformId,
        targetId: resolvedTargetId,
        direction: "outbound",
        text: outboundText,
        deliveryStatus: "sent",
        requiresReply: false,
        status: "active",
        summary: `联调测试消息已发送：${outboundText.slice(0, 80)}`,
        timestamp: outboundTimestamp,
      }),
      title: "发送联调测试消息",
      detail: outboundText.slice(0, 500),
      status: "sent",
      eventType: "connector",
      trigger: "debug",
      externalRef: resolvedTargetId,
    });

    return {
      httpStatus: 200,
      body: {
        ok: true,
        action,
        platformId,
        targetId: resolvedTargetId,
        message,
      },
    };
  }

  if (action === "simulate_inbound") {
    const resolvedTargetId = String(targetId || resolvePlatformDebugTarget(platformId, targetId) || `debug-${platformId}`).trim();
    const inboundText = text || "这是一条模拟入站消息，用于联调工作台。";
    const inboundTimestamp = Date.now();
    const inboundMessageKey = `debug:${platformId}:${resolvedTargetId}:${inboundTimestamp}`;
    const message = `已注入 ${resolvedTargetId} 的模拟入站消息`;
    markInboundMessageProcessed(platformId, inboundMessageKey, inboundTimestamp);

    rememberPlatformDebug(
      platformId,
      {
        action: "simulate_inbound",
        ok: true,
        status: "completed",
        target: resolvedTargetId,
        message,
        at: inboundTimestamp,
      },
      {
        status: "connected",
        detail: `已注入模拟入站事件：${resolvedTargetId}`,
        healthScore: 100,
        pendingEvents: 1,
        lastEventAt: inboundTimestamp,
        lastInboundAt: inboundTimestamp,
        lastInboundMessageKey: inboundMessageKey,
        accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
      },
    );
    broadcastChannelEvent({
      session: buildChannelSessionSnapshot({
        platformId,
        targetId: resolvedTargetId,
        direction: "inbound",
        text: inboundText,
        deliveryStatus: "delivered",
        requiresReply: true,
        status: "active",
        summary: `模拟入站消息：${inboundText.slice(0, 80)}`,
        timestamp: inboundTimestamp,
        externalMessageId: inboundMessageKey,
      }),
      title: "模拟入站消息",
      detail: inboundText.slice(0, 500),
      status: "completed",
      eventType: "message",
      trigger: "debug",
      externalRef: resolvedTargetId,
    });

    return {
      httpStatus: 200,
      body: {
        ok: true,
        action,
        platformId,
        targetId: resolvedTargetId,
        message,
      },
    };
  }

  return {
    httpStatus: 400,
    body: { ok: false, error: `不支持的 action：${action || "empty"}` },
  };
}

function buildChannelSessionPayload({
  platformId,
  externalRef,
  direction,
  text,
  timestamp,
  requiresReply,
  status,
  deliveryStatus,
  summary,
  unreadCount,
  handledBy,
  lastHandledAt,
  lastDeliveryError,
  externalMessageId,
}) {
  const channel = mapPlatformToChannel(platformId);
  return {
    channel,
    externalRef: String(externalRef),
    title: `${platformId}:${externalRef}`,
    participantLabel: String(externalRef),
    remoteUserId: String(externalRef),
    accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
    lastMessageDirection: direction,
    lastDeliveryStatus: deliveryStatus,
    lastMessagePreview: String(text || "").slice(0, 140),
    unreadCount,
    requiresReply,
    status,
    summary,
    lastMessageAt: timestamp,
    lastSyncedAt: timestamp,
    ...(externalMessageId ? { lastExternalMessageId: String(externalMessageId) } : {}),
    ...(direction === "outbound" ? { lastOutboundAt: timestamp } : {}),
    ...(lastHandledAt ? { lastHandledAt } : {}),
    ...(handledBy ? { handledBy } : {}),
    ...(lastDeliveryError ? { lastDeliveryError } : {}),
  };
}

function broadcastChannelEvent(payload) {
  const session = payload?.session
    ? {
        ...payload.session,
        lastSyncedAt: payload.session.lastSyncedAt ?? Date.now(),
      }
    : undefined;
  broadcast({
    type: "channel_event",
    ...payload,
    ...(session ? { session } : {}),
  });
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

function normalizeExecutionAbortReason(reason) {
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  if (reason && typeof reason === "object" && typeof reason.message === "string" && reason.message.trim()) {
    return reason.message.trim();
  }
  return "用户已中止本次生成。";
}

function createExecutionAbortError(reason) {
  const error = new Error(normalizeExecutionAbortReason(reason));
  error.name = "ExecutionCancelledError";
  return error;
}

function isExecutionAbortError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  const message = typeof error?.message === "string" ? error.message : String(error ?? "");
  return (
    name === "ExecutionCancelledError"
    || name === "AbortError"
    || name === "APIUserAbortError"
    || /aborted|aborterror|cancelled|canceled|中止生成|停止生成/i.test(message)
  );
}

function registerActiveExecutionRun(runId, payload) {
  activeExecutionControllers.set(runId, {
    runId,
    currentTaskId: null,
    currentAgentId: "orchestrator",
    cancelled: false,
    cancelReason: undefined,
    ...payload,
  });
}

function updateActiveExecutionRun(runId, updates) {
  const current = activeExecutionControllers.get(runId);
  if (!current) return null;
  const next = { ...current, ...updates };
  activeExecutionControllers.set(runId, next);
  return next;
}

function getActiveExecutionRun(runId) {
  return activeExecutionControllers.get(runId) ?? null;
}

function throwIfExecutionCancelled(runId) {
  const current = getActiveExecutionRun(runId);
  if (current?.cancelled || current?.controller?.signal?.aborted) {
    throw createExecutionAbortError(current?.cancelReason ?? current?.controller?.signal?.reason);
  }
}

function requestExecutionCancellation(runId, reason) {
  const current = getActiveExecutionRun(runId);
  if (!current) return null;
  if (current.cancelled || current.controller?.signal?.aborted) {
    return current;
  }

  const cancelReason = normalizeExecutionAbortReason(reason);
  const next = updateActiveExecutionRun(runId, {
    cancelled: true,
    cancelReason,
    cancelledAt: Date.now(),
  });

  try {
    current.controller?.abort(cancelReason);
  } catch {
    try {
      current.controller?.abort();
    } catch {
      // Ignore best-effort abort failures.
    }
  }

  return next;
}

function finalizeCancelledExecution({
  runId,
  sessionId,
  totalTasks,
  completedTasks,
  failedTasks,
  currentTaskId,
  currentAgentId,
  reason,
}) {
  const normalizedReason = normalizeExecutionAbortReason(reason);
  const timestamp = Date.now();
  const resolvedAgentId = currentAgentId || "orchestrator";
  const nextFailedTasks = Math.min(totalTasks, failedTasks + (currentTaskId ? 1 : 0));

  if (currentTaskId) {
    broadcast({
      type: "task_stream_delta",
      executionRunId: runId,
      taskId: currentTaskId,
      delta: "\n\n[已停止生成]",
    });
    broadcast({
      type: "task_update",
      executionRunId: runId,
      taskId: currentTaskId,
      updates: {
        status: "failed",
        completedAt: timestamp,
      },
    });
    broadcast({
      type: "assistant_reasoning",
      executionRunId: runId,
      sessionId,
      agentId: resolvedAgentId,
      taskId: currentTaskId,
      summary: "已停止生成",
      detail: normalizedReason,
      status: "failed",
      timestamp,
    });
    broadcast({
      type: "activity",
      executionRunId: runId,
      activity: {
        agentId: resolvedAgentId,
        type: "task_fail",
        summary: "本次生成已中止",
        detail: normalizedReason,
        timestamp,
        taskId: currentTaskId,
      },
    });
  }

  broadcast({ type: "agent_status", agentId: resolvedAgentId, status: "idle", executionRunId: runId });
  idleAllExcept();
  broadcastExecutionUpdate({
    executionRunId: runId,
    sessionId,
    status: "failed",
    totalTasks,
    completedTasks,
    failedTasks: nextFailedTasks,
    currentAgentId: resolvedAgentId,
    completedAt: timestamp,
    event: makeExecutionEvent({
      type: "error",
      title: "本轮生成已中止",
      detail: normalizedReason,
      agentId: resolvedAgentId,
      taskId: currentTaskId ?? undefined,
      timestamp,
    }),
  });
}

function buildChannelSessionSnapshot({
  platformId,
  targetId,
  direction,
  text,
  deliveryStatus,
  requiresReply,
  status,
  summary,
  timestamp,
  deliveryError,
  externalMessageId,
}) {
  const channel = mapPlatformToChannel(platformId);
  return {
    channel,
    externalRef: String(targetId),
    title: `${platformId}:${targetId}`,
    participantLabel: String(targetId),
    remoteUserId: String(targetId),
    lastMessageDirection: direction,
    lastDeliveryStatus: deliveryStatus,
    lastDeliveryError: deliveryError,
    lastMessagePreview: String(text || "").slice(0, 140),
    unreadCount: direction === "inbound" ? 1 : 0,
    requiresReply,
    status,
    summary,
    lastMessageAt: timestamp,
    lastExternalMessageId: externalMessageId ? String(externalMessageId) : undefined,
    lastInboundAt: direction === "inbound" ? timestamp : undefined,
    lastOutboundAt: direction === "outbound" ? timestamp : undefined,
    lastOutboundText: direction === "outbound" ? String(text || "") : undefined,
    lastFailedOutboundText: deliveryStatus === "failed" ? String(text || "") : undefined,
    accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
  };
}

function buildPlatformDiagnosis(platformId) {
  const platformConfig = settings.platformConfigs?.[platformId] ?? { enabled: false, fields: {} };
  const fields = platformConfig.fields ?? {};
  const requiredKeys = PLATFORM_FIELD_REQUIREMENTS[platformId] ?? [];
  const missingRequiredKeys = requiredKeys.filter((key) => !String(fields[key] || "").trim());
  const publicWebhookHint = String(fields.webhookUrl || "").trim();
  const defaultTarget = resolvePlatformDebugTarget(platformId, "");
  const webhookRoute = PLATFORM_WEBHOOK_PATHS[platformId] ?? "";
  const running = isPlatformRunning(platformId);

  const checks = [
    {
      id: "configured",
      label: "基础凭证",
      status: missingRequiredKeys.length === 0 ? "pass" : "fail",
      detail: missingRequiredKeys.length === 0
        ? "必填字段已补齐。"
        : `缺少必填字段：${missingRequiredKeys.join("、")}`,
    },
    {
      id: "enabled",
      label: "运行开关",
      status: platformConfig.enabled ? "pass" : "warn",
      detail: platformConfig.enabled ? "平台已启用。" : "平台尚未启用，服务端不会启动连接器。",
    },
    {
      id: "runtime",
      label: "适配器运行态",
      status: running ? "pass" : (platformConfig.enabled ? "warn" : "neutral"),
      detail: running ? "连接器进程已启动。" : (platformConfig.enabled ? "连接器未在服务端运行。" : "平台未启用，暂不检查运行态。"),
    },
  ];

  if (webhookRoute) {
    checks.push({
      id: "webhook",
      label: "Webhook 回调",
      status: publicWebhookHint ? "pass" : "warn",
      detail: publicWebhookHint
        ? `已填写公网回调标记：${publicWebhookHint}`
        : `服务端回调入口为 ${webhookRoute}，但尚未填写公网映射地址标记。`,
    });
  }

  if (platformId === "telegram" || platformId === "feishu") {
    checks.push({
      id: "defaultTarget",
      label: "默认联调目标",
      status: defaultTarget ? "pass" : "warn",
      detail: defaultTarget
        ? `当前默认目标为 ${defaultTarget}`
        : "未配置默认目标，发送测试消息时需要手动填写目标 ID。",
    });
  }

  if (platformConfig.errorMsg) {
    checks.push({
      id: "recentError",
      label: "最近错误",
      status: "warn",
      detail: platformConfig.errorMsg,
    });
  }

  const failingCount = checks.filter((item) => item.status === "fail").length;
  const warningCount = checks.filter((item) => item.status === "warn").length;
  const score = Math.max(0, Math.min(100, 100 - failingCount * 35 - warningCount * 15));
  const summary = failingCount > 0
    ? "存在阻断项，建议先补齐配置后再联调。"
    : warningCount > 0
      ? "基础链路可继续，但仍有风险项建议处理。"
      : "诊断通过，可以继续做真实联调。";

  const suggestedActions = checks
    .filter((item) => item.status === "fail" || item.status === "warn")
    .map((item) => item.detail);

  return {
    platformId,
    summary,
    score,
    checks,
    suggestedActions,
    status: platformConfig.status ?? "idle",
    detail: platformConfig.detail ?? "",
    accountLabel: summarizePlatformAccount(platformId, fields),
    checkedAt: Date.now(),
  };
}

async function probePlatformWebhook(platformId) {
  const webhookRoute = PLATFORM_WEBHOOK_PATHS[platformId];
  if (!webhookRoute) {
    throw new Error("当前平台不是 Webhook 型接入，无需探测。");
  }

  const configuredPublicUrl = String(settings.platformConfigs?.[platformId]?.fields?.webhookUrl || "").trim();
  const localProbeUrl = `http://127.0.0.1:${PORT}${webhookRoute}?probe=1`;
  const response = await fetch(localProbeUrl, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  const adapterReady = Boolean(payload?.adapterReady);
  const localReachable = response.ok;
  const pathMatches = configuredPublicUrl ? configuredPublicUrl.endsWith(webhookRoute) : false;
  const summary = localReachable
    ? adapterReady
      ? (configuredPublicUrl
          ? (pathMatches
              ? "Webhook 本机路由可达，适配器已挂载，公网地址路径也匹配。"
              : "Webhook 本机路由可达，适配器已挂载，但公网地址路径与预期不一致。")
          : "Webhook 本机路由可达，适配器已挂载，但还没填写公网地址标记。")
      : "Webhook 路由可达，但适配器尚未挂载，通常说明平台未成功启用。"
    : "Webhook 本机路由探测失败。";

  return {
    platformId,
    webhookRoute,
    localProbeUrl,
    configuredPublicUrl,
    localReachable,
    adapterReady,
    pathMatches,
    probeStatus: response.status,
    summary,
  };
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

  if (toolName === "desktop_open_external_browser") {
    const requestedBrowser = typeof input?.browser === "string" ? input.browser.trim() : "";
    const url = typeof input?.url === "string" ? input.url.trim() : "";

    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "请求打开外部浏览器",
        detail: [
          requestedBrowser ? `浏览器：${requestedBrowser}` : "浏览器：auto",
          url ? `网址：${url}` : "",
        ].filter(Boolean).join(" · "),
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const browserLabel = typeof resolvedResult === "object" && resolvedResult && "browserLabel" in resolvedResult
        ? String(resolvedResult.browserLabel || "")
        : "";
      const openedUrl = typeof resolvedResult === "object" && resolvedResult && "url" in resolvedResult
        ? String(resolvedResult.url || "")
        : "";
      return makeExecutionEvent({
        type: "result",
        title: "外部浏览器已打开",
        detail: [
          browserLabel || requestedBrowser,
          openedUrl ? `网址：${openedUrl}` : "",
        ].filter(Boolean).join(" · ") || "桌面客户端已打开真实外部浏览器。",
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "外部浏览器启动被拒绝" : "外部浏览器启动失败",
        detail: String(error || url || requestedBrowser || "桌面客户端未能打开外部浏览器。"),
        agentId,
        taskId,
      });
    }
  }

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

  if (toolName === "desktop_cdp_open_app") {
    const appLabel = typeof input?.app === "string" ? input.app.trim() : "";
    const url = typeof input?.url === "string" ? input.url.trim() : "";

    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "请求 CDP App Mode",
        detail: [appLabel ? `应用：${appLabel}` : "", url ? `网址：${url}` : ""].filter(Boolean).join(" · ") || "正在打开结构化控制应用。",
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const label = typeof resolvedResult === "object" && resolvedResult && "label" in resolvedResult
        ? String(resolvedResult.label || "")
        : "";
      const pageUrl = typeof resolvedResult === "object" && resolvedResult && "pageUrl" in resolvedResult
        ? String(resolvedResult.pageUrl || "")
        : "";
      return makeExecutionEvent({
        type: "result",
        title: "CDP App Mode 已连接",
        detail: [label || appLabel, pageUrl ? `地址：${pageUrl}` : ""].filter(Boolean).join(" · ") || "已连接结构化控制会话。",
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "CDP App Mode 被拒绝" : "CDP App Mode 连接失败",
        detail: String(error || appLabel || "未能连接结构化控制应用。"),
        agentId,
        taskId,
      });
    }
  }

  if (toolName === "desktop_cdp_snapshot") {
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "读取 CDP 结构化快照",
        detail: "正在抓取当前应用的结构化元素列表。",
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      const elements = typeof resolvedResult === "object" && resolvedResult && Array.isArray(resolvedResult.elements)
        ? resolvedResult.elements.length
        : 0;
      return makeExecutionEvent({
        type: "result",
        title: "CDP 快照已返回",
        detail: elements > 0 ? `共返回 ${elements} 个结构化元素。` : "已返回结构化页面快照。",
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "CDP 快照被拒绝" : "CDP 快照失败",
        detail: String(error || "未能获取结构化页面快照。"),
        agentId,
        taskId,
      });
    }
  }

  if (toolName === "desktop_cdp_act") {
    const action = typeof input?.action === "string" ? input.action : "act";
    if (phase === "start") {
      return makeExecutionEvent({
        type: "system",
        title: "执行 CDP 结构化动作",
        detail: `动作：${action}`,
        agentId,
        taskId,
      });
    }

    if (phase === "success") {
      return makeExecutionEvent({
        type: "result",
        title: "CDP 动作已执行",
        detail: `动作：${action}`,
        agentId,
        taskId,
      });
    }

    if (phase === "denied" || phase === "error") {
      return makeExecutionEvent({
        type: "error",
        title: phase === "denied" ? "CDP 动作被拒绝" : "CDP 动作失败",
        detail: String(error || action || "结构化页面动作执行失败。"),
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

  if (toolName === "desktop_open_external_browser") {
    const requestedBrowser = typeof input?.browser === "string" ? input.browser.trim() : "";
    const url = typeof input?.url === "string" ? input.url.trim() : "";

    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: requestedBrowser ? `请求打开 ${requestedBrowser}` : "请求打开外部浏览器",
        detail: url || (typeof input?.reason === "string" && input.reason.trim() ? input.reason.trim() : undefined),
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      const browserLabel = typeof resolvedResult === "object" && resolvedResult && "browserLabel" in resolvedResult
        ? String(resolvedResult.browserLabel || "")
        : "";
      const openedUrl = typeof resolvedResult === "object" && resolvedResult && "url" in resolvedResult
        ? String(resolvedResult.url || "")
        : "";
      return {
        agentId,
        type: "tool_done",
        summary: browserLabel ? `${browserLabel} 已打开` : "外部浏览器已打开",
        detail: openedUrl || undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: requestedBrowser ? `${requestedBrowser} 启动失败` : "外部浏览器启动失败",
        detail: String(error || "桌面客户端未能打开外部浏览器。"),
        timestamp,
        taskId,
      };
    }
  }

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

  if (toolName === "desktop_cdp_open_app") {
    const appLabel = typeof input?.app === "string" ? input.app.trim() : "";
    const pageUrl = typeof resolvedResult === "object" && resolvedResult && "pageUrl" in resolvedResult
      ? String(resolvedResult.pageUrl || "")
      : "";

    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: appLabel ? `连接 ${appLabel} 的 CDP 模式` : "连接 CDP App Mode",
        detail: typeof input?.url === "string" && input.url.trim() ? input.url.trim() : undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      return {
        agentId,
        type: "tool_done",
        summary: appLabel ? `${appLabel} 已进入 CDP 模式` : "CDP App Mode 已连接",
        detail: pageUrl || undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: appLabel ? `${appLabel} CDP 连接失败` : "CDP App Mode 连接失败",
        detail: String(error || "未能连接结构化控制应用。"),
        timestamp,
        taskId,
      };
    }
  }

  if (toolName === "desktop_cdp_snapshot") {
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: "抓取 CDP 结构化快照",
        detail: undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      const elements = typeof resolvedResult === "object" && resolvedResult && Array.isArray(resolvedResult.elements)
        ? resolvedResult.elements.length
        : undefined;
      return {
        agentId,
        type: "tool_done",
        summary: typeof elements === "number" ? `已返回 ${elements} 个结构化元素` : "CDP 快照已返回",
        detail: undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: "CDP 快照失败",
        detail: String(error || "未能获取结构化页面快照。"),
        timestamp,
        taskId,
      };
    }
  }

  if (toolName === "desktop_cdp_act") {
    const action = typeof input?.action === "string" ? input.action : "act";
    if (phase === "start") {
      return {
        agentId,
        type: "tool_start",
        summary: `执行 CDP 动作：${action}`,
        detail: undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "success") {
      return {
        agentId,
        type: "tool_done",
        summary: `CDP 动作完成：${action}`,
        detail: undefined,
        timestamp,
        taskId,
      };
    }

    if (phase === "denied" || phase === "error") {
      return {
        agentId,
        type: "tool_fail",
        summary: `CDP 动作失败：${action}`,
        detail: String(error || "结构化页面动作执行失败。"),
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

function shouldPreferOrchestratorForDesktopControl(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;

  if (shouldExplicitlyOpenExternalBrowser(t)) {
    return true;
  }

  if (isDesktopFileDestinationRequest(t)) {
    return false;
  }

  const directDesktopPatterns = [
    /(?:鼠标|鍵盤|键盘|截图|截圖|接管|点开|點開|点击|點擊|双击|雙擊|右键|右鍵|滚动|滾動|输入|輸入|按下|播放)/i,
    /(?:桌面|desktop).{0,12}(?:点击|點擊|操作|接管|程序|應用|应用|窗口|視窗|弹窗|彈窗)/i,
    /(?:点击|點擊|操作|接管|启动|啟動).{0,12}(?:桌面|desktop)/i,
    /(?:打开|打開|进入|進入|前往|跳转到|跳轉到|去到).{0,18}(?:视频|影片|视频页|影片頁|直播|网页播放器|網頁播放器)/i,
    /(?:网页|網頁|网站|網站|浏览器|瀏覽器).{0,18}(?:点击|點擊|点开|點開|播放|输入|輸入|滚动|滾動|操作)/i,
    /(?:打开|打開|进入|進入|前往|跳转到|跳轉到|去到).{0,20}(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器)/i,
    /(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器).{0,18}(?:打开|打開|点击|點擊|点开|點開|播放|滚动|滾動|输入|輸入|进入|進入)/i,
  ];

  return directDesktopPatterns.some(pattern => pattern.test(t));
}

function shouldExplicitlyOpenExternalBrowser(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;

  if (/(?:浏览器打不开|打不开浏览器|无法打开浏览器|browser won't open|browser cannot open)/i.test(t)) {
    return false;
  }

  const directPatterns = [
    /^(?:请)?(?:帮我)?(?:麻烦)?(?:打开|启动|开启|唤起)(?:一下)?(?:外部|系统|真实)?(?:浏览器|chrome|google chrome|edge|msedge|firefox)/i,
    /(?:用|使用|在)(?:外部|系统|真实)?(?:浏览器|chrome|google chrome|edge|msedge|firefox).{0,12}(?:打开|访问|启动)/i,
    /\b(?:open|launch|start)\b.{0,18}\b(?:browser|chrome|edge|firefox)\b/i,
    /\b(?:browser|chrome|edge|firefox)\b.{0,18}\b(?:open|launch|start)\b/i,
    /(?:打开|访问|进入|前往|跳转到|去到|go to|visit|open).{0,24}(?:网页|页面|网站|网址|链接|url|官网|web\s*site|website|site|page|link)\b/i,
    /(?:打开|访问|进入|前往|跳转到|去到|go to|visit|open).{0,32}(?:https?:\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?)/i,
    /(?:用|使用|在).{0,12}(?:浏览器|chrome|google chrome|edge|msedge|firefox).{0,18}(?:打开|访问|进入).{0,24}(?:网页|页面|网站|网址|链接|url|官网|https?:\/\/|www\.)/i,
    /(?:打开|访问|进入|前往|跳转到|去到|go to|visit|open).{0,24}(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器)/i,
    /(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器).{0,18}(?:打开|访问|进入|前往|播放|点开|點開)/i,
  ];

  return directPatterns.some(pattern => pattern.test(t));
}

function isDesktopFileDestinationRequest(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;

  return [
    /(?:保存|存到|放到|导出到|輸出到|发送到|發送到|发到|傳到|下载到|下載到).{0,12}(?:桌面|desktop)/i,
    /(?:桌面|desktop).{0,12}(?:文档|文件|word|docx|pdf|markdown|md|总结|報告|报告|附件)/i,
  ].some(pattern => pattern.test(t));
}

function buildBrowserExecutionGuardrail(text) {
  if (shouldExplicitlyOpenExternalBrowser(text)) {
    return [
      "【浏览器执行边界】",
      "- 用户这次明确要求打开浏览器，或要求打开/访问某个网站、链接、URL。",
      "- 这种场景一律先使用 desktop_open_external_browser 打开真实外部浏览器；只有在必须指定本机程序细节时才退回 desktop_launch_native_application。",
      "- 外部浏览器打开后，如还需要继续查资料、抓网页或读页面文字，仍可继续使用内置 browser_* 工具完成后续信息检索。",
    ].join("\n");
  }

  return [
    "【浏览器执行边界】",
    "- 若只是为了搜索网页、查资料、访问链接、读取页面、抓取页面内容或验证网页结果，一律优先使用内置 browser_*。",
    "- 不要因为任务需要联网就启动真实外部浏览器。",
    "- 只有当用户明确要求“打开浏览器”，或明确要求“打开/访问某个网站、链接、URL”，才允许使用 desktop_open_external_browser 或 desktop_launch_native_application。",
    "- 如果任务是“先查资料，再生成 Word / 文档 / 总结 / 附件，并保存到桌面或本地目录”，检索阶段仍然只用内置 browser_*；保存到桌面不等于打开桌面浏览器。",
    "- “发到桌面 / 保存到桌面 / 导出到桌面” 只是本地交付目标，不属于外部浏览器打开指令。",
  ].join("\n");
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
    return `我是鹦鹉螺，${nick}可以把需求直接发给我，我会判断是由我直接回复，还是分配给选品、文案、设计、视频、客服这些执行角色。`;
  }
  if (/^(?:你是干什么的|你能做什么|怎么用)[!！。.?？\s]*$/i.test(t)) {
    return `我是负责调度的 STARCRAW 主管。${nick}可以直接发任务，比如选品分析、文案、海报、短视频脚本、客服话术，我会直接处理或安排合适的执行角色。`;
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
  if (shouldPreferOrchestratorForDesktopControl(lower)) {
    return { agent: "orchestrator", complexity: "high" };
  }
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
  const providerId = provider?.id || config?.providerId || "";
  const useAnthropic =
    providerId.startsWith("anthropic")
    || String(baseURL || "").includes("api.anthropic.com");

  return {
    client: useAnthropic
      ? new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
      : new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) }),
    clientType: useAnthropic ? "anthropic" : "openai",
    model,
    systemPrompt,
  };
}

function createAssistantStreamReporter({ executionRunId, sessionId, agentId, taskId }) {
  let lastSummary = "";
  let lastDetail = "";

  return {
    onTextDelta(delta) {
      if (!delta) return;
      broadcast({
        type: "task_stream_delta",
        executionRunId,
        taskId,
        delta,
      });
    },
    onReasoningEvent({ summary, detail, status = "running" }) {
      const timestamp = Date.now();
      broadcast({
        type: "assistant_reasoning",
        executionRunId,
        taskId,
        sessionId,
        agentId,
        summary,
        detail,
        status,
        timestamp,
      });

      const normalizedSummary = String(summary || "").trim();
      const normalizedDetail = String(detail || "").trim();
      const shouldLogEvent =
        (normalizedSummary && normalizedSummary !== lastSummary)
        || (normalizedDetail && normalizedDetail !== lastDetail)
        || status === "failed";

      if (shouldLogEvent) {
        const title = normalizedSummary ? `思考摘要 · ${normalizedSummary}` : "思考摘要";
        const eventDetail = normalizedDetail || normalizedSummary || "模型正在更新内部思路摘要。";
        broadcastExecutionUpdate({
          executionRunId,
          sessionId,
          currentAgentId: agentId,
          timestamp,
          event: makeExecutionEvent({
            type: status === "failed" ? "error" : "agent",
            title,
            detail: eventDetail,
            agentId,
            taskId,
            timestamp,
          }),
        });
      }

      if (normalizedSummary) lastSummary = normalizedSummary;
      if (normalizedDetail) lastDetail = normalizedDetail;
    },
  };
}

async function callAgent(agentId, task, complexity, maxTokensOverride, sessionId = "default", executionMeta = {}) {
  const { client, clientType, model, systemPrompt } = buildClient(agentId);
  // 若 Agent 已显式配置了模型则尊重该设置，否则按复杂度自动选择
  const hasCustomModel = !!settings.agentConfigs?.[agentId]?.model;
  const actualModel = hasCustomModel ? model : getModelForComplexity(complexity);
  const defaultMax = complexity === "high" ? 1024 : complexity === "medium" ? 600 : 400;
  const streamReporter = executionMeta.executionRunId && executionMeta.taskId
    ? createAssistantStreamReporter({
        executionRunId: executionMeta.executionRunId,
        sessionId,
        agentId,
        taskId: executionMeta.taskId,
      })
    : null;

  return await queryAgent({
    agentId,
    sessionId,
    task,
    systemPrompt,
    tools: getAgentTools(agentId),
    maxTokens: maxTokensOverride ?? defaultMax,
    model: actualModel,
    client,
    clientType,
    onToolEvent: executionMeta.executionRunId
      ? createToolEventReporter({
          executionRunId: executionMeta.executionRunId,
          sessionId,
          agentId,
          taskId: executionMeta.taskId,
        })
      : undefined,
    onTextDelta: streamReporter?.onTextDelta,
    onReasoningEvent: streamReporter?.onReasoningEvent,
    signal: executionMeta.signal,
    toolContext: executionMeta.requesterWs
      ? {
          desktopClientWs: executionMeta.requesterWs,
          executionRunId: executionMeta.executionRunId,
          taskId: executionMeta.taskId,
          sessionId,
          signal: executionMeta.signal,
          userInstruction: executionMeta.userInstruction,
          currentTaskDescription: executionMeta.currentTaskDescription,
        }
      : undefined,
  });
}

async function dispatch(
  instruction,
  sessionId = "default",
  executionRunId = randomUUID(),
  source = "chat",
  requesterWs = null,
  userInstruction = instruction,
) {
  const runId = executionRunId || randomUUID();
  const createdAt = Date.now();
  const controller = new AbortController();
  registerActiveExecutionRun(runId, {
    controller,
    sessionId,
    source,
    requesterWs,
    userInstruction,
    createdAt,
  });
  let totalTasksForCancellation = 0;
  let completedTasksForCancellation = 0;
  let failedTasksForCancellation = 0;

  try {
    broadcastExecutionUpdate({
      executionRunId: runId,
      sessionId,
      instruction: userInstruction,
      source,
      status: "analyzing",
      timestamp: createdAt,
      event: makeExecutionEvent({
        type: "dispatch",
        title: "开始分析需求",
        detail: userInstruction,
        timestamp: createdAt,
      }),
    });

    idleAllExcept("orchestrator");
    broadcast({ type: "agent_status", agentId: "orchestrator", status: "running", currentTask: "理解指令中...", executionRunId: runId });

    if (shouldReplyDirectlyByOrchestrator(userInstruction)) {
      totalTasksForCancellation = 1;
      let taskId = randomUUID();
      try {
        const directReply = buildDirectOrchestratorReply(userInstruction);
        let text = directReply;
        let tokens = 0;
        let directStatus = "completed";

        if (!text) {
          throwIfExecutionCancelled(runId);
          const taskCreatedAt = nextTaskTimestamp();
          updateActiveExecutionRun(runId, {
            currentTaskId: taskId,
            currentAgentId: "orchestrator",
          });
          broadcast({
            type: "task_add",
            executionRunId: runId,
            task: {
              id: taskId,
              description: userInstruction,
              assignedTo: "orchestrator",
              complexity: "low",
              status: "running",
              result: "",
              createdAt: taskCreatedAt,
            },
          });
          const response = await callAgent(
            "orchestrator",
            `用户发来的是简单对话或短问句，请你以鹦鹉螺身份直接接话回复。

要求：
- 不要拆解任务
- 不要提及其他 agent
- 不要写“收到指令”“本次由某某处理”这类调度话术
- 像真实对话一样自然、简短、友好

用户消息：${userInstruction}`,
            "low",
            220,
            sessionId,
            {
              executionRunId: runId,
              requesterWs,
              taskId,
              signal: controller.signal,
              userInstruction,
              currentTaskDescription: userInstruction,
            },
          );
          throwIfExecutionCancelled(runId);
          text = response.text;
          tokens = response.tokens;
          const finalStatus = String(text || "").startsWith("API 调用失败：") ? "failed" : "done";
          directStatus = finalStatus === "failed" ? "failed" : "completed";
          broadcast({
            type: "task_update",
            executionRunId: runId,
            taskId,
            updates: {
              status: finalStatus,
              result: text,
              completedAt: Date.now(),
            },
          });
        }

        if (directReply) {
          const ts = nextTaskTimestamp();
          broadcast({
            type: "task_add",
            executionRunId: runId,
            task: {
              id: taskId,
              description: userInstruction,
              assignedTo: "orchestrator",
              complexity: "low",
              status: "done",
              result: text,
              createdAt: ts,
              completedAt: ts,
            },
          });
        }
        if (tokens > 0) {
          broadcast({ type: "cost", agentId: "orchestrator", tokens });
        }
        broadcastExecutionUpdate({
          executionRunId: runId,
          sessionId,
          status: directStatus,
          totalTasks: 1,
          completedTasks: directStatus === "completed" ? 1 : 0,
          failedTasks: directStatus === "failed" ? 1 : 0,
          currentAgentId: "orchestrator",
          completedAt: Date.now(),
          event: makeExecutionEvent({
            type: directStatus === "completed" ? "result" : "error",
            title: directStatus === "completed" ? "鹦鹉螺直接完成回复" : "鹦鹉螺直接回复失败",
            detail: String(text || "").slice(0, 200),
            agentId: "orchestrator",
          }),
        });
        completedTasksForCancellation = directStatus === "completed" ? 1 : 0;
        failedTasksForCancellation = directStatus === "failed" ? 1 : 0;
      } catch (err) {
        if (isExecutionAbortError(err) || controller.signal.aborted || getActiveExecutionRun(runId)?.cancelled) {
          finalizeCancelledExecution({
            runId,
            sessionId,
            totalTasks: 1,
            completedTasks: 0,
            failedTasks: 0,
            currentTaskId: getActiveExecutionRun(runId)?.currentTaskId,
            currentAgentId: "orchestrator",
            reason: err,
          });
          return;
        }

        const ts = nextTaskTimestamp();
        broadcast({
          type: "task_add",
          executionRunId: runId,
          task: {
            id: randomUUID(),
            description: userInstruction,
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
            title: "鹦鹉螺回复时发生异常",
            detail: String(err?.message || err),
            agentId: "orchestrator",
          }),
        });
        failedTasksForCancellation = 1;
      } finally {
        updateActiveExecutionRun(runId, { currentTaskId: null, currentAgentId: "orchestrator" });
        broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle", executionRunId: runId });
      }

      return;
    }

    broadcast({
      type: "activity",
      executionRunId: runId,
      activity: {
        agentId: "orchestrator",
        type: "dispatch",
        summary: userInstruction,
        timestamp: Date.now(),
      },
    });

    let tasks = [];
    const browserExecutionGuardrail = buildBrowserExecutionGuardrail(userInstruction);

    if (shouldForceDecomposition(userInstruction)) {
      const candidateTasks = [
        "先分析用户需求并提炼核心目标",
        userInstruction,
      ];
      tasks = candidateTasks.map((desc) => {
        const routed = routeTask(desc);
        const isPrimaryInstruction = desc === userInstruction;
        return {
          id: randomUUID(),
          description: isPrimaryInstruction ? userInstruction : `围绕“${userInstruction}”：${desc}`,
          prompt: isPrimaryInstruction
            ? `${instruction}\n\n${browserExecutionGuardrail}`
            : `用户原始需求：${userInstruction}\n\n完整上下文：\n${instruction}\n\n${browserExecutionGuardrail}\n\n当前子任务：${desc}`,
          assignedTo: routed.agent,
          complexity: routed.complexity,
        };
      });
    } else {
      const routed = routeTask(userInstruction);
      tasks = [{
        id: randomUUID(),
        description: userInstruction,
        prompt: `${instruction}\n\n${browserExecutionGuardrail}`,
        assignedTo: routed.agent,
        complexity: routed.complexity,
      }];
    }

    throwIfExecutionCancelled(runId);
    totalTasksForCancellation = tasks.length;
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
      }),
    });
    broadcast({ type: "agent_status", agentId: "orchestrator", status: "idle", executionRunId: runId });

    let completedTasks = 0;
    let failedTasks = 0;
    for (const task of tasks) {
      throwIfExecutionCancelled(runId);
      const start = Date.now();
      const taskCreatedAt = nextTaskTimestamp();
      const { prompt, ...taskView } = task;
      updateActiveExecutionRun(runId, {
        currentTaskId: task.id,
        currentAgentId: task.assignedTo,
      });
      idleAllExcept(task.assignedTo);
      broadcast({
        type: "task_add",
        executionRunId: runId,
        task: {
          ...taskView,
          status: "running",
          createdAt: taskCreatedAt,
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
          prompt || task.description,
          task.complexity,
          undefined,
          sessionId,
          {
            executionRunId: runId,
            taskId: task.id,
            requesterWs,
            signal: controller.signal,
            userInstruction,
            currentTaskDescription: task.description,
          },
        );
        throwIfExecutionCancelled(runId);
        const finalStatus = String(text || "").startsWith("API 调用失败：") ? "failed" : "done";
        broadcast({
          type: "task_update",
          executionRunId: runId,
          taskId: task.id,
          updates: {
            status: finalStatus,
            result: text,
            completedAt: Date.now(),
          },
        });
        if (finalStatus === "failed") {
          failedTasks += 1;
          failedTasksForCancellation = failedTasks;
          broadcast({ type: "agent_status", agentId: task.assignedTo, status: "error", executionRunId: runId });
          broadcast({ type: "activity", executionRunId: runId, activity: { agentId: task.assignedTo, type: "task_fail", summary: String(text || "API 调用失败"), timestamp: Date.now(), durationMs: Date.now() - start, taskId: task.id } });
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
              detail: String(text || "").slice(0, 200),
              agentId: task.assignedTo,
              taskId: task.id,
            }),
          });
        } else {
          completedTasks += 1;
          completedTasksForCancellation = completedTasks;
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
        }
        if (tokens > 0) broadcast({ type: "cost", agentId: task.assignedTo, tokens });
      } catch (err) {
        if (isExecutionAbortError(err) || controller.signal.aborted || getActiveExecutionRun(runId)?.cancelled) {
          finalizeCancelledExecution({
            runId,
            sessionId,
            totalTasks: tasks.length,
            completedTasks,
            failedTasks,
            currentTaskId: task.id,
            currentAgentId: task.assignedTo,
            reason: err,
          });
          return;
        }

        failedTasks += 1;
        failedTasksForCancellation = failedTasks;
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
      } finally {
        updateActiveExecutionRun(runId, { currentTaskId: null });
      }
    }

    throwIfExecutionCancelled(runId);
    const finalStatus = failedTasks > 0 ? "failed" : "completed";
    completedTasksForCancellation = completedTasks;
    failedTasksForCancellation = failedTasks;
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
  } catch (err) {
    if (isExecutionAbortError(err) || controller.signal.aborted || getActiveExecutionRun(runId)?.cancelled) {
      const current = getActiveExecutionRun(runId);
      finalizeCancelledExecution({
        runId,
        sessionId,
        totalTasks: totalTasksForCancellation || 1,
        completedTasks: completedTasksForCancellation,
        failedTasks: failedTasksForCancellation,
        currentTaskId: current?.currentTaskId,
        currentAgentId: current?.currentAgentId || "orchestrator",
        reason: err,
      });
      return;
    }
    throw err;
  } finally {
    activeExecutionControllers.delete(runId);
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

function normalizePlatformInboundMessage(messageOrUserId, text, platformId) {
  const payload = messageOrUserId && typeof messageOrUserId === "object" && !Array.isArray(messageOrUserId)
    ? messageOrUserId
    : {
        userId: messageOrUserId,
        text,
        platformId,
      };

  return {
    userId: String(payload?.userId || "").trim(),
    text: String(payload?.text || "").trim(),
    platformId: String(payload?.platformId || platformId || "").trim(),
    inboundMessageKey: String(payload?.inboundMessageKey || "").trim() || undefined,
    externalMessageId: String(payload?.externalMessageId || "").trim() || undefined,
  };
}

async function handlePlatformMessage(messageOrUserId, text, platformId) {
  const taskAgentMap = {};
  const inboundMessage = normalizePlatformInboundMessage(messageOrUserId, text, platformId);
  if (!inboundMessage.userId || !inboundMessage.text || !inboundMessage.platformId) {
    return;
  }

  const { userId, text: inboundText, platformId: inboundPlatformId, inboundMessageKey, externalMessageId } = inboundMessage;
  const channel = mapPlatformToChannel(inboundPlatformId);
  const inboundTimestamp = Date.now();

  if (inboundMessageKey && hasProcessedInboundMessage(inboundPlatformId, inboundMessageKey, inboundTimestamp)) {
    broadcastPlatformStatus(inboundPlatformId, {
      status: "connected",
      detail: "检测到重复入站消息，已自动去重忽略。",
      healthScore: 100,
      lastEventAt: inboundTimestamp,
      lastInboundAt: inboundTimestamp,
      lastInboundMessageKey: inboundMessageKey,
      accountLabel: summarizePlatformAccount(inboundPlatformId, settings.platformConfigs?.[inboundPlatformId]?.fields ?? {}),
    });
    return;
  }

  if (inboundMessageKey) {
    markInboundMessageProcessed(inboundPlatformId, inboundMessageKey, inboundTimestamp);
  }

  broadcastPlatformStatus(inboundPlatformId, {
    status: "connected",
    detail: "已收到最新入站消息，连接器在线。",
    healthScore: 100,
    pendingEvents: 1,
    lastEventAt: inboundTimestamp,
    lastInboundAt: inboundTimestamp,
    lastInboundMessageKey: inboundMessageKey,
    accountLabel: summarizePlatformAccount(inboundPlatformId, settings.platformConfigs?.[inboundPlatformId]?.fields ?? {}),
  });
  broadcastChannelEvent({
    session: buildChannelSessionSnapshot({
      platformId: inboundPlatformId,
      targetId: userId,
      direction: "inbound",
      text: inboundText,
      deliveryStatus: "delivered",
      requiresReply: true,
      status: "active",
      summary: `最近收到入站消息：${inboundText.slice(0, 80)}`,
      timestamp: inboundTimestamp,
      externalMessageId,
    }),
    title: "收到入站消息",
    detail: inboundText.slice(0, 500),
    status: "completed",
    eventType: "message",
    externalRef: String(userId),
  });

  const deliverPlatformReply = (agentId, resultText) => {
    const normalizedResult = String(resultText || "").trim();
    if (!normalizedResult) return;
    const label = AGENT_DISPLAY[agentId] || agentId || "龙虾";
    const outboundEnvelope = `【${label}】\n\n${normalizedResult}`;

    sendPlatformMessageWithRetry({
      platformId: inboundPlatformId,
      targetId: userId,
      text: outboundEnvelope,
      trigger: "auto",
      successDetail: "最近一条出站回复已成功送达。",
      failureDetailPrefix: "最近一条出站回复发送失败",
    })
      .then(({ sentAt: outboundTimestamp }) => {
        broadcastChannelEvent({
          session: buildChannelSessionSnapshot({
            platformId: inboundPlatformId,
            targetId: userId,
            direction: "outbound",
            text: normalizedResult,
            deliveryStatus: "sent",
            requiresReply: false,
            status: "active",
            summary: `最近回复已发出：${normalizedResult.slice(0, 80)}`,
            timestamp: outboundTimestamp,
          }),
          title: "发送平台回复",
          detail: `【${label}】 ${normalizedResult.slice(0, 500)}`,
          status: "sent",
          eventType: "message",
          externalRef: String(userId),
        });
      })
      .catch((error) => {
        const failure = resolveOutboundFailurePresentation(error, {
          approvalSummary: "自动回复等待人工批准",
          cooldownSummary: "连接器冷却中，等待人工重试",
          failureSummary: "最近回复发送失败",
        });
        const failureAt = Date.now();
        broadcastChannelEvent({
          session: buildChannelSessionSnapshot({
            platformId: inboundPlatformId,
            targetId: userId,
            direction: "outbound",
            text: normalizedResult,
            deliveryStatus: failure.operationStatus === "failed" ? "failed" : "pending",
            requiresReply: true,
            status: failure.channelStatus,
            summary: failure.summary,
            timestamp: failureAt,
            deliveryError: failure.detail,
          }),
          title: failure.operationStatus === "blocked" ? "平台回复等待人工" : "平台回复发送失败",
          detail: failure.detail,
          status: failure.operationStatus,
          eventType: failure.eventType,
          failureReason: failure.failureReason,
          externalRef: String(userId),
        });
      });
  };

  global.__platformResultListener = (msg) => {
    if (msg.type === "task_add" && msg.task) {
      taskAgentMap[msg.task.id] = msg.task.assignedTo;
      if (msg.task.status === "done" && msg.task.result) {
        deliverPlatformReply(msg.task.assignedTo, msg.task.result);
      }
    }
    if (msg.type === "task_update" && msg.updates?.status === "done" && msg.updates?.result) {
      const agentId = taskAgentMap[msg.taskId];
      deliverPlatformReply(agentId, msg.updates.result);
    }
  };

  try {
    await dispatch(inboundText);
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
      hermesDispatchSettings: getNormalizedHermesDispatchSettings(),
      prototypePath: hermesDispatchPrototypePath,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/reset-session") {
    try {
      const body = await readJson(req);
      const profile = getHermesPlannerProfileById(body.profileId);
      if (!profile) {
        writeJson(res, 400, { ok: false, error: "无效的 planner profile。" });
        return;
      }

      const sessionStatePath = resolveHermesSessionStatePath(profile.sessionStateFile);
      if (!sessionStatePath) {
        writeJson(res, 400, { ok: false, error: "Session state file 超出 Hermes 输出目录，已拒绝操作。" });
        return;
      }

      const existed = existsSync(sessionStatePath);
      if (existed) {
        await fs.rm(sessionStatePath, { force: true });
      }

      writeJson(res, 200, {
        ok: true,
        profileId: profile.id,
        label: profile.label,
        sessionStateFile: profile.sessionStateFile,
        deleted: existed,
      });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/delete-run") {
    try {
      const body = await readJson(req);
      const result = await deleteHermesDispatchRun(body.runId);
      writeJson(res, 200, result);
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/cancel-run") {
    try {
      const body = await readJson(req);
      const result = await cancelHermesDispatchRun(body.runId);
      writeJson(res, 200, result);
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/stop-task") {
    try {
      const body = await readJson(req);
      const result = await stopHermesDispatchTask(body.runId, body.taskId);
      writeJson(res, 200, result);
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/hermes-dispatch/run") {
    try {
      const body = await readJson(req);
      const { plannerProfileId } = body;
      const planOnly = body.planOnly;
      const useSamplePlan = body.useSamplePlan;
      const normalizedInstruction = String(body.instruction || "").trim();
      if (!useSamplePlan && !normalizedInstruction) {
        writeJson(res, 400, { ok: false, error: "instruction 不能为空" });
        return;
      }

      const availability = await getHermesDispatchAvailability();
      if (!useSamplePlan && !availability.planner.available) {
        writeJson(res, 400, { ok: false, error: formatUnavailableCommandMessage("Planner", availability.planner.command) });
        return;
      }

      const run = await startHermesDispatchRun({
        instruction: normalizedInstruction,
        planOnly: Boolean(planOnly),
        useSamplePlan: Boolean(useSamplePlan),
        plannerProfileId: String(plannerProfileId || "").trim(),
      });

      writeJson(res, 200, { ok: true, run });
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/platform-debug") {
    let body = {};
    try {
      body = await readJson(req);
      const action = String(body.action || "").trim();
      const platformId = String(body.platformId || "").trim();
      const text = String(body.text || "").trim();
      const targetId = String(body.targetId || "").trim();

      if (!platformId) {
        writeJson(res, 400, { ok: false, error: "platformId 不能为空" });
        return;
      }

      if (!["send_test_message", "simulate_inbound", "diagnose", "probe_webhook", "replay_last_debug"].includes(action)) {
        writeJson(res, 400, { ok: false, error: `不支持的 action：${action || "empty"}` });
        return;
      }

      let effectiveAction = action;
      let effectiveTargetId = targetId;
      let effectiveText = text;

      if (action === "replay_last_debug") {
        const lastAction = settings.platformConfigs?.[platformId]?.lastDebugAction;
        if (!lastAction) {
          writeJson(res, 400, { ok: false, error: "当前平台还没有可重放的最近联调记录。" });
          return;
        }
        effectiveAction = lastAction;
        effectiveTargetId = targetId || String(settings.platformConfigs?.[platformId]?.lastDebugTarget || "").trim();
      }

      const result = await executePlatformDebugAction({
        action: effectiveAction,
        platformId,
        targetId: effectiveTargetId,
        text: effectiveText,
      });

      writeJson(res, result.httpStatus, {
        ...result.body,
        replayedFrom: action === "replay_last_debug" ? settings.platformConfigs?.[platformId]?.lastDebugAction : undefined,
        requestedAction: action,
      });
      return;

    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : String(error);
      const platformId = String(body?.platformId || "").trim();
      if (platformId) {
        const fallbackAction = String(body?.action || "").trim();
        const lastAction = settings.platformConfigs?.[platformId]?.lastDebugAction;
        const effectiveAction = fallbackAction === "replay_last_debug" ? lastAction : fallbackAction;
        rememberPlatformDebug(
          platformId,
          {
            action: effectiveAction || "diagnose",
            ok: false,
            status: "failed",
            target: resolvePlatformDebugTarget(platformId, body?.targetId) || String(body?.targetId || "").trim() || undefined,
            message: failureMessage,
            at: Date.now(),
          },
          {
            status: settings.platformConfigs?.[platformId]?.status ?? "degraded",
            errorMsg: failureMessage,
            detail: `联调动作失败：${failureMessage}`,
          },
        );
      }
      writeJson(res, 500, { ok: false, error: failureMessage });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    try {
      const body = await readJson(req);
      if (body.providers) settings.providers = body.providers;
      if (body.agentConfigs) settings.agentConfigs = body.agentConfigs;
      if (body.platformConfigs) settings.platformConfigs = mergePlatformConfigs(body.platformConfigs);
      if (body.userNickname !== undefined) settings.userNickname = body.userNickname;
      if (body.semanticMemoryConfig) settings.semanticMemoryConfig = body.semanticMemoryConfig;
      if (body.desktopProgramSettings) settings.desktopProgramSettings = body.desktopProgramSettings;
      if (body.hermesDispatchSettings) settings.hermesDispatchSettings = normalizeHermesDispatchSettings(body.hermesDispatchSettings);
      await persistRuntimeSettings();
      await ensureEnabledPlatformsRunning("settings");
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

  if (req.method === "POST" && url.pathname === "/api/semantic-memory/query") {
    try {
      const body = await readJson(req);
      const connectionString = String(body?.config?.connectionString || "").trim();
      const result = await querySemanticMemoryStore({
        connectionString,
        config: body?.config ?? {},
        documents: Array.isArray(body?.documents) ? body.documents : [],
        context: body?.context ?? {},
        limit: Number(body?.limit || 5),
        embedding: body?.embedding ?? {},
      });
      writeJson(res, 200, { ok: true, ...result });
    } catch (err) {
      writeJson(res, 200, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/semantic-memory/health") {
    try {
      const body = await readJson(req);
      const connectionString = String(body?.config?.connectionString || "").trim();
      const result = await checkSemanticMemoryStore({
        connectionString,
        config: body?.config ?? {},
        embedding: body?.embedding ?? {},
      });
      writeJson(res, 200, { ok: true, ...result });
    } catch (err) {
      writeJson(res, 200, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
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
      const caption = `鹦鹉螺会议结论：${meeting?.topic ?? ""}\n${String(meeting?.summary ?? "").slice(0, 1800)}`;
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

  if (req.method === "GET" && url.pathname === "/webhook/line" && url.searchParams.get("probe") === "1") {
    const adapter = globalThis.__lineAdapter;
    writeJson(res, 200, {
      ok: true,
      platformId: "line",
      route: "/webhook/line",
      adapterReady: Boolean(adapter),
      accepts: ["POST"],
      message: adapter ? "LINE Webhook 路由可达，适配器已挂载。" : "LINE Webhook 路由可达，但适配器尚未挂载。",
    });
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
        broadcastPlatformStatus("line", {
          status: "connected",
          detail: "已收到 LINE Webhook 回调。",
          healthScore: 100,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.line,
          lastEventAt: Date.now(),
        });
        res.writeHead(200);
        res.end("OK");
      } catch {
        broadcastPlatformStatus("line", {
          status: "webhook_unreachable",
          detail: "LINE Webhook 回调处理失败。",
          errorMsg: "LINE Webhook 回调处理失败",
          healthScore: 45,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.line,
          lastEventAt: Date.now(),
        });
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  if ((req.method === "POST" || req.method === "GET") && url.pathname === "/webhook/feishu") {
    if (req.method === "GET" && url.searchParams.get("probe") === "1") {
      const adapter = globalThis.__feishuAdapter;
      writeJson(res, 200, {
        ok: true,
        platformId: "feishu",
        route: "/webhook/feishu",
        adapterReady: Boolean(adapter),
        accepts: ["GET", "POST"],
        message: adapter ? "飞书 Webhook 路由可达，适配器已挂载。" : "飞书 Webhook 路由可达，但适配器尚未挂载。",
      });
      return;
    }
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", async () => {
      const adapter = globalThis.__feishuAdapter;
      if (!adapter) { res.writeHead(404); res.end(); return; }
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = await adapter.handleWebhookEvent(parsed);
        broadcastPlatformStatus("feishu", {
          status: "connected",
          detail: "已收到飞书 Webhook 回调。",
          healthScore: 100,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.feishu,
          lastEventAt: Date.now(),
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        broadcastPlatformStatus("feishu", {
          status: "webhook_unreachable",
          detail: "飞书 Webhook 回调处理失败。",
          errorMsg: "飞书 Webhook 回调处理失败",
          healthScore: 45,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.feishu,
          lastEventAt: Date.now(),
        });
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  if (url.pathname === "/webhook/wecom") {
    const adapter = globalThis.__wecomAdapter;
    if (req.method === "GET") {
      if (url.searchParams.get("probe") === "1") {
        writeJson(res, 200, {
          ok: true,
          platformId: "wecom",
          route: "/webhook/wecom",
          adapterReady: Boolean(adapter),
          accepts: ["GET", "POST"],
          message: adapter ? "企业微信 Webhook 路由可达，适配器已挂载。" : "企业微信 Webhook 路由可达，但适配器尚未挂载。",
        });
        return;
      }
      if (!adapter) { res.writeHead(404); res.end(); return; }
      const echostr = url.searchParams.get("echostr") ?? "";
      const query = Object.fromEntries(url.searchParams);
      if (adapter.verifySignature({ ...query, echostr })) {
        broadcastPlatformStatus("wecom", {
          status: "connected",
          detail: "企业微信回调校验通过。",
          healthScore: 100,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.wecom,
          lastEventAt: Date.now(),
        });
        res.writeHead(200);
        res.end(echostr);
      } else {
        broadcastPlatformStatus("wecom", {
          status: "webhook_unreachable",
          detail: "企业微信回调签名校验失败。",
          errorMsg: "企业微信回调签名校验失败",
          healthScore: 35,
          webhookUrl: PLATFORM_WEBHOOK_PATHS.wecom,
          lastEventAt: Date.now(),
        });
        res.writeHead(403);
        res.end();
      }
      return;
    }
    if (req.method === "POST") {
      if (!adapter) { res.writeHead(404); res.end(); return; }
      let body = "";
      req.on("data", (d) => { body += d; });
      req.on("end", async () => {
        const query = Object.fromEntries(url.searchParams);
        try {
          const result = await adapter.handleWebhookMessage(body, query);
          broadcastPlatformStatus("wecom", {
            status: "connected",
            detail: "已收到企业微信 Webhook 消息。",
            healthScore: 100,
            webhookUrl: PLATFORM_WEBHOOK_PATHS.wecom,
            lastEventAt: Date.now(),
          });
          res.writeHead(200);
          res.end(result);
        } catch {
          broadcastPlatformStatus("wecom", {
            status: "webhook_unreachable",
            detail: "企业微信 Webhook 消息处理失败。",
            errorMsg: "企业微信 Webhook 消息处理失败",
            healthScore: 45,
            webhookUrl: PLATFORM_WEBHOOK_PATHS.wecom,
            lastEventAt: Date.now(),
          });
          res.writeHead(500);
          res.end();
        }
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
  for (const [platformId, config] of Object.entries(settings.platformConfigs ?? {})) {
    ws.send(JSON.stringify({
      type: "platform_status",
      platformId,
      ...config,
    }));
  }

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
        if (msg.platformConfigs) settings.platformConfigs = mergePlatformConfigs(msg.platformConfigs);
        if (msg.userNickname !== undefined) settings.userNickname = msg.userNickname;
        if (msg.semanticMemoryConfig) settings.semanticMemoryConfig = msg.semanticMemoryConfig;
        if (msg.desktopProgramSettings) settings.desktopProgramSettings = msg.desktopProgramSettings;
        if (msg.hermesDispatchSettings) settings.hermesDispatchSettings = normalizeHermesDispatchSettings(msg.hermesDispatchSettings);
        if (msg.runtime) updateClientRuntime(ws, msg.runtime);
        void persistRuntimeSettings();
        void ensureEnabledPlatformsRunning("settings_sync");
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
          settings.platformConfigs = {
            ...settings.platformConfigs,
            [msg.platformId]: {
              ...(settings.platformConfigs?.[msg.platformId] ?? {}),
              enabled: true,
              fields: msg.fields,
            },
          };
          broadcastPlatformStatus(msg.platformId, {
            status: "syncing",
            detail: "正在把连接器配置同步到服务端。",
            healthScore: 60,
            lastSyncedAt: Date.now(),
            webhookUrl: PLATFORM_WEBHOOK_PATHS[msg.platformId] ?? undefined,
            accountLabel: summarizePlatformAccount(msg.platformId, msg.fields),
          });
          startPlatform(msg.platformId, msg.fields, handlePlatformMessage)
            .then(() => {
              const isWebhookPlatform = Boolean(PLATFORM_WEBHOOK_PATHS[msg.platformId]);
              broadcastPlatformStatus(msg.platformId, {
                status: isWebhookPlatform ? "webhook_missing" : "connected",
                detail: isWebhookPlatform
                  ? `连接器已启动，等待公网回调打通 ${PLATFORM_WEBHOOK_PATHS[msg.platformId]}。`
                  : "连接器已启动，可直接接收和发送消息。",
                healthScore: isWebhookPlatform ? 75 : 100,
                lastSyncedAt: Date.now(),
                webhookUrl: PLATFORM_WEBHOOK_PATHS[msg.platformId] ?? undefined,
                accountLabel: summarizePlatformAccount(msg.platformId, msg.fields),
              });
            })
            .catch((err) => {
              const runtimeStatus = classifyPlatformRuntimeStatus(msg.platformId, err);
              broadcastPlatformStatus(msg.platformId, {
                ...runtimeStatus,
                lastSyncedAt: Date.now(),
                webhookUrl: PLATFORM_WEBHOOK_PATHS[msg.platformId] ?? undefined,
                accountLabel: summarizePlatformAccount(msg.platformId, msg.fields),
              });
              ws.send(JSON.stringify({ type: "platform_error", platformId: msg.platformId, error: err.message }));
            });
        } else {
          settings.platformConfigs = {
            ...settings.platformConfigs,
            [msg.platformId]: {
              ...(settings.platformConfigs?.[msg.platformId] ?? {}),
              enabled: false,
              fields: {},
            },
          };
          stopPlatform(msg.platformId);
          broadcastPlatformStatus(msg.platformId, {
            status: "idle",
            detail: "连接器已停用。",
            healthScore: 0,
            lastSyncedAt: Date.now(),
            webhookUrl: PLATFORM_WEBHOOK_PATHS[msg.platformId] ?? undefined,
          });
        }
        break;
      case "channel_session_action":
        if (msg.action === "send_reply") {
          const platformId = String(msg.platformId || "").trim();
          const externalRef = String(msg.externalRef || "").trim();
          const replyText = String(msg.text || "").trim();
          if (!platformId || !externalRef || !replyText) {
            break;
          }

          try {
            const { sentAt } = await sendPlatformMessageWithRetry({
              platformId,
              targetId: externalRef,
              text: replyText,
              trigger: "manual",
              bypassCooldown: true,
              successDetail: msg.retry ? "失败消息已重试并发出。" : "渠道会话回复已发出。",
              failureDetailPrefix: msg.retry ? "重试平台回复失败" : "渠道会话回复失败",
            });
            ws.send(JSON.stringify({
              type: "channel_action_result",
              requestId: String(msg.requestId || ""),
              sessionId: msg.sessionId,
              ok: true,
              message: msg.retry ? "失败消息已重新发出。" : "渠道会话回复已发送。",
            }));
            broadcastChannelEvent({
              sessionId: msg.sessionId,
              session: {
                channel: mapPlatformToChannel(platformId),
                externalRef,
                title: msg.title || `${platformId}:${externalRef}`,
                participantLabel: msg.participantLabel || externalRef,
                remoteUserId: msg.remoteUserId || externalRef,
                accountLabel: msg.accountLabel || summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
                lastMessageDirection: "outbound",
                lastDeliveryStatus: "sent",
                lastMessagePreview: replyText.slice(0, 140),
                unreadCount: 0,
                requiresReply: false,
                status: "active",
                summary: `最近回复已发出：${replyText.slice(0, 80)}`,
                lastMessageAt: sentAt,
                lastOutboundAt: sentAt,
                lastOutboundText: replyText,
                lastHandledAt: sentAt,
                handledBy: "manual",
              },
              title: msg.retry ? "重试平台回复" : "发送平台回复",
              detail: replyText.slice(0, 500),
              status: "sent",
              eventType: "message",
              trigger: "manual",
              externalRef,
            });
          } catch (error) {
            const failedAt = Date.now();
            const failure = resolveOutboundFailurePresentation(error, {
              approvalSummary: "当前平台要求先审批再自动外发",
              cooldownSummary: "连接器冷却中，请稍后重试或回到聊天接管",
              failureSummary: msg.retry ? "重试平台回复失败" : "渠道会话回复失败",
            });
            ws.send(JSON.stringify({
              type: "channel_action_result",
              requestId: String(msg.requestId || ""),
              sessionId: msg.sessionId,
              ok: false,
              message: failure.operationStatus === "blocked"
                ? "当前回复已被治理规则拦截。"
                : msg.retry ? "重试平台回复失败。" : "渠道会话回复失败。",
              failureReason: failure.detail,
            }));
            broadcastChannelEvent({
              sessionId: msg.sessionId,
              session: {
                channel: mapPlatformToChannel(platformId),
                externalRef,
                title: msg.title || `${platformId}:${externalRef}`,
                participantLabel: msg.participantLabel || externalRef,
                remoteUserId: msg.remoteUserId || externalRef,
                accountLabel: msg.accountLabel || summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
                lastMessageDirection: "outbound",
                lastDeliveryStatus: failure.operationStatus === "failed" ? "failed" : "pending",
                lastMessagePreview: replyText.slice(0, 140),
                unreadCount: 0,
                requiresReply: true,
                status: failure.channelStatus,
                summary: failure.summary,
                lastMessageAt: failedAt,
                lastOutboundAt: failedAt,
                lastOutboundText: replyText,
                lastFailedOutboundText: replyText,
                lastDeliveryError: failure.detail,
              },
              title: failure.operationStatus === "blocked"
                ? (msg.retry ? "重试平台回复等待人工" : "发送平台回复已拦截")
                : msg.retry ? "重试平台回复失败" : "发送平台回复失败",
              detail: failure.detail,
              status: failure.operationStatus,
              eventType: failure.eventType,
              trigger: "manual",
              failureReason: failure.failureReason,
              externalRef,
            });
          }
        }
        if (msg.action === "mark_handled") {
          const platformId = String(msg.platformId || "").trim();
          const externalRef = String(msg.externalRef || "").trim();
          const handledAt = Date.now();
          ws.send(JSON.stringify({
            type: "channel_action_result",
            requestId: String(msg.requestId || ""),
            sessionId: msg.sessionId,
            ok: true,
            message: "渠道会话已标记为已处理。",
          }));
          if (platformId && externalRef) {
            broadcastPlatformStatus(platformId, {
              status: "connected",
              detail: "渠道会话已人工标记为已处理。",
              healthScore: 100,
              pendingEvents: 0,
              lastEventAt: handledAt,
              accountLabel: summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
            });
            broadcastChannelEvent({
              sessionId: msg.sessionId,
              session: {
                channel: mapPlatformToChannel(platformId),
                externalRef,
                title: msg.title || `${platformId}:${externalRef}`,
                participantLabel: msg.participantLabel || externalRef,
                remoteUserId: msg.remoteUserId || externalRef,
                accountLabel: msg.accountLabel || summarizePlatformAccount(platformId, settings.platformConfigs?.[platformId]?.fields ?? {}),
                unreadCount: 0,
                requiresReply: false,
                status: "closed",
                summary: "已由人工在渠道看板标记为已处理。",
                lastHandledAt: handledAt,
                handledBy: "manual",
                lastMessageAt: handledAt,
              },
              title: "渠道会话已处理",
              detail: "会话已由人工在 Channels Center 标记为已处理。",
              status: "completed",
              eventType: "message",
              trigger: "manual",
              externalRef,
            });
          }
        }
        break;
      case "dispatch":
        if (msg.instruction?.trim()) {
          const sessionId = msg.sessionId || "default";
          dispatch(
            msg.instruction,
            sessionId,
            msg.executionRunId,
            msg.source || "chat",
            ws,
            msg.userInstruction || msg.instruction,
          ).catch((err) => console.error("[dispatch] error:", err?.message || err));
        }
        break;
      case "cancel_execution":
        if (msg.executionRunId?.trim()) {
          requestExecutionCancellation(
            msg.executionRunId,
            msg.reason || "用户已中止本次生成。",
          );
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

async function startServer() {
  await restoreRuntimeSettings();
  await ensureEnabledPlatformsRunning("restore");
  httpServer.listen(PORT, () => {
    console.log(`[ws-server] listening on ws://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[ws-server] failed to start:", error?.message || error);
  process.exitCode = 1;
});

export function stopServer() {
  for (const ws of clients) {
    try { ws.close(); } catch {}
  }
  try { wss.close(); } catch {}
  try { httpServer.close(); } catch {}
}
