# 🦞 小龙虾 AI 跨境电商团队

基于 [OpenAI Codex SDK](https://github.com/openai/codex) 构建的多 Agent 数字员工公司。

## 团队成员

| Agent | 职责 |
|-------|------|
| 🦞 虾总管 | 接收指令，拆解任务，调度团队 |
| 🔍 探海龙虾 | 竞品数据爬取与选品趋势分析 |
| ✍️ 执笔龙虾 | 多语种文案、SEO 标题、详情页 |
| 🎨 幻影龙虾 | 商品图、海报、短视频素材方案 |
| 🎬 戏精龙虾 | 数字人视频脚本与多平台发布 |
| 💬 迎客龙虾 | 多语种客服与评论互动 |

## 快速开始

### 1. 安装依赖

```bash
cd C:\Users\14471\Documents\GitHub\xiaolongxia-ai
npm install
```

### 2. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

推荐使用 SiliconFlow（更便宜）：
- 注册：https://siliconflow.cn
- 填入 `SILICONFLOW_API_KEY=sk-xxx`

### 3. 命令行使用

```bash
# 直接下发指令给虾总管
tsx cli.ts "帮我分析无线耳机市场，写英文文案，规划 TikTok 视频"

# 小龙虾会议模式（复杂项目）
tsx cli.ts "双十一大促策略，需要所有龙虾开会讨论"
```

### 4. 启动 Web 看板

```bash
cd apps/web
npm run dev
# 打开 http://localhost:3000
```

## 项目结构

```
xiaolongxia-ai/
├── cli.ts                    # 命令行入口
├── core/
│   ├── types.ts              # 核心类型定义
│   ├── dashboard.ts          # 看板状态管理 + 算力路由
│   └── index.ts
├── agents/
│   ├── orchestrator/         # 🦞 虾总管（任务拆解+调度）
│   ├── explorer/             # 🔍 探海龙虾
│   ├── writer/               # ✍️ 执笔龙虾
│   ├── designer/             # 🎨 幻影龙虾
│   ├── performer/            # 🎬 戏精龙虾
│   └── greeter/              # 💬 迎客龙虾
├── apps/
│   └── web/                  # Next.js 看板前端
└── integrations/
    ├── feishu/               # 飞书机器人（待接入）
    └── telegram/             # Telegram 机器人（待接入）
```

## 算力路由

系统根据任务复杂度自动选择模型，通过 SiliconFlow 统一接口降低成本：

| 复杂度 | 模型 | 适用场景 |
|--------|------|---------|
| 高 | deepseek-r1 | 视觉方案、视频策略 |
| 中 | Qwen2.5-72B | 文案创作、竞品分析 |
| 低 | Qwen2.5-7B | 客服回复、简单清洗 |

## 小龙虾会议

遇到复杂项目，多只龙虾可开启内部协作，互相审阅打分：

```typescript
await orchestrator.meeting("双十一大促策略", ["explorer", "writer", "performer"]);
```

## 下一步

- [ ] 接入飞书/Telegram Bot，手机下发指令
- [ ] 接入 FLUX 图片生成（幻影龙虾实际出图）
- [ ] 接入 HeyGen 数字人视频生成
- [ ] 接入 Playwright 实现探海龙虾真实爬虫
- [ ] Token 成本报表导出
