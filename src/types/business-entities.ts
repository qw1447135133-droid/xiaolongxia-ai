import type { AgentId } from "@/store/types";

export type BusinessPriority = "low" | "normal" | "high" | "urgent";
export type BusinessEntityType = "customer" | "lead" | "ticket" | "contentTask" | "channelSession";

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
  channel: "x" | "telegram" | "line" | "feishu" | "wecom" | "blog";
  status: "draft" | "review" | "scheduled" | "published" | "archived";
  priority: BusinessPriority;
  ownerAgentId?: AgentId;
  brief: string;
}

export interface BusinessChannelSession extends BusinessScopedEntity {
  title: string;
  customerId: string | null;
  channel: "telegram" | "line" | "feishu" | "wecom" | "email" | "web";
  externalRef: string;
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
  eventType: "approval" | "dispatch";
  trigger: "manual" | "auto";
  status: "pending" | "approved" | "rejected" | "sent" | "blocked";
  title: string;
  detail: string;
  executionRunId?: string;
}
