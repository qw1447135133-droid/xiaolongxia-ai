/**
 * browser-manager.js
 * 浏览器单例管理器 - Playwright 基础检索 + Stagehand 自然语言动作
 *
 * 使用方式：
 *   import { getBrowser, getPage, closeBrowser } from "./browser-manager.js";
 *   const page = await getPage();
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Stagehand } from "@browserbasehq/stagehand";

let stagehandInstance = null;
let initPromise = null;
let playwrightBrowser = null;
let playwrightContext = null;
let playwrightInitPromise = null;

export function findSystemBrowserExecutable() {
  const explicit = process.env.BROWSER_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  if (process.platform === "win32") {
    const roots = [
      process.env.LOCALAPPDATA,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].filter(Boolean);
    const relativeCandidates = [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Microsoft", "Edge", "Application", "msedge.exe"],
      ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
      ["Mozilla Firefox", "firefox.exe"],
    ];
    for (const root of roots) {
      for (const relativeCandidate of relativeCandidates) {
        const candidate = path.join(root, ...relativeCandidate);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Firefox.app/Contents/MacOS/firefox",
    ];
    return candidates.find(candidate => existsSync(candidate)) || "";
  }

  const linuxCandidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
    "/usr/bin/firefox",
  ];
  return linuxCandidates.find(candidate => existsSync(candidate)) || "";
}

function resolveStagehandModelConfig() {
  const explicitApiKey = process.env.STAGEHAND_API_KEY || process.env.BROWSER_AGENT_API_KEY;
  const explicitModel = process.env.STAGEHAND_MODEL_NAME || process.env.BROWSER_AGENT_MODEL;
  const explicitBaseURL = process.env.STAGEHAND_BASE_URL || process.env.BROWSER_AGENT_BASE_URL;

  if (explicitApiKey) {
    return {
      apiKey: explicitApiKey,
      modelName: explicitModel || "openai/gpt-4o-mini",
      baseURL: explicitBaseURL || process.env.OPENAI_BASE_URL,
      source: "stagehand",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      modelName: explicitModel || "openai/gpt-4o-mini",
      baseURL: explicitBaseURL || process.env.OPENAI_BASE_URL,
      source: "openai",
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      apiKey: process.env.ANTHROPIC_API_KEY,
      modelName: explicitModel || "anthropic/claude-haiku-4-5-20251001",
      baseURL: explicitBaseURL || process.env.ANTHROPIC_BASE_URL,
      source: "anthropic",
    };
  }

  return null;
}

export function hasStagehandModelConfig() {
  return !!resolveStagehandModelConfig();
}

/**
 * 获取 Stagehand 单例（懒初始化）。Stagehand 只是可选的复杂语义增强；
 * 普通 browser_* 工具始终走本地 Playwright，不要求任何特定供应商 Key。
 * @returns {Promise<Stagehand>}
 */
export async function getBrowser() {
  if (stagehandInstance) return stagehandInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const modelConfig = resolveStagehandModelConfig();
    if (!modelConfig) {
      initPromise = null;
      throw new Error("Stagehand 语义增强未配置。普通 browser_* 工具会自动使用本机 Chrome / Edge / Firefox / Playwright 浏览器，不需要 ANTHROPIC_API_KEY。");
    }

    const browserExecutablePath = findSystemBrowserExecutable();
    const sh = new Stagehand({
      env: "LOCAL",
      modelName: modelConfig.modelName,
      modelClientOptions: { apiKey: modelConfig.apiKey, ...(modelConfig.baseURL ? { baseURL: modelConfig.baseURL } : {}) },
      localBrowserLaunchOptions: {
        headless: process.env.BROWSER_HEADLESS !== "false",
        viewport: { width: 1280, height: 720 },
        ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
      },
      verbose: 0,
    });

    try {
      await sh.init();
    } catch (err) {
      initPromise = null;
      throw new Error(`Stagehand 可选语义增强初始化失败: ${err.message}。普通 browser_* 工具仍可使用本机浏览器；如新电脑没有浏览器，请安装 Chrome / Edge / Firefox，或在 .env.local 中设置 BROWSER_EXECUTABLE_PATH 指向浏览器 exe。`);
    }
    stagehandInstance = sh;
    initPromise = null;
    console.log("[browser-manager] Stagehand 初始化完成", `(${modelConfig.source})`);
    return sh;
  })();

  return initPromise;
}

async function getPlaywrightContext() {
  if (playwrightContext) return playwrightContext;
  if (playwrightInitPromise) return playwrightInitPromise;

  playwrightInitPromise = (async () => {
    const browserExecutablePath = findSystemBrowserExecutable();
    try {
      playwrightBrowser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== "false",
        ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
      });
      playwrightContext = await playwrightBrowser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      console.log("[browser-manager] Playwright 浏览器初始化完成", browserExecutablePath ? `(${browserExecutablePath})` : "");
      return playwrightContext;
    } catch (err) {
      playwrightInitPromise = null;
      throw new Error(`Playwright 浏览器初始化失败: ${err.message}。请安装 Chrome/Edge，或在 .env.local 中设置 BROWSER_EXECUTABLE_PATH 指向浏览器 exe。`);
    }
  })();

  return playwrightInitPromise;
}

/**
 * 获取当前活跃页面（如无则创建新页面）。基础网页搜索不依赖 ANTHROPIC_API_KEY。
 * @returns {Promise<import("playwright").Page>}
 */
export async function getPage() {
  if (stagehandInstance?.context) {
    const pages = stagehandInstance.context.pages();
    if (pages.length > 0) return pages[0];
    return stagehandInstance.context.newPage();
  }

  const context = await getPlaywrightContext();
  const pages = context.pages();
  if (pages.length > 0) return pages[0];
  return context.newPage();
}

/**
 * 关闭浏览器实例
 */
export async function closeBrowser() {
  if (stagehandInstance) {
    try {
      await stagehandInstance.close();
    } catch {}
    stagehandInstance = null;
  }
  if (playwrightBrowser) {
    try {
      await playwrightBrowser.close();
    } catch {}
    playwrightBrowser = null;
    playwrightContext = null;
    playwrightInitPromise = null;
  }
}

// 进程退出时自动关闭浏览器
process.on("exit", () => { closeBrowser().catch(() => {}); });
process.on("SIGINT", () => { closeBrowser().then(() => process.exit(0)).catch(() => process.exit(1)); });
process.on("SIGTERM", () => { closeBrowser().then(() => process.exit(0)).catch(() => process.exit(1)); });
