import type { BusinessEntityType } from "@/types/business-entities";

export type WorldAttentionLevel = "healthy" | "watch" | "risk";

export interface WorldAttentionItem {
  id: string;
  title: string;
  detail: string;
  level: WorldAttentionLevel;
  entityType?: BusinessEntityType;
  entityId?: string;
}

export interface WorldModelSnapshot {
  id: string;
  projectId: string | null;
  rootPath: string | null;
  createdAt: number;
  updatedAt: number;
  summary: string;
  automationReadiness: number;
  graphNodes: number;
  graphEdges: number;
  openLoops: string[];
  attentionItems: WorldAttentionItem[];
}
