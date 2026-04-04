import {
  scoreChannelSession,
  scoreContentTask,
  scoreCustomerHealth,
  scoreLead,
  scoreTicket,
  type QuantDecision,
} from "@/lib/business-quantification";
import type { AutomationMode } from "@/store/types";
import type {
  BusinessApprovalRecord,
  BusinessChannelSession,
  BusinessContentTask,
  BusinessCustomer,
  BusinessEntityType,
  BusinessLead,
  BusinessOperationRecord,
  BusinessTicket,
} from "@/types/business-entities";

export type BusinessApprovalState = "not-required" | "pending" | "approved" | "rejected";
export type BusinessAutomationState = "ready" | "approval" | "watch" | "blocked";
export const BUSINESS_AUTO_DISPATCH_COOLDOWN_MS = 10 * 60 * 1000;

export interface BusinessAutomationQueueItem {
  entityType: BusinessEntityType;
  entityId: string;
  title: string;
  subtitle: string;
  score: number;
  summary: string;
  instruction: string;
  taskDescription: string;
  decision: QuantDecision;
  approval: BusinessApprovalRecord | null;
  approvalState: BusinessApprovalState;
  automationState: BusinessAutomationState;
  blockedReason: string | null;
  nextAction: string;
  requiresApproval: boolean;
  canAutoDispatch: boolean;
}

export interface BusinessDispatchQueueItem extends BusinessAutomationQueueItem {
  canDispatch: boolean;
  dispatchBlockedReason: string | null;
}

interface BusinessDispatchRuntimeOptions {
  wsStatus: "connecting" | "connected" | "disconnected";
  automationMode: AutomationMode;
  automationPaused: boolean;
  remoteSupervisorEnabled?: boolean;
}

interface BuildBusinessAutomationQueueInput {
  approvals: BusinessApprovalRecord[];
  customers: BusinessCustomer[];
  leads: BusinessLead[];
  tickets: BusinessTicket[];
  contentTasks: BusinessContentTask[];
  channelSessions: BusinessChannelSession[];
}

interface ContentTaskAutomationPlan {
  nextAction: string;
  requiresApproval: boolean;
  canAutoDispatch: boolean;
}

export function buildBusinessAutomationQueue({
  approvals,
  customers,
  leads,
  tickets,
  contentTasks,
  channelSessions,
}: BuildBusinessAutomationQueueInput): BusinessAutomationQueueItem[] {
  const customerMap = Object.fromEntries(customers.map(item => [item.id, item] as const));
  const leadMap = Object.fromEntries(leads.map(item => [item.id, item] as const));
  const channelSessionMap = Object.fromEntries(channelSessions.map(item => [item.id, item] as const));

  const items: BusinessAutomationQueueItem[] = [];

  for (const customer of customers) {
    const decision = scoreCustomerHealth(customer);
    items.push(
      buildQueueItem({
        entityType: "customer",
        entityId: customer.id,
        title: customer.name,
        subtitle: `客户 · ${customer.tier} · ${customer.primaryChannel}`,
        decision,
        approval: findApprovalRecord(approvals, "customer", customer.id),
        instruction: buildCustomerInstruction(customer),
      }),
    );
  }

  for (const lead of leads) {
    const customer = lead.customerId ? customerMap[lead.customerId] ?? null : null;
    const decision = scoreLead(lead, customer);
    items.push(
      buildQueueItem({
        entityType: "lead",
        entityId: lead.id,
        title: lead.title,
        subtitle: `线索 · ${lead.stage} · ${lead.source}`,
        decision,
        approval: findApprovalRecord(approvals, "lead", lead.id),
        instruction: buildLeadInstruction(lead, customer),
      }),
    );
  }

  for (const ticket of tickets) {
    const customer = ticket.customerId ? customerMap[ticket.customerId] ?? null : null;
    const session = ticket.channelSessionId ? channelSessionMap[ticket.channelSessionId] ?? null : null;
    const decision = scoreTicket(ticket, customer, session);
    items.push(
      buildQueueItem({
        entityType: "ticket",
        entityId: ticket.id,
        title: ticket.subject,
        subtitle: `工单 · ${ticket.priority} · ${ticket.status}`,
        decision,
        approval: findApprovalRecord(approvals, "ticket", ticket.id),
        instruction: buildTicketInstruction(ticket, customer, session),
      }),
    );
  }

  for (const contentTask of contentTasks) {
    const customer = contentTask.customerId ? customerMap[contentTask.customerId] ?? null : null;
    const lead = contentTask.leadId ? leadMap[contentTask.leadId] ?? null : null;
    const decision = scoreContentTask(contentTask, customer, lead);
    const contentPlan = buildContentTaskAutomationPlan(contentTask, decision);
    items.push(
      buildQueueItem({
        entityType: "contentTask",
        entityId: contentTask.id,
        title: contentTask.title,
        subtitle: `内容任务 · ${contentTask.channel} · ${contentTask.status}`,
        decision,
        approval: findApprovalRecord(approvals, "contentTask", contentTask.id),
        instruction: buildContentTaskInstruction(contentTask, customer, lead),
        nextAction: contentPlan.nextAction,
        requiresApproval: contentPlan.requiresApproval,
        canAutoDispatch: contentPlan.canAutoDispatch,
      }),
    );
  }

  for (const channelSession of channelSessions) {
    const customer = channelSession.customerId ? customerMap[channelSession.customerId] ?? null : null;
    const decision = scoreChannelSession(channelSession, customer);
    items.push(
      buildQueueItem({
        entityType: "channelSession",
        entityId: channelSession.id,
        title: channelSession.title,
        subtitle: `渠道会话 · ${channelSession.channel} · ${channelSession.status}`,
        decision,
        approval: findApprovalRecord(approvals, "channelSession", channelSession.id),
        instruction: buildChannelSessionInstruction(channelSession, customer),
      }),
    );
  }

  return items.sort((left, right) => {
    const rank = getAutomationStateRank(left.automationState) - getAutomationStateRank(right.automationState);
    if (rank !== 0) return rank;
    return right.score - left.score;
  });
}

export function decorateBusinessDispatchQueue(
  items: BusinessAutomationQueueItem[],
  {
    wsStatus,
    automationMode,
    automationPaused,
    remoteSupervisorEnabled = true,
  }: BusinessDispatchRuntimeOptions,
): BusinessDispatchQueueItem[] {
  return items.map(item => {
    const dispatchBlockedReason =
      wsStatus !== "connected"
        ? "远程通道未连接，暂时无法自动派发"
        : automationPaused
          ? "自动化已暂停，请先恢复值守再派发"
          : automationMode === "manual"
            ? "当前为人工模式，自动派发已关闭"
            : !remoteSupervisorEnabled
              ? "远程值守已关闭，自动派发暂时停用"
              : !item.canAutoDispatch
                ? `当前阶段不建议直接派发。建议动作：${item.nextAction}`
              : item.blockedReason;

    return {
      ...item,
      canDispatch: !dispatchBlockedReason,
      dispatchBlockedReason,
    };
  });
}

export function pickNextAutoDispatchItem(
  items: BusinessDispatchQueueItem[],
  operations: BusinessOperationRecord[],
  now = Date.now(),
  cooldownMs = BUSINESS_AUTO_DISPATCH_COOLDOWN_MS,
) {
  return items.find(item => {
    if (!item.canDispatch) return false;

    const latestDispatch = operations.find(record =>
      record.eventType === "dispatch" &&
      record.entityType === item.entityType &&
      record.entityId === item.entityId,
    );

    if (!latestDispatch) return true;
    return now - latestDispatch.createdAt >= cooldownMs;
  }) ?? null;
}

function buildQueueItem({
  entityType,
  entityId,
  title,
  subtitle,
  decision,
  approval,
  instruction,
  nextAction,
  requiresApproval,
  canAutoDispatch,
}: {
  entityType: BusinessEntityType;
  entityId: string;
  title: string;
  subtitle: string;
  decision: QuantDecision;
  approval: BusinessApprovalRecord | null;
  instruction: string;
  nextAction?: string;
  requiresApproval?: boolean;
  canAutoDispatch?: boolean;
}): BusinessAutomationQueueItem {
  const resolvedRequiresApproval = requiresApproval ?? decision.humanApprovalRequired;
  const approvalState: BusinessApprovalState = resolvedRequiresApproval
    ? approval?.status ?? "pending"
    : "not-required";

  const blockedReason = getEntityBlockedReason(decision, approvalState, resolvedRequiresApproval);
  const resolvedCanAutoDispatch = (canAutoDispatch ?? decision.autoRunEligible) && !blockedReason;
  const automationState: BusinessAutomationState = blockedReason
    ? approvalState === "pending"
      ? "approval"
      : approvalState === "rejected"
        ? "blocked"
        : "watch"
    : resolvedCanAutoDispatch
      ? "ready"
      : "watch";

  return {
    entityType,
    entityId,
    title,
    subtitle,
    score: decision.score,
    summary: decision.summary,
    instruction,
    taskDescription: `[业务派发][${getEntityTypeLabel(entityType)}] ${title}`,
    decision,
    approval,
    approvalState,
    automationState,
    blockedReason,
    nextAction: nextAction ?? buildDefaultNextAction(entityType, approvalState, blockedReason),
    requiresApproval: resolvedRequiresApproval,
    canAutoDispatch: resolvedCanAutoDispatch,
  };
}

function findApprovalRecord(
  approvals: BusinessApprovalRecord[],
  entityType: BusinessEntityType,
  entityId: string,
) {
  return approvals.find(item => item.entityType === entityType && item.entityId === entityId) ?? null;
}

function getEntityBlockedReason(
  decision: QuantDecision,
  approvalState: BusinessApprovalState,
  requiresApproval = decision.humanApprovalRequired,
) {
  if (requiresApproval) {
    if (approvalState === "pending") return "待审批，无法自动执行";
    if (approvalState === "rejected") return "审批已驳回，需重新打开后才能自动执行";
  }

  if (!decision.autoRunEligible) {
    return "当前量化结果建议先观察，不建议自动执行";
  }

  return null;
}

function getAutomationStateRank(state: BusinessAutomationState) {
  switch (state) {
    case "ready":
      return 0;
    case "approval":
      return 1;
    case "watch":
      return 2;
    default:
      return 3;
  }
}

function getEntityTypeLabel(entityType: BusinessEntityType) {
  switch (entityType) {
    case "customer":
      return "客户";
    case "lead":
      return "线索";
    case "ticket":
      return "工单";
    case "contentTask":
      return "内容任务";
    case "channelSession":
      return "渠道会话";
  }
}

export function getBusinessOperationTitle(entityType: BusinessEntityType, fallbackTitle: string) {
  return `[${getEntityTypeLabel(entityType)}] ${fallbackTitle}`;
}

function buildDefaultNextAction(
  entityType: BusinessEntityType,
  approvalState: BusinessApprovalState,
  blockedReason: string | null,
) {
  if (approvalState === "pending") {
    return "等待人工审批后继续推进";
  }
  if (approvalState === "rejected") {
    return "先回到聊天或业务面板调整，再重新进入自动链路";
  }
  if (blockedReason) {
    return "保持观察，补充上下文后再重新派发";
  }

  switch (entityType) {
    case "customer":
      return "继续跟进客户并生成下一轮沟通草稿";
    case "lead":
      return "推进下一阶段线索动作并准备跟进消息";
    case "ticket":
      return "按 SOP 处理工单并输出回复草稿";
    case "contentTask":
      return "创建对应 workflow，继续内容执行闭环";
    case "channelSession":
      return "继续接待会话并判断是否需要人工接管";
  }
}

function buildContentTaskAutomationPlan(
  task: BusinessContentTask,
  decision: QuantDecision,
): ContentTaskAutomationPlan {
  switch (task.status) {
    case "review":
      return {
        nextAction: "进入人工审校，确认后可继续排期或发布准备",
        requiresApproval: true,
        canAutoDispatch: false,
      };
    case "scheduled":
      return {
        nextAction: "生成发布准备包，外发前保留人工确认",
        requiresApproval: true,
        canAutoDispatch: decision.autoRunEligible,
      };
    case "published":
      return {
        nextAction: "回收发布结果并进入复盘 workflow",
        requiresApproval: false,
        canAutoDispatch: false,
      };
    default:
      return {
        nextAction: "生成选题与草稿 workflow，补齐首版内容产物",
        requiresApproval: false,
        canAutoDispatch: decision.autoRunEligible && !decision.humanApprovalRequired,
      };
  }
}

function buildCustomerInstruction(customer: BusinessCustomer) {
  return [
    "请作为数字员工运营助手，处理以下客户对象。",
    `客户名称: ${customer.name}`,
    `客户等级: ${customer.tier}`,
    `主要渠道: ${customer.primaryChannel}`,
    `公司: ${customer.company || "未填写"}`,
    `标签: ${customer.tags.join("、") || "无"}`,
    `客户摘要: ${customer.summary}`,
    "",
    "请输出:",
    "1. 当前客户经营判断和风险点",
    "2. 下一步跟进建议",
    "3. 一段可直接发送给客户的跟进消息草稿",
  ].join("\n");
}

function buildLeadInstruction(lead: BusinessLead, customer: BusinessCustomer | null) {
  return [
    "请作为销售型数字员工，推进以下线索。",
    `线索标题: ${lead.title}`,
    `线索阶段: ${lead.stage}`,
    `线索来源: ${lead.source}`,
    `线索原始分数: ${lead.score}`,
    `下一步动作: ${lead.nextAction}`,
    `关联客户: ${customer?.name ?? "未关联"}`,
    customer ? `客户摘要: ${customer.summary}` : "客户摘要: 无",
    "",
    "请输出:",
    "1. 当前线索判断",
    "2. 最合理的下一步动作",
    "3. 一段对外跟进消息草稿",
    "4. 如果涉及报价、承诺或合同，请明确标记人工确认点",
  ].join("\n");
}

function buildTicketInstruction(
  ticket: BusinessTicket,
  customer: BusinessCustomer | null,
  session: BusinessChannelSession | null,
) {
  return [
    "请作为客服型数字员工，处理以下工单。",
    `工单主题: ${ticket.subject}`,
    `工单优先级: ${ticket.priority}`,
    `工单状态: ${ticket.status}`,
    `工单摘要: ${ticket.summary}`,
    `关联客户: ${customer?.name ?? "未关联"}`,
    `客户等级: ${customer?.tier ?? "未知"}`,
    `关联会话: ${session?.title ?? "未关联"}`,
    session ? `会话摘要: ${session.summary}` : "会话摘要: 无",
    "",
    "请输出:",
    "1. 处理策略和升级建议",
    "2. 一段可直接发送的回复草稿",
    "3. 内部执行清单",
  ].join("\n");
}

function buildContentTaskInstruction(
  task: BusinessContentTask,
  customer: BusinessCustomer | null,
  lead: BusinessLead | null,
) {
  const publishTargets = task.publishTargets.length > 0
    ? task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join("、")
    : "未设置";
  const scheduledFor = task.scheduledFor
    ? new Date(task.scheduledFor).toLocaleString("zh-CN", { hour12: false })
    : "未排期";

  return [
    "请作为内容运营数字员工，推进以下内容任务。",
    `任务标题: ${task.title}`,
    `内容形式: ${task.format}`,
    `内容目标: ${task.goal}`,
    `发布渠道: ${task.channel}`,
    `发布目标: ${publishTargets}`,
    `任务状态: ${task.status}`,
    `排期时间: ${scheduledFor}`,
    `任务优先级: ${task.priority}`,
    `任务说明: ${task.brief}`,
    `最近草稿摘要: ${task.latestDraftSummary ?? "暂无"}`,
    `关联客户: ${customer?.name ?? "未关联"}`,
    `关联线索: ${lead?.title ?? "未关联"}`,
    lead ? `线索阶段: ${lead.stage}` : "线索阶段: 无",
    "",
    "请输出:",
    "1. 任务推进建议",
    "2. 一版可执行内容草稿或结构",
    "3. 发布前检查项",
  ].join("\n");
}

function buildChannelSessionInstruction(session: BusinessChannelSession, customer: BusinessCustomer | null) {
  return [
    "请作为渠道接待数字员工，接管以下会话。",
    `会话标题: ${session.title}`,
    `渠道: ${session.channel}`,
    `会话状态: ${session.status}`,
    `外部引用: ${session.externalRef}`,
    `最后消息时间: ${new Date(session.lastMessageAt).toLocaleString("zh-CN", { hour12: false })}`,
    `会话摘要: ${session.summary}`,
    `关联客户: ${customer?.name ?? "未关联"}`,
    customer ? `客户摘要: ${customer.summary}` : "客户摘要: 无",
    "",
    "请输出:",
    "1. 当前会话判断",
    "2. 下一条最合适的回复草稿",
    "3. 是否需要人工接管及原因",
  ].join("\n");
}
