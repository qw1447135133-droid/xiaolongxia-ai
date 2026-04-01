# 对话体验优化计划 · plan v0.1

> 目标：将「对话历史」调整为常见 IM/AI 助手交互习惯——时间正序、大间隔时间分割线、可切换的多会话历史。  
> 状态：**规划文档**（未开工实现）

---

## 0. 现状摘要（便于对齐）

| 点 | 当前行为 | 代码位置 |
|----|----------|----------|
| 列表顺序 | 新消息通过 `addTask` **插在数组头部**，列表为 **最新在上** | `apps/web/src/store/index.ts`：`addTask: (task) => set(s => ({ tasks: [task, ...s.tasks] }))` |
| 渲染 | `TaskPipeline` 直接 `tasks.slice(0, 50).map(...)`，顺序与 store 一致 | `apps/web/src/components/TaskPipeline.tsx` |
| 持久化 | Zustand `persist` **未**持久化 `tasks`，刷新即清空对话 | `apps/web/src/store/index.ts`：`partialize` 仅含 `providers`、`agentConfigs`、`theme` |
| 时间展示 | 每条气泡旁 `timeAgo(createdAt)` | `TaskPipeline` + `lib/utils` |

---

## 1. 对话顺序调转（时间正序：旧在上、新在下）

### 1.1 目标

- 与用户心智及微信/ChatGPT 等一致：**最早气泡在顶部，最新消息在底部**。
- 新消息到达时，列表仍自然向下延伸；可选：**自动滚动到底部**（见 1.3）。

### 1.2 实现策略（二选一或组合）

**方案 A — 仅渲染层排序（改动小，推荐 v0.1 首选）**

- 在 `TaskPipeline`（或抽一层 `useChatTimeline`）内对 `tasks` 做副本排序：  
  `sort((a, b) => a.createdAt - b.createdAt)`  
- 再 `slice` 限制条数时注意：若仍要「最多 50 条」，建议取 **时间上最近的 50 条**（先排序再 `slice(-50)`），避免永远只看到最旧 50 条。

**方案 B — 改写入顺序**

- 将 `addTask` 改为尾部追加：`tasks: [...s.tasks, task]`。  
- **必须联调**：确认 WebSocket 推来的 `task_add` / `task_update` 顺序在多子任务场景下仍正确；子任务快速连发时顺序应与 `createdAt` 一致。

### 1.3 体验增强（建议同迭代完成）

- 容器 `overflow-y: auto`，新消息后 `scrollIntoView` 或使用 `ref` 滚动至底部。
- 「用户刚发完一条」与「流式/异步回复」若未来接入，可统一在 `useEffect` 依赖 `tasks` 长度或最后一条 `id` 时滚底。

### 1.4 验收

- 连发多条用户消息与多条 AI 回复，自上而下阅读时间单调递增。
- 看板 / 统计若依赖 `tasks[0]` 为「最新」，需改为 `tasks` 按时间取末项或单独维护 `lastTask`（若有此类逻辑需一并检索 `tasks[`）。

---

## 2. 时间分割线（间隔 > 5 分钟）

### 2.1 目标

- 类似微信：相邻两条消息（按 **展示顺序** 的上一则气泡）若与当前条 **`createdAt` 相差超过 5 分钟**，则在两者之间插入一条 **居中、弱样式** 的时间提示。

### 2.2 规则细化

- **基准时间**：使用每条 `Task` 已有的 `createdAt`（毫秒时间戳）；若存在 `completedAt` 且你希望「AI 回复以上屏时间为准」，v0.1 可仍统一用 `createdAt`，减少歧义。
- **阈值**：`5 * 60 * 1000` ms；可抽常量 `CHAT_GAP_MS`。
- **展示文案**（可后续国际化）：
  - 当日：可显示 `HH:mm`；
  - 非当日：可显示 `M月D日 HH:mm` 或完整短日期（与 `utils` 中日历格式化一致即可）。
- **首条消息前**：一般不插线；仅「与上一条间隔」判断。

### 2.3 实现要点

- 将「时间线」从 `Task[]` 映射为 **联合类型**：`(Task | { type: 'time-divider'; at: number })[]`，在 `map` 时渲染不同组件。
- **分割线组件**：窄条 + 圆角灰底文字，不抢占对话角色左右布局。

### 2.4 验收

- 本地篡改两条消息时间差 6 分钟应出现分割线；4 分钟不出现。
- 用户消息与 AI 消息交替时，仍以时间序比较 **上一条展示项**（跳过 divider 比较对象仅为真实气泡）。

---

## 3. 历史记录会话板块（多会话列表 + 切换）

### 3.1 目标

- 提供**常见 AI 聊天产品**的侧栏：**会话列表**（标题/预览/时间）、**新建会话**、**切换会话**、可选 **删除/重命名**。
- 刷新浏览器后会话仍在（需持久化）。

### 3.2 数据模型（建议）

```text
ChatSession {
  id: string              // uuid
  title: string           // 首条用户消息截断或「新对话」
  updatedAt: number
  tasks: Task[]           // 与现有 Task 结构一致，或可存快照
}
```

- **当前会话**：`activeSessionId`；`tasks` 可为当前会话的派生状态，或 store 内 `sessions[activeSessionId].tasks`。
- **标题生成**：首条 `isUserMessage` 的 `description` 截断 20～30 字；无则显示「新对话」。

### 3.3 持久化

- 与现有 `xiaolongxia-settings` 分离，新建 key，例如：`xiaolongxia_chat_sessions`（只存会话元数据 + 各会话 `tasks`，注意 **API Key 不要**写进会话里）。
- 体积控制：单会话任务数上限、总会话数上限（如最多保留 50 个会话），超出删最旧。

### 3.4 UI 布局（建议）

- **任务 Tab** 内：`对话历史` 区域改为 **左侧窄栏会话列表**（宽度 240～280px）+ **右侧** 现有 `TaskPipeline` + 底部 `CommandInput` 保持跨栏或仅在右侧（需与 `page.tsx` 布局协调）。
- 顶栏增加 **「新对话」** 按钮：归档当前 `tasks` 到当前会话、清空并生成新 `sessionId`。
- 移动端 v0.1 可先做抽屉式侧栏或暂时仅桌面可用（文档中注明）。

### 3.5 与现有流程的衔接

- `CommandInput` 添加用户消息、WS `dispatch` 仍写入**当前会话**的 `tasks`。
- WebSocket `addTask` / `updateTask`：必须指向**当前活动会话**的 task 列表（若多会话并存，忌写到错误 session）。
- 「清空对话」：改为「删除当前会话」或「清空当前会话消息」两种操作时明确语义。

### 3.6 验收

- 新建会话 A、聊几句 → 新建会话 B → 再切回 A，内容与顺序正确（含 1、2 节行为）。
- 刷新页面后会话列表与当前选中会话恢复；存储超限策略符合预期。

---

## 4. 建议实施顺序（降低返工）

1. **§1 顺序 + 滚底**（`TaskPipeline` + 可选 `addTask` 联调）  
2. **§2 时间分割线**（在已排序的时间线上插入）  
3. **§3 会话 store + 持久化 + 侧栏 UI**，最后把 WS 与 `CommandInput` 全部挂到 `activeSessionId`

---

## 5. 主要涉及文件（预估）

| 文件 | 变更类型 |
|------|----------|
| `apps/web/src/components/TaskPipeline.tsx` | 排序、分割线、滚底 ref |
| `apps/web/src/store/index.ts` / 新建 `chat-sessions.ts` | 会话状态、`addTask` 目标会话 |
| `apps/web/src/hooks/useWebSocket.ts` | `addTask`/`updateTask` 需兼容按会话写入（若 tasks 不扁平化） |
| `apps/web/src/components/CommandInput.tsx` | 新会话、当前 session |
| `apps/web/src/app/page.tsx`（`TasksTab`） | 侧栏布局 |
| `apps/web/src/lib/utils.ts` | 时间格式化工具（分割线用） |

---

## 6. 风险与备注

- **多子任务**：同一轮 dispatch 产生多条 `task_add`，`createdAt` 可能极近，顺序依赖排序稳定性；若需严格顺序，可后续为 Task 增加 `sequence` 或 `batchId`。
- **engine / ws 双路径**：仅前端展示与持久化变更；服务端广播格式不变。
- **性能**：会话内消息很多时，虚拟列表可列为 v0.2，v0.1 可先 `slice` 限制。

---

## 7. v0.1 完成定义（DoD）

- [ ] 对话列表时间正序，新消息在底部，默认滚至最新。  
- [ ] 相邻消息间隔 > 5 分钟出现微信式时间分割线。  
- [ ] 侧栏可新建/切换会话，刷新后保留；当前会话与 WS 推送一致无串会话。

---

*文档版本：v0.1 · 与仓库路径 `plan-v.0.1.md` 对应*
