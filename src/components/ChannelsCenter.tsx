"use client";

import { useEffect, useMemo, useState } from "react";
import { sendWs } from "@/hooks/useWebSocket";
import { pickLocaleText } from "@/lib/ui-locale";
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
  isPlatformOperationalStatus,
} from "@/lib/platform-connectors";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { ControlCenterSectionId, UiLocale } from "@/store/types";
import type {
  BusinessChannelSession,
  BusinessOperationRecord,
} from "@/types/business-entities";

const LIVE_SESSION_WINDOW_MS = 15 * 60 * 1000;

function getChannelSessionActivityTime(session: BusinessChannelSession) {
  return Math.max(
    session.lastMessageAt ?? 0,
    session.lastSyncedAt ?? 0,
    session.lastInboundAt ?? 0,
    session.lastOutboundAt ?? 0,
    session.updatedAt ?? 0,
  );
}

export function ChannelsCenter() {
  const [sendingReplyKey, setSendingReplyKey] = useState<string | null>(null);
  const [liveClock, setLiveClock] = useState(() => Date.now());
  const locale = useStore(s => s.locale);
  const { platformConfigs } = useStore();
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const executionRuns = useStore(s => s.executionRuns);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const channelActionResult = useStore(s => s.channelActionResult);
  const wsStatus = useStore(s => s.wsStatus);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const markBusinessChannelSessionHandled = useStore(s => s.markBusinessChannelSessionHandled);
  const setChannelActionResult = useStore(s => s.setChannelActionResult);

  const text = useMemo(() => ({
    titleEyebrow: pickLocaleText(locale, { "zh-CN": "渠道中心", "zh-TW": "渠道中心", en: "Channels Center", ja: "チャネルセンター" }),
    title: pickLocaleText(locale, {
      "zh-CN": "面向外部消息接入的桥接式渠道总览",
      "zh-TW": "面向外部消息接入的橋接式渠道總覽",
      en: "Bridge-style channel overview for external message access",
      ja: "外部メッセージ接続向けのブリッジ型チャネル概要",
    }),
    subtitle: pickLocaleText(locale, {
      "zh-CN": "把现有平台设置转换成可见的渠道看板，让外部消息链路成为工作台的一部分，而不是隐藏的配置表单。",
      "zh-TW": "把現有平台設定轉成可見的渠道看板，讓外部消息鏈路成為工作台的一部分，而不是隱藏的配置表單。",
      en: "This lightweight layer turns existing platform settings into a visible channel board, so external access routes feel like part of the workbench rather than a hidden configuration form.",
      ja: "既存のプラットフォーム設定を見えるチャネルボードに変え、外部接続ルートを隠れた設定フォームではなく作業台の一部として扱います。",
    }),
    currentProject: pickLocaleText(locale, { "zh-CN": "当前项目", "zh-TW": "目前專案", en: "Current project", ja: "現在のプロジェクト" }),
    generalProject: pickLocaleText(locale, { "zh-CN": "General", "zh-TW": "General", en: "General", ja: "General" }),
    remotePanel: pickLocaleText(locale, { "zh-CN": "去远程值守面板", "zh-TW": "前往遠端值守面板", en: "Open Remote Supervision", ja: "遠隔監督へ" }),
    detailedSettings: pickLocaleText(locale, { "zh-CN": "去详细平台设置", "zh-TW": "前往詳細平台設定", en: "Open Detailed Platform Settings", ja: "詳細設定へ" }),
    metrics: {
      channels: pickLocaleText(locale, { "zh-CN": "渠道数", "zh-TW": "渠道數", en: "Channels", ja: "チャネル数" }),
      enabled: pickLocaleText(locale, { "zh-CN": "已启用", "zh-TW": "已啟用", en: "Enabled", ja: "有効" }),
      connected: pickLocaleText(locale, { "zh-CN": "已连接", "zh-TW": "已連接", en: "Connected", ja: "接続済み" }),
      pendingReplies: pickLocaleText(locale, { "zh-CN": "待回复", "zh-TW": "待回覆", en: "Pending Replies", ja: "返信待ち" }),
      attention: pickLocaleText(locale, { "zh-CN": "需关注", "zh-TW": "需關注", en: "Attention", ja: "要注意" }),
      webhookBased: pickLocaleText(locale, { "zh-CN": "Webhook 型", "zh-TW": "Webhook 型", en: "Webhook-based", ja: "Webhook型" }),
    },
    quickDiagnosis: pickLocaleText(locale, { "zh-CN": "快速诊断", "zh-TW": "快速診斷", en: "Quick Diagnosis", ja: "クイック診断" }),
    attentionQueue: pickLocaleText(locale, { "zh-CN": "关注队列", "zh-TW": "關注隊列", en: "Attention Queue", ja: "要対応キュー" }),
    liveSessions: pickLocaleText(locale, { "zh-CN": "实时连接会话", "zh-TW": "即時連接會話", en: "Live Connector Sessions", ja: "ライブ接続セッション" }),
    recentConnectorEvents: pickLocaleText(locale, { "zh-CN": "最近连接器事件", "zh-TW": "最近連接器事件", en: "Recent Connector Events", ja: "最近の接続イベント" }),
    recentChannelEvents: pickLocaleText(locale, { "zh-CN": "最近渠道事件", "zh-TW": "最近渠道事件", en: "Recent Channel Events", ja: "最近のチャネルイベント" }),
    channelBoard: pickLocaleText(locale, { "zh-CN": "渠道看板", "zh-TW": "渠道看板", en: "Channel Board", ja: "チャネルボード" }),
  }), [locale]);

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveClock(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const channelBoardSessions = useMemo(
    () => [...businessChannelSessions].sort((left, right) => right.lastMessageAt - left.lastMessageAt),
    [businessChannelSessions],
  );
  const channelSessionMap = useMemo(
    () => Object.fromEntries(channelBoardSessions.map(session => [session.id, session])),
    [channelBoardSessions],
  );
  const contentTaskMap = useMemo(
    () => Object.fromEntries(scopedContentTasks.map(task => [task.id, task])),
    [scopedContentTasks],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );
  const channelOperationLogs = useMemo(
    () =>
      businessOperationLogs.filter(log =>
        log.entityType === "channelSession"
        && Boolean(channelSessionMap[log.entityId]),
      ),
    [businessOperationLogs, channelSessionMap],
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
          fallbackExecutionRunId: log.executionRunId ?? contentTaskMap[log.entityId].lastExecutionRunId,
        })),
    [contentTaskMap, scopedOperationLogs],
  );
  const recentConnectorEvents = useMemo(
    () =>
      channelOperationLogs
        .filter(log =>
          ["connector", "message", "dispatch"].includes(log.eventType)
          && Boolean(channelSessionMap[log.entityId]),
        )
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 6)
        .map(log => ({
          log,
          session: channelSessionMap[log.entityId],
        })),
    [channelOperationLogs, channelSessionMap],
  );
  const platformSnapshots = useMemo(
    () =>
      PLATFORM_DEFINITIONS.map(def => {
        const config = platformConfigs[def.id] ?? { enabled: false, fields: {}, status: "idle" as const };
        const snapshot = buildPlatformConnectionSnapshot({
          platformId: def.id,
          config,
          wsStatus,
          sessions: channelBoardSessions,
          operationLogs: channelOperationLogs,
        });
        return { def, config, snapshot };
      }),
    [channelBoardSessions, channelOperationLogs, platformConfigs, wsStatus],
  );
  const realtimeSessions = useMemo(
    () =>
      channelBoardSessions
        .filter(session => getChannelSessionActivityTime(session) >= liveClock - LIVE_SESSION_WINDOW_MS)
        .sort((left, right) => {
          const leftPriority =
            (left.lastDeliveryStatus === "failed" ? 3 : 0)
            + ((left.requiresReply || (left.unreadCount ?? 0) > 0) ? 2 : 0)
            + (left.serviceMode === "customer_service" ? 1 : 0);
          const rightPriority =
            (right.lastDeliveryStatus === "failed" ? 3 : 0)
            + ((right.requiresReply || (right.unreadCount ?? 0) > 0) ? 2 : 0)
            + (right.serviceMode === "customer_service" ? 1 : 0);
          if (rightPriority !== leftPriority) {
            return rightPriority - leftPriority;
          }
          return getChannelSessionActivityTime(right) - getChannelSessionActivityTime(left);
        }),
    [channelBoardSessions, liveClock],
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
  const pendingRepliesCount = channelBoardSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const unhealthyCount = PLATFORM_DEFINITIONS.filter(def => {
    const status = platformConfigs[def.id]?.status ?? "idle";
    return status !== "idle" && !isPlatformOperationalStatus(status) && status !== "configured";
  }).length;

  useEffect(() => {
    if (!channelActionResult?.sessionId) return;
    setSendingReplyKey(current => (current === channelActionResult.sessionId ? null : current));
    const timer = window.setTimeout(() => {
      setChannelActionResult(null);
    }, channelActionResult.ok ? 1800 : 4200);
    return () => window.clearTimeout(timer);
  }, [channelActionResult, setChannelActionResult]);

  const sendChannelReply = (session: BusinessChannelSession, options: { text: string; retry?: boolean }) => {
    const text = options.text.trim();
    if (!text || !canDirectReplySession(session)) return;

    setSendingReplyKey(session.id);
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
      retry: Boolean(options.retry),
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

  const handoffChannelSessionToChat = (session: BusinessChannelSession) => {
    const linkedRun = session.lastExecutionRunId
      ? executionRuns.find(run => run.id === session.lastExecutionRunId) ?? null
      : null;

    setActiveChatSession(activeSessionId);
    setCommandDraft(
      linkedRun
        ? `继续接管这条渠道会话，并先处理失败或待人工节点：\n${linkedRun.instruction}`
        : `继续接管这条渠道会话，并先回复用户当前问题：\n会话标题：${session.title}\n会话摘要：${session.summary}\n最近消息：${session.lastMessagePreview ?? "无"}`,
    );
    setTab("tasks");
  };

  const diagnosisSummary = useMemo(() => {
    if (wsStatus !== "connected") {
      return pickLocaleText(locale, {
        "zh-CN": "实时链路未连通，先恢复 WebSocket，否则状态和动作回执都不会及时回流。",
        "zh-TW": "即時鏈路未連通，先恢復 WebSocket，否則狀態與動作回執都不會及時回流。",
        en: "The realtime link is down. Restore WebSocket first or state and action receipts will not flow back in time.",
        ja: "リアルタイム接続が切れています。まず WebSocket を復旧しないと、状態や操作結果が戻りません。",
      });
    }
    if (enabledCount === 0) {
      return pickLocaleText(locale, {
        "zh-CN": "当前没有启用中的渠道，先补齐平台字段并开启至少一个连接器。",
        "zh-TW": "目前沒有啟用中的渠道，先補齊平台欄位並開啟至少一個連接器。",
        en: "No channel is enabled yet. Complete the platform fields and enable at least one connector first.",
        ja: "有効なチャネルがまだありません。まず設定項目を埋めて、少なくとも 1 つのコネクタを有効にしてください。",
      });
    }
    if (connectedCount === 0) {
      return pickLocaleText(locale, {
        "zh-CN": "连接器已启用但还没进入可用状态，优先检查必填字段、Webhook 地址和服务端握手。",
        "zh-TW": "連接器已啟用但還沒進入可用狀態，優先檢查必填欄位、Webhook 位址與服務端握手。",
        en: "Connectors are enabled but not yet operational. Check required fields, webhook URLs, and server handshakes first.",
        ja: "コネクタは有効ですが、まだ利用可能状態に入っていません。必須項目、Webhook URL、サーバーハンドシェイクを確認してください。",
      });
    }
    if (latestConnectorFailure) {
      return pickLocaleText(locale, {
        "zh-CN": `最近失败来自 ${latestConnectorFailure.session.title}，先处理这条链路再继续扩展。`,
        "zh-TW": `最近失敗來自 ${latestConnectorFailure.session.title}，先處理這條鏈路再繼續擴展。`,
        en: `The latest failure came from ${latestConnectorFailure.session.title}. Stabilize this route first before expanding further.`,
        ja: `直近の失敗は ${latestConnectorFailure.session.title} です。まずこのルートを安定させてから広げてください。`,
      });
    }
    return pickLocaleText(locale, {
      "zh-CN": "当前没有明显的连接器级故障，下一步优先用真实会话验证入站、回复和已处理闭环。",
      "zh-TW": "目前沒有明顯的連接器級故障，下一步優先用真實會話驗證入站、回覆與已處理閉環。",
      en: "There is no obvious connector-level fault right now. Next, validate inbound, reply, and handled flows with real sessions.",
      ja: "現時点で明確な接続障害はありません。次は実際の会話で受信、返信、処理済みまでの流れを確認してください。",
    });
  }, [connectedCount, enabledCount, latestConnectorFailure, locale, wsStatus]);

  const compactActivities = useMemo(
    () =>
      [
        ...recentConnectorEvents.map(({ log, session }) => ({
          id: `connector-${log.id}`,
          kind: "connector" as const,
          title: session.title,
          detail: log.detail,
          status: log.status,
          timestamp: log.createdAt,
          meta: `${getEventTypeLabel(log.eventType, locale)} · ${session.channel}`,
          executionRunId: log.executionRunId ?? null,
          taskId: null as string | null,
        })),
        ...recentChannelEvents.map(({ log, task, fallbackExecutionRunId }) => ({
          id: `channel-${log.id}`,
          kind: "workflow" as const,
          title: task.title,
          detail: log.detail,
          status: log.status,
          timestamp: log.createdAt,
          meta: `${getEventTypeLabel(log.eventType, locale)} · ${task.channel}`,
          executionRunId: fallbackExecutionRunId ?? null,
          taskId: task.id,
        })),
      ]
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 4),
    [locale, recentChannelEvents, recentConnectorEvents],
  );

  const getSessionAudienceLabel = (session: BusinessChannelSession) =>
    session.serviceMode === "owner"
      ? pickLocaleText(locale, { "zh-CN": "我的会话", "zh-TW": "我的會話", en: "My conversation", ja: "自分の会話" })
      : pickLocaleText(locale, { "zh-CN": "客服会话", "zh-TW": "客服會話", en: "Support session", ja: "サポート会話" });

  return (
    <div className="channels-center">
      <section className="channels-center__hero">
        <div className="channels-center__hero-main">
          <div className="channels-center__eyebrow">{text.titleEyebrow}</div>
          <h2 className="channels-center__title">{text.title}</h2>
          <p className="channels-center__subtitle">
            {pickLocaleText(locale, {
              "zh-CN": "把关键会话、渠道状态与最近动态压缩在一个窗口里，值守时不再来回滚动查找。",
              "zh-TW": "把關鍵會話、渠道狀態與最近動態壓縮在同一個視窗裡，值守時不必來回捲動查找。",
              en: "Keep key sessions, channel health, and recent activity in one compact window.",
              ja: "重要な会話、チャネル状態、最近の動きを 1 画面に収めます。",
            })}
          </p>
        </div>

        <div className="channels-center__hero-aside">
          <div className="channels-center__project">
            <span>{text.currentProject}</span>
            <strong>{activeSession ? getSessionProjectLabel(activeSession) : text.generalProject}</strong>
          </div>
          <div className="channels-center__hero-actions">
            <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
              {text.remotePanel}
            </button>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
              {text.detailedSettings}
            </button>
          </div>
        </div>

        <div className="channels-center__metrics">
          <ChannelMetric label={text.metrics.channels} value={PLATFORM_DEFINITIONS.length} accent="var(--accent)" />
          <ChannelMetric label={text.metrics.enabled} value={enabledCount} accent="var(--accent)" />
          <ChannelMetric label={text.metrics.connected} value={connectedCount} accent="var(--success)" />
          <ChannelMetric label={text.metrics.pendingReplies} value={pendingRepliesCount} accent="var(--warning)" />
          <ChannelMetric label={text.metrics.attention} value={unhealthyCount} accent="var(--danger)" />
          <ChannelMetric label={text.metrics.webhookBased} value={webhookCount} accent="var(--text)" />
        </div>
      </section>

      {channelActionResult ? (
        <div className={`channels-center__result ${channelActionResult.ok ? "is-success" : "is-error"}`}>
          <div>
            <div className="channels-center__result-title">
              {channelActionResult.ok
                ? pickLocaleText(locale, { "zh-CN": "渠道动作已完成", "zh-TW": "渠道動作已完成", en: "Channel action completed", ja: "チャネル操作が完了しました" })
                : pickLocaleText(locale, { "zh-CN": "渠道动作失败", "zh-TW": "渠道動作失敗", en: "Channel action failed", ja: "チャネル操作が失敗しました" })}
            </div>
            <div className="channels-center__result-copy">
              {channelActionResult.message}
              {channelActionResult.failureReason ? ` · ${channelActionResult.failureReason}` : ""}
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setChannelActionResult(null)}>
            {pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })}
          </button>
        </div>
      ) : null}

      <section className="channels-center__body">
        <article className="channels-center__panel">
          <div className="channels-center__panel-head">
            <div>
              <div className="channels-center__panel-kicker">{text.liveSessions}</div>
              <h3 className="channels-center__panel-title">
                {pickLocaleText(locale, { "zh-CN": "优先处理这几条对话", "zh-TW": "優先處理這幾條對話", en: "Handle these first", ja: "優先して処理" })}
              </h3>
            </div>
            <span className="channels-center__panel-note">
              {pickLocaleText(locale, { "zh-CN": "15 分钟窗口", "zh-TW": "15 分鐘視窗", en: "15 min window", ja: "15分ウィンドウ" })}
            </span>
          </div>

          <div className="channels-center__list">
            {realtimeSessions.length === 0 ? (
              <div className="channels-center__empty">
                {pickLocaleText(locale, {
                  "zh-CN": "最近 15 分钟内没有活跃中的渠道会话。",
                  "zh-TW": "最近 15 分鐘內沒有活躍中的渠道會話。",
                  en: "No channel sessions were active in the last 15 minutes.",
                  ja: "直近15分に動きのあるチャネル会話はありません。",
                })}
              </div>
            ) : (
              realtimeSessions.map(session => {
                const stateLabel = getChannelSessionStateLabel(session, locale);
                const recentAction = getChannelSessionRecentAction(session, locale);
                const nextAction = getChannelSessionNextAction(session, locale);
                const needsDesktopTakeover = shouldSuggestDesktopTakeover(session);
                const retryable =
                  canDirectReplySession(session)
                  && session.lastDeliveryStatus === "failed"
                  && session.lastMessageDirection === "outbound"
                  && Boolean(session.lastMessagePreview);

                return (
                  <article key={session.id} className="channels-center__session-card">
                    <div className="channels-center__card-head">
                      <div className="channels-center__card-title-wrap">
                        <div className="channels-center__card-title">{session.title}</div>
                        <div className="channels-center__meta">
                          <span>{session.channel}</span>
                          <span>{getSessionAudienceLabel(session)}</span>
                          <span>{session.accountLabel ?? pickLocaleText(locale, { "zh-CN": "默认账号", "zh-TW": "預設帳號", en: "Default", ja: "既定" })}</span>
                          <span>{formatEventTime(getChannelSessionActivityTime(session), locale)}</span>
                        </div>
                      </div>
                      <span style={eventBadgeStyle(session.lastDeliveryStatus === "failed" ? "failed" : stateLabel === "已处理" ? "completed" : "pending")}>
                        {stateLabel}
                      </span>
                    </div>

                    <div className="channels-center__preview">{session.lastMessagePreview ?? session.summary}</div>

                    <div className="channels-center__meta">
                      <span>{pickLocaleText(locale, { "zh-CN": "未读", "zh-TW": "未讀", en: "Unread", ja: "未読" })} {session.unreadCount ?? 0}</span>
                      <span>{pickLocaleText(locale, { "zh-CN": "最近动作", "zh-TW": "最近動作", en: "Action", ja: "操作" })} {recentAction}</span>
                      <span>{pickLocaleText(locale, { "zh-CN": "下一步", "zh-TW": "下一步", en: "Next", ja: "次" })} {nextAction}</span>
                      {needsDesktopTakeover ? <span>{pickLocaleText(locale, { "zh-CN": "建议桌面接管", "zh-TW": "建議桌面接管", en: "Desktop suggested", ja: "デスクトップ推奨" })}</span> : null}
                    </div>

                    {session.lastDeliveryError ? (
                      <div className="channels-center__error">
                        {pickLocaleText(locale, { "zh-CN": "最近错误", "zh-TW": "最近錯誤", en: "Latest error", ja: "直近エラー" })}: {session.lastDeliveryError}
                      </div>
                    ) : null}

                    <div className="channels-center__actions">
                      <button type="button" className="btn-handoff" onClick={() => handoffChannelSessionToChat(session)}>
                        {pickLocaleText(locale, { "zh-CN": "聊天接管", "zh-TW": "聊天接管", en: "Take over", ja: "引き継ぐ" })}
                      </button>
                      {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                        <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                          {pickLocaleText(locale, { "zh-CN": "标记已处理", "zh-TW": "標記已處理", en: "Handled", ja: "処理済み" })}
                        </button>
                      ) : null}
                      {retryable ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session, { text: session.lastMessagePreview!, retry: true })}
                          disabled={sendingReplyKey === session.id}
                        >
                          {sendingReplyKey === session.id
                            ? pickLocaleText(locale, { "zh-CN": "重试中...", "zh-TW": "重試中...", en: "Retrying...", ja: "再試行中..." })
                            : pickLocaleText(locale, { "zh-CN": "重试最近发送", "zh-TW": "重試最近發送", en: "Retry last send", ja: "直近送信を再試行" })}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>

        <article className="channels-center__panel">
          <div className="channels-center__panel-head">
            <div>
              <div className="channels-center__panel-kicker">{text.channelBoard}</div>
              <h3 className="channels-center__panel-title">
                {pickLocaleText(locale, { "zh-CN": "所有渠道会话保留在这里", "zh-TW": "所有渠道會話保留在這裡", en: "All channel sessions stay here", ja: "すべての会話をここに保持" })}
              </h3>
            </div>
            <span className="channels-center__panel-note">
              {pickLocaleText(locale, {
                "zh-CN": `${channelBoardSessions.length} 条会话`,
                "zh-TW": `${channelBoardSessions.length} 條會話`,
                en: `${channelBoardSessions.length} sessions`,
                ja: `${channelBoardSessions.length} 件`,
              })}
            </span>
          </div>

          <div className="channels-center__list">
            {channelBoardSessions.length === 0 ? (
              <div className="channels-center__empty">
                {pickLocaleText(locale, {
                  "zh-CN": "当前还没有保留下来的渠道会话记录。",
                  "zh-TW": "目前還沒有保留下來的渠道會話紀錄。",
                  en: "No channel sessions have been retained yet.",
                  ja: "保持されているチャネル会話はまだありません。",
                })}
              </div>
            ) : (
              channelBoardSessions.map(session => {
                const stateLabel = getChannelSessionStateLabel(session, locale);
                const recentAction = getChannelSessionRecentAction(session, locale);
                const nextAction = getChannelSessionNextAction(session, locale);
                const needsDesktopTakeover = shouldSuggestDesktopTakeover(session);
                const retryable =
                  canDirectReplySession(session)
                  && session.lastDeliveryStatus === "failed"
                  && session.lastMessageDirection === "outbound"
                  && Boolean(session.lastMessagePreview);

                return (
                  <article key={session.id} className="channels-center__session-card">
                    <div className="channels-center__card-head">
                      <div className="channels-center__card-title-wrap">
                        <div className="channels-center__card-title">{session.title}</div>
                        <div className="channels-center__meta">
                          <span>{session.channel}</span>
                          <span>{getSessionAudienceLabel(session)}</span>
                          <span>{session.accountLabel ?? pickLocaleText(locale, { "zh-CN": "默认账号", "zh-TW": "預設帳號", en: "Default", ja: "既定" })}</span>
                          <span>{formatEventTime(session.lastMessageAt, locale)}</span>
                        </div>
                      </div>
                      <span style={eventBadgeStyle(session.lastDeliveryStatus === "failed" ? "failed" : stateLabel === "已处理" ? "completed" : "pending")}>
                        {stateLabel}
                      </span>
                    </div>

                    <div className="channels-center__preview">{session.lastMessagePreview ?? session.summary}</div>

                    <div className="channels-center__meta">
                      <span>{pickLocaleText(locale, { "zh-CN": "未读", "zh-TW": "未讀", en: "Unread", ja: "未読" })} {session.unreadCount ?? 0}</span>
                      <span>{pickLocaleText(locale, { "zh-CN": "最近动作", "zh-TW": "最近動作", en: "Action", ja: "操作" })} {recentAction}</span>
                      <span>{pickLocaleText(locale, { "zh-CN": "下一步", "zh-TW": "下一步", en: "Next", ja: "次" })} {nextAction}</span>
                      {needsDesktopTakeover ? <span>{pickLocaleText(locale, { "zh-CN": "建议桌面接管", "zh-TW": "建議桌面接管", en: "Desktop suggested", ja: "デスクトップ推奨" })}</span> : null}
                    </div>

                    {session.lastDeliveryError ? (
                      <div className="channels-center__error">
                        {pickLocaleText(locale, { "zh-CN": "最近错误", "zh-TW": "最近錯誤", en: "Latest error", ja: "直近エラー" })}: {session.lastDeliveryError}
                      </div>
                    ) : null}

                    <div className="channels-center__actions">
                      <button type="button" className="btn-handoff" onClick={() => handoffChannelSessionToChat(session)}>
                        {pickLocaleText(locale, { "zh-CN": "聊天接管", "zh-TW": "聊天接管", en: "Take over", ja: "引き継ぐ" })}
                      </button>
                      {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                        <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                          {pickLocaleText(locale, { "zh-CN": "标记已处理", "zh-TW": "標記已處理", en: "Handled", ja: "処理済み" })}
                        </button>
                      ) : null}
                      {retryable ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session, { text: session.lastMessagePreview!, retry: true })}
                          disabled={sendingReplyKey === session.id}
                        >
                          {sendingReplyKey === session.id
                            ? pickLocaleText(locale, { "zh-CN": "重试中...", "zh-TW": "重試中...", en: "Retrying...", ja: "再試行中..." })
                            : pickLocaleText(locale, { "zh-CN": "重试最近发送", "zh-TW": "重試最近發送", en: "Retry last send", ja: "直近送信を再試行" })}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>

        <article className="channels-center__panel">
          <div className="channels-center__panel-head">
            <div>
              <div className="channels-center__panel-kicker">{text.quickDiagnosis}</div>
              <h3 className="channels-center__panel-title">
                {pickLocaleText(locale, { "zh-CN": "先看诊断，再看最近变化", "zh-TW": "先看診斷，再看最近變化", en: "Diagnosis first", ja: "診断を先に" })}
              </h3>
            </div>
            <span className="channels-center__panel-note">Top 4</span>
          </div>

          <div className="channels-center__diagnosis">
            <div className="channels-center__platform-note">{diagnosisSummary}</div>
            <div className="channels-center__diagnosis-grid">
              <div className="channels-center__diagnosis-item"><span>{pickLocaleText(locale, { "zh-CN": "实时链路", "zh-TW": "即時鏈路", en: "Realtime", ja: "リアルタイム" })}</span><strong>{wsStatus}</strong></div>
              <div className="channels-center__diagnosis-item"><span>{pickLocaleText(locale, { "zh-CN": "待回复", "zh-TW": "待回覆", en: "Pending", ja: "返信待ち" })}</span><strong>{pendingRepliesCount}</strong></div>
              <div className="channels-center__diagnosis-item"><span>{pickLocaleText(locale, { "zh-CN": "Webhook 待完善", "zh-TW": "Webhook 待完善", en: "Webhook pending", ja: "Webhook 待対応" })}</span><strong>{webhookPendingCount}</strong></div>
              <div className="channels-center__diagnosis-item"><span>{pickLocaleText(locale, { "zh-CN": "异常渠道", "zh-TW": "異常渠道", en: "Unhealthy", ja: "不安定" })}</span><strong>{unhealthyCount}</strong></div>
            </div>
          </div>

          <div className="channels-center__list">
            {compactActivities.length === 0 ? (
              <div className="channels-center__empty">
                {pickLocaleText(locale, {
                  "zh-CN": "当前项目还没有足够的渠道动态可供展示。",
                  "zh-TW": "目前專案還沒有足夠的渠道動態可供展示。",
                  en: "Not enough channel activity to show yet.",
                  ja: "表示できるチャネル動作がまだ十分にありません。",
                })}
              </div>
            ) : (
              compactActivities.map(activity => (
                <article key={activity.id} className="channels-center__activity-card">
                  <div className="channels-center__card-head">
                    <div className="channels-center__card-title-wrap">
                      <div className="channels-center__card-title">{activity.title}</div>
                      <div className="channels-center__meta">
                        <span>{activity.meta}</span>
                        <span>{formatEventTime(activity.timestamp, locale)}</span>
                      </div>
                    </div>
                    <span style={eventBadgeStyle(activity.status)}>{formatOperationStatusLabel(activity.status, locale)}</span>
                  </div>

                  <div className="channels-center__preview">{activity.detail}</div>

                  <div className="channels-center__actions">
                    {activity.executionRunId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setActiveExecutionRun(activity.executionRunId!);
                          openControlSection("execution");
                        }}
                      >
                        {pickLocaleText(locale, { "zh-CN": "查看执行", "zh-TW": "查看執行", en: "View run", ja: "実行を見る" })}
                      </button>
                    ) : activity.taskId ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          focusBusinessContentTask(activity.taskId!);
                          openControlSection("entities");
                        }}
                      >
                        {pickLocaleText(locale, { "zh-CN": "定位实体", "zh-TW": "定位實體", en: "Locate entity", ja: "実体へ移動" })}
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                        {pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "前往遠端值守", en: "Open remote", ja: "遠隔監督へ" })}
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function ChannelMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="channels-center__metric">
      <div className="channels-center__metric-label">{label}</div>
      <div className="channels-center__metric-value" style={{ color: accent }}>{value}</div>
    </div>
  );
}
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

function getEventTypeLabel(eventType: BusinessOperationRecord["eventType"], locale: UiLocale = "zh-CN") {
  if (eventType === "connector") return pickLocaleText(locale, { "zh-CN": "连接器健康", "zh-TW": "連接器健康", en: "Connector Health", ja: "接続ヘルス" });
  if (eventType === "message") return pickLocaleText(locale, { "zh-CN": "消息事件", "zh-TW": "消息事件", en: "Message Event", ja: "メッセージイベント" });
  if (eventType === "publish") return pickLocaleText(locale, { "zh-CN": "发布回写", "zh-TW": "發布回寫", en: "Publish Callback", ja: "公開結果" });
  if (eventType === "governance") return pickLocaleText(locale, { "zh-CN": "渠道治理", "zh-TW": "渠道治理", en: "Channel Governance", ja: "チャネルガバナンス" });
  if (eventType === "desktop") return pickLocaleText(locale, { "zh-CN": "桌面动作", "zh-TW": "桌面動作", en: "Desktop Action", ja: "デスクトップ操作" });
  if (eventType === "dispatch") return pickLocaleText(locale, { "zh-CN": "派发准备", "zh-TW": "派發準備", en: "Dispatch Prep", ja: "配信準備" });
  if (eventType === "workflow") return pickLocaleText(locale, { "zh-CN": "工作流", "zh-TW": "工作流", en: "Workflow", ja: "ワークフロー" });
  return pickLocaleText(locale, { "zh-CN": "业务事件", "zh-TW": "業務事件", en: "Business Event", ja: "業務イベント" });
}

function formatEventTime(timestamp: number, locale: UiLocale = "zh-CN") {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatOperationStatusLabel(status: BusinessOperationRecord["status"], locale: UiLocale = "zh-CN") {
  switch (status) {
    case "pending":
      return pickLocaleText(locale, { "zh-CN": "待处理", "zh-TW": "待處理", en: "Pending", ja: "保留中" });
    case "approved":
      return pickLocaleText(locale, { "zh-CN": "已批准", "zh-TW": "已批准", en: "Approved", ja: "承認済み" });
    case "rejected":
      return pickLocaleText(locale, { "zh-CN": "已驳回", "zh-TW": "已駁回", en: "Rejected", ja: "却下済み" });
    case "sent":
      return pickLocaleText(locale, { "zh-CN": "已发送", "zh-TW": "已發送", en: "Sent", ja: "送信済み" });
    case "blocked":
      return pickLocaleText(locale, { "zh-CN": "已阻塞", "zh-TW": "已阻塞", en: "Blocked", ja: "ブロック中" });
    case "completed":
      return pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" });
    case "failed":
      return pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" });
    default:
      return status;
  }
}


