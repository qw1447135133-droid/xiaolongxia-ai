"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";

type HermesAvailability = Record<string, { command: string; available: boolean }>;

type HermesDispatchTask = {
  id: string;
  title: string;
  executor: "codex" | "claude" | "gemini";
  objective: string;
  workdir: string;
  dependsOn: string[];
};

type HermesDispatchPlan = {
  summary: string;
  tasks: HermesDispatchTask[];
};

type HermesDispatchRun = {
  id: string;
  instruction: string;
  mode: "execute" | "plan-only";
  planner: "hermes" | "sample";
  status: "queued" | "running" | "completed" | "failed" | "planned";
  createdAt: number;
  updatedAt: number;
  outputDir?: string;
  exitCode?: number | null;
  plan?: HermesDispatchPlan | null;
  summary?: {
    completed?: number;
    failed?: number;
    runDir?: string;
  } | null;
  results?: Array<Record<string, unknown>>;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string | null;
};

type HermesDispatchStatusResponse = {
  ok: boolean;
  availability: HermesAvailability;
  runs: HermesDispatchRun[];
  prototypePath: string;
};

type HermesDispatchLaunchResponse = {
  ok: boolean;
  run: HermesDispatchRun;
};

const RUN_STATUS_TONE: Record<HermesDispatchRun["status"], { label: string; color: string }> = {
  queued: { label: "Queued", color: "#94a3b8" },
  running: { label: "Running", color: "#fbbf24" },
  completed: { label: "Completed", color: "#86efac" },
  failed: { label: "Failed", color: "#fda4af" },
  planned: { label: "Planned", color: "#7dd3fc" },
};

function formatTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function badgeStyle(color: string): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}18`,
    color,
    fontSize: 10,
    fontWeight: 700,
  };
}

export function HermesDispatchCenter() {
  const [instruction, setInstruction] = useState("");
  const [availability, setAvailability] = useState<HermesAvailability>({});
  const [runs, setRuns] = useState<HermesDispatchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [prototypePath, setPrototypePath] = useState("");
  const [submittingMode, setSubmittingMode] = useState<"execute" | "plan-only" | "sample" | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const loadStatus = async () => {
    const url = await resolveBackendUrl("/api/hermes-dispatch/status");
    const response = await fetch(url, { method: "GET" });
    const payload = await response.json() as HermesDispatchStatusResponse;
    if (!payload.ok) {
      throw new Error("无法读取 Hermes dispatch 状态。");
    }

    setAvailability(payload.availability);
    setRuns(payload.runs);
    setPrototypePath(payload.prototypePath);
    setSelectedRunId(current => current ?? payload.runs[0]?.id ?? null);
  };

  useEffect(() => {
    void loadStatus().catch(error => {
      setRequestError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  useEffect(() => {
    const hasActiveRun = runs.some(run => run.status === "queued" || run.status === "running");
    const interval = window.setInterval(() => {
      void loadStatus().catch(() => {});
    }, hasActiveRun ? 2500 : 10000);

    return () => window.clearInterval(interval);
  }, [runs]);

  const selectedRun = useMemo(
    () => runs.find(run => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const commandList = useMemo(
    () => Object.entries(availability),
    [availability],
  );

  const missingCommands = commandList.filter(([, item]) => !item.available).map(([name]) => name);
  const hermesReady = availability.hermes?.available ?? false;

  const submitRun = async (mode: "execute" | "plan-only" | "sample") => {
    const trimmed = instruction.trim();
    if (!trimmed && mode !== "sample") {
      setRequestError("先输入一条任务指令。");
      return;
    }

    setSubmittingMode(mode);
    setRequestError(null);

    try {
      const url = await resolveBackendUrl("/api/hermes-dispatch/run");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          planOnly: mode === "plan-only",
          useSamplePlan: mode === "sample",
        }),
      });
      const payload = await response.json() as HermesDispatchLaunchResponse & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "启动 Hermes dispatch 失败。");
      }
      setSelectedRunId(payload.run.id);
      await loadStatus();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingMode(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        className="card"
        style={{
          padding: 18,
          borderColor: "rgba(96, 165, 250, 0.26)",
          background: "linear-gradient(135deg, rgba(96, 165, 250, 0.14), rgba(255,255,255,0.03))",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Hermes Dispatch
        </div>
        <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>
          侧栏直达的 Hermes 控制面板
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
          这里直接拉起 {"`Hermes -> Codex / Claude / Gemini`"} 原型。你不需要手动敲脚本，面板会调用本地 dispatcher，并把计划、运行状态、stdout、stderr 和结果统一展示出来。
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>
          Prototype: {prototypePath || "loading..."}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(300px, 0.8fr)", gap: 16 }}>
        <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Launch</div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700 }}>新建一个 dispatch run</div>
            </div>
            <span style={badgeStyle(hermesReady ? "#86efac" : "#fda4af")}>
              {hermesReady ? "Hermes ready" : "Hermes missing"}
            </span>
          </div>

          <textarea
            className="input"
            style={{ minHeight: 140, resize: "vertical" }}
            placeholder="例如：为当前仓库做一个多代理调度 MVP，并把实现、review、风险总结分别派给 Codex / Claude / Gemini。"
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void submitRun("execute")}
              disabled={submittingMode !== null || !hermesReady}
            >
              {submittingMode === "execute" ? "启动中..." : "Hermes 执行 Dispatch"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void submitRun("plan-only")}
              disabled={submittingMode !== null || !hermesReady}
            >
              {submittingMode === "plan-only" ? "生成中..." : "只生成计划"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void submitRun("sample")}
              disabled={submittingMode !== null}
            >
              {submittingMode === "sample" ? "演示中..." : "样例计划演示"}
            </button>
          </div>

          {requestError ? (
            <div style={warningCardStyle("#fda4af")}>{requestError}</div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Environment</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {commandList.map(([name, item]) => (
                <span key={name} style={badgeStyle(item.available ? "#86efac" : "#fbbf24")}>
                  {name}: {item.available ? "ready" : "missing"}
                </span>
              ))}
            </div>
            {missingCommands.length > 0 ? (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
                当前缺失: {missingCommands.join(", ")}。缺 `hermes` 时，面板仍可用样例计划演示 UI 流程，但不能跑真实 Hermes 规划。
              </div>
            ) : null}
          </div>
        </section>

        <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Recent Runs</div>
          {runs.length === 0 ? (
            <div style={emptyPanelStyle}>还没有 Hermes dispatch run。点击左侧按钮就会在这里生成记录。</div>
          ) : (
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto" }}>
              {runs.map(run => {
                const tone = RUN_STATUS_TONE[run.status];
                const isActive = run.id === selectedRunId;
                return (
                  <button
                    key={run.id}
                    type="button"
                    className="card"
                    onClick={() => setSelectedRunId(run.id)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      display: "grid",
                      gap: 8,
                      borderColor: isActive ? `${tone.color}55` : "var(--border)",
                      background: isActive ? `${tone.color}12` : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ fontSize: 13 }}>{run.instruction || "样例计划演示"}</strong>
                      <span style={badgeStyle(tone.color)}>{tone.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {formatTime(run.createdAt)} · {run.mode} · {run.planner}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {run.plan?.tasks?.length ?? 0} tasks
                      {typeof run.summary?.failed === "number"
                        ? ` · 完成 ${run.summary?.completed ?? 0} / 失败 ${run.summary.failed}`
                        : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Run Detail</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>
              {selectedRun?.instruction || "还没有选中的 run"}
            </div>
          </div>
          {selectedRun ? (
            <span style={badgeStyle(RUN_STATUS_TONE[selectedRun.status].color)}>
              {RUN_STATUS_TONE[selectedRun.status].label}
            </span>
          ) : null}
        </div>

        {!selectedRun ? (
          <div style={emptyPanelStyle}>选中一条 run 后，这里会显示计划、输出和错误信息。</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <TraceStat label="Run ID" value={selectedRun.id} />
              <TraceStat label="Planner" value={selectedRun.planner} />
              <TraceStat label="Mode" value={selectedRun.mode} />
              <TraceStat label="Updated" value={formatTime(selectedRun.updatedAt)} />
            </div>

            {selectedRun.error ? (
              <div style={warningCardStyle("#fda4af")}>{selectedRun.error}</div>
            ) : null}

            {selectedRun.plan ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Dispatch Plan</div>
                {selectedRun.plan.summary ? (
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>{selectedRun.plan.summary}</div>
                ) : null}
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedRun.plan.tasks.map(task => (
                    <div
                      key={task.id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <strong style={{ fontSize: 13 }}>{task.title}</strong>
                        <span style={badgeStyle(task.executor === "codex" ? "#7dd3fc" : task.executor === "claude" ? "#fbbf24" : "#c4b5fd")}>
                          {task.executor}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {task.id} · {task.workdir}
                        {task.dependsOn.length > 0 ? ` · depends on ${task.dependsOn.join(", ")}` : ""}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{task.objective}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <LogPanel title="stdout tail" value={selectedRun.stdoutTail || "暂无输出"} />
              <LogPanel title="stderr tail" value={selectedRun.stderrTail || "暂无错误输出"} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TraceStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <strong style={{ fontSize: 12, wordBreak: "break-word" }}>{value}</strong>
    </div>
  );
}

function LogPanel({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{title}</div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function warningCardStyle(color: string): CSSProperties {
  return {
    padding: 12,
    borderRadius: 14,
    border: `1px solid ${color}44`,
    background: `${color}12`,
    color: "var(--text)",
    fontSize: 12,
    lineHeight: 1.7,
  };
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
