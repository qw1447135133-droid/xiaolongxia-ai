# 对话节奏与活动联动优化计划 · plan v0.2

> 在 [plan v0.1](plan-v.0.1.md)（时间序、分割线、多会话）基础上，解决「多 Agent 抢话感混乱」与「历史会话 / 活动记录独立滚动 + 点击跳转对话」两类需求。  
> 状态：**规划文档**

---

## 0. 问题与目标摘要

| 编号 | 现状 / 痛点 | v0.2 目标 |
|------|-------------|-----------|
| A | 多龙虾同时「像在说话」，用户感知为抢话、顺序不清 | **虾总管先接话**；**拆解并分配后**，**仅对应龙虾**执行该子任务并产出回复；全员回复 **言简意赅、直入主题** |
| B | 历史会话列表、主对话区、活动记录高度与滚动未对齐，内容溢出时体验不统一 | 各区域 **独立滚动条**；布局上与右侧「活动记录」**视觉与高度相呼应**（同屏分栏、可独立浏览） |
| C | 活动记录与对话气泡无锚点，无法从活动跳回正文 | 点击活动记录中与某条任务相关的项，**滚动并高亮**对应对话气泡（或任务卡片） |

---

## 1. 调度与话术：虾总管优先 + 轮流上阵 + 简短输出

### 1.1 行为约定（产品层）

1. **接话顺序**  
   - 用户发令后，**仅虾总管（orchestrator）** 先出现在「正在处理」状态，并完成：**理解 / 判断是否拆解 / 拆解子任务 / 汇报分配**（现有「虾主管汇报」任务可保留，但文案需突出「由谁执行哪一条」）。  
   - **每个子任务**在时间上 **严格串行**：进入该子任务时，**仅该子任务对应 Agent** 为 `running`，其余业务龙虾为 `idle`（虾总管在子任务执行期间不与其他业务龙虾并行抢话）。  
   - **简单对话**（不拆解）：仅虾总管回复，**不**再触发其他 Agent。

2. **输出风格**  
   - 所有业务龙虾（explorer / writer / designer / performer / greeter）在 system 层统一约束：**短句、结论优先、少铺垫、禁止冗长寒暄**；必要时用条目列出。  
   - 虾总管：负责简短确认与拆解说明，同样遵守「先结论后补充」。

### 1.2 实现要点（技术层）

| 项 | 说明 | 主要改动位置 |
|----|------|--------------|
| 串行与状态 | 已存在 `for` 串行执行；需复查 **broadcast** 时机，避免在子任务开始前让多个 Agent 长时间同处于 `running`；子任务间隙将非执行者明确为 `idle` | `server/ws-server.js`、`src/lib/engine.ts`（若 API 路径仍用） |
| System 提示词 | 在 `SYSTEM_PROMPTS` 与各 Agent 的 `personality` 默认模板中追加 **统一简短输出约束**（中英文可约定最大字数或条数） | `ws-server.js`、`engine.ts`、`store/types.ts` 中 `AGENT_META.defaultPersonality` 视需要同步 |
| `max_tokens` | 对非高复杂度子任务，可适当 **下调** `max_tokens`，配合「言简意赅」 | `callAgent` / `buildClient` 调用处 |
| 会议模式 `meeting` | 若需与主任务一致：**先虾总管定议程或开场一句** → 再按参与者顺序发言 → 最后虾总管汇总；每轮仅一人 `running` | `ws-server.js` `meeting()`、`engine.ts` `meeting()` |

### 1.3 验收

- 单次 dispatch 多子任务时，时间线上 **不会出现** 两个业务龙虾长期同时 `running`。  
- 随机抽几条 Agent 回复，**无明显套话、重复客套**，长度可控。  
- 会议流程与主任务流程均符合「总管先、再轮流、再汇总」的预期（若 v0.2 只改主任务，会议可列为 v0.2.1）。

---

## 2. UI：历史会话 / 对话区 / 活动记录 — 独立滚动与高度呼应

### 2.1 布局

- **任务 Tab** 内：左侧 **历史会话**、中间 **当前会话对话**、与主窗口右侧 **活动记录** 在 **垂直方向** 上尽量 **顶对齐、同高**（或中间区与右栏同高），形成「左 | 中 |（主栏）右」三列信息流中的 **中与右对照**（左栏仅在任务 Tab）。  
- **Dashboard** 等无左侧会话栏的 Tab：保持现有布局，仅保证 **TaskPipeline** 自身 `overflow` 正确。

### 2.2 滚动策略

| 区域 | 要求 |
|------|------|
| 历史会话列表（`ChatSessionsPanel`） | 固定 **最大高度**（如 `min(100%, calc(100vh - …))` 或与中间列同高），内部 **`overflow-y: auto`**，**单独滚动**，不撑满整页无限长高。 |
| 对话区（`TaskPipeline` 容器） | 与 v0.1 一致保持内部滚动；高度与中间列 **flex** 分配一致，避免双滚动条冲突（外层容器不重复滚动）。 |
| 活动记录（`ActivityPanel`） | 右栏已有滚动容器时需 **明确 max-height + overflow-y**，与中间对话区 **可视高度策略一致**，便于「一眼对齐」。 |

### 2.3 验收

- 会话列表、对话、活动记录在内容很多时 **各自出现滚动条**，互不影响。  
- 缩小浏览器高度时，三区域仍 **可独立滚动浏览**，不出现整页被单列表拖死。

---

## 3. 活动记录 → 对话定位（跳转 / 滚动 / 高亮）

### 3.1 数据关联

- 当前 `Activity` 无 **`taskId`**，无法精确对应某条 `Task` 气泡。  
- **v0.2**：在服务端广播 `activity` 时，对 **`task_start` / `task_done` / `task_fail`**（及可选 `dispatch`）附带 **`taskId`**（与 `task_add` / `task_update` 的 id 一致）。  
- 前端 `Activity` 类型扩展 **`taskId?: string`**；`ws-server` / `engine` 与 `useWebSocket` 解析保持一致。

### 3.2 交互

- 活动卡片可点击区域（或专用图标）：点击后  
  1. 若当前会话不包含该 `taskId`，先 **切换会话**（需建立 `taskId → sessionId` 映射，或仅在 **当前会话** 内跳转并提示「该任务不在当前会话」）。  
  2. 在 `TaskPipeline` 内对 `data-task-id="..."` 的元素 **`scrollIntoView`**（`block: "center"`），并 **短时高亮**（CSS 动画或 outline）。  
- **可选**：`dispatch` 类活动关联 orchestrator 的汇报任务 id，便于从「调度」跳到总管气泡。

### 3.3 会话与 task 归属

- 多会话下，`taskId` 仅存在于创建该任务的会话中；需在 store 中支持 **`findSessionByTaskId(taskId)`** 或在 Activity 中冗余 **`sessionId`**（实现时二选一，避免全表扫描过慢）。

### 3.4 验收

- 点击某条「探海龙虾 · 完成」活动，对话区 **滚到** 对应任务气泡并 **可见反馈**。  
- 切换会话后 taskId 仍唯一且不误跳。

---

## 4. 建议实施顺序

1. **§1 服务端状态 + 提示词 + token**：先改 `ws-server.js`（主路径），再同步 `engine.ts`。  
2. **§2 布局与 CSS**：`page.tsx` 任务 Tab 栅格/flex、`ChatSessionsPanel`、`TaskPipeline` 外层、`ActivityPanel` 父容器统一高度策略。  
3. **§3 taskId 贯通 + 点击滚动**：类型 → 广播 → `ActivityPanel` 点击 → `TaskPipeline` ref 与 `data-task-id`。

---

## 5. 主要涉及文件（预估）

| 文件 | 变更内容 |
|------|----------|
| `apps/web/server/ws-server.js` | 串行状态广播、提示词、`activity` 带 `taskId` |
| `apps/web/src/lib/engine.ts` | 与 ws 对齐（若保留 API 路径） |
| `apps/web/src/store/types.ts` | `Activity.taskId?` |
| `apps/web/src/hooks/useWebSocket.ts` | 合并 activity 字段 |
| `apps/web/src/components/ActivityPanel.tsx` | 可点击、回调 `onNavigateToTask` 或 store action |
| `apps/web/src/components/TaskPipeline.tsx` | `data-task-id`、滚动目标、高亮 |
| `apps/web/src/components/ChatSessionsPanel.tsx` | 高度与 overflow |
| `apps/web/src/app/page.tsx` | 任务 Tab 与右栏高度对齐 |

---

## 6. 风险与备注

- **提示词过短**可能导致信息不足：可在设置中增加「详细程度」开关，v0.2 默认「简洁」。  
- **taskId 与会议**：会议类 activity 若无独立 task，可只支持任务类跳转，会议保持不跳转或跳到会议结果气泡（若后续单独建模）。  
- **与 v0.1 兼容**：持久化会话结构不变；仅扩展 Activity 与 WS 消息字段，注意旧数据无 `taskId` 时点击无操作或降级。

---

## 7. v0.2 完成定义（DoD）

- [ ] 主链路感知为：虾总管先接话 → 分配后仅对应龙虾依次产出，且回复简短。  
- [ ] 历史会话、对话区、活动记录 **独立滚动**，高度策略与布局 **对齐可感**。  
- [ ] 活动记录中带任务关联的项可 **跳转** 至对应对话位置并 **短暂高亮**。

---

*文档版本：v0.2 · 依赖 plan v0.1 已落地能力*
