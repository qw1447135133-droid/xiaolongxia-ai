"use client";

import { useEffect, useMemo, useState } from "react";
import { sendWs } from "@/hooks/useWebSocket";
import { pickLocaleText } from "@/lib/ui-locale";
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
import type { ControlCenterSectionId, UiLocale } from "@/store/types";
import type {
  BusinessChannelSession,
  BusinessContentPublishResult,
  BusinessContentTask,
  BusinessOperationRecord,
} from "@/types/business-entities";

export function ChannelsCenter() {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyKey, setSendingReplyKey] = useState<string | null>(null);
  const locale = useStore(s => s.locale);
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
  const launchContentTaskNextCycle = useStore(s => s.launchContentTaskNextCycle);
  const applyContentChannelGovernance = useStore(s => s.applyContentChannelGovernance);
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
          {text.titleEyebrow}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          {text.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          {text.subtitle}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
          {text.currentProject}: {activeSession ? getSessionProjectLabel(activeSession) : text.generalProject}
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
            {text.remotePanel}
          </button>
          <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
            {text.detailedSettings}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <ChannelMetric label={text.metrics.channels} value={PLATFORM_DEFINITIONS.length} accent="var(--accent)" />
        <ChannelMetric label={text.metrics.enabled} value={enabledCount} accent="#60a5fa" />
        <ChannelMetric label={text.metrics.connected} value={connectedCount} accent="var(--success)" />
        <ChannelMetric label={text.metrics.pendingReplies} value={pendingRepliesCount} accent="#f59e0b" />
        <ChannelMetric label={text.metrics.attention} value={unhealthyCount} accent="#fb7185" />
        <ChannelMetric label={text.metrics.webhookBased} value={webhookCount} accent="var(--warning)" />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.quickDiagnosis}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          不需要真实凭证也能先判断更可能卡在配置、实时链路还是平台回执。
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
            {wsStatus !== "connected"
              ? pickLocaleText(locale, {
                  "zh-CN": "如果 WebSocket 是 disconnected，先修实时链路，否则平台状态和动作回执都不会及时回流。",
                  "zh-TW": "如果 WebSocket 是 disconnected，先修復即時鏈路，否則平台狀態與動作回執都不會及時回流。",
                  en: "If WebSocket is disconnected, restore the realtime link first. Otherwise platform states and action receipts will not flow back in time.",
                  ja: "WebSocket が disconnected の場合は、先にリアルタイム接続を直してください。そうしないと状態や実行結果が戻ってきません。",
                })
              : enabledCount === 0
                ? pickLocaleText(locale, {
                    "zh-CN": "如果一个连接器都没启用，先去详细平台设置保存并同步凭证。",
                    "zh-TW": "如果一個連接器都沒啟用，先到詳細平台設定儲存並同步憑證。",
                    en: "If no connector is enabled yet, go to detailed platform settings and save or sync credentials first.",
                    ja: "有効なコネクタがまだない場合は、まず詳細設定で認証情報を保存・同期してください。",
                  })
                : connectedCount === 0
                  ? pickLocaleText(locale, {
                      "zh-CN": "连接器已启用但没有进入 connected/degraded，优先检查必填字段、Webhook 地址和服务端握手。",
                      "zh-TW": "連接器已啟用但沒有進入 connected/degraded，優先檢查必填欄位、Webhook 位址與服務端握手。",
                      en: "Connectors are enabled but not in connected/degraded. Check required fields, webhook URLs, and server handshakes first.",
                      ja: "コネクタは有効ですが connected/degraded に入っていません。必須項目、Webhook URL、サーバーハンドシェイクを先に確認してください。",
                    })
                  : latestConnectorFailure
                    ? pickLocaleText(locale, {
                        "zh-CN": `最近失败来自 ${latestConnectorFailure.session.title}：${latestConnectorFailure.log.detail}`,
                        "zh-TW": `最近失敗來自 ${latestConnectorFailure.session.title}：${latestConnectorFailure.log.detail}`,
                        en: `Latest failure came from ${latestConnectorFailure.session.title}: ${latestConnectorFailure.log.detail}`,
                        ja: `直近の失敗は ${latestConnectorFailure.session.title} です: ${latestConnectorFailure.log.detail}`,
                      })
                    : pickLocaleText(locale, {
                        "zh-CN": "当前没有明显的连接器级失败，下一步优先用真实会话验证入站和回复。",
                        "zh-TW": "目前沒有明顯的連接器級失敗，下一步優先用真實會話驗證入站與回覆。",
                        en: "There is no obvious connector-level failure right now. Next, validate inbound and reply flows with a real session.",
                        ja: "現時点で明確な接続障害はありません。次は実際の会話で受信と返信フローを確認してください。",
                      })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
              {pickLocaleText(locale, { "zh-CN": "去平台设置排查", "zh-TW": "前往平台設定排查", en: "Inspect Platform Settings", ja: "設定を確認" })}
            </button>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("overview")}>
              {pickLocaleText(locale, { "zh-CN": "去总览", "zh-TW": "前往總覽", en: "Open Overview", ja: "概要へ" })}
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
                {channelActionResult.ok
                  ? pickLocaleText(locale, { "zh-CN": "渠道动作已完成", "zh-TW": "渠道動作已完成", en: "Channel Action Completed", ja: "チャネル操作が完了しました" })
                  : pickLocaleText(locale, { "zh-CN": "渠道动作失败", "zh-TW": "渠道動作失敗", en: "Channel Action Failed", ja: "チャネル操作が失敗しました" })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.75 }}>
                {channelActionResult.message}
                {channelActionResult.failureReason ? ` · ${channelActionResult.failureReason}` : ""}
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setChannelActionResult(null)}>
              {pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })}
            </button>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.attentionQueue}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {pickLocaleText(locale, {
            "zh-CN": "这里单独看需要人工处理的会话和平台，不再让它们淹没在普通事件流里。",
            "zh-TW": "這裡單獨查看需要人工處理的會話與平台，不再讓它們淹沒在普通事件流裡。",
            en: "Review sessions and platforms that need human attention here instead of letting them drown in the normal event stream.",
            ja: "ここでは人手対応が必要な会話とプラットフォームだけを見て、通常イベントの中に埋もれないようにします。",
          })}
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {attentionSessions.length === 0 && platformAttentionItems.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {pickLocaleText(locale, {
                "zh-CN": "当前项目没有连接器侧的明显待办。",
                "zh-TW": "目前專案沒有連接器側的明顯待辦。",
                en: "There are no obvious connector-side follow-ups in the current project.",
                ja: "現在のプロジェクトでは、接続側の明確な対応事項はありません。",
              })}
            </div>
          ) : (
            <>
              {attentionSessions.map(session => (
                (() => {
                  const stateLabel = getChannelSessionStateLabel(session, locale);
                  const recentAction = getChannelSessionRecentAction(session, locale);
                  const nextAction = getChannelSessionNextAction(session, locale);
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
                        {session.channel} · {session.accountLabel ?? pickLocaleText(locale, { "zh-CN": "默认账号", "zh-TW": "預設帳號", en: "Default Account", ja: "既定アカウント" })} · {session.participantLabel ?? session.remoteUserId ?? pickLocaleText(locale, { "zh-CN": "未命名会话", "zh-TW": "未命名會話", en: "Untitled Session", ja: "無題セッション" })}
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
                    <span>{pickLocaleText(locale, { "zh-CN": "未读", "zh-TW": "未讀", en: "Unread", ja: "未読" })} {session.unreadCount ?? 0}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "方向", "zh-TW": "方向", en: "Direction", ja: "方向" })} {session.lastMessageDirection ?? "mixed"}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "最近活动", "zh-TW": "最近活動", en: "Recent Activity", ja: "最近の活動" })} {formatEventTime(session.lastMessageAt, locale)}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "最近动作", "zh-TW": "最近動作", en: "Recent Action", ja: "最近の操作" })} {recentAction}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "下一步", "zh-TW": "下一步", en: "Next", ja: "次の対応" })} {nextAction}</span>
                    {session.lastSyncedAt ? <span>{pickLocaleText(locale, { "zh-CN": "同步", "zh-TW": "同步", en: "Synced", ja: "同期" })} {formatEventTime(session.lastSyncedAt, locale)}</span> : null}
                  </div>

                  {session.lastDeliveryError ? (
                    <div style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.7 }}>
                      {pickLocaleText(locale, { "zh-CN": "最近错误", "zh-TW": "最近錯誤", en: "Latest Error", ja: "直近エラー" })}: {session.lastDeliveryError}
                    </div>
                  ) : null}

                  {canDirectReplySession(session) ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <textarea
                        className="input"
                        value={replyDrafts[session.id] ?? ""}
                        onChange={event => setReplyDraft(session.id, event.target.value)}
                        placeholder={pickLocaleText(locale, { "zh-CN": "输入快速回复...", "zh-TW": "輸入快速回覆...", en: "Type a quick reply...", ja: "クイック返信を入力..." })}
                        style={{ minHeight: 82, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session)}
                          disabled={sendingReplyKey === session.id || !(replyDrafts[session.id] ?? "").trim()}
                        >
                          {sendingReplyKey === session.id
                            ? pickLocaleText(locale, { "zh-CN": "发送中...", "zh-TW": "發送中...", en: "Sending...", ja: "送信中..." })
                            : pickLocaleText(locale, { "zh-CN": "发送回复", "zh-TW": "發送回覆", en: "Send Reply", ja: "返信する" })}
                        </button>
                        {session.lastDeliveryStatus === "failed" && session.lastMessageDirection === "outbound" && session.lastMessagePreview ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => sendChannelReply(session, { text: session.lastMessagePreview, retry: true })}
                            disabled={sendingReplyKey === session.id}
                          >
                            {pickLocaleText(locale, { "zh-CN": "重试最近发送", "zh-TW": "重試最近發送", en: "Retry Last Send", ja: "直近送信を再試行" })}
                          </button>
                        ) : null}
                        {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                          <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                            {pickLocaleText(locale, { "zh-CN": "标记已处理", "zh-TW": "標記已處理", en: "Mark Handled", ja: "処理済みにする" })}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      {pickLocaleText(locale, { "zh-CN": "去远程值守接管", "zh-TW": "前往遠端值守接管", en: "Open Remote Takeover", ja: "遠隔引き継ぎへ" })}
                    </button>
                    {needsDesktopTakeover ? (
                      <button type="button" className="btn-ghost" onClick={() => openControlSection("desktop")}>
                        {pickLocaleText(locale, { "zh-CN": "去桌面接管", "zh-TW": "前往桌面接管", en: "Open Desktop Takeover", ja: "デスクトップ引き継ぎへ" })}
                      </button>
                    ) : null}
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      {pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("entities")}>
                      {pickLocaleText(locale, { "zh-CN": "查看会话实体", "zh-TW": "查看會話實體", en: "View Session Entity", ja: "会話実体を見る" })}
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
                      {getPlatformStatusLabel(snapshot.status, locale)}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span>{pickLocaleText(locale, { "zh-CN": "待回复", "zh-TW": "待回覆", en: "Pending Replies", ja: "返信待ち" })} {snapshot.needsReplyCount}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" })} {snapshot.failedSessionCount}</span>
                    <span>{pickLocaleText(locale, { "zh-CN": "会话", "zh-TW": "會話", en: "Sessions", ja: "セッション" })} {snapshot.sessionCount}</span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                      {pickLocaleText(locale, { "zh-CN": "去详细设置", "zh-TW": "前往詳細設定", en: "Open Detailed Settings", ja: "詳細設定へ" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      {pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "前往遠端值守", en: "Open Remote Supervision", ja: "遠隔監督へ" })}
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.liveSessions}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {pickLocaleText(locale, {
            "zh-CN": "这里展示真实渠道会话实体，而不只是内容任务的发布回写。",
            "zh-TW": "這裡展示真實渠道會話實體，而不只是內容任務的發布回寫。",
            en: "This area shows real channel session entities, not only content-task publish callbacks.",
            ja: "ここでは実際のチャネル会話実体を表示し、コンテンツ公開の結果だけにはしません。",
          })}
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {scopedChannelSessions.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {pickLocaleText(locale, {
                "zh-CN": "当前项目还没有同步到真实渠道会话。",
                "zh-TW": "目前專案還沒有同步到真實渠道會話。",
                en: "No real channel sessions have been synced into this project yet.",
                ja: "このプロジェクトにはまだ実際のチャネル会話が同期されていません。",
              })}
            </div>
          ) : (
            scopedChannelSessions.slice(0, 6).map(session => {
              const stateLabel = getChannelSessionStateLabel(session, locale);
              const recentAction = getChannelSessionRecentAction(session, locale);
              const nextAction = getChannelSessionNextAction(session, locale);
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
                      {session.channel} · {session.accountLabel ?? pickLocaleText(locale, { "zh-CN": "默认账号", "zh-TW": "預設帳號", en: "Default Account", ja: "既定アカウント" })} · {session.participantLabel ?? session.remoteUserId ?? pickLocaleText(locale, { "zh-CN": "未命名会话", "zh-TW": "未命名會話", en: "Untitled Session", ja: "無題セッション" })}
                    </div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span style={eventBadgeStyle(session.lastDeliveryStatus === "failed" ? "failed" : stateLabel === "已处理" ? "completed" : "pending")}>
                      {stateLabel}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(session.lastMessageAt, locale)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>{pickLocaleText(locale, { "zh-CN": "状态", "zh-TW": "狀態", en: "Status", ja: "状態" })} {session.status}</span>
                  <span>{pickLocaleText(locale, { "zh-CN": "方向", "zh-TW": "方向", en: "Direction", ja: "方向" })} {session.lastMessageDirection ?? "mixed"}</span>
                  <span>{pickLocaleText(locale, { "zh-CN": "未读", "zh-TW": "未讀", en: "Unread", ja: "未読" })} {session.unreadCount ?? 0}</span>
                  <span>{pickLocaleText(locale, { "zh-CN": "投递", "zh-TW": "投遞", en: "Delivery", ja: "配信" })} {session.lastDeliveryStatus ?? "pending"}</span>
                  <span>{pickLocaleText(locale, { "zh-CN": "最近动作", "zh-TW": "最近動作", en: "Recent Action", ja: "最近の操作" })} {recentAction}</span>
                  <span>{pickLocaleText(locale, { "zh-CN": "下一步", "zh-TW": "下一步", en: "Next", ja: "次の対応" })} {nextAction}</span>
                  {session.lastHandledAt ? <span>{pickLocaleText(locale, { "zh-CN": "处理", "zh-TW": "處理", en: "Handled", ja: "処理" })} {formatEventTime(session.lastHandledAt, locale)}</span> : null}
                  {session.lastSyncedAt ? <span>{pickLocaleText(locale, { "zh-CN": "同步", "zh-TW": "同步", en: "Synced", ja: "同期" })} {formatEventTime(session.lastSyncedAt, locale)}</span> : null}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                  {session.lastMessagePreview ?? session.summary}
                </div>

                {session.lastDeliveryError ? (
                  <div style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "最近错误", "zh-TW": "最近錯誤", en: "Latest Error", ja: "直近エラー" })}: {session.lastDeliveryError}
                  </div>
                ) : null}

                {canDirectReplySession(session) ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <textarea
                      className="input"
                      value={replyDrafts[session.id] ?? ""}
                      onChange={event => setReplyDraft(session.id, event.target.value)}
                      placeholder={pickLocaleText(locale, { "zh-CN": "输入快速回复...", "zh-TW": "輸入快速回覆...", en: "Type a quick reply...", ja: "クイック返信を入力..." })}
                      style={{ minHeight: 82, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => sendChannelReply(session)}
                        disabled={sendingReplyKey === session.id || !(replyDrafts[session.id] ?? "").trim()}
                      >
                        {sendingReplyKey === session.id
                          ? pickLocaleText(locale, { "zh-CN": "发送中...", "zh-TW": "發送中...", en: "Sending...", ja: "送信中..." })
                          : pickLocaleText(locale, { "zh-CN": "发送回复", "zh-TW": "發送回覆", en: "Send Reply", ja: "返信する" })}
                      </button>
                      {session.lastDeliveryStatus === "failed" && session.lastMessageDirection === "outbound" && session.lastMessagePreview ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => sendChannelReply(session, { text: session.lastMessagePreview, retry: true })}
                          disabled={sendingReplyKey === session.id}
                        >
                          {pickLocaleText(locale, { "zh-CN": "重试最近发送", "zh-TW": "重試最近發送", en: "Retry Last Send", ja: "直近送信を再試行" })}
                        </button>
                      ) : null}
                      {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                        <button type="button" className="btn-ghost" onClick={() => markSessionHandled(session)}>
                          {pickLocaleText(locale, { "zh-CN": "标记已处理", "zh-TW": "標記已處理", en: "Mark Handled", ja: "処理済みにする" })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("entities")}>
                    {pickLocaleText(locale, { "zh-CN": "打开会话实体", "zh-TW": "打開會話實體", en: "Open Session Entity", ja: "会話実体を開く" })}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                    {pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "前往遠端值守", en: "Open Remote Supervision", ja: "遠隔監督へ" })}
                  </button>
                  {needsDesktopTakeover ? (
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("desktop")}>
                      {pickLocaleText(locale, { "zh-CN": "去桌面接管", "zh-TW": "前往桌面接管", en: "Open Desktop Takeover", ja: "デスクトップ引き継ぎへ" })}
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                    {pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })}
                  </button>
                </div>
              </article>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.recentConnectorEvents}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {pickLocaleText(locale, {
            "zh-CN": "连接器和消息事件现在单独可见，不再混在内容发布日志里。",
            "zh-TW": "連接器與消息事件現在可單獨查看，不再混在內容發布日誌中。",
            en: "Connector and message events are now visible on their own instead of being mixed into publish logs.",
            ja: "接続イベントとメッセージイベントは、公開ログとは分けて確認できます。",
          })}
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {recentConnectorEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {pickLocaleText(locale, {
                "zh-CN": "当前项目还没有连接器级事件。",
                "zh-TW": "目前專案還沒有連接器級事件。",
                en: "There are no connector-level events in the current project yet.",
                ja: "現在のプロジェクトには、まだ接続レベルのイベントがありません。",
              })}
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
                        {getEventTypeLabel(log.eventType, locale)} · {session.channel} · {session.accountLabel ?? pickLocaleText(locale, { "zh-CN": "默认账号", "zh-TW": "預設帳號", en: "Default Account", ja: "既定アカウント" })}
                    </div>
                  </div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span style={eventBadgeStyle(log.status)}>{formatOperationStatusLabel(log.status, locale)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(log.createdAt, locale)}</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                  {log.detail}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {log.failureReason ? (
                    <span style={inlineTagStyle}>{pickLocaleText(locale, { "zh-CN": "原因", "zh-TW": "原因", en: "Reason", ja: "理由" })} {log.failureReason}</span>
                  ) : null}
                  {session.lastExternalMessageId ? (
                    <span style={inlineTagStyle}>{pickLocaleText(locale, { "zh-CN": "消息", "zh-TW": "消息", en: "Message", ja: "メッセージ" })} {session.lastExternalMessageId}</span>
                  ) : null}
                  {session.externalRef ? (
                    <span style={inlineTagStyle}>{pickLocaleText(locale, { "zh-CN": "会话", "zh-TW": "會話", en: "Session", ja: "セッション" })} {session.externalRef}</span>
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
                      {pickLocaleText(locale, { "zh-CN": "查看对应执行", "zh-TW": "查看對應執行", en: "View Related Run", ja: "関連実行を見る" })}
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                    {pickLocaleText(locale, { "zh-CN": "打开远程值守", "zh-TW": "打開遠端值守", en: "Open Remote Supervision", ja: "遠隔監督を開く" })}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                    {pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.recentChannelEvents}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {pickLocaleText(locale, {
            "zh-CN": "这里直接复用内容任务的发布、派发和治理日志，把渠道异常变成可回跳的入口。",
            "zh-TW": "這裡直接復用內容任務的發布、派發與治理日誌，讓渠道異常能回跳處理。",
            en: "This section reuses publish, dispatch, and governance logs from content tasks so channel issues become jump-back entry points.",
            ja: "ここではコンテンツタスクの公開・派信・ガバナンスログを流用し、チャネル異常をすぐ戻れる入口にしています。",
          })}
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {recentChannelEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {pickLocaleText(locale, {
                "zh-CN": "当前项目还没有可用于渠道回跳的业务事件。",
                "zh-TW": "目前專案還沒有可用於渠道回跳的業務事件。",
                en: "There are no business events available for channel jump-back in the current project yet.",
                ja: "現在のプロジェクトには、チャネルから戻るための業務イベントがまだありません。",
              })}
            </div>
          ) : (
            recentChannelEvents.map(({ log, task, latestPublishResult, fallbackExecutionRunId }) => {
              const highlights = buildChannelEventHighlights(task, log, latestPublishResult, locale);
              const contextLine = buildChannelEventContext(task, log, latestPublishResult, locale);

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
                    <span style={eventBadgeStyle(log.status)}>{formatOperationStatusLabel(log.status, locale)}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatEventTime(log.createdAt, locale)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    <span>{pickLocaleText(locale, { "zh-CN": "事件", "zh-TW": "事件", en: "Event", ja: "イベント" })} {getEventTypeLabel(log.eventType, locale)}</span>
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
                            border: "1px solid var(--border)",
                            background: "rgba(247,249,253,0.96)",
                            color: "var(--text)",
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
                          launchContentTaskNextCycle({
                            contentTaskId: task.id,
                            recommendation: task.nextCycleRecommendation ?? "retry",
                            detail: "从渠道事件卡恢复失败发布，系统已按下一轮建议重新排队内容 workflow。",
                            trigger: "manual",
                          });
                          setTab("tasks");
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
                        {pickLocaleText(locale, { "zh-CN": "查看对应执行", "zh-TW": "查看對應執行", en: "View Related Run", ja: "関連実行を見る" })}
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
                      {pickLocaleText(locale, { "zh-CN": "定位到内容实体", "zh-TW": "定位到內容實體", en: "Locate Content Entity", ja: "コンテンツ実体へ移動" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      {pickLocaleText(locale, { "zh-CN": "打开远程值守", "zh-TW": "打開遠端值守", en: "Open Remote Supervision", ja: "遠隔監督を開く" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
                      {pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{text.channelBoard}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {pickLocaleText(locale, {
            "zh-CN": "可在这里启用渠道、查看就绪度，并识别哪些路由仍需要公网 Webhook 支持。",
            "zh-TW": "可在這裡啟用渠道、查看就緒度，並識別哪些路由仍需要公開 Webhook 支援。",
            en: "Enable channels, inspect readiness, and identify which routes still need public webhook support here.",
            ja: "ここでチャネルの有効化、準備状況の確認、公開 Webhook が必要な経路の識別を行えます。",
          })}
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
                  background: config.enabled ? "rgba(var(--accent-rgb), 0.08)" : "rgba(247,249,253,0.96)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{def.emoji}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{def.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        {getLocalizedPlatformDescription(def.id, def.description, locale)}
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
                    {getPlatformStatusLabel(snapshot.status, locale)}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <div style={channelRowStyle}>
                    <span>{pickLocaleText(locale, { "zh-CN": "模式", "zh-TW": "模式", en: "Mode", ja: "モード" })}</span>
                    <strong>{def.webhookBased ? "Webhook" : pickLocaleText(locale, { "zh-CN": "直连 Bot", "zh-TW": "直連 Bot", en: "Direct Bot", ja: "直接 Bot" })}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>{pickLocaleText(locale, { "zh-CN": "必填字段", "zh-TW": "必填欄位", en: "Required fields", ja: "必須項目" })}</span>
                    <strong>{readyCount}/{requiredFields.length || 0}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>{pickLocaleText(locale, { "zh-CN": "就绪度", "zh-TW": "就緒度", en: "Readiness", ja: "準備度" })}</span>
                    <strong>{readiness}%</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>{pickLocaleText(locale, { "zh-CN": "会话", "zh-TW": "會話", en: "Sessions", ja: "セッション" })}</span>
                    <strong>{snapshot.sessionCount}</strong>
                  </div>
                  <div style={channelRowStyle}>
                    <span>{pickLocaleText(locale, { "zh-CN": "待回复", "zh-TW": "待回覆", en: "Pending replies", ja: "返信待ち" })}</span>
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
                      {getLocalizedPlatformFieldLabel(def.id, field.key, field.label, locale)}
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
                    {pickLocaleText(locale, {
                      "zh-CN": "该渠道需要先具备公网回调地址，才能像真正的实时桥接链路一样工作。",
                      "zh-TW": "該渠道需要先具備公開回調位址，才能像真正的即時橋接鏈路一樣工作。",
                      en: "This channel needs a public callback endpoint before it can behave like a live bridge.",
                      ja: "このチャネルがライブブリッジのように動作するには、先に公開コールバック URL が必要です。",
                    })}
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
                    {config.enabled
                      ? pickLocaleText(locale, { "zh-CN": "已在工作台启用", "zh-TW": "已在工作台啟用", en: "Enabled in shell", ja: "シェルで有効" })
                      : pickLocaleText(locale, { "zh-CN": "当前未在工作台启用", "zh-TW": "目前未在工作台啟用", en: "Disabled in shell", ja: "シェルで無効" })}
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("remote")}>
                      {pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "前往遠端值守", en: "Open Remote Supervision", ja: "遠隔監督へ" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openControlSection("settings")}>
                      {pickLocaleText(locale, { "zh-CN": "配置字段", "zh-TW": "配置欄位", en: "Configure Fields", ja: "項目を設定" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => toggleChannel(def.id)}>
                      {config.enabled
                        ? pickLocaleText(locale, { "zh-CN": "停用", "zh-TW": "停用", en: "Disable", ja: "無効化" })
                        : pickLocaleText(locale, { "zh-CN": "启用", "zh-TW": "啟用", en: "Enable", ja: "有効化" })}
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

const inlineTagStyle = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-muted)",
  fontSize: 11,
} as const;

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

function getLocalizedPlatformFieldLabel(platformId: string, fieldKey: string, fallback: string, locale: UiLocale) {
  const fieldMap: Record<string, Record<string, Record<UiLocale, string>>> = {
    telegram: {
      botToken: { "zh-CN": "机器人令牌", "zh-TW": "機器人令牌", en: "Bot Token", ja: "Botトークン" },
      proxy: { "zh-CN": "代理地址", "zh-TW": "代理位址", en: "Proxy", ja: "プロキシ" },
      defaultChatId: { "zh-CN": "默认会话 ID", "zh-TW": "預設會話 ID", en: "Default Chat ID", ja: "既定Chat ID" },
    },
    line: {
      channelAccessToken: { "zh-CN": "频道访问令牌", "zh-TW": "頻道存取令牌", en: "Channel Access Token", ja: "チャネルアクセストークン" },
      channelSecret: { "zh-CN": "频道密钥", "zh-TW": "頻道密鑰", en: "Channel Secret", ja: "チャネルシークレット" },
      webhookUrl: { "zh-CN": "Webhook 回调地址", "zh-TW": "Webhook 回調位址", en: "Webhook URL", ja: "Webhook URL" },
    },
    feishu: {
      appId: { "zh-CN": "应用 ID", "zh-TW": "應用 ID", en: "App ID", ja: "App ID" },
      appSecret: { "zh-CN": "应用密钥", "zh-TW": "應用密鑰", en: "App Secret", ja: "App Secret" },
      verifyToken: { "zh-CN": "验证令牌", "zh-TW": "驗證令牌", en: "Verification Token", ja: "Verification Token" },
      encryptKey: { "zh-CN": "加密密钥", "zh-TW": "加密密鑰", en: "Encrypt Key", ja: "Encrypt Key" },
      defaultOpenId: { "zh-CN": "默认用户 Open ID", "zh-TW": "預設使用者 Open ID", en: "Default User Open ID", ja: "既定Open ID" },
      webhookUrl: { "zh-CN": "Webhook 回调地址", "zh-TW": "Webhook 回調位址", en: "Webhook URL", ja: "Webhook URL" },
    },
    wecom: {
      corpId: { "zh-CN": "企业 ID", "zh-TW": "企業 ID", en: "Corp ID", ja: "Corp ID" },
      agentId: { "zh-CN": "应用 ID", "zh-TW": "應用 ID", en: "Agent ID", ja: "Agent ID" },
      secret: { "zh-CN": "应用密钥", "zh-TW": "應用密鑰", en: "Secret", ja: "Secret" },
      token: { "zh-CN": "回调令牌", "zh-TW": "回調令牌", en: "Callback Token", ja: "Callback Token" },
      encodingAESKey: { "zh-CN": "消息加密密钥", "zh-TW": "消息加密密鑰", en: "Encoding AES Key", ja: "Encoding AES Key" },
      webhookUrl: { "zh-CN": "Webhook 回调地址", "zh-TW": "Webhook 回調位址", en: "Webhook URL", ja: "Webhook URL" },
    },
  };
  return fieldMap[platformId]?.[fieldKey]?.[locale] ?? fallback;
}

function getLocalizedPlatformDescription(platformId: string, fallback: string, locale: UiLocale) {
  const descriptions: Record<string, Record<UiLocale, string>> = {
    telegram: {
      "zh-CN": "通过 Telegram 机器人接收指令，智能体执行后自动回复。",
      "zh-TW": "透過 Telegram 機器人接收指令，智能體執行後自動回覆。",
      en: "Receive instructions through a Telegram bot and automatically reply after the agent finishes execution.",
      ja: "Telegram ボットで指示を受け取り、エージェント実行後に自動返信します。",
    },
    line: {
      "zh-CN": "通过 LINE 官方账号 Webhook 接收消息并回复。",
      "zh-TW": "透過 LINE 官方帳號 Webhook 接收消息並回覆。",
      en: "Receive and reply to messages through a LINE official account webhook.",
      ja: "LINE 公式アカウントの Webhook でメッセージを受信・返信します。",
    },
    feishu: {
      "zh-CN": "通过飞书机器人 Webhook 接收消息并回复。",
      "zh-TW": "透過飛書機器人 Webhook 接收消息並回覆。",
      en: "Receive and reply to messages through a Feishu bot webhook.",
      ja: "Feishu ボットの Webhook でメッセージを受信・返信します。",
    },
    wecom: {
      "zh-CN": "通过企业微信自建应用接收员工消息。",
      "zh-TW": "透過企業微信自建應用接收員工消息。",
      en: "Receive employee messages through a self-built WeCom app.",
      ja: "WeCom の自社アプリ経由で社員メッセージを受信します。",
    },
  };
  return descriptions[platformId]?.[locale] ?? fallback;
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
  locale: UiLocale = "zh-CN",
) {
  if (log.eventType === "publish") {
    return [
      latestPublishResult ? `${pickLocaleText(locale, { "zh-CN": "渠道", "zh-TW": "渠道", en: "Channel", ja: "チャネル" })} ${latestPublishResult.channel}:${latestPublishResult.accountLabel}` : `${pickLocaleText(locale, { "zh-CN": "渠道", "zh-TW": "渠道", en: "Channel", ja: "チャネル" })} ${task.channel}`,
      latestPublishResult?.externalId ? `${pickLocaleText(locale, { "zh-CN": "外部ID", "zh-TW": "外部ID", en: "External ID", ja: "外部ID" })} ${latestPublishResult.externalId}` : "",
      latestPublishResult?.link ? pickLocaleText(locale, { "zh-CN": "已回写链接", "zh-TW": "已回寫連結", en: "Link Recorded", ja: "リンク記録済み" }) : "",
      log.failureReason ? `${pickLocaleText(locale, { "zh-CN": "失败原因", "zh-TW": "失敗原因", en: "Failure", ja: "失敗理由" })} ${log.failureReason}` : "",
    ].filter(Boolean);
  }

  if (log.eventType === "governance") {
    return [
      `${pickLocaleText(locale, { "zh-CN": "推荐主发", "zh-TW": "推薦主發", en: "Primary Route", ja: "推奨主発信" })} ${task.recommendedPrimaryChannel ?? task.channel}`,
      task.nextCycleRecommendation ? `${pickLocaleText(locale, { "zh-CN": "下一轮", "zh-TW": "下一輪", en: "Next Cycle", ja: "次サイクル" })} ${task.nextCycleRecommendation}` : "",
      task.riskyChannels.length > 0 ? `${pickLocaleText(locale, { "zh-CN": "风险渠道", "zh-TW": "風險渠道", en: "Risk Channels", ja: "リスクチャネル" })} ${task.riskyChannels.join(" / ")}` : pickLocaleText(locale, { "zh-CN": "当前无风险渠道", "zh-TW": "目前無風險渠道", en: "No Risk Channels", ja: "リスクチャネルなし" }),
    ].filter(Boolean);
  }

  if (log.eventType === "desktop") {
    return [
      `${pickLocaleText(locale, { "zh-CN": "目标", "zh-TW": "目標", en: "Target", ja: "対象" })} ${task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ") || task.channel}`,
      log.status === "blocked" ? pickLocaleText(locale, { "zh-CN": "待人工接管", "zh-TW": "待人工接管", en: "Waiting Human Takeover", ja: "人手引き継ぎ待ち" }) : "",
      log.failureReason ? `${pickLocaleText(locale, { "zh-CN": "原因", "zh-TW": "原因", en: "Reason", ja: "理由" })} ${log.failureReason}` : "",
    ].filter(Boolean);
  }

  return [
    `${pickLocaleText(locale, { "zh-CN": "目标", "zh-TW": "目標", en: "Goal", ja: "目標" })} ${task.goal}`,
    task.scheduledFor ? `${pickLocaleText(locale, { "zh-CN": "排期", "zh-TW": "排期", en: "Scheduled", ja: "予定" })} ${formatEventTime(task.scheduledFor, locale)}` : "",
    task.latestDraftSummary ? pickLocaleText(locale, { "zh-CN": "已有草稿摘要", "zh-TW": "已有草稿摘要", en: "Draft Summary Ready", ja: "草稿要約あり" }) : "",
  ].filter(Boolean);
}

function buildChannelEventContext(
  task: BusinessContentTask,
  log: BusinessOperationRecord,
  latestPublishResult: BusinessContentPublishResult | null,
  locale: UiLocale = "zh-CN",
) {
  if (log.eventType === "publish") {
    if (log.status === "failed") {
      return latestPublishResult?.failureReason
        ?? log.failureReason
        ?? pickLocaleText(locale, {
          "zh-CN": "发布失败，但当前还没有记录更细的失败原因。",
          "zh-TW": "發布失敗，但目前還沒有記錄更細的失敗原因。",
          en: "Publishing failed, but no more detailed failure reason has been recorded yet.",
          ja: "公開に失敗しましたが、より詳細な失敗理由はまだ記録されていません。",
        });
    }

    const externalRef = latestPublishResult?.externalId ?? log.externalRef;
    const summary = latestPublishResult?.summary ?? task.latestPostmortemSummary ?? task.latestDraftSummary;
    return [
      externalRef ? `${pickLocaleText(locale, { "zh-CN": "外部回执", "zh-TW": "外部回執", en: "External Receipt", ja: "外部応答" })}: ${externalRef}` : "",
      summary ? `${pickLocaleText(locale, { "zh-CN": "最近产出", "zh-TW": "最近產出", en: "Latest Output", ja: "最新成果" })}: ${summary}` : "",
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
      task.lastExecutionRunId ? `最近执行: ${task.lastExecutionRunId}` : "",
      task.latestDraftSummary ?? "",
    ].filter(Boolean).join(" · ");
  }

  return task.latestDraftSummary ?? task.brief;
}
