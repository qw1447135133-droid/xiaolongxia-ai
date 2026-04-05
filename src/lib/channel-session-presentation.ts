import type { BusinessChannelSession } from "@/types/business-entities";

export function canDirectReplySession(session: BusinessChannelSession) {
  return ["telegram", "line", "feishu", "wecom"].includes(session.channel);
}

export function shouldSuggestDesktopTakeover(session: BusinessChannelSession) {
  return session.lastDeliveryStatus === "failed" || session.status === "waiting";
}

export function getChannelSessionStateLabel(session: BusinessChannelSession) {
  if (session.lastDeliveryStatus === "failed") return "发送失败";
  if (session.status === "waiting") return "等待人工";
  if (session.requiresReply || (session.unreadCount ?? 0) > 0) return "待回复";
  if (session.lastMessageDirection === "outbound" && session.lastDeliveryStatus === "pending") return "自动处理中";
  if (session.lastHandledAt || session.status === "closed") return "已处理";
  return "自动处理中";
}

export function getChannelSessionRecentAction(session: BusinessChannelSession) {
  if (session.lastDeliveryStatus === "failed") return "自动回复失败";
  if (session.lastHandledAt) {
    return session.handledBy === "manual" ? "人工标记已处理" : "自动标记已处理";
  }
  if (session.lastMessageDirection === "outbound") {
    if (session.lastDeliveryStatus === "sent" || session.lastDeliveryStatus === "delivered") {
      return "已发送回复";
    }
    if (session.lastDeliveryStatus === "pending") {
      return "正在发送回复";
    }
  }
  if (session.lastMessageDirection === "inbound") {
    return "收到客户消息";
  }
  return "等待新动作";
}

export function getChannelSessionNextAction(session: BusinessChannelSession) {
  if (session.lastDeliveryStatus === "failed") {
    return canDirectReplySession(session) ? "重试最近发送" : "桌面接管";
  }
  if (session.status === "waiting") {
    return canDirectReplySession(session) ? "转人工处理" : "回聊天接管";
  }
  if (session.requiresReply || (session.unreadCount ?? 0) > 0) {
    return canDirectReplySession(session) ? "发送回复" : "回聊天接管";
  }
  if (session.lastHandledAt || session.status === "closed") {
    return "查看会话实体";
  }
  return "标记已处理";
}
