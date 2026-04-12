import type { AgentId } from "@/store/types";
import type {
  BusinessChannelSession,
  BusinessContentTask,
  BusinessCustomer,
  BusinessLead,
  BusinessTicket,
} from "@/types/business-entities";
import { normalizeBusinessCustomer } from "@/lib/customer-profile-schema";

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
  const customerId2 = makeId("customer");
  const customerId3 = makeId("customer");
  const sessionId = makeId("session");
  const sessionId2 = makeId("session");
  const sessionId3 = makeId("session");
  const leadId = makeId("lead");
  const leadId2 = makeId("lead");
  const leadId3 = makeId("lead");

  const customers: BusinessCustomer[] = [
    normalizeBusinessCustomer({
      ...base,
      id: customerId,
      name: "杭州青禾商贸",
      tier: "active",
      primaryChannel: "wecom",
      company: "青禾商贸",
      ownerAgentId: "greeter",
      tags: ["重点客户", "复购潜力"],
      summary: "主营家居收纳，近期希望扩展东南亚渠道，需要客服 SOP 和内容跟进。",
      crmProfile: {
        basic: {
          companyName: "青禾商贸",
          industry: "家居收纳",
          salesProducts: ["收纳用品", "家居用品"],
          socialAccounts: [],
        },
        interaction: {
          callRecords: [],
          smsRecords: [],
          meetingRecords: ["已沟通过东南亚渠道扩张计划"],
          preSalesNeeds: ["客服 SOP", "内容跟进", "渠道扩张支持"],
          supportCases: [],
          issueReports: [],
          afterSalesNeeds: [],
          inquiryHistory: ["近期多次询问内容营销和渠道拓展"],
          preferredContactMethods: ["wecom"],
          recentConversationSummary: "客户希望把客服 SOP 与内容运营一起打包推进。",
        },
        transaction: {
          recentPurchases: [],
          orderStatuses: [],
          returnAndRefundHistory: [],
          paymentMethods: [],
          shippingAddresses: [],
          logisticsMethods: [],
          seasonalPurchasePatterns: ["旺季前集中备货"],
          upsellSignals: ["对跨境渠道扩张有明确预算意愿"],
          crossSellSignals: ["可同步推荐内容营销和自动化客服"],
        },
        behavior: {
          websiteBehaviors: [],
          interests: ["东南亚渠道", "内容营销", "客服自动化"],
          favoriteItems: [],
          abandonedCartSignals: [],
          subscriptionTopics: ["跨境增长", "客服 SOP"],
          campaignParticipations: ["参加过增长咨询"],
          surveyResponses: [],
          couponEngagement: [],
        },
        derived: {
          completenessScore: 0,
          fitKeywords: ["渠道扩张", "内容营销", "客服 SOP"],
          excludedKeywords: [],
          pushSensitivity: "low",
        },
      },
      channelIdentities: [
        {
          channel: "wecom",
          externalRef: "wecom:qinghe:pre-sale",
          remoteUserId: "wecom-user-qinghe",
          participantLabel: "王经理",
          accountLabel: "售前接待号",
          lastSeenAt: now,
        },
      ],
      linkedSessionIds: [sessionId],
      campaignPreferences: {
        preferredTopics: ["渠道扩张", "跨境增长", "客服自动化"],
        excludedTopics: [],
        preferredChannels: ["wecom"],
        preferredFormats: ["campaign", "post"],
      },
    }),
    normalizeBusinessCustomer({
      ...base,
      id: customerId2,
      name: "上海云栖软件",
      tier: "prospect",
      primaryChannel: "feishu",
      company: "云栖软件",
      ownerAgentId: "greeter",
      tags: ["低置信度", "待人工演示"],
      summary: "正在评估数字员工平台，重点关注人工审批、人工接管和日志可追踪性。",
      crmProfile: {
        basic: {
          companyName: "云栖软件",
          industry: "企业软件",
          salesProducts: ["协同软件", "企业服务"],
          socialAccounts: [],
        },
        interaction: {
          callRecords: [],
          smsRecords: [],
          meetingRecords: ["要求先看人工审批演示"],
          preSalesNeeds: ["人工审批", "人工接管", "日志追踪"],
          supportCases: [],
          issueReports: [],
          afterSalesNeeds: [],
          inquiryHistory: ["关注自动回复是否可先给草稿再发送"],
          preferredContactMethods: ["feishu"],
          preferredContactTime: "工作日白天",
          recentConversationSummary: "客户对自动回复很谨慎，需要明确的人审机制。",
        },
        transaction: {
          recentPurchases: [],
          orderStatuses: [],
          returnAndRefundHistory: [],
          paymentMethods: [],
          shippingAddresses: [],
          logisticsMethods: [],
          seasonalPurchasePatterns: [],
          upsellSignals: [],
          crossSellSignals: [],
        },
        behavior: {
          websiteBehaviors: [],
          interests: ["合规审计", "人工审批", "交付可追踪性"],
          favoriteItems: [],
          abandonedCartSignals: [],
          subscriptionTopics: ["审批流", "风险控制"],
          campaignParticipations: [],
          surveyResponses: [],
          couponEngagement: [],
        },
        derived: {
          completenessScore: 0,
          fitKeywords: ["人工审批", "人工接管", "审计日志"],
          excludedKeywords: ["全自动无人审核"],
          pushSensitivity: "high",
        },
      },
      channelIdentities: [
        {
          channel: "feishu",
          externalRef: "feishu:yunqi:manual-review",
          remoteUserId: "feishu-user-yunqi",
          participantLabel: "刘总",
          accountLabel: "方案咨询号",
          lastSeenAt: now,
        },
      ],
      linkedSessionIds: [sessionId2],
      campaignPreferences: {
        preferredTopics: ["人工审批", "审计日志", "人工接管"],
        excludedTopics: ["无人审核全自动发送"],
        preferredChannels: ["feishu"],
        preferredFormats: ["post", "article"],
      },
    }),
    normalizeBusinessCustomer({
      ...base,
      id: customerId3,
      name: "广州星链贸易",
      tier: "active",
      primaryChannel: "wecom",
      company: "星链贸易",
      ownerAgentId: "greeter",
      tags: ["桌面接管", "高意向"],
      summary: "希望把微信和飞书也纳入数字员工值守，需要看到桌面应用接管与失败恢复。",
      crmProfile: {
        basic: {
          companyName: "星链贸易",
          industry: "贸易",
          salesProducts: ["跨境贸易", "渠道代理"],
          socialAccounts: [],
        },
        interaction: {
          callRecords: [],
          smsRecords: [],
          meetingRecords: ["重点关注桌面接管演示"],
          preSalesNeeds: ["桌面接管", "失败恢复", "多平台值守"],
          supportCases: [],
          issueReports: [],
          afterSalesNeeds: [],
          inquiryHistory: ["希望微信和飞书统一纳管"],
          preferredContactMethods: ["wecom"],
          recentConversationSummary: "客户希望看到真实桌面接管、失败恢复和续跑能力。",
        },
        transaction: {
          recentPurchases: [],
          orderStatuses: [],
          returnAndRefundHistory: [],
          paymentMethods: [],
          shippingAddresses: [],
          logisticsMethods: [],
          seasonalPurchasePatterns: [],
          upsellSignals: ["有明确的多平台扩张需求"],
          crossSellSignals: ["适合一起推荐会话治理与自动值守"],
        },
        behavior: {
          websiteBehaviors: [],
          interests: ["桌面接管", "故障恢复", "多平台值守"],
          favoriteItems: [],
          abandonedCartSignals: [],
          subscriptionTopics: ["桌面自动化", "失败恢复"],
          campaignParticipations: [],
          surveyResponses: [],
          couponEngagement: [],
        },
        derived: {
          completenessScore: 0,
          fitKeywords: ["桌面接管", "失败恢复", "多平台值守"],
          excludedKeywords: [],
          pushSensitivity: "medium",
        },
      },
      channelIdentities: [
        {
          channel: "wecom",
          externalRef: "wecom:xinglian:desktop-handoff",
          remoteUserId: "wecom-user-xinglian",
          participantLabel: "陈主管",
          accountLabel: "售后接待号",
          lastSeenAt: now,
        },
      ],
      linkedSessionIds: [sessionId3],
      campaignPreferences: {
        preferredTopics: ["桌面接管", "失败恢复", "多平台值守"],
        excludedTopics: [],
        preferredChannels: ["wecom"],
        preferredFormats: ["campaign", "post"],
      },
    }),
  ];

  const channelSessions: BusinessChannelSession[] = [
    {
      ...base,
      id: sessionId,
      title: "企业微信 - 青禾商贸售前咨询",
      customerId,
      channel: "wecom",
      externalRef: "wecom:qinghe:pre-sale",
      accountLabel: "售前接待号",
      participantLabel: "王经理",
      remoteUserId: "wecom-user-qinghe",
      remoteThreadId: "wecom-thread-pre-sale",
      lastExternalMessageId: "msg-wecom-001",
      lastMessageDirection: "inbound",
      lastDeliveryStatus: "delivered",
      lastMessagePreview: "想确认是否能用手机监督数字员工的客服和销售流程。",
      unreadCount: 2,
      requiresReply: true,
      status: "active",
      lastMessageAt: now - 15 * 60 * 1000,
      summary: "客户正在询问套餐、交付周期和能否用手机监管数字员工。",
    },
    {
      ...base,
      id: sessionId2,
      title: "飞书 - 云栖软件方案确认",
      customerId: customerId2,
      channel: "feishu",
      externalRef: "feishu:yunqi:manual-review",
      accountLabel: "方案咨询号",
      participantLabel: "刘总",
      remoteUserId: "feishu-user-yunqi",
      remoteThreadId: "feishu-thread-manual-review",
      lastExternalMessageId: "msg-feishu-002",
      lastMessageDirection: "inbound",
      lastDeliveryStatus: "delivered",
      lastMessagePreview: "你们自动回复能不能先给草稿，我这边确认后再发？",
      unreadCount: 1,
      requiresReply: true,
      status: "waiting",
      lastMessageAt: now - 9 * 60 * 1000,
      summary: "用户对自动回复置信度不足，希望进入人工审批或人工接管流程。",
    },
    {
      ...base,
      id: sessionId3,
      title: "企业微信 - 星链贸易桌面接管",
      customerId: customerId3,
      channel: "wecom",
      externalRef: "wecom:xinglian:desktop-handoff",
      accountLabel: "售后接待号",
      participantLabel: "陈主管",
      remoteUserId: "wecom-user-xinglian",
      remoteThreadId: "wecom-thread-desktop-handoff",
      lastExternalMessageId: "msg-wecom-003",
      lastMessageDirection: "outbound",
      lastDeliveryStatus: "failed",
      lastDeliveryError: "桌面端企业微信未定位到发送按钮，自动发送被阻断。",
      lastMessagePreview: "这边先给您发一个演示账号与试用安排，方便您内部评估。",
      lastOutboundText: "这边先给您发一个演示账号与试用安排，方便您内部评估。",
      lastFailedOutboundText: "这边先给您发一个演示账号与试用安排，方便您内部评估。",
      unreadCount: 0,
      requiresReply: true,
      status: "waiting",
      lastMessageAt: now - 4 * 60 * 1000,
      summary: "自动发送在桌面端被阻断，需要人工接管后继续完成回复。",
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
    {
      ...base,
      id: leadId2,
      title: "云栖软件 - 人工审批演示",
      customerId: customerId2,
      source: "manual",
      stage: "proposal",
      score: 72,
      nextAction: "演示低置信度转人工和审批后继续发送",
      ownerAgentId: "greeter",
    },
    {
      ...base,
      id: leadId3,
      title: "星链贸易 - 桌面接管演示",
      customerId: customerId3,
      source: "inbound",
      stage: "proposal",
      score: 84,
      nextAction: "演示桌面应用接管、失败重试和恢复续跑",
      ownerAgentId: "greeter",
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
    {
      ...base,
      id: makeId("ticket"),
      subject: "人工审批回复确认",
      customerId: customerId2,
      channelSessionId: sessionId2,
      status: "waiting",
      priority: "high",
      ownerAgentId: "greeter",
      summary: "用户希望客服回复先出草稿再确认发送，适合演示低置信度转人工。",
    },
    {
      ...base,
      id: makeId("ticket"),
      subject: "桌面端发送失败恢复",
      customerId: customerId3,
      channelSessionId: sessionId3,
      status: "triaged",
      priority: "urgent",
      ownerAgentId: "greeter",
      summary: "桌面端发送失败，需要切到桌面接管并从原执行链路继续。",
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
    {
      ...base,
      id: makeId("content"),
      title: "低置信度转人工演示话术",
      customerId: customerId2,
      leadId: leadId2,
      channel: "feishu",
      format: "post",
      goal: "给销售演示一条先自动起草、再人工确认的客服回复",
      publishTargets: [
        { channel: "feishu", accountLabel: "方案咨询号" },
      ],
      status: "review",
      priority: "high",
      ownerAgentId: "writer",
      channelGovernance: [],
      riskyChannels: ["feishu"],
      publishedLinks: [],
      publishedResults: [],
      brief: "围绕审批后发送、人工接管和低置信度场景准备一版演示回复。",
    },
    {
      ...base,
      id: makeId("content"),
      title: "桌面接管恢复说明",
      customerId: customerId3,
      leadId: leadId3,
      channel: "wecom",
      format: "post",
      goal: "演示桌面端接管后如何恢复继续发送并保留审计",
      publishTargets: [
        { channel: "wecom", accountLabel: "售后接待号" },
      ],
      status: "scheduled",
      priority: "urgent",
      ownerAgentId: "writer",
      channelGovernance: [],
      riskyChannels: ["wecom"],
      publishedLinks: [],
      publishedResults: [],
      brief: "为桌面端微信/飞书/企业微信接管场景准备一条可恢复的客服回复与说明。",
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
