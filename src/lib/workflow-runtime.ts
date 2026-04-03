import { getPluginById } from "@/lib/plugin-runtime";
import type { WorkflowTemplate } from "@/types/workflows";

const CORE_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
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
