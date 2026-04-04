import { getPluginById } from "@/lib/plugin-runtime";
import { getBusinessContentChannelLabel, getBusinessContentFormatLabel } from "@/lib/business-entities";
import type { WorkflowContextSnapshot, WorkflowRun, WorkflowTemplate } from "@/types/workflows";
import type { BusinessContentTask } from "@/types/business-entities";

const CORE_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "content-idea-draft",
    title: "选题与草稿",
    accent: "#c084fc",
    summary: "围绕内容目标、发布对象和项目上下文快速生成首版内容草稿。",
    nextTab: "tasks",
    brief: [
      "基于当前内容任务目标、渠道与发布对象生成一版首稿。",
      "优先输出结构、标题、核心观点和可直接复用的文案。",
      "同时补齐发布前仍缺失的信息与风险点。",
    ].join("\n"),
    steps: ["任务拆解", "草稿生成", "缺口补齐"],
    source: "core",
  },
  {
    id: "content-review-polish",
    title: "定稿与审校",
    accent: "#fbbf24",
    summary: "把现有草稿收敛成可审核版本，并明确人工审批点。",
    nextTab: "tasks",
    brief: [
      "检查现有内容草稿与目标是否一致。",
      "输出定稿版本、审核意见和明确的人工确认点。",
      "保持可直接进入 review 到 scheduled 的状态切换。",
    ].join("\n"),
    steps: ["草稿收敛", "审核意见", "审批点标记"],
    source: "core",
  },
  {
    id: "content-publish-prepare",
    title: "发布准备",
    accent: "#60a5fa",
    summary: "整理发布窗口、目标渠道和桌面辅助发布前的执行清单。",
    nextTab: "tasks",
    brief: [
      "针对目标渠道整理最终文案、素材占位和发布清单。",
      "标记哪些步骤可以自动推进，哪些步骤需要人工确认。",
      "输出一份可直接用于桌面辅助发布的执行说明。",
    ].join("\n"),
    steps: ["渠道整理", "执行清单", "发布说明"],
    source: "core",
  },
  {
    id: "content-publish-retrospective",
    title: "发布复盘",
    accent: "#34d399",
    summary: "将发布结果、外链与后续动作沉淀为可追踪复盘记录。",
    nextTab: "tasks",
    brief: [
      "回收发布结果、外链、外部 ID 和失败原因。",
      "总结这次内容动作的产出与问题。",
      "给出下一条内容或分发动作建议。",
    ].join("\n"),
    steps: ["结果回写", "问题总结", "后续动作"],
    source: "core",
  },
  {
    id: "launch-sprint",
    title: "Launch Sprint",
    accent: "#7dd3fc",
    summary: "Combine desk context, skills, and task flow to push a shipping-focused sprint.",
    nextTab: "tasks",
    brief: [
      "Use the current Desk context, pinned references, and active notes.",
      "Split the work into research, copy, design, and delivery slices.",
      "Return the execution order, likely blockers, and the fastest first milestone.",
    ].join("\n"),
    steps: ["Desk context", "Task dispatch", "Artifact review"],
    source: "core",
  },
  {
    id: "research-loop",
    title: "Research Loop",
    accent: "#86efac",
    summary: "Turn current sessions and desk notes into a structured research plan.",
    nextTab: "tasks",
    brief: [
      "Map the current problem, constraints, and files already pinned on the Desk.",
      "Propose a research loop with findings, risk checks, and a recommended answer.",
      "Keep the output actionable and ready for implementation.",
    ].join("\n"),
    steps: ["Skills review", "Research dispatch", "Output shelf"],
    source: "core",
  },
  {
    id: "meeting-debrief",
    title: "Meeting Debrief",
    accent: "#fbbf24",
    summary: "Convert meeting conclusions into next actions and reusable artifacts.",
    nextTab: "meeting",
    brief: [
      "Review the latest meeting conclusion and convert it into a prioritized action list.",
      "Identify owners, files, and follow-up prompts needed after the meeting.",
      "Prepare the handoff so the team can continue without re-reading the full transcript.",
    ].join("\n"),
    steps: ["Meeting record", "Action extraction", "Task handoff"],
    source: "core",
  },
];

export function getContentWorkflowTemplate(task: BusinessContentTask) {
  switch (task.status) {
    case "review":
      return CORE_WORKFLOW_TEMPLATES.find(template => template.id === "content-review-polish") ?? CORE_WORKFLOW_TEMPLATES[0]!;
    case "scheduled":
      return CORE_WORKFLOW_TEMPLATES.find(template => template.id === "content-publish-prepare") ?? CORE_WORKFLOW_TEMPLATES[0]!;
    case "published":
      return CORE_WORKFLOW_TEMPLATES.find(template => template.id === "content-publish-retrospective") ?? CORE_WORKFLOW_TEMPLATES[0]!;
    default:
      return CORE_WORKFLOW_TEMPLATES.find(template => template.id === "content-idea-draft") ?? CORE_WORKFLOW_TEMPLATES[0]!;
  }
}

export function buildContentWorkflowRunPayload(
  task: BusinessContentTask,
  context: WorkflowContextSnapshot,
): Omit<WorkflowRun, "id" | "createdAt" | "updatedAt" | "launchCount" | "status"> {
  const template = getContentWorkflowTemplate(task);
  const publishTargets = task.publishTargets.length > 0
    ? task.publishTargets.map(target => `${getBusinessContentChannelLabel(target.channel)} / ${target.accountLabel}`).join("、")
    : "未配置";
  const contextLine = `Desk refs: ${context.deskRefs}, desk notes: ${context.deskNotes}, context packs: ${context.contextPacks}, plugins: ${context.plugins}`;
  const draft = [
    `Workflow: ${template.title}`,
    contextLine,
    `内容任务: ${task.title}`,
    `内容格式: ${getBusinessContentFormatLabel(task.format)}`,
    `主渠道: ${getBusinessContentChannelLabel(task.channel)}`,
    `发布目标: ${publishTargets}`,
    `任务目标: ${task.goal}`,
    `当前阶段: ${task.status}`,
    typeof task.scheduledFor === "number" ? `计划发布时间: ${new Date(task.scheduledFor).toLocaleString("zh-CN", { hour12: false })}` : "",
    task.latestDraftSummary ? `最近草稿摘要: ${task.latestDraftSummary}` : "",
    "",
    `任务说明:\n${task.brief}`,
    "",
    template.brief,
  ].filter(Boolean).join("\n");

  return {
    templateId: template.id,
    entityType: "contentTask",
    entityId: task.id,
    title: `${template.title} · ${task.title}`,
    accent: template.accent,
    summary: `${template.summary} · ${getBusinessContentChannelLabel(task.channel)} · ${getBusinessContentFormatLabel(task.format)}`,
    nextTab: template.nextTab,
    brief: template.brief,
    draft,
    steps: template.steps,
    context,
    source: template.source,
  };
}

export function findLatestWorkflowRunForEntity(
  workflowRuns: WorkflowRun[],
  entityType: NonNullable<WorkflowRun["entityType"]>,
  entityId: string,
) {
  return workflowRuns
    .filter(run => run.entityType === entityType && run.entityId === entityId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

const PLUGIN_WORKFLOW_TEMPLATES: Array<Omit<WorkflowTemplate, "accent" | "pluginName"> & { pluginId: string }> = [
  {
    id: "desk-tools-context-pack",
    pluginId: "desk-tools",
    title: "Context Pack Run",
    summary: "Bundle the strongest Desk references into a reusable execution packet.",
    nextTab: "tasks",
    brief: [
      "Review pinned Desk files, saved notes, and current scratchpad context.",
      "Build a compact context pack with the minimum references needed to execute cleanly.",
      "Call out what should stay pinned, what should become a desk note, and what should be dispatched next.",
    ].join("\n"),
    steps: ["Desk bundle", "Prompt compression", "Execution handoff"],
    source: "plugin",
  },
  {
    id: "artifact-preview-review",
    pluginId: "artifact-preview",
    title: "Artifact Review Loop",
    summary: "Revisit outputs, previews, and detached views before pushing another revision.",
    nextTab: "settings",
    brief: [
      "Inspect recent outputs and preview surfaces that are relevant to the current task.",
      "Identify what should be revised, promoted into a stable artifact, or discarded.",
      "Write the next revision brief so the team can move without reopening every file manually.",
    ].join("\n"),
    steps: ["Artifact scan", "Preview compare", "Revision brief"],
    source: "plugin",
  },
  {
    id: "skills-market-coverage",
    pluginId: "skills-market",
    title: "Capability Coverage",
    summary: "Check whether the current agent setup has the right skills and role coverage.",
    nextTab: "settings",
    brief: [
      "Review the current task angle and identify missing capabilities or weak coverage.",
      "Recommend the minimum set of skills, packs, or role changes needed for the next step.",
      "Separate immediate needs from future nice-to-have capabilities.",
    ].join("\n"),
    steps: ["Capability scan", "Role rebalance", "Recommended packs"],
    source: "plugin",
  },
  {
    id: "bridge-channel-route-check",
    pluginId: "bridge-channel",
    title: "Channel Route Check",
    summary: "Stage a bridge-oriented pass for message routes, channel readiness, and handoff risk.",
    nextTab: "settings",
    brief: [
      "Inspect the active channel adapters and current route assumptions.",
      "Call out missing bridges, route conflicts, and where manual follow-up is still required.",
      "Return the cleanest execution path for external message delivery or sync.",
    ].join("\n"),
    steps: ["Channel map", "Route validation", "Bridge handoff"],
    source: "plugin",
  },
  {
    id: "ops-telemetry-health-sweep",
    pluginId: "ops-telemetry",
    title: "Ops Health Sweep",
    summary: "Run a focused pass on shell health, execution visibility, and basic telemetry gaps.",
    nextTab: "dashboard",
    brief: [
      "Summarize the current shell state, running agents, and operational weak spots.",
      "Identify what should be surfaced as a card, metric, or warning inside the workbench.",
      "Keep the output focused on practical visibility improvements rather than backend rebuilds.",
    ].join("\n"),
    steps: ["Health snapshot", "Signal gaps", "Ops follow-up"],
    source: "plugin",
  },
  {
    id: "provider-lab-routing-pass",
    pluginId: "provider-lab",
    title: "Provider Routing Pass",
    summary: "Evaluate model/provider combinations before changing the main runtime settings.",
    nextTab: "settings",
    brief: [
      "Review the current provider setup, expected model routing, and any test gaps.",
      "Propose the safest experiment path for provider changes or routing validation.",
      "Separate stable defaults from experimental branches clearly.",
    ].join("\n"),
    steps: ["Provider scan", "Routing test", "Safe rollout"],
    source: "plugin",
  },
];

export function getAvailableWorkflowTemplates(enabledPluginIds: string[]) {
  const pluginTemplates = PLUGIN_WORKFLOW_TEMPLATES.flatMap(template => {
    if (!enabledPluginIds.includes(template.pluginId)) {
      return [];
    }

    const plugin = getPluginById(template.pluginId);
    if (!plugin) {
      return [];
    }

    return [
      {
        ...template,
        accent: plugin.accent,
        pluginName: plugin.name,
      } satisfies WorkflowTemplate,
    ];
  });

  return [...CORE_WORKFLOW_TEMPLATES, ...pluginTemplates];
}
