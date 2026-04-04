"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getProjectContentChannelSummaries, getProjectRiskyContentChannels } from "@/lib/content-governance";
import { getAvailableWorkflowTemplates } from "@/lib/workflow-runtime";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
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
  const strategy = workflowRun.context.preferredContentChannel
    ? `, preferred channel: ${workflowRun.context.preferredContentChannel}, risky: ${workflowRun.context.riskyContentChannels?.join("/") || "none"}, manual gate: ${workflowRun.context.manualApprovalRequired ? "yes" : "no"}`
    : "";
  return `Desk refs: ${workflowRun.context.deskRefs}, desk notes: ${workflowRun.context.deskNotes}, context packs: ${workflowRun.context.contextPacks}, plugins: ${workflowRun.context.plugins}${strategy}`;
}

function buildWorkflowDraft(title: string, contextLine: string, brief: string) {
  return `Workflow: ${title}\n${contextLine}\n\n${brief}`;
}

function summarizeWorkflowDraft(draft: string) {
  return draft
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ")
    .slice(0, 220);
}

function openApprovalQueue(setActiveControlCenterSection: (section: "remote") => void, setTab: (tab: "settings") => void) {
  setActiveControlCenterSection("remote");
  setTab("settings");
}

function getContentApprovalPresentation(
  taskStatus: "draft" | "review" | "scheduled" | "published" | "archived",
  approvalState?: "pending" | "approved" | "rejected",
) {
  if (approvalState === "approved") {
    return {
      label: "已批准",
      color: "#22c55e",
      note: taskStatus === "scheduled" ? "审批已通过，可继续发布准备或进入外发。" : "审批已通过，可继续推进当前内容流程。",
    };
  }

  if (approvalState === "rejected") {
    return {
      label: "已驳回",
      color: "#ef4444",
      note: taskStatus === "scheduled" ? "审批已驳回，建议退回定稿或调整渠道策略后再提交。" : "审批已驳回，建议继续打磨内容后重新提交。",
    };
  }

  if (approvalState === "pending") {
    return {
      label: "待审批",
      color: "#f59e0b",
      note: taskStatus === "scheduled" ? "当前发布前需要人工确认，审批通过后才能继续外发。" : "当前流程需要人工确认后再继续推进。",
    };
  }

  if (taskStatus === "review" || taskStatus === "scheduled") {
    return {
      label: "需审批",
      color: "#f59e0b",
      note: taskStatus === "scheduled" ? "当前阶段通常需要审批，建议先进入审批队列。" : "当前处于审校阶段，建议先进入审批队列确认。",
    };
  }

  return null;
}

function getWorkflowBusinessStageCopy(
  workflowRun: Pick<WorkflowRun, "status" | "templateId" | "summary" | "context">,
  approvalPresentation: ReturnType<typeof getContentApprovalPresentation>,
) {
  if (approvalPresentation?.label === "已批准") {
    return workflowRun.templateId === "content-publish-prep"
      ? "业务阶段: 审批已通过，可继续发布准备或进入外发。"
      : "业务阶段: 审批已通过，可继续推进当前内容流程。";
  }

  if (approvalPresentation?.label === "已驳回") {
    return workflowRun.templateId === "content-publish-prep"
      ? "业务阶段: 审批已驳回，建议退回定稿并重新确认发布策略。"
      : "业务阶段: 审批已驳回，建议继续打磨后再提交。";
  }

  if (approvalPresentation?.label === "待审批" || approvalPresentation?.label === "需审批") {
    return workflowRun.templateId === "content-publish-prep"
      ? "业务阶段: 发布前待人工确认，当前不建议直接外发。"
      : "业务阶段: 当前内容流待人工确认后再继续推进。";
  }

  if (workflowRun.context.manualApprovalRequired) {
    return "业务阶段: 当前流程存在人工 gate，推进前请先检查审批状态。";
  }

  return workflowRun.summary;
}

type WorkflowApprovalDecision = "approved" | "rejected" | "pending";

type WorkflowActionFeedback = {
  tone: string;
  message: string;
};

function getWorkflowApprovalTone(decision: WorkflowApprovalDecision) {
  if (decision === "approved") return "#22c55e";
  if (decision === "rejected") return "#ef4444";
  return "#f59e0b";
}

export function WorkflowCenter() {
  const contentTaskRefs = useRef<Record<string, HTMLElement | null>>({});
  const workflowRunRefs = useRef<Record<string, HTMLElement | null>>({});
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setTab = useStore(s => s.setTab);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const applyContentTaskApprovalDecision = useStore(s => s.applyContentTaskApprovalDecision);
  const focusedBusinessContentTaskId = useStore(s => s.focusedBusinessContentTaskId);
  const focusedWorkflowRunId = useStore(s => s.focusedWorkflowRunId);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const focusWorkflowRun = useStore(s => s.focusWorkflowRun);
  const queueWorkflowRun = useStore(s => s.queueWorkflowRun);
  const queueContentTaskWorkflowRun = useStore(s => s.queueContentTaskWorkflowRun);
  const restageWorkflowRun = useStore(s => s.restageWorkflowRun);
  const startWorkflowRun = useStore(s => s.startWorkflowRun);
  const completeWorkflowRun = useStore(s => s.completeWorkflowRun);
  const archiveWorkflowRun = useStore(s => s.archiveWorkflowRun);
  const removeWorkflowRun = useStore(s => s.removeWorkflowRun);
  const recordBusinessOperation = useStore(s => s.recordBusinessOperation);
  const businessApprovals = useStore(s => s.businessApprovals);
  const workflowRuns = useStore(s => s.workflowRuns);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const workspacePinnedPreviews = useStore(s => s.workspacePinnedPreviews);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const enabledPluginIds = useStore(s => s.enabledPluginIds);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const [workflowActionFeedback, setWorkflowActionFeedback] = useState<Record<string, WorkflowActionFeedback>>({});
  const [highlightedContentTaskId, setHighlightedContentTaskId] = useState<string | null>(null);
  const [highlightedWorkflowRunId, setHighlightedWorkflowRunId] = useState<string | null>(null);

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
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const contentTaskMap = useMemo(
    () => new Map(scopedContentTasks.map(task => [task.id, task] as const)),
    [scopedContentTasks],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, activeSession ?? {}),
    [activeSession, businessApprovals],
  );
  const contentApprovalMap = useMemo(
    () =>
      new Map(
        scopedApprovals
          .filter(item => item.entityType === "contentTask")
          .map(item => [item.entityId, item.status] as const),
      ),
    [scopedApprovals],
  );
  const projectChannelBoard = useMemo(
    () => getProjectContentChannelSummaries(scopedContentTasks),
    [scopedContentTasks],
  );
  const projectRiskyChannels = useMemo(
    () => getProjectRiskyContentChannels(scopedContentTasks),
    [scopedContentTasks],
  );
  const preferredContentChannel = projectChannelBoard[0]?.channel;

  const workflowContext = useMemo(
    () => ({
      deskRefs: workspacePinnedPreviews.length,
      deskNotes: scopedDeskNotes.length,
      contextPacks: scopedSavedBundles.length,
      plugins: enabledPluginIds.length,
      preferredContentChannel,
      riskyContentChannels: projectRiskyChannels,
      manualApprovalRequired: scopedContentTasks.some(task => {
        const approvalState = contentApprovalMap.get(task.id);
        return task.status === "review"
          || task.status === "scheduled"
          || approvalState === "pending"
          || task.riskyChannels.some(channel => projectRiskyChannels.includes(channel));
      }),
    }),
    [
      contentApprovalMap,
      enabledPluginIds.length,
      preferredContentChannel,
      projectRiskyChannels,
      scopedContentTasks,
      scopedDeskNotes.length,
      scopedSavedBundles.length,
      workspacePinnedPreviews.length,
    ],
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
  const contentTasksNeedingWorkflow = useMemo(
    () =>
      scopedContentTasks
        .filter(task => task.status !== "archived")
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 6),
    [scopedContentTasks],
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

  const focusContentTask = (contentTaskId: string) => {
    setHighlightedContentTaskId(contentTaskId);
    contentTaskRefs.current[contentTaskId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => {
      setHighlightedContentTaskId(current => (current === contentTaskId ? null : current));
    }, 2200);
  };

  const focusWorkflowCard = (workflowRunId: string) => {
    setHighlightedWorkflowRunId(workflowRunId);
    workflowRunRefs.current[workflowRunId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => {
      setHighlightedWorkflowRunId(current => (current === workflowRunId ? null : current));
    }, 2200);
  };

  useEffect(() => {
    if (!focusedBusinessContentTaskId) return;
    focusContentTask(focusedBusinessContentTaskId);
    focusBusinessContentTask(null);
  }, [focusBusinessContentTask, focusedBusinessContentTaskId]);

  useEffect(() => {
    if (!focusedWorkflowRunId) return;
    focusWorkflowCard(focusedWorkflowRunId);
    focusWorkflowRun(null);
  }, [focusWorkflowRun, focusedWorkflowRunId]);

  const launchRun = (workflowRun: WorkflowRun) => {
    const { ok, executionRunId } = sendExecutionDispatch({
      instruction: workflowRun.draft,
      source: "workflow",
      taskDescription: workflowRun.title,
      includeActiveProjectMemory: true,
      includeUserMessage: true,
      workflowRunId: workflowRun.id,
      entityType: workflowRun.entityType,
      entityId: workflowRun.entityId,
    });

    if (!ok) {
      if (workflowRun.entityType && workflowRun.entityId) {
        recordBusinessOperation({
          entityType: workflowRun.entityType,
          entityId: workflowRun.entityId,
          eventType: "dispatch",
          trigger: "manual",
          status: "blocked",
          title: workflowRun.title,
          detail: "Workflow launch 尝试进入执行链路，但当前发送未成功建立。",
          workflowRunId: workflowRun.id,
        });
      }
      injectWorkflowRun(workflowRun);
      return;
    }

    startWorkflowRun(workflowRun.id);
    setActiveExecutionRun(executionRunId);

    if (workflowRun.entityType && workflowRun.entityId) {
      recordBusinessOperation({
        entityType: workflowRun.entityType,
        entityId: workflowRun.entityId,
        eventType: "dispatch",
        trigger: "manual",
        status: "sent",
        title: workflowRun.title,
        detail: "Workflow launch 已进入执行链路。",
        executionRunId,
        workflowRunId: workflowRun.id,
      });
    }
  };

  const applyWorkflowApprovalDecision = (
    workflowRun: WorkflowRun,
    decision: WorkflowApprovalDecision,
  ) => {
    if (workflowRun.entityType !== "contentTask" || !workflowRun.entityId) return;

    const outcome = applyContentTaskApprovalDecision({
      contentTaskId: workflowRun.entityId,
      decision,
    });
    if (!outcome) return;

    setWorkflowActionFeedback(current => ({
      ...current,
      [workflowRun.id]: {
        tone: getWorkflowApprovalTone(decision),
        message: outcome.detail,
      },
    }));
    focusContentTask(workflowRun.entityId);
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

      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Content Task Binding</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Queue a workflow directly from scoped content tasks so draft, review, and publish prep stay attached to the business entity.
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Scoped tasks {contentTasksNeedingWorkflow.length}{workflowContext.manualApprovalRequired ? " · 含需审批内容" : ""}
          </div>
        </div>

        {contentTasksNeedingWorkflow.length === 0 ? (
          <div style={{ ...emptyPanelStyle, marginTop: 14 }}>
            No content tasks in the current project scope yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {contentTasksNeedingWorkflow.map(task => (
              (() => {
                const approvalState = contentApprovalMap.get(task.id);
                const approvalPresentation = getContentApprovalPresentation(task.status, approvalState);
                const needsManualGate = Boolean(approvalPresentation);

                return (
                  <article
                    key={task.id}
                    ref={node => {
                      contentTaskRefs.current[task.id] = node;
                    }}
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: 14,
                      borderRadius: 18,
                      border: highlightedContentTaskId === task.id
                        ? "1px solid rgba(125, 211, 252, 0.52)"
                        : "1px solid rgba(192, 132, 252, 0.24)",
                      background: highlightedContentTaskId === task.id
                        ? "linear-gradient(180deg, rgba(125, 211, 252, 0.2), rgba(255,255,255,0.04) 72%)"
                        : "linear-gradient(180deg, rgba(192, 132, 252, 0.12), rgba(255,255,255,0.02) 72%)",
                      boxShadow: highlightedContentTaskId === task.id
                        ? "0 0 0 1px rgba(125, 211, 252, 0.12), 0 20px 50px rgba(15, 23, 42, 0.24)"
                        : undefined,
                    }}
                  >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{task.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {task.goal}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={badgeStyle("#c084fc")}>{task.status}</span>
                    {approvalPresentation ? <span style={badgeStyle(approvalPresentation.color)}>{approvalPresentation.label}</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span style={badgeStyle("#60a5fa")}>{task.format}</span>
                  <span style={badgeStyle("#7dd3fc")}>
                    {task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ") || "no targets"}
                  </span>
                  {task.lastWorkflowRunId ? <span style={badgeStyle("#a78bfa")}>linked workflow</span> : null}
                </div>
                {task.latestDraftSummary ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Latest draft: {task.latestDraftSummary}
                  </div>
                ) : null}
                {task.latestPostmortemSummary ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Latest postmortem: {task.latestPostmortemSummary}
                  </div>
                ) : null}
                {task.nextCycleRecommendation ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Next cycle: {task.nextCycleRecommendation}
                  </div>
                ) : null}
                {task.publishedResults.length > 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Publish results: {task.publishedResults.slice(0, 2).map(result =>
                      `${result.channel}:${result.accountLabel} · ${result.status}${result.externalId ? ` · ${result.externalId}` : ""}`,
                    ).join(" / ")}
                  </div>
                ) : null}
                {approvalPresentation ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    Approval: {approvalPresentation.note}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const workflowRunId = queueContentTaskWorkflowRun(task.id);
                      if (!workflowRunId) return;
                      setTab("tasks");
                    }}
                  >
                    {task.lastWorkflowRunId ? "Queue next workflow" : "Create workflow"}
                  </button>
                  {needsManualGate ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                    >
                      Go Approval Queue
                    </button>
                  ) : null}
                  {task.lastExecutionRunId ? (
                    <button type="button" className="btn-ghost" onClick={() => setTab("dashboard")}>
                      Review execution chain
                    </button>
                  ) : null}
                </div>
                  </article>
                );
              })()
            ))}
          </div>
        )}
      </section>

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
            {workflowContext.preferredContentChannel ? ` · channel ${workflowContext.preferredContentChannel}` : ""}
            {workflowContext.riskyContentChannels?.length ? ` · risky ${workflowContext.riskyContentChannels.join("/")}` : ""}
            {workflowContext.manualApprovalRequired ? " · approvals on" : ""}
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
              const linkedContentTask = workflowRun.entityType === "contentTask" && workflowRun.entityId
                ? contentTaskMap.get(workflowRun.entityId)
                : null;
              const approvalState = linkedContentTask ? contentApprovalMap.get(linkedContentTask.id) : undefined;
              const approvalPresentation = linkedContentTask
                ? getContentApprovalPresentation(linkedContentTask.status, approvalState)
                : null;
              const needsManualGate = Boolean(workflowRun.context.manualApprovalRequired || approvalPresentation);
              const businessStageCopy = getWorkflowBusinessStageCopy(workflowRun, approvalPresentation);

              return (
                <article
                  key={workflowRun.id}
                  ref={node => {
                    workflowRunRefs.current[workflowRun.id] = node;
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    border: highlightedWorkflowRunId === workflowRun.id
                      ? "1px solid rgba(125, 211, 252, 0.52)"
                      : `1px solid ${workflowRun.accent}44`,
                    background: highlightedWorkflowRunId === workflowRun.id
                      ? "linear-gradient(180deg, rgba(125, 211, 252, 0.2), rgba(255,255,255,0.04) 68%)"
                      : `linear-gradient(180deg, ${workflowRun.accent}18, rgba(255,255,255,0.02) 68%)`,
                    boxShadow: highlightedWorkflowRunId === workflowRun.id
                      ? "0 0 0 1px rgba(125, 211, 252, 0.12), 0 20px 50px rgba(15, 23, 42, 0.24)"
                      : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{workflowRun.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.75 }}>
                        {businessStageCopy}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span style={badgeStyle(tone.color)}>{tone.label}</span>
                      {approvalPresentation ? (
                        <span style={badgeStyle(approvalPresentation.color)}>{approvalPresentation.label}</span>
                      ) : needsManualGate ? (
                        <span style={badgeStyle("#f59e0b")}>发布前需审批</span>
                      ) : null}
                    </div>
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
                    {workflowRun.context.preferredContentChannel ? (
                      <WorkflowNote
                        label="Channel"
                        value={`${workflowRun.context.preferredContentChannel}${workflowRun.context.riskyContentChannels?.length ? ` · risk ${workflowRun.context.riskyContentChannels.join("/")}` : ""}${workflowRun.context.manualApprovalRequired ? " · gate" : ""}`}
                      />
                    ) : null}
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
                  {approvalPresentation ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                      Approval: {approvalPresentation.note}
                    </div>
                  ) : null}
                  {workflowActionFeedback[workflowRun.id] ? (
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.75,
                        color: workflowActionFeedback[workflowRun.id]!.tone,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${workflowActionFeedback[workflowRun.id]!.tone}33`,
                        background: `${workflowActionFeedback[workflowRun.id]!.tone}14`,
                      }}
                    >
                      {workflowActionFeedback[workflowRun.id]!.message}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => restageRun(workflowRun)}>
                      Re-Stage
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => launchRun(workflowRun)}>
                      Launch
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => completeWorkflowRun(workflowRun.id, { latestDraftSummary: summarizeWorkflowDraft(workflowRun.draft) })}
                    >
                      Complete
                    </button>
                    {approvalPresentation?.label !== "已批准" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "approved")}
                      >
                        {linkedContentTask.status === "scheduled" ? "批准并继续发布" : "批准并继续"}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.label !== "已驳回" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "rejected")}
                      >
                        {linkedContentTask.status === "scheduled" ? "驳回并退回定稿" : "驳回"}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.label !== "待审批" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "pending")}
                      >
                        重新打开审批
                      </button>
                    ) : null}
                    {needsManualGate ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                      >
                        Open Approvals
                      </button>
                    ) : null}
                    {linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => focusContentTask(linkedContentTask.id)}
                      >
                        定位到内容任务
                      </button>
                    ) : null}
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
              const linkedContentTask = workflowRun.entityType === "contentTask" && workflowRun.entityId
                ? contentTaskMap.get(workflowRun.entityId)
                : null;
              const approvalState = linkedContentTask ? contentApprovalMap.get(linkedContentTask.id) : undefined;
              const approvalPresentation = linkedContentTask
                ? getContentApprovalPresentation(linkedContentTask.status, approvalState)
                : null;
              const businessStageCopy = getWorkflowBusinessStageCopy(workflowRun, approvalPresentation);

              return (
                <article
                  key={workflowRun.id}
                  ref={node => {
                    workflowRunRefs.current[workflowRun.id] = node;
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 12,
                    borderRadius: 16,
                    border: highlightedWorkflowRunId === workflowRun.id
                      ? "1px solid rgba(125, 211, 252, 0.52)"
                      : "1px solid var(--border)",
                    background: highlightedWorkflowRunId === workflowRun.id
                      ? "linear-gradient(180deg, rgba(125, 211, 252, 0.18), rgba(255,255,255,0.04))"
                      : "rgba(255,255,255,0.025)",
                    boxShadow: highlightedWorkflowRunId === workflowRun.id
                      ? "0 0 0 1px rgba(125, 211, 252, 0.12), 0 20px 50px rgba(15, 23, 42, 0.24)"
                      : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{workflowRun.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        {formatTimestamp(workflowRun.updatedAt)} · launched {workflowRun.launchCount} time(s)
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span style={badgeStyle(tone.color)}>{tone.label}</span>
                      {approvalPresentation ? <span style={badgeStyle(approvalPresentation.color)}>{approvalPresentation.label}</span> : null}
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                    {businessStageCopy}
                  </div>
                  {approvalPresentation ? (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                      Approval: {approvalPresentation.note}
                    </div>
                  ) : null}
                  {workflowActionFeedback[workflowRun.id] ? (
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.75,
                        color: workflowActionFeedback[workflowRun.id]!.tone,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${workflowActionFeedback[workflowRun.id]!.tone}33`,
                        background: `${workflowActionFeedback[workflowRun.id]!.tone}14`,
                      }}
                    >
                      {workflowActionFeedback[workflowRun.id]!.message}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => restageRun(workflowRun)}>
                      Reuse
                    </button>
                    {approvalPresentation?.label !== "已批准" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "approved")}
                      >
                        {linkedContentTask.status === "scheduled" ? "批准并继续发布" : "批准并继续"}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.label !== "已驳回" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "rejected")}
                      >
                        {linkedContentTask.status === "scheduled" ? "驳回并退回定稿" : "驳回"}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.label !== "待审批" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "pending")}
                      >
                        重新打开审批
                      </button>
                    ) : null}
                    {approvalPresentation ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                      >
                        Open Approvals
                      </button>
                    ) : null}
                    {linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => focusContentTask(linkedContentTask.id)}
                      >
                        定位到内容任务
                      </button>
                    ) : null}
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
