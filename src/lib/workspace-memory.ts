import type { WorkspaceProjectMemory } from "@/types/desktop-workspace";

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

function normalizePath(path: string | null | undefined) {
  return (path ?? "").replace(/\\/g, "/").toLowerCase();
}

function tokenize(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5/_\-.]+/i)
      .map(token => token.trim())
      .filter(token => token.length >= 3),
  );
}

function countIntersection(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function scoreProjectMemory(memory: WorkspaceProjectMemory, context: ProjectMemoryRecallContext) {
  const reasons: string[] = [];
  let score = 0;

  const memoryRoot = normalizePath(memory.rootPath);
  const workspaceRoot = normalizePath(context.workspaceRoot);
  const workspaceCurrentPath = normalizePath(context.workspaceCurrentPath);
  const activePreviewPath = normalizePath(context.activePreviewPath);
  const pinnedPaths = (context.pinnedPaths ?? []).map(path => normalizePath(path));

  if (memoryRoot && workspaceRoot && memoryRoot === workspaceRoot) {
    score += 12;
    reasons.push("same root");
  } else if (memoryRoot && workspaceCurrentPath && workspaceCurrentPath.startsWith(memoryRoot)) {
    score += 9;
    reasons.push("current path under memory root");
  }

  const memoryFocus = normalizePath(memory.focusPath);
  if (memoryFocus && activePreviewPath && memoryFocus === activePreviewPath) {
    score += 8;
    reasons.push("same focus file");
  } else if (memoryFocus && activePreviewPath && activePreviewPath.startsWith(memoryFocus)) {
    score += 5;
    reasons.push("focus path overlap");
  }

  const memoryPreviewPaths = memory.previews.map(preview => normalizePath(preview.path));
  const overlapCount = memoryPreviewPaths.filter(path => pinnedPaths.includes(path)).length;
  if (overlapCount > 0) {
    score += overlapCount * 4;
    reasons.push(`${overlapCount} pinned refs overlap`);
  }

  const contextTokens = new Set([
    ...tokenize(context.instruction),
    ...tokenize(context.recentTranscript),
    ...tokenize(context.workspaceCurrentPath),
    ...tokenize(context.activePreviewPath),
  ]);
  const memoryTokens = new Set([
    ...tokenize(memory.name),
    ...tokenize(memory.rootPath),
    ...tokenize(memory.focusPath),
    ...memory.previews.flatMap(preview => Array.from(tokenize(`${preview.name} ${preview.path}`))),
    ...memory.deskNotes.flatMap(note => Array.from(tokenize(`${note.title} ${note.content}`))),
    ...Array.from(tokenize(memory.scratchpad)),
  ]);

  const tokenHits = countIntersection(contextTokens, memoryTokens);
  if (tokenHits > 0) {
    score += Math.min(tokenHits, 6) * 2;
    reasons.push(`${tokenHits} shared keywords`);
  }

  return { score, reasons };
}

export function getRecommendedProjectMemories(
  memories: WorkspaceProjectMemory[],
  context: ProjectMemoryRecallContext,
  limit = 3,
) {
  return memories
    .map(memory => {
      const recommendation = scoreProjectMemory(memory, context);
      return {
        memory,
        score: recommendation.score,
        reasons: recommendation.reasons,
      } satisfies ProjectMemoryRecommendation;
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || right.memory.updatedAt - left.memory.updatedAt)
    .slice(0, limit);
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
