# 小龙虾 AI（xiaolongxia-ai）— 核心功能说明

面向 **跨境电商** 场景的多角色 AI 协作桌面/网页应用：用「虾总管」调度多只专业龙虾 Agent，完成选品分析、文案、设计辅助、短视频脚本与客服话术等任务。

---

## 1. 项目定位

| 项目 | 说明 |
|------|------|
| **名称** | `xiaolongxia-ai`（根包描述：小龙虾 AI 跨境电商多 Agent 团队） |
| **形态** | 浏览器中的 Next.js 应用；可选 **Electron** 打包为 Windows 安装程序（`electron-builder` → NSIS） |
| **运行结构** | **前端（Next.js）** 与 **独立 WebSocket 服务** 分离，典型端口：Web `3000`，WS `3001` |

---

## 2. 技术栈（要点）

- **前端**：Next.js 14、React 18、TypeScript、Tailwind CSS  
- **状态**：Zustand + `persist`（设置类数据写入 `localStorage`）  
- **实时通信**：浏览器端 `WebSocket` 连接 `ws://localhost:3001`（或 Electron IPC 取端口）  
- **LLM 调用**：OpenAI 兼容 SDK（`openai`），服务端根据配置选择官方 OpenAI、SiliconFlow、DeepSeek、阿里云百炼 / Coding Plan、4sAPI、自定义 Base URL 等  
- **桌面**：Electron 主进程启动子进程跑 `server/ws-server.js`，再加载页面  

---

## 3. 架构与数据流

```
用户输入 / 预设任务 / 定时任务
        ↓
  settings_sync（供应商 + 各 Agent 配置）
        ↓
  dispatch｜meeting（WebSocket 消息）
        ↓
server/ws-server.js（独立 Node 进程）
        ↓
OpenAI 兼容 API → broadcast 任务/状态/费用/活动 → 前端 Zustand 更新 UI
```

- **日常交互主路径**：指令经 **WebSocket** 发往 `ws-server.js` 执行（底部「向虾总管下发指令」依赖 WS 已连接）。  
- **补充路径**：存在 `POST /api/dispatch`，内部使用 `src/lib/engine.ts`，可与根目录说明的「仅 WS」场景区分（例如服务进程内测试）；前端主流程以 WS 为准。

---

## 4. 角色体系（六只「龙虾」）

| Agent ID | 默认昵称 | 领域侧重 |
|----------|-----------|----------|
| `orchestrator` | 虾总管 | 任务是否拆解的判断、拆解子任务、会议汇总 |
| `explorer` | 探海龙虾 | 竞品、选品、市场与数据分析 |
| `writer` | 执笔龙虾 | 多语种文案、SEO、详情页 |
| `designer` | 幻影龙虾 | 视觉/海报/素材方向（系统约定可输出 `[IMAGE_PROMPT]`，见下） |
| `performer` | 戏精龙虾 | 短视频脚本、TikTok/抖音、矩阵等 |
| `greeter` | 迎客龙虾 | 客服话术、评论回复、售后沟通 |

前端可对每个 Agent 配置：**显示名、emoji、性格（system 补充）、模型名、绑定的供应商**。

---

## 5. 调度（dispatch）核心逻辑

1. **先由虾总管判定**用户输入是闲聊/简单问句，还是明确工作任务。  
   - 简单场景：直接生成一条「已完成」任务，内容为虾总管回复，不拆子任务。  
   - 工作任务：进入拆解流程。  
2. **拆解**：将指令拆成若干子任务（WS 实现中强调合并相关项、控制子任务数量；与 `engine.ts` 内文案略可能不一致，以实际运行为准）。  
3. **关键词路由**：按子任务文本匹配规则，分配到 `explorer` / `writer` / `designer` / `performer` / `greeter`，未命中默认 `writer`。  
4. **执行方式**：子任务 **串行**依次执行；每条任务更新状态、广播活动与 token 消耗。  
5. **思考类模型**：对 Qwen3 / QwQ / GLM-5 / Kimi 等，非高复杂度时可关闭 `enable_thinking` 以降低延迟。

**模型与 Key**：支持环境变量 `OPENAI_API_KEY`、`SILICONFLOW_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 等；也可在 UI 的「模型供应商」中配置多个 Provider，由 Agent 绑定使用。

---

## 6. 小龙虾会议（meeting）

- 用户输入会议主题，经 WS 发送 `meeting`。  
- 默认 **explorer、writer、performer** 轮流基于当前共识文本发表短建议，**虾总管**最后综合输出「最终方案」。  
- 结果通过 `meeting_result` 消息回传前端展示。

---

## 7. 图片生成（image-gen）

- 模块：`src/lib/image-gen.ts`。  
- **优先级**：`INFSH_API_KEY`（inference.sh，支持 Seedream / Nano Banana 等）→ `SILICONFLOW_API_KEY`（文生图 API）→ 无 Key 时用占位图服务。  
- 成功时可将远程图 **落盘到** `public/generated/` 再返回本地 URL，避免外链失效。  
- **说明**：`engine.ts` 中设计师输出若含 `[IMAGE_PROMPT]` 会尝试走上述链路；**独立 `ws-server.js` 当前为纯文本子任务结果**，若需与生图链路完全一致，需在 WS 侧对齐设计师后处理逻辑。

---

## 8. 前端功能模块

| 模块 | 作用 |
|------|------|
| **顶栏 CostBar** | 汇总 token 与粗略美元估价（按固定单价估算，便于趋势对比） |
| **左栏 AgentGrid** | 各 Agent 状态（idle/running/error）、当前任务摘要 |
| **右栏 ActivityPanel** | 活动流水：dispatch、任务开始/完成/失败、会议等 |
| **Tab：看板** | 运行中 Agent 数、完成任务数、费用统计、最近任务列表 |
| **Tab：任务** | 预设任务一键下发、定时任务管理、`TaskPipeline` 对话/任务历史 |
| **Tab：会议** | 小龙虾多 Agent 讨论 + 虾总管结论 |
| **Tab：设置** | 供应商与 Agent 级模型/人格配置（持久化） |
| **底部 CommandInput** | 下发自然语言指令（需 WebSocket 已连接） |
| **主题** | `dark`（深海）/ `coral`（珊瑚）/ `jade`（翡翠） |

---

## 9. 预设任务与定时任务

- **预设任务**（`src/lib/preset-tasks.ts`）：竞品分析、产品文案、海报、视频脚本、客服话术、SEO 关键词、邮件、社媒等，点击即可 `dispatch` 对应指令。  
- **定时任务**（`src/lib/scheduled-tasks.ts`）：存 `localStorage`，支持 **单次 / 每日 / 每周 / 每月**；页面 **每 60 秒** 检查是否到达 `nextRunTime`，到达则同步配置并发送 `dispatch`。单次任务执行后会自动禁用。

---

## 10. 常用脚本（`apps/web/package.json`）

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并行启动 WS 服务与 `next dev`（端口 3000） |
| `npm run dev:ws` / `dev:next` | 仅启动 WS 或仅 Next |
| `npm run electron:dev` | WS + Next + Electron（等待 3000 就绪后开窗口） |
| `npm run build` | Next 生产构建 |
| `npm run typecheck` | 先确保 `.next/types` 最新，再执行 `tsc --noEmit`，避免 Next 路由类型偶发缺失 |
| `npm run electron:build` | `next build` 后 `electron-builder` 打 Windows NSIS 包 |

仓库根目录 `package.json` 的 `npm run dev` 会 **切换到 `apps/web` 再执行** 上述开发脚本。

---

## 11. 环境变量（梳理）

| 变量 | 用途 |
|------|------|
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | OpenAI 或兼容网关 |
| `SILICONFLOW_API_KEY` | 硅基流动（文本默认 Base URL 可推断；亦用于 SiliconFlow 文生图） |
| `WS_PORT` | WebSocket 监听端口（默认 3001） |
| `NEXT_PUBLIC_WS_URL` | 前端 WebSocket 地址（非 Electron 时可覆写默认值） |
| `INFSH_API_KEY` / `IMAGE_MODEL` | inference.sh 生图及模型选择 |

---

## 12. 持久化与隐私提示

- **Zustand persist**：`xiaolongxia-settings` — 供应商列表、各 Agent 配置、主题（**含 API Key 明文**，注意本机与他人共用设备风险）。  
- **定时任务**：独立 key `xiaolongxia_scheduled_tasks` 存于 `localStorage`。  
- **任务与活动列表**：默认会话级，刷新可能清空（未整体持久化到本地）。

---

*文档根据仓库源码梳理，便于快速预览产品与二次开发对齐；若某分支行为与本文不一致，以当前分支代码为准。*
