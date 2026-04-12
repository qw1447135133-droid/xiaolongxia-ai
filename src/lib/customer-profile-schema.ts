import type {
  BusinessChannelSession,
  BusinessContentFormat,
  BusinessCustomer,
  BusinessCustomerCampaignAssessment,
  BusinessCustomerCampaignDecision,
  BusinessCustomerCampaignPreferences,
  BusinessCustomerChannelIdentity,
  BusinessCustomerCrmProfile,
  BusinessCustomerPrimaryChannel,
} from "@/types/business-entities";

export const CUSTOMER_PROFILE_SECTION_TITLES = {
  basic: "基本联络与个人资料",
  interaction: "互动记录与沟通历史",
  transaction: "购买纪录与交易数据",
  behavior: "行为与偏好数据",
} as const;

const KNOWN_PRIMARY_CHANNELS: BusinessCustomerPrimaryChannel[] = [
  "telegram",
  "line",
  "feishu",
  "wecom",
  "email",
  "web",
];

const KNOWN_CONTENT_FORMATS: BusinessContentFormat[] = [
  "post",
  "thread",
  "article",
  "script",
  "campaign",
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map(value => normalizeText(value)).filter(Boolean)));
}

function normalizeStringArray(value: unknown) {
  return uniqueStrings(Array.isArray(value) ? value as string[] : []);
}

function normalizePrimaryChannels(value: unknown) {
  return uniqueStrings(Array.isArray(value) ? value as string[] : [])
    .filter((item): item is BusinessCustomerPrimaryChannel =>
      KNOWN_PRIMARY_CHANNELS.includes(item as BusinessCustomerPrimaryChannel),
    );
}

function normalizeContentFormats(value: unknown) {
  return uniqueStrings(Array.isArray(value) ? value as string[] : [])
    .filter((item): item is BusinessContentFormat =>
      KNOWN_CONTENT_FORMATS.includes(item as BusinessContentFormat),
    );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function isLikelyPlaceholderIdentity(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return true;
  return (
    /^(?:chat|user|room|group|open_id|chat_id|user_id):/.test(normalized)
    || /^(?:telegram|line|feishu|wecom):/.test(normalized)
    || /^[0-9:_-]{6,}$/.test(normalized)
  );
}

function pickMeaningfulIdentity(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && !isLikelyPlaceholderIdentity(normalized)) {
      return normalized;
    }
  }
  return "";
}

function formatCurrency(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function pushLine(lines: string[], label: string, value: unknown, fallback = "") {
  if (Array.isArray(value)) {
    const normalized = uniqueStrings(value);
    if (normalized.length > 0) {
      lines.push(`${label}：${normalized.join("、")}`);
      return;
    }
  } else if (typeof value === "number" && Number.isFinite(value)) {
    lines.push(`${label}：${value}`);
    return;
  } else {
    const normalized = normalizeText(value);
    if (normalized) {
      lines.push(`${label}：${normalized}`);
      return;
    }
  }

  if (fallback) {
    lines.push(`${label}：${fallback}`);
  }
}

export function createDefaultCampaignPreferences(): BusinessCustomerCampaignPreferences {
  return {
    preferredTopics: [],
    excludedTopics: [],
    preferredChannels: [],
    preferredFormats: [],
    preferredContactWindow: "",
    notes: "",
  };
}

export function createEmptyCustomerProfile(seed?: {
  name?: string;
  company?: string;
}): BusinessCustomerCrmProfile {
  const contactName = pickMeaningfulIdentity(seed?.name);
  const companyName = normalizeText(seed?.company);

  return {
    basic: {
      contactName: contactName || undefined,
      companyName: companyName || undefined,
      salesProducts: [],
      socialAccounts: [],
    },
    interaction: {
      callRecords: [],
      smsRecords: [],
      meetingRecords: [],
      preSalesNeeds: [],
      supportCases: [],
      issueReports: [],
      afterSalesNeeds: [],
      inquiryHistory: [],
      preferredContactMethods: [],
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
      interests: [],
      favoriteItems: [],
      abandonedCartSignals: [],
      subscriptionTopics: [],
      campaignParticipations: [],
      surveyResponses: [],
      couponEngagement: [],
    },
    derived: {
      completenessScore: 0,
      fitKeywords: [],
      excludedKeywords: [],
      pushSensitivity: "medium",
      campaignAffinitySummary: "",
    },
  };
}

export function computeCustomerProfileCompleteness(profile: BusinessCustomerCrmProfile) {
  const checkpoints = [
    profile.basic.contactName,
    profile.basic.companyName,
    profile.basic.jobTitle,
    profile.basic.mobile,
    profile.basic.workEmail,
    profile.basic.industry,
    profile.basic.salesProducts.length > 0 ? "1" : "",
    profile.interaction.recentConversationSummary,
    profile.interaction.preSalesNeeds.length > 0 ? "1" : "",
    profile.interaction.preferredContactMethods.length > 0 ? "1" : "",
    profile.transaction.purchaseSummary,
    profile.transaction.totalSpend,
    profile.transaction.paymentMethods.length > 0 ? "1" : "",
    profile.behavior.interests.length > 0 ? "1" : "",
    profile.behavior.subscriptionTopics.length > 0 ? "1" : "",
    profile.behavior.membershipLevel,
    profile.derived.fitKeywords.length > 0 ? "1" : "",
    profile.derived.excludedKeywords.length > 0 ? "1" : "",
  ];

  const filled = checkpoints.filter(value => {
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(normalizeText(value));
  }).length;
  return clampScore((filled / checkpoints.length) * 100);
}

export function normalizeCustomerProfile(
  value: Partial<BusinessCustomerCrmProfile> | undefined,
  seed?: { name?: string; company?: string },
): BusinessCustomerCrmProfile {
  const base = createEmptyCustomerProfile(seed);
  const next: BusinessCustomerCrmProfile = {
    basic: {
      ...base.basic,
      ...(value?.basic ?? {}),
      contactName: pickString(value?.basic?.contactName, base.basic.contactName),
      companyName: pickString(value?.basic?.companyName, seed?.company, base.basic.companyName),
      salesProducts: uniqueStrings([
        ...base.basic.salesProducts,
        ...normalizeStringArray(value?.basic?.salesProducts),
      ]),
      socialAccounts: uniqueStrings([
        ...base.basic.socialAccounts,
        ...normalizeStringArray(value?.basic?.socialAccounts),
      ]),
    },
    interaction: {
      ...base.interaction,
      ...(value?.interaction ?? {}),
      callRecords: normalizeStringArray(value?.interaction?.callRecords),
      smsRecords: normalizeStringArray(value?.interaction?.smsRecords),
      meetingRecords: normalizeStringArray(value?.interaction?.meetingRecords),
      preSalesNeeds: normalizeStringArray(value?.interaction?.preSalesNeeds),
      supportCases: normalizeStringArray(value?.interaction?.supportCases),
      issueReports: normalizeStringArray(value?.interaction?.issueReports),
      afterSalesNeeds: normalizeStringArray(value?.interaction?.afterSalesNeeds),
      inquiryHistory: normalizeStringArray(value?.interaction?.inquiryHistory),
      preferredContactMethods: normalizeStringArray(value?.interaction?.preferredContactMethods),
    },
    transaction: {
      ...base.transaction,
      ...(value?.transaction ?? {}),
      recentPurchases: normalizeStringArray(value?.transaction?.recentPurchases),
      orderStatuses: normalizeStringArray(value?.transaction?.orderStatuses),
      returnAndRefundHistory: normalizeStringArray(value?.transaction?.returnAndRefundHistory),
      paymentMethods: normalizeStringArray(value?.transaction?.paymentMethods),
      shippingAddresses: normalizeStringArray(value?.transaction?.shippingAddresses),
      logisticsMethods: normalizeStringArray(value?.transaction?.logisticsMethods),
      seasonalPurchasePatterns: normalizeStringArray(value?.transaction?.seasonalPurchasePatterns),
      upsellSignals: normalizeStringArray(value?.transaction?.upsellSignals),
      crossSellSignals: normalizeStringArray(value?.transaction?.crossSellSignals),
    },
    behavior: {
      ...base.behavior,
      ...(value?.behavior ?? {}),
      websiteBehaviors: normalizeStringArray(value?.behavior?.websiteBehaviors),
      interests: normalizeStringArray(value?.behavior?.interests),
      favoriteItems: normalizeStringArray(value?.behavior?.favoriteItems),
      abandonedCartSignals: normalizeStringArray(value?.behavior?.abandonedCartSignals),
      subscriptionTopics: normalizeStringArray(value?.behavior?.subscriptionTopics),
      campaignParticipations: normalizeStringArray(value?.behavior?.campaignParticipations),
      surveyResponses: normalizeStringArray(value?.behavior?.surveyResponses),
      couponEngagement: normalizeStringArray(value?.behavior?.couponEngagement),
    },
    derived: {
      ...base.derived,
      ...(value?.derived ?? {}),
      fitKeywords: normalizeStringArray(value?.derived?.fitKeywords),
      excludedKeywords: normalizeStringArray(value?.derived?.excludedKeywords),
      pushSensitivity: value?.derived?.pushSensitivity === "low"
        || value?.derived?.pushSensitivity === "high"
        ? value.derived.pushSensitivity
        : "medium",
    },
  };

  next.derived.completenessScore = computeCustomerProfileCompleteness(next);
  return next;
}

export function normalizeCustomerCampaignPreferences(
  value: Partial<BusinessCustomerCampaignPreferences> | undefined,
): BusinessCustomerCampaignPreferences {
  const base = createDefaultCampaignPreferences();
  return {
    ...base,
    ...value,
    preferredTopics: normalizeStringArray(value?.preferredTopics),
    excludedTopics: normalizeStringArray(value?.excludedTopics),
    preferredChannels: normalizePrimaryChannels(value?.preferredChannels),
    preferredFormats: normalizeContentFormats(value?.preferredFormats),
    preferredContactWindow: pickString(value?.preferredContactWindow),
    notes: pickString(value?.notes),
  };
}

export function normalizeCustomerChannelIdentities(
  value: unknown,
): BusinessCustomerChannelIdentity[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const identities: BusinessCustomerChannelIdentity[] = [];

  for (const item of value) {
    const identity = item as Partial<BusinessCustomerChannelIdentity>;
    const channel = normalizeText(identity.channel) as BusinessCustomerPrimaryChannel;
    const externalRef = normalizeText(identity.externalRef);
    if (!KNOWN_PRIMARY_CHANNELS.includes(channel) || !externalRef) continue;

    const dedupeKey = `${channel}:${externalRef}:${normalizeText(identity.remoteUserId)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    identities.push({
      channel,
      externalRef,
      remoteUserId: pickString(identity.remoteUserId) || undefined,
      participantLabel: pickString(identity.participantLabel) || undefined,
      accountLabel: pickString(identity.accountLabel) || undefined,
      sourceSessionId: pickString(identity.sourceSessionId) || undefined,
      lastMessageAt: typeof identity.lastMessageAt === "number" ? identity.lastMessageAt : undefined,
      lastInboundAt: typeof identity.lastInboundAt === "number" ? identity.lastInboundAt : undefined,
      lastOutboundAt: typeof identity.lastOutboundAt === "number" ? identity.lastOutboundAt : undefined,
      lastSeenAt: typeof identity.lastSeenAt === "number" ? identity.lastSeenAt : Date.now(),
    });
  }

  return identities.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

export function buildCustomerIdentityFromSession(session: Pick<
  BusinessChannelSession,
  "id" | "channel" | "externalRef" | "remoteUserId" | "participantLabel" | "accountLabel" | "lastMessageAt" | "lastInboundAt" | "lastOutboundAt"
>): BusinessCustomerChannelIdentity {
  return {
    channel: session.channel,
    externalRef: session.externalRef,
    remoteUserId: pickString(session.remoteUserId) || undefined,
    participantLabel: pickMeaningfulIdentity(session.participantLabel) || undefined,
    accountLabel: pickString(session.accountLabel) || undefined,
    sourceSessionId: pickString(session.id) || undefined,
    lastMessageAt: typeof session.lastMessageAt === "number" ? session.lastMessageAt : undefined,
    lastInboundAt: typeof session.lastInboundAt === "number" ? session.lastInboundAt : undefined,
    lastOutboundAt: typeof session.lastOutboundAt === "number" ? session.lastOutboundAt : undefined,
    lastSeenAt: typeof session.lastMessageAt === "number" ? session.lastMessageAt : Date.now(),
  };
}

export function inferCustomerDisplayNameFromSession(session: Pick<
  BusinessChannelSession,
  "participantLabel" | "title" | "externalRef" | "remoteUserId"
>) {
  const fromTitle = pickMeaningfulIdentity(
    normalizeText(session.title).split("·").at(-1),
  );
  return pickMeaningfulIdentity(
    session.participantLabel,
    fromTitle,
    session.remoteUserId,
    session.externalRef,
  );
}

export function mergeCustomerIdentity(
  identities: BusinessCustomerChannelIdentity[],
  nextIdentity: BusinessCustomerChannelIdentity,
) {
  return normalizeCustomerChannelIdentities([
    nextIdentity,
    ...identities.filter(item =>
      !(
        item.channel === nextIdentity.channel
        && item.externalRef === nextIdentity.externalRef
        && normalizeText(item.remoteUserId) === normalizeText(nextIdentity.remoteUserId)
      )
    ),
  ]);
}

export function applyChannelSessionToCustomerProfile(
  currentProfile: Partial<BusinessCustomerCrmProfile> | undefined,
  session: Pick<
    BusinessChannelSession,
    "channel" | "participantLabel" | "summary" | "lastMessagePreview" | "lastMessageAt"
  >,
  seed?: { name?: string; company?: string },
) {
  const current = normalizeCustomerProfile(currentProfile, seed);
  const recentSummary = pickString(session.summary, session.lastMessagePreview);
  const contactName = pickMeaningfulIdentity(session.participantLabel, current.basic.contactName, seed?.name);

  return normalizeCustomerProfile({
    ...current,
    basic: {
      ...current.basic,
      contactName: contactName || current.basic.contactName,
    },
    interaction: {
      ...current.interaction,
      preferredContactMethods: uniqueStrings([
        ...current.interaction.preferredContactMethods,
        session.channel,
      ]),
      inquiryHistory: recentSummary
        ? uniqueStrings([recentSummary, ...current.interaction.inquiryHistory]).slice(0, 12)
        : current.interaction.inquiryHistory,
      recentConversationSummary: recentSummary || current.interaction.recentConversationSummary,
    },
  }, seed);
}

export function normalizeBusinessCustomer(customer: Partial<BusinessCustomer> & {
  id: string;
  name: string;
  tier: BusinessCustomer["tier"];
  primaryChannel: BusinessCustomerPrimaryChannel;
  summary: string;
  createdAt: number;
  updatedAt: number;
  projectId: string | null;
  rootPath: string | null;
}): BusinessCustomer {
  const crmProfile = normalizeCustomerProfile(customer.crmProfile, {
    name: customer.name,
    company: customer.company,
  });
  const campaignPreferences = normalizeCustomerCampaignPreferences(customer.campaignPreferences);
  const profileLastUpdatedAt =
    typeof customer.profileLastUpdatedAt === "number"
      ? customer.profileLastUpdatedAt
      : customer.updatedAt;

  return {
    ...customer,
    company: pickString(customer.company) || undefined,
    ownerAgentId: customer.ownerAgentId,
    tags: normalizeStringArray(customer.tags),
    summary: pickString(customer.summary),
    crmProfile,
    channelIdentities: normalizeCustomerChannelIdentities(customer.channelIdentities),
    linkedSessionIds: normalizeStringArray(customer.linkedSessionIds),
    profileCompletenessScore: crmProfile.derived.completenessScore,
    profileLastUpdatedAt,
    campaignPreferences,
    lastCampaignAssessment: customer.lastCampaignAssessment
      ? normalizeCampaignAssessment(customer.lastCampaignAssessment)
      : undefined,
  };
}

function normalizeCampaignAssessment(
  value: Partial<BusinessCustomerCampaignAssessment>,
): BusinessCustomerCampaignAssessment {
  const score = clampScore(Number(value.score ?? 0));
  const decision: BusinessCustomerCampaignDecision =
    value.decision === "recommended" || value.decision === "skip" ? value.decision : "watch";

  return {
    campaignBrief: pickString(value.campaignBrief),
    score,
    decision,
    reasons: normalizeStringArray(value.reasons),
    matchedSignals: normalizeStringArray(value.matchedSignals),
    blockedSignals: normalizeStringArray(value.blockedSignals),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
  };
}

export function findCustomerByChannelSession(
  customers: BusinessCustomer[],
  session: Pick<BusinessChannelSession, "channel" | "externalRef" | "remoteUserId" | "participantLabel">,
) {
  const externalRef = normalizeText(session.externalRef);
  const remoteUserId = normalizeText(session.remoteUserId);
  const participantLabel = pickMeaningfulIdentity(session.participantLabel);

  return customers.find(customer =>
    customer.channelIdentities.some(identity =>
      identity.channel === session.channel
      && (
        identity.externalRef === externalRef
        || (remoteUserId && normalizeText(identity.remoteUserId) === remoteUserId)
        || (participantLabel && normalizeText(identity.participantLabel) === participantLabel)
      ),
    ),
  ) ?? null;
}

function collectPositiveCampaignKeywords(customer: BusinessCustomer) {
  return uniqueStrings([
    ...customer.campaignPreferences.preferredTopics,
    ...customer.crmProfile.derived.fitKeywords,
    ...customer.crmProfile.basic.salesProducts,
    ...customer.crmProfile.interaction.preSalesNeeds,
    ...customer.crmProfile.behavior.interests,
    ...customer.crmProfile.behavior.subscriptionTopics,
    ...customer.tags,
  ]);
}

function collectNegativeCampaignKeywords(customer: BusinessCustomer) {
  return uniqueStrings([
    ...customer.campaignPreferences.excludedTopics,
    ...customer.crmProfile.derived.excludedKeywords,
  ]);
}

export function scoreCustomerCampaignFit(customer: BusinessCustomer, campaignBrief: string) {
  const brief = normalizeText(campaignBrief).toLowerCase();
  const matchedSignals = collectPositiveCampaignKeywords(customer)
    .filter(keyword => brief.includes(keyword.toLowerCase()));
  const blockedSignals = collectNegativeCampaignKeywords(customer)
    .filter(keyword => brief.includes(keyword.toLowerCase()));

  let score = 42 + Math.round(customer.profileCompletenessScore * 0.22);
  const reasons: string[] = [];

  if (matchedSignals.length > 0) {
    score += Math.min(28, 8 + matchedSignals.length * 6);
    reasons.push(`命中客户偏好/需求关键词：${matchedSignals.join("、")}`);
  } else {
    score -= 8;
    reasons.push("暂未命中明显的客户兴趣或需求关键词。");
  }

  if (blockedSignals.length > 0) {
    score -= 40;
    reasons.push(`命中客户明确排斥的主题：${blockedSignals.join("、")}`);
  }

  if (customer.crmProfile.interaction.refuseCommunication) {
    score = Math.min(score, 8);
    reasons.push(`客户当前处于拒绝沟通状态：${customer.crmProfile.interaction.refuseCommunicationReason || "需人工确认后再触达"}`);
  }

  if (customer.crmProfile.derived.pushSensitivity === "low") {
    score += 6;
    reasons.push("客户对营销触达敏感度较低。");
  }
  if (customer.crmProfile.derived.pushSensitivity === "high") {
    score -= 12;
    reasons.push("客户对营销触达较敏感，建议减少推送频率。");
  }

  if (customer.tier === "active") {
    score += 5;
  } else if (customer.tier === "vip") {
    score += 10;
  }

  const normalizedScore = clampScore(score);
  const decision: BusinessCustomerCampaignDecision =
    normalizedScore >= 68 && blockedSignals.length === 0 && !customer.crmProfile.interaction.refuseCommunication
      ? "recommended"
      : normalizedScore >= 40
        ? "watch"
        : "skip";

  return normalizeCampaignAssessment({
    campaignBrief,
    score: normalizedScore,
    decision,
    reasons,
    matchedSignals,
    blockedSignals,
    createdAt: Date.now(),
  });
}

export function buildCustomerProfileInstruction(customer: BusinessCustomer) {
  const lines: string[] = [];
  const identities = customer.channelIdentities
    .slice(0, 4)
    .map(identity => `${identity.channel}:${identity.participantLabel || identity.externalRef}`);

  pushLine(lines, "画像完整度", `${customer.profileCompletenessScore}/100`);
  pushLine(lines, "客户等级", customer.tier);
  pushLine(lines, "主渠道", customer.primaryChannel);
  pushLine(lines, "已接入渠道", identities);
  pushLine(lines, "公司", customer.company || customer.crmProfile.basic.companyName);
  pushLine(lines, "行业", customer.crmProfile.basic.industry);
  pushLine(lines, "销售产品", customer.crmProfile.basic.salesProducts);
  pushLine(lines, "偏好联络方式", customer.crmProfile.interaction.preferredContactMethods);
  pushLine(lines, "偏好联络时间", customer.crmProfile.interaction.preferredContactTime);
  pushLine(lines, "最近沟通摘要", customer.crmProfile.interaction.recentConversationSummary);
  pushLine(lines, "售前需求", customer.crmProfile.interaction.preSalesNeeds);
  pushLine(lines, "交易摘要", customer.crmProfile.transaction.purchaseSummary);
  pushLine(lines, "累计订单数", customer.crmProfile.transaction.totalOrderCount);
  pushLine(lines, "累计消费额", formatCurrency(customer.crmProfile.transaction.totalSpend));
  pushLine(lines, "兴趣标签", customer.crmProfile.behavior.interests);
  pushLine(lines, "订阅主题", customer.crmProfile.behavior.subscriptionTopics);
  pushLine(lines, "推荐推送主题", customer.campaignPreferences.preferredTopics);
  pushLine(lines, "禁止推送主题", customer.campaignPreferences.excludedTopics);
  pushLine(lines, "触达敏感度", customer.crmProfile.derived.pushSensitivity);
  if (customer.lastCampaignAssessment) {
    pushLine(lines, "最近活动适配判断", `${customer.lastCampaignAssessment.decision} (${customer.lastCampaignAssessment.score})`);
    pushLine(lines, "最近活动适配原因", customer.lastCampaignAssessment.reasons);
  }

  return lines.join("\n");
}

export function buildCustomerPortfolioSnippet(customers: BusinessCustomer[]) {
  if (customers.length === 0) return "";

  const lines = customers.slice(0, 6).map(customer => {
    const identitySummary = customer.channelIdentities
      .slice(0, 3)
      .map(identity => `${identity.channel}:${identity.participantLabel || identity.externalRef}`)
      .join(" / ");
    const interests = uniqueStrings([
      ...customer.crmProfile.behavior.interests,
      ...customer.crmProfile.basic.salesProducts,
      ...customer.campaignPreferences.preferredTopics,
    ]).slice(0, 4).join("、");
    const exclusions = uniqueStrings([
      ...customer.campaignPreferences.excludedTopics,
      ...customer.crmProfile.derived.excludedKeywords,
    ]).slice(0, 3).join("、");

    return [
      `- ${customer.name} | ${customer.tier} | 完整度 ${customer.profileCompletenessScore}`,
      identitySummary ? `  渠道：${identitySummary}` : "",
      interests ? `  适合触达：${interests}` : "",
      exclusions ? `  避免触达：${exclusions}` : "",
      customer.crmProfile.interaction.recentConversationSummary
        ? `  最近互动：${customer.crmProfile.interaction.recentConversationSummary}`
        : "",
    ].filter(Boolean).join("\n");
  });

  return [
    "Customer CRM snapshot:",
    ...lines,
    "如需策划活动、推送消息或导出客户档案，请优先依据以上画像判断是否适合触达，并按四类画像结构输出结果。",
  ].join("\n");
}

