export function createPlatformMessageOrchestrator({
  randomUUID,
  dispatch,
  platformResultListeners,
  normalizePlatformInboundMessage,
  isOwnerPlatformConversation,
  buildPlatformConversationIdentity,
  buildPlatformConversationDispatchInstruction,
  buildChannelSessionSnapshot,
  hasProcessedInboundMessage,
  markInboundMessageProcessed,
  broadcastPlatformStatus,
  broadcastChannelEvent,
  sendPlatformMessageWithRetry,
  resolveOutboundFailurePresentation,
  summarizePlatformAccount,
  getPlatformFields,
}) {
  return async function handlePlatformMessage(messageOrUserId, text, platformId) {
    const taskAgentMap = {};
    const inboundMessage = normalizePlatformInboundMessage(messageOrUserId, text, platformId);
    if (!inboundMessage.userId || !inboundMessage.text || !inboundMessage.platformId) {
      return;
    }

    const {
      userId,
      text: inboundText,
      platformId: inboundPlatformId,
      inboundMessageKey,
      externalMessageId,
      conversationRef: rawConversationRef,
      replyTargetId: rawReplyTargetId,
    } = inboundMessage;
    const inboundTimestamp = Date.now();
    const ownerConversation = isOwnerPlatformConversation(inboundPlatformId, userId);
    const serviceMode = ownerConversation ? "owner" : "customer_service";
    const conversationRef = rawConversationRef || rawReplyTargetId || userId;
    const replyTargetId = rawReplyTargetId || userId;
    const sessionIdentity = buildPlatformConversationIdentity(inboundPlatformId, {
      ...inboundMessage,
      conversationRef,
      replyTargetId,
    }, serviceMode);
    const dispatchSessionId = `${serviceMode === "owner" ? "platform-owner" : "platform-support"}:${inboundPlatformId}:${conversationRef}`;
    const channelExecutionRunId = `platform-run:${randomUUID()}`;

    if (inboundMessageKey && hasProcessedInboundMessage(inboundPlatformId, inboundMessageKey, inboundTimestamp)) {
      broadcastPlatformStatus(inboundPlatformId, {
        status: "connected",
        detail: "检测到重复入站消息，已自动去重忽略。",
        healthScore: 100,
        lastEventAt: inboundTimestamp,
        lastInboundAt: inboundTimestamp,
        lastInboundMessageKey: inboundMessageKey,
        lastInboundTarget: conversationRef,
        accountLabel: summarizePlatformAccount(inboundPlatformId, getPlatformFields(inboundPlatformId)),
      });
      return;
    }

    if (inboundMessageKey) {
      markInboundMessageProcessed(inboundPlatformId, inboundMessageKey, inboundTimestamp);
    }

    broadcastPlatformStatus(inboundPlatformId, {
      status: "connected",
      detail: "已收到最新入站消息，连接器在线。",
      healthScore: 100,
      pendingEvents: 1,
      lastEventAt: inboundTimestamp,
      lastInboundAt: inboundTimestamp,
      lastInboundMessageKey: inboundMessageKey,
      lastInboundTarget: conversationRef,
      accountLabel: summarizePlatformAccount(inboundPlatformId, getPlatformFields(inboundPlatformId)),
    });
    broadcastChannelEvent({
      session: buildChannelSessionSnapshot({
        platformId: inboundPlatformId,
        targetId: conversationRef,
        direction: "inbound",
        text: inboundText,
        deliveryStatus: "delivered",
        requiresReply: true,
        status: "active",
        summary: `最近收到入站消息：${inboundText.slice(0, 80)}`,
        timestamp: inboundTimestamp,
        externalMessageId,
        replyTargetId,
        ...sessionIdentity,
      }),
      title: "收到入站消息",
      detail: inboundText.slice(0, 500),
      status: "completed",
      eventType: "message",
      externalRef: String(conversationRef),
    });

    const deliverPlatformReply = (agentId, resultText) => {
      const normalizedResult = String(resultText || "").trim();
      if (!normalizedResult) return;

      sendPlatformMessageWithRetry({
        platformId: inboundPlatformId,
        targetId: replyTargetId,
        text: normalizedResult,
        trigger: "auto",
        successDetail: "最近一条出站回复已成功送达。",
        failureDetailPrefix: "最近一条出站回复发送失败",
      })
        .then(({ sentAt: outboundTimestamp }) => {
          broadcastChannelEvent({
            session: buildChannelSessionSnapshot({
              platformId: inboundPlatformId,
              targetId: conversationRef,
              direction: "outbound",
              text: normalizedResult,
              deliveryStatus: "sent",
              requiresReply: false,
              status: "active",
              summary: `最近回复已发出：${normalizedResult.slice(0, 80)}`,
              timestamp: outboundTimestamp,
              replyTargetId,
              ...sessionIdentity,
            }),
            title: "发送平台回复",
            detail: normalizedResult.slice(0, 500),
            status: "sent",
            eventType: "message",
            externalRef: String(conversationRef),
          });
        })
        .catch((error) => {
          const failure = resolveOutboundFailurePresentation(error, {
            approvalSummary: "自动回复等待人工批准",
            cooldownSummary: "连接器冷却中，等待人工重试",
            failureSummary: "最近回复发送失败",
          });
          const failureAt = Date.now();
          broadcastChannelEvent({
            session: buildChannelSessionSnapshot({
              platformId: inboundPlatformId,
              targetId: conversationRef,
              direction: "outbound",
              text: normalizedResult,
              deliveryStatus: failure.operationStatus === "failed" ? "failed" : "pending",
              requiresReply: true,
              status: failure.channelStatus,
              summary: failure.summary,
              timestamp: failureAt,
              deliveryError: failure.detail,
              replyTargetId,
              ...sessionIdentity,
            }),
            title: failure.operationStatus === "blocked" ? "平台回复等待人工" : "平台回复发送失败",
            detail: failure.detail,
            status: failure.operationStatus,
            eventType: failure.eventType,
            failureReason: failure.failureReason,
            externalRef: String(conversationRef),
          });
        });
    };

    const listenerId = randomUUID();
    platformResultListeners.set(listenerId, (msg) => {
      if (msg.executionRunId !== channelExecutionRunId) {
        return;
      }
      if (msg.type === "task_add" && msg.task) {
        taskAgentMap[msg.task.id] = msg.task.assignedTo;
        if (msg.task.status === "done" && msg.task.result) {
          deliverPlatformReply(msg.task.assignedTo, msg.task.result);
        }
      }
      if (msg.type === "task_update" && msg.updates?.status === "done" && msg.updates?.result) {
        const agentId = taskAgentMap[msg.taskId];
        deliverPlatformReply(agentId, msg.updates.result);
      }
    });

    try {
      await dispatch(
        buildPlatformConversationDispatchInstruction({
          platformId: inboundPlatformId,
          userId: sessionIdentity.participantLabel || userId,
          inboundText,
          serviceMode,
        }),
        dispatchSessionId,
        channelExecutionRunId,
        "chat",
        null,
        inboundText,
        {
          disableDirectReply: serviceMode !== "owner",
          forcedAgentId: serviceMode === "owner" ? undefined : "greeter",
          forcedComplexity: serviceMode === "owner" ? undefined : "low",
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      platformResultListeners.delete(listenerId);
    }
  };
}

