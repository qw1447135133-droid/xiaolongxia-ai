"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
import { buildBusinessAutomationQueue } from "@/lib/business-operations";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { getDesktopRuntimeTone } from "./DesktopRuntimeBadge";
import { formatAutomationModeLabel, formatWsStatusLabel, getUiText, pickLocaleText } from "@/lib/ui-locale";

export function WorkspaceStatusBar() {
  const locale = useStore(s => s.locale);
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
  const uiText = useMemo(() => getUiText(locale), [locale]);

  return (
    <div className="workspace-statusbar">
      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${wsStatus}`}>
        <span className="workspace-statusbar__dot" />
        <span>{formatWsStatusLabel(locale, wsStatus)}</span>
      </div>

      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${desktopRuntimeTone.tone === "ready" ? "connected" : desktopRuntimeTone.tone === "partial" ? "connecting" : "disconnected"}`}>
        <span className="workspace-statusbar__dot" style={{ background: desktopRuntimeTone.dot, boxShadow: `0 0 10px ${desktopRuntimeTone.dot}` }} />
        <span>{desktopRuntimeTone.label}</span>
      </div>

      <div className="workspace-statusbar__meta">
        <span>{pickLocaleText(locale, {
          "zh-CN": `会话 ${chatSessions.length}`,
          "zh-TW": `會話 ${chatSessions.length}`,
          en: `Sessions ${chatSessions.length}`,
          ja: `会話 ${chatSessions.length}`,
        })}</span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "当前", "zh-TW": "目前", en: "Current", ja: "現在" })}: {activeSession?.title || DEFAULT_CHAT_TITLE}
        </span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "项目", "zh-TW": "專案", en: "Project", ja: "プロジェクト" })}: {activeSession ? getSessionProjectLabel(activeSession) : uiText.common.generalProject}
        </span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "会议", "zh-TW": "會議", en: "Meeting", ja: "会議" })}: {latestMeetingRecord ? latestMeetingRecord.topic : pickLocaleText(locale, {
            "zh-CN": "暂无",
            "zh-TW": "暫無",
            en: "None",
            ja: "なし",
          })}
        </span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "记忆", "zh-TW": "記憶", en: "Memory", ja: "記憶" })}: {activeProjectMemory?.name ?? pickLocaleText(locale, {
            "zh-CN": "未激活",
            "zh-TW": "未啟用",
            en: "Inactive",
            ja: "未アクティブ",
          })}
        </span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "模式", "zh-TW": "模式", en: "Mode", ja: "モード" })}: {formatAutomationModeLabel(locale, automationPaused, automationMode)}
        </span>
        <span>
          {pickLocaleText(locale, { "zh-CN": "值守", "zh-TW": "值守", en: "Supervision", ja: "監督" })}: {remoteSupervisorEnabled
            ? pickLocaleText(locale, { "zh-CN": "开启", "zh-TW": "開啟", en: "On", ja: "オン" })
            : pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Off", ja: "オフ" })}
        </span>
        <span>
          {pickLocaleText(locale, {
            "zh-CN": `审批: ${pendingApprovalCount} 待处理`,
            "zh-TW": `審批: ${pendingApprovalCount} 待處理`,
            en: `Approvals: ${pendingApprovalCount} pending`,
            ja: `承認: ${pendingApprovalCount} 件待ち`,
          })}
        </span>
        <span>
          {pickLocaleText(locale, {
            "zh-CN": `可派发: ${readyDispatchCount}`,
            "zh-TW": `可派發: ${readyDispatchCount}`,
            en: `Ready: ${readyDispatchCount}`,
            ja: `配信可能: ${readyDispatchCount}`,
          })}
        </span>
      </div>

      {wsStatus !== "connected" && (
        <button type="button" className="workspace-statusbar__action" onClick={() => reconnectWebSocket()}>
          {pickLocaleText(locale, { "zh-CN": "立即重连", "zh-TW": "立即重連", en: "Reconnect", ja: "再接続" })}
        </button>
      )}
    </div>
  );
}
