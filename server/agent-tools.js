/**
 * Tool Protocol - 移植自 hare/tool.py
 *
 * 定义标准化的工具接口（Tool Protocol），供 Agent 执行引擎使用。
 * 浏览器工具（browser_*）仅对 orchestrator 开放。
 */

import { getBrowser, getPage } from "./browser-manager.js";
import { requestDesktopInstalledApplications, requestDesktopLaunch } from "./desktop-bridge.js";

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
  searchHint = "在 Electron 桌面运行态启动本机程序。适用于打开微信、飞书、Chrome、VS Code、资源管理器或指定 exe/快捷方式。仅负责启动程序，不支持鼠标键盘模拟。";

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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/** 内置工具列表（通用，所有 Agent 可用） */
const BUILT_IN_TOOLS = [];

/** 浏览器工具列表（仅 orchestrator 可用） */
const BROWSER_TOOLS = [
  new BrowserGotoTool(),
  new BrowserPageInfoTool(),
  new BrowserGetTextTool(),
  new BrowserScreenshotTool(),
  new BrowserActTool(),
  new BrowserActSingleTool(),
  new BrowserActMultiTool(),
];

const DESKTOP_TOOLS = [
  new DesktopListInstalledApplicationsTool(),
  new DesktopLaunchNativeApplicationTool(),
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
  return base;
}
