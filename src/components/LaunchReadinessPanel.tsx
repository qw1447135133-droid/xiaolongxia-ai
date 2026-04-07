"use client";

import { useEffect, useMemo, useState } from "react";
import { filterByProjectScope, getRunProjectScopeKey } from "@/lib/project-context";
import { isPlatformOperationalStatus } from "@/lib/platform-connectors";
import { useStore } from "@/store";
import type { ControlCenterSectionId } from "@/store/types";
import { formatAutomationModeLabel, pickLocaleText } from "@/lib/ui-locale";

export function LaunchReadinessPanel({
  compact = false,
  onSelectSection,
}: {
  compact?: boolean;
  onSelectSection?: (section: ControlCenterSectionId) => void;
}) {
  const locale = useStore(s => s.locale);
  const [activeAdviceId, setActiveAdviceId] = useState<string | null>(null);
  type RiskItem = {
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
    section: ControlCenterSectionId;
  };

  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const platformConfigs = useStore(s => s.platformConfigs);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const executionRuns = useStore(s => s.executionRuns);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const wsStatus = useStore(s => s.wsStatus);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const scopedRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey),
    [chatSessions, currentProjectKey, executionRuns],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, activeSession ?? {}),
    [activeSession, businessApprovals],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );

  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled);
  const operationalPlatforms = enabledPlatforms.filter(platform => isPlatformOperationalStatus(platform.status));
  const connectorBlockers = enabledPlatforms.filter(platform =>
    platform.status !== "connected" && platform.status !== "configured" && platform.status !== "degraded",
  );
  const recoveredSourceIds = new Set(scopedRuns.map(run => run.retryOfRunId).filter(Boolean));
  const recoveryRuns = scopedRuns.filter(run => {
    if (recoveredSourceIds.has(run.id)) return false;
    return run.status === "failed" || (run.recoveryState && run.recoveryState !== "none");
  });
  const pendingApprovals = scopedApprovals.filter(item => item.status === "pending").length;
  const pendingReplySessions = scopedChannelSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const desktopTakeoverReady = desktopInputSession.state !== "manual-required";

  const visibleChecks = [
    {
      id: "ws",
      label: "实时链路",
      ok: wsStatus === "connected",
      detail: wsStatus === "connected" ? "WebSocket 已联机" : "WebSocket 当前离线，远程状态无法实时回流",
      section: "remote" as const,
    },
    {
      id: "connectors",
      label: "连接器",
      ok: enabledPlatforms.length > 0 && operationalPlatforms.length > 0,
      detail: `${operationalPlatforms.length}/${enabledPlatforms.length} 已进入可运行状态`,
      section: "channels" as const,
    },
    {
      id: "recovery",
      label: "执行恢复",
      ok: recoveryRuns.length === 0,
      detail: recoveryRuns.length === 0 ? "当前没有待恢复 run" : `${recoveryRuns.length} 条待恢复`,
      section: "execution" as const,
    },
    {
      id: "approvals",
      label: "审批积压",
      ok: pendingApprovals === 0,
      detail: pendingApprovals === 0 ? "没有待审批阻塞" : `${pendingApprovals} 条待审批`,
      section: "remote" as const,
    },
    {
      id: "takeover",
      label: "桌面接管",
      ok: desktopTakeoverReady,
      detail: desktopTakeoverReady ? "当前没有卡在人工接管" : "桌面输入仍等待人工处理",
      section: "desktop" as const,
    },
    {
      id: "sessions",
      label: "会话待办",
      ok: pendingReplySessions === 0,
      detail: pendingReplySessions === 0 ? "当前没有待回复会话" : `${pendingReplySessions} 个会话仍待回复或未读`,
      section: "channels" as const,
    },
  ];

  const passedChecks = visibleChecks.filter(item => item.ok).length;
  const readinessPercent = Math.round((passedChecks / visibleChecks.length) * 100);
  const blockerItems = ([
    wsStatus !== "connected"
      ? {
        id: "risk-ws",
        severity: "critical" as const,
        title: "实时链路离线",
        detail: "WebSocket 未连接，远程消息、连接器状态和执行结果无法实时回流。",
        section: "remote" as const,
      }
      : null,
    enabledPlatforms.length === 0 || operationalPlatforms.length === 0
      ? {
        id: "risk-connectors",
        severity: "critical" as const,
        title: "缺少可运行连接器",
        detail: enabledPlatforms.length === 0
          ? "当前还没有启用任何真实连接器。"
          : `${connectorBlockers.length} 个连接器仍处于异常、等待回调或未完成握手状态。`,
        section: "channels" as const,
      }
      : null,
    recoveryRuns.length > 0
      ? {
        id: "risk-recovery",
        severity: "critical" as const,
        title: "恢复队列未清空",
        detail: `${recoveryRuns.length} 条执行仍需重试、验证完成继续，或回到聊天接管。`,
        section: "execution" as const,
      }
      : null,
    pendingApprovals > 0
      ? {
        id: "risk-approvals",
        severity: "warning" as const,
        title: "审批仍在积压",
        detail: `${pendingApprovals} 条业务对象等待审批，默认不应自动越过这道边界。`,
        section: "remote" as const,
      }
      : null,
    !desktopTakeoverReady
      ? {
        id: "risk-desktop",
        severity: "critical" as const,
        title: "桌面接管仍待人工",
        detail: desktopInputSession.message || "当前存在一条桌面交互卡在人工接管状态。",
        section: "desktop" as const,
      }
      : null,
    pendingReplySessions > 0
      ? {
        id: "risk-replies",
        severity: "warning" as const,
        title: "渠道会话待回复",
        detail: `${pendingReplySessions} 个渠道会话仍有未读或待回复消息。`,
        section: "channels" as const,
      }
      : null,
  ] as Array<RiskItem | null>).filter((item): item is RiskItem => item !== null);
  const riskItems = compact ? blockerItems.slice(0, 3) : blockerItems.slice(0, 6);
  const activeAdvice = activeAdviceId ? getLaunchAdvice(locale, activeAdviceId) : null;
  const compactSummaryItems = [
    {
      label: pickLocaleText(locale, {
        "zh-CN": "可运行连接器",
        "zh-TW": "可運行連接器",
        en: "Live Connectors",
        ja: "稼働コネクタ",
      }),
      value: `${operationalPlatforms.length}/${enabledPlatforms.length}`,
      accent: "var(--success)",
    },
    {
      label: pickLocaleText(locale, {
        "zh-CN": "恢复队列",
        "zh-TW": "恢復佇列",
        en: "Recovery Queue",
        ja: "復旧キュー",
      }),
      value: recoveryRuns.length,
      accent: recoveryRuns.length === 0 ? "var(--success)" : "var(--warning)",
    },
    {
      label: pickLocaleText(locale, {
        "zh-CN": "待审批",
        "zh-TW": "待審批",
        en: "Pending Approvals",
        ja: "承認待ち",
      }),
      value: pendingApprovals,
      accent: pendingApprovals === 0 ? "var(--success)" : "var(--warning)",
    },
    {
      label: pickLocaleText(locale, {
        "zh-CN": "待回复会话",
        "zh-TW": "待回覆會話",
        en: "Pending Replies",
        ja: "返信待ち",
      }),
      value: pendingReplySessions,
      accent: pendingReplySessions === 0 ? "var(--success)" : "#60a5fa",
    },
  ];

  useEffect(() => {
    if (!activeAdvice) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveAdviceId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeAdvice]);

  if (compact) {
    return (
      <>
        <div
          className="card"
          style={{
            padding: 14,
            display: "grid",
            gap: 10,
            borderColor: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.24)" : "rgba(251, 191, 36, 0.24)",
            background: "linear-gradient(135deg, rgba(125, 211, 252, 0.08), rgba(255,255,255,0.02))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {pickLocaleText(locale, {
                  "zh-CN": "上线准备度",
                  "zh-TW": "上線準備度",
                  en: "Launch Readiness",
                  ja: "公開準備度",
                })}
              </div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "人工收口摘要",
                  "zh-TW": "人工收口摘要",
                  en: "Manual Closing Summary",
                  ja: "手動収束サマリー",
                })}
              </div>
            </div>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${readinessPercent >= 80 ? "rgba(34, 197, 94, 0.32)" : "rgba(251, 191, 36, 0.32)"}`,
                background: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.12)" : "rgba(251, 191, 36, 0.12)",
                color: readinessPercent >= 80 ? "var(--success)" : "var(--warning)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {readinessPercent}%
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {compactSummaryItems.map(item => (
              <div
                key={item.label}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
                <div style={{ marginTop: 6, fontSize: 17, fontWeight: 700, color: item.accent }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {pickLocaleText(locale, {
                "zh-CN": "当前阻塞",
                "zh-TW": "目前阻塞",
                en: "Current Blockers",
                ja: "現在の阻害項目",
              })}
            </div>
            {riskItems.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {riskItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn-ghost"
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: item.severity === "critical"
                        ? "rgba(248, 113, 113, 0.08)"
                        : item.severity === "warning"
                          ? "rgba(251, 191, 36, 0.08)"
                          : "rgba(255,255,255,0.03)",
                    }}
                    onClick={() => setActiveAdviceId(item.id)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{item.title}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      {truncateRiskDetail(item.detail)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "当前没有明显阻塞项，主链路可以继续自动推进。",
                  "zh-TW": "目前沒有明顯阻塞項，主鏈路可以繼續自動推進。",
                  en: "There are no visible blockers and the main chain can keep moving automatically.",
                  ja: "目立つ阻害項目はなく、メインフローは自動で継続できます。",
                })}
              </div>
            )}
          </div>
        </div>

        <AdviceModal
          activeAdvice={activeAdvice}
          locale={locale}
          onClose={() => setActiveAdviceId(null)}
          onOpenSection={onSelectSection}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="card"
        style={{
          padding: compact ? 14 : 16,
          display: "grid",
          gap: 12,
          borderColor: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.24)" : "rgba(251, 191, 36, 0.24)",
          background: "linear-gradient(135deg, rgba(125, 211, 252, 0.08), rgba(255,255,255,0.02))",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {pickLocaleText(locale, {
                "zh-CN": "上线准备度",
                "zh-TW": "上線準備度",
                en: "Launch Readiness",
                ja: "公開準備度",
              })}
            </div>
          <div style={{ marginTop: 4, fontSize: compact ? 16 : 18, fontWeight: 700 }}>
              {pickLocaleText(locale, {
                "zh-CN": "人工收口看板",
                "zh-TW": "人工收口看板",
                en: "Manual Closing Board",
                ja: "手動収束ボード",
              })}
            </div>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${readinessPercent >= 80 ? "rgba(34, 197, 94, 0.32)" : "rgba(251, 191, 36, 0.32)"}`,
              background: readinessPercent >= 80 ? "rgba(34, 197, 94, 0.12)" : "rgba(251, 191, 36, 0.12)",
              color: readinessPercent >= 80 ? "var(--success)" : "var(--warning)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {readinessPercent}%
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          {[
            { label: "可运行连接器", value: `${operationalPlatforms.length}/${enabledPlatforms.length}`, accent: "var(--success)" },
            { label: "恢复队列", value: recoveryRuns.length, accent: recoveryRuns.length === 0 ? "var(--success)" : "var(--warning)" },
            { label: "待审批", value: pendingApprovals, accent: pendingApprovals === 0 ? "var(--success)" : "var(--warning)" },
            { label: "待回复会话", value: pendingReplySessions, accent: pendingReplySessions === 0 ? "var(--success)" : "#60a5fa" },
          ].map(item => (
            <div
              key={item.label}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: compact ? 18 : 20, fontWeight: 700, color: item.accent }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {visibleChecks.map(check => (
            <button
              key={check.id}
              type="button"
              className="btn-ghost"
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.03)",
              }}
              onClick={() => setActiveAdviceId(check.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 12 }}>{check.label}</strong>
                <span style={{ color: check.ok ? "var(--success)" : "var(--warning)", fontSize: 11 }}>
                  {check.ok
                    ? pickLocaleText(locale, { "zh-CN": "正常", "zh-TW": "正常", en: "OK", ja: "正常" })
                    : pickLocaleText(locale, { "zh-CN": "待处理", "zh-TW": "待處理", en: "Pending", ja: "要対応" })}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {check.detail}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {pickLocaleText(locale, {
              "zh-CN": "最高风险",
              "zh-TW": "最高風險",
              en: "Top Risks",
              ja: "主要リスク",
            })}
          </div>
          {riskItems.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {riskItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="btn-ghost"
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: item.severity === "critical"
                      ? "rgba(248, 113, 113, 0.08)"
                      : item.severity === "warning"
                        ? "rgba(251, 191, 36, 0.08)"
                        : "rgba(255,255,255,0.03)",
                  }}
                  onClick={() => setActiveAdviceId(item.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 12 }}>{item.title}</strong>
                    <span style={{ fontSize: 11, color: item.severity === "critical" ? "var(--danger)" : item.severity === "warning" ? "var(--warning)" : "var(--text-muted)" }}>
                      {item.severity === "critical"
                        ? pickLocaleText(locale, { "zh-CN": "阻断", "zh-TW": "阻斷", en: "Blocking", ja: "阻害" })
                        : item.severity === "warning"
                          ? pickLocaleText(locale, { "zh-CN": "关注", "zh-TW": "關注", en: "Warning", ja: "注意" })
                          : pickLocaleText(locale, { "zh-CN": "提示", "zh-TW": "提示", en: "Info", ja: "情報" })}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {item.detail}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
              当前没有明显的人工阻断项。自动执行、验证和策略细节已从这个面板隐藏，继续查看对应子面板即可。
            </div>
          )}
        </div>
      </div>

      <AdviceModal
        activeAdvice={activeAdvice}
        locale={locale}
        onClose={() => setActiveAdviceId(null)}
        onOpenSection={onSelectSection}
      />
    </>
  );
}

function AdviceModal({
  activeAdvice,
  locale,
  onClose,
  onOpenSection,
}: {
  activeAdvice: ReturnType<typeof getLaunchAdvice> | null;
  locale: ReturnType<typeof useStore.getState>["locale"];
  onClose: () => void;
  onOpenSection?: (section: ControlCenterSectionId) => void;
}) {
  if (!activeAdvice) return null;

  return (
    <div className="launch-readiness-modal" onClick={onClose}>
      <div
        className="launch-readiness-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={activeAdvice.title}
        onClick={event => event.stopPropagation()}
      >
        <div style={adviceHeadStyle}>
          <div>
            <div style={adviceEyebrowStyle}>
              {pickLocaleText(locale, {
                "zh-CN": "解决方案提示",
                "zh-TW": "解決方案提示",
                en: "Suggested Fix",
                ja: "解決のヒント",
              })}
            </div>
            <div style={adviceTitleStyle}>{activeAdvice.title}</div>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {pickLocaleText(locale, {
              "zh-CN": "关闭",
              "zh-TW": "關閉",
              en: "Close",
              ja: "閉じる",
            })}
          </button>
        </div>
        <div style={adviceSummaryStyle}>{activeAdvice.summary}</div>
        <div style={adviceStepsStyle}>
          {activeAdvice.steps.map(step => (
            <div key={step} style={adviceStepStyle}>{step}</div>
          ))}
        </div>
        {onOpenSection ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onOpenSection(activeAdvice.section);
                onClose();
              }}
            >
              {pickLocaleText(locale, {
                "zh-CN": "打开对应面板",
                "zh-TW": "打開對應面板",
                en: "Open Related Panel",
                ja: "対応パネルを開く",
              })}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getLaunchAdvice(locale: ReturnType<typeof useStore.getState>["locale"], id: string) {
  switch (id) {
    case "ws":
    case "risk-ws":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "实时链路离线怎么处理",
          "zh-TW": "即時鏈路離線怎麼處理",
          en: "How to fix the realtime link being offline",
          ja: "リアルタイム接続オフライン時の対処",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "先恢复 WebSocket，本机的远程消息、连接器状态和执行结果才会重新回流。",
          "zh-TW": "先恢復 WebSocket，本機的遠端訊息、連接器狀態與執行結果才會重新回流。",
          en: "Restore WebSocket first so remote messages, connector state, and execution results can flow back again.",
          ja: "まず WebSocket を復旧すると、遠隔メッセージ・接続器状態・実行結果が再び流れます。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 先确认本机服务端和 Electron 开发实例仍在运行，没有被关掉。",
            "zh-TW": "1. 先確認本機服務端與 Electron 開發實例仍在運行，沒有被關掉。",
            en: "1. Confirm the local server and Electron dev instance are still running.",
            ja: "1. ローカルサーバーと Electron 開発インスタンスが起動中か確認します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 如果只是临时断开，重新连接通道即可恢复，不需要重做配置。",
            "zh-TW": "2. 如果只是暫時斷開，重新連接通道即可恢復，不需要重做配置。",
            en: "2. If it is only temporarily disconnected, reconnect the channel instead of rebuilding config.",
            ja: "2. 一時的な切断なら、設定をやり直さず再接続で十分です。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 恢复后再检查一次执行和值守面板，确认状态已经开始实时刷新。",
            "zh-TW": "3. 恢復後再檢查一次執行與值守面板，確認狀態已開始即時刷新。",
            en: "3. After recovery, verify execution and supervision panels are refreshing in real time again.",
            ja: "3. 復旧後に実行・監督パネルが再びリアルタイム更新されるか確認します。",
          }),
        ],
        section: "remote" as const,
      };
    case "connectors":
    case "risk-connectors":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "缺少可运行连接器怎么处理",
          "zh-TW": "缺少可運行連接器怎麼處理",
          en: "How to fix missing live connectors",
          ja: "稼働コネクタ不足時の対処",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "至少启用并跑通一个真实连接器，值守和消息闭环才算真正可用。",
          "zh-TW": "至少啟用並跑通一個真實連接器，值守與訊息閉環才算真正可用。",
          en: "Enable and validate at least one real connector before supervision and messaging are truly usable.",
          ja: "少なくとも 1 つの実コネクタを有効化して疎通させる必要があります。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 到消息平台设置里启用一个真实平台，不要只停留在默认空配置。",
            "zh-TW": "1. 到訊息平台設定裡啟用一個真實平台，不要只停留在預設空配置。",
            en: "1. Enable at least one real messaging platform in platform settings.",
            ja: "1. メッセージ設定で少なくとも 1 つの実プラットフォームを有効化します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 补齐 token、webhook 或账号参数后做一次测试通信，确认状态变成可运行。",
            "zh-TW": "2. 補齊 token、webhook 或帳號參數後做一次測試通訊，確認狀態變成可運行。",
            en: "2. Fill token, webhook, or account fields and run a test communication until the connector becomes operational.",
            ja: "2. token・webhook・アカウント設定を埋めて疎通確認し、稼働状態にします。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 再注入一条模拟入站或发送测试消息，确认会话能进入渠道面板。",
            "zh-TW": "3. 再注入一條模擬入站或發送測試訊息，確認會話能進入渠道面板。",
            en: "3. Inject a simulated inbound or send a test message to confirm sessions reach the channel panel.",
            ja: "3. 模擬受信またはテスト送信で、会話がチャネル面に入ることを確認します。",
          }),
        ],
        section: "channels" as const,
      };
    case "recovery":
    case "risk-recovery":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "恢复队列怎么清空",
          "zh-TW": "恢復佇列怎麼清空",
          en: "How to clear the recovery queue",
          ja: "復旧キューの解消方法",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把失败、阻断或待续跑的执行重新收口，系统才会恢复稳定。",
          "zh-TW": "把失敗、阻斷或待續跑的執行重新收口，系統才會恢復穩定。",
          en: "Resolve failed, blocked, or resumable executions so the system returns to a stable state.",
          ja: "失敗・中断・再開待ちの実行を処理すると全体が安定します。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 先打开执行日志，找到失败或待恢复的 run。",
            "zh-TW": "1. 先打開執行日誌，找到失敗或待恢復的 run。",
            en: "1. Open execution logs and locate failed or resumable runs.",
            ja: "1. 実行ログを開き、失敗または復旧待ちの run を見つけます。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 根据类型选择重试、回聊天续跑，或先完成人工验证再继续。",
            "zh-TW": "2. 根據類型選擇重試、回聊天續跑，或先完成人工驗證再繼續。",
            en: "2. Retry, continue in chat, or complete manual verification depending on the failure type.",
            ja: "2. 種類に応じて再試行、チャット継続、手動確認後の続行を選びます。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 只要恢复队列归零，这一项就会自动回到正常。",
            "zh-TW": "3. 只要恢復佇列歸零，這一項就會自動回到正常。",
            en: "3. Once the recovery queue reaches zero, this check returns to normal automatically.",
            ja: "3. 復旧キューがゼロになれば、この項目は自動で正常に戻ります。",
          }),
        ],
        section: "execution" as const,
      };
    case "approvals":
    case "risk-approvals":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "审批积压怎么处理",
          "zh-TW": "審批積壓怎麼處理",
          en: "How to handle pending approvals",
          ja: "承認滞留の処理方法",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把待审批对象尽快批准或驳回，自动链路才不会一直卡在人工边界。",
          "zh-TW": "把待審批對象盡快批准或駁回，自動鏈路才不會一直卡在人工邊界。",
          en: "Approve or reject pending items so the automation chain does not remain blocked by the manual gate.",
          ja: "承認待ちを処理すると、自動チェーンが手動ゲートで止まり続けなくなります。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 到远程值守里先看最靠前的待审批对象。",
            "zh-TW": "1. 到遠程值守裡先看最靠前的待審批對象。",
            en: "1. Review the top pending approval items in remote ops.",
            ja: "1. 遠隔運営で上位の承認待ち項目を確認します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 需要继续的点批准并续跑，不合适的直接驳回。",
            "zh-TW": "2. 需要繼續的點批准並續跑，不合適的直接駁回。",
            en: "2. Approve and continue valid items, reject the ones that should stop.",
            ja: "2. 続行すべきものは承認し、不適切なものは却下します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 审批清空后，值守和执行面板会更稳定。",
            "zh-TW": "3. 審批清空後，值守與執行面板會更穩定。",
            en: "3. Once the approval queue is cleared, supervision and execution become much steadier.",
            ja: "3. 承認待ちが解消すると、監督と実行の流れが安定します。",
          }),
        ],
        section: "remote" as const,
      };
    case "takeover":
    case "risk-desktop":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "桌面接管待人工怎么处理",
          "zh-TW": "桌面接管待人工怎麼處理",
          en: "How to handle pending desktop takeover",
          ja: "デスクトップ手動引き継ぎの処理方法",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "说明当前有桌面操作停在人工边界，先把这一步接完，再恢复续跑。",
          "zh-TW": "說明目前有桌面操作停在人工邊界，先把這一步接完，再恢復續跑。",
          en: "A desktop action is waiting at the manual boundary and should be completed before resuming.",
          ja: "デスクトップ操作が手動境界で停止しているため、先に手動で完了させてから再開します。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 打开桌面诊断或接管面板，看当前卡住的是哪一步。",
            "zh-TW": "1. 打開桌面診斷或接管面板，看目前卡住的是哪一步。",
            en: "1. Open desktop diagnostics or takeover view to see which step is blocked.",
            ja: "1. デスクトップ診断または引き継ぎ画面で、どの手順が止まっているか確認します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 完成人工验证、验证码或不可自动化点击后，再触发恢复执行。",
            "zh-TW": "2. 完成人工驗證、驗證碼或不可自動化點擊後，再觸發恢復執行。",
            en: "2. Finish manual verification, captcha, or blocked UI actions, then resume execution.",
            ja: "2. 手動認証や captcha、UI 操作を完了してから再開します。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 若仍不稳定，保留截图和重试建议，再回聊天重组指令。",
            "zh-TW": "3. 若仍不穩定，保留截圖與重試建議，再回聊天重組指令。",
            en: "3. If it is still unstable, keep the screenshot and retry hints, then regroup in chat.",
            ja: "3. まだ不安定なら、スクリーンショットと再試行提案を残してチャットへ戻ります。",
          }),
        ],
        section: "desktop" as const,
      };
    case "sessions":
    case "risk-replies":
    default:
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "待回复会话怎么处理",
          "zh-TW": "待回覆會話怎麼處理",
          en: "How to handle pending sessions",
          ja: "返信待ち会話の処理方法",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "先把未读或待回复会话收口，不然客服和值守链路会持续堆积。",
          "zh-TW": "先把未讀或待回覆會話收口，不然客服與值守鏈路會持續堆積。",
          en: "Close out unread or pending sessions before they keep piling up in the support flow.",
          ja: "未読や返信待ち会話を先に処理しないと、サポート導線で滞留が続きます。",
        }),
        steps: [
          pickLocaleText(locale, {
            "zh-CN": "1. 先到渠道中心或远程值守里找出最优先的会话。",
            "zh-TW": "1. 先到渠道中心或遠程值守裡找出最優先的會話。",
            en: "1. Find the highest-priority sessions in channels or remote ops.",
            ja: "1. チャネル面または遠隔運営で優先度の高い会話を見つけます。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "2. 能自动回复的继续自动化，低置信度的回聊天接管。",
            "zh-TW": "2. 能自動回覆的繼續自動化，低置信度的回聊天接管。",
            en: "2. Let confident cases continue automatically and take over low-confidence ones in chat.",
            ja: "2. 高信頼は自動継続し、低信頼はチャットで引き継ぎます。",
          }),
          pickLocaleText(locale, {
            "zh-CN": "3. 清掉未读和待回复后，这一项会自动恢复正常。",
            "zh-TW": "3. 清掉未讀與待回覆後，這一項會自動恢復正常。",
            en: "3. Once unread and pending replies are cleared, this check returns to normal.",
            ja: "3. 未読と返信待ちが解消すると、この項目は正常に戻ります。",
          }),
        ],
        section: "channels" as const,
      };
  }
}

const advicePanelStyle = {
  display: "grid",
  gap: 10,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(96, 165, 250, 0.22)",
  background: "linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(248, 250, 252, 0.86))",
} as const;

const adviceHeadStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} as const;

const adviceEyebrowStyle = {
  fontSize: 11,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
} as const;

const adviceTitleStyle = {
  marginTop: 4,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text)",
} as const;

const adviceSummaryStyle = {
  fontSize: 12,
  lineHeight: 1.7,
  color: "var(--text-muted)",
} as const;

const adviceStepsStyle = {
  display: "grid",
  gap: 8,
} as const;

const adviceStepStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(255,255,255,0.72)",
  fontSize: 12,
  lineHeight: 1.65,
  color: "var(--text)",
} as const;

function truncateRiskDetail(value: string): string {
  if (value.length <= 72) return value;
  return `${value.slice(0, 72).trimEnd()}...`;
}
