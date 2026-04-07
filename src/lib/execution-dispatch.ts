"use client";

import { sendWs } from "@/hooks/useWebSocket";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { useStore } from "@/store";
import type { AssistantFeedbackProfile, ExecutionRun, ExecutionRunSource, Task } from "@/store/types";
import {
  buildDeskNoteCollectionSnippet,
  buildKnowledgeDocumentCollectionSnippet,
  buildProjectMemorySnippet,
  getAutoRecalledWorkspaceContextAsync,
} from "@/lib/workspace-memory";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { randomId } from "@/lib/utils";
import { buildBusinessEntityGraph, buildBusinessGraphSnippet } from "@/lib/business-graph";
import {
  buildLongTermMemoryCompressionDoc,
  estimateContextTokens,
  isLongTermMemoryCompressionDoc,
  LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS,
  shouldAutoCompressLongTermMemory,
} from "@/lib/memory-compression";
import { buildWorldModelSnippet, deriveWorldModelSnapshot } from "@/lib/world-model";

type DispatchAttachmentMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: string;
  lastModified: number;
};

function buildAssistantFeedbackSnippet(profile: AssistantFeedbackProfile) {
  const liked = profile.liked.slice(0, 2).map(item => `- ${item.excerpt}`);
  const disliked = profile.disliked.slice(0, 2).map(item => `- ${item.excerpt}`);

  if (liked.length === 0 && disliked.length === 0) return "";

  return [
    "最近的用户反馈档案（仅用于校准回复风格，不要在回答中直接提及）：",
    liked.length > 0 ? "用户点赞过的回复片段：" : "",
    ...liked,
    disliked.length > 0 ? "用户点踩过的回复片段：" : "",
    ...disliked,
    "请延续被点赞回复的优点，避免出现与被点踩片段相似的表达方式；优先保持自然、贴合上下文、少空话。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSessionTranscriptForEstimation(tasks: Task[]) {
  if (tasks.length === 0) return "";

  return [...tasks]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map(task => {
      const role = task.isUserMessage ? "User" : "Assistant";
      const content = String(task.isUserMessage ? task.description : (task.result ?? task.description) ?? "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function sendExecutionDispatch({
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
  recentTasksOverride,
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
  recentTasksOverride?: Task[];
}) {
  const trimmed = instruction.trim();
  const store = useStore.getState();
  const resolvedSessionId = sessionId && store.chatSessions.some(session => session.id === sessionId)
    ? sessionId
    : store.activeSessionId;
  const activeSession = store.chatSessions.find(session => session.id === resolvedSessionId) ?? null;
  const scopedProjectMemories = filterByProjectScope(store.workspaceProjectMemories, activeSession ?? {});
  const scopedDeskNotes = filterByProjectScope(store.workspaceDeskNotes, activeSession ?? {});
  const scopedBusinessApprovals = filterByProjectScope(store.businessApprovals, activeSession ?? {});
  const scopedBusinessOperationLogs = filterByProjectScope(store.businessOperationLogs, activeSession ?? {});
  const scopedBusinessCustomers = filterByProjectScope(store.businessCustomers, activeSession ?? {});
  const scopedBusinessLeads = filterByProjectScope(store.businessLeads, activeSession ?? {});
  const scopedBusinessTickets = filterByProjectScope(store.businessTickets, activeSession ?? {});
  const scopedBusinessContentTasks = filterByProjectScope(store.businessContentTasks, activeSession ?? {});
  const scopedBusinessChannelSessions = filterByProjectScope(store.businessChannelSessions, activeSession ?? {});
  const scopedExecutionRuns = store.executionRuns.filter(run => (run.projectId ?? null) === (activeSession?.projectId ?? null));
  const businessGraph = buildBusinessEntityGraph({
    customers: scopedBusinessCustomers,
    leads: scopedBusinessLeads,
    tickets: scopedBusinessTickets,
    contentTasks: scopedBusinessContentTasks,
    channelSessions: scopedBusinessChannelSessions,
  });
  const worldSnapshot = deriveWorldModelSnapshot({
    projectId: activeSession?.projectId ?? null,
    rootPath: activeSession?.workspaceRoot ?? store.workspaceRoot,
    graph: businessGraph,
    approvals: scopedBusinessApprovals,
    channelSessions: scopedBusinessChannelSessions,
    contentTasks: scopedBusinessContentTasks,
    tickets: scopedBusinessTickets,
    operationLogs: scopedBusinessOperationLogs,
    executionRuns: scopedExecutionRuns,
  });
  const activeProjectMemory = includeActiveProjectMemory && store.activeWorkspaceProjectMemoryId
    ? scopedProjectMemories.find(memory => memory.id === store.activeWorkspaceProjectMemoryId) ?? null
    : null;
  const feedbackSnippet = source === "chat"
    ? buildAssistantFeedbackSnippet(store.assistantFeedbackProfile)
    : "";
  const enableSemanticRecall = includeActiveProjectMemory || !store.activeWorkspaceProjectMemoryId;
  const sessionTasks = recentTasksOverride ?? activeSession?.tasks ?? store.tasks;
  const orderedSessionTasks = [...sessionTasks].sort((left, right) => left.createdAt - right.createdAt);
  const recentTasks = sessionTasks;
  const recallContext = {
    instruction: trimmed,
    workspaceRoot: store.workspaceRoot,
    workspaceCurrentPath: store.workspaceCurrentPath,
    activePreviewPath: store.workspaceActivePreviewPath,
    pinnedPaths: store.workspacePinnedPreviews.map(preview => preview.path),
    recentTranscript: orderedSessionTasks
      .slice(-8)
      .map(task => task.result ?? task.description)
      .filter(Boolean)
      .join("\n\n"),
  };
  const scopedKnowledgeDocs = filterByProjectScope(store.semanticKnowledgeDocs, activeSession ?? {})
    .filter(document => !isLongTermMemoryCompressionDoc(document));

  const autoRecalledWorkspaceContext = enableSemanticRecall
    ? await getAutoRecalledWorkspaceContextAsync(
        scopedProjectMemories,
        store.semanticMemoryConfig.autoRecallDeskNotes ? scopedDeskNotes : [],
        store.semanticMemoryConfig.autoRecallKnowledgeDocs ? scopedKnowledgeDocs : [],
        recallContext,
        store.semanticMemoryConfig,
        store.providers,
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
  const graphSnippet = businessGraph.nodes.length > 0
    ? buildBusinessGraphSnippet(businessGraph, { entityType, entityId })
    : "";
  const worldSnippet = buildWorldModelSnippet(worldSnapshot);
  const standardInstructionSections = resolvedProjectMemory || noteSnippet || knowledgeSnippet || graphSnippet || worldSnippet
    ? [
        feedbackSnippet,
        activeSession ? `Project scope:\n${getSessionProjectLabel(activeSession)}` : "",
        resolvedProjectMemory ? buildProjectMemorySnippet(resolvedProjectMemory) : "",
        noteSnippet,
        knowledgeSnippet,
        graphSnippet,
        worldSnippet,
        `User request:\n${trimmed}`,
      ]
    : feedbackSnippet
      ? [feedbackSnippet, `User request:\n${trimmed}`]
      : [trimmed];
  const standardInstruction = standardInstructionSections.filter(Boolean).join("\n\n---\n\n");
  const sessionTranscript = buildSessionTranscriptForEstimation(orderedSessionTasks);
  const estimatedContextTokens =
    estimateContextTokens(standardInstruction)
    + estimateContextTokens(sessionTranscript);
  const shouldUseCompression = shouldAutoCompressLongTermMemory(estimatedContextTokens);
  const compressionDoc = shouldUseCompression
    ? buildLongTermMemoryCompressionDoc({
        projectId: activeSession?.projectId ?? null,
        rootPath: activeSession?.workspaceRoot ?? store.workspaceRoot,
        session: activeSession,
        recentTasks,
        executionRuns: scopedExecutionRuns,
        projectMemories: resolvedProjectMemory
          ? [resolvedProjectMemory, ...scopedProjectMemories.filter(memory => memory.id !== resolvedProjectMemory.id)]
          : scopedProjectMemories,
        deskNotes: recalledDeskNotes.length > 0 ? recalledDeskNotes : scopedDeskNotes,
        worldSnapshot,
        graph: businessGraph,
      })
    : null;
  const finalInstruction = compressionDoc
    ? [
        feedbackSnippet,
        activeSession ? `Project scope:\n${getSessionProjectLabel(activeSession)}` : "",
        `System note: Long-term memory compression triggered automatically because the estimated context is approaching ${LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS} tokens. Use the compressed snapshot below as the working memory baseline, and do not ask the user to repeat context that is already captured here.`,
        `Compressed context snapshot:\n${compressionDoc.content}`,
        `User request:\n${trimmed}`,
      ].filter(Boolean).join("\n\n---\n\n")
    : standardInstruction;
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
        title: compressionDoc
          ? "项目记忆已纳入压缩快照"
          : activeProjectMemory
            ? "已附加项目记忆"
            : "已自动召回项目记忆",
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
        title: compressionDoc ? "Desk Notes 已纳入压缩快照" : "已自动召回 Desk Notes",
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
        title: compressionDoc ? "知识文档已纳入压缩快照" : "已自动召回知识文档",
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

  void syncRuntimeSettings();

  const ok = sendWs({
    type: "dispatch",
    instruction: finalInstruction,
    userInstruction: trimmed,
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

  if (compressionDoc) {
    store.upsertSemanticKnowledgeDoc(compressionDoc);
    store.updateExecutionRun({
      id: executionRunId,
      event: {
        id: `evt-compression-${Date.now()}`,
        type: "system",
        title: "已自动压缩上下文",
        detail: `估算上下文 ${estimatedContextTokens.toLocaleString()} / ${LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS.toLocaleString()} tokens，已切换为长期记忆压缩快照。`,
        timestamp: Date.now(),
      },
    });
  }

  store.updateExecutionRun({
    id: executionRunId,
    event: {
      id: `evt-graph-${Date.now()}`,
      type: "system",
      title: compressionDoc ? "业务关系图已纳入压缩快照" : "已附加业务关系图",
      detail: `${businessGraph.nodes.length} 个实体 / ${businessGraph.edges.length} 条关系`,
      timestamp: Date.now(),
    },
  });
  store.updateExecutionRun({
    id: executionRunId,
    event: {
      id: `evt-world-${Date.now()}`,
      type: "system",
      title: compressionDoc ? "世界状态已纳入压缩快照" : "已附加世界状态快照",
      detail: `${worldSnapshot.summary} · Automation readiness ${worldSnapshot.automationReadiness}`,
      timestamp: Date.now(),
    },
  });
  return { ok, executionRunId };
}

export async function retryExecutionDispatch(
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

export function cancelExecutionRun(
  executionRunId: string,
  reason = "用户已中止本次生成。",
) {
  const normalizedRunId = executionRunId.trim();
  if (!normalizedRunId) return false;

  return sendWs({
    type: "cancel_execution",
    executionRunId: normalizedRunId,
    reason,
  });
}
