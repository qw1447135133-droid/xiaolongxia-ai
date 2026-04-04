"use client";

import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import type { ExecutionRun, ExecutionRunSource } from "@/store/types";
import {
  buildDeskNoteCollectionSnippet,
  buildKnowledgeDocumentCollectionSnippet,
  buildProjectMemorySnippet,
  getAutoRecalledWorkspaceContext,
} from "@/lib/workspace-memory";
import { filterByProjectScope } from "@/lib/project-context";
import { randomId } from "@/lib/utils";

type DispatchAttachmentMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: string;
  lastModified: number;
};

export function sendExecutionDispatch({
  instruction,
  source = "chat",
  attachments = [],
  includeUserMessage = false,
  taskDescription,
  includeActiveProjectMemory = false,
  sessionId,
  workflowRunId,
  entityType,
  entityId,
  retryOfRunId,
  lastRecoveryHint,
}: {
  instruction: string;
  source?: ExecutionRunSource;
  attachments?: DispatchAttachmentMeta[];
  includeUserMessage?: boolean;
  taskDescription?: string;
  includeActiveProjectMemory?: boolean;
  sessionId?: string;
  workflowRunId?: string;
  entityType?: "customer" | "lead" | "ticket" | "contentTask" | "channelSession";
  entityId?: string;
  retryOfRunId?: string;
  lastRecoveryHint?: string;
}) {
  const trimmed = instruction.trim();
  const store = useStore.getState();
  const resolvedSessionId = sessionId && store.chatSessions.some(session => session.id === sessionId)
    ? sessionId
    : store.activeSessionId;
  const activeSession = store.chatSessions.find(session => session.id === resolvedSessionId) ?? null;
  const scopedProjectMemories = filterByProjectScope(store.workspaceProjectMemories, activeSession ?? {});
  const scopedDeskNotes = filterByProjectScope(store.workspaceDeskNotes, activeSession ?? {});
  const scopedKnowledgeDocs = filterByProjectScope(store.semanticKnowledgeDocs, activeSession ?? {});
  const activeProjectMemory = includeActiveProjectMemory && store.activeWorkspaceProjectMemoryId
    ? scopedProjectMemories.find(memory => memory.id === store.activeWorkspaceProjectMemoryId) ?? null
    : null;
  const enableSemanticRecall = includeActiveProjectMemory || !store.activeWorkspaceProjectMemoryId;
  const recallContext = {
    instruction: trimmed,
    workspaceRoot: store.workspaceRoot,
    workspaceCurrentPath: store.workspaceCurrentPath,
    activePreviewPath: store.workspaceActivePreviewPath,
    pinnedPaths: store.workspacePinnedPreviews.map(preview => preview.path),
    recentTranscript: store.tasks.slice(-8).map(task => task.result ?? task.description).join("\n\n"),
  };
  const autoRecalledWorkspaceContext = enableSemanticRecall
    ? getAutoRecalledWorkspaceContext(
        scopedProjectMemories,
        store.semanticMemoryConfig.autoRecallDeskNotes ? scopedDeskNotes : [],
        store.semanticMemoryConfig.autoRecallKnowledgeDocs ? scopedKnowledgeDocs : [],
        recallContext,
        store.semanticMemoryConfig.autoRecallProjectMemories ? 10 : Number.MAX_SAFE_INTEGER,
        store.semanticMemoryConfig.autoRecallDeskNotes ? 9 : Number.MAX_SAFE_INTEGER,
        store.semanticMemoryConfig.autoRecallKnowledgeDocs ? 9 : Number.MAX_SAFE_INTEGER,
      )
    : { memoryRecommendation: null, deskNoteRecommendations: [], knowledgeRecommendations: [] };
  const resolvedProjectMemory = activeProjectMemory ?? autoRecalledWorkspaceContext.memoryRecommendation?.memory ?? null;
  const recalledDeskNotes = autoRecalledWorkspaceContext.deskNoteRecommendations
    .map(item => item.note)
    .slice(0, 2);
  const recalledKnowledgeDocs = autoRecalledWorkspaceContext.knowledgeRecommendations
    .map(item => item.document)
    .slice(0, 2);
  const noteSnippet = recalledDeskNotes.length > 0 ? buildDeskNoteCollectionSnippet(recalledDeskNotes) : "";
  const knowledgeSnippet = recalledKnowledgeDocs.length > 0
    ? buildKnowledgeDocumentCollectionSnippet(recalledKnowledgeDocs)
    : "";
  const finalInstruction = resolvedProjectMemory || noteSnippet || knowledgeSnippet
    ? [
        resolvedProjectMemory ? buildProjectMemorySnippet(resolvedProjectMemory) : "",
        noteSnippet,
        knowledgeSnippet,
        `User request:\n${trimmed}`,
      ].filter(Boolean).join("\n\n---\n\n")
    : trimmed;
  const executionRunId = store.createExecutionRun({
    sessionId: resolvedSessionId,
    instruction: trimmed,
    source,
    workflowRunId,
    entityType,
    entityId,
    retryOfRunId,
    lastRecoveryHint,
  });

  if (retryOfRunId) {
    store.updateExecutionRun({
      id: retryOfRunId,
      recoveryState: "none",
      lastRecoveryHint: `已转入新的恢复执行 ${executionRunId.slice(0, 12)}。`,
      timestamp: Date.now(),
    });
  }

  if (resolvedProjectMemory) {
    store.updateExecutionRun({
      id: executionRunId,
      event: {
        id: `evt-memory-${Date.now()}`,
        type: "system",
        title: activeProjectMemory ? "已附加项目记忆" : "已自动召回项目记忆",
        detail: activeProjectMemory
          ? resolvedProjectMemory.name
          : `${resolvedProjectMemory.name}${autoRecalledWorkspaceContext.memoryRecommendation?.reasons.length ? ` · ${autoRecalledWorkspaceContext.memoryRecommendation.reasons.join(", ")}` : ""}`,
        timestamp: Date.now(),
      },
    });
  }

  if (recalledDeskNotes.length > 0) {
    store.updateExecutionRun({
      id: executionRunId,
      event: {
        id: `evt-note-${Date.now()}`,
        type: "system",
        title: "已自动召回 Desk Notes",
        detail: autoRecalledWorkspaceContext.deskNoteRecommendations
          .slice(0, 2)
          .map(item => `${item.note.title}${item.reasons.length ? ` · ${item.reasons.join(", ")}` : ""}`)
          .join(" / "),
        timestamp: Date.now(),
      },
    });
  }

  if (recalledKnowledgeDocs.length > 0) {
    store.updateExecutionRun({
      id: executionRunId,
      event: {
        id: `evt-knowledge-${Date.now()}`,
        type: "system",
        title: "已自动召回知识文档",
        detail: autoRecalledWorkspaceContext.knowledgeRecommendations
          .slice(0, 2)
          .map(item => `${item.document.title}${item.reasons.length ? ` · ${item.reasons.join(", ")}` : ""}`)
          .join(" / "),
        timestamp: Date.now(),
      },
    });
  }

  if (includeUserMessage) {
    store.addTask({
      id: randomId(),
      description: taskDescription ?? trimmed,
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      createdAt: Date.now(),
      completedAt: Date.now(),
      isUserMessage: true,
    });
  }

  sendWs({
    type: "settings_sync",
    providers: store.providers,
    agentConfigs: store.agentConfigs,
    userNickname: store.userNickname,
    desktopProgramSettings: store.desktopProgramSettings,
  });

  const ok = sendWs({
    type: "dispatch",
    instruction: finalInstruction,
    attachments,
    sessionId: resolvedSessionId,
    executionRunId,
    source,
  });

  if (!ok) {
    store.failExecutionRun(executionRunId, "WebSocket 连接已断开，任务未成功发送。", {
      recoveryState: "blocked",
      lastRecoveryHint: "重连 WebSocket 后可一键重试，或回到聊天接管这次执行。",
    });
    if (retryOfRunId) {
      store.updateExecutionRun({
        id: retryOfRunId,
        recoveryState: "retryable",
        lastRecoveryHint: lastRecoveryHint ?? "恢复执行发送失败，可再次重试或回到聊天接管。",
        timestamp: Date.now(),
      });
    }
  }

  return { ok, executionRunId };
}

export function retryExecutionDispatch(
  run: Pick<ExecutionRun, "id" | "instruction" | "source" | "sessionId">,
  options?: {
    includeUserMessage?: boolean;
    taskDescription?: string;
    includeActiveProjectMemory?: boolean;
    lastRecoveryHint?: string;
  },
) {
  return sendExecutionDispatch({
    instruction: run.instruction,
    source: run.source,
    includeUserMessage: options?.includeUserMessage ?? true,
    taskDescription: options?.taskDescription ?? `[重试执行] ${run.instruction}`,
    includeActiveProjectMemory: options?.includeActiveProjectMemory ?? true,
    sessionId: run.sessionId,
    retryOfRunId: run.id,
    lastRecoveryHint: options?.lastRecoveryHint,
  });
}
