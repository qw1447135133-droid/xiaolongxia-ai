import type { AgentId } from "@/store/types";
import type {
  BusinessChannelSession,
  BusinessContentTask,
  BusinessCustomer,
  BusinessLead,
  BusinessTicket,
} from "@/types/business-entities";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const BUSINESS_ENTITY_LABELS = {
  customers: "客户",
  leads: "线索",
  tickets: "工单",
  contentTasks: "内容任务",
  channelSessions: "渠道会话",
} as const;

export const BUSINESS_LEAD_STAGES: BusinessLead["stage"][] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];

export const BUSINESS_TICKET_STATUSES: BusinessTicket["status"][] = [
  "new",
  "triaged",
  "waiting",
  "resolved",
  "closed",
];

export const BUSINESS_CONTENT_TASK_STATUSES: BusinessContentTask["status"][] = [
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
];

export const BUSINESS_CHANNEL_SESSION_STATUSES: BusinessChannelSession["status"][] = [
  "open",
  "active",
  "waiting",
  "closed",
];

export function createDemoBusinessDataset(scope: { projectId: string | null; rootPath: string | null }) {
  const now = Date.now();
  const base = {
    projectId: scope.projectId,
    rootPath: scope.rootPath,
    createdAt: now,
    updatedAt: now,
  };

  const customerId = makeId("customer");
  const sessionId = makeId("session");
  const leadId = makeId("lead");

  const customers: BusinessCustomer[] = [
    {
      ...base,
      id: customerId,
      name: "杭州青禾商贸",
      tier: "active",
      primaryChannel: "wecom",
      company: "青禾商贸",
      ownerAgentId: "greeter",
      tags: ["重点客户", "复购潜力"],
      summary: "主营家居收纳，近期希望扩展东南亚渠道，需要客服 SOP 和内容跟进。",
    },
  ];

  const channelSessions: BusinessChannelSession[] = [
    {
      ...base,
      id: sessionId,
      title: "企业微信 - 青禾商贸售前咨询",
      customerId,
      channel: "wecom",
      externalRef: "wecom:qinghe:pre-sale",
      status: "active",
      lastMessageAt: now - 15 * 60 * 1000,
      summary: "客户正在询问套餐、交付周期和能否用手机监管数字员工。",
    },
  ];

  const leads: BusinessLead[] = [
    {
      ...base,
      id: leadId,
      title: "青禾商贸 - 数字员工平台试用",
      customerId,
      source: "inbound",
      stage: "qualified",
      score: 78,
      nextAction: "提供试用方案和客服自动化演示路径",
      ownerAgentId: "explorer",
    },
  ];

  const tickets: BusinessTicket[] = [
    {
      ...base,
      id: makeId("ticket"),
      subject: "移动端监督流程咨询",
      customerId,
      channelSessionId: sessionId,
      status: "triaged",
      priority: "high",
      ownerAgentId: "greeter",
      summary: "用户想确认是否能在手机端查看状态、暂停自动化并手动接管。",
    },
  ];

  const contentTasks: BusinessContentTask[] = [
    {
      ...base,
      id: makeId("content"),
      title: "数字员工平台介绍短帖",
      customerId,
      leadId,
      channel: "blog",
      format: "post",
      goal: "生成一版可用于销售跟进和对外介绍的内容草稿",
      publishTargets: [
        { channel: "blog", accountLabel: "官网博客" },
        { channel: "x", accountLabel: "品牌账号" },
      ],
      status: "draft",
      priority: "normal",
      ownerAgentId: "writer",
      channelGovernance: [],
      riskyChannels: [],
      publishedLinks: [],
      publishedResults: [],
      brief: "围绕远程监督、自动化客服和值守模式写一版可转销售线索的介绍内容。",
    },
  ];

  return { customers, channelSessions, leads, tickets, contentTasks };
}

export function getBusinessPriorityTone(priority: "low" | "normal" | "high" | "urgent") {
  switch (priority) {
    case "urgent":
      return "#ef4444";
    case "high":
      return "#f59e0b";
    case "normal":
      return "#60a5fa";
    default:
      return "#94a3b8";
  }
}

export function getAgentLabel(agentId?: AgentId) {
  if (!agentId) return "未分配";
  return agentId;
}

function getNextValue<T extends string>(current: T, states: readonly T[]) {
  const index = states.indexOf(current);
  if (index < 0 || index === states.length - 1) return current;
  return states[index + 1]!;
}

export function getNextLeadStage(stage: BusinessLead["stage"]) {
  return getNextValue(stage, BUSINESS_LEAD_STAGES);
}

export function getNextTicketStatus(status: BusinessTicket["status"]) {
  return getNextValue(status, BUSINESS_TICKET_STATUSES);
}

export function getNextContentTaskStatus(status: BusinessContentTask["status"]) {
  return getNextValue(status, BUSINESS_CONTENT_TASK_STATUSES);
}

export function getNextChannelSessionStatus(status: BusinessChannelSession["status"]) {
  return getNextValue(status, BUSINESS_CHANNEL_SESSION_STATUSES);
}
