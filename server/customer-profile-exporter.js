import { exportWordDocument } from "./document-exporter.js";

const CUSTOMER_PROFILE_SECTION_TITLES = {
  basic: "基本联络与个人资料",
  interaction: "互动记录与沟通历史",
  transaction: "购买纪录与交易数据",
  behavior: "行为与偏好数据",
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => normalizeText(item)).filter(Boolean)));
}

function pushLine(lines, label, value, fallback = "") {
  if (Array.isArray(value)) {
    const normalized = normalizeList(value);
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

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function buildBasicSection(customer) {
  const basic = customer.crmProfile?.basic ?? {};
  const lines = [];
  pushLine(lines, "客户名称", customer.name);
  pushLine(lines, "客户等级", customer.tier);
  pushLine(lines, "主渠道", customer.primaryChannel);
  pushLine(lines, "公司名称", customer.company || basic.companyName);
  pushLine(lines, "联系人", basic.contactName || customer.name);
  pushLine(lines, "英文名", basic.englishName);
  pushLine(lines, "性别", basic.gender);
  pushLine(lines, "职位", basic.jobTitle);
  pushLine(lines, "公司背景", basic.companyBackground);
  pushLine(lines, "公司规模", basic.companyScale);
  pushLine(lines, "行业属性", basic.industry);
  pushLine(lines, "销售产品", basic.salesProducts);
  pushLine(lines, "市场规模", basic.marketScale);
  pushLine(lines, "电话", basic.phone || basic.companyPhone);
  pushLine(lines, "手机", basic.mobile);
  pushLine(lines, "工作邮箱", basic.workEmail || basic.companyEmail);
  pushLine(lines, "私人邮箱", basic.privateEmail);
  pushLine(lines, "公司地址", basic.companyAddress || basic.workAddress);
  pushLine(lines, "社群账号", basic.socialAccounts);
  pushLine(
    lines,
    "接入渠道",
    (customer.channelIdentities ?? []).map(identity => `${identity.channel}:${identity.participantLabel || identity.externalRef}`),
  );
  return lines.join("\n");
}

function buildInteractionSection(customer) {
  const interaction = customer.crmProfile?.interaction ?? {};
  const lines = [];
  pushLine(lines, "最近沟通摘要", interaction.recentConversationSummary, "暂无");
  pushLine(lines, "售前咨询需求", interaction.preSalesNeeds);
  pushLine(lines, "客服申诉 / 服务案例", interaction.supportCases);
  pushLine(lines, "问题回报", interaction.issueReports);
  pushLine(lines, "售后服务需求", interaction.afterSalesNeeds);
  pushLine(lines, "历史咨询记录", interaction.inquiryHistory);
  pushLine(lines, "咨询氛围", interaction.inquiryTone);
  pushLine(lines, "偏好联络方式", interaction.preferredContactMethods);
  pushLine(lines, "偏好联络时间", interaction.preferredContactTime);
  pushLine(lines, "电话记录", interaction.callRecords);
  pushLine(lines, "简讯记录", interaction.smsRecords);
  pushLine(lines, "会议记录", interaction.meetingRecords);
  pushLine(lines, "开信率", interaction.emailOpenRate);
  pushLine(lines, "点击率", interaction.emailClickRate);
  pushLine(lines, "拒绝沟通", interaction.refuseCommunication ? "是" : interaction.refuseCommunicationReason ? "否" : "");
  pushLine(lines, "拒绝沟通原因", interaction.refuseCommunicationReason);
  return lines.join("\n");
}

function buildTransactionSection(customer) {
  const transaction = customer.crmProfile?.transaction ?? {};
  const lines = [];
  pushLine(lines, "交易摘要", transaction.purchaseSummary, "暂无");
  pushLine(lines, "最近购买记录", transaction.recentPurchases);
  pushLine(lines, "累计订单数", transaction.totalOrderCount);
  pushLine(lines, "累计消费额", formatCurrency(transaction.totalSpend));
  pushLine(lines, "客单价", formatCurrency(transaction.averageOrderValue));
  pushLine(lines, "最近消费时间", transaction.lastPurchaseAt);
  pushLine(lines, "订单状态", transaction.orderStatuses);
  pushLine(lines, "退货 / 退款 / 拒收记录", transaction.returnAndRefundHistory);
  pushLine(lines, "付款方式", transaction.paymentMethods);
  pushLine(lines, "帐单地址", transaction.billingAddress);
  pushLine(lines, "收货地址", transaction.shippingAddresses);
  pushLine(lines, "物流方式", transaction.logisticsMethods);
  pushLine(lines, "平日 / 假日 / 节日消费模式", transaction.seasonalPurchasePatterns);
  pushLine(lines, "加价购信号", transaction.upsellSignals);
  pushLine(lines, "交叉销售信号", transaction.crossSellSignals);
  return lines.join("\n");
}

function buildBehaviorSection(customer) {
  const behavior = customer.crmProfile?.behavior ?? {};
  const derived = customer.crmProfile?.derived ?? {};
  const preferences = customer.campaignPreferences ?? {};
  const assessment = customer.lastCampaignAssessment ?? null;
  const lines = [];
  pushLine(lines, "行为摘要", customer.summary, "暂无");
  pushLine(lines, "网站浏览行为", behavior.websiteBehaviors);
  pushLine(lines, "兴趣主题", behavior.interests);
  pushLine(lines, "收藏内容 / 商品", behavior.favoriteItems);
  pushLine(lines, "购物车未结帐信号", behavior.abandonedCartSignals);
  pushLine(lines, "订阅内容", behavior.subscriptionTopics);
  pushLine(lines, "活动参与记录", behavior.campaignParticipations);
  pushLine(lines, "问卷反馈", behavior.surveyResponses);
  pushLine(lines, "折价券互动", behavior.couponEngagement);
  pushLine(lines, "会员等级", behavior.membershipLevel);
  pushLine(lines, "积分", behavior.loyaltyPoints);
  pushLine(lines, "奖励计划状态", behavior.rewardProgramStatus);
  pushLine(lines, "推荐推送主题", preferences.preferredTopics);
  pushLine(lines, "排除推送主题", preferences.excludedTopics);
  pushLine(lines, "偏好推送渠道", preferences.preferredChannels);
  pushLine(lines, "偏好内容形式", preferences.preferredFormats);
  pushLine(lines, "触达敏感度", derived.pushSensitivity);
  pushLine(lines, "画像完整度", `${customer.profileCompletenessScore ?? derived.completenessScore ?? 0}/100`);
  pushLine(lines, "适配关键词", derived.fitKeywords);
  pushLine(lines, "排斥关键词", derived.excludedKeywords);
  if (assessment) {
    pushLine(lines, "最近活动适配判断", `${assessment.decision} (${assessment.score})`);
    pushLine(lines, "最近活动适配原因", assessment.reasons);
  }
  return lines.join("\n");
}

function buildCustomerProfileSections(customer) {
  return [
    {
      heading: CUSTOMER_PROFILE_SECTION_TITLES.basic,
      body: buildBasicSection(customer),
    },
    {
      heading: CUSTOMER_PROFILE_SECTION_TITLES.interaction,
      body: buildInteractionSection(customer),
    },
    {
      heading: CUSTOMER_PROFILE_SECTION_TITLES.transaction,
      body: buildTransactionSection(customer),
    },
    {
      heading: CUSTOMER_PROFILE_SECTION_TITLES.behavior,
      body: buildBehaviorSection(customer),
    },
  ].filter(section => normalizeText(section.body));
}

function buildCustomerSummary(customer) {
  const summaryLines = [];
  pushLine(summaryLines, "客户名称", customer.name);
  pushLine(summaryLines, "客户等级", customer.tier);
  pushLine(summaryLines, "主渠道", customer.primaryChannel);
  pushLine(summaryLines, "公司名称", customer.company || customer.crmProfile?.basic?.companyName);
  pushLine(summaryLines, "画像完整度", `${customer.profileCompletenessScore ?? customer.crmProfile?.derived?.completenessScore ?? 0}/100`);
  pushLine(summaryLines, "客户摘要", customer.summary);
  return summaryLines.join("\n");
}

export async function exportCustomerProfileWordDocument({
  customer,
  title,
  fileName,
  outputDir = "desktop",
}) {
  if (!customer || typeof customer !== "object") {
    throw new Error("customer 不能为空");
  }

  const normalizedCustomer = {
    ...customer,
    name: normalizeText(customer.name),
    tier: normalizeText(customer.tier) || "prospect",
    primaryChannel: normalizeText(customer.primaryChannel) || "web",
    company: normalizeText(customer.company),
    summary: normalizeText(customer.summary),
    profileCompletenessScore:
      typeof customer.profileCompletenessScore === "number"
        ? customer.profileCompletenessScore
        : (typeof customer.crmProfile?.derived?.completenessScore === "number"
            ? customer.crmProfile.derived.completenessScore
            : 0),
    channelIdentities: Array.isArray(customer.channelIdentities) ? customer.channelIdentities : [],
    crmProfile: customer.crmProfile ?? {},
    campaignPreferences: customer.campaignPreferences ?? {},
    lastCampaignAssessment: customer.lastCampaignAssessment ?? null,
  };

  if (!normalizedCustomer.name) {
    throw new Error("customer.name 不能为空");
  }

  return exportWordDocument({
    title: normalizeText(title) || `${normalizedCustomer.name} 客户画像档案`,
    summary: buildCustomerSummary(normalizedCustomer),
    sections: buildCustomerProfileSections(normalizedCustomer),
    fileName: normalizeText(fileName) || `${normalizedCustomer.name}-客户画像档案`,
    outputDir,
  });
}

