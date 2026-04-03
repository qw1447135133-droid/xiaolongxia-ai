"use client";

import { useMemo, type CSSProperties } from "react";
import { useStore } from "@/store";
import {
  getProjectScopeKey,
  getRunProjectScopeKey,
  getSessionProjectLabel,
  getSessionProjectScope,
} from "@/lib/project-context";
import { AGENT_META, type ExecutionRun } from "@/store/types";
import { timeAgo } from "@/lib/utils";
import { runExecutionVerification } from "@/lib/execution-verification";
import type { ControlCenterSectionId } from "@/store/types";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function statusTone(status: ExecutionRun["status"]) {
  switch (status) {
    case "queued":
      return { label: "Queued", color: "#94a3b8" };
    case "analyzing":
      return { label: "Analyzing", color: "#7dd3fc" };
    case "running":
      return { label: "Running", color: "#fbbf24" };
    case "completed":
      return { label: "Completed", color: "#86efac" };
    case "failed":
      return { label: "Failed", color: "#fda4af" };
    default:
      return { label: status, color: "var(--text-muted)" };
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

export function ExecutionCenter({ compact = false }: { compact?: boolean }) {
  const executionRuns = useStore(s => s.executionRuns);
  const activeExecutionRunId = useStore(s => s.activeExecutionRunId);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);

  const openControlSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const activeProjectKey = useMemo(
    () => getProjectScopeKey(getSessionProjectScope(activeSession)),
    [activeSession],
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
  const totalEvents = sortedRuns.reduce((count, run) => count + run.events.length, 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          borderColor: "rgba(125, 211, 252, 0.22)",
          background: "linear-gradient(135deg, rgba(125, 211, 252, 0.14), rgba(255,255,255,0.02))",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Execution Center
        </div>
        <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>
          把一次聊天请求变成一条可追踪的执行 run
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
          现在每轮请求都会记录分析、拆解、代理接手、完成或失败这些过程。后面接自动验证、代码库记忆和结果交付时，都可以挂在这条 run 上继续延展。
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Current project: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </div>
        {!compact ? (
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("workflow")}>
              打开工作流面板
            </button>
            <button type="button" className="btn-ghost" onClick={() => openControlSection("artifacts")}>
              查看产物面板
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Active Runs" value={activeRuns} accent="#fbbf24" />
        <MetricCard label="Completed" value={completedRuns} accent="#86efac" />
        <MetricCard label="Failed" value={failedRuns} accent="#fda4af" />
        <MetricCard label="Trace Events" value={totalEvents} accent="#7dd3fc" />
      </div>

      {visibleRuns.length === 0 ? (
        <div style={emptyPanelStyle}>
          还没有执行 run。发出一条聊天消息或快捷任务后，这里会开始累积执行轨迹。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visibleRuns.map(run => {
            const tone = statusTone(run.status);
            const currentAgent = run.currentAgentId ? AGENT_META[run.currentAgentId] : null;
            const lastEvent = run.events[run.events.length - 1];
            const events = compact ? run.events.slice(-4) : run.events.slice(-8);
            const semanticEvents = getSemanticRecallEvents(run);
            const isActive = activeExecutionRunId === run.id;
            const verificationTone = run.verificationStatus ? verificationStatusTone(run.verificationStatus) : null;

            return (
              <article
                key={run.id}
                className="card"
                style={{
                  padding: 16,
                  display: "grid",
                  gap: 12,
                  borderColor: isActive ? `${tone.color}55` : "var(--border)",
                  background: isActive
                    ? `linear-gradient(180deg, ${tone.color}18, rgba(255,255,255,0.03) 72%)`
                    : "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{run.instruction}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                      {formatTimestamp(run.createdAt)} · 更新于 {timeAgo(run.updatedAt)}
                    </div>
                  </div>
                  <span style={badgeStyle(tone.color)}>{tone.label}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                  <TraceStat label="Source" value={run.source} />
                  <TraceStat label="Session" value={run.sessionId.slice(0, 8)} />
                  <TraceStat label="Tasks" value={`${run.completedTasks}/${run.totalTasks || 0}`} />
                  <TraceStat label="Failed" value={String(run.failedTasks)} />
                  <TraceStat label="Current" value={currentAgent ? `${currentAgent.emoji} ${currentAgent.name}` : "待分配"} />
                </div>

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
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Semantic Context</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                          本次执行已召回 {semanticEvents.length} 项语义资产
                        </div>
                      </div>
                      <span style={badgeStyle("#38bdf8")}>Memory Recall</span>
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
                              {formatTimestamp(event.timestamp)}
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
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Verification</div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: verificationTone.color }}>
                          {verificationTone.label}
                        </div>
                      </div>
                      {run.verificationUpdatedAt && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {formatTimestamp(run.verificationUpdatedAt)}
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
                                {step.status}
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
                        尚未产出具体验证步骤结果。
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
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Latest</div>
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
                              {formatTimestamp(event.timestamp)}
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
                    {isActive ? "当前正在查看" : "设为当前"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => openControlSection("artifacts")}>
                    查看相关产物
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void runExecutionVerification(run.id)}
                    disabled={run.verificationStatus === "running"}
                  >
                    {run.verificationStatus === "running" ? "验证中..." : "重新验证"}
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

function verificationStatusTone(status: NonNullable<ExecutionRun["verificationStatus"]>) {
  switch (status) {
    case "running":
      return { label: "Running", color: "#fbbf24" };
    case "passed":
      return { label: "Passed", color: "#86efac" };
    case "failed":
      return { label: "Failed", color: "#fda4af" };
    case "skipped":
      return { label: "Skipped", color: "#94a3b8" };
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
