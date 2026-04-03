"use client";

import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import type { ExecutionRunSource } from "@/store/types";
import { buildProjectMemorySnippet, getAutoRecalledProjectMemory } from "@/lib/workspace-memory";
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
}: {
  instruction: string;
  source?: ExecutionRunSource;
  attachments?: DispatchAttachmentMeta[];
  includeUserMessage?: boolean;
  taskDescription?: string;
  includeActiveProjectMemory?: boolean;
}) {
  const trimmed = instruction.trim();
  const store = useStore.getState();
  const activeSession = store.chatSessions.find(session => session.id === store.activeSessionId) ?? null;
  const scopedProjectMemories = filterByProjectScope(store.workspaceProjectMemories, activeSession ?? {});
  const activeProjectMemory = includeActiveProjectMemory && store.activeWorkspaceProjectMemoryId
    ? scopedProjectMemories.find(memory => memory.id === store.activeWorkspaceProjectMemoryId) ?? null
    : null;
  const autoRecalledMemory = includeActiveProjectMemory && !activeProjectMemory
    ? getAutoRecalledProjectMemory(scopedProjectMemories, {
        instruction: trimmed,
        workspaceRoot: store.workspaceRoot,
        workspaceCurrentPath: store.workspaceCurrentPath,
        activePreviewPath: store.workspaceActivePreviewPath,
        pinnedPaths: store.workspacePinnedPreviews.map(preview => preview.path),
        recentTranscript: store.tasks.slice(-8).map(task => task.result ?? task.description).join("\n\n"),
      })
    : null;
  const resolvedProjectMemory = activeProjectMemory ?? autoRecalledMemory?.memory ?? null;
  const finalInstruction = resolvedProjectMemory
    ? `${buildProjectMemorySnippet(resolvedProjectMemory)}\n\n---\n\nUser request:\n${trimmed}`
    : trimmed;
  const executionRunId = store.createExecutionRun({
    sessionId: store.activeSessionId,
    instruction: trimmed,
    source,
  });

  if (resolvedProjectMemory) {
    store.updateExecutionRun({
      id: executionRunId,
      event: {
        id: `evt-memory-${Date.now()}`,
        type: "system",
        title: activeProjectMemory ? "已附加项目记忆" : "已自动召回项目记忆",
        detail: activeProjectMemory
          ? resolvedProjectMemory.name
          : `${resolvedProjectMemory.name}${autoRecalledMemory?.reasons.length ? ` · ${autoRecalledMemory.reasons.join(", ")}` : ""}`,
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
  });

  const ok = sendWs({
    type: "dispatch",
    instruction: finalInstruction,
    attachments,
    sessionId: store.activeSessionId,
    executionRunId,
    source,
  });

  if (!ok) {
    store.failExecutionRun(executionRunId, "WebSocket 连接已断开，任务未成功发送。");
  }

  return { ok, executionRunId };
}
