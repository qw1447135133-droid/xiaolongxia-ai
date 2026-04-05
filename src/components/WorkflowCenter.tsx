"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getProjectContentChannelSummaries, getProjectRiskyContentChannels } from "@/lib/content-governance";
import { getAvailableWorkflowTemplates } from "@/lib/workflow-runtime";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES, type UiLocale } from "@/store/types";
import type { WorkflowRun } from "@/types/workflows";

function formatTimestamp(timestamp: number, locale: UiLocale) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function statusTone(status: WorkflowRun["status"], locale: UiLocale) {
  switch (status) {
    case "queued":
      return { label: pickLocaleText(locale, { "zh-CN": "排队中", "zh-TW": "排隊中", en: "Queued", ja: "キュー中" }), color: "#7dd3fc" };
    case "staged":
      return { label: pickLocaleText(locale, { "zh-CN": "已暂存", "zh-TW": "已暫存", en: "Staged", ja: "ステージ済み" }), color: "#c4b5fd" };
    case "in-progress":
      return { label: pickLocaleText(locale, { "zh-CN": "执行中", "zh-TW": "執行中", en: "In Progress", ja: "進行中" }), color: "#fbbf24" };
    case "completed":
      return { label: pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" }), color: "#86efac" };
    case "archived":
      return { label: pickLocaleText(locale, { "zh-CN": "已归档", "zh-TW": "已歸檔", en: "Archived", ja: "アーカイブ済み" }), color: "#94a3b8" };
    default:
      return { label: status, color: "var(--text-muted)" };
  }
}

function buildContextLine(workflowRun: Pick<WorkflowRun, "context">, locale: UiLocale) {
  const strategy = workflowRun.context.preferredContentChannel
    ? pickLocaleText(locale, {
      "zh-CN": `，优先渠道：${workflowRun.context.preferredContentChannel}，高风险：${workflowRun.context.riskyContentChannels?.join("/") || "无"}，人工闸门：${workflowRun.context.manualApprovalRequired ? "是" : "否"}`,
      "zh-TW": `，優先渠道：${workflowRun.context.preferredContentChannel}，高風險：${workflowRun.context.riskyContentChannels?.join("/") || "無"}，人工閘門：${workflowRun.context.manualApprovalRequired ? "是" : "否"}`,
      en: `, preferred channel: ${workflowRun.context.preferredContentChannel}, risky: ${workflowRun.context.riskyContentChannels?.join("/") || "none"}, manual gate: ${workflowRun.context.manualApprovalRequired ? "yes" : "no"}`,
      ja: `、優先チャネル: ${workflowRun.context.preferredContentChannel}、高リスク: ${workflowRun.context.riskyContentChannels?.join("/") || "なし"}、手動ゲート: ${workflowRun.context.manualApprovalRequired ? "あり" : "なし"}`,
    })
    : "";
  return pickLocaleText(locale, {
    "zh-CN": `工作台引用：${workflowRun.context.deskRefs}，Desk Notes：${workflowRun.context.deskNotes}，上下文包：${workflowRun.context.contextPacks}，插件：${workflowRun.context.plugins}${strategy}`,
    "zh-TW": `工作台引用：${workflowRun.context.deskRefs}，Desk Notes：${workflowRun.context.deskNotes}，上下文包：${workflowRun.context.contextPacks}，外掛：${workflowRun.context.plugins}${strategy}`,
    en: `Desk refs: ${workflowRun.context.deskRefs}, desk notes: ${workflowRun.context.deskNotes}, context packs: ${workflowRun.context.contextPacks}, plugins: ${workflowRun.context.plugins}${strategy}`,
    ja: `Desk 参照: ${workflowRun.context.deskRefs}、Desk Notes: ${workflowRun.context.deskNotes}、コンテキストパック: ${workflowRun.context.contextPacks}、プラグイン: ${workflowRun.context.plugins}${strategy}`,
  });
}

function buildWorkflowDraft(title: string, contextLine: string, brief: string, locale: UiLocale) {
  return `${pickLocaleText(locale, { "zh-CN": "工作流", "zh-TW": "工作流", en: "Workflow", ja: "ワークフロー" })}: ${title}\n${contextLine}\n\n${brief}`;
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
  locale?: UiLocale,
) {
  const resolvedLocale = locale ?? "zh-CN";
  if (approvalState === "approved") {
    return {
      state: "approved" as const,
      label: pickLocaleText(resolvedLocale, { "zh-CN": "已批准", "zh-TW": "已批准", en: "Approved", ja: "承認済み" }),
      color: "#22c55e",
      note: taskStatus === "scheduled"
        ? pickLocaleText(resolvedLocale, {
          "zh-CN": "审批已通过，可继续发布准备或进入外发。",
          "zh-TW": "審批已通過，可繼續發布準備或進入外發。",
          en: "Approval passed. You can continue publish prep or move into delivery.",
          ja: "承認済みです。公開準備または配信へ進めます。",
        })
        : pickLocaleText(resolvedLocale, {
          "zh-CN": "审批已通过，可继续推进当前内容流程。",
          "zh-TW": "審批已通過，可繼續推進目前內容流程。",
          en: "Approval passed. You can continue the current content workflow.",
          ja: "承認済みです。現在のコンテンツフローを続行できます。",
        }),
    };
  }

  if (approvalState === "rejected") {
    return {
      state: "rejected" as const,
      label: pickLocaleText(resolvedLocale, { "zh-CN": "已驳回", "zh-TW": "已駁回", en: "Rejected", ja: "却下済み" }),
      color: "#ef4444",
      note: taskStatus === "scheduled"
        ? pickLocaleText(resolvedLocale, {
          "zh-CN": "审批已驳回，建议退回定稿或调整渠道策略后再提交。",
          "zh-TW": "審批已駁回，建議退回定稿或調整渠道策略後再提交。",
          en: "Approval was rejected. Move back to final editing or adjust channel strategy before resubmitting.",
          ja: "承認が却下されました。再提出前に原稿へ戻すかチャネル戦略を見直してください。",
        })
        : pickLocaleText(resolvedLocale, {
          "zh-CN": "审批已驳回，建议继续打磨内容后重新提交。",
          "zh-TW": "審批已駁回，建議繼續打磨內容後重新提交。",
          en: "Approval was rejected. Refine the content and resubmit.",
          ja: "承認が却下されました。内容を磨き直して再提出してください。",
        }),
    };
  }

  if (approvalState === "pending") {
    return {
      state: "pending" as const,
      label: pickLocaleText(resolvedLocale, { "zh-CN": "待审批", "zh-TW": "待審批", en: "Pending Approval", ja: "承認待ち" }),
      color: "#f59e0b",
      note: taskStatus === "scheduled"
        ? pickLocaleText(resolvedLocale, {
          "zh-CN": "当前发布前需要人工确认，审批通过后才能继续外发。",
          "zh-TW": "目前發布前需要人工確認，審批通過後才能繼續外發。",
          en: "Manual confirmation is required before publishing. Delivery can continue only after approval.",
          ja: "公開前に手動確認が必要です。承認後にのみ配信を続行できます。",
        })
        : pickLocaleText(resolvedLocale, {
          "zh-CN": "当前流程需要人工确认后再继续推进。",
          "zh-TW": "目前流程需要人工確認後再繼續推進。",
          en: "This workflow needs manual confirmation before continuing.",
          ja: "このフローは続行前に手動確認が必要です。",
        }),
    };
  }

  if (taskStatus === "review" || taskStatus === "scheduled") {
    return {
      state: "required" as const,
      label: pickLocaleText(resolvedLocale, { "zh-CN": "需审批", "zh-TW": "需審批", en: "Approval Required", ja: "承認必須" }),
      color: "#f59e0b",
      note: taskStatus === "scheduled"
        ? pickLocaleText(resolvedLocale, {
          "zh-CN": "当前阶段通常需要审批，建议先进入审批队列。",
          "zh-TW": "目前階段通常需要審批，建議先進入審批佇列。",
          en: "This stage usually requires approval. Open the approval queue first.",
          ja: "この段階は通常承認が必要です。先に承認キューを開いてください。",
        })
        : pickLocaleText(resolvedLocale, {
          "zh-CN": "当前处于审校阶段，建议先进入审批队列确认。",
          "zh-TW": "目前處於審校階段，建議先進入審批佇列確認。",
          en: "This item is in review. Open the approval queue before continuing.",
          ja: "現在レビュー段階です。続行前に承認キューで確認してください。",
        }),
    };
  }

  return null;
}

function getWorkflowBusinessStageCopy(
  workflowRun: Pick<WorkflowRun, "status" | "templateId" | "summary" | "context">,
  approvalPresentation: ReturnType<typeof getContentApprovalPresentation>,
  locale: UiLocale,
) {
  if (approvalPresentation?.state === "approved") {
    return workflowRun.templateId === "content-publish-prep"
      ? pickLocaleText(locale, {
        "zh-CN": "业务阶段：审批已通过，可继续发布准备或进入外发。",
        "zh-TW": "業務階段：審批已通過，可繼續發布準備或進入外發。",
        en: "Business stage: approved. Continue publish prep or move into delivery.",
        ja: "業務段階: 承認済みです。公開準備または配信へ進めます。",
      })
      : pickLocaleText(locale, {
        "zh-CN": "业务阶段：审批已通过，可继续推进当前内容流程。",
        "zh-TW": "業務階段：審批已通過，可繼續推進目前內容流程。",
        en: "Business stage: approved. Continue the current content workflow.",
        ja: "業務段階: 承認済みです。現在のコンテンツフローを続行できます。",
      });
  }

  if (approvalPresentation?.state === "rejected") {
    return workflowRun.templateId === "content-publish-prep"
      ? pickLocaleText(locale, {
        "zh-CN": "业务阶段：审批已驳回，建议退回定稿并重新确认发布策略。",
        "zh-TW": "業務階段：審批已駁回，建議退回定稿並重新確認發布策略。",
        en: "Business stage: rejected. Return to final editing and review the publishing strategy.",
        ja: "業務段階: 却下済みです。原稿へ戻し、公開戦略を見直してください。",
      })
      : pickLocaleText(locale, {
        "zh-CN": "业务阶段：审批已驳回，建议继续打磨后再提交。",
        "zh-TW": "業務階段：審批已駁回，建議繼續打磨後再提交。",
        en: "Business stage: rejected. Refine the content and resubmit.",
        ja: "業務段階: 却下済みです。内容を磨き直して再提出してください。",
      });
  }

  if (approvalPresentation?.state === "pending" || approvalPresentation?.state === "required") {
    return workflowRun.templateId === "content-publish-prep"
      ? pickLocaleText(locale, {
        "zh-CN": "业务阶段：发布前待人工确认，当前不建议直接外发。",
        "zh-TW": "業務階段：發布前待人工確認，目前不建議直接外發。",
        en: "Business stage: waiting for manual confirmation before publishing.",
        ja: "業務段階: 公開前の手動確認待ちです。今は直接配信しないでください。",
      })
      : pickLocaleText(locale, {
        "zh-CN": "业务阶段：当前内容流待人工确认后再继续推进。",
        "zh-TW": "業務階段：目前內容流程待人工確認後再繼續推進。",
        en: "Business stage: waiting for manual confirmation before continuing.",
        ja: "業務段階: 続行前に手動確認が必要です。",
      });
  }

  if (workflowRun.context.manualApprovalRequired) {
    return pickLocaleText(locale, {
      "zh-CN": "业务阶段：当前流程存在人工闸门，推进前请先检查审批状态。",
      "zh-TW": "業務階段：目前流程存在人工閘門，推進前請先檢查審批狀態。",
      en: "Business stage: a manual gate exists in this flow. Check approval status before continuing.",
      ja: "業務段階: このフローには手動ゲートがあります。続行前に承認状態を確認してください。",
    });
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

function formatContentTaskStatus(
  status: "draft" | "review" | "scheduled" | "published" | "archived",
  locale: UiLocale,
) {
  switch (status) {
    case "draft":
      return pickLocaleText(locale, { "zh-CN": "草稿", "zh-TW": "草稿", en: "Draft", ja: "下書き" });
    case "review":
      return pickLocaleText(locale, { "zh-CN": "审校中", "zh-TW": "審校中", en: "In Review", ja: "レビュー中" });
    case "scheduled":
      return pickLocaleText(locale, { "zh-CN": "待发布", "zh-TW": "待發布", en: "Scheduled", ja: "公開待ち" });
    case "published":
      return pickLocaleText(locale, { "zh-CN": "已发布", "zh-TW": "已發布", en: "Published", ja: "公開済み" });
    case "archived":
      return pickLocaleText(locale, { "zh-CN": "已归档", "zh-TW": "已歸檔", en: "Archived", ja: "アーカイブ済み" });
    default:
      return status;
  }
}

function formatContentTaskFormat(format: string, locale: UiLocale) {
  switch (format) {
    case "post":
      return pickLocaleText(locale, { "zh-CN": "图文帖子", "zh-TW": "圖文貼文", en: "Post", ja: "投稿" });
    case "thread":
      return pickLocaleText(locale, { "zh-CN": "串文", "zh-TW": "串文", en: "Thread", ja: "スレッド" });
    case "article":
      return pickLocaleText(locale, { "zh-CN": "文章", "zh-TW": "文章", en: "Article", ja: "記事" });
    case "script":
      return pickLocaleText(locale, { "zh-CN": "脚本", "zh-TW": "腳本", en: "Script", ja: "台本" });
    default:
      return format;
  }
}

function formatOperatingTemplateLabel(templateId: string | undefined, fallback: string, locale: UiLocale) {
  switch (templateId) {
    case "engineering":
      return pickLocaleText(locale, { "zh-CN": "研发模式", "zh-TW": "研發模式", en: "Engineering Mode", ja: "開発モード" });
    case "support":
      return pickLocaleText(locale, { "zh-CN": "客服值守模式", "zh-TW": "客服值守模式", en: "Support Mode", ja: "サポートモード" });
    case "content":
      return pickLocaleText(locale, { "zh-CN": "内容矩阵模式", "zh-TW": "內容矩陣模式", en: "Content Mode", ja: "コンテンツモード" });
    default:
      return fallback;
  }
}

function formatOperatingSurfaceCopy(templateId: string | undefined, fallback: string, locale: UiLocale) {
  switch (templateId) {
    case "engineering":
      return pickLocaleText(locale, {
        "zh-CN": "优先盯执行链路、工作流和工作区上下文，适合产品搭建、联调和交付闭环。",
        "zh-TW": "優先盯執行鏈路、工作流和工作區上下文，適合產品搭建、聯調和交付閉環。",
        en: "Focus on execution traces, workflows, and workspace context for product delivery, debugging, and shipping loops.",
        ja: "実行トレース、ワークフロー、ワークスペース文脈を優先的に確認し、実装・連携確認・納品の循環に向いています。",
      });
    case "support":
      return pickLocaleText(locale, {
        "zh-CN": "优先看业务实体、远程值守和渠道会话，让客户、工单和会话状态更直观。",
        "zh-TW": "優先看業務實體、遠程值守和渠道會話，讓客戶、工單和會話狀態更直觀。",
        en: "Prioritize business entities, remote ops, and channel sessions so customers, tickets, and conversations stay easy to read.",
        ja: "業務実体、遠隔運用、チャネル会話を優先表示し、顧客・チケット・会話の状態を把握しやすくします。",
      });
    case "content":
      return pickLocaleText(locale, {
        "zh-CN": "优先看工作流、内容任务和产物输出，适合脚本、视觉和发布协同。",
        "zh-TW": "優先看工作流、內容任務和產物輸出，適合腳本、視覺和發布協同。",
        en: "Focus on workflows, content tasks, and deliverables for scripting, design, and publishing collaboration.",
        ja: "ワークフロー、コンテンツタスク、成果物出力を優先し、脚本・ビジュアル・公開連携に向いています。",
      });
    default:
      return fallback;
  }
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
  const locale = useStore(s => s.locale);
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
    () => getAvailableWorkflowTemplates(enabledPluginIds, locale),
    [enabledPluginIds, locale],
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
    const contextLine = buildContextLine({ context: workflowContext }, locale);
    setCommandDraft(buildWorkflowDraft(template.title, contextLine, template.brief, locale));
    setTab(template.nextTab);
  };

  const queueTemplate = (template: (typeof workflowTemplates)[number]) => {
    const contextLine = buildContextLine({ context: workflowContext }, locale);

    queueWorkflowRun({
      templateId: template.id,
      title: template.title,
      summary: template.summary,
      nextTab: template.nextTab,
      brief: template.brief,
      draft: buildWorkflowDraft(template.title, contextLine, template.brief, locale),
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

  const recommendedModeLabel = pickLocaleText(locale, {
    "zh-CN": "当前模式推荐",
    "zh-TW": "目前模式推薦",
    en: "Recommended for Current Mode",
    ja: "現在のモード向け推奨",
  });

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
          {pickLocaleText(locale, { "zh-CN": "工作流中心", "zh-TW": "工作流中心", en: "Workflow Center", ja: "ワークフローセンター" })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          {pickLocaleText(locale, {
            "zh-CN": "预置工作流、真实队列、启动入口与最近历史都集中在这里",
            "zh-TW": "預置工作流、真實佇列、啟動入口與最近歷史都集中在這裡",
            en: "Prebuilt workflows with a real queue, launch surface, and recent history",
            ja: "プリセットされたワークフロー、実行キュー、起動入口、最近履歴をここでまとめて管理します",
          })}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          {pickLocaleText(locale, {
            "zh-CN": "现在这里不只是展示模板，而是会真正跟踪 workflow run。核心流程和插件流程都可以排队、重新送回聊天输入区，并保留轻量执行历史。",
            "zh-TW": "現在這裡不只展示模板，而是會真正追蹤 workflow run。核心流程與外掛流程都可以排隊、重新送回聊天輸入區，並保留輕量執行歷史。",
            en: "The shell now tracks workflow runs instead of only showing templates. Core flows and plugin-aware flows can both be queued, re-staged into the composer, and kept in a lightweight execution history.",
            ja: "この画面はテンプレート表示だけでなく workflow run 自体を追跡します。コアフローもプラグインフローもキュー投入、再ステージ、軽量な実行履歴保持が可能です。",
          })}
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
                {recommendedModeLabel} · {formatOperatingTemplateLabel(activeTemplate.id, activeTemplate.label, locale)}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {pickLocaleText(locale, {
                  "zh-CN": `推荐模板 ${recommendedTemplateIds.length} 个`,
                  "zh-TW": `推薦模板 ${recommendedTemplateIds.length} 個`,
                  en: `${recommendedTemplateIds.length} recommended templates`,
                  ja: `推奨テンプレート ${recommendedTemplateIds.length} 件`,
                })}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              {formatOperatingSurfaceCopy(activeTemplate.id, activeSurface.statusCopy, locale)}
            </div>
            {recommendedTemplates.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "8px 14px" }}
                  onClick={() => queueTemplate(recommendedTemplates[0]!)}
                >
                  {pickLocaleText(locale, { "zh-CN": "一键排队推荐流程", "zh-TW": "一鍵排隊推薦流程", en: "Queue Recommended Flow", ja: "推奨フローをキューへ" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "8px 14px" }}
                  onClick={() => stageTemplate(recommendedTemplates[0]!)}
                >
                  {pickLocaleText(locale, { "zh-CN": "暂存到聊天输入框", "zh-TW": "暫存到聊天輸入框", en: "Stage to Chat Composer", ja: "チャット入力へステージ" })}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <WorkflowMetric label={pickLocaleText(locale, { "zh-CN": "排队中", "zh-TW": "排隊中", en: "Queued", ja: "キュー中" })} value={metrics.queued} accent="#7dd3fc" />
        <WorkflowMetric label={pickLocaleText(locale, { "zh-CN": "执行中", "zh-TW": "執行中", en: "In Progress", ja: "進行中" })} value={metrics.active} accent="#fbbf24" />
        <WorkflowMetric label={pickLocaleText(locale, { "zh-CN": "已完成", "zh-TW": "已完成", en: "Completed", ja: "完了" })} value={metrics.completed} accent="#86efac" />
        <WorkflowMetric label={pickLocaleText(locale, { "zh-CN": "启动次数", "zh-TW": "啟動次數", en: "Launches", ja: "起動回数" })} value={metrics.launches} accent="#c4b5fd" />
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
                    {recommendedModeLabel}
                  </span>
                )}
                <span style={badgeStyle(template.source === "plugin" ? "#fda4af" : "#7dd3fc")}>
                  {template.source === "plugin"
                    ? (template.pluginName ?? pickLocaleText(locale, { "zh-CN": "插件流程", "zh-TW": "外掛流程", en: "Plugin Flow", ja: "プラグインフロー" }))
                    : pickLocaleText(locale, { "zh-CN": "核心流程", "zh-TW": "核心流程", en: "Core Flow", ja: "コアフロー" })}
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
                {pickLocaleText(locale, {
                  "zh-CN": `由 ${template.pluginName} 提供`,
                  "zh-TW": `由 ${template.pluginName} 提供`,
                  en: `Powered by ${template.pluginName}`,
                  ja: `${template.pluginName} 提供`,
                })}
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
                {pickLocaleText(locale, { "zh-CN": "送入聊天", "zh-TW": "送入聊天", en: "Stage Brief", ja: "チャットへ送る" })}
              </button>
              <button type="button" className="btn-ghost" onClick={() => queueTemplate(template)}>
                {pickLocaleText(locale, { "zh-CN": "加入队列", "zh-TW": "加入佇列", en: "Queue Run", ja: "キューに追加" })}
              </button>
            </div>
          </article>
        )})}
      </div>

      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {pickLocaleText(locale, { "zh-CN": "内容任务绑定", "zh-TW": "內容任務綁定", en: "Content Task Binding", ja: "コンテンツタスク連携" })}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {pickLocaleText(locale, {
                "zh-CN": "可以直接从当前项目范围内的内容任务创建工作流，让草稿、审校和发布准备始终绑定在业务实体上。",
                "zh-TW": "可以直接從目前專案範圍內的內容任務建立工作流，讓草稿、審校與發布準備始終綁定在業務實體上。",
                en: "Queue workflows directly from scoped content tasks so draft, review, and publish prep stay attached to the business entity.",
                ja: "現在のプロジェクト範囲のコンテンツタスクから直接ワークフローを作成し、下書き・レビュー・公開準備を業務実体に紐づけたまま進められます。",
              })}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {pickLocaleText(locale, {
              "zh-CN": `当前范围任务 ${contentTasksNeedingWorkflow.length}${workflowContext.manualApprovalRequired ? " · 含需审批内容" : ""}`,
              "zh-TW": `目前範圍任務 ${contentTasksNeedingWorkflow.length}${workflowContext.manualApprovalRequired ? " · 含需審批內容" : ""}`,
              en: `Scoped tasks ${contentTasksNeedingWorkflow.length}${workflowContext.manualApprovalRequired ? " · includes approval-required items" : ""}`,
              ja: `対象タスク ${contentTasksNeedingWorkflow.length}${workflowContext.manualApprovalRequired ? " ・承認必須項目あり" : ""}`,
            })}
          </div>
        </div>

        {contentTasksNeedingWorkflow.length === 0 ? (
          <div style={{ ...emptyPanelStyle, marginTop: 14 }}>
            {pickLocaleText(locale, {
              "zh-CN": "当前项目范围里还没有内容任务。",
              "zh-TW": "目前專案範圍裡還沒有內容任務。",
              en: "No content tasks in the current project scope yet.",
              ja: "現在のプロジェクト範囲にはまだコンテンツタスクがありません。",
            })}
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
                    <span style={badgeStyle("#c084fc")}>{formatContentTaskStatus(task.status, locale)}</span>
                    {approvalPresentation ? <span style={badgeStyle(approvalPresentation.color)}>{approvalPresentation.label}</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span style={badgeStyle("#60a5fa")}>{formatContentTaskFormat(task.format, locale)}</span>
                  <span style={badgeStyle("#7dd3fc")}>
                    {task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ")
                      || pickLocaleText(locale, { "zh-CN": "无目标渠道", "zh-TW": "無目標渠道", en: "No targets", ja: "対象チャネルなし" })}
                  </span>
                  {task.lastWorkflowRunId ? <span style={badgeStyle("#a78bfa")}>{pickLocaleText(locale, { "zh-CN": "已关联工作流", "zh-TW": "已關聯工作流", en: "Linked Workflow", ja: "関連ワークフロー" })}</span> : null}
                </div>
                {task.latestDraftSummary ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "最近草稿：", "zh-TW": "最近草稿：", en: "Latest draft:", ja: "最新ドラフト:" })} {task.latestDraftSummary}
                  </div>
                ) : null}
                {task.latestPostmortemSummary ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "最近复盘：", "zh-TW": "最近復盤：", en: "Latest postmortem:", ja: "最新ふり返り:" })} {task.latestPostmortemSummary}
                  </div>
                ) : null}
                {task.nextCycleRecommendation ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "下一轮建议：", "zh-TW": "下一輪建議：", en: "Next cycle:", ja: "次サイクル:" })} {task.nextCycleRecommendation}
                  </div>
                ) : null}
                {task.publishedResults.length > 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "发布结果：", "zh-TW": "發布結果：", en: "Publish results:", ja: "公開結果:" })} {task.publishedResults.slice(0, 2).map(result =>
                      `${result.channel}:${result.accountLabel} · ${result.status}${result.externalId ? ` · ${result.externalId}` : ""}`,
                    ).join(" / ")}
                  </div>
                ) : null}
                {approvalPresentation ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {pickLocaleText(locale, { "zh-CN": "审批：", "zh-TW": "審批：", en: "Approval:", ja: "承認:" })} {approvalPresentation.note}
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
                    {task.lastWorkflowRunId
                      ? pickLocaleText(locale, { "zh-CN": "创建下一轮工作流", "zh-TW": "建立下一輪工作流", en: "Queue Next Workflow", ja: "次のワークフローを作成" })
                      : pickLocaleText(locale, { "zh-CN": "创建工作流", "zh-TW": "建立工作流", en: "Create Workflow", ja: "ワークフローを作成" })}
                  </button>
                  {needsManualGate ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                    >
                      {pickLocaleText(locale, { "zh-CN": "前往审批队列", "zh-TW": "前往審批佇列", en: "Open Approval Queue", ja: "承認キューを開く" })}
                    </button>
                  ) : null}
                  {task.lastExecutionRunId ? (
                    <button type="button" className="btn-ghost" onClick={() => setTab("dashboard")}>
                      {pickLocaleText(locale, { "zh-CN": "查看执行链路", "zh-TW": "查看執行鏈路", en: "Review Execution Chain", ja: "実行チェーンを見る" })}
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {pickLocaleText(locale, { "zh-CN": "执行队列", "zh-TW": "執行佇列", en: "Execution Queue", ja: "実行キュー" })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "等待暂存、启动或标记完成的 workflow run。",
                  "zh-TW": "等待暫存、啟動或標記完成的 workflow run。",
                  en: "Runs waiting to be staged, launched, or completed from the desktop shell.",
                  ja: "デスクトップシェルからステージ、起動、完了できる待機中の workflow run です。",
                })}
              </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {pickLocaleText(locale, {
              "zh-CN": `项目 ${activeSession ? getSessionProjectLabel(activeSession) : "通用"} · 引用 ${workflowContext.deskRefs} · 笔记 ${workflowContext.deskNotes} · 上下文包 ${workflowContext.contextPacks} · 插件 ${workflowContext.plugins}`,
              "zh-TW": `專案 ${activeSession ? getSessionProjectLabel(activeSession) : "通用"} · 引用 ${workflowContext.deskRefs} · 筆記 ${workflowContext.deskNotes} · 上下文包 ${workflowContext.contextPacks} · 外掛 ${workflowContext.plugins}`,
              en: `Project ${activeSession ? getSessionProjectLabel(activeSession) : "General"} · refs ${workflowContext.deskRefs} · notes ${workflowContext.deskNotes} · packs ${workflowContext.contextPacks} · plugins ${workflowContext.plugins}`,
              ja: `プロジェクト ${activeSession ? getSessionProjectLabel(activeSession) : "共通"} ・参照 ${workflowContext.deskRefs} ・ノート ${workflowContext.deskNotes} ・パック ${workflowContext.contextPacks} ・プラグイン ${workflowContext.plugins}`,
            })}
            {workflowContext.preferredContentChannel
              ? pickLocaleText(locale, {
                "zh-CN": ` · 渠道 ${workflowContext.preferredContentChannel}`,
                "zh-TW": ` · 渠道 ${workflowContext.preferredContentChannel}`,
                en: ` · channel ${workflowContext.preferredContentChannel}`,
                ja: ` ・チャネル ${workflowContext.preferredContentChannel}`,
              })
              : ""}
            {workflowContext.riskyContentChannels?.length
              ? pickLocaleText(locale, {
                "zh-CN": ` · 高风险 ${workflowContext.riskyContentChannels.join("/")}`,
                "zh-TW": ` · 高風險 ${workflowContext.riskyContentChannels.join("/")}`,
                en: ` · risky ${workflowContext.riskyContentChannels.join("/")}`,
                ja: ` ・高リスク ${workflowContext.riskyContentChannels.join("/")}`,
              })
              : ""}
            {workflowContext.manualApprovalRequired
              ? pickLocaleText(locale, { "zh-CN": " · 审批开启", "zh-TW": " · 審批開啟", en: " · approvals on", ja: " ・承認あり" })
              : ""}
          </div>
        </div>

          {activeRuns.length === 0 && (
            <div style={emptyPanelStyle}>
              {pickLocaleText(locale, {
                "zh-CN": "还没有进入队列的工作流。可以先从上方模板开始，建立可复用的执行队列。",
                "zh-TW": "還沒有進入佇列的工作流。可以先從上方模板開始，建立可重用的執行佇列。",
                en: "No queued workflows yet. Use a template above to start building a reusable execution queue.",
                ja: "まだキュー済みのワークフローはありません。上のテンプレートから再利用できる実行キューを作成してください。",
              })}
            </div>
          )}

          <div style={{ display: "grid", gap: 12, marginTop: activeRuns.length > 0 ? 14 : 0 }}>
            {activeRuns.map(workflowRun => {
              const tone = statusTone(workflowRun.status, locale);
              const linkedContentTask = workflowRun.entityType === "contentTask" && workflowRun.entityId
                ? contentTaskMap.get(workflowRun.entityId)
                : null;
              const approvalState = linkedContentTask ? contentApprovalMap.get(linkedContentTask.id) : undefined;
              const approvalPresentation = linkedContentTask
                ? getContentApprovalPresentation(linkedContentTask.status, approvalState, locale)
                : null;
              const needsManualGate = Boolean(workflowRun.context.manualApprovalRequired || approvalPresentation);
              const businessStageCopy = getWorkflowBusinessStageCopy(workflowRun, approvalPresentation, locale);

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
                        <span style={badgeStyle("#f59e0b")}>{pickLocaleText(locale, { "zh-CN": "发布前需审批", "zh-TW": "發布前需審批", en: "Approval Before Publish", ja: "公開前に承認必須" })}</span>
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
                    <WorkflowNote label={pickLocaleText(locale, { "zh-CN": "创建", "zh-TW": "建立", en: "Created", ja: "作成" })} value={formatTimestamp(workflowRun.createdAt, locale)} />
                    <WorkflowNote label={pickLocaleText(locale, { "zh-CN": "更新", "zh-TW": "更新", en: "Updated", ja: "更新" })} value={formatTimestamp(workflowRun.updatedAt, locale)} />
                    <WorkflowNote label={pickLocaleText(locale, { "zh-CN": "启动次数", "zh-TW": "啟動次數", en: "Launches", ja: "起動回数" })} value={String(workflowRun.launchCount)} />
                    <WorkflowNote label={pickLocaleText(locale, { "zh-CN": "上下文", "zh-TW": "上下文", en: "Context", ja: "コンテキスト" })} value={`${workflowRun.context.deskRefs}/${workflowRun.context.deskNotes}/${workflowRun.context.contextPacks}/${workflowRun.context.plugins}`} />
                    {workflowRun.context.preferredContentChannel ? (
                      <WorkflowNote
                        label={pickLocaleText(locale, { "zh-CN": "渠道", "zh-TW": "渠道", en: "Channel", ja: "チャネル" })}
                        value={`${workflowRun.context.preferredContentChannel}${workflowRun.context.riskyContentChannels?.length
                          ? pickLocaleText(locale, {
                            "zh-CN": ` · 风险 ${workflowRun.context.riskyContentChannels.join("/")}`,
                            "zh-TW": ` · 風險 ${workflowRun.context.riskyContentChannels.join("/")}`,
                            en: ` · risk ${workflowRun.context.riskyContentChannels.join("/")}`,
                            ja: ` ・リスク ${workflowRun.context.riskyContentChannels.join("/")}`,
                          })
                          : ""}${workflowRun.context.manualApprovalRequired
                          ? pickLocaleText(locale, { "zh-CN": " · 闸门", "zh-TW": " · 閘門", en: " · gate", ja: " ・ゲート" })
                          : ""}`}
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
                      {pickLocaleText(locale, { "zh-CN": "审批：", "zh-TW": "審批：", en: "Approval:", ja: "承認:" })} {approvalPresentation.note}
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
                      {pickLocaleText(locale, { "zh-CN": "重新送入聊天", "zh-TW": "重新送入聊天", en: "Re-Stage", ja: "再ステージ" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => launchRun(workflowRun)}>
                      {pickLocaleText(locale, { "zh-CN": "启动", "zh-TW": "啟動", en: "Launch", ja: "起動" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => completeWorkflowRun(workflowRun.id, { latestDraftSummary: summarizeWorkflowDraft(workflowRun.draft) })}
                    >
                      {pickLocaleText(locale, { "zh-CN": "标记完成", "zh-TW": "標記完成", en: "Complete", ja: "完了にする" })}
                    </button>
                    {approvalPresentation?.state !== "approved" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "approved")}
                      >
                        {linkedContentTask.status === "scheduled"
                          ? pickLocaleText(locale, { "zh-CN": "批准并继续发布", "zh-TW": "批准並繼續發布", en: "Approve and Continue Publishing", ja: "承認して公開を続行" })
                          : pickLocaleText(locale, { "zh-CN": "批准并继续", "zh-TW": "批准並繼續", en: "Approve and Continue", ja: "承認して続行" })}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.state !== "rejected" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "rejected")}
                      >
                        {linkedContentTask.status === "scheduled"
                          ? pickLocaleText(locale, { "zh-CN": "驳回并退回定稿", "zh-TW": "駁回並退回定稿", en: "Reject and Return to Final Editing", ja: "却下して原稿へ戻す" })
                          : pickLocaleText(locale, { "zh-CN": "驳回", "zh-TW": "駁回", en: "Reject", ja: "却下" })}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.state !== "pending" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "pending")}
                      >
                        {pickLocaleText(locale, { "zh-CN": "重新打开审批", "zh-TW": "重新打開審批", en: "Reopen Approval", ja: "承認を再オープン" })}
                      </button>
                    ) : null}
                    {needsManualGate ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                      >
                        {pickLocaleText(locale, { "zh-CN": "打开审批队列", "zh-TW": "打開審批佇列", en: "Open Approvals", ja: "承認キューを開く" })}
                      </button>
                    ) : null}
                    {linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => focusContentTask(linkedContentTask.id)}
                      >
                        {pickLocaleText(locale, { "zh-CN": "定位到内容任务", "zh-TW": "定位到內容任務", en: "Open Content Task", ja: "コンテンツタスクを見る" })}
                      </button>
                    ) : null}
                    <button type="button" className="btn-ghost" onClick={() => removeWorkflowRun(workflowRun.id)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {pickLocaleText(locale, { "zh-CN": "最近历史", "zh-TW": "最近歷史", en: "Recent History", ja: "最近履歴" })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {pickLocaleText(locale, {
              "zh-CN": "已完成的流程会继续保留，让这里更像控制面板，而不是一次性启动器。",
              "zh-TW": "已完成的流程會繼續保留，讓這裡更像控制面板，而不是一次性啟動器。",
              en: "Completed flows stay visible so the shell feels like a control surface, not a one-shot launcher.",
              ja: "完了済みフローを残し、単発ランチャーではなくコントロール面として使えるようにしています。",
            })}
          </div>

          {historyRuns.length === 0 && (
            <div style={{ ...emptyPanelStyle, marginTop: 14 }}>
              {pickLocaleText(locale, {
                "zh-CN": "还没有已完成的工作流记录。",
                "zh-TW": "還沒有已完成的工作流記錄。",
                en: "No completed workflow runs yet.",
                ja: "完了済みのワークフロー履歴はまだありません。",
              })}
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: historyRuns.length > 0 ? 14 : 0 }}>
            {historyRuns.map(workflowRun => {
              const tone = statusTone(workflowRun.status, locale);
              const linkedContentTask = workflowRun.entityType === "contentTask" && workflowRun.entityId
                ? contentTaskMap.get(workflowRun.entityId)
                : null;
              const approvalState = linkedContentTask ? contentApprovalMap.get(linkedContentTask.id) : undefined;
              const approvalPresentation = linkedContentTask
                ? getContentApprovalPresentation(linkedContentTask.status, approvalState, locale)
                : null;
              const businessStageCopy = getWorkflowBusinessStageCopy(workflowRun, approvalPresentation, locale);

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
                        {pickLocaleText(locale, {
                          "zh-CN": `${formatTimestamp(workflowRun.updatedAt, locale)} · 已启动 ${workflowRun.launchCount} 次`,
                          "zh-TW": `${formatTimestamp(workflowRun.updatedAt, locale)} · 已啟動 ${workflowRun.launchCount} 次`,
                          en: `${formatTimestamp(workflowRun.updatedAt, locale)} · launched ${workflowRun.launchCount} time(s)`,
                          ja: `${formatTimestamp(workflowRun.updatedAt, locale)} ・起動 ${workflowRun.launchCount} 回`,
                        })}
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
                      {pickLocaleText(locale, { "zh-CN": "审批：", "zh-TW": "審批：", en: "Approval:", ja: "承認:" })} {approvalPresentation.note}
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
                      {pickLocaleText(locale, { "zh-CN": "重新复用", "zh-TW": "重新復用", en: "Reuse", ja: "再利用" })}
                    </button>
                    {approvalPresentation?.state !== "approved" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "approved")}
                      >
                        {linkedContentTask.status === "scheduled"
                          ? pickLocaleText(locale, { "zh-CN": "批准并继续发布", "zh-TW": "批准並繼續發布", en: "Approve and Continue Publishing", ja: "承認して公開を続行" })
                          : pickLocaleText(locale, { "zh-CN": "批准并继续", "zh-TW": "批准並繼續", en: "Approve and Continue", ja: "承認して続行" })}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.state !== "rejected" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "rejected")}
                      >
                        {linkedContentTask.status === "scheduled"
                          ? pickLocaleText(locale, { "zh-CN": "驳回并退回定稿", "zh-TW": "駁回並退回定稿", en: "Reject and Return to Final Editing", ja: "却下して原稿へ戻す" })
                          : pickLocaleText(locale, { "zh-CN": "驳回", "zh-TW": "駁回", en: "Reject", ja: "却下" })}
                      </button>
                    ) : null}
                    {approvalPresentation && approvalPresentation.state !== "pending" && linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => applyWorkflowApprovalDecision(workflowRun, "pending")}
                      >
                        {pickLocaleText(locale, { "zh-CN": "重新打开审批", "zh-TW": "重新打開審批", en: "Reopen Approval", ja: "承認を再オープン" })}
                      </button>
                    ) : null}
                    {approvalPresentation ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => openApprovalQueue(setActiveControlCenterSection, setTab)}
                      >
                        {pickLocaleText(locale, { "zh-CN": "打开审批队列", "zh-TW": "打開審批佇列", en: "Open Approvals", ja: "承認キューを開く" })}
                      </button>
                    ) : null}
                    {linkedContentTask ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => focusContentTask(linkedContentTask.id)}
                      >
                        {pickLocaleText(locale, { "zh-CN": "定位到内容任务", "zh-TW": "定位到內容任務", en: "Open Content Task", ja: "コンテンツタスクを見る" })}
                      </button>
                    ) : null}
                    <button type="button" className="btn-ghost" onClick={() => archiveWorkflowRun(workflowRun.id)}>
                      {pickLocaleText(locale, { "zh-CN": "归档", "zh-TW": "歸檔", en: "Archive", ja: "アーカイブ" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => removeWorkflowRun(workflowRun.id)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
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
