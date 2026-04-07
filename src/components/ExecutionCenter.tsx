"use client";

import { useMemo, type CSSProperties } from "react";
import { retryExecutionDispatch, sendExecutionDispatch } from "@/lib/execution-dispatch";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import {
  filterByProjectScope,
  getProjectScopeKey,
  getRunProjectScopeKey,
  getSessionProjectLabel,
  getSessionProjectScope,
} from "@/lib/project-context";
import { AGENT_META, type ExecutionRecoveryState, type ExecutionRun, type UiLocale } from "@/store/types";
import { timeAgo } from "@/lib/utils";
import { runExecutionVerification } from "@/lib/execution-verification";
import type { ControlCenterSectionId } from "@/store/types";

function formatTimestamp(timestamp: number, locale: UiLocale) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function statusTone(locale: UiLocale, status: ExecutionRun["status"]) {
  switch (status) {
    case "queued":
      return { label: pickLocaleText(locale, { "zh-CN": "已排队", "zh-TW": "已排隊", en: "Queued", ja: "キュー済み" }), color: "#94a3b8" };
    case "analyzing":
      return { label: pickLocaleText(locale, { "zh-CN": "分析中", "zh-TW": "分析中", en: "Analyzing", ja: "分析中" }), color: "#7dd3fc" };
    case "running":
      return { label: pickLocaleText(locale, { "zh-CN": "执行中", "zh-TW": "執行中", en: "Running", ja: "実行中" }), color: "#fbbf24" };
    case "completed":
      return { label: pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" }), color: "#86efac" };
    case "failed":
      return { label: pickLocaleText(locale, { "zh-CN": "已失败", "zh-TW": "已失敗", en: "Failed", ja: "失敗" }), color: "#fda4af" };
    default:
      return { label: status, color: "var(--text-muted)" };
  }
}

function recoveryTone(locale: UiLocale, state: ExecutionRecoveryState) {
  switch (state) {
    case "retryable":
      return { label: pickLocaleText(locale, { "zh-CN": "可重试", "zh-TW": "可重試", en: "Retryable", ja: "再試行可" }), color: "#fda4af" };
    case "manual-required":
      return { label: pickLocaleText(locale, { "zh-CN": "需要人工", "zh-TW": "需要人工", en: "Manual Required", ja: "手動対応が必要" }), color: "#fbbf24" };
    case "blocked":
      return { label: pickLocaleText(locale, { "zh-CN": "已阻断", "zh-TW": "已阻斷", en: "Blocked", ja: "ブロック済み" }), color: "#fb7185" };
    default:
      return { label: pickLocaleText(locale, { "zh-CN": "稳定", "zh-TW": "穩定", en: "Stable", ja: "安定" }), color: "#94a3b8" };
  }
}

function getSemanticRecallEvents(run: ExecutionRun) {
  return run.events.filter(event =>
    event.type === "system" &&
    (
      event.title.includes("项目记忆") ||
      event.title.includes("Desk Notes") ||
      event.title.includes("知识文档")
    ),
  );
}

function getExecutionEntityLabel(
  run: Pick<ExecutionRun, "entityType" | "entityId" | "workflowRunId">,
  labels?: { entityLabel?: string | null; workflowLabel?: string | null },
) {
  const entityLabel = labels?.entityLabel ?? (run.entityType && run.entityId ? `${run.entityType}:${run.entityId.slice(0, 8)}` : null);
  const workflowLabel = labels?.workflowLabel ?? (run.workflowRunId ? `workflow:${run.workflowRunId.slice(0, 12)}` : null);
  return [entityLabel, workflowLabel].filter(Boolean).join(" · ");
}

export function ExecutionCenter({ compact = false }: { compact?: boolean }) {
  const locale = useStore(s => s.locale);
  const executionRuns = useStore(s => s.executionRuns);
  const activeExecutionRunId = useStore(s => s.activeExecutionRunId);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const workflowRuns = useStore(s => s.workflowRuns);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const focusWorkflowRun = useStore(s => s.focusWorkflowRun);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const clearDesktopInputSession = useStore(s => s.clearDesktopInputSession);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const openExecutionRun = (runId: string) => {
    setActiveExecutionRun(runId);
    openControlSection("execution");
  };

  const handoffToChat = (run: ExecutionRun) => {
    const resumeInstruction = desktopInputSession.executionRunId === run.id
      ? desktopInputSession.resumeInstruction
      : undefined;
    setActiveChatSession(run.sessionId);
    setCommandDraft(
      resumeInstruction
        ? resumeInstruction
        : run.recoveryState === "manual-required"
          ? `继续接管这次桌面阻断执行，并先处理人工验证步骤：\n${run.instruction}`
          : `继续处理这次异常执行，并优先分析恢复路径：\n${run.instruction}`,
    );
    setTab("tasks");
  };

  const retryRun = (run: ExecutionRun) => {
    const { ok, executionRunId } = retryExecutionDispatch(run, {
      includeUserMessage: true,
      includeActiveProjectMemory: true,
      taskDescription: pickLocaleText(locale, {
        "zh-CN": `${run.instruction} [重试]`,
        "zh-TW": `${run.instruction} [重試]`,
        en: `${run.instruction} [Retry]`,
        ja: `${run.instruction} [再試行]`,
      }),
      lastRecoveryHint: pickLocaleText(locale, {
        "zh-CN": "从执行日志的恢复队列重新发起。",
        "zh-TW": "從執行日誌的恢復佇列重新發起。",
        en: "Retried from the recovery queue in Execution Log.",
        ja: "実行ログの復旧キューから再試行しました。",
      }),
    });

    if (ok && executionRunId) {
      setActiveChatSession(run.sessionId);
      openExecutionRun(executionRunId);
      return;
    }

    handoffToChat(run);
  };

  const continueAfterManualRecovery = (run: ExecutionRun) => {
    if (desktopInputSession.executionRunId !== run.id || !desktopInputSession.resumeInstruction) {
      handoffToChat(run);
      return;
    }

    setActiveChatSession(run.sessionId);
    const { ok, executionRunId } = sendExecutionDispatch({
      instruction: desktopInputSession.resumeInstruction,
      source: "chat",
      includeUserMessage: false,
      includeActiveProjectMemory: true,
      sessionId: run.sessionId,
      taskDescription: pickLocaleText(locale, {
        "zh-CN": "验证完成后继续执行",
        "zh-TW": "驗證完成後繼續執行",
        en: "Continue after verification",
        ja: "確認後に続行",
      }),
      retryOfRunId: run.id,
      lastRecoveryHint: pickLocaleText(locale, {
        "zh-CN": "人工验证已完成，继续沿用原执行上下文。",
        "zh-TW": "人工驗證已完成，繼續沿用原執行上下文。",
        en: "Manual verification is done. Continue with the original execution context.",
        ja: "手動確認が完了したため、元の実行コンテキストで続行します。",
      }),
    });

    if (ok) {
      setAutomationPaused(false);
      clearDesktopInputSession();
      if (executionRunId) {
        openExecutionRun(executionRunId);
        return;
      }
    }

    handoffToChat(run);
  };

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const activeProjectKey = useMemo(
    () => getProjectScopeKey(getSessionProjectScope(activeSession)),
    [activeSession],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const contentTaskMap = useMemo(
    () => Object.fromEntries(scopedContentTasks.map(task => [task.id, task])),
    [scopedContentTasks],
  );
  const workflowRunMap = useMemo(
    () => Object.fromEntries(workflowRuns.map(run => [run.id, run])),
    [workflowRuns],
  );

  const sortedRuns = useMemo(
    () =>
      [...executionRuns]
        .filter(run => getRunProjectScopeKey(run, chatSessions) === activeProjectKey)
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [activeProjectKey, chatSessions, executionRuns],
  );

  const visibleRuns = compact ? sortedRuns.slice(0, 3) : sortedRuns.slice(0, 10);
  const activeRuns = sortedRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const completedRuns = sortedRuns.filter(run => run.status === "completed").length;
  const failedRuns = sortedRuns.filter(run => run.status === "failed").length;
  const recoveryRuns = useMemo(() => {
    const recoveredSourceIds = new Set(sortedRuns.map(run => run.retryOfRunId).filter(Boolean));
    return sortedRuns.filter(run => {
      if (recoveredSourceIds.has(run.id)) return false;
      if (run.recoveryState && run.recoveryState !== "none") return true;
      return run.status === "failed";
    });
  }, [sortedRuns]);
  const visibleRecoveryRuns = compact ? recoveryRuns.slice(0, 2) : recoveryRuns.slice(0, 5);
  const totalEvents = sortedRuns.reduce((count, run) => count + run.events.length, 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "运行中", "zh-TW": "運行中", en: "Active Runs", ja: "実行中" })} value={activeRuns} accent="#fbbf24" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" })} value={completedRuns} accent="#86efac" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "已失败", "zh-TW": "已失敗", en: "Failed", ja: "失敗" })} value={failedRuns} accent="#fda4af" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "恢复队列", "zh-TW": "恢復佇列", en: "Recovery Queue", ja: "復旧キュー" })} value={recoveryRuns.length} accent={recoveryRuns.length > 0 ? "#fbbf24" : "#94a3b8"} />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "轨迹事件", "zh-TW": "軌跡事件", en: "Trace Events", ja: "トレースイベント" })} value={totalEvents} accent="#7dd3fc" />
      </div>

      {visibleRecoveryRuns.length > 0 ? (
        <div
          className="card"
          style={{
            padding: 16,
            display: "grid",
            gap: 12,
            borderColor: "rgba(251, 191, 36, 0.26)",
            background: "linear-gradient(180deg, rgba(251, 191, 36, 0.08), rgba(255,255,255,0.03))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {pickLocaleText(locale, { "zh-CN": "恢复队列", "zh-TW": "恢復佇列", en: "Recovery Queue", ja: "復旧キュー" })}
              </div>
              <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "最近需要恢复、重试或人工接管的执行 run",
                  "zh-TW": "最近需要恢復、重試或人工接管的執行 run",
                  en: "Runs that recently need recovery, retry, or manual takeover",
                  ja: "直近で復旧、再試行、手動引き継ぎが必要な実行 run",
                })}
              </div>
            </div>
            <span style={badgeStyle("#fbbf24")}>{recoveryRuns.length} {pickLocaleText(locale, { "zh-CN": "待处理", "zh-TW": "待處理", en: "Pending", ja: "対応待ち" })}</span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {visibleRecoveryRuns.map(run => {
              const state = run.recoveryState === "none" || !run.recoveryState
                ? (run.status === "failed" ? "retryable" : "blocked")
                : run.recoveryState;
              const matchingResumeInstruction =
                desktopInputSession.executionRunId === run.id ? desktopInputSession.resumeInstruction : undefined;
              const tone = recoveryTone(locale, state);
              return (
                <div
                  key={`recovery-${run.id}`}
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    border: `1px solid ${tone.color}33`,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{run.instruction}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
                        {timeAgo(run.updatedAt, locale)} · {run.retryCount
                          ? pickLocaleText(locale, {
                              "zh-CN": `第 ${run.retryCount} 次恢复链`,
                              "zh-TW": `第 ${run.retryCount} 次恢復鏈`,
                              en: `Recovery pass ${run.retryCount}`,
                              ja: `復旧 ${run.retryCount} 回目`,
                            })
                          : pickLocaleText(locale, {
                              "zh-CN": "首轮执行",
                              "zh-TW": "首輪執行",
                              en: "First attempt",
                              ja: "初回実行",
                            })}
                      </div>
                    </div>
                    <span style={badgeStyle(tone.color)}>{tone.label}</span>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    {run.lastFailureReason ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        {pickLocaleText(locale, { "zh-CN": "失败原因", "zh-TW": "失敗原因", en: "Failure", ja: "失敗理由" })}: {run.lastFailureReason}
                      </div>
                    ) : null}
                    {run.lastRecoveryHint ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        {pickLocaleText(locale, { "zh-CN": "恢复提示", "zh-TW": "恢復提示", en: "Hint", ja: "ヒント" })}: {run.lastRecoveryHint}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {state === "retryable" || state === "blocked" ? (
                      <button type="button" className="btn-ghost" onClick={() => retryRun(run)}>
                        {pickLocaleText(locale, { "zh-CN": "一键重试", "zh-TW": "一鍵重試", en: "Retry", ja: "再試行" })}
                      </button>
                    ) : state === "manual-required" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => continueAfterManualRecovery(run)}
                        disabled={!matchingResumeInstruction}
                      >
                        {pickLocaleText(locale, { "zh-CN": "验证完成继续", "zh-TW": "驗證完成繼續", en: "Continue After Verification", ja: "確認後に続行" })}
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost" onClick={() => handoffToChat(run)}>
                        {pickLocaleText(locale, { "zh-CN": "回聊天接管", "zh-TW": "回聊天接管", en: "Back to Chat", ja: "チャットへ戻る" })}
                      </button>
                    )}
                    <button type="button" className="btn-ghost" onClick={() => handoffToChat(run)}>
                      {pickLocaleText(locale, { "zh-CN": "去聊天接管", "zh-TW": "去聊天接管", en: "Take Over in Chat", ja: "チャットで引き継ぐ" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => openExecutionRun(run.id)}>
                      {pickLocaleText(locale, { "zh-CN": "查看执行", "zh-TW": "查看執行", en: "Open Run", ja: "実行を見る" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void runExecutionVerification(run.id)}
                      disabled={run.verificationStatus === "running"}
                    >
                      {run.verificationStatus === "running"
                        ? pickLocaleText(locale, { "zh-CN": "验证中...", "zh-TW": "驗證中...", en: "Verifying...", ja: "検証中..." })
                        : pickLocaleText(locale, { "zh-CN": "重新验证", "zh-TW": "重新驗證", en: "Verify Again", ja: "再検証" })}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {visibleRuns.length === 0 ? (
        <div style={emptyPanelStyle}>
          {pickLocaleText(locale, {
            "zh-CN": "还没有执行日志。发出一条聊天消息后，这里会开始累积执行轨迹。",
            "zh-TW": "還沒有執行日誌。發出一條聊天消息後，這裡會開始累積執行軌跡。",
            en: "There are no execution logs yet. Send a chat message and traces will start accumulating here.",
            ja: "まだ実行ログはありません。チャットを送ると、ここに実行トレースが蓄積されます。",
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visibleRuns.map(run => {
            const tone = statusTone(locale, run.status);
            const currentAgent = run.currentAgentId ? AGENT_META[run.currentAgentId] : null;
            const lastEvent = run.events[run.events.length - 1];
            const events = compact ? run.events.slice(-4) : run.events.slice(-8);
            const semanticEvents = getSemanticRecallEvents(run);
            const isActive = activeExecutionRunId === run.id;
            const verificationTone = run.verificationStatus ? verificationStatusTone(locale, run.verificationStatus) : null;
            const linkedContentTask = run.entityType === "contentTask" && run.entityId ? contentTaskMap[run.entityId] ?? null : null;
            const linkedWorkflowRun = run.workflowRunId ? workflowRunMap[run.workflowRunId] ?? null : null;
            const executionEntityLabel = getExecutionEntityLabel(run, {
              entityLabel: linkedContentTask ? `content:${linkedContentTask.title}` : undefined,
              workflowLabel: linkedWorkflowRun ? `workflow:${linkedWorkflowRun.title}` : undefined,
            });

            return (
              <article
                key={run.id}
                className="card"
                style={{
                  padding: 16,
                  display: "grid",
                  gap: 12,
                  lineHeight: 1.6,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  borderColor: isActive ? `${tone.color}55` : "var(--border)",
                  background: isActive
                    ? `linear-gradient(180deg, ${tone.color}18, rgba(255,255,255,0.03) 72%)`
                    : "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {run.instruction}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                      {formatTimestamp(run.createdAt, locale)} · {pickLocaleText(locale, { "zh-CN": "更新于", "zh-TW": "更新於", en: "Updated", ja: "更新" })} {timeAgo(run.updatedAt, locale)}
                    </div>
                  </div>
                  <span style={badgeStyle(tone.color)}>{tone.label}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                  <TraceStat label={pickLocaleText(locale, { "zh-CN": "来源", "zh-TW": "來源", en: "Source", ja: "ソース" })} value={run.source} />
                  <TraceStat label={pickLocaleText(locale, { "zh-CN": "会话", "zh-TW": "會話", en: "Session", ja: "セッション" })} value={run.sessionId.slice(0, 8)} />
                  <TraceStat label={pickLocaleText(locale, { "zh-CN": "任务", "zh-TW": "任務", en: "Tasks", ja: "タスク" })} value={`${run.completedTasks}/${run.totalTasks || 0}`} />
                  <TraceStat label={pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" })} value={String(run.failedTasks)} />
                  <TraceStat label={pickLocaleText(locale, { "zh-CN": "当前", "zh-TW": "目前", en: "Current", ja: "現在" })} value={currentAgent ? `${currentAgent.emoji} ${currentAgent.name}` : pickLocaleText(locale, { "zh-CN": "待分配", "zh-TW": "待分配", en: "Unassigned", ja: "未割当" })} />
                </div>

                {executionEntityLabel ? (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {pickLocaleText(locale, { "zh-CN": "已绑定", "zh-TW": "已綁定", en: "Bound to", ja: "紐付け先" })} {executionEntityLabel}
                  </div>
                ) : null}

                {semanticEvents.length > 0 && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(56, 189, 248, 0.18)",
                      background: "linear-gradient(180deg, rgba(56, 189, 248, 0.1), rgba(255,255,255,0.03))",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pickLocaleText(locale, { "zh-CN": "语义上下文", "zh-TW": "語義上下文", en: "Semantic Context", ja: "意味コンテキスト" })}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                          {pickLocaleText(locale, {
                            "zh-CN": `本次执行已召回 ${semanticEvents.length} 项语义资产`,
                            "zh-TW": `本次執行已召回 ${semanticEvents.length} 項語義資產`,
                            en: `${semanticEvents.length} semantic assets were recalled for this run`,
                            ja: `この実行では ${semanticEvents.length} 件の意味資産が呼び出されました`,
                          })}
                        </div>
                      </div>
                      <span style={badgeStyle("#38bdf8")}>{pickLocaleText(locale, { "zh-CN": "记忆召回", "zh-TW": "記憶召回", en: "Memory Recall", ja: "記憶呼び出し" })}</span>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {semanticEvents.map(event => (
                        <div
                          key={`${run.id}-${event.id}-semantic`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            background: "rgba(255,255,255,0.04)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <strong style={{ fontSize: 12 }}>{event.title}</strong>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {formatTimestamp(event.timestamp, locale)}
                            </span>
                          </div>
                          {event.detail && (
                            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.7, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                              {event.detail}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {verificationTone && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.04)",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pickLocaleText(locale, { "zh-CN": "验证", "zh-TW": "驗證", en: "Verification", ja: "検証" })}</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: verificationTone.color }}>
                          {verificationTone.label}
                        </div>
                      </div>
                      {run.verificationUpdatedAt && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {formatTimestamp(run.verificationUpdatedAt, locale)}
                        </div>
                      )}
                    </div>

                    {run.verificationResults && run.verificationResults.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {run.verificationResults.map(step => (
                          <div
                            key={`${run.id}-${step.id}`}
                            style={{
                              display: "grid",
                              gap: 4,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,0.03)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <strong style={{ fontSize: 12 }}>{step.label}</strong>
                              <span style={badgeStyle(step.status === "passed" ? "#86efac" : step.status === "failed" ? "#fda4af" : "#94a3b8")}>
                                {pickLocaleText(locale, {
                                  "zh-CN": step.status === "passed" ? "通过" : step.status === "failed" ? "失败" : "跳过",
                                  "zh-TW": step.status === "passed" ? "通過" : step.status === "failed" ? "失敗" : "跳過",
                                  en: step.status === "passed" ? "Passed" : step.status === "failed" ? "Failed" : "Skipped",
                                  ja: step.status === "passed" ? "合格" : step.status === "failed" ? "失敗" : "スキップ",
                                })}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{step.command}</div>
                            {step.output && (
                              <div style={{ fontSize: 11, lineHeight: 1.7, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                                {step.output}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                        {pickLocaleText(locale, {
                          "zh-CN": "尚未产出具体验证步骤结果。",
                          "zh-TW": "尚未產出具體驗證步驟結果。",
                          en: "No detailed verification step results yet.",
                          ja: "詳細な検証ステップ結果はまだありません。",
                        })}
                      </div>
                    )}
                  </div>
                )}

                {lastEvent && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pickLocaleText(locale, { "zh-CN": "最新节点", "zh-TW": "最新節點", en: "Latest", ja: "最新" })}</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>{lastEvent.title}</div>
                    {lastEvent.detail && (
                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                        {lastEvent.detail}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gap: 8 }}>
                  {events.map(event => {
                    const eventAgent = event.agentId ? AGENT_META[event.agentId] : null;
                    return (
                      <div
                        key={event.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid var(--border)",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 10,
                            display: "grid",
                            placeItems: "center",
                            background: eventAgent ? "rgba(255,255,255,0.1)" : "rgba(125, 211, 252, 0.15)",
                            flexShrink: 0,
                          }}
                        >
                          {eventAgent ? eventAgent.emoji : "•"}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{event.title}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                              {formatTimestamp(event.timestamp, locale)}
                            </div>
                          </div>
                          {event.detail && (
                            <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.7, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                              {event.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-ghost" onClick={() => setActiveExecutionRun(run.id)}>
                    {isActive
                      ? pickLocaleText(locale, { "zh-CN": "当前正在查看", "zh-TW": "目前正在查看", en: "Viewing Now", ja: "現在表示中" })
                      : pickLocaleText(locale, { "zh-CN": "设为当前", "zh-TW": "設為目前", en: "Set Current", ja: "現在の実行にする" })}
                  </button>
                  {linkedWorkflowRun ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        focusWorkflowRun(linkedWorkflowRun.id);
                        openControlSection("workflow");
                      }}
                    >
                      {pickLocaleText(locale, { "zh-CN": "定位到工作流", "zh-TW": "定位到工作流", en: "Open Workflow", ja: "ワークフローを見る" })}
                    </button>
                  ) : null}
                  {linkedContentTask ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        focusBusinessContentTask(linkedContentTask.id);
                        openControlSection("entities");
                      }}
                    >
                      {pickLocaleText(locale, { "zh-CN": "定位到内容实体", "zh-TW": "定位到內容實體", en: "Open Content Entity", ja: "コンテンツ実体を見る" })}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void runExecutionVerification(run.id)}
                    disabled={run.verificationStatus === "running"}
                  >
                    {run.verificationStatus === "running"
                      ? pickLocaleText(locale, { "zh-CN": "验证中...", "zh-TW": "驗證中...", en: "Verifying...", ja: "検証中..." })
                      : pickLocaleText(locale, { "zh-CN": "重新验证", "zh-TW": "重新驗證", en: "Verify Again", ja: "再検証" })}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}

function TraceStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: 10,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <strong style={{ fontSize: 12 }}>{value}</strong>
    </div>
  );
}

function badgeStyle(color: string): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}1f`,
    color,
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
  };
}

function verificationStatusTone(locale: UiLocale, status: NonNullable<ExecutionRun["verificationStatus"]>) {
  switch (status) {
    case "running":
      return { label: pickLocaleText(locale, { "zh-CN": "验证中", "zh-TW": "驗證中", en: "Running", ja: "検証中" }), color: "#fbbf24" };
    case "passed":
      return { label: pickLocaleText(locale, { "zh-CN": "通过", "zh-TW": "通過", en: "Passed", ja: "合格" }), color: "#86efac" };
    case "failed":
      return { label: pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" }), color: "#fda4af" };
    case "skipped":
      return { label: pickLocaleText(locale, { "zh-CN": "跳过", "zh-TW": "跳過", en: "Skipped", ja: "スキップ" }), color: "#94a3b8" };
    default:
      return { label: status, color: "var(--text-muted)" };
  }
}

const emptyPanelStyle = {
  padding: 16,
  borderRadius: 16,
  border: "1px dashed var(--border)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--text-muted)",
  fontSize: 12,
  lineHeight: 1.75,
} satisfies CSSProperties;
