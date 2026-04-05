"use client";

import { useEffect, useMemo, useState } from "react";
import { sendWs } from "@/hooks/useWebSocket";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import {
  canDirectReplySession,
  getChannelSessionNextAction,
  getChannelSessionRecentAction,
  getChannelSessionStateLabel,
  shouldSuggestDesktopTakeover,
} from "@/lib/channel-session-presentation";
import {
  buildPlatformConnectionSnapshot,
  getPlatformRequiredFieldSummary,
  getPlatformStatusLabel,
  getPlatformStatusTone,
  isPlatformOperationalStatus,
} from "@/lib/platform-connectors";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { ControlCenterSectionId } from "@/store/types";
import type {
  BusinessChannelSession,
  BusinessContentPublishResult,
  BusinessContentTask,
  BusinessOperationRecord,
} from "@/types/business-entities";

export function ChannelsCenter() {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyKey, setSendingReplyKey] = useState<string | null>(null);
  const { platformConfigs, updatePlatformConfig, reconcilePlatformConfig } = useStore();
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const channelActionResult = useStore(s => s.channelActionResult);
  const wsStatus = useStore(s => s.wsStatus);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const focusWorkflowRun = useStore(s => s.focusWorkflowRun);
  const launchContentTaskNextCycle = useStore(s => s.launchContentTaskNextCycle);
  const applyContentChannelGovernance = useStore(s => s.applyContentChannelGovernance);
  const markBusinessChannelSessionHandled = useStore(s => s.markBusinessChannelSessionHandled);
  const setChannelActionResult = useStore(s => s.setChannelActionResult);

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );
  const channelSessionMap = useMemo(
    () => Object.fromEntries(scopedChannelSessions.map(session => [session.id, session])),
    [scopedChannelSessions],
  );
  const contentTaskMap = useMemo(
    () => Object.fromEntries(scopedContentTasks.map(task => [task.id, task])),
    [scopedContentTasks],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );
  const recentChannelEvents = useMemo(
    () =>
      scopedOperationLogs
        .filter(log =>
          log.entityType === "contentTask"
          && ["publish", "dispatch", "governance", "desktop"].includes(log.eventType)
          && Boolean(contentTaskMap[log.entityId]),
        )
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 6)
        .map(log => ({
          log,
          task: contentTaskMap[log.entityId],
          latestPublishResult: resolveLatestPublishResult(contentTaskMap[log.entityId], log),
          fallbackExecutionRunId: log.executionRunId ?? contentTaskMap[log.entityId].lastExecutionRunId,
          fallbackWorkflowRunId: log.workflowRunId ?? contentTaskMap[log.entityId].lastWorkflowRunId,
        })),
    [contentTaskMap, scopedOperationLogs],
  );
  const recentConnectorEvents = useMemo(
    () =>
      scopedOperationLogs
        .filter(log =>
          log.entityType === "channelSession"
          && ["connector", "message", "dispatch"].includes(log.eventType)
          && Boolean(channelSessionMap[log.entityId]),
        )
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 6)
        .map(log => ({
          log,
          session: channelSessionMap[log.entityId],
        })),
    [channelSessionMap, scopedOperationLogs],
  );
  const platformSnapshots = useMemo(
    () =>
      PLATFORM_DEFINITIONS.map(def => {
        const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" as const };
        const snapshot = buildPlatformConnectionSnapshot({
          platformId: def.id,
          config,
          wsStatus,
          sessions: scopedChannelSessions,
          operationLogs: scopedOperationLogs,
        });
        return { def, config, snapshot };
      }),
    [platformConfigs, scopedChannelSessions, scopedOperationLogs, wsStatus],
  );
  const attentionSessions = useMemo(
    () =>
      scopedChannelSessions
        .filter(session => session.requiresReply || (session.unreadCount ?? 0) > 0 || session.lastDeliveryStatus === "failed")
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt)
        .slice(0, 6),
    [scopedChannelSessions],
  );
  const platformAttentionItems = useMemo(
    () =>
      platformSnapshots
        .filter(({ config, snapshot }) =>
          config.enabled
          && (
            !isPlatformOperationalStatus(snapshot.status)
            || snapshot.needsReplyCount > 0
            || snapshot.failedSessionCount > 0
            || snapshot.missingRequiredFields.length > 0
          ),
        )
        .sort((left, right) => {
          const leftScore = left.snapshot.failedSessionCount + left.snapshot.needsReplyCount;
          const rightScore = right.snapshot.failedSessionCount + right.snapshot.needsReplyCount;
          return rightScore - leftScore;
        })
        .slice(0, 6),
    [platformSnapshots],
  );
  const latestConnectorFailure = useMemo(
    () => recentConnectorEvents.find(item => item.log.status === "failed") ?? null,
    [recentConnectorEvents],
  );
  const webhookPendingCount = useMemo(
    () => platformSnapshots.filter(({ config, snapshot, def }) =>
      config.enabled && def.webhookBased && (snapshot.status === "webhook_missing" || snapshot.status === "configured"),
    ).length,
    [platformSnapshots],
  );

  const enabledCount = PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.enabled).length;
  const connectedCount = PLATFORM_DEFINITIONS.filter(def => isPlatformOperationalStatus(platformConfigs[def.id]?.status ?? "idle")).length;
  const webhookCount = PLATFORM_DEFINITIONS.filter(def => def.webhookBased).length;
  const pendingRepliesCount = scopedChannelSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const unhealthyCount = PLATFORM_DEFINITIONS.filter(def => {
    const status = platformConfigs[def.id]?.status ?? "idle";
    return status !== "idle" && !isPlatformOperationalStatus(status) && status !== "configured";
  }).length;

  const toggleChannel = (platformId: string) => {
    const current = platformConfigs[platformId] ?? { enabled: false, fields: {}, status: "idle" as const };
    const nextEnabled = !current.enabled;

    updatePlatformConfig(platformId, {
      enabled: nextEnabled,
      status: nextEnabled ? "syncing" : "idle",
      errorMsg: undefined,
      detail: nextEnabled ? "正在同步连接器配置。" : undefined,
      lastSyncedAt: Date.now(),
    });
    if (nextEnabled) {
      reconcilePlatformConfig(platformId);
    }

    sendWs({
      type: "platform_sync",
      platformId,
      enabled: nextEnabled,
      fields: nextEnabled ? current.fields : {},
    });
    void syncRuntimeSettings();
  };

  useEffect(() => {
    if (!channelActionResult?.sessionId) return;
    setSendingReplyKey(current => (current === channelActionResult.sessionId ? null : current));
    if (channelActionResult.ok) {
      setReplyDraft(channelActionResult.sessionId, "");
    }
    const timer = window.setTimeout(() => {
      setChannelActionResult(null);
    }, channelActionResult.ok ? 1800 : 4200);
    return () => window.clearTimeout(timer);
  }, [channelActionResult, setChannelActionResult]);

  const setReplyDraft = (sessionId: string, value: string) => {
    setReplyDrafts(current => ({
      ...current,
      [sessionId]: value,
    }));
  };

  const sendChannelReply = (session: BusinessChannelSession, options?: { text?: string; retry?: boolean }) => {
    const text = (options?.text ?? replyDrafts[session.id] ?? "").trim();
    if (!text || !canDirectReplySession(session)) return;

    setSendingReplyKey(session.id);
    if (options?.text && !(replyDrafts[session.id] ?? "").trim()) {
      setReplyDraft(session.id, text);
    }
    const requestId = `channel-action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    sendWs({
      requestId,
      type: "channel_session_action",
      action: "send_reply",
      sessionId: session.id,
      platformId: session.channel,
      externalRef: session.externalRef,
      title: session.title,
      participantLabel: session.participantLabel,
      remoteUserId: session.remoteUserId,
      accountLabel: session.accountLabel,
      text,
      retry: Boolean(options?.retry),
    });
  };

  const markSessionHandled = (session: BusinessChannelSession) => {
    const requestId = `channel-action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sent = sendWs({
      requestId,
      type: "channel_session_action",
      action: "mark_handled",
      sessionId: session.id,
      platformId: session.channel,
      externalRef: session.externalRef,
      title: session.title,
      participantLabel: session.participantLabel,
      remoteUserId: session.remoteUserId,
      accountLabel: session.accountLabel,
    });
    if (!sent) {
      markBusinessChannelSessionHandled({
        channelSessionId: session.id,
        trigger: "manual",
        detail: `已在 Channels Center 将 ${session.title} 标记为已处理。`,
        handledBy: "manual",
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(96, 165, 250, 0.14), rgba(255,255,255,0.02))",
          borderColor: "rgba(96, 165, 250, 0.22)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Channels Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Bridge-style channel overview for external message access
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          This lightweight layer turns the existing platform settings into a visible channel board, so external access routes feel like part of the workbench rather than a hidden configuration form.
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Current project: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
            去远程值守面板
          </button>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
            去详细平台设置
          </button>
        </div>
      </div>

      {channelActionResult ? (
        <div
          className="card"
          style={{
            padding: 14,
            borderColor: channelActionResult.ok ? "rgba(34, 197, 94, 0.24)" : "rgba(239, 68, 68, 0.24)",
            background: channelActionResult.ok
              ? "linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(255,255,255,0.02))"
              : "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(255,255,255,0.02))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {channelActionResult.ok ? "渠道动作已完成" : "渠道动作失败"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {channelActionResult.message}
                {channelActionResult.failureReason ? ` · ${channelActionResult.failureReason}` : ""}
              </div>
            </div>
            <span style={eventBadgeStyle(channelActionResult.ok ? "completed" : "failed")}>
              {channelActionResult.ok ? "OK" : "失败"}
            </span>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <ChannelMetric label="Channels" value={PLATFORM_DEFINITIONS.length} accent="var(--accent)" />
        <ChannelMetric label="Enabled" value={enabledCount} accent="#60a5fa" />
        <ChannelMetric label="Connected" value={connectedCount} accent="var(--success)" />
        <ChannelMetric label="Pending Replies" value={pendingRepliesCount} accent="#f59e0b" />
        <ChannelMetric label="Attention" value={unhealthyCount} accent="#fb7185" />
        <ChannelMetric label="Webhook-based" value={webhookCount} accent="var(--warning)" />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Quick Diagnosis</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          不需要真实凭证也能先判断更可能卡在配置、实时链路还是平台回执。
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={inlineTagStyle}>WebSocket {wsStatus}</span>
            <span style={inlineTagStyle}>已启用 {enabledCount}</span>
            <span style={inlineTagStyle}>可运行 {connectedCount}</span>
            <span style={inlineTagStyle}>待回调 {webhookPendingCount}</span>
            <span style={inlineTagStyle}>待回复 {pendingRepliesCount}</span>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
            {wsStatus !== "connected"
              ? "如果 WebSocket 是 disconnected，先修实时链路，否则平台状态和动作回执都不会及时回流。"
              : enabledCount === 0
                ? "如果一个连接器都没启用，先去详细平台设置保存并同步凭证。"
                : connectedCount === 0
                  ? "连接器已启用但没有进入 connected/degraded，优先检查必填字段、Webhook 地址和服务端握手。"
                  : latestConnectorFailure
                    ? `最近失败来自 ${latestConnectorFailure.session.title}：${latestConnectorFailure.log.detail}`
                    : "当前没有明显的连接器级失败，下一步优先用真实会话验证入站和回复。"}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
              去平台设置排查
            </button>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("readiness")}>
              去上线总看板
            </button>
          </div>
        </div>
      </div>

      {channelActionResult ? (
        <div
          className="card"
          style={{
            padding: 14,
            borderColor: channelActionResult.ok ? "rgba(34, 197, 94, 0.24)" : "rgba(248, 113, 113, 0.24)",
            background: channelActionResult.ok
              ? "linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(255,255,255,0.02))"
              : "linear-gradient(135deg, rgba(248, 113, 113, 0.08), rgba(255,255,255,0.02))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: channelActionResult.ok ? "var(--success)" : "var(--danger)" }}>
                {channelActionResult.ok ? "渠道动作已完成" : "渠道动作失败"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.75 }}>
                {channelActionResult.message}
                {channelActionResult.failureReason ? ` · ${channelActionResult.failureReason}` : ""}
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setChannelActionResult(null)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Platform Health Snapshot</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          把凭证状态、实时会话流量、待回复压力和失败发送放进同一张平台健康图里。
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {platformSnapshots.map(({ def, config, snapshot }) => {
            const statusColor =
              snapshot.tone === "ready" ? "var(--success)"
                : snapshot.tone === "partial" ? "var(--warning)"
                  : snapshot.tone === "blocked" ? "var(--danger)"
                    : "var(--text-muted)";

            return (
              <article
                key={`platform-health-${def.id}`}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: config.enabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{def.emoji} {def.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {config.accountLabel ?? snapshot.detail}
                    </div>
                  </div>
                  <span style={buildStatusChipStyle(statusColor)}>
                    {snapshot.label}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>健康度 {snapshot.healthScore}%</span>
                  <span>会话 {snapshot.sessionCount}</span>
                  <span>待回复 {snapshot.needsReplyCount}</span>
                  <span>失败 {snapshot.failedSessionCount}</span>
                </div>

                {snapshot.missingRequiredFields.length > 0 ? (
                  <div style={{ fontSize: 11, color: "var(--warning)", lineHeight: 1.7 }}>
                    缺少字段: {snapshot.missingRequiredFields.join(" / ")}
                  </div>
                ) : null}

                {snapshot.lastActivityAt ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    最近活动 {formatEventTime(snapshot.lastActivityAt)}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                    去配置字段
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                    去远程值守
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => toggleChannel(def.id)}>
                    {config.enabled ? "重新同步" : "启用连接器"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Attention Queue</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          这里单独看需要人工处理的会话和平台，不再让它们淹没在普通事件流里。
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {attentionSessions.length === 0 && platformAttentionItems.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              当前项目没有连接器侧的明显待办。
            </div>
          ) : (
            <>
              {attentionSessions.map(session => (
                (() => {
                  const stateLabel = getChannelSessionStateLabel(session);
                  const recentAction = getChannelSessionRecentAction(session);
                  const nextAction = getChannelSessionNextAction(session);
                  const needsDesktopTakeover = shouldSuggestDesktopTakeover(session);

                  return (
                <article
                  key={`attention-session-${session.id}`}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{session.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {session.channel} · {session.accountLabel ?? "默认账号"} · {session.participantLabel ?? session.remoteUserId ?? "未命名会话"}
                      </div>
                    </div>
                    <span style={eventBadgeStyle(session.lastDeliveryStatus === "failed" ? "failed" : stateLabel === "已处理" ? "completed" : "pending")}>
                      {stateLabel}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                    {session.lastMessagePreview ?? session.summary}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span>未读 {session.unreadCount ?? 0}</span>
                    <span>方向 {session.lastMessageDirection ?? "mixed"}</span>
                    <span>最近活动 {formatEventTime(session.lastMessageAt)}</span>
                    <span>最近动作 {recentAction}</span>
                    <span>下一步 {nextAction}</span>
                    {session.lastSyncedAt ? <span>同步 {formatEventTime(session.lastSyncedAt)}</span> : null}
                  </div>

                  {session.lastDeliveryError ? (
                    <div style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.7 }}>
                      最近错误: {session.lastDeliveryError}
                    </div>
                  ) : null}

                  {canDirectReplySession(session) ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <textarea
                        className="input"
                        value={replyDrafts[session.id] ?? ""}
                        onChange={event => setReplyDraft(session.id, event.target.value)}
                        placeholder="输入快速回复..."
                        style={{ minHeight: 82, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session)}
                          disabled={sendingReplyKey === session.id || !(replyDrafts[session.id] ?? "").trim()}
                        >
                          {sendingReplyKey === session.id ? "发送中..." : "发送回复"}
                        </button>
                        {session.lastDeliveryStatus === "failed" && session.lastMessageDirection === "outbound" && session.lastMessagePreview ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => sendChannelReply(session, { text: session.lastMessagePreview, retry: true })}
                            disabled={sendingReplyKey === session.id}
                          >
                            重试最近发送
                          </button>
                        ) : null}
                        {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                          <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                            标记已处理
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      去远程值守接管
                    </button>
                    {needsDesktopTakeover ? (
                      <button type="button" className="btn-ghost" onClick={() => openControlSection("desktop")}>
                        去桌面接管
                      </button>
                    ) : null}
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      回聊天接管
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("entities")}>
                      查看会话实体
                    </button>
                  </div>
                </article>
                  );
                })()
              ))}

              {platformAttentionItems.map(({ def, snapshot }) => (
                <article
                  key={`attention-platform-${def.id}`}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{def.emoji} {def.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {snapshot.detail}
                      </div>
                    </div>
                    <span style={eventBadgeStyle(snapshot.failedSessionCount > 0 ? "failed" : "pending")}>
                      {snapshot.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span>待回复 {snapshot.needsReplyCount}</span>
                    <span>失败 {snapshot.failedSessionCount}</span>
                    <span>会话 {snapshot.sessionCount}</span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                      去详细设置
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      去远程值守
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Live Connector Sessions</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          这里展示真实渠道会话实体，而不只是内容任务的发布回写。
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {scopedChannelSessions.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              当前项目还没有同步到真实渠道会话。
            </div>
          ) : (
            scopedChannelSessions.slice(0, 6).map(session => {
              const stateLabel = getChannelSessionStateLabel(session);
              const recentAction = getChannelSessionRecentAction(session);
              const nextAction = getChannelSessionNextAction(session);
              const needsDesktopTakeover = shouldSuggestDesktopTakeover(session);

              return (
              <article
                key={session.id}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{session.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {session.channel} · {session.accountLabel ?? "默认账号"} · {session.participantLabel ?? session.remoteUserId ?? "未命名会话"}
                    </div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span style={eventBadgeStyle(session.lastDeliveryStatus === "failed" ? "failed" : stateLabel === "已处理" ? "completed" : "pending")}>
                      {stateLabel}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(session.lastMessageAt)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>状态 {session.status}</span>
                  <span>方向 {session.lastMessageDirection ?? "mixed"}</span>
                  <span>未读 {session.unreadCount ?? 0}</span>
                  <span>投递 {session.lastDeliveryStatus ?? "pending"}</span>
                  <span>最近动作 {recentAction}</span>
                  <span>下一步 {nextAction}</span>
                  {session.lastHandledAt ? <span>处理 {formatEventTime(session.lastHandledAt)}</span> : null}
                  {session.lastSyncedAt ? <span>同步 {formatEventTime(session.lastSyncedAt)}</span> : null}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                  {session.lastMessagePreview ?? session.summary}
                </div>

                {session.lastDeliveryError ? (
                  <div style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.7 }}>
                    最近错误: {session.lastDeliveryError}
                  </div>
                ) : null}

                {canDirectReplySession(session) ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <textarea
                      className="input"
                      value={replyDrafts[session.id] ?? ""}
                      onChange={event => setReplyDraft(session.id, event.target.value)}
                      placeholder="输入快速回复..."
                      style={{ minHeight: 82, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => sendChannelReply(session)}
                        disabled={sendingReplyKey === session.id || !(replyDrafts[session.id] ?? "").trim()}
                      >
                        {sendingReplyKey === session.id ? "发送中..." : "发送回复"}
                      </button>
                      {session.lastDeliveryStatus === "failed" && session.lastMessageDirection === "outbound" && session.lastMessagePreview ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session, { text: session.lastMessagePreview, retry: true })}
                          disabled={sendingReplyKey === session.id}
                        >
                          重试最近发送
                        </button>
                      ) : null}
                      {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                        <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                          标记已处理
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("entities")}>
                    打开会话实体
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                    去远程值守
                  </button>
                  {needsDesktopTakeover ? (
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("desktop")}>
                      去桌面接管
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                    回聊天接管
                  </button>
                </div>
              </article>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Connector Events</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          连接器和消息事件现在单独可见，不再混在内容发布日志里。
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {recentConnectorEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              当前项目还没有连接器级事件。
            </div>
          ) : (
            recentConnectorEvents.map(({ log, session }) => (
              <article
                key={log.id}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{session.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {getEventTypeLabel(log.eventType)} · {session.channel} · {session.accountLabel ?? "默认账号"}
                    </div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span style={eventBadgeStyle(log.status)}>{log.status}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(log.createdAt)}</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                  {log.detail}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {log.failureReason ? (
                    <span style={inlineTagStyle}>原因 {log.failureReason}</span>
                  ) : null}
                  {session.lastExternalMessageId ? (
                    <span style={inlineTagStyle}>消息 {session.lastExternalMessageId}</span>
                  ) : null}
                  {session.externalRef ? (
                    <span style={inlineTagStyle}>会话 {session.externalRef}</span>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {log.executionRunId ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setActiveExecutionRun(log.executionRunId!);
                        openControlSection("execution");
                      }}
                    >
                      查看对应执行
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                    打开远程值守
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                    回聊天接管
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Recent Channel Events</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          这里直接复用内容任务的发布、派发和治理日志，把渠道异常变成可回跳的入口。
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {recentChannelEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              当前项目还没有可用于渠道回跳的业务事件。
            </div>
          ) : (
            recentChannelEvents.map(({ log, task, latestPublishResult, fallbackExecutionRunId, fallbackWorkflowRunId }) => {
              const highlights = buildChannelEventHighlights(task, log, latestPublishResult);
              const contextLine = buildChannelEventContext(task, log, latestPublishResult);

              return (
                <article
                  key={log.id}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ") || task.channel}
                      </div>
                    </div>
                    <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                      <span style={eventBadgeStyle(log.status)}>{log.status}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(log.createdAt)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span>事件 {getEventTypeLabel(log.eventType)}</span>
                    <span>阶段 {task.status}</span>
                    <span>格式 {task.format}</span>
                    <span>主发 {task.recommendedPrimaryChannel ?? task.channel}</span>
                    <span>{task.riskyChannels.length > 0 ? `风险 ${task.riskyChannels.join(" / ")}` : "暂无高风险渠道"}</span>
                  </div>

                  {highlights.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {highlights.map(highlight => (
                        <span
                          key={`${log.id}-${highlight}`}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.04)",
                            color: "var(--text-muted)",
                            fontSize: 11,
                          }}
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                    {log.detail}
                  </div>

                  {contextLine ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        lineHeight: 1.7,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {contextLine}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {log.eventType === "publish" && log.status === "failed" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          const workflowRunId = launchContentTaskNextCycle({
                            contentTaskId: task.id,
                            recommendation: task.nextCycleRecommendation ?? "retry",
                            detail: "从渠道事件卡恢复失败发布，系统已按下一轮建议重新排队内容 workflow。",
                            trigger: "manual",
                          });
                          if (workflowRunId) {
                            focusWorkflowRun(workflowRunId);
                            openControlSection("workflow");
                          } else {
                            setTab("tasks");
                          }
                        }}
                      >
                        按建议重试
                      </button>
                    ) : null}
                    {log.eventType === "governance" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          applyContentChannelGovernance({
                            contentTaskId: task.id,
                            strategy: "prioritize_primary",
                            detail: "从渠道事件卡同步治理策略，已按推荐主发渠道重排目标。",
                            trigger: "manual",
                          });
                          focusBusinessContentTask(task.id);
                          openControlSection("entities");
                        }}
                      >
                        同步渠道策略
                      </button>
                    ) : null}
                    {fallbackExecutionRunId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setActiveExecutionRun(fallbackExecutionRunId);
                          openControlSection("execution");
                        }}
                      >
                        查看对应执行
                      </button>
                    ) : null}
                    {fallbackWorkflowRunId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          focusWorkflowRun(fallbackWorkflowRunId);
                          openControlSection("workflow");
                        }}
                      >
                        定位到 Workflow
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        focusBusinessContentTask(task.id);
                        openControlSection("entities");
                      }}
                    >
                      定位到内容实体
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      打开远程值守
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      回聊天接管
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Channel Board</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Toggle channels, inspect readiness, and see which routes need public webhook support.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {platformSnapshots.map(({ def, config, snapshot }) => {
            const { requiredFields, readyCount, readiness } = getPlatformRequiredFieldSummary(def, config);
            const tone = getPlatformStatusTone(snapshot.status);
            const statusColor =
              tone === "ready" ? "var(--success)"
                : tone === "partial" ? "var(--warning)"
                  : tone === "blocked" ? "var(--danger)"
                    : "var(--text-muted)";

            return (
              <article
                key={def.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${config.enabled ? "rgba(var(--accent-rgb), 0.28)" : "var(--border)"}`,
                  background: config.enabled ? "rgba(var(--accent-rgb), 0.08)" : "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{def.emoji}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{def.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {def.description}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${statusColor}33`,
                      background: `${statusColor}1f`,
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                    >
                    {getPlatformStatusLabel(snapshot.status)}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={channelRowStyle}>
                    <span>Mode</span>
                    <strong>{def.webhookBased ? "Webhook" : "Direct Bot"}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Required fields</span>
                    <strong>{readyCount}/{requiredFields.length || 0}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Readiness</span>
                    <strong>{readiness}%</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Sessions</span>
                    <strong>{snapshot.sessionCount}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>Pending replies</span>
                    <strong>{snapshot.needsReplyCount}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {def.fields.map(field => (
                    <span
                      key={`${def.id}-${field.key}`}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: (config.fields[field.key] ?? "").trim()
                          ? "rgba(var(--success-rgb), 0.12)"
                          : "rgba(255,255,255,0.04)",
                        color: (config.fields[field.key] ?? "").trim() ? "var(--success)" : "var(--text-muted)",
                        fontSize: 11,
                      }}
                    >
                      {field.label}
                    </span>
                  ))}
                </div>

                {def.webhookBased && (
                  <div
                    style={{
                      fontSize: 11,
                      lineHeight: 1.7,
                      color: "var(--warning)",
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.18)",
                      borderRadius: 12,
                      padding: "10px 12px",
                    }}
                  >
                    This channel needs a public callback endpoint before it can behave like a live bridge.
                  </div>
                )}

                {snapshot.detail ? (
                  <div
                    style={{
                      fontSize: 11,
                      lineHeight: 1.7,
                      color: statusColor,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: "10px 12px",
                    }}
                  >
                    {snapshot.detail}
                  </div>
                ) : null}

                {config.webhookUrl ? (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Webhook: {config.webhookUrl}
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <span style={{ fontSize: 11, color: config.enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
                    {config.enabled ? "Enabled in shell" : "Disabled in shell"}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      去远程值守
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                      配置字段
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => toggleChannel(def.id)}>
                      {config.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChannelMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

const channelRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  color: "var(--text-muted)",
};

function eventBadgeStyle(status: string) {
  const color = status === "completed" || status === "sent"
    ? "var(--success)"
    : status === "pending"
      ? "var(--warning)"
      : "var(--danger)";

  return {
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}1f`,
    color,
    fontSize: 10,
    fontWeight: 700,
  };
}

function buildStatusChipStyle(color: string) {
  return {
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}1f`,
    color,
    fontSize: 10,
    fontWeight: 700,
  };
}

const inlineTagStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-muted)",
  fontSize: 11,
} as const;

function getEventTypeLabel(eventType: BusinessOperationRecord["eventType"]) {
  if (eventType === "connector") return "连接器健康";
  if (eventType === "message") return "消息事件";
  if (eventType === "publish") return "发布回写";
  if (eventType === "governance") return "渠道治理";
  if (eventType === "desktop") return "桌面动作";
  if (eventType === "dispatch") return "派发准备";
  if (eventType === "workflow") return "Workflow";
  return "业务事件";
}

function formatEventTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function resolveLatestPublishResult(
  task: BusinessContentTask,
  log: BusinessOperationRecord,
): BusinessContentPublishResult | null {
  const sortedResults = [...task.publishedResults].sort((left, right) => right.publishedAt - left.publishedAt);
  return (
    sortedResults.find(result =>
      (log.workflowRunId && result.workflowRunId === log.workflowRunId)
      || (log.executionRunId && result.executionRunId === log.executionRunId)
      || (log.externalRef && `${result.channel}:${result.accountLabel}` === log.externalRef)
      || (Boolean(log.failureReason) && result.failureReason === log.failureReason)
      || result.status === log.status,
    ) ?? sortedResults[0] ?? null
  );
}

function buildChannelEventHighlights(
  task: BusinessContentTask,
  log: BusinessOperationRecord,
  latestPublishResult: BusinessContentPublishResult | null,
) {
  if (log.eventType === "publish") {
    return [
      latestPublishResult ? `渠道 ${latestPublishResult.channel}:${latestPublishResult.accountLabel}` : `渠道 ${task.channel}`,
      latestPublishResult?.externalId ? `外部ID ${latestPublishResult.externalId}` : "",
      latestPublishResult?.link ? "已回写链接" : "",
      log.failureReason ? `失败原因 ${log.failureReason}` : "",
    ].filter(Boolean);
  }

  if (log.eventType === "governance") {
    return [
      `推荐主发 ${task.recommendedPrimaryChannel ?? task.channel}`,
      task.nextCycleRecommendation ? `下一轮 ${task.nextCycleRecommendation}` : "",
      task.riskyChannels.length > 0 ? `风险渠道 ${task.riskyChannels.join(" / ")}` : "当前无风险渠道",
    ].filter(Boolean);
  }

  if (log.eventType === "desktop") {
    return [
      `目标 ${task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ") || task.channel}`,
      log.status === "blocked" ? "待人工接管" : "",
      log.failureReason ? `原因 ${log.failureReason}` : "",
    ].filter(Boolean);
  }

  return [
    `目标 ${task.goal}`,
    task.scheduledFor ? `排期 ${formatEventTime(task.scheduledFor)}` : "",
    task.latestDraftSummary ? "已有草稿摘要" : "",
  ].filter(Boolean);
}

function buildChannelEventContext(
  task: BusinessContentTask,
  log: BusinessOperationRecord,
  latestPublishResult: BusinessContentPublishResult | null,
) {
  if (log.eventType === "publish") {
    if (log.status === "failed") {
      return latestPublishResult?.failureReason
        ?? log.failureReason
        ?? "发布失败，但当前还没有记录更细的失败原因。";
    }

    const externalRef = latestPublishResult?.externalId ?? log.externalRef;
    const summary = latestPublishResult?.summary ?? task.latestPostmortemSummary ?? task.latestDraftSummary;
    return [
      externalRef ? `外部回执: ${externalRef}` : "",
      summary ? `最近产出: ${summary}` : "",
    ].filter(Boolean).join(" · ");
  }

  if (log.eventType === "governance") {
    const governanceSummary = task.channelGovernance
      .slice(0, 3)
      .map(item => `${item.channel} ${item.completed}/${item.failed} ${item.recommendation}`)
      .join(" · ");
    return governanceSummary || task.latestPostmortemSummary || "";
  }

  if (log.eventType === "desktop") {
    return [
      task.lastWorkflowRunId ? `最近 Workflow: ${task.lastWorkflowRunId}` : "",
      task.lastExecutionRunId ? `最近执行: ${task.lastExecutionRunId}` : "",
      task.latestDraftSummary ?? "",
    ].filter(Boolean).join(" · ");
  }

  return task.latestDraftSummary ?? task.brief;
}
