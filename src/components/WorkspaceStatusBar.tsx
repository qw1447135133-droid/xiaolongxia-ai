"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
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
  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId),
    [activeSessionId, chatSessions],
  );

  const enabledPlatforms = useMemo(
    () => Object.values(platformConfigs).filter(config => config.enabled).length,
    [platformConfigs],
  );

  return (
    <div className="workspace-statusbar">
      <div className={`workspace-statusbar__signal workspace-statusbar__signal--${wsStatus}`}>
        <span className="workspace-statusbar__dot" />
        <span>{WS_LABEL[wsStatus]}</span>
      </div>

      <div className="workspace-statusbar__meta">
        <span>会话 {chatSessions.length}</span>
        <span>Provider {providers.length}</span>
        <span>平台 {enabledPlatforms}</span>
        <span>
          当前: {activeSession?.title || DEFAULT_CHAT_TITLE}
        </span>
        <span>
          会议: {latestMeetingRecord ? latestMeetingRecord.topic : "暂无"}
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
