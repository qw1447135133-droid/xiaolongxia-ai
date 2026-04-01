#!/usr/bin/env node
/**
 * 小龙虾 AI - GUI 版本包装器
 */

const express = require('express');
const path = require('path');

const app = express();
let PORT = 3456;

app.use(express.json());

// 提供静态 HTML 页面
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>小龙虾 AI 团队</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 600px;
      width: 100%;
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 28px;
      color: #333;
      margin-bottom: 8px;
    }
    .header .emoji {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .header p {
      color: #666;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
      font-size: 14px;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .form-group textarea {
      resize: vertical;
      min-height: 100px;
      font-family: inherit;
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    .btn:active {
      transform: translateY(0);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .output {
      margin-top: 20px;
      padding: 20px;
      background: #f5f5f5;
      border-radius: 8px;
      max-height: 300px;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
      white-space: pre-wrap;
      word-wrap: break-word;
      display: none;
    }
    .output.show {
      display: block;
    }
    .status {
      margin-top: 10px;
      padding: 10px;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      display: none;
    }
    .status.show {
      display: block;
    }
    .status.success {
      background: #d4edda;
      color: #155724;
    }
    .status.error {
      background: #f8d7da;
      color: #721c24;
    }
    .status.info {
      background: #d1ecf1;
      color: #0c5460;
    }
    .hint {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">🦞</div>
      <h1>小龙虾 AI 团队</h1>
      <p>跨境电商多 Agent 数字员工</p>
    </div>

    <form id="configForm">
      <div class="form-group">
        <label>API 提供商</label>
        <select id="apiProvider">
          <option value="openai">OpenAI</option>
          <option value="siliconflow" selected>SiliconFlow (推荐，更便宜)</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="apiKey" placeholder="sk-xxx" required>
        <div class="hint">你的 API 密钥，不会被上传</div>
      </div>

      <div class="form-group" id="baseUrlGroup" style="display: none;">
        <label>API Base URL</label>
        <input type="text" id="baseUrl" placeholder="https://api.example.com/v1">
      </div>

      <div class="form-group">
        <label>任务指令</label>
        <textarea id="instruction" placeholder="例如：帮我分析无线耳机市场，写英文文案，规划 TikTok 视频" required></textarea>
      </div>

      <button type="submit" class="btn" id="submitBtn">🚀 开始执行</button>
    </form>

    <div class="status" id="status"></div>
    <div class="output" id="output"></div>
  </div>

  <script>
    const form = document.getElementById('configForm');
    const apiProvider = document.getElementById('apiProvider');
    const apiKey = document.getElementById('apiKey');
    const baseUrl = document.getElementById('baseUrl');
    const baseUrlGroup = document.getElementById('baseUrlGroup');
    const instruction = document.getElementById('instruction');
    const submitBtn = document.getElementById('submitBtn');
    const status = document.getElementById('status');
    const output = document.getElementById('output');

    // 加载保存的配置
    const savedConfig = localStorage.getItem('xiaolongxia-config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        apiProvider.value = config.provider || 'siliconflow';
        apiKey.value = config.apiKey || '';
        baseUrl.value = config.baseUrl || '';
        if (config.provider === 'custom') {
          baseUrlGroup.style.display = 'block';
        }
      } catch (e) {}
    }

    // 切换 API 提供商
    apiProvider.addEventListener('change', () => {
      if (apiProvider.value === 'custom') {
        baseUrlGroup.style.display = 'block';
      } else {
        baseUrlGroup.style.display = 'none';
        if (apiProvider.value === 'siliconflow') {
          baseUrl.value = 'https://api.siliconflow.cn/v1';
        } else {
          baseUrl.value = '';
        }
      }
    });

    // 提交表单
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const config = {
        provider: apiProvider.value,
        apiKey: apiKey.value.trim(),
        baseUrl: apiProvider.value === 'siliconflow'
          ? 'https://api.siliconflow.cn/v1'
          : baseUrl.value.trim(),
        instruction: instruction.value.trim()
      };

      if (!config.apiKey) {
        showStatus('error', '请输入 API Key');
        return;
      }

      if (!config.instruction) {
        showStatus('error', '请输入任务指令');
        return;
      }

      // 保存配置（不包含指令）
      localStorage.setItem('xiaolongxia-config', JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl
      }));

      // 执行任务
      await executeTask(config);
    });

    function showStatus(type, message) {
      status.className = \`status show \${type}\`;
      status.textContent = message;
    }

    function appendOutput(text) {
      output.classList.add('show');
      output.textContent += text + '\\n';
      output.scrollTop = output.scrollHeight;
    }

    async function executeTask(config) {
      submitBtn.disabled = true;
      output.textContent = '';
      output.classList.remove('show');
      showStatus('info', '正在执行任务...');

      try {
        const response = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          appendOutput(text);
        }

        showStatus('success', '✅ 任务执行完成');
      } catch (error) {
        showStatus('error', \`❌ 执行失败: \${error.message}\`);
        appendOutput(\`错误详情: \${error.stack || error.message}\`);
      } finally {
        submitBtn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
});

// API 执行端点
app.post('/api/execute', async (req, res) => {
  const { apiKey, baseUrl, instruction } = req.body;

  if (!apiKey || !instruction) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const { Dashboard } = await import('./dist/core/index.js');
    const { Orchestrator } = await import('./dist/agents/orchestrator/index.js');

    const dashboard = new Dashboard();
    const orchestrator = new Orchestrator(dashboard, apiKey, baseUrl);

    dashboard.on('agent:update', (agent) => {
      const statusMap = { idle: '🟢', running: '🟡', error: '🔴' };
      const emoji = statusMap[agent.status] ?? '⚪';
      if (agent.status === 'running') {
        const message = `${emoji} ${agent.emoji} ${agent.name}: ${agent.currentTask ?? ''}\n`;
        res.write(message);
      }
    });

    res.write(`\n🦞 虾总管收到指令: "${instruction}"\n\n`);
    await orchestrator.dispatch(instruction);
    res.write('\n✅ 所有任务完成\n');
    res.end();
  } catch (error) {
    res.write(`\n❌ 执行失败: ${error.message}\n`);
    res.write(`${error.stack}\n`);
    res.end();
  }
});

// 启动服务器，带端口冲突处理
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n🦞 小龙虾 AI 已启动`);
    console.log(`📱 请在浏览器中打开: http://localhost:${port}\n`);

    // 尝试自动打开浏览器
    try {
      const { exec } = require('child_process');
      const url = `http://localhost:${port}`;
      const cmd = process.platform === 'win32' ? `start ${url}` :
                  process.platform === 'darwin' ? `open ${url}` :
                  `xdg-open ${url}`;
      exec(cmd);
    } catch (e) {
      // 忽略错误
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  端口 ${port} 被占用，尝试端口 ${port + 1}...`);
      PORT = port + 1;
      startServer(PORT);
    } else {
      console.error('❌ 服务器启动失败:', err.message);
      process.exit(1);
    }
  });
}

startServer(PORT);
