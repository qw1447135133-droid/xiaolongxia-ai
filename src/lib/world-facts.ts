import type { WorkspaceProjectFact } from "@/types/desktop-workspace";
import type { WorldModelSnapshot } from "@/types/world-model";
import type { ExecutionRun, ExecutionEvent } from "@/store/types";

function stableFactId(prefix: string, key: string) {
  return `${prefix}-${key.replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 80)}`;
}

export function buildWorldSnapshotFacts(snapshot: WorldModelSnapshot, executionRunId: string): WorkspaceProjectFact[] {
  const createdAt = Date.now();
  const attentionFacts = snapshot.attentionItems.slice(0, 6).map((item) => ({
    id: stableFactId("fact", `${snapshot.id}:${item.id}`),
    key: `${snapshot.projectId ?? "general"}:${item.id}`,
    summary: item.title,
    detail: item.detail,
    sourceType: "world_model" as const,
    sourceLabel: `World snapshot ${snapshot.id}`,
    sourceRunId: executionRunId,
    sourceIds: [snapshot.id, executionRunId],
    entityType: item.entityType ?? null,
    entityId: item.entityId ?? null,
    confidence: item.level === "risk" ? "high" as const : "medium" as const,
    createdAt,
    updatedAt: createdAt,
  }));

  const loopFacts = snapshot.openLoops.slice(0, 4).map((detail, index) => ({
    id: stableFactId("fact", `${snapshot.id}:loop:${index}`),
    key: `${snapshot.projectId ?? "general"}:loop:${detail}`,
    summary: `Open loop ${index + 1}`,
    detail,
    sourceType: "world_model" as const,
    sourceLabel: `World snapshot ${snapshot.id}`,
    sourceRunId: executionRunId,
    sourceIds: [snapshot.id, executionRunId],
    entityType: null,
    entityId: null,
    confidence: "medium" as const,
    createdAt,
    updatedAt: createdAt,
  }));

  return [...attentionFacts, ...loopFacts];
}

export function buildExecutionOutcomeFacts(run: ExecutionRun, latestEvent?: ExecutionEvent | null): WorkspaceProjectFact[] {
  const createdAt = Date.now();
  const detail = run.lastFailureReason
    || latestEvent?.detail
    || latestEvent?.title
    || run.lastRecoveryHint
    || run.instruction;

  if (!detail) return [];

  return [
    {
      id: stableFactId("fact", `${run.id}:${run.status}`),
      key: `${run.projectId ?? "general"}:run:${run.id}:${run.status}`,
      summary:
        run.status === "completed"
          ? "Execution completed"
          : run.recoveryState === "manual-required"
            ? "Execution needs manual takeover"
            : "Execution failure",
      detail,
      sourceType: "execution",
      sourceLabel: `Execution run ${run.id}`,
      sourceRunId: run.id,
      sourceIds: [run.id],
      entityType: run.entityType ?? null,
      entityId: run.entityId ?? null,
      confidence: run.status === "completed" ? "medium" : "high",
      createdAt,
      updatedAt: createdAt,
    },
  ];
}
