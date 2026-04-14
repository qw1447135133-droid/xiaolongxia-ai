import type { ExecutionAuditReceipt, ExecutionRun } from "@/store/types";
import type { HermesContextBundle } from "@/lib/hermes-context";
import type { ContextMentionRef } from "@/types/context-mentions";
import type { WorkspaceDeskNote, WorkspaceProjectMemory } from "@/types/desktop-workspace";
import type { SemanticKnowledgeDocument } from "@/types/semantic-memory";
import type { WorldModelSnapshot } from "@/types/world-model";

export function buildExecutionAuditReceipt(input: {
  bundle: HermesContextBundle;
  contextMentions: ContextMentionRef[];
  projectMemory: WorkspaceProjectMemory | null;
  deskNotes: WorkspaceDeskNote[];
  knowledgeDocs: SemanticKnowledgeDocument[];
  customerCount: number;
  graphNodes: number;
  graphEdges: number;
  worldSnapshot: WorldModelSnapshot;
}): ExecutionAuditReceipt {
  return {
    createdAt: Date.now(),
    compressionEnabled: input.bundle.compressionEnabled,
    estimatedStandardTokens: input.bundle.estimatedStandardTokens,
    estimatedFinalTokens: input.bundle.estimatedFinalTokens,
    activeLayerIds: input.bundle.activeLayers.map(layer => layer.id),
    finalLayerIds: input.bundle.finalLayers.map(layer => layer.id),
    layers: input.bundle.finalLayers.map(layer => ({
      id: layer.id,
      title: layer.title,
      summary: layer.summary,
      estimatedTokens: layer.estimatedTokens,
    })),
    mentionLabels: input.contextMentions.map(item => item.label),
    projectMemoryName: input.projectMemory?.name,
    deskNoteTitles: input.deskNotes.map(item => item.title),
    knowledgeDocTitles: input.knowledgeDocs.map(item => item.title),
    customerCount: input.customerCount,
    graphNodes: input.graphNodes,
    graphEdges: input.graphEdges,
    worldSummary: input.worldSnapshot.summary,
    compressedDocumentTitle: input.bundle.compressedDocument?.title,
  };
}

function formatReceipt(receipt?: ExecutionAuditReceipt) {
  if (!receipt) return "";
  const lines = [
    `Context tokens: ${receipt.estimatedStandardTokens.toLocaleString()} -> ${receipt.estimatedFinalTokens.toLocaleString()}`,
    `Compression: ${receipt.compressionEnabled ? "on" : "off"}`,
    `Layers: ${receipt.layers.map(layer => `${layer.title}(${layer.estimatedTokens})`).join(" / ")}`,
  ];
  if (receipt.projectMemoryName) lines.push(`Project memory: ${receipt.projectMemoryName}`);
  if (receipt.mentionLabels.length > 0) lines.push(`Mentions: ${receipt.mentionLabels.join(" / ")}`);
  if (receipt.worldSummary) lines.push(`World: ${receipt.worldSummary}`);
  return lines.join("\n");
}

export function buildExecutionReplayInstruction(run: Pick<ExecutionRun, "instruction" | "events" | "lastFailureReason" | "lastRecoveryHint" | "contextReceipt">) {
  const trail = run.events
    .slice(-8)
    .map(event => `- ${event.title}${event.detail ? `: ${event.detail}` : ""}`)
    .join("\n");

  return [
    "请基于这次历史执行继续推进，不要重新从零分析。",
    `原始目标:\n${run.instruction}`,
    run.lastFailureReason ? `最近失败:\n${run.lastFailureReason}` : "",
    run.lastRecoveryHint ? `恢复提示:\n${run.lastRecoveryHint}` : "",
    formatReceipt(run.contextReceipt),
    trail ? `最近执行轨迹:\n${trail}` : "",
    "先复用已有上下文判断哪里中断，再给出继续执行或恢复方案。",
  ].filter(Boolean).join("\n\n");
}
