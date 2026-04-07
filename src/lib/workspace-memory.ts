import {
  buildDeskNoteDocument,
  buildKnowledgeDocumentDocument,
  buildProjectMemoryDocument,
  searchSemanticMemory,
  searchSemanticMemoryAsync,
} from "@/lib/semantic-memory";
import type { ModelProvider } from "@/store/types";
import type { WorkspaceDeskNote, WorkspaceProjectMemory } from "@/types/desktop-workspace";
import type { SemanticKnowledgeDocument, SemanticMemoryConfig } from "@/types/semantic-memory";

export interface ProjectMemoryRecallContext {
  instruction?: string;
  workspaceRoot?: string | null;
  workspaceCurrentPath?: string | null;
  activePreviewPath?: string | null;
  pinnedPaths?: string[];
  recentTranscript?: string;
}

export interface ProjectMemoryRecommendation {
  memory: WorkspaceProjectMemory;
  score: number;
  reasons: string[];
}

export interface DeskNoteRecommendation {
  note: WorkspaceDeskNote;
  score: number;
  reasons: string[];
}

export interface WorkspaceRecallRecommendation {
  memoryRecommendation: ProjectMemoryRecommendation | null;
  deskNoteRecommendations: DeskNoteRecommendation[];
  knowledgeRecommendations: KnowledgeDocumentRecommendation[];
}

export interface KnowledgeDocumentRecommendation {
  document: SemanticKnowledgeDocument;
  score: number;
  reasons: string[];
}

function trimBlock(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

export function describeProjectMemory(memory: WorkspaceProjectMemory) {
  return `${memory.previews.length} refs · ${memory.deskNotes.length} notes · ${memory.scratchpad.trim() ? "scratchpad ready" : "no scratchpad"} · ${memory.rootPath ?? "no root"}`;
}

export function buildProjectMemorySnippet(memory: WorkspaceProjectMemory) {
  const referenceSection = memory.previews.length
    ? memory.previews
        .map((preview, index) => `${index + 1}. ${preview.name} (${preview.kind})\n   Path: ${preview.path}`)
        .join("\n")
    : "No pinned references captured.";

  const noteSection = memory.deskNotes.length
    ? memory.deskNotes
        .map((note, index) => {
          const linked = note.linkedPath ? `\n   Linked: ${note.linkedPath}` : "";
          return `${index + 1}. ${note.title}${linked}\n   ${trimBlock(note.content, 220)}`;
        })
        .join("\n")
    : "No desk notes captured.";

  const scratchpadSection = memory.scratchpad.trim()
    ? `\n\nScratchpad snapshot:\n${memory.scratchpad.trim()}`
    : "";

  const focusSection = memory.focusPath ? `\nFocus path: ${memory.focusPath}` : "";

  return `Project memory: ${memory.name}\nWorkspace root: ${memory.rootPath ?? "not set"}${focusSection}\n\nPinned references:\n${referenceSection}\n\nDesk note snapshots:\n${noteSection}${scratchpadSection}`;
}

export function buildProjectMemoryScratchpad(memory: WorkspaceProjectMemory) {
  const sections = [
    `Project memory: ${memory.name}`,
    memory.rootPath ? `Workspace root: ${memory.rootPath}` : "",
    memory.focusPath ? `Focus path: ${memory.focusPath}` : "",
    memory.previews.length
      ? `Pinned references:\n${memory.previews
          .map((preview, index) => `${index + 1}. ${preview.name} · ${preview.path}`)
          .join("\n")}`
      : "",
    memory.scratchpad.trim() ? `Scratchpad snapshot:\n${memory.scratchpad.trim()}` : "",
    memory.deskNotes.length
      ? `Desk note snapshots:\n${memory.deskNotes
          .map((note, index) => `${index + 1}. ${note.title}\n${trimBlock(note.content, 320)}`)
          .join("\n\n")}`
      : "",
  ].filter(Boolean);

  return sections.join("\n\n");
}

export function buildDeskNoteSnippet(note: WorkspaceDeskNote) {
  const linkedSection = note.linkedPath
    ? `\nLinked reference: ${note.linkedName ?? note.linkedPath}\nPath: ${note.linkedPath}`
    : "";
  return `Desk note: ${note.title}${linkedSection}\n\n${note.content.trim()}`;
}

export function buildDeskNoteCollectionSnippet(notes: WorkspaceDeskNote[]) {
  if (notes.length === 0) return "";
  return `Relevant desk notes:\n${notes.map((note, index) => `${index + 1}. ${buildDeskNoteSnippet(note)}`).join("\n\n")}`;
}

export function describeDeskNote(note: WorkspaceDeskNote) {
  const linked = note.linkedName ?? note.linkedPath ?? "no linked reference";
  return `${note.pinned ? "pinned" : "floating"} · ${linked}`;
}

export function getRecommendedProjectMemories(
  memories: WorkspaceProjectMemory[],
  context: ProjectMemoryRecallContext,
  limit = 3,
) {
  return searchSemanticMemory(
    memories.map(memory => ({
      ...buildProjectMemoryDocument(memory),
      content: buildProjectMemoryScratchpad(memory),
    })),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit },
  )
    .map(result => ({
      memory: result.document.item,
      score: result.score,
      reasons: result.reasons,
    } satisfies ProjectMemoryRecommendation));
}

export async function getRecommendedProjectMemoriesAsync(
  memories: WorkspaceProjectMemory[],
  context: ProjectMemoryRecallContext,
  config: SemanticMemoryConfig,
  providers: ModelProvider[],
  limit = 3,
) {
  const results: Array<{
    document: { item: WorkspaceProjectMemory };
    score: number;
    reasons: string[];
  }> = await searchSemanticMemoryAsync(
    memories.map(memory => ({
      ...buildProjectMemoryDocument(memory),
      content: buildProjectMemoryScratchpad(memory),
    })),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit, config, providers },
  );

  return results.map((result: {
    document: { item: WorkspaceProjectMemory };
    score: number;
    reasons: string[];
  }) => ({
    memory: result.document.item,
    score: result.score,
    reasons: result.reasons,
  } satisfies ProjectMemoryRecommendation));
}

export function getAutoRecalledProjectMemory(
  memories: WorkspaceProjectMemory[],
  context: ProjectMemoryRecallContext,
  threshold = 10,
) {
  const top = getRecommendedProjectMemories(memories, context, 1)[0];
  if (!top || top.score < threshold) return null;
  return top;
}

export function getRecommendedDeskNotes(
  notes: WorkspaceDeskNote[],
  context: ProjectMemoryRecallContext,
  limit = 3,
) {
  return searchSemanticMemory(
    notes.map(buildDeskNoteDocument),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit },
  )
    .map(result => ({
      note: result.document.item,
      score: result.score,
      reasons: result.reasons,
    } satisfies DeskNoteRecommendation));
}

export async function getRecommendedDeskNotesAsync(
  notes: WorkspaceDeskNote[],
  context: ProjectMemoryRecallContext,
  config: SemanticMemoryConfig,
  providers: ModelProvider[],
  limit = 3,
) {
  const results: Array<{
    document: { item: WorkspaceDeskNote };
    score: number;
    reasons: string[];
  }> = await searchSemanticMemoryAsync(
    notes.map(buildDeskNoteDocument),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit, config, providers },
  );

  return results.map((result: {
    document: { item: WorkspaceDeskNote };
    score: number;
    reasons: string[];
  }) => ({
    note: result.document.item,
    score: result.score,
    reasons: result.reasons,
  } satisfies DeskNoteRecommendation));
}

export function getAutoRecalledDeskNote(
  notes: WorkspaceDeskNote[],
  context: ProjectMemoryRecallContext,
  threshold = 9,
) {
  const top = getRecommendedDeskNotes(notes, context, 1)[0];
  if (!top || top.score < threshold) return null;
  return top;
}

export function buildKnowledgeDocumentSnippet(document: SemanticKnowledgeDocument) {
  const tags = document.tags.length > 0 ? `\nTags: ${document.tags.join("、")}` : "";
  const source = document.sourceLabel ? `\nSource: ${document.sourceLabel}` : "";
  return `Knowledge doc: ${document.title}${source}${tags}\n\n${document.content.trim()}`;
}

export function buildKnowledgeDocumentCollectionSnippet(documents: SemanticKnowledgeDocument[]) {
  if (documents.length === 0) return "";
  return `Relevant knowledge docs:\n${documents
    .map((document, index) => `${index + 1}. ${buildKnowledgeDocumentSnippet(document)}`)
    .join("\n\n")}`;
}

export function describeKnowledgeDocument(document: SemanticKnowledgeDocument) {
  return `${document.sourceLabel} · ${document.tags.join("、") || "无标签"}`;
}

export function getRecommendedKnowledgeDocuments(
  documents: SemanticKnowledgeDocument[],
  context: ProjectMemoryRecallContext,
  limit = 3,
) {
  return searchSemanticMemory(
    documents.map(buildKnowledgeDocumentDocument),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit },
  ).map(result => ({
    document: result.document.item,
    score: result.score,
    reasons: result.reasons,
  } satisfies KnowledgeDocumentRecommendation));
}

export async function getRecommendedKnowledgeDocumentsAsync(
  documents: SemanticKnowledgeDocument[],
  context: ProjectMemoryRecallContext,
  config: SemanticMemoryConfig,
  providers: ModelProvider[],
  limit = 3,
) {
  const results: Array<{
    document: { item: SemanticKnowledgeDocument };
    score: number;
    reasons: string[];
  }> = await searchSemanticMemoryAsync(
    documents.map(buildKnowledgeDocumentDocument),
    {
      query: context.instruction,
      workspaceRoot: context.workspaceRoot,
      workspaceCurrentPath: context.workspaceCurrentPath,
      activePreviewPath: context.activePreviewPath,
      pinnedPaths: context.pinnedPaths,
      recentTranscript: context.recentTranscript,
    },
    { limit, config, providers },
  );

  return results.map((result: {
    document: { item: SemanticKnowledgeDocument };
    score: number;
    reasons: string[];
  }) => ({
    document: result.document.item,
    score: result.score,
    reasons: result.reasons,
  } satisfies KnowledgeDocumentRecommendation));
}

export function getAutoRecalledKnowledgeDocument(
  documents: SemanticKnowledgeDocument[],
  context: ProjectMemoryRecallContext,
  threshold = 9,
) {
  const top = getRecommendedKnowledgeDocuments(documents, context, 1)[0];
  if (!top || top.score < threshold) return null;
  return top;
}

export function getAutoRecalledWorkspaceContext(
  memories: WorkspaceProjectMemory[],
  notes: WorkspaceDeskNote[],
  documents: SemanticKnowledgeDocument[],
  context: ProjectMemoryRecallContext,
  memoryThreshold = 10,
  noteThreshold = 9,
  documentThreshold = 9,
): WorkspaceRecallRecommendation {
  return {
    memoryRecommendation: getAutoRecalledProjectMemory(memories, context, memoryThreshold),
    deskNoteRecommendations: getRecommendedDeskNotes(notes, context, 3).filter(item => item.score >= noteThreshold),
    knowledgeRecommendations: getRecommendedKnowledgeDocuments(documents, context, 3).filter(item => item.score >= documentThreshold),
  };
}

export async function getAutoRecalledWorkspaceContextAsync(
  memories: WorkspaceProjectMemory[],
  notes: WorkspaceDeskNote[],
  documents: SemanticKnowledgeDocument[],
  context: ProjectMemoryRecallContext,
  config: SemanticMemoryConfig,
  providers: ModelProvider[],
  memoryThreshold = 10,
  noteThreshold = 9,
  documentThreshold = 9,
): Promise<WorkspaceRecallRecommendation> {
  const [memoryRecommendations, deskNoteRecommendations, knowledgeRecommendations] = await Promise.all([
    getRecommendedProjectMemoriesAsync(memories, context, config, providers, 1),
    getRecommendedDeskNotesAsync(notes, context, config, providers, 3),
    getRecommendedKnowledgeDocumentsAsync(documents, context, config, providers, 3),
  ]);

  return {
    memoryRecommendation: memoryRecommendations[0] && memoryRecommendations[0].score >= memoryThreshold
      ? memoryRecommendations[0]
      : null,
    deskNoteRecommendations: deskNoteRecommendations.filter((item: DeskNoteRecommendation) => item.score >= noteThreshold),
    knowledgeRecommendations: knowledgeRecommendations.filter((item: KnowledgeDocumentRecommendation) => item.score >= documentThreshold),
  };
}
