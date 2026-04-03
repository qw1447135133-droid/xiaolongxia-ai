"use client";

import { useMemo, type CSSProperties } from "react";
import { getAvailableWorkflowTemplates } from "@/lib/workflow-runtime";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { WorkflowRun } from "@/types/workflows";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function statusTone(status: WorkflowRun["status"]) {
  switch (status) {
    case "queued":
      return { label: "Queued", color: "#7dd3fc" };
    case "staged":
      return { label: "Staged", color: "#c4b5fd" };
    case "in-progress":
      return { label: "In Progress", color: "#fbbf24" };
    case "completed":
      return { label: "Completed", color: "#86efac" };
    case "archived":
      return { label: "Archived", color: "#94a3b8" };
    default:
      return { label: status, color: "var(--text-muted)" };
  }
}

function buildContextLine(workflowRun: Pick<WorkflowRun, "context">) {
  return `Desk refs: ${workflowRun.context.deskRefs}, desk notes: ${workflowRun.context.deskNotes}, context packs: ${workflowRun.context.contextPacks}, plugins: ${workflowRun.context.plugins}`;
}

function buildWorkflowDraft(title: string, contextLine: string, brief: string) {
  return `Workflow: ${title}\n${contextLine}\n\n${brief}`;
}

export function WorkflowCenter() {
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setTab = useStore(s => s.setTab);
  const queueWorkflowRun = useStore(s => s.queueWorkflowRun);
  const restageWorkflowRun = useStore(s => s.restageWorkflowRun);
  const startWorkflowRun = useStore(s => s.startWorkflowRun);
  const completeWorkflowRun = useStore(s => s.completeWorkflowRun);
  const archiveWorkflowRun = useStore(s => s.archiveWorkflowRun);
  const removeWorkflowRun = useStore(s => s.removeWorkflowRun);
  const workflowRuns = useStore(s => s.workflowRuns);
  const workspacePinnedPreviews = useStore(s => s.workspacePinnedPreviews);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const enabledPluginIds = useStore(s => s.enabledPluginIds);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, activeSession ?? {}),
    [activeSession, workspaceDeskNotes],
  );

  const scopedSavedBundles = useMemo(
    () => filterByProjectScope(workspaceSavedBundles, activeSession ?? {}),
    [activeSession, workspaceSavedBundles],
  );

  const workflowContext = useMemo(
    () => ({
      deskRefs: workspacePinnedPreviews.length,
      deskNotes: scopedDeskNotes.length,
      contextPacks: scopedSavedBundles.length,
      plugins: enabledPluginIds.length,
    }),
    [enabledPluginIds.length, scopedDeskNotes.length, scopedSavedBundles.length, workspacePinnedPreviews.length],
  );

  const workflowTemplates = useMemo(
    () => getAvailableWorkflowTemplates(enabledPluginIds),
    [enabledPluginIds],
  );
  const activeTemplate = activeTeamOperatingTemplateId
    ? getTeamOperatingTemplate(activeTeamOperatingTemplateId)
    : null;
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;
  const recommendedTemplateIds = activeSurface?.recommendedWorkflowTemplateIds ?? [];
  const sortedWorkflowTemplates = useMemo(() => {
    if (recommendedTemplateIds.length === 0) return workflowTemplates;
    const recommended = workflowTemplates.filter(template => recommendedTemplateIds.includes(template.id));
    const rest = workflowTemplates.filter(template => !recommendedTemplateIds.includes(template.id));
    return [...recommended, ...rest];
  }, [recommendedTemplateIds, workflowTemplates]);
  const recommendedTemplates = useMemo(
    () => sortedWorkflowTemplates.filter(template => recommendedTemplateIds.includes(template.id)),
    [recommendedTemplateIds, sortedWorkflowTemplates],
  );

  const activeRuns = useMemo(
    () =>
      workflowRuns
        .filter(run => ["queued", "staged", "in-progress"].includes(run.status))
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [workflowRuns],
  );

  const historyRuns = useMemo(
    () =>
      workflowRuns
        .filter(run => ["completed", "archived"].includes(run.status))
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 8),
    [workflowRuns],
  );

  const metrics = useMemo(
    () => ({
      queued: workflowRuns.filter(run => run.status === "queued").length,
      active: workflowRuns.filter(run => run.status === "in-progress").length,
      completed: workflowRuns.filter(run => run.status === "completed").length,
      launches: workflowRuns.reduce((total, run) => total + run.launchCount, 0),
    }),
    [workflowRuns],
  );

  const stageTemplate = (template: (typeof workflowTemplates)[number]) => {
    const contextLine = buildContextLine({ context: workflowContext });
    setCommandDraft(buildWorkflowDraft(template.title, contextLine, template.brief));
    setTab(template.nextTab);
  };

  const queueTemplate = (template: (typeof workflowTemplates)[number]) => {
    const contextLine = buildContextLine({ context: workflowContext });

    queueWorkflowRun({
      templateId: template.id,
      title: template.title,
      summary: template.summary,
      nextTab: template.nextTab,
      brief: template.brief,
      draft: buildWorkflowDraft(template.title, contextLine, template.brief),
      accent: template.accent,
      steps: template.steps,
      context: workflowContext,
      source: template.source,
      pluginId: template.pluginId,
      pluginName: template.pluginName,
    });
  };

  const injectWorkflowRun = (workflowRun: WorkflowRun) => {
    setCommandDraft(workflowRun.draft);
    setTab(workflowRun.nextTab);
  };

  const restageRun = (workflowRun: WorkflowRun) => {
    restageWorkflowRun(workflowRun.id);
    injectWorkflowRun(workflowRun);
  };

  const launchRun = (workflowRun: WorkflowRun) => {
    startWorkflowRun(workflowRun.id);
    injectWorkflowRun(workflowRun);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(125, 211, 252, 0.14), rgba(255,255,255,0.02))",
          borderColor: "rgba(125, 211, 252, 0.22)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Workflow Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Prebuilt workbench flows with a real queue, launch surface, and recent history
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          The shell now tracks workflow runs instead of only showing templates. Core flows and plugin-aware flows can both be queued, re-staged into the composer, and kept in a lightweight execution history.
        </div>
        {activeTemplate && activeSurface ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 16,
              border: "1px solid rgba(125, 211, 252, 0.18)",
              background: "rgba(6, 12, 24, 0.24)",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                当前模式推荐 · {activeTemplate.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                推荐模板 {recommendedTemplateIds.length} 个
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {activeSurface.statusCopy}
            </div>
            {recommendedTemplates.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "8px 14px" }}
                  onClick={() => queueTemplate(recommendedTemplates[0]!)}
                >
                  一键排队推荐流程
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "8px 14px" }}
                  onClick={() => stageTemplate(recommendedTemplates[0]!)}
                >
                  暂存到聊天输入框
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <WorkflowMetric label="Queued" value={metrics.queued} accent="#7dd3fc" />
        <WorkflowMetric label="In Progress" value={metrics.active} accent="#fbbf24" />
        <WorkflowMetric label="Completed" value={metrics.completed} accent="#86efac" />
        <WorkflowMetric label="Launches" value={metrics.launches} accent="#c4b5fd" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {sortedWorkflowTemplates.map(template => {
          const recommended = recommendedTemplateIds.includes(template.id);
          return (
          <article
            key={template.id}
            className="card"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              borderColor: recommended ? "rgba(var(--accent-rgb), 0.28)" : `${template.accent}55`,
              background: recommended
                ? `linear-gradient(180deg, rgba(var(--accent-rgb), 0.14), rgba(255,255,255,0.02) 58%)`
                : `linear-gradient(180deg, ${template.accent}18, rgba(255,255,255,0.02) 58%)`,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{template.title}</div>
                {recommended && (
                  <span style={badgeStyle("var(--accent)")}>
                    当前模式推荐
                  </span>
                )}
                <span style={badgeStyle(template.source === "plugin" ? "#fda4af" : "#7dd3fc")}>
                  {template.source === "plugin" ? (template.pluginName ?? "Plugin Flow") : "Core Flow"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.75 }}>
                {template.summary}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {template.steps.map(step => (
                <span
                  key={`${template.id}-${step}`}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    fontSize: 11,
                  }}
                >
                    {step}
                  </span>
                ))}
              </div>

            {template.pluginName && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Powered by {template.pluginName}
              </div>
            )}

            <div
              style={{
                fontSize: 12,
                lineHeight: 1.75,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "rgba(8, 12, 20, 0.35)",
              }}
            >
              {template.brief}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
              <button type="button" className="btn-ghost" onClick={() => stageTemplate(template)}>
                Stage Brief
              </button>
              <button type="button" className="btn-ghost" onClick={() => queueTemplate(template)}>
                Queue Run
              </button>
            </div>
          </article>
        )})}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.95fr)", gap: 12 }}>
        <section className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Execution Queue</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Runs waiting to be staged, launched, or completed from the desktop shell.
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Project {activeSession ? getSessionProjectLabel(activeSession) : "General"} · refs {workflowContext.deskRefs} · notes {workflowContext.deskNotes} · packs {workflowContext.contextPacks} · plugins {workflowContext.plugins}
            </div>
          </div>

          {activeRuns.length === 0 && (
            <div style={emptyPanelStyle}>
              No queued workflows yet. Use a template above to start building a reusable execution queue.
            </div>
          )}

          <div style={{ display: "grid", gap: 12, marginTop: activeRuns.length > 0 ? 14 : 0 }}>
            {activeRuns.map(workflowRun => {
              const tone = statusTone(workflowRun.status);

              return (
                <article
                  key={workflowRun.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    border: `1px solid ${workflowRun.accent}44`,
                    background: `linear-gradient(180deg, ${workflowRun.accent}18, rgba(255,255,255,0.02) 68%)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{workflowRun.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.75 }}>
                        {workflowRun.summary}
                      </div>
                    </div>
                    <span style={badgeStyle(tone.color)}>{tone.label}</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {workflowRun.steps.map(step => (
                      <span
                        key={`${workflowRun.id}-${step}`}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: 11,
                        }}
                      >
                        {step}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                    <WorkflowNote label="Created" value={formatTimestamp(workflowRun.createdAt)} />
                    <WorkflowNote label="Updated" value={formatTimestamp(workflowRun.updatedAt)} />
                    <WorkflowNote label="Launches" value={String(workflowRun.launchCount)} />
                    <WorkflowNote label="Context" value={`${workflowRun.context.deskRefs}/${workflowRun.context.deskNotes}/${workflowRun.context.contextPacks}/${workflowRun.context.plugins}`} />
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.75,
                      color: "var(--text)",
                      whiteSpace: "pre-wrap",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(8, 12, 20, 0.35)",
                    }}
                  >
                    {workflowRun.brief}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => restageRun(workflowRun)}>
                      Re-Stage
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => launchRun(workflowRun)}>
                      Launch
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => completeWorkflowRun(workflowRun.id)}>
                      Complete
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => removeWorkflowRun(workflowRun.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Recent History</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Completed flows stay visible so the shell feels like a control surface, not a one-shot launcher.
          </div>

          {historyRuns.length === 0 && (
            <div style={{ ...emptyPanelStyle, marginTop: 14 }}>
              No completed workflow runs yet.
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: historyRuns.length > 0 ? 14 : 0 }}>
            {historyRuns.map(workflowRun => {
              const tone = statusTone(workflowRun.status);

              return (
                <article
                  key={workflowRun.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 12,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{workflowRun.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        {formatTimestamp(workflowRun.updatedAt)} · launched {workflowRun.launchCount} time(s)
                      </div>
                    </div>
                    <span style={badgeStyle(tone.color)}>{tone.label}</span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                    {workflowRun.summary}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => restageRun(workflowRun)}>
                      Reuse
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => archiveWorkflowRun(workflowRun.id)}>
                      Archive
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => removeWorkflowRun(workflowRun.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkflowMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

function WorkflowNote({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: 10,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <strong style={{ fontSize: 12 }}>{value}</strong>
    </div>
  );
}

function badgeStyle(color: string) {
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

const emptyPanelStyle = {
  padding: 16,
  borderRadius: 16,
  border: "1px dashed var(--border)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--text-muted)",
  fontSize: 12,
  lineHeight: 1.75,
} satisfies CSSProperties;
