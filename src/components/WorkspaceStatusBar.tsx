"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
import { buildBusinessAutomationQueue } from "@/lib/business-operations";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { getDesktopRuntimeTone } from "./DesktopRuntimeBadge";

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
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const activeWorkspaceProjectMemoryId = useStore(s => s.activeWorkspaceProjectMemoryId);
  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const desktopRuntime = useStore(s => s.desktopRuntime);

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
  const businessAutomationQueue = useMemo(
    () =>
      buildBusinessAutomationQueue({
        approvals: filterByProjectScope(businessApprovals, activeSession ?? {}),
        customers: filterByProjectScope(businessCustomers, activeSession ?? {}),
        leads: filterByProjectScope(businessLeads, activeSession ?? {}),
        tickets: filterByProjectScope(businessTickets, activeSession ?? {}),
        contentTasks: filterByProjectScope(businessContentTasks, activeSession ?? {}),
        channelSessions: filterByProjectScope(businessChannelSessions, activeSession ?? {}),
      }),
    [
      activeSession,
      businessApprovals,
      businessChannelSessions,
      businessContentTasks,
      businessCustomers,
      businessLeads,
      businessTickets,
    ],
  );
  const pendingApprovalCount = useMemo(
    () => businessAutomationQueue.filter(item => item.approvalState === "pending").length,
    [businessAutomationQueue],
  );
  const readyDispatchCount = useMemo(
    () => businessAutomationQueue.filter(item => item.automationState === "ready").length,
    [businessAutomationQueue],
  );
  const desktopRuntimeTone = useMemo(
    () => getDesktopRuntimeTone(desktopRuntime),
    [desktopRuntime],
  );

  return (
    <div className="workspace-statusbar">
      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${wsStatus}`}>
        <span className="workspace-statusbar__dot" />
        <span>{WS_LABEL[wsStatus]}</span>
      </div>

      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${desktopRuntimeTone.tone === "ready" ? "connected" : desktopRuntimeTone.tone === "partial" ? "connecting" : "disconnected"}`}>
        <span className="workspace-statusbar__dot" style={{ background: desktopRuntimeTone.dot, boxShadow: `0 0 10px ${desktopRuntimeTone.dot}` }} />
        <span>{desktopRuntimeTone.label}</span>
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
        <span>
          审批: {pendingApprovalCount} 待处理
        </span>
        <span>
          可派发: {readyDispatchCount}
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
