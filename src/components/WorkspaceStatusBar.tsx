"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { reconnectWebSocket } from "@/hooks/useWebSocket";

const WS_LABEL = {
  connected: "在线",
  connecting: "连接中",
  disconnected: "已断开",
} as const;

export function WorkspaceStatusBar() {
  const wsStatus = useStore(s => s.wsStatus);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const activeWorkspaceProjectMemoryId = useStore(s => s.activeWorkspaceProjectMemoryId);
  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId),
    [activeSessionId, chatSessions],
  );

  const activeProjectMemory = useMemo(
    () =>
      activeWorkspaceProjectMemoryId
        ? filterByProjectScope(workspaceProjectMemories, activeSession ?? {}).find(memory => memory.id === activeWorkspaceProjectMemoryId) ?? null
        : null,
    [activeSession, activeWorkspaceProjectMemoryId, workspaceProjectMemories],
  );

  return (
    <div className="workspace-statusbar">
      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${wsStatus}`}>
        <span className="workspace-statusbar__dot" />
        <span>{WS_LABEL[wsStatus]}</span>
      </div>

      <div className="workspace-statusbar__meta">
        <span>会话 {chatSessions.length}</span>
        <span>
          当前: {activeSession?.title || DEFAULT_CHAT_TITLE}
        </span>
        <span>
          项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </span>
        <span>
          会议: {latestMeetingRecord ? latestMeetingRecord.topic : "暂无"}
        </span>
        <span>
          记忆: {activeProjectMemory?.name ?? "未激活"}
        </span>
        <span>
          模式: {automationPaused ? "已暂停" : automationMode === "manual" ? "人工" : automationMode === "supervised" ? "监督" : "自治"}
        </span>
        <span>
          值守: {remoteSupervisorEnabled ? "开启" : "关闭"}
        </span>
      </div>

      {wsStatus !== "connected" && (
        <button type="button" className="workspace-statusbar__action" onClick={() => reconnectWebSocket()}>
          立即重连
        </button>
      )}
    </div>
  );
}
