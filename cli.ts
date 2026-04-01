#!/usr/bin/env tsx
/**
 * 小龙虾 AI 团队 - CLI 入口
 * 用法: tsx cli.ts "帮我分析无线耳机市场并写英文文案"
 */
import { Dashboard } from "./core/index.js";
import { Orchestrator } from "./agents/orchestrator/index.js";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.SILICONFLOW_API_KEY;
if (!apiKey) {
  console.error("❌ 请设置 OPENAI_API_KEY 或 SILICONFLOW_API_KEY 环境变量");
  process.exit(1);
}

const baseUrl = process.env.SILICONFLOW_API_KEY
  ? "https://api.siliconflow.cn/v1"
  : process.env.OPENAI_BASE_URL;

const instruction = process.argv.slice(2).join(" ");
if (!instruction) {
  console.error("用法: tsx cli.ts <指令>");
  console.error('示例: tsx cli.ts "分析无线耳机市场，写英文文案，规划 TikTok 视频"');
  process.exit(1);
}

const dashboard = new Dashboard();
const orchestrator = new Orchestrator(dashboard, apiKey, baseUrl);

// 监听状态变化
dashboard.on("agent:update", (agent) => {
  const statusMap: Record<string, string> = { idle: "🟢", running: "🟡", error: "🔴" };
  const emoji = statusMap[agent.status] ?? "⚪";
  if (agent.status === "running") {
    console.log(`${emoji} ${agent.emoji} ${agent.name}: ${agent.currentTask ?? ""}`);
  }
});

await orchestrator.dispatch(instruction);
