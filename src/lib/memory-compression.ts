import type { ChatSession } from "@/lib/chat-sessions";
import type { ExecutionRun, Task } from "@/store/types";
import type { WorkspaceDeskNote, WorkspaceProjectMemory } from "@/types/desktop-workspace";
import type { SemanticKnowledgeDocument } from "@/types/semantic-memory";
import type { BusinessEntityGraph } from "@/lib/business-graph";
import type { WorldModelSnapshot } from "@/types/world-model";

export const LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS = 230_000;
export const LONG_TERM_MEMORY_COMPRESSION_TRIGGER_TOKENS = 225_000;

function trimLine(value: string | undefined, maxLength = 180) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

export function isLongTermMemoryCompressionDoc(
  document: Pick<SemanticKnowledgeDocument, "id" | "tags"> | null | undefined,
) {
  if (!document) return false;
  return document.id.startsWith("memory-compression:")
    || document.tags.includes("memory-compression");
}

export function isManualInjectableKnowledgeDocument(document: SemanticKnowledgeDocument) {
  return document.manualInjectable !== false && !isLongTermMemoryCompressionDoc(document);
}

export function estimateContextTokens(input: string) {
  const text = String(input || "");
  if (!text.trim()) return 0;

  const cjkMatches = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const latinMatches = text.match(/[A-Za-z0-9_/-]+/g) ?? [];
  const punctuationMatches = text.match(/[^\sA-Za-z0-9_/\-\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];

  const cjkTokens = Math.ceil(cjkMatches.length * 1.15);
  const latinTokens = latinMatches.reduce((sum, item) => sum + Math.max(1, Math.ceil(item.length / 4)), 0);
  const punctuationTokens = Math.ceil(punctuationMatches.length * 0.35);

  return cjkTokens + latinTokens + punctuationTokens;
}

export function shouldAutoCompressLongTermMemory(estimatedTokens: number) {
  return estimatedTokens >= LONG_TERM_MEMORY_COMPRESSION_TRIGGER_TOKENS;
}

export function buildLongTermMemoryCompressionDoc(input: {
  projectId: string | null;
  rootPath: string | null;
  session: ChatSession | null;
  recentTasks: Task[];
  executionRuns: ExecutionRun[];
  projectMemories: WorkspaceProjectMemory[];
  deskNotes: WorkspaceDeskNote[];
  worldSnapshot: WorldModelSnapshot;
  graph: BusinessEntityGraph;
}): SemanticKnowledgeDocument {
  const now = Date.now();
  const projectKey = input.projectId ?? input.rootPath ?? "general";
  const recentUserTurns = input.recentTasks
    .filter(task => task.isUserMessage)
    .slice(-4)
    .map(task => `- ${trimLine(task.description, 160)}`);
  const recentAgentOutputs = input.recentTasks
    .filter(task => !task.isUserMessage)
    .slice(-4)
    .map(task => `- ${trimLine(task.result ?? task.description, 160)}`);
  const recentFailures = input.executionRuns
    .filter(run => run.status === "failed" || run.recoveryState === "manual-required" || run.recoveryState === "blocked")
    .slice(0, 4)
    .map(run => `- ${trimLine(run.lastFailureReason ?? run.lastRecoveryHint ?? run.instruction, 180)}`);
  const activeMemories = input.projectMemories
    .slice(0, 3)
    .map(memory => {
      const focus = memory.focusPath ? ` · ${memory.focusPath}` : "";
      const scratchpad = memory.scratchpad.trim() ? ` · ${trimLine(memory.scratchpad, 140)}` : "";
      return `- ${memory.name}${focus}${scratchpad}`;
    });
  const activeNotes = input.deskNotes.slice(0, 4).map(note => `- ${note.title}: ${trimLine(note.content, 120)}`);
  const worldAttention = input.worldSnapshot.attentionItems.slice(0, 4).map(item => `- ${item.title}: ${trimLine(item.detail, 140)}`);

  const content = [
    `Project compression snapshot for ${projectKey}.`,
    input.session?.title ? `Session: ${input.session.title}` : "",
    `World summary: ${input.worldSnapshot.summary}`,
    `Entity graph: ${input.graph.nodes.length} nodes, ${input.graph.edges.length} edges.`,
    recentUserTurns.length > 0 ? "Recent user intent:" : "",
    ...recentUserTurns,
    recentAgentOutputs.length > 0 ? "Recent agent outputs:" : "",
    ...recentAgentOutputs,
    recentFailures.length > 0 ? "Recent failures or takeover points:" : "",
    ...recentFailures,
    activeMemories.length > 0 ? "Pinned long-term memories:" : "",
    ...activeMemories,
    activeNotes.length > 0 ? "Key desk notes:" : "",
    ...activeNotes,
    worldAttention.length > 0 ? "Current attention items:" : "",
    ...worldAttention,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: `memory-compression:${projectKey}`,
    projectId: input.projectId,
    rootPath: input.rootPath,
    createdAt: now,
    updatedAt: now,
    title: "Long-Term Memory Compression",
    content,
    tags: ["long-term-memory", "memory-compression", "world-model"],
    sourceLabel: "自动记忆压缩",
    systemManaged: true,
    manualInjectable: false,
  };
}
