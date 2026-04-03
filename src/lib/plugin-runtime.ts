import type { ControlCenterSectionId } from "@/store/types";

export type PluginPermission = "restricted" | "full-access";

export interface PluginSpec {
  id: string;
  name: string;
  version: string;
  category: string;
  permission: PluginPermission;
  description: string;
  source: string;
  contributions: string[];
  accent: string;
  headline: string;
  actionLabel: string;
  actionTarget: "dashboard" | "tasks" | "meeting" | "settings";
  controlCenterSectionId?: ControlCenterSectionId;
}

export interface PluginPackSpec {
  id: string;
  title: string;
  description: string;
  pluginIds: string[];
  accent: string;
}

export const PLUGIN_CATALOG: PluginSpec[] = [
  {
    id: "desk-tools",
    name: "Desk Tools",
    version: "0.3.0",
    category: "Workspace",
    permission: "restricted",
    description: "Adds richer desk actions, context packaging, and workspace follow-up helpers.",
    source: "Built-in",
    contributions: ["desk actions", "context presets", "async workflows"],
    accent: "#7dd3fc",
    headline: "Turn Desk context into reusable next-step prompts and bundles.",
    actionLabel: "Open Desk",
    actionTarget: "tasks",
  },
  {
    id: "artifact-preview",
    name: "Artifact Preview",
    version: "0.2.4",
    category: "Preview",
    permission: "restricted",
    description: "Provides richer preview handling for generated outputs, docs, and detached views.",
    source: "Built-in",
    contributions: ["preview cards", "artifact surfaces", "pop-out views"],
    accent: "#c4b5fd",
    headline: "Keep generated outputs visible and ready to revisit.",
    actionLabel: "Open Artifacts",
    actionTarget: "settings",
    controlCenterSectionId: "artifacts",
  },
  {
    id: "skills-market",
    name: "Skills Market",
    version: "0.1.9",
    category: "Capabilities",
    permission: "restricted",
    description: "Surfaces installable skill packs and suggested bundles for different agent roles.",
    source: "Community-ready",
    contributions: ["skill packs", "catalog metadata", "role recommendations"],
    accent: "#86efac",
    headline: "Rebalance agent capabilities with prebuilt skill patterns.",
    actionLabel: "Open Skills",
    actionTarget: "settings",
    controlCenterSectionId: "skills",
  },
  {
    id: "bridge-channel",
    name: "Bridge Channel",
    version: "0.4.1",
    category: "Channels",
    permission: "full-access",
    description: "Connects external message channels and long-running bridge workflows into the shell.",
    source: "Advanced",
    contributions: ["channel adapters", "routing hooks", "event bridges"],
    accent: "#fda4af",
    headline: "Expose message routes and bridge visibility in one place.",
    actionLabel: "Open Channels",
    actionTarget: "settings",
    controlCenterSectionId: "channels",
  },
  {
    id: "ops-telemetry",
    name: "Ops Telemetry",
    version: "0.1.6",
    category: "Ops",
    permission: "restricted",
    description: "Adds health snapshots, capability coverage summaries, and basic execution telemetry.",
    source: "Built-in",
    contributions: ["status metrics", "heartbeat cards", "ops summary"],
    accent: "#fbbf24",
    headline: "Track shell health, coverage, and execution signals more visibly.",
    actionLabel: "Open Dashboard",
    actionTarget: "dashboard",
  },
  {
    id: "provider-lab",
    name: "Provider Lab",
    version: "0.2.1",
    category: "Models",
    permission: "full-access",
    description: "Extends provider testing and model routing with experimental connection flows.",
    source: "Experimental",
    contributions: ["provider templates", "routing tests", "lab settings"],
    accent: "#60a5fa",
    headline: "Experiment with provider combinations without losing the main setup flow.",
    actionLabel: "Open Settings",
    actionTarget: "settings",
    controlCenterSectionId: "settings",
  },
];

export const PLUGIN_PACKS: PluginPackSpec[] = [
  {
    id: "workspace-pack",
    title: "Workspace Pack",
    description: "Desk, previews, and ops helpers for day-to-day collaboration.",
    pluginIds: ["desk-tools", "artifact-preview", "ops-telemetry"],
    accent: "#7dd3fc",
  },
  {
    id: "growth-pack",
    title: "Growth Pack",
    description: "Capability discovery and materials workflow for content-heavy projects.",
    pluginIds: ["skills-market", "artifact-preview"],
    accent: "#86efac",
  },
  {
    id: "integration-pack",
    title: "Integration Pack",
    description: "Channel and provider experiments for teams pushing the desktop runtime harder.",
    pluginIds: ["bridge-channel", "provider-lab"],
    accent: "#fda4af",
  },
];

export function getPluginById(pluginId: string) {
  return PLUGIN_CATALOG.find(plugin => plugin.id === pluginId) ?? null;
}
