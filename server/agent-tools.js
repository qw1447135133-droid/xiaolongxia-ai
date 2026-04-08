/**
 * Tool Protocol - 移植自 hare/tool.py
 *
 * 定义标准化的工具接口（Tool Protocol），供 Agent 执行引擎使用。
 * 浏览器工具（browser_*）仅对 orchestrator 开放。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { getBrowser, getPage } from "./browser-manager.js";
import { actDesktopCdpApp, openDesktopCdpApp, snapshotDesktopCdpApp } from "./cdp-app-manager.js";
import { requestDesktopInputControl, requestDesktopInstalledApplications, requestDesktopLaunch, requestDesktopScreenshot } from "./desktop-bridge.js";
import { exportExcelDocument, exportPresentationDocument, exportWordDocument } from "./document-exporter.js";

// ---------------------------------------------------------------------------
// ToolBase - 对应 Python ToolBase 基类
// ---------------------------------------------------------------------------

export class ToolBase {
  name = "";
  aliases = [];
  searchHint = "";
  maxResultSizeChars = 10_000;

  /** JSON Schema 定义工具输入参数 */
  inputSchema() {
    return { type: "object", properties: {}, required: [] };
  }

  /** 工具是否启用 */
  isEnabled() {
    return true;
  }

  /** 是否为只读操作 */
  isReadOnly(input) {
    return false;
  }

  /** 权限检查，返回 { behavior: "allow" | "deny", reason? } */
  async checkPermissions(input, context) {
    return { behavior: "allow" };
  }

  /** 执行工具，返回 { data: string | object } */
  async call(args, context) {
    return { data: "(not implemented)" };
  }

  /** 构建传给 Anthropic API 的工具参数 */
  toToolParam() {
    return {
      name: this.name,
      description: this.searchHint,
      input_schema: this.inputSchema(),
    };
  }

  /**
   * 将工具执行结果转换为 Anthropic tool_result 内容块
   * 对应 Python map_tool_result_to_tool_result_block_param()
   */
  makeToolResultBlock(toolUseId, data) {
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    // 截断防止超限
    const truncated = content.length > this.maxResultSizeChars
      ? content.slice(0, this.maxResultSizeChars) + "\n...(truncated)"
      : content;
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: truncated,
    };
  }
}

function buildDesktopSearchAliases(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return [];

  const aliases = new Set([normalized]);
  const synonymGroups = [
    ["wechat", "weixin", "微信"],
    ["feishu", "lark", "飞书"],
    ["dingtalk", "dingtalk", "钉钉"],
    ["qq", "tencent qq"],
    ["wecom", "企业微信", "wxwork"],
    ["vscode", "vs code", "visual studio code", "code.exe"],
    ["chrome", "google chrome", "chrome.exe"],
    ["edge", "microsoft edge", "msedge.exe"],
    ["firefox", "mozilla firefox", "firefox.exe"],
    ["browser", "浏览器"],
    ["notepad", "notepad.exe", "记事本"],
  ];

  for (const group of synonymGroups) {
    if (group.some(item => item.toLowerCase() === normalized)) {
      for (const alias of group) {
        aliases.add(alias.toLowerCase());
      }
    }
  }

  return [...aliases];
}

const EXTERNAL_BROWSER_PROFILES = [
  {
    id: "chrome",
    label: "Chrome",
    aliases: buildDesktopSearchAliases("chrome"),
    knownRelativePaths: [
      ["Google", "Chrome", "Application", "chrome.exe"],
    ],
  },
  {
    id: "edge",
    label: "Edge",
    aliases: buildDesktopSearchAliases("edge"),
    knownRelativePaths: [
      ["Microsoft", "Edge", "Application", "msedge.exe"],
    ],
  },
  {
    id: "firefox",
    label: "Firefox",
    aliases: buildDesktopSearchAliases("firefox"),
    knownRelativePaths: [
      ["Mozilla Firefox", "firefox.exe"],
    ],
  },
];

function normalizeExternalBrowserPreference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") return "auto";
  if (["default", "system", "system-default", "system_browser", "default-browser", "系统", "系统默认", "默认浏览器"].includes(normalized)) {
    return "default";
  }
  if (["chrome", "google chrome", "chrome.exe"].includes(normalized)) return "chrome";
  if (["edge", "microsoft edge", "msedge.exe"].includes(normalized)) return "edge";
  if (["firefox", "mozilla firefox", "firefox.exe"].includes(normalized)) return "firefox";
  return "auto";
}

function normalizeExternalBrowserUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/iu.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

function getExternalBrowserProfiles(preference = "auto") {
  if (preference === "default") return [];
  if (preference === "chrome" || preference === "edge" || preference === "firefox") {
    return EXTERNAL_BROWSER_PROFILES.filter(profile => profile.id === preference);
  }
  return EXTERNAL_BROWSER_PROFILES;
}

function buildInstalledAppHaystack(item) {
  return [
    item?.name,
    item?.target,
    item?.location,
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
    .join(" ");
}

function findInstalledBrowserCandidate(installedApps, preference = "auto") {
  const profiles = getExternalBrowserProfiles(preference);
  for (const profile of profiles) {
    const matchedApp = installedApps.find(item => profile.aliases.some(alias => buildInstalledAppHaystack(item).includes(alias)));
    if (matchedApp) {
      return {
        profile,
        target: matchedApp.target,
        matchedAppName: matchedApp.name,
        resolution: "installed-app",
        source: matchedApp.source,
      };
    }
  }
  return null;
}

function findKnownBrowserPath(preference = "auto") {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean);

  const profiles = getExternalBrowserProfiles(preference);
  for (const profile of profiles) {
    for (const root of roots) {
      for (const relativeParts of profile.knownRelativePaths) {
        const absolutePath = join(root, ...relativeParts);
        if (existsSync(absolutePath)) {
          return {
            profile,
            target: absolutePath,
            matchedAppName: profile.label,
            resolution: "known-path",
            source: "filesystem",
          };
        }
      }
    }
  }
  return null;
}

function isExplicitExternalBrowserRequest(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  return [
    /^(?:请)?(?:帮我)?(?:麻烦)?(?:打开|启动|开启|唤起)(?:一下)?(?:外部|系统|真实)?(?:浏览器|chrome|google chrome|edge|msedge|firefox)/i,
    /(?:用|使用|在)(?:外部|系统|真实)?(?:浏览器|chrome|google chrome|edge|msedge|firefox).{0,12}(?:打开|访问|启动)/i,
    /\b(?:open|launch|start)\b.{0,18}\b(?:browser|chrome|edge|firefox)\b/i,
    /\b(?:browser|chrome|edge|firefox)\b.{0,18}\b(?:open|launch|start)\b/i,
    /(?:打开|访问|进入|前往|跳转到|去到|go to|visit|open).{0,24}(?:网页|页面|网站|网址|链接|url|官网|web\s*site|website|site|page|link)\b/i,
    /(?:打开|访问|进入|前往|跳转到|去到|go to|visit|open).{0,32}(?:https?:\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?)/i,
  ].some((pattern) => pattern.test(normalized));
}

function isResearchDeliveryIntent(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  const hasResearchIntent = /(?:查询|查一下|搜索|搜集|搜一下|检索|research|search|lookup|find|新闻|资讯|資料|资料|总结|總結|报告|報告|写一份|写个|撰写|整理)/i.test(normalized);
  const hasLocalDeliveryIntent = /(?:word|docx|文档|文件|报告|報告|总结|總結|保存|导出|輸出|发送|發送|发到|桌面|desktop|本地|附件)/i.test(normalized);
  return hasResearchIntent && hasLocalDeliveryIntent;
}

function isBrowserLaunchTarget(target, args = []) {
  const normalizedTarget = String(target || "").trim().toLowerCase();
  const normalizedArgs = Array.isArray(args)
    ? args.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const browserPatterns = [
    /\b(?:chrome|google chrome|chrome\.exe)\b/i,
    /\b(?:edge|msedge|microsoft edge|msedge\.exe)\b/i,
    /\b(?:firefox|firefox\.exe)\b/i,
    /\b(?:browser|浏览器|瀏覽器)\b/i,
  ];

  if (browserPatterns.some((pattern) => pattern.test(normalizedTarget))) {
    return true;
  }

  return normalizedArgs.some((value) => browserPatterns.some((pattern) => pattern.test(value)));
}

function isWordProcessorLaunchTarget(target, args = []) {
  const normalizedTarget = String(target || "").trim().toLowerCase();
  const normalizedArgs = Array.isArray(args)
    ? args.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const wordPatterns = [
    /\b(?:winword|winword\.exe)\b/i,
    /\b(?:microsoft word)\b/i,
    /(?:^|[^a-z])word(?:[^a-z]|$)/i,
    /(?:文档|文書|文字處理|文字处理)/i,
  ];

  if (wordPatterns.some((pattern) => pattern.test(normalizedTarget))) {
    return true;
  }

  return normalizedArgs.some((value) => wordPatterns.some((pattern) => pattern.test(value)));
}

function isExplicitWordAppRequest(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  return [
    /(?:打开|啟動|启动|开启|開啟|唤起).{0,12}(?:word|microsoft word|winword|微软 word|微軟 word)/i,
    /\b(?:open|launch|start)\b.{0,18}\b(?:word|microsoft word|winword)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function isSpreadsheetAppLaunchTarget(target, args = []) {
  const normalizedTarget = String(target || "").trim().toLowerCase();
  const normalizedArgs = Array.isArray(args)
    ? args.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const patterns = [
    /\b(?:excel|excel\.exe)\b/i,
    /\b(?:microsoft excel)\b/i,
    /\b(?:xlsx|xlsm|xls|csv|tsv)\b/i,
    /(?:表格|試算表|试算表|電子表格|电子表格)/i,
  ];

  if (patterns.some((pattern) => pattern.test(normalizedTarget))) {
    return true;
  }

  return normalizedArgs.some((value) => patterns.some((pattern) => pattern.test(value)));
}

function isExplicitSpreadsheetAppRequest(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  return [
    /(?:打开|啟動|启动|开启|開啟|唤起).{0,12}(?:excel|microsoft excel)/i,
    /\b(?:open|launch|start)\b.{0,18}\b(?:excel|microsoft excel)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function isPresentationAppLaunchTarget(target, args = []) {
  const normalizedTarget = String(target || "").trim().toLowerCase();
  const normalizedArgs = Array.isArray(args)
    ? args.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const patterns = [
    /\b(?:powerpoint|powerpnt|powerpoint\.exe|powerpnt\.exe)\b/i,
    /\b(?:microsoft powerpoint)\b/i,
    /\b(?:pptx|ppt)\b/i,
    /(?:演示|簡報|简报|投影片|幻灯片|幻燈片|presentation|slides)/i,
  ];

  if (patterns.some((pattern) => pattern.test(normalizedTarget))) {
    return true;
  }

  return normalizedArgs.some((value) => patterns.some((pattern) => pattern.test(value)));
}

function isExplicitPresentationAppRequest(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;

  return [
    /(?:打开|啟動|启动|开启|開啟|唤起).{0,14}(?:powerpoint|ppt|microsoft powerpoint)/i,
    /\b(?:open|launch|start)\b.{0,18}\b(?:powerpoint|ppt|microsoft powerpoint)\b/i,
  ].some((pattern) => pattern.test(normalized));
}

// ---------------------------------------------------------------------------
// 浏览器工具 - 仅 orchestrator 可用
// ---------------------------------------------------------------------------

class BrowserGotoTool extends ToolBase {
  name = "browser_goto";
  searchHint = "导航浏览器到指定 URL。参数：url（必填），waitUntil（可选：load/domcontentloaded/networkidle）";

  inputSchema() {
    return {
      type: "object",
      properties: {
        url: { type: "string", description: "要导航到的完整 URL，如 https://www.baidu.com" },
        waitUntil: { type: "string", enum: ["load", "domcontentloaded", "networkidle"], description: "等待条件，默认 load" },
      },
      required: ["url"],
    };
  }

  async call({ url, waitUntil = "load" }) {
    const page = await getPage();
    await page.goto(url, { waitUntil });
    const title = await page.title();
    const currentUrl = page.url();
    // 自动提取页面文字，让 Agent 直接看到内容
    let pageText = "";
    try {
      pageText = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000));
    } catch {}
    return { data: JSON.stringify({ success: true, url: currentUrl, title, pageText }) };
  }
}

class BrowserPageInfoTool extends ToolBase {
  name = "browser_page_info";
  searchHint = "获取当前浏览器页面的 URL 和标题";

  inputSchema() {
    return { type: "object", properties: {}, required: [] };
  }

  async call() {
    const page = await getPage();
    return { data: JSON.stringify({ url: page.url(), title: await page.title() }) };
  }
}

class BrowserScreenshotTool extends ToolBase {
  name = "browser_screenshot";
  searchHint = "截取当前浏览器页面截图，返回图片供识图分析。支持全页或仅视口截图";
  maxResultSizeChars = 600_000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        fullPage: { type: "boolean", description: "是否截取整页（默认 false，仅截取当前视口）" },
      },
      required: [],
    };
  }

  async call({ fullPage = false }) {
    const page = await getPage();
    const buffer = await page.screenshot({ fullPage, type: "png" });
    const base64 = buffer.toString("base64");
    return { data: base64 };
  }

  makeToolResultBlock(toolUseId, data) {
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: [
        { type: "text", text: "截图完成，图片如下：" },
        { type: "image", source: { type: "base64", media_type: "image/png", data } },
      ],
    };
  }
}

class BrowserListImagesTool extends ToolBase {
  name = "browser_list_images";
  searchHint = "提取当前网页可直接引用的图片资源列表，适合为新闻截图、财报配图、图表图片、页面证据图寻找可展示的公开图片 URL";
  maxResultSizeChars = 8000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        limit: { type: "number", description: "最多返回多少张图片，默认 8" },
        minWidth: { type: "number", description: "最小宽度过滤，默认 160" },
      },
      required: [],
    };
  }

  async call({ limit = 8, minWidth = 160 } = {}) {
    const page = await getPage();
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 12);
    const safeMinWidth = Math.max(Number(minWidth) || 160, 0);

    const payload = await page.evaluate(({ safeLimit: innerLimit, safeMinWidth: innerMinWidth }) => {
      const seen = new Set();
      const candidates = [];

      const pushCandidate = (candidate) => {
        if (!candidate?.url || seen.has(candidate.url)) return;
        seen.add(candidate.url);
        candidates.push(candidate);
      };

      const normalizeUrl = (value) => {
        if (!value || typeof value !== "string") return "";
        try {
          return new URL(value, window.location.href).href;
        } catch {
          return "";
        }
      };

      const metaImage = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]');
      if (metaImage instanceof HTMLMetaElement) {
        const url = normalizeUrl(metaImage.content);
        if (url && !url.startsWith("data:")) {
          pushCandidate({
            url,
            alt: "meta image",
            width: 0,
            height: 0,
            source: "meta",
          });
        }
      }

      Array.from(document.images)
        .map((img) => ({
          url: normalizeUrl(img.currentSrc || img.src),
          alt: (img.alt || img.getAttribute("aria-label") || img.getAttribute("title") || "").trim(),
          width: Number(img.naturalWidth || img.width || 0),
          height: Number(img.naturalHeight || img.height || 0),
          source: "img",
        }))
        .filter((item) => item.url && !item.url.startsWith("data:") && item.width >= innerMinWidth)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height))
        .slice(0, innerLimit)
        .forEach(pushCandidate);

      return {
        pageUrl: window.location.href,
        title: document.title,
        images: candidates.slice(0, innerLimit),
      };
    }, { safeLimit, safeMinWidth });

    return { data: JSON.stringify(payload) };
  }
}

class BrowserActTool extends ToolBase {
  name = "browser_act";
  searchHint = "用自然语言执行浏览器操作，如点击按钮、填写表单、滚动页面等。示例：'点击搜索按钮'、'在搜索框输入 iPhone 15'";

  inputSchema() {
    return {
      type: "object",
      properties: {
        instruction: { type: "string", description: "单步操作指令，如：点击登录按钮、在输入框填写 test@example.com、向下滚动" },
      },
      required: ["instruction"],
    };
  }

  async call({ instruction }) {
    const sh = await getBrowser();
    await sh.act(instruction);
    return { data: JSON.stringify({ success: true, action: instruction }) };
  }
}

class BrowserActSingleTool extends ToolBase {
  name = "browser_act_single";
  searchHint = "用 CSS/XPath 选择器精确执行单个浏览器动作（不走 LLM，更快更省 token）";

  inputSchema() {
    return {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS 或 XPath 选择器，如 #search-btn 或 //button[@type='submit']" },
        method: { type: "string", description: "操作方法：click / fill / type / select / press" },
        arguments: { type: "array", items: { type: "string" }, description: "方法参数，如 fill 的文本内容" },
        description: { type: "string", description: "操作描述（可选）" },
      },
      required: ["selector", "method", "arguments"],
    };
  }

  async call({ selector, method, arguments: args, description = "" }) {
    const sh = await getBrowser();
    await sh.act({ selector, method, arguments: args, description });
    return { data: JSON.stringify({ success: true, selector, method }) };
  }
}

class BrowserActMultiTool extends ToolBase {
  name = "browser_act_multi";
  searchHint = "批量顺序执行多个浏览器动作（遇错停止）。适合表单填写、多步操作等场景";

  inputSchema() {
    return {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              selector: { type: "string" },
              method: { type: "string" },
              arguments: { type: "array", items: { type: "string" } },
              description: { type: "string" },
            },
            required: ["selector", "method", "arguments"],
          },
          description: "要顺序执行的动作列表",
        },
      },
      required: ["actions"],
    };
  }

  async call({ actions }) {
    const sh = await getBrowser();
    const results = [];
    for (const action of actions) {
      try {
        await sh.act(action);
        results.push({ selector: action.selector, method: action.method, success: true });
      } catch (err) {
        results.push({ selector: action.selector, method: action.method, success: false, error: err?.message });
        break;
      }
    }
    const successCount = results.filter((r) => r.success).length;
    return { data: JSON.stringify({ total: actions.length, success: successCount, results }) };
  }
}

class BrowserGetTextTool extends ToolBase {
  name = "browser_get_text";
  searchHint = "获取当前页面的可见文字内容（最多 3000 字），用于提取价格、标题、列表等文本信息，比截图更快更省 token";
  maxResultSizeChars = 6000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS 选择器，只提取该元素内的文字（可选，默认提取整页 body）" },
      },
      required: [],
    };
  }

  async call({ selector = "body" } = {}) {
    const page = await getPage();
    try {
      const text = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? (el.innerText || el.textContent || "") : document.body.innerText || "";
      }, selector);
      const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 3000);
      return { data: JSON.stringify({ url: page.url(), text: trimmed }) };
    } catch {
      const text = await page.evaluate(() => document.body.innerText || "");
      return { data: JSON.stringify({ url: page.url(), text: text.replace(/\s+/g, " ").trim().slice(0, 3000) }) };
    }
  }
}

class DesktopLaunchNativeApplicationTool extends ToolBase {
  name = "desktop_launch_native_application";
  searchHint = "在 Electron 桌面运行态启动本机程序。适用于打开微信、飞书、VS Code、资源管理器或指定 exe/快捷方式。若目标其实是打开真实外部浏览器，只能在用户明确要求打开浏览器/网站/链接/URL 时使用；纯网页搜索、资料整理、写 Word/报告并保存本地时，不应用它启动 Chrome/Edge/Firefox。仅负责启动程序，不支持鼠标键盘模拟。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "程序名、可执行文件路径、快捷方式或系统命令，例如 WeChat.exe、Feishu.exe、chrome.exe" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "启动参数列表，可选。",
        },
        cwd: { type: "string", description: "工作目录，可选。" },
        reason: { type: "string", description: "启动这个程序的原因，便于记录和自我约束，可选。" },
      },
      required: ["target"],
    };
  }

  async checkPermissions({ target, args = [] } = {}, context = {}) {
    const userInstruction = String(context.userInstruction || "").trim();

    if (isWordProcessorLaunchTarget(target, args)) {
      if (isExplicitWordAppRequest(userInstruction)) {
        return { behavior: "allow" };
      }

      if (isResearchDeliveryIntent(userInstruction)) {
        return { behavior: "deny", reason: "这是生成本地 Word 文档的任务，应直接使用 document_write_docx 导出文件，而不是启动 Word 程序。" };
      }

      return { behavior: "deny", reason: "当前并非明确的“打开 Word 程序”指令。若目标是交付文档，请优先使用 document_write_docx。" };
    }

    if (isSpreadsheetAppLaunchTarget(target, args)) {
      if (isExplicitSpreadsheetAppRequest(userInstruction)) {
        return { behavior: "allow" };
      }

      if (isResearchDeliveryIntent(userInstruction)) {
        return { behavior: "deny", reason: "这是生成本地 Excel 文件的任务，应直接使用 document_write_xlsx 导出文件，而不是启动 Excel 程序。" };
      }

      return { behavior: "deny", reason: "当前并非明确的“打开 Excel 程序”指令。若目标是交付表格，请优先使用 document_write_xlsx。" };
    }

    if (isPresentationAppLaunchTarget(target, args)) {
      if (isExplicitPresentationAppRequest(userInstruction)) {
        return { behavior: "allow" };
      }

      if (isResearchDeliveryIntent(userInstruction)) {
        return { behavior: "deny", reason: "这是生成本地 PPT 文件的任务，应直接使用 document_write_pptx 导出文件，而不是启动 PowerPoint 程序。" };
      }

      return { behavior: "deny", reason: "当前并非明确的“打开 PowerPoint 程序”指令。若目标是交付简报，请优先使用 document_write_pptx。" };
    }

    if (!isBrowserLaunchTarget(target, args)) {
      return { behavior: "allow" };
    }

    if (!userInstruction) {
      return { behavior: "deny", reason: "缺少用户明确的浏览器打开指令，不能通过通用程序启动工具拉起外部浏览器。" };
    }

    if (isExplicitExternalBrowserRequest(userInstruction)) {
      return { behavior: "allow" };
    }

    if (isResearchDeliveryIntent(userInstruction)) {
      return { behavior: "deny", reason: "这是检索后生成本地文档的任务，应先用内置 browser_* 查资料，再写文件，不应通过本机程序工具启动外部浏览器。" };
    }

    return { behavior: "deny", reason: "用户并未明确要求打开外部浏览器；不能通过通用程序启动工具绕过内置 browser_* 的默认检索路径。" };
  }

  async call({ target, args = [], cwd, reason }, context = {}) {
    const result = await requestDesktopLaunch({
      target,
      args,
      ...(cwd ? { cwd } : {}),
      ...(reason ? { reason } : {}),
    }, {
      preferredWs: context.desktopClientWs,
    });

    return {
      data: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  }
}

class DocumentWriteDocxTool extends ToolBase {
  name = "document_write_docx";
  searchHint = "直接生成 Word 文档（.docx）并保存到桌面、文档、下载或临时目录。适用于报告、总结、纪要、方案、文案初稿等本地交付任务。除非用户明确要求打开 Microsoft Word 程序，否则写 Word 文档时应优先使用这个工具，而不是启动桌面版 Word。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        title: { type: "string", description: "文档标题。" },
        summary: { type: "string", description: "可选的摘要内容。" },
        content: { type: "string", description: "正文内容，支持普通段落、Markdown 风格标题（# / ## / ###）和无序列表（- 项目）。" },
        sections: {
          type: "array",
          description: "可选的结构化章节列表。若已提供 content，可不填。",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "章节标题。" },
              body: { type: "string", description: "章节正文。" },
            },
            required: ["heading", "body"],
          },
        },
        fileName: { type: "string", description: "可选。导出的文件名，不含扩展名也可以。" },
        outputDir: {
          type: "string",
          enum: ["desktop", "documents", "downloads", "temp"],
          description: "导出目录，默认 desktop。",
        },
      },
      required: ["title"],
    };
  }

  async call(args = {}) {
    const result = await exportWordDocument(args);
    return {
      data: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  }
}

class DocumentWriteXlsxTool extends ToolBase {
  name = "document_write_xlsx";
  searchHint = "直接生成 Excel 文件（.xlsx）并保存到桌面、文档、下载或临时目录。适用于表格、清单、数据汇总、对比表、计划排期、客户名单等本地交付任务。除非用户明确要求打开 Microsoft Excel 程序，否则生成表格时应优先使用这个工具。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        title: { type: "string", description: "Excel 文件标题。" },
        summary: { type: "string", description: "可选的文件摘要或工作表顶部说明。" },
        sheets: {
          type: "array",
          description: "工作表列表。",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "工作表名称。" },
              notes: { type: "string", description: "工作表顶部说明，可选。" },
              columns: {
                type: "array",
                items: { type: "string" },
                description: "表格列名，可选。",
              },
              rows: {
                type: "array",
                description: "表格数据，推荐对象数组。",
                items: {
                  anyOf: [
                    { type: "object" },
                    { type: "array", items: { type: ["string", "number", "boolean", "null"] } },
                  ],
                },
              },
            },
            required: ["name"],
          },
        },
        fileName: { type: "string", description: "可选。导出的文件名。" },
        outputDir: {
          type: "string",
          enum: ["desktop", "documents", "downloads", "temp"],
          description: "导出目录，默认 desktop。",
        },
      },
      required: ["title", "sheets"],
    };
  }

  async call(args = {}) {
    const result = await exportExcelDocument(args);
    return {
      data: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  }
}

class DocumentWritePptxTool extends ToolBase {
  name = "document_write_pptx";
  searchHint = "直接生成 PPT 文件（.pptx）并保存到桌面、文档、下载或临时目录。适用于汇报、方案、提案、复盘、演示稿、讲稿等本地交付任务。除非用户明确要求打开 Microsoft PowerPoint 程序，否则生成简报时应优先使用这个工具。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        title: { type: "string", description: "PPT 主标题。" },
        subtitle: { type: "string", description: "可选副标题。" },
        slides: {
          type: "array",
          description: "幻灯片列表。",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "单页标题。" },
              body: { type: "string", description: "单页正文概述，可选。" },
              bullets: {
                type: "array",
                items: { type: "string" },
                description: "要点列表，可选。",
              },
              note: { type: "string", description: "页脚提示或备注，可选。" },
              accent: { type: "string", description: "可选强调色，例如 0F766E。" },
            },
            required: ["title"],
          },
        },
        fileName: { type: "string", description: "可选。导出的文件名。" },
        outputDir: {
          type: "string",
          enum: ["desktop", "documents", "downloads", "temp"],
          description: "导出目录，默认 desktop。",
        },
      },
      required: ["title", "slides"],
    };
  }

  async call(args = {}) {
    const result = await exportPresentationDocument(args);
    return {
      data: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  }
}

class DesktopOpenExternalBrowserTool extends ToolBase {
  name = "desktop_open_external_browser";
  searchHint = "打开真实外部浏览器（Chrome / Edge / Firefox / 系统默认浏览器）。只有当用户明确要求打开浏览器，或明确要求打开/访问某个网站、链接、URL 时才应使用；纯网页搜索、资料查找、页面读取、新闻整理、写 Word/报告/总结并保存到桌面等任务，仍必须优先使用内置 browser_* 工具。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        browser: {
          type: "string",
          enum: ["auto", "default", "chrome", "edge", "firefox"],
          description: "希望打开的浏览器类型。auto 表示优先 Chrome，再尝试 Edge、Firefox；default 表示系统默认浏览器。",
        },
        url: {
          type: "string",
          description: "可选。若提供则在外部浏览器中打开该网址，例如 https://chatgpt.com 或 www.baidu.com。",
        },
        reason: {
          type: "string",
          description: "打开真实外部浏览器的原因，便于审计记录。",
        },
        forceRefresh: {
          type: "boolean",
          description: "是否强制刷新一次已安装程序扫描结果。",
        },
      },
      required: [],
    };
  }

  async checkPermissions(_input, context = {}) {
    const userInstruction = String(context.userInstruction || "").trim();
    if (!userInstruction) {
      return { behavior: "deny", reason: "缺少用户明确的浏览器打开指令，默认应使用内置 browser_* 工具。" };
    }

    if (isExplicitExternalBrowserRequest(userInstruction)) {
      return { behavior: "allow" };
    }

    if (isResearchDeliveryIntent(userInstruction)) {
      return { behavior: "deny", reason: "这是检索后生成本地文档的任务，应先用内置 browser_* 查资料，再写文件，不应启动外部浏览器。" };
    }

    return { behavior: "deny", reason: "用户并未明确要求打开外部浏览器；默认应使用内置 browser_* 工具完成网页检索。" };
  }

  async call({ browser = "auto", url = "", reason, forceRefresh = false } = {}, context = {}) {
    const normalizedBrowser = normalizeExternalBrowserPreference(browser);
    const normalizedUrl = normalizeExternalBrowserUrl(url);
    let installedApps = [];
    try {
      if (normalizedBrowser !== "default") {
        installedApps = await requestDesktopInstalledApplications({ forceRefresh }, {
          preferredWs: context.desktopClientWs,
        });
      }
    } catch {
      installedApps = [];
    }

    const installedCandidate = findInstalledBrowserCandidate(installedApps, normalizedBrowser);
    const resolvedCandidate = installedCandidate || findKnownBrowserPath(normalizedBrowser);

    if (resolvedCandidate) {
      const launchResult = await requestDesktopLaunch({
        target: resolvedCandidate.target,
        args: normalizedUrl ? [normalizedUrl] : [],
        ...(reason ? { reason } : {
          reason: normalizedUrl
            ? `用户明确要求使用真实外部浏览器打开 ${normalizedUrl}`
            : "用户明确要求打开真实外部浏览器",
        }),
      }, {
        preferredWs: context.desktopClientWs,
      });

      return {
        data: JSON.stringify({
          success: true,
          browser: resolvedCandidate.profile.id,
          browserLabel: resolvedCandidate.profile.label,
          target: resolvedCandidate.target,
          matchedAppName: resolvedCandidate.matchedAppName,
          resolution: resolvedCandidate.resolution,
          source: resolvedCandidate.source,
          url: normalizedUrl || null,
          launch: launchResult,
        }),
      };
    }

    if (normalizedBrowser === "default" && normalizedUrl) {
      const launchResult = await requestDesktopLaunch({
        target: normalizedUrl,
        ...(reason ? { reason } : { reason: `用户明确要求使用系统默认浏览器打开 ${normalizedUrl}` }),
      }, {
        preferredWs: context.desktopClientWs,
      });

      return {
        data: JSON.stringify({
          success: true,
          browser: "default",
          browserLabel: "系统默认浏览器",
          target: normalizedUrl,
          matchedAppName: "系统默认浏览器",
          resolution: "shell-url",
          source: "shell",
          url: normalizedUrl,
          launch: launchResult,
        }),
      };
    }

    const browserLabelMap = {
      auto: "Chrome / Edge / Firefox",
      default: "系统默认浏览器",
      chrome: "Chrome",
      edge: "Edge",
      firefox: "Firefox",
    };

    throw new Error(
      normalizedBrowser === "default"
        ? "未能确定系统默认浏览器。若需要使用默认浏览器，请同时提供要打开的 URL。"
        : `未找到可启动的 ${browserLabelMap[normalizedBrowser] || "外部浏览器"}。请先确认桌面端已安装浏览器，或把浏览器加入本机程序白名单。`,
    );
  }
}

class DesktopListInstalledApplicationsTool extends ToolBase {
  name = "desktop_list_installed_applications";
  searchHint = "读取当前 Electron 桌面客户端已安装/可启动的本机程序列表。适合先查找微信、飞书、Chrome、VS Code 等程序名，再把返回的 target 交给 desktop_launch_native_application。";
  maxResultSizeChars = 20_000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "按程序名、目标路径或安装位置过滤，可选。",
        },
        source: {
          type: "string",
          enum: ["all", "registry", "start-menu"],
          description: "扫描来源过滤，默认 all。",
        },
        limit: {
          type: "number",
          description: "最多返回多少项，默认 20，最大 50。",
        },
        forceRefresh: {
          type: "boolean",
          description: "是否强制重新扫描本机程序，而不是使用最近缓存。",
        },
      },
      required: [],
    };
  }

  isReadOnly() {
    return true;
  }

  async call({ query = "", source = "all", limit = 20, forceRefresh = false }, context = {}) {
    const installedApps = await requestDesktopInstalledApplications({ forceRefresh }, {
      preferredWs: context.desktopClientWs,
    });
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const queryAliases = buildDesktopSearchAliases(query);
    const normalizedSource = source === "registry" || source === "start-menu" ? source : "all";
    const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 20));

    const filtered = installedApps.filter((item) => {
      if (normalizedSource !== "all" && item.source !== normalizedSource) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        item.name,
        item.target,
        item.location,
      ]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());

      return queryAliases.some(alias => haystack.some(value => value.includes(alias)));
    });

    return {
      data: JSON.stringify({
        success: true,
        query: normalizedQuery || null,
        source: normalizedSource,
        totalScanned: installedApps.length,
        totalMatched: filtered.length,
        items: filtered.slice(0, normalizedLimit).map(item => ({
          id: item.id,
          name: item.name,
          target: item.target,
          source: item.source,
          ...(item.location ? { location: item.location } : {}),
        })),
      }),
    };
  }
}

class DesktopControlInputTool extends ToolBase {
  name = "desktop_control_input";
  searchHint = "在 Electron 桌面运行态模拟鼠标和键盘输入，适合桌面端应用、系统弹窗或无 API 的 UI 场景。若是基于 desktop_capture_screenshot 的截图做点击，请使用同一张图的像素坐标，左上角为 (0,0)。点击/双击/右键后若截图验证仍未成功，应优先参考工具返回的 retrySuggestions 做一次附近偏移重试，再决定是否转人工接管。若任务涉及验证码、人机验证、OTP/2FA，不要尝试自动绕过，应切换到人工接管。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["move", "click", "double_click", "right_click", "scroll", "type", "key", "hotkey", "wait"],
          description: "要执行的桌面输入动作。",
        },
        target: { type: "string", description: "目标程序或界面描述，可选。" },
        intent: { type: "string", description: "当前动作的目的说明，可选。" },
        x: { type: "number", description: "鼠标目标横坐标，move/click 类动作使用。" },
        y: { type: "number", description: "鼠标目标纵坐标，move/click 类动作使用。" },
        deltaY: { type: "number", description: "滚轮增量，scroll 动作使用。" },
        text: { type: "string", description: "要输入的文本，type 动作使用。" },
        key: { type: "string", description: "单个按键名称，key 动作使用，例如 Enter、Tab、Esc、a。" },
        keys: {
          type: "array",
          items: { type: "string" },
          description: "组合键列表，hotkey 动作使用，例如 ['Ctrl', 'L']。",
        },
        durationMs: { type: "number", description: "动作后等待多久，默认约 120ms。" },
        riskCategory: {
          type: "string",
          enum: ["normal", "verification"],
          description: "如果是验证码/验证场景，请标记为 verification，以触发人工接管。",
        },
      },
      required: ["action"],
    };
  }

  async call(args = {}, context = {}) {
    const result = await requestDesktopInputControl(args, {
      preferredWs: context.desktopClientWs,
      executionRunId: context.executionRunId,
      taskId: context.taskId,
      sessionId: context.sessionId,
    });

    return {
      data: JSON.stringify({
        success: true,
        ...result,
      }),
    };
  }

  makeToolResultBlock(toolUseId, data) {
    let parsed = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") {
      return super.makeToolResultBlock(toolUseId, data);
    }

    const nextHint = parsed.manualRequired
      ? "当前已转人工接管，不要继续自动点击。"
      : "如果这是视觉定位任务，下一步建议再次调用 desktop_capture_screenshot 验证界面是否达到预期。";
    const retrySuggestionText = Array.isArray(parsed.retrySuggestions) && parsed.retrySuggestions.length > 0
      ? ` 如首次验证失败，可优先尝试这些偏移点之一：${parsed.retrySuggestions
          .slice(0, 4)
          .map(item => `${item.label} (${item.nextX}, ${item.nextY})`)
          .join(" / ")}。`
      : "";

    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: [
        {
          type: "text",
          text:
            `${parsed.message || "桌面输入动作已执行。"}`
            + `${parsed.cursor ? ` 当前光标约在 (${parsed.cursor.x}, ${parsed.cursor.y})。` : ""}`
            + retrySuggestionText
            + ` ${nextHint}`,
        },
      ],
    };
  }
}

class DesktopCaptureScreenshotTool extends ToolBase {
  name = "desktop_capture_screenshot";
  searchHint = "抓取当前 Electron 桌面客户端的桌面截图，返回图片供识图分析。适合在桌面端应用、系统弹窗或无法直接通过代码确认界面状态时先观察当前桌面。拿到截图后，可按图片像素坐标继续调用 desktop_control_input 完成点击/输入。";
  maxResultSizeChars = 800_000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        target: { type: "string", description: "当前截图关注的程序或界面，可选。" },
        intent: { type: "string", description: "截图用途说明，可选。" },
        maxWidth: { type: "number", description: "输出最大宽度；为保证点击坐标准确，默认保留原始桌面宽度，仅在需要压缩图片时再传。" },
        quality: { type: "number", description: "JPEG 质量 45-90，默认 72。" },
      },
      required: [],
    };
  }

  async call(args = {}, context = {}) {
    const result = await requestDesktopScreenshot(args, {
      preferredWs: context.desktopClientWs,
    });

    return {
      data: JSON.stringify({
        ...result,
        ...(args.target ? { target: args.target } : {}),
        ...(args.intent ? { intent: args.intent } : {}),
      }),
    };
  }

  makeToolResultBlock(toolUseId, data) {
    let parsed = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      parsed = null;
    }

    if (!parsed?.dataUrl || typeof parsed.dataUrl !== "string" || !parsed.dataUrl.startsWith("data:image/")) {
      return super.makeToolResultBlock(toolUseId, data);
    }

    const [, mediaType = "image/jpeg", base64Data = ""] = parsed.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/) || [];
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: [
        {
          type: "text",
          text:
            `桌面截图完成，尺寸 ${parsed.width || "未知"}x${parsed.height || "未知"}，坐标系左上角为 (0,0)。`
            + `${parsed.target ? ` 关注目标：${parsed.target}。` : ""}`
            + `${parsed.intent ? ` 用途：${parsed.intent}。` : ""}`
            + " 如需点击，请估算目标元素中心点坐标后调用 desktop_control_input；点击后建议再次截图验证结果。",
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data,
          },
        },
      ],
    };
  }
}

class DesktopCdpOpenAppTool extends ToolBase {
  name = "desktop_cdp_open_app";
  searchHint = "以 CDP App Mode 打开或复用可结构化控制的 Chromium / Electron 应用。当前适合 chrome、edge、feishu、figma、notion。这类应用应优先使用 desktop_cdp_snapshot + desktop_cdp_act，而不是先截图再猜鼠标坐标。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "目标应用，可填 chrome、edge、feishu、figma、notion。",
        },
        target: {
          type: "string",
          description: "可选。应用可执行文件路径；若不填则自动按已安装程序匹配。",
        },
        url: {
          type: "string",
          description: "浏览器类应用可选。打开后直接导航到该网址。",
        },
        forceNew: {
          type: "boolean",
          description: "是否强制新建一个 CDP 会话，而不是复用最近会话。",
        },
        forceRefresh: {
          type: "boolean",
          description: "是否强制刷新一次本机程序扫描结果。",
        },
        reason: {
          type: "string",
          description: "为什么要以 CDP 模式打开该应用，可选。",
        },
      },
      required: [],
    };
  }

  async call(args = {}, context = {}) {
    const result = await openDesktopCdpApp(args, {
      desktopClientWs: context.desktopClientWs,
    });
    return {
      data: JSON.stringify(result),
    };
  }

  makeToolResultBlock(toolUseId, data) {
    let parsed = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      parsed = null;
    }

    if (!parsed?.sessionId) {
      return super.makeToolResultBlock(toolUseId, data);
    }

    const content = [
      `CDP App Mode 已连接 ${parsed.label || parsed.app || "目标应用"}。`,
      `会话 ID: ${parsed.sessionId}`,
      parsed.pageTitle ? `当前标题: ${parsed.pageTitle}` : "",
      parsed.pageUrl ? `当前地址: ${parsed.pageUrl}` : "",
      "下一步请优先调用 desktop_cdp_snapshot 获取结构化元素，再使用 desktop_cdp_act 基于 ref 操作。",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content,
    };
  }
}

class DesktopCdpSnapshotTool extends ToolBase {
  name = "desktop_cdp_snapshot";
  searchHint = "读取当前 CDP App Mode 会话的结构化页面快照，返回可操作元素 ref 列表。之后应优先把 ref 交给 desktop_cdp_act，而不是改回视觉坐标点击。";
  maxResultSizeChars = 24_000;

  inputSchema() {
    return {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "可选。指定 CDP 会话 ID；不填时默认使用最近一次 CDP 会话。",
        },
        limit: {
          type: "number",
          description: "最多返回多少个结构化元素，默认 36，最大 80。",
        },
      },
      required: [],
    };
  }

  async call(args = {}) {
    const result = await snapshotDesktopCdpApp(args);
    return {
      data: JSON.stringify(result),
    };
  }

  makeToolResultBlock(toolUseId, data) {
    let parsed = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      parsed = null;
    }

    if (!parsed?.sessionId || !Array.isArray(parsed.elements)) {
      return super.makeToolResultBlock(toolUseId, data);
    }

    const lines = [
      `CDP 快照: ${parsed.label || parsed.app || "应用"} · 会话 ${parsed.sessionId}`,
      parsed.pageTitle ? `标题: ${parsed.pageTitle}` : "",
      parsed.pageUrl ? `地址: ${parsed.pageUrl}` : "",
      parsed.textPreview ? `正文摘要: ${parsed.textPreview}` : "",
      "可操作元素:",
      ...parsed.elements.slice(0, 24).map((item) => {
        const summary = [item.name, item.text, item.placeholder, item.value].filter(Boolean)[0] || item.tag || "element";
        return `- ${item.ref} [${item.role || item.tag}] ${summary}`;
      }),
      "下一步请使用 desktop_cdp_act，并优先传 ref。",
    ].filter(Boolean);

    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: lines.join("\n"),
    };
  }
}

class DesktopCdpActTool extends ToolBase {
  name = "desktop_cdp_act";
  searchHint = "在 CDP App Mode 会话中执行结构化操作。优先使用 desktop_cdp_snapshot 返回的 ref 来 click / fill / type / press / navigate，避免回到截图猜坐标。";

  inputSchema() {
    return {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "可选。指定 CDP 会话 ID；不填时默认最近会话。" },
        action: {
          type: "string",
          enum: ["click", "double_click", "hover", "fill", "type", "press", "navigate"],
          description: "要执行的结构化动作。",
        },
        ref: { type: "string", description: "优先使用 desktop_cdp_snapshot 返回的 ref。" },
        selector: { type: "string", description: "可选。直接传 CSS selector。" },
        role: { type: "string", description: "可选。和 name 一起按 ARIA role 定位，例如 button、link、textbox。" },
        name: { type: "string", description: "可选。role 对应的 name。" },
        label: { type: "string", description: "name 的别名。" },
        textMatch: { type: "string", description: "可选。按页面文本模糊匹配定位。" },
        targetText: { type: "string", description: "textMatch 的别名。" },
        value: { type: "string", description: "fill / type 动作输入的内容。" },
        key: { type: "string", description: "press 动作的按键，如 Enter、Control+L。" },
        url: { type: "string", description: "navigate 动作的目标 URL。" },
        delayMs: { type: "number", description: "type 动作的逐字延迟，可选。" },
        timeoutMs: { type: "number", description: "等待元素可见/动作完成的超时，可选。" },
      },
      required: ["action"],
    };
  }

  async call(args = {}) {
    const result = await actDesktopCdpApp(args);
    return {
      data: JSON.stringify(result),
    };
  }

  makeToolResultBlock(toolUseId, data) {
    let parsed = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      parsed = null;
    }

    if (!parsed?.sessionId) {
      return super.makeToolResultBlock(toolUseId, data);
    }

    const content = [
      `CDP 动作已完成: ${parsed.action || "act"}`,
      `会话 ID: ${parsed.sessionId}`,
      parsed.pageTitle ? `当前标题: ${parsed.pageTitle}` : "",
      parsed.pageUrl ? `当前地址: ${parsed.pageUrl}` : "",
      "如需继续操作，建议再次调用 desktop_cdp_snapshot 刷新最新 ref。",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content,
    };
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/** 内置工具列表（通用，所有 Agent 可用） */
const BUILT_IN_TOOLS = [
  new DocumentWriteDocxTool(),
  new DocumentWriteXlsxTool(),
  new DocumentWritePptxTool(),
];

/** 浏览器工具列表（仅 orchestrator 可用） */
const BROWSER_TOOLS = [
  new BrowserGotoTool(),
  new BrowserPageInfoTool(),
  new BrowserGetTextTool(),
  new BrowserScreenshotTool(),
  new BrowserListImagesTool(),
  new BrowserActTool(),
  new BrowserActSingleTool(),
  new BrowserActMultiTool(),
];

const MEETING_BROWSER_TOOLS = [
  new BrowserGotoTool(),
  new BrowserPageInfoTool(),
  new BrowserGetTextTool(),
  new BrowserScreenshotTool(),
  new BrowserListImagesTool(),
  new BrowserActTool(),
];

const DESKTOP_TOOLS = [
  new DesktopListInstalledApplicationsTool(),
  new DesktopOpenExternalBrowserTool(),
  new DesktopLaunchNativeApplicationTool(),
  new DesktopCdpOpenAppTool(),
  new DesktopCdpSnapshotTool(),
  new DesktopCdpActTool(),
  new DesktopControlInputTool(),
  new DesktopCaptureScreenshotTool(),
];

/**
 * 获取指定 Agent 可用的工具列表
 * orchestrator 额外获得浏览器控制工具
 *
 * @param {string} agentId - Agent 标识符
 * @returns {ToolBase[]}
 */
export function getAgentTools(agentId) {
  const base = BUILT_IN_TOOLS.filter((tool) => tool.isEnabled());
  if (agentId === "orchestrator") {
    return [
      ...base,
      ...BROWSER_TOOLS.filter((t) => t.isEnabled()),
      ...DESKTOP_TOOLS.filter((t) => t.isEnabled()),
    ];
  }
  return [
    ...base,
    ...DESKTOP_TOOLS.filter((t) => t.isEnabled()),
  ];
}

export function getMeetingTools() {
  return MEETING_BROWSER_TOOLS.filter((tool) => tool.isEnabled());
}
