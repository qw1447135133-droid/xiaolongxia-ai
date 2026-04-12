import type { BusinessChannelSession } from "@/types/business-entities";
import { pickLocaleText } from "@/lib/ui-locale";
import type { UiLocale } from "@/store/types";

export function canDirectReplySession(session: BusinessChannelSession) {
  return ["telegram", "line", "feishu", "wecom", "web"].includes(session.channel);
}

export function shouldSuggestDesktopTakeover(session: BusinessChannelSession) {
  return session.lastDeliveryStatus === "failed" || session.status === "waiting";
}

export function getChannelSessionStateLabel(session: BusinessChannelSession, locale: UiLocale = "zh-CN") {
  if (session.lastDeliveryStatus === "failed") {
    return pickLocaleText(locale, { "zh-CN": "发送失败", "zh-TW": "發送失敗", en: "Send Failed", ja: "送信失敗" });
  }
  if (session.status === "waiting") {
    return pickLocaleText(locale, { "zh-CN": "等待人工", "zh-TW": "等待人工", en: "Waiting Human", ja: "人手待ち" });
  }
  if (session.requiresReply || (session.unreadCount ?? 0) > 0) {
    return pickLocaleText(locale, { "zh-CN": "待回复", "zh-TW": "待回覆", en: "Pending Reply", ja: "返信待ち" });
  }
  if (session.lastMessageDirection === "outbound" && session.lastDeliveryStatus === "pending") {
    return pickLocaleText(locale, { "zh-CN": "自动处理中", "zh-TW": "自動處理中", en: "Auto Processing", ja: "自動処理中" });
  }
  if (session.lastHandledAt || session.status === "closed") {
    return pickLocaleText(locale, { "zh-CN": "已处理", "zh-TW": "已處理", en: "Handled", ja: "処理済み" });
  }
  return pickLocaleText(locale, { "zh-CN": "自动处理中", "zh-TW": "自動處理中", en: "Auto Processing", ja: "自動処理中" });
}

export function getChannelSessionRecentAction(session: BusinessChannelSession, locale: UiLocale = "zh-CN") {
  if (session.lastDeliveryStatus === "failed") {
    return pickLocaleText(locale, { "zh-CN": "自动回复失败", "zh-TW": "自動回覆失敗", en: "Auto Reply Failed", ja: "自動返信失敗" });
  }
  if (session.lastHandledAt) {
    return session.handledBy === "manual"
      ? pickLocaleText(locale, { "zh-CN": "人工标记已处理", "zh-TW": "人工標記已處理", en: "Marked Handled Manually", ja: "手動で処理済みにした" })
      : pickLocaleText(locale, { "zh-CN": "自动标记已处理", "zh-TW": "自動標記已處理", en: "Marked Handled Automatically", ja: "自動で処理済みにした" });
  }
  if (session.lastMessageDirection === "outbound") {
    if (session.lastDeliveryStatus === "sent" || session.lastDeliveryStatus === "delivered") {
      return pickLocaleText(locale, { "zh-CN": "已发送回复", "zh-TW": "已發送回覆", en: "Reply Sent", ja: "返信送信済み" });
    }
    if (session.lastDeliveryStatus === "pending") {
      return pickLocaleText(locale, { "zh-CN": "正在发送回复", "zh-TW": "正在發送回覆", en: "Sending Reply", ja: "返信送信中" });
    }
  }
  if (session.lastMessageDirection === "inbound") {
    return pickLocaleText(locale, { "zh-CN": "收到客户消息", "zh-TW": "收到客戶消息", en: "Inbound Customer Message", ja: "顧客メッセージ受信" });
  }
  return pickLocaleText(locale, { "zh-CN": "等待新动作", "zh-TW": "等待新動作", en: "Waiting Next Action", ja: "次のアクション待ち" });
}

export function getChannelSessionNextAction(session: BusinessChannelSession, locale: UiLocale = "zh-CN") {
  if (session.lastDeliveryStatus === "failed") {
    return canDirectReplySession(session)
      ? pickLocaleText(locale, { "zh-CN": "重试最近发送", "zh-TW": "重試最近發送", en: "Retry Last Send", ja: "直近送信を再試行" })
      : pickLocaleText(locale, { "zh-CN": "桌面接管", "zh-TW": "桌面接管", en: "Desktop Takeover", ja: "デスクトップ引き継ぎ" });
  }
  if (session.status === "waiting") {
    return canDirectReplySession(session)
      ? pickLocaleText(locale, { "zh-CN": "转人工处理", "zh-TW": "轉人工處理", en: "Escalate to Human", ja: "人手へ引き継ぐ" })
      : pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" });
  }
  if (session.requiresReply || (session.unreadCount ?? 0) > 0) {
    return canDirectReplySession(session)
      ? pickLocaleText(locale, { "zh-CN": "发送回复", "zh-TW": "發送回覆", en: "Send Reply", ja: "返信する" })
      : pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" });
  }
  if (session.lastHandledAt || session.status === "closed") {
    return pickLocaleText(locale, { "zh-CN": "查看会话实体", "zh-TW": "查看會話實體", en: "View Session Entity", ja: "会話実体を見る" });
  }
  return pickLocaleText(locale, { "zh-CN": "标记已处理", "zh-TW": "標記已處理", en: "Mark Handled", ja: "処理済みにする" });
}
