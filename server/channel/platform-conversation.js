export function createPlatformConversationHelpers({
  mapPlatformToChannel,
  summarizePlatformAccount,
  getPlatformFields,
}) {
  function normalizePlatformInboundMessage(messageOrUserId, text, platformId) {
    const payload = messageOrUserId && typeof messageOrUserId === "object" && !Array.isArray(messageOrUserId)
      ? messageOrUserId
      : {
          userId: messageOrUserId,
          text,
          platformId,
        };

    return {
      userId: String(payload?.userId || "").trim(),
      text: String(payload?.text || "").trim(),
      platformId: String(payload?.platformId || platformId || "").trim(),
      inboundMessageKey: String(payload?.inboundMessageKey || "").trim() || undefined,
      externalMessageId: String(payload?.externalMessageId || "").trim() || undefined,
      conversationRef: String(payload?.conversationRef || "").trim() || undefined,
      replyTargetId: String(payload?.replyTargetId || "").trim() || undefined,
      participantLabel: String(payload?.participantLabel || "").trim() || undefined,
      title: String(payload?.title || "").trim() || undefined,
      remoteUserId: String(payload?.remoteUserId || "").trim() || undefined,
      remoteThreadId: String(payload?.remoteThreadId || "").trim() || undefined,
    };
  }

  function normalizePlatformIdentityList(value) {
    return String(value || "")
      .split(/[\n,，;；]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function getPlatformOwnerIdentifiers(platformId) {
    const fields = getPlatformFields(platformId) ?? {};
    const ownerIds = normalizePlatformIdentityList(fields.ownerUserIds);

    if (platformId === "telegram" && fields.defaultChatId) {
      ownerIds.push(String(fields.defaultChatId).trim());
    }
    if (platformId === "feishu" && fields.defaultOpenId) {
      ownerIds.push(String(fields.defaultOpenId).trim());
    }

    return [...new Set(ownerIds.filter(Boolean))];
  }

  function isOwnerPlatformConversation(platformId, userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return false;
    return getPlatformOwnerIdentifiers(platformId).includes(normalizedUserId);
  }

  function buildPlatformConversationIdentity(platformId, conversation = {}, serviceMode = "customer_service") {
    const normalizedUserId = String(conversation?.userId || "").trim();
    const normalizedConversationRef = String(conversation?.conversationRef || "").trim();
    const normalizedParticipantLabel = String(conversation?.participantLabel || "").trim();
    const accountLabel = summarizePlatformAccount(platformId, getPlatformFields(platformId) ?? {});
    const resolvedLabel = normalizedParticipantLabel || normalizedUserId || normalizedConversationRef;
    return {
      title: serviceMode === "owner"
        ? `${platformId} · 我的会话`
        : (String(conversation?.title || "").trim() || `${platformId} · ${resolvedLabel}`),
      participantLabel: serviceMode === "owner" ? "我" : resolvedLabel,
      replyTargetId: String(conversation?.replyTargetId || "").trim() || normalizedUserId || normalizedConversationRef,
      remoteUserId: String(conversation?.remoteUserId || "").trim() || normalizedUserId,
      remoteThreadId: String(conversation?.remoteThreadId || "").trim() || undefined,
      accountLabel,
      serviceMode,
    };
  }

  function buildPlatformConversationDispatchInstruction({
    platformId,
    userId,
    inboundText,
    serviceMode,
  }) {
    if (serviceMode === "owner") {
      return String(inboundText || "").trim();
    }

    const channel = mapPlatformToChannel(platformId);
    const accountLabel = summarizePlatformAccount(platformId, getPlatformFields(platformId) ?? {});
    return [
      "这是来自外部消息平台的一段真实客户会话，请直接以客服/售前/售后支持身份回复。",
      "回复要求：",
      "- 不要暴露内部 agent、系统、任务拆解、工具调用、工作流或任何软件后台信息。",
      "- 直接站在当前软件用户的业务视角回复，把对方当成客户或潜在客户来服务。",
      "- 语气专业、自然、简洁，先解决问题，再推进下一步。",
      "- 如果信息不足，只追问最关键的一两个澄清点，不要像问卷一样连续盘问。",
      "- 直接输出要发给对方的话，不要附加解释。",
      `平台：${platformId}`,
      `渠道：${channel}`,
      `账号：${accountLabel || "默认账号"}`,
      `会话对象：${userId}`,
      `客户消息：${String(inboundText || "").trim()}`,
    ].join("\n");
  }

  function buildChannelSessionSnapshot({
    platformId,
    targetId,
    direction,
    text,
    deliveryStatus,
    requiresReply,
    status,
    summary,
    timestamp,
    deliveryError,
    externalMessageId,
    title,
    participantLabel,
    replyTargetId,
    remoteUserId,
    remoteThreadId,
    accountLabel,
    serviceMode,
  }) {
    const channel = mapPlatformToChannel(platformId);
    return {
      channel,
      externalRef: String(targetId),
      title: title || `${platformId}:${targetId}`,
      participantLabel: participantLabel || String(targetId),
      replyTargetId: replyTargetId || String(targetId),
      remoteUserId: remoteUserId || replyTargetId || String(targetId),
      ...(remoteThreadId ? { remoteThreadId } : {}),
      ...(serviceMode ? { serviceMode } : {}),
      lastMessageDirection: direction,
      lastDeliveryStatus: deliveryStatus,
      lastDeliveryError: deliveryError,
      lastMessagePreview: String(text || "").slice(0, 140),
      unreadCount: direction === "inbound" ? 1 : 0,
      requiresReply,
      status,
      summary,
      lastMessageAt: timestamp,
      lastExternalMessageId: externalMessageId ? String(externalMessageId) : undefined,
      lastInboundAt: direction === "inbound" ? timestamp : undefined,
      lastOutboundAt: direction === "outbound" ? timestamp : undefined,
      lastOutboundText: direction === "outbound" ? String(text || "") : undefined,
      lastFailedOutboundText: deliveryStatus === "failed" ? String(text || "") : undefined,
      accountLabel: accountLabel || summarizePlatformAccount(platformId, getPlatformFields(platformId) ?? {}),
    };
  }

  return {
    normalizePlatformInboundMessage,
    normalizePlatformIdentityList,
    getPlatformOwnerIdentifiers,
    isOwnerPlatformConversation,
    buildPlatformConversationIdentity,
    buildPlatformConversationDispatchInstruction,
    buildChannelSessionSnapshot,
  };
}

