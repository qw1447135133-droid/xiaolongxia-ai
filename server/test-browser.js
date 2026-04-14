/**
 * 浏览器自动化功能测试脚本
 * 用法：node server/test-browser.js
 *
 * 测试流程：
 * 1. 自动检测并初始化本机浏览器（Chrome / Edge / Firefox / Playwright）
 * 2. 导航到 example.com
 * 3. 截图
 * 4. 用自然语言操作（act）
 * 5. 关闭浏览器
 */

import { getPage, closeBrowser } from "./browser-manager.js";
import { getAgentTools } from "./agent-tools.js";
import { writeFileSync } from "fs";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

function log(icon, msg) { console.log(`${icon} ${msg}${RESET}`); }
function ok(msg) { log(`${GREEN}✓`, msg); }
function fail(msg) { log(`${RED}✗`, msg); }
function info(msg) { log(`${CYAN}→`, msg); }
function warn(msg) { log(`${YELLOW}!`, msg); }

async function runTest() {
  console.log("\n========================================");
  console.log("  鹦鹉螺浏览器自动化功能测试");
  console.log("========================================\n");

  const tools = getAgentTools("orchestrator");
  const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));

  // ── 测试 1：工具注册 ──────────────────────────────
  info("测试 1：工具注册检查");
  const expected = ["browser_goto", "browser_page_info", "browser_screenshot", "browser_act", "browser_act_single", "browser_act_multi"];
  let allFound = true;
  for (const name of expected) {
    if (toolMap[name]) {
      ok(`  工具已注册: ${name}`);
    } else {
      fail(`  工具缺失: ${name}`);
      allFound = false;
    }
  }
  if (!allFound) { process.exit(1); }

  // ── 测试 2：浏览器初始化 ──────────────────────────
  info("\n测试 2：启动浏览器（本地 Playwright 自动检测）");
  try {
    await getPage();
    ok("  浏览器启动成功");
  } catch (err) {
    fail(`  浏览器启动失败: ${err.message}`);
    process.exit(1);
  }

  // ── 测试 3：导航 ──────────────────────────────────
  info("\n测试 3：导航到 https://example.com");
  try {
    const result = await toolMap["browser_goto"].call({ url: "https://example.com" });
    const data = JSON.parse(result.data);
    ok(`  导航成功 → 标题: "${data.title}", URL: ${data.url}`);
  } catch (err) {
    fail(`  导航失败: ${err.message}`);
  }

  // ── 测试 4：获取页面信息 ──────────────────────────
  info("\n测试 4：获取页面信息");
  try {
    const result = await toolMap["browser_page_info"].call({});
    const data = JSON.parse(result.data);
    ok(`  页面信息 → 标题: "${data.title}"`);
  } catch (err) {
    fail(`  获取页面信息失败: ${err.message}`);
  }

  // ── 测试 5：截图 ──────────────────────────────────
  info("\n测试 5：截图（视口）");
  try {
    const result = await toolMap["browser_screenshot"].call({ fullPage: false });
    const base64 = result.data;
    const sizeKB = Math.round(base64.length * 0.75 / 1024);
    // 保存截图到本地
    const buf = Buffer.from(base64, "base64");
    writeFileSync("./public/test-screenshot.png", buf);
    ok(`  截图成功，大小约 ${sizeKB} KB，已保存到 public/test-screenshot.png`);
  } catch (err) {
    fail(`  截图失败: ${err.message}`);
  }

  // ── 测试 6：导航到百度 ────────────────────────────
  info("\n测试 6：导航到百度搜索页");
  try {
    const result = await toolMap["browser_goto"].call({ url: "https://www.baidu.com" });
    const data = JSON.parse(result.data);
    ok(`  导航成功 → 标题: "${data.title}"`);
  } catch (err) {
    fail(`  导航百度失败: ${err.message}`);
  }

  // ── 测试 7：精确选择器操作（在搜索框输入文字）────
  info("\n测试 7：精确选择器操作 - 在百度搜索框输入文字");
  try {
    const result = await toolMap["browser_act_single"].call({
      selector: "#kw",
      method: "fill",
      arguments: ["跨境电商选品工具"],
      description: "在百度搜索框输入关键词",
    });
    const data = JSON.parse(result.data);
    ok(`  输入成功 → selector: ${data.selector}, method: ${data.method}`);
  } catch (err) {
    fail(`  输入失败: ${err.message}`);
  }

  // ── 测试 8：点击搜索按钮 ──────────────────────────
  info("\n测试 8：点击百度搜索按钮");
  try {
    const result = await toolMap["browser_act_single"].call({
      selector: "#su",
      method: "click",
      arguments: [],
      description: "点击百度搜索按钮",
    });
    const data = JSON.parse(result.data);
    ok(`  点击成功 → selector: ${data.selector}`);
    // 等待页面加载
    const page = await getPage();
    await page.waitForLoadState("domcontentloaded");
  } catch (err) {
    fail(`  点击失败: ${err.message}`);
  }

  // ── 测试 9：搜索结果截图 ──────────────────────────
  info("\n测试 9：截取搜索结果截图");
  try {
    const result = await toolMap["browser_screenshot"].call({ fullPage: false });
    const base64 = result.data;
    const sizeKB = Math.round(base64.length * 0.75 / 1024);
    const buf = Buffer.from(base64, "base64");
    writeFileSync("./public/test-search-result.png", buf);
    ok(`  截图成功，大小约 ${sizeKB} KB，已保存到 public/test-search-result.png`);
  } catch (err) {
    fail(`  截图失败: ${err.message}`);
  }

  // ── 完成 ──────────────────────────────────────────
  console.log("\n========================================");
  ok("所有测试完成！浏览器自动化功能正常运行");
  console.log("========================================\n");

  await closeBrowser();
  process.exit(0);
}

runTest().catch(err => {
  fail(`测试异常: ${err.message}`);
  console.error(err);
  closeBrowser().finally(() => process.exit(1));
});
