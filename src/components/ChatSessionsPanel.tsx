"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
import { timeAgo } from "@/lib/utils";

export function ChatSessionsPanel({ showHeader = true }: { showHeader?: boolean }) {
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const createChatSession = useStore(s => s.createChatSession);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const deleteChatSession = useStore(s => s.deleteChatSession);

  const sorted = useMemo(
    () => [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions],
  );

  return (
    <div className="session-panel">
      {showHeader && (
        <div className="session-panel__header">
          <span className="session-panel__title">会话</span>
          <button type="button" className="btn-primary" onClick={() => createChatSession()}>
            新建
          </button>
        </div>
      )}

      <div className="session-panel__list">
        {sorted.length === 0 ? (
          <div className="session-panel__empty">还没有会话，先发出第一条指令吧。</div>
        ) : (
          sorted.map(session => {
            const active = session.id === activeSessionId;
            const previewTask = session.tasks.find(task => !task.isUserMessage && task.result) ?? session.tasks[0];
            const preview =
              previewTask?.isUserMessage === true
                ? previewTask.description
                : previewTask?.result || previewTask?.description || "空白会话";
            const shortPreview = preview.length > 56 ? `${preview.slice(0, 56)}...` : preview;

            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                className={`session-panel__item ${active ? "is-active" : ""}`}
                onClick={() => setActiveChatSession(session.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveChatSession(session.id);
                  }
                }}
              >
                <div className="session-panel__item-head">
                  <div className="session-panel__item-main">
                    <div className="session-panel__item-title">
                      {session.title || DEFAULT_CHAT_TITLE}
                    </div>
                    <div className="session-panel__item-preview">{shortPreview}</div>
                  </div>
                  <button
                    type="button"
                    className="session-panel__delete"
                    title="删除会话"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteChatSession(session.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="session-panel__item-meta" suppressHydrationWarning>
                  {timeAgo(session.updatedAt)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
