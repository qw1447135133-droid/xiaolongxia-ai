import type { UserProfile, UserProfileOnboardingState, UserProfileOrganizationType } from "@/store/types";

const INDUSTRY_KEYWORDS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "跨境电商", patterns: [/跨境/i, /电商/i, /亚马逊/i, /shopify/i, /独立站/i] },
  { label: "软件 / AI", patterns: [/软件/i, /saas/i, /ai/i, /开发/i, /技术/i, /产品/i] },
  { label: "内容 / 营销", patterns: [/内容/i, /自媒体/i, /短视频/i, /营销/i, /品牌/i, /广告/i] },
  { label: "教育 / 培训", patterns: [/教育/i, /培训/i, /课程/i, /留学/i] },
  { label: "咨询 / 服务", patterns: [/咨询/i, /服务/i, /代运营/i, /顾问/i] },
  { label: "制造 / 供应链", patterns: [/工厂/i, /制造/i, /供应链/i, /外贸/i, /采购/i] },
];

const CHANNEL_ALIASES: Array<{ label: string; pattern: RegExp }> = [
  { label: "微信", pattern: /(?:个人)?微信/i },
  { label: "企业微信", pattern: /企业微信|企微|wecom/i },
  { label: "飞书", pattern: /飞书|feishu|lark/i },
  { label: "Telegram", pattern: /telegram|tg/i },
  { label: "WhatsApp", pattern: /whatsapp/i },
  { label: "抖音", pattern: /抖音/i },
  { label: "小红书", pattern: /小红书/i },
];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[，、；;]/g, "，")
    .trim();
}

function uniqueTexts(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(value);
  }

  return items;
}

function clip(value: string, max = 80) {
  const next = normalizeText(value);
  if (next.length <= max) return next;
  return `${next.slice(0, max).trimEnd()}...`;
}

function pickFirstMatch(message: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const value = normalizeText(match?.[1]);
    if (value) return value;
  }
  return "";
}

function splitByDelimiters(message: string) {
  return message
    .split(/[\n。！？!?；;]+/)
    .map(part => normalizeText(part))
    .filter(Boolean);
}

function inferOrganizationType(message: string, fallback: UserProfileOrganizationType): UserProfileOrganizationType {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized) return fallback;
  if (/(企业|公司|团队|工作室|品牌|店铺|机构|我们是|我们做)/i.test(normalized)) return "business";
  if (/(个人|自己做|自由职业|独立开发|个体|博主|我自己)/i.test(normalized)) return "individual";
  return fallback;
}

function inferIndustry(message: string, fallback = "") {
  for (const item of INDUSTRY_KEYWORDS) {
    if (item.patterns.some(pattern => pattern.test(message))) return item.label;
  }

  return (
    pickFirstMatch(message, [
      /(?:从事|做|行业是|业务是|做的是)([^，。；\n]{2,28})/i,
      /(?:主营|主要做|目前做)([^，。；\n]{2,28})/i,
    ]) || fallback
  );
}

function inferChannels(message: string, existing: string[]) {
  const next = [...existing];
  for (const item of CHANNEL_ALIASES) {
    if (item.pattern.test(message)) next.push(item.label);
  }
  return uniqueTexts(next);
}

function inferRoleTitle(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /(?:职位|岗位|角色)(?:是|为|叫)?[:： ]?([^，。；\n]{2,24})/i,
      /(?:我是|我目前是|我现在是|担任)([^，。；\n]{2,24})/i,
    ]) || fallback
  );
}

function inferOrganizationName(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /我们是([^，。；\n]{2,24}?)(?:公司|团队|工作室|品牌|店铺|机构)/i,
      /(?:公司|团队|工作室|品牌|店铺|机构)(?:叫|是|名为)?[:： ]?([^，。；\n]{2,24})/i,
    ]) || fallback
  );
}

function inferDisplayName(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /(?:我叫|我的名字是|可以叫我)([^，。；\n]{2,20})/i,
    ]) || fallback
  );
}

function inferWorkSummary(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /(?:主要做|目前做|我们做|我是做)([^。；\n]{4,40})/i,
      /(?:工作内容|业务内容)(?:是|主要是)?[:： ]?([^。；\n]{4,40})/i,
    ]) || fallback
  );
}

function inferTargetAudience(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /(?:客户主要是|用户主要是|面向)([^，。；\n]{2,30})/i,
      /(?:服务|卖给)([^，。；\n]{2,30})/i,
    ]) || fallback
  );
}

function inferRegion(message: string, fallback = "") {
  return (
    pickFirstMatch(message, [
      /(?:在|位于)([^，。；\n]{2,16})(?:工作|办公|做|这边)/i,
      /(?:地区|区域)(?:是|在)?[:： ]?([^，。；\n]{2,16})/i,
    ]) || fallback
  );
}

function inferResponsibilities(message: string, existing: string[]) {
  const candidates = splitByDelimiters(message)
    .filter(part => /(负责|主要|日常|我管|我做|工作内容)/i.test(part))
    .map(part => part.replace(/^(我|我们)?(?:主要|现在|平时)?(?:负责|做|管)/, "").trim());

  return uniqueTexts([...existing, ...candidates]);
}

function inferGoals(message: string, existing: string[]) {
  const direct = pickFirstMatch(message, [
    /(?:目标|希望|想要|最想解决|目前最需要|最需要)([^。；\n]{4,50})/i,
  ]);

  const sentences = splitByDelimiters(message)
    .filter(part => /(目标|希望|想要|需要|痛点|卡住|提升|增长|转化|自动化)/i.test(part));

  return uniqueTexts([...existing, direct, ...sentences]);
}

function buildPerspectiveSummary(profile: UserProfile) {
  const parts = [
    profile.organizationType === "business"
      ? "当前用户以企业/团队视角使用系统"
      : profile.organizationType === "individual"
        ? "当前用户以个人从业者视角使用系统"
        : "",
    profile.organizationName ? `所属主体是 ${profile.organizationName}` : "",
    profile.industry ? `从事 ${profile.industry}` : "",
    profile.roleTitle ? `角色是 ${profile.roleTitle}` : "",
    profile.workSummary ? `主要工作是 ${profile.workSummary}` : "",
    profile.goals.length > 0 ? `当前最关注 ${profile.goals.slice(0, 2).join("、")}` : "",
    profile.preferredChannels.length > 0 ? `常用平台包括 ${profile.preferredChannels.join("、")}` : "",
  ].filter(Boolean);

  return parts.join("，");
}

export function createEmptyUserProfile(): UserProfile {
  return {
    organizationType: "unknown",
    displayName: "",
    organizationName: "",
    industry: "",
    workSummary: "",
    roleTitle: "",
    responsibilities: [],
    goals: [],
    targetAudience: "",
    preferredChannels: [],
    region: "",
    notes: "",
    perspectiveSummary: "",
    updatedAt: null,
  };
}

export function normalizeUserProfile(profile: Partial<UserProfile> | UserProfile): UserProfile {
  const merged: UserProfile = {
    ...createEmptyUserProfile(),
    ...profile,
    displayName: clip(normalizeText(profile.displayName ?? "")),
    organizationName: clip(normalizeText(profile.organizationName ?? "")),
    industry: clip(normalizeText(profile.industry ?? ""), 48),
    workSummary: clip(normalizeText(profile.workSummary ?? ""), 120),
    roleTitle: clip(normalizeText(profile.roleTitle ?? ""), 48),
    targetAudience: clip(normalizeText(profile.targetAudience ?? ""), 80),
    region: clip(normalizeText(profile.region ?? ""), 48),
    notes: clip(normalizeText(profile.notes ?? ""), 160),
    responsibilities: uniqueTexts(profile.responsibilities ?? []).slice(0, 5),
    goals: uniqueTexts(profile.goals ?? []).slice(0, 5),
    preferredChannels: uniqueTexts(profile.preferredChannels ?? []).slice(0, 6),
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : null,
  };

  if (!merged.industry) {
    merged.industry = inferIndustry(`${merged.workSummary} ${merged.notes}`.trim(), merged.industry);
  }

  if (!merged.perspectiveSummary) {
    merged.perspectiveSummary = buildPerspectiveSummary(merged);
  } else {
    merged.perspectiveSummary = clip(merged.perspectiveSummary, 200);
  }

  return {
    ...merged,
    perspectiveSummary: buildPerspectiveSummary(merged),
  };
}

export function inferUserProfilePatchFromMessage(message: string, current: UserProfile): Partial<UserProfile> {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return {};

  return {
    organizationType: inferOrganizationType(normalizedMessage, current.organizationType),
    displayName: inferDisplayName(normalizedMessage, current.displayName),
    organizationName: inferOrganizationName(normalizedMessage, current.organizationName),
    industry: inferIndustry(normalizedMessage, current.industry),
    workSummary: inferWorkSummary(normalizedMessage, current.workSummary),
    roleTitle: inferRoleTitle(normalizedMessage, current.roleTitle),
    responsibilities: inferResponsibilities(normalizedMessage, current.responsibilities),
    goals: inferGoals(normalizedMessage, current.goals),
    targetAudience: inferTargetAudience(normalizedMessage, current.targetAudience),
    preferredChannels: inferChannels(normalizedMessage, current.preferredChannels),
    region: inferRegion(normalizedMessage, current.region),
    updatedAt: Date.now(),
  };
}

export function getUserProfileMissingFields(profile: UserProfile) {
  const missing: string[] = [];
  if (profile.organizationType === "unknown") missing.push("主体类型");
  if (!profile.industry && !profile.workSummary) missing.push("从事的工作 / 行业");
  if (!profile.roleTitle) missing.push("职位 / 角色");
  if (profile.responsibilities.length === 0) missing.push("主要职责");
  if (profile.goals.length === 0) missing.push("当前目标");
  return missing;
}

export function createIdleUserProfileOnboarding(): UserProfileOnboardingState {
  return {
    status: "idle",
    sessionId: null,
    startedAt: null,
    completedAt: null,
    lastUserInputAt: null,
    missingFields: getUserProfileMissingFields(createEmptyUserProfile()),
  };
}

export function buildUserProfileSnippet(profile: UserProfile) {
  const normalized = normalizeUserProfile(profile);
  if (
    normalized.organizationType === "unknown"
    && !normalized.industry
    && !normalized.workSummary
    && !normalized.roleTitle
    && normalized.goals.length === 0
  ) {
    return "";
  }

  const lines = [
    "当前用户画像（系统已自动规范化，请默认站在该用户视角思考，不要机械复述字段）：",
    normalized.organizationType === "business"
      ? "- 主体类型：企业 / 团队"
      : normalized.organizationType === "individual"
        ? "- 主体类型：个人"
        : "",
    normalized.organizationName ? `- 主体名称：${normalized.organizationName}` : "",
    normalized.industry ? `- 行业 / 工作领域：${normalized.industry}` : "",
    normalized.roleTitle ? `- 角色 / 职位：${normalized.roleTitle}` : "",
    normalized.workSummary ? `- 主要工作：${normalized.workSummary}` : "",
    normalized.responsibilities.length > 0 ? `- 主要职责：${normalized.responsibilities.join("；")}` : "",
    normalized.goals.length > 0 ? `- 当前目标：${normalized.goals.join("；")}` : "",
    normalized.targetAudience ? `- 服务对象：${normalized.targetAudience}` : "",
    normalized.preferredChannels.length > 0 ? `- 常用平台：${normalized.preferredChannels.join("、")}` : "",
    normalized.region ? `- 所在区域：${normalized.region}` : "",
    normalized.perspectiveSummary ? `- 视角摘要：${normalized.perspectiveSummary}` : "",
    "除非用户明确要求切换视角，否则后续建议、回复策略、自动化方案和优先级判断都默认以这个用户画像为准。",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildUserProfileOnboardingSnippet(
  profile: UserProfile,
  onboarding: UserProfileOnboardingState,
  justCompleted = false,
) {
  const normalized = normalizeUserProfile(profile);
  const missing = onboarding.missingFields.length > 0
    ? onboarding.missingFields
    : getUserProfileMissingFields(normalized);

  return [
    "当前正在执行“用户信息录入引导”。你就是鹦鹉螺，需要像顾问一样主动完成用户画像采集。",
    normalized.perspectiveSummary ? `已整理出的用户画像：${normalized.perspectiveSummary}` : "当前画像仍然为空，请从基础身份开始了解。",
    missing.length > 0 ? `仍待补齐：${missing.join("、")}` : "核心字段已经齐全，可以进入确认收尾。",
    "引导规则：",
    "- 用自然中文对话，不要像在读表单。",
    "- 每次最多问 1 到 2 个最关键的问题。",
    "- 这轮引导由你独立完成，不要切换给其他角色。",
    "- 优先确认：企业还是个人、从事什么工作/行业、职位/角色、主要职责、当前目标。",
    "- 用户回答不规范时，你要自动理解并归纳，不要要求用户按字段重填。",
    justCompleted
      ? "- 本轮信息已经足够：请先给出一段简洁的规范化用户画像摘要，再明确说明后续所有工作都会默认站在该用户视角思考。"
      : "- 如果信息还不够，就继续追问最缺的部分，不要一次把所有问题都抛给用户。",
  ].join("\n");
}

export function buildUserProfileKickoffInstruction() {
  return [
    "请以鹦鹉螺的身份独立开启一次“用户信息录入引导”，不要切换给其他角色。",
    "你的目标是通过自然对话，逐步收集后续工作所需的用户画像，让系统之后能够始终站在用户的角度思考。",
    "开场时请主动发问，不要等待用户先组织格式。",
    "需要覆盖的核心方向是：用户是企业还是个人、从事什么工作、职位是什么、主要职责是什么、当前最想解决的问题是什么。",
    "语气要像高级但不生硬的顾问，一次只问 1 到 2 个关键问题。",
  ].join("\n");
}
