import type { BusinessContentChannel, BusinessEntityType } from "@/types/business-entities";
import type { AppTab } from "@/store/types";

export type WorkflowTargetTab = AppTab;

export type WorkflowSource = "core" | "plugin";

export type WorkflowStatus = "queued" | "staged" | "in-progress" | "completed" | "archived";

export interface WorkflowContextSnapshot {
  deskRefs: number;
  deskNotes: number;
  contextPacks: number;
  plugins: number;
  preferredContentChannel?: BusinessContentChannel;
  riskyContentChannels?: BusinessContentChannel[];
  manualApprovalRequired?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  accent: string;
  summary: string;
  nextTab: WorkflowTargetTab;
  brief: string;
  steps: string[];
  source: WorkflowSource;
  pluginId?: string;
  pluginName?: string;
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  title: string;
  accent: string;
  summary: string;
  nextTab: WorkflowTargetTab;
  brief: string;
  draft: string;
  steps: string[];
  status: WorkflowStatus;
  launchCount: number;
  createdAt: number;
  updatedAt: number;
  context: WorkflowContextSnapshot;
  source: WorkflowSource;
  entityType?: BusinessEntityType;
  entityId?: string;
  pluginId?: string;
  pluginName?: string;
  lastLaunchedAt?: number;
  completedAt?: number;
}
