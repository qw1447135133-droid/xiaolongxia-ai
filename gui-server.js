#!/usr/bin/env node
/**
 * 小龙虾 AI - GUI 版本
 * 带图形界面的桌面应用
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3456;

app.use(express.json());
app.use(express.static(join(__dirname, 'gui')));

// API 执行端点
app.post('/api/execute', async (req, res) => {
  const { apiKey, baseUrl, instruction } = req.body;

  if (!apiKey || !instruction) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // 设置流式响应
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    // 动态导入模块
    const { Dashboard } = await import('./dist/core/index.js');
    const { Orchestrator } = await import('./dist/agents/orchestrator/index.js');

    const dashboard = new Dashboard();
    const orchestrator = new Orchestrator(dashboard, apiKey, baseUrl);

    // 监听状态变化并发送到前端
    dashboard.on('agent:update', (agent) => {
      const statusMap = { idle: '🟢', running: '🟡', error: '🔴' };
      const emoji = statusMap[agent.status] ?? '⚪';
      if (agent.status === 'running') {
        const message = `${emoji} ${agent.emoji} ${agent.name}: ${agent.currentTask ?? ''}\n`;
        res.write(message);
      }
    });

    res.write(`\n🦞 虾总管收到指令: "${instruction}"\n\n`);

    // 执行任务
    await orchestrator.dispatch(instruction);

    res.write('\n✅ 所有任务完成\n');
    res.end();
  } catch (error) {
    res.write(`\n❌ 执行失败: ${error.message}\n`);
    res.write(`${error.stack}\n`);
    res.end();
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n🦞 小龙虾 AI 已启动`);
  console.log(`📱 正在打开浏览器: http://localhost:${PORT}\n`);

  // 自动打开浏览器
  open(`http://localhost:${PORT}`).catch(() => {
    console.log('请手动打开浏览器访问: http://localhost:' + PORT);
  });
});
