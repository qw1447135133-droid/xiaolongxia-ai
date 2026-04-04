import type {
  BusinessChannelSession,
  BusinessContentTask,
  BusinessCustomer,
  BusinessLead,
  BusinessTicket,
} from "@/types/business-entities";

export interface QuantDecision {
  score: number;
  autoRunEligible: boolean;
  humanApprovalRequired: boolean;
  summary: string;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreCustomerHealth(customer: BusinessCustomer): QuantDecision {
  let score = 40;
  if (customer.tier === "active") score += 20;
  if (customer.tier === "vip") score += 32;
  if (customer.company) score += 8;
  if (customer.tags.length > 0) score += Math.min(12, customer.tags.length * 4);
  if (customer.summary.trim().length > 24) score += 8;

  const normalized = clampScore(score);
  return {
    score: normalized,
    autoRunEligible: normalized >= 65,
    humanApprovalRequired: customer.tier === "vip",
    summary: normalized >= 75 ? "客户信息较完整，可支持自动化跟进。" : "客户画像仍偏薄，建议先补充资料。",
  };
}

export function scoreLead(lead: BusinessLead, customer?: BusinessCustomer | null): QuantDecision {
  let score = lead.score;
  if (lead.source === "inbound") score += 10;
  if (lead.source === "referral") score += 8;
  if (lead.stage === "qualified") score += 16;
  if (lead.stage === "proposal") score += 20;
  if (lead.stage === "won") score += 26;
  if (lead.stage === "lost") score -= 28;
  if (lead.nextAction.trim().length > 10) score += 8;
  if (customer?.tier === "active") score += 6;
  if (customer?.tier === "vip") score += 12;

  const normalized = clampScore(score);
  return {
    score: normalized,
    autoRunEligible: normalized >= 72 && lead.stage !== "proposal" && lead.stage !== "won" && lead.stage !== "lost",
    humanApprovalRequired: normalized >= 80 || lead.stage === "proposal",
    summary:
      normalized >= 80
        ? "线索成熟度高，可自动推进，但建议在报价前人工确认。"
        : normalized >= 60
          ? "线索具备继续跟进价值，适合半自动推进。"
          : "线索仍偏冷，先补信息再自动化更稳妥。",
  };
}

export function scoreTicket(ticket: BusinessTicket, customer?: BusinessCustomer | null, session?: BusinessChannelSession | null): QuantDecision {
  let score = 30;
  if (ticket.priority === "normal") score += 18;
  if (ticket.priority === "high") score += 34;
  if (ticket.priority === "urgent") score += 46;
  if (ticket.status === "triaged") score += 10;
  if (ticket.status === "waiting") score -= 6;
  if (ticket.status === "resolved" || ticket.status === "closed") score -= 20;
  if (customer?.tier === "vip") score += 12;
  if (session?.status === "active") score += 8;
  if (ticket.summary.trim().length > 16) score += 8;

  const normalized = clampScore(score);
  return {
    score: normalized,
    autoRunEligible: normalized < 70 && ticket.priority !== "urgent" && ticket.status !== "new",
    humanApprovalRequired: ticket.priority === "urgent" || customer?.tier === "vip" || normalized >= 78,
    summary:
      normalized >= 78
        ? "工单优先级高，建议人工盯盘或先审批再自动处理。"
        : normalized >= 55
          ? "工单可以按 SOP 半自动处理。"
          : "工单风险较低，可考虑全自动执行。",
  };
}

export function scoreContentTask(
  task: BusinessContentTask,
  customer?: BusinessCustomer | null,
  lead?: BusinessLead | null,
): QuantDecision {
  let score = 28;
  if (task.status === "draft") score += 10;
  if (task.status === "review") score += 18;
  if (task.status === "scheduled") score += 24;
  if (task.status === "published") score += 34;
  if (task.priority === "high") score += 16;
  if (task.priority === "urgent") score += 26;
  if (task.brief.trim().length > 24) score += 14;
  if (task.goal.trim().length > 12) score += 10;
  if (task.publishTargets.length > 0) score += Math.min(14, task.publishTargets.length * 6);
  if (task.latestDraftSummary?.trim()) score += 10;
  if (typeof task.scheduledFor === "number") score += 8;
  if (customer) score += 8;
  if (lead && lead.stage !== "lost") score += 8;
  if (task.channel === "x") score += 10;

  const normalized = clampScore(score);
  const autoRunEligible = task.status === "draft"
    ? normalized >= 60 && task.publishTargets.length > 0
    : task.status === "review"
      ? false
      : task.status === "scheduled"
        ? normalized >= 68
        : false;
  const humanApprovalRequired = task.status === "review"
    || task.channel === "x"
    || task.priority === "urgent"
    || normalized < 60;
  return {
    score: normalized,
    autoRunEligible,
    humanApprovalRequired,
    summary:
      task.status === "draft"
        ? normalized >= 70
          ? "内容素材与目标较完整，适合自动推进草稿生产。"
          : "内容目标或发布对象还不够清晰，先补足 brief 再进入草稿更稳。"
        : task.status === "review"
          ? "内容已进入审核阶段，默认需要人工确认后再推进。"
          : task.status === "scheduled"
            ? normalized >= 72
              ? "内容已具备排期准备条件，可自动进入发布准备链路。"
              : "内容虽已排期，但发布前信息还不够完整，建议人工复核。"
            : task.status === "published"
              ? "内容已发布，当前只需要结果回写与复盘，不建议重复自动派发。"
              : "内容已归档，默认不再进入自动化链路。",
  };
}

export function scoreChannelSession(session: BusinessChannelSession, customer?: BusinessCustomer | null): QuantDecision {
  let score = 36;
  if (session.status === "active") score += 18;
  if (session.status === "waiting") score += 8;
  if (session.channel === "wecom" || session.channel === "telegram") score += 8;
  if (customer?.tier === "active") score += 8;
  if (customer?.tier === "vip") score += 14;
  if (session.summary.trim().length > 16) score += 8;

  const normalized = clampScore(score);
  return {
    score: normalized,
    autoRunEligible: normalized >= 62 && session.status !== "closed",
    humanApprovalRequired: customer?.tier === "vip" || normalized >= 78,
    summary:
      normalized >= 74
        ? "会话活跃且上下文清晰，适合自动助手先接待。"
        : normalized >= 58
          ? "会话适合监督模式下自动回复。"
          : "会话上下文不足，建议先人工介入。",
  };
}

export function getDecisionTone(decision: QuantDecision) {
  if (decision.humanApprovalRequired) return "approval";
  if (decision.autoRunEligible) return "auto";
  return "watch";
}
