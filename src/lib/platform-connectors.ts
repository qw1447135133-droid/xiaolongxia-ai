import {
  PLATFORM_DEFINITIONS,
  type PlatformCapabilitySet,
  type PlatformConfig,
  type PlatformConnectionStatus,
  type PlatformDef,
  type UiLocale,
} from "@/store/types";
import { pickLocaleText } from "@/lib/ui-locale";
import type { BusinessChannelSession, BusinessOperationRecord } from "@/types/business-entities";

export function getPlatformDefinition(platformId: string): PlatformDef | null {
  return PLATFORM_DEFINITIONS.find(item => item.id === platformId) ?? null;
}

export function supportsPlatformCapability(
  platformId: string,
  capability: keyof PlatformCapabilitySet,
) {
  return Boolean(getPlatformDefinition(platformId)?.capabilities?.[capability]);
}

export function getPlatformRequiredFieldSummary(def: PlatformDef, config: PlatformConfig) {
  const requiredFields = def.fields.filter(field => field.required);
  const readyCount = requiredFields.filter(field => (config.fields[field.key] ?? "").trim().length > 0).length;
  const readiness = requiredFields.length === 0 ? 100 : Math.round((readyCount / requiredFields.length) * 100);

  return {
    requiredFields,
    readyCount,
    readiness,
    allRequiredFilled: readyCount === requiredFields.length,
  };
}

export function derivePlatformProvisionState(def: PlatformDef, config: PlatformConfig) {
  const { allRequiredFilled, readiness } = getPlatformRequiredFieldSummary(def, config);

  if (!config.enabled) {
    return {
      status: "idle" as PlatformConnectionStatus,
      detail: "当前未启用该连接器。",
      healthScore: 0,
    };
  }

  if (!allRequiredFilled) {
    return {
      status: "idle" as PlatformConnectionStatus,
      detail: "必填凭证还没有补齐，连接器还不能进入联机状态。",
      healthScore: readiness,
    };
  }

  if (def.webhookBased) {
    return {
      status: "webhook_missing" as PlatformConnectionStatus,
      detail: "凭证已配置，但还没有收到公网回调或回调健康检查结果。",
      healthScore: Math.max(60, readiness),
    };
  }

  return {
    status: "configured" as PlatformConnectionStatus,
    detail: "凭证已配置，等待服务端确认连接和账号状态。",
    healthScore: Math.max(75, readiness),
  };
}

export function isPlatformOperationalStatus(status: PlatformConnectionStatus) {
  return status === "connected" || status === "degraded";
}

function resolveWebhookUrl(config: PlatformConfig) {
  return config.webhookUrl?.trim() || config.fields.webhookUrl?.trim() || "";
}

export function matchesPlatformSession(platformId: string, session: Pick<BusinessChannelSession, "channel">) {
  return session.channel === platformId;
}

export function buildPlatformConnectionSnapshot(params: {
  platformId: string;
  config: PlatformConfig;
  wsStatus: "connecting" | "connected" | "disconnected";
  sessions?: BusinessChannelSession[];
  operationLogs?: BusinessOperationRecord[];
}) {
  const definition = getPlatformDefinition(params.platformId);
  if (!definition) {
    return {
      status: "error" as PlatformConnectionStatus,
      label: getPlatformStatusLabel("error"),
      tone: getPlatformStatusTone("error"),
      detail: "未找到连接器定义。",
      healthScore: 0,
      readiness: 0,
      sessionCount: 0,
      needsReplyCount: 0,
      failedSessionCount: 0,
      webhookConfigured: false,
      lastActivityAt: undefined as number | undefined,
      requiredReadyCount: 0,
      requiredCount: 0,
      missingRequiredFields: [] as string[],
    };
  }

  const sessionList = (params.sessions ?? []).filter(session => matchesPlatformSession(params.platformId, session));
  const relevantLogs = (params.operationLogs ?? []).filter(log =>
    log.externalRef?.startsWith(`${params.platformId}:`) || false,
  );
  const requiredFields = definition.fields.filter(field => field.required);
  const missingRequiredFields = requiredFields
    .filter(field => !(params.config.fields[field.key] ?? "").trim())
    .map(field => field.label);
  const requiredReadyCount = requiredFields.length - missingRequiredFields.length;
  const readiness = requiredFields.length === 0 ? 100 : Math.round((requiredReadyCount / requiredFields.length) * 100);
  const provision = derivePlatformProvisionState(definition, params.config);
  const webhookConfigured = !definition.webhookBased || Boolean(resolveWebhookUrl(params.config));
  const lastSessionActivityAt = sessionList.reduce<number | undefined>((latest, session) => {
    if (!latest || session.lastMessageAt > latest) return session.lastMessageAt;
    return latest;
  }, undefined);
  const lastLogActivityAt = relevantLogs.reduce<number | undefined>((latest, log) => {
    if (!latest || log.updatedAt > latest) return log.updatedAt;
    return latest;
  }, undefined);
  const lastActivityAt = params.config.lastEventAt ?? lastSessionActivityAt ?? lastLogActivityAt;
  const needsReplyCount = sessionList.filter(session => session.requiresReply || (session.unreadCount ?? 0) > 0).length;
  const failedSessionCount = sessionList.filter(session => session.lastDeliveryStatus === "failed").length;

  let status = params.config.status;
  let detail = params.config.detail ?? provision.detail;
  let healthScore = params.config.healthScore ?? provision.healthScore;

  if (!params.config.enabled) {
    status = "idle";
    detail = provision.detail;
    healthScore = 0;
  } else if (missingRequiredFields.length > 0) {
    status = "idle";
    detail = `还缺少 ${missingRequiredFields.join(" / ")}。`;
    healthScore = readiness;
  } else if (definition.webhookBased && !webhookConfigured) {
    status = "webhook_missing";
    detail = "Webhook 平台还没有配置公网回调地址。";
    healthScore = Math.max(60, readiness);
  } else if (params.config.status === "auth_failed" || params.config.status === "rate_limited" || params.config.status === "webhook_unreachable" || params.config.status === "error") {
    status = params.config.status;
  } else if (params.config.status === "syncing") {
    status = "syncing";
    detail = params.config.detail ?? "配置已发送，等待服务端确认连接状态。";
  } else if (params.wsStatus !== "connected") {
    status = "degraded";
    detail = "WebSocket 当前离线，连接器无法完成实时同步。";
    healthScore = Math.min(healthScore, 72);
  } else if (sessionList.length > 0 || lastActivityAt) {
    status = failedSessionCount > 0 ? "degraded" : "connected";
    detail = failedSessionCount > 0
      ? "已检测到渠道流量，但最近存在发送失败或需要人工回复的会话。"
      : "凭证、回调和最近会话流量都已就绪。";
    healthScore = failedSessionCount > 0 ? Math.max(78, readiness) : 100;
  } else if (definition.webhookBased) {
    status = "configured";
    detail = "凭证和回调已就绪，等待第一条真实入站或出站回执。";
    healthScore = Math.max(82, readiness);
  } else {
    status = "configured";
    detail = "凭证已同步，等待账号握手或第一条消息回执。";
    healthScore = Math.max(80, readiness);
  }

  return {
    status,
    label: getPlatformStatusLabel(status),
    tone: getPlatformStatusTone(status),
    detail,
    healthScore,
    readiness,
    sessionCount: sessionList.length,
    needsReplyCount,
    failedSessionCount,
    webhookConfigured,
    lastActivityAt,
    requiredReadyCount,
    requiredCount: requiredFields.length,
    missingRequiredFields,
  };
}

export function getPlatformStatusTone(status: PlatformConnectionStatus) {
  if (status === "connected") return "ready";
  if (status === "configured" || status === "syncing" || status === "degraded") return "partial";
  if (status === "idle") return "muted";
  return "blocked";
}

export function getPlatformStatusLabel(status: PlatformConnectionStatus, locale: UiLocale = "zh-CN") {
  switch (status) {
    case "idle":
      return pickLocaleText(locale, { "zh-CN": "未配置", "zh-TW": "未配置", en: "Not Configured", ja: "未設定" });
    case "syncing":
      return pickLocaleText(locale, { "zh-CN": "同步中", "zh-TW": "同步中", en: "Syncing", ja: "同期中" });
    case "configured":
      return pickLocaleText(locale, { "zh-CN": "已配置", "zh-TW": "已配置", en: "Configured", ja: "設定済み" });
    case "connected":
      return pickLocaleText(locale, { "zh-CN": "已连接", "zh-TW": "已連接", en: "Connected", ja: "接続済み" });
    case "degraded":
      return pickLocaleText(locale, { "zh-CN": "降级", "zh-TW": "降級", en: "Degraded", ja: "劣化" });
    case "auth_failed":
      return pickLocaleText(locale, { "zh-CN": "鉴权失败", "zh-TW": "鑑權失敗", en: "Auth Failed", ja: "認証失敗" });
    case "webhook_missing":
      return pickLocaleText(locale, { "zh-CN": "缺少回调", "zh-TW": "缺少回調", en: "Missing Webhook", ja: "Webhook不足" });
    case "webhook_unreachable":
      return pickLocaleText(locale, { "zh-CN": "回调异常", "zh-TW": "回調異常", en: "Webhook Error", ja: "Webhook異常" });
    case "rate_limited":
      return pickLocaleText(locale, { "zh-CN": "被限流", "zh-TW": "被限流", en: "Rate Limited", ja: "レート制限" });
    case "error":
      return pickLocaleText(locale, { "zh-CN": "异常", "zh-TW": "異常", en: "Error", ja: "異常" });
    default:
      return status;
  }
}
