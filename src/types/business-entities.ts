import type { AgentId } from "@/store/types";

export type BusinessPriority = "low" | "normal" | "high" | "urgent";
export type BusinessEntityType = "customer" | "lead" | "ticket" | "contentTask" | "channelSession";
export type BusinessContentFormat = "post" | "thread" | "article" | "script" | "campaign";
export type BusinessContentChannel = "x" | "telegram" | "line" | "feishu" | "wecom" | "blog";
export type BusinessContentPublishTarget = {
  channel: BusinessContentChannel;
  accountLabel: string;
};
export type BusinessContentPublishResult = {
  id: string;
  channel: BusinessContentChannel;
  accountLabel: string;
  status: "completed" | "failed";
  publishedAt: number;
  link?: string;
  externalId?: string;
  summary?: string;
  executionRunId?: string;
  workflowRunId?: string;
  failureReason?: string;
};
export type BusinessContentNextCycleRecommendation = "reuse" | "retry" | "rewrite";
export type BusinessContentChannelRecommendation = "primary" | "secondary" | "risky";
export type BusinessContentChannelGovernance = {
  channel: BusinessContentChannel;
  completed: number;
  failed: number;
  recommendation: BusinessContentChannelRecommendation;
  lastPublishedAt?: number;
  lastFailureReason?: string;
};

export interface BusinessScopedEntity {
  id: string;
  projectId: string | null;
  rootPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessCustomer extends BusinessScopedEntity {
  name: string;
  tier: "prospect" | "active" | "vip";
  primaryChannel: "telegram" | "line" | "feishu" | "wecom" | "email" | "web";
  company?: string;
  ownerAgentId?: AgentId;
  tags: string[];
  summary: string;
}

export interface BusinessLead extends BusinessScopedEntity {
  title: string;
  customerId: string | null;
  source: "inbound" | "referral" | "campaign" | "manual";
  stage: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  score: number;
  nextAction: string;
  ownerAgentId?: AgentId;
}

export interface BusinessTicket extends BusinessScopedEntity {
  subject: string;
  customerId: string | null;
  channelSessionId: string | null;
  status: "new" | "triaged" | "waiting" | "resolved" | "closed";
  priority: BusinessPriority;
  ownerAgentId?: AgentId;
  summary: string;
}

export interface BusinessContentTask extends BusinessScopedEntity {
  title: string;
  customerId: string | null;
  leadId: string | null;
  channel: BusinessContentChannel;
  format: BusinessContentFormat;
  goal: string;
  publishTargets: BusinessContentPublishTarget[];
  status: "draft" | "review" | "scheduled" | "published" | "archived";
  priority: BusinessPriority;
  ownerAgentId?: AgentId;
  brief: string;
  scheduledFor?: number;
  latestDraftSummary?: string;
  latestPostmortemSummary?: string;
  nextCycleRecommendation?: BusinessContentNextCycleRecommendation;
  channelGovernance: BusinessContentChannelGovernance[];
  recommendedPrimaryChannel?: BusinessContentChannel;
  riskyChannels: BusinessContentChannel[];
  publishedLinks: string[];
  publishedResults: BusinessContentPublishResult[];
  lastExecutionRunId?: string;
  lastWorkflowRunId?: string;
  lastOperationAt?: number;
}

export interface BusinessChannelSession extends BusinessScopedEntity {
  title: string;
  customerId: string | null;
  channel: "telegram" | "line" | "feishu" | "wecom" | "email" | "web";
  externalRef: string;
  accountLabel?: string;
  participantLabel?: string;
  remoteUserId?: string;
  remoteThreadId?: string;
  lastExternalMessageId?: string;
  lastMessageDirection?: "inbound" | "outbound";
  lastDeliveryStatus?: "pending" | "sent" | "delivered" | "failed";
  lastDeliveryError?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  requiresReply?: boolean;
  lastHandledAt?: number;
  handledBy?: AgentId | "manual";
  lastSyncedAt?: number;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  lastOutboundText?: string;
  lastFailedOutboundText?: string;
  lastExecutionRunId?: string;
  lastWorkflowRunId?: string;
  status: "open" | "active" | "waiting" | "closed";
  lastMessageAt: number;
  summary: string;
}

export interface BusinessApprovalRecord extends BusinessScopedEntity {
  entityType: BusinessEntityType;
  entityId: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
  decidedAt?: number;
  note?: string;
}

export interface BusinessOperationRecord extends BusinessScopedEntity {
  entityType: BusinessEntityType;
  entityId: string;
  eventType: "approval" | "dispatch" | "workflow" | "publish" | "governance" | "desktop" | "connector" | "message";
  trigger: "manual" | "auto";
  status: "pending" | "approved" | "rejected" | "sent" | "blocked" | "completed" | "failed";
  title: string;
  detail: string;
  executionRunId?: string;
  workflowRunId?: string;
  externalRef?: string;
  failureReason?: string;
}
