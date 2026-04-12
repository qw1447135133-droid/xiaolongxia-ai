import { canDirectReplySession } from "@/lib/channel-session-presentation";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { filterByProjectScope } from "@/lib/project-context";
import { buildCustomerProfileInstruction } from "@/lib/customer-profile-schema";
import { useStore } from "@/store";
import type {
  BusinessChannelSession,
  BusinessCustomer,
  BusinessCustomerCampaignAssessment,
} from "@/types/business-entities";

const OUTBOUND_CAMPAIGN_INTENT_PATTERNS = [
  /(群发|群發|散发|散發|推送|发送|發送|通知|触达|觸達).*(客户|客戶|用户|用戶|会员|會員|客群)/u,
  /(向|给|給).*(客户|客戶|用户|用戶|会员|會員|客群).*(群发|群發|散发|散發|推送|发送|發送|通知|触达|觸達)/u,
  /(活动|活動|促销|促銷|营销|營銷|优惠|優惠).*(群发|群發|散发|散發|推送|发送|發送|通知|触达|觸達)/u,
];
const OUTBOUND_CAMPAIGN_EXCLUDE_PATTERNS = [
  /不要(真的)?发送/u,
  /先不要(真的)?发送/u,
  /不要群发/u,
  /仅生成/u,
  /只生成/u,
  /只要(话术|文案|方案|草稿)/u,
  /先出(话术|文案|方案|草稿)/u,
];

type CampaignIntent = {
  campaignBrief: string;
  headline: string;
};

type CampaignDispatchTarget = {
  customer: BusinessCustomer;
  session: BusinessChannelSession;
  assessment: BusinessCustomerCampaignAssessment;
};

export type CampaignDispatchReport = {
  matched: boolean;
  blocked: boolean;
  launched: number;
  targeted: number;
  skipped: number;
  summary: string;
};

function truncateLabel(value: string, maxLength = 22) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "活动外呼";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function detectOutboundCampaignIntent(instruction: string): CampaignIntent | null {
  const normalized = instruction.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (OUTBOUND_CAMPAIGN_EXCLUDE_PATTERNS.some(pattern => pattern.test(normalized))) {
    return null;
  }
  if (!OUTBOUND_CAMPAIGN_INTENT_PATTERNS.some(pattern => pattern.test(normalized))) {
    return null;
  }

  return {
    campaignBrief: normalized,
    headline: truncateLabel(normalized),
  };
}

function getTierLabel(tier: BusinessCustomer["tier"]) {
  switch (tier) {
    case "vip":
      return "VIP";
    case "active":
      return "活跃客户";
    default:
      return "潜在线索";
  }
}

function getTierStrategy(customer: BusinessCustomer, assessment: BusinessCustomerCampaignAssessment) {
  const baseSignals = assessment.matchedSignals.slice(0, 3).join("、") || "近期互动与画像摘要";
  switch (customer.tier) {
    case "vip":
      return `走高价值老客关怀路线，强调专属权益、优先名额和尊享服务，用词克制但要显得被重视，优先围绕 ${baseSignals} 展开。`;
    case "active":
      return `走成交促进路线，强调活动利益点、明确时效和下一步动作，让客户感觉这是针对老客户的升级方案，优先围绕 ${baseSignals} 展开。`;
    default:
      return `走低压破冰路线，先讲与客户可能相关的价值，再轻量带出活动信息，不要一上来就强推成交，优先围绕 ${baseSignals} 展开。`;
  }
}

function getSessionDispatchScore(customer: BusinessCustomer, session: BusinessChannelSession) {
  const preferredChannels = new Set([
    ...customer.campaignPreferences.preferredChannels,
    ...customer.crmProfile.interaction.preferredContactMethods,
  ]);
  const now = Date.now();

  let score = 0;
  if (preferredChannels.has(session.channel)) score += 24;
  if (session.status === "active") score += 16;
  if (session.status === "open") score += 10;
  if (session.lastDeliveryStatus === "sent" || session.lastDeliveryStatus === "delivered") score += 8;
  if (session.lastDeliveryStatus === "failed") score -= 28;
  if (session.status === "waiting") score -= 22;
  if (session.lastInboundAt) {
    const inboundAgeDays = Math.max(0, Math.floor((now - session.lastInboundAt) / 86_400_000));
    score += Math.max(0, 12 - inboundAgeDays);
  }
  if (session.lastMessageAt) {
    const messageAgeDays = Math.max(0, Math.floor((now - session.lastMessageAt) / 172_800_000));
    score += Math.max(0, 10 - messageAgeDays);
  }
  return score;
}

function pickBestCampaignSession(customer: BusinessCustomer, sessions: BusinessChannelSession[]) {
  return sessions
    .filter(session =>
      session.customerId === customer.id &&
      canDirectReplySession(session) &&
      session.status !== "closed" &&
      session.status !== "waiting" &&
      Boolean(String(session.externalRef || "").trim()),
    )
    .sort((left, right) => getSessionDispatchScore(customer, right) - getSessionDispatchScore(customer, left))[0] ?? null;
}

function buildCampaignDispatchInstruction(
  intent: CampaignIntent,
  target: CampaignDispatchTarget,
) {
  const { customer, session, assessment } = target;
  const matchedSignals = assessment.matchedSignals.join("、") || "暂无";
  const blockedSignals = assessment.blockedSignals.join("、") || "无";

  return [
    "请作为渠道增长助手，执行一轮由用户明确授权的客户活动外呼。",
    `活动简报: ${intent.campaignBrief}`,
    `活动主题: ${intent.headline}`,
    `本客户分层策略: ${getTierStrategy(customer, assessment)}`,
    `客户名称: ${customer.name}`,
    `客户等级: ${getTierLabel(customer.tier)}`,
    `触达渠道: ${session.channel} / ${session.title}`,
    `活动适配判断: ${assessment.decision} (${assessment.score})`,
    `命中画像信号: ${matchedSignals}`,
    `风险/排斥信号: ${blockedSignals}`,
    `客户画像摘要:\n${buildCustomerProfileInstruction(customer)}`,
    "",
    "执行要求:",
    "1. 这是主动营销触达，不是售后回复，也不是人工桌面接管任务。",
    "2. 最终只输出一段可直接发送给客户的消息正文，不要附加分析、标题、编号、引号或解释。",
    "3. 语气要像真人商务沟通，先体现分层策略，再结合客户画像做轻度个性化。",
    "4. 如果你判断当前客户不适合直接触达，只输出 [NEED_HUMAN] 后接一句原因，不要输出其它内容。",
    "5. 不要要求人工点击任何界面；如需信息核实，可自行联网检索后再给出最终消息。",
  ].join("\n");
}

function buildTierSummary(targets: CampaignDispatchTarget[]) {
  const tierCounts = targets.reduce(
    (acc, item) => {
      acc[item.customer.tier] += 1;
      return acc;
    },
    { prospect: 0, active: 0, vip: 0 },
  );

  return [
    tierCounts.prospect > 0 ? `潜在线索 ${tierCounts.prospect}` : "",
    tierCounts.active > 0 ? `活跃客户 ${tierCounts.active}` : "",
    tierCounts.vip > 0 ? `VIP ${tierCounts.vip}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

export async function maybeLaunchCampaignDispatchFromChat({
  instruction,
  sessionId,
  includeActiveProjectMemory = true,
}: {
  instruction: string;
  sessionId?: string;
  includeActiveProjectMemory?: boolean;
}): Promise<CampaignDispatchReport | null> {
  const intent = detectOutboundCampaignIntent(instruction);
  if (!intent) return null;

  const store = useStore.getState();
  const resolvedSessionId = sessionId ?? store.activeSessionId;
  const activeSession = store.chatSessions.find(session => session.id === resolvedSessionId) ?? null;
  const scopedCustomers = filterByProjectScope(store.businessCustomers, activeSession ?? {});
  const scopedChannelSessions = filterByProjectScope(store.businessChannelSessions, activeSession ?? {});

  if (store.automationMode !== "autonomous") {
    return {
      matched: true,
      blocked: true,
      launched: 0,
      targeted: 0,
      skipped: scopedCustomers.length,
      summary: "已识别到活动外呼指令，但当前不是自治模式，所以不会自动向客户发信；你仍可以先让鹦鹉螺规划话术。",
    };
  }

  if (!store.remoteSupervisorEnabled) {
    return {
      matched: true,
      blocked: true,
      launched: 0,
      targeted: 0,
      skipped: scopedCustomers.length,
      summary: "已识别到活动外呼指令，但远程值守当前未开启，无法自动向渠道客户发信。",
    };
  }

  if (store.wsStatus !== "connected") {
    return {
      matched: true,
      blocked: true,
      launched: 0,
      targeted: 0,
      skipped: scopedCustomers.length,
      summary: "已识别到活动外呼指令，但远程链路当前未连接，暂时无法自动发信。",
    };
  }

  if (scopedCustomers.length === 0) {
    return {
      matched: true,
      blocked: true,
      launched: 0,
      targeted: 0,
      skipped: 0,
      summary: "已识别到活动外呼指令，但当前项目下还没有可用于画像筛选的客户数据。",
    };
  }

  const targets: CampaignDispatchTarget[] = [];
  let skipped = 0;

  for (const customer of scopedCustomers) {
    const assessment = store.assessBusinessCustomerCampaignFit({
      customerId: customer.id,
      campaignBrief: intent.campaignBrief,
    });

    if (!assessment || assessment.decision === "skip") {
      skipped += 1;
      continue;
    }

    const session = pickBestCampaignSession(customer, scopedChannelSessions);
    if (!session) {
      skipped += 1;
      continue;
    }

    targets.push({
      customer,
      session,
      assessment,
    });
  }

  if (targets.length === 0) {
    return {
      matched: true,
      blocked: true,
      launched: 0,
      targeted: 0,
      skipped,
      summary: "已识别到活动外呼指令，但当前没有同时满足画像适配和可直连渠道的客户，因此没有自动发信。",
    };
  }

  let launched = 0;

  for (const target of targets) {
    const { customer, session, assessment } = target;
    const { ok, executionRunId } = await sendExecutionDispatch({
      instruction: buildCampaignDispatchInstruction(intent, target),
      source: "remote-ops",
      includeUserMessage: false,
      includeActiveProjectMemory,
      sessionId: resolvedSessionId,
      entityType: "channelSession",
      entityId: session.id,
      taskDescription: `[活动外呼][${getTierLabel(customer.tier)}] ${customer.name} · ${intent.headline}`,
    });

    store.recordBusinessOperation({
      entityType: "channelSession",
      entityId: session.id,
      eventType: "dispatch",
      trigger: "manual",
      status: ok ? "sent" : "blocked",
      title: `活动外呼 · ${customer.name}`,
      detail: ok
        ? `用户已在聊天区明确下达活动外呼指令，系统按 ${getTierLabel(customer.tier)} 画像启动本轮触达。适配判断 ${assessment.decision} (${assessment.score})。`
        : "用户已在聊天区明确下达活动外呼指令，但该客户会话的派发链路未成功建立。",
      executionRunId: ok ? executionRunId : undefined,
      externalRef: session.externalRef,
      failureReason: ok ? undefined : "campaign-dispatch-failed",
    });

    if (ok) {
      launched += 1;
    }
  }

  const tierSummary = buildTierSummary(targets);
  return {
    matched: true,
    blocked: false,
    launched,
    targeted: targets.length,
    skipped,
    summary:
      launched > 0
        ? `已按客户画像启动活动外呼：命中 ${targets.length} 位客户，成功派发 ${launched} 个渠道会话，跳过 ${skipped} 位不适配或无可用渠道的客户。${tierSummary ? `分层覆盖：${tierSummary}。` : ""}`
        : `活动外呼已识别，但 ${targets.length} 个目标会话都未成功建立派发链路；已跳过 ${skipped} 位不适配或无可用渠道的客户。`,
  };
}
