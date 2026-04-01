#!/usr/bin/env node
/**
 * CLI 入口 - CommonJS 包装器用于 pkg 打包
 */

// 主函数
(async () => {
  try {
    // 加载环境变量
    try {
      await import('dotenv/config');
    } catch (e) {
      // dotenv 可能不存在，忽略错误
    }

    const apiKey = process.env.OPENAI_API_KEY ?? process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      console.error("❌ 请设置 OPENAI_API_KEY 或 SILICONFLOW_API_KEY 环境变量");
      console.error("   可以在 .env 文件中配置，或设置系统环境变量");
      process.exit(1);
    }

    const baseUrl = process.env.SILICONFLOW_API_KEY
      ? "https://api.siliconflow.cn/v1"
      : process.env.OPENAI_BASE_URL;

    const instruction = process.argv.slice(2).join(" ");
    if (!instruction) {
      console.error("用法: xiaolongxia-ai <指令>");
      console.error('示例: xiaolongxia-ai "分析无线耳机市场，写英文文案，规划 TikTok 视频"');
      process.exit(1);
    }

    // 动态导入 ES Module
    const { Dashboard } = await import("./dist/core/index.js");
    const { Orchestrator } = await import("./dist/agents/orchestrator/index.js");

    const dashboard = new Dashboard();
    const orchestrator = new Orchestrator(dashboard, apiKey, baseUrl);

    // 监听状态变化
    dashboard.on("agent:update", (agent) => {
      const statusMap = { idle: "🟢", running: "🟡", error: "🔴" };
      const emoji = statusMap[agent.status] ?? "⚪";
      if (agent.status === "running") {
        console.log(`${emoji} ${agent.emoji} ${agent.name}: ${agent.currentTask ?? ""}`);
      }
    });

    await orchestrator.dispatch(instruction);
  } catch (error) {
    console.error("❌ 执行失败:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
