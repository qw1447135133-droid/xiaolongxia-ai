# 📝 API 路由移除说明

## 为什么移除 API 路由？

### 问题背景

在将 Next.js 应用打包为 Electron 桌面应用时，遇到了以下冲突：

1. **静态导出要求**
   - Electron 需要静态 HTML 文件（`output: 'export'`）
   - 无法运行 Next.js 服务器端代码

2. **API 路由限制**
   - API 路由使用了 `export const dynamic = "force-dynamic"`
   - 这与静态导出不兼容
   - Next.js 会报错并拒绝构建

### 解决方案

**移除 API 路由，使用 WebSocket 通信**

原因：
- ✅ Electron 版本已经有独立的 WebSocket 服务器（`server/ws-server.js`）
- ✅ 所有通信都通过 WebSocket 进行
- ✅ API 路由在 Electron 版本中不需要

### 架构对比

#### 之前（Web 版本）
```
浏览器 → Next.js API 路由 → 业务逻辑
```

#### 现在（Electron 版本）
```
Electron 渲染进程 → WebSocket (端口 3001) → ws-server.js → 业务逻辑
```

## 移除的文件

以下 API 路由已备份到 `src/api.backup/`：

- `/api/debug` - 调试接口
- `/api/dispatch` - 任务调度
- `/api/events` - SSE 事件流
- `/api/meeting` - 会议功能
- `/api/settings` - 设置管理
- `/api/test-model` - 模型测试

## WebSocket 通信协议

Electron 版本使用以下 WebSocket 消息类型：

### 客户端 → 服务器

```typescript
// 同步设置
{
  type: 'settings_sync',
  providers: Provider[],
  agentConfigs: AgentConfig[]
}

// 调度任务
{
  type: 'dispatch',
  instruction: string
}

// 召开会议
{
  type: 'meeting',
  topic: string,
  participants: string[]
}

// 心跳
{
  type: 'ping'
}
```

### 服务器 → 客户端

```typescript
// 连接确认
{
  type: 'connected'
}

// 任务添加
{
  type: 'task_add',
  task: Task
}

// 任务更新
{
  type: 'task_update',
  taskId: string,
  updates: Partial<Task>
}

// Agent 状态
{
  type: 'agent_status',
  agentId: string,
  status: 'idle' | 'running' | 'error',
  currentTask?: string
}

// 活动记录
{
  type: 'activity',
  activity: Activity
}

// 成本统计
{
  type: 'cost',
  agentId: string,
  tokens: number
}

// 心跳响应
{
  type: 'pong'
}
```

## 如果需要 Web 版本

如果将来需要支持 Web 版本（浏览器访问），可以：

### 方案 1：恢复 API 路由
```bash
# 恢复备份的 API 路由
mv src/api.backup src/app/api

# 使用条件配置
# next.config.js 已经支持通过 ELECTRON_BUILD 环境变量控制
```

### 方案 2：使用 WebSocket 代理
```javascript
// 在 Web 版本中也使用 WebSocket
// 通过 Nginx 或其他代理转发到 ws-server.js
```

### 方案 3：双模式支持
```javascript
// 检测运行环境
const isElectron = typeof window !== 'undefined' && window.electronAPI;

if (isElectron) {
  // 使用 WebSocket
  const ws = new WebSocket('ws://localhost:3001');
} else {
  // 使用 API 路由
  fetch('/api/dispatch', { method: 'POST', body: JSON.stringify(data) });
}
```

## 影响评估

### ✅ 不受影响的功能

- 所有 Agent 功能（虾总管、探海龙虾等）
- 任务调度和执行
- 设置管理
- 成本统计
- 实时状态更新

### ⚠️ 需要注意的变化

1. **开发模式**
   - 仍然需要同时运行 Next.js 和 WebSocket 服务器
   - 使用 `npm run electron:dev`

2. **生产模式**
   - 只需要 WebSocket 服务器
   - Electron 自动启动 ws-server.js

3. **调试**
   - 无法通过浏览器直接访问 API 端点
   - 需要通过 Electron DevTools 查看 WebSocket 消息

## 恢复步骤（如需要）

如果需要恢复 API 路由：

```bash
# 1. 恢复文件
cd src
mv ../api.backup app/api

# 2. 修改 next.config.js
# 移除或注释掉 output: 'export' 配置

# 3. 重新构建
npm run build
```

## 总结

- ✅ 移除 API 路由解决了静态导出冲突
- ✅ WebSocket 通信完全满足 Electron 版本需求
- ✅ 代码更简洁，架构更清晰
- ✅ 如需 Web 版本，可以轻松恢复

---

**备份位置：** `src/api.backup/`
**修改日期：** 2026-03-30
**影响版本：** 0.1.0+
