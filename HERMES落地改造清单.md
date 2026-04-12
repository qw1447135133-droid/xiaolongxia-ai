# Hermes 思路映射到当前架构的落地改造清单

## 一、总体原则

- 不重写现有系统，而是把已经存在的渠道、会议、聊天、客户画像、语义记忆和执行链路收束成统一编排层。
- Hermes 在本项目里的落点，不是“再造一个 agent 框架”，而是补齐三件事：
  - 统一上下文装配
  - 统一运行诊断
  - 统一角色治理

## 二、映射矩阵

| Hermes 思路 | 当前仓库落点 | 当前状态 | 下一步 |
| --- | --- | --- | --- |
| Planner Brain / Session Brain | `HermesDispatchCenter`、`hermesDispatchSettings`、planner session state file | 已落地 | 补 transcript、brain doctor、run replay |
| Channel Gateway / Transport | `server/platforms/*`、`webhook-router.js`、`platform-message-orchestrator.js` | 已落地 | 补平台 doctor、重试策略、故障降级 |
| Layered Memory | `execution-dispatch.ts`、`workspace-memory.ts`、`conversation-bridge.ts`、`world-model.ts` | 本次增强 | 继续补回写策略与显式记忆卡 |
| World Model / State View | `business-*`、`world-model.ts`、客户画像 schema | 已落地 | 补 timeline、事实卡片、回写来源标注 |
| Doctor / Diagnostics | `channel-debug`、`PlatformSettings`、`/api/hermes-diagnostics`、`/hermes-architecture` | 本次新增 | 补导出快照、失败样本、执行链路回放 |
| Agent Governance / Lifecycle | 会议角色、执行代理、自动化模式、Agent 设置页治理合同 | 本次增强 | 继续补生命周期审计、run transcript、失败恢复策略 |

## 三、本次已经直接实现

### 1. Hermes 上下文装配器

- 新增 `src/lib/hermes-context.ts`
- 把聊天 dispatch 的 prompt 组装改成“分层装配”
- 当前层次包括：
  - 反馈档案
  - 用户画像
  - 当前会话短期记忆
  - 显式 `@` 外部上下文
  - 项目记忆
  - Desk Notes
  - 知识文档
  - 客户画像总览
  - 业务关系图
  - 世界状态
  - 用户请求
- 如果上下文过长，会自动切到压缩层，并把压缩前后 token 估算写进执行事件

### 2. Hermes 统一诊断接口

- 新增 `server/hermes-diagnostics.js`
- 新增接口 `GET /api/hermes-diagnostics`
- 当前能汇总：
  - planner profile / run / command 缺失情况
  - 渠道启用、连接、异常和 backlog 情况
  - 语义记忆与 pgvector 健康情况
  - 推荐下一步动作

### 3. 架构落地可视化页面

- 新增页面 `src/app/hermes-architecture/page.tsx`
- 用于直接查看：
  - Hermes 映射清单
  - 当前运行态摘要
  - 当前最值得继续做的事项
  - Agent 治理快照（裁判位、禁桌面执行、项目记忆回写归属）

### 4. Agent Governance 显式治理层

- 已把治理配置接入 `AgentConfig`
- 当前显式配置项包括：
  - 工具权限
  - 记忆回写范围
  - 升级策略
  - 表达风格
  - 会议站位
  - 禁区主题
  - 停止条件
- 普通聊天和会议提示词都会自动附加治理合同
- 默认策略已经按当前产品设定落下：
  - 鹦鹉螺默认是中立裁判位
  - 其余五个 agent 默认是辩手位
  - 非 orchestrator 默认禁用桌面执行，避免会议里再去“想着启动程序”

## 四、下一阶段建议顺序

1. 给每次执行补 run transcript、context receipt 和失败回放
2. 给客户画像 / 世界模型补“事实回写”与“来源标注”
3. 把 doctor 能力扩成一键导出诊断快照
4. 继续补 agent 生命周期审计与失败恢复策略

## 五、约束说明

- 继续遵守你已经确认过的规则：跨区会话历史默认不自动打通，只有显式 `@` 才接入外部历史。
- 当前改造是“往现有架构上加编排层”，不是把现有页面和存储整体推倒重来。
