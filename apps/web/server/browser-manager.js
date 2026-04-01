/**
 * browser-manager.js
 * Stagehand 单例管理器 - 懒初始化，进程退出时自动关闭
 *
 * 使用方式：
 *   import { getBrowser, getPage, closeBrowser } from "./browser-manager.js";
 *   const sh = await getBrowser();
 *   const page = await getPage();
 */

import { Stagehand } from "@browserbasehq/stagehand";

let stagehandInstance = null;
let initPromise = null;

/**
 * 获取 Stagehand 单例（懒初始化）
 * @returns {Promise<Stagehand>}
 */
export async function getBrowser() {
  if (stagehandInstance) return stagehandInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY 未设置，无法初始化浏览器");
    }
    const baseURL = process.env.ANTHROPIC_BASE_URL;

    const sh = new Stagehand({
      env: "LOCAL",
      modelName: "anthropic/claude-haiku-4-5-20251001",
      modelClientOptions: { apiKey, ...(baseURL ? { baseURL } : {}) },
      localBrowserLaunchOptions: {
        headless: process.env.BROWSER_HEADLESS !== "false",
        viewport: { width: 1280, height: 720 },
      },
      verbose: 0,
    });

    try {
      await sh.init();
    } catch (err) {
      initPromise = null;
      throw new Error(`Stagehand 初始化失败: ${err.message}`);
    }
    stagehandInstance = sh;
    initPromise = null;
    console.log("[browser-manager] Stagehand 初始化完成");
    return sh;
  })();

  return initPromise;
}

/**
 * 获取当前活跃页面（如无则创建新页面）
 * @returns {Promise<import("playwright").Page>}
 */
export async function getPage() {
  const sh = await getBrowser();
  const pages = sh.context.pages();
  if (pages.length > 0) return pages[0];
  return sh.context.newPage();
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
}

// 进程退出时自动关闭浏览器
process.on("exit", () => { closeBrowser().catch(() => {}); });
process.on("SIGINT", () => { closeBrowser().then(() => process.exit(0)).catch(() => process.exit(1)); });
process.on("SIGTERM", () => { closeBrowser().then(() => process.exit(0)).catch(() => process.exit(1)); });
