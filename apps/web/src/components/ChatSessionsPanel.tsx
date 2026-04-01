"use client";
import { useMemo } from "react";
import { useStore } from "@/store";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-sessions";
import { timeAgo } from "@/lib/utils";

export function ChatSessionsPanel() {
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const createChatSession = useStore(s => s.createChatSession);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const deleteChatSession = useStore(s => s.deleteChatSession);

  const sorted = useMemo(
    () => [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions]
  );

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-card)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        minHeight: 0,
        height: "100%",
        maxHeight: "100%",
      }}
    >
      <div
        style={{
          padding: "10px 10px 8px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>历史会话</span>
        <button
          type="button"
          className="btn-primary"
          style={{ fontSize: 11, padding: "4px 10px", minWidth: 0 }}
          onClick={() => createChatSession()}
        >
          ＋ 新对话
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 6 }}>
        {sorted.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 8 }}>暂无会话</div>
        ) : (
          sorted.map(sess => {
            const active = sess.id === activeSessionId;
            const previewTask = sess.tasks.find(t => !t.isUserMessage && t.result) ?? sess.tasks[0];
            const preview =
              previewTask?.isUserMessage === true
                ? previewTask.description
                : previewTask?.result || previewTask?.description || "（空）";
            const short = preview.length > 40 ? `${preview.slice(0, 40)}…` : preview;

            return (
              <div
                key={sess.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveChatSession(sess.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveChatSession(sess.id);
                  }
                }}
                style={{
                  padding: "8px 8px",
                  marginBottom: 4,
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active ? "var(--accent-dim)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sess.title || DEFAULT_CHAT_TITLE}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 2,
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {short}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }} suppressHydrationWarning>
                      {timeAgo(sess.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    title="删除会话"
                    onClick={e => {
                      e.stopPropagation();
                      deleteChatSession(sess.id);
                    }}
                    style={{
                      flexShrink: 0,
                      border: "none",
                      background: "rgba(128,128,128,0.12)",
                      color: "var(--text-muted)",
                      borderRadius: 4,
                      width: 22,
                      height: 22,
                      fontSize: 12,
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
