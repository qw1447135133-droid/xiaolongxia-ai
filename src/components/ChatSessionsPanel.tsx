"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { getProjectScopeKey, getSessionProjectLabel, getSessionProjectScope } from "@/lib/project-context";
import { DEFAULT_CHAT_TITLE, sortChatSessions } from "@/lib/chat-sessions";
import { timeAgo } from "@/lib/utils";

export function ChatSessionsPanel({ showHeader = true }: { showHeader?: boolean }) {
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const workspaceRoot = useStore(s => s.workspaceRoot);
  const createChatSession = useStore(s => s.createChatSession);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const deleteChatSession = useStore(s => s.deleteChatSession);
  const renameChatSession = useStore(s => s.renameChatSession);
  const toggleChatSessionPin = useStore(s => s.toggleChatSessionPin);

  const sorted = useMemo(
    () => sortChatSessions(chatSessions),
    [chatSessions],
  );
  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const activeProjectKey = useMemo(
    () => getProjectScopeKey(getSessionProjectScope(activeSession)),
    [activeSession],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sorted;

    return sorted.filter(session => {
      const previewTask = session.tasks.find(task => !task.isUserMessage && task.result) ?? session.tasks[0];
      const preview =
        previewTask?.isUserMessage === true
          ? previewTask.description
          : previewTask?.result || previewTask?.description || "";

      return `${session.title || DEFAULT_CHAT_TITLE} ${preview}`.toLowerCase().includes(keyword);
    });
  }, [query, sorted]);

  const grouped = useMemo(() => {
    const projectBuckets = new Map<string, { key: string; title: string; items: typeof filtered }>();

    for (const session of filtered) {
      const title = getSessionProjectLabel(session);
      const key = getProjectScopeKey(getSessionProjectScope(session));
      const current = projectBuckets.get(key);
      if (current) {
        current.items.push(session);
      } else {
        projectBuckets.set(key, { key, title, items: [session] });
      }
    }

    return Array.from(projectBuckets.values())
      .map(group => ({
        ...group,
        items: sortChatSessions(group.items),
      }))
      .sort((left, right) => {
        const leftActive = left.key === activeProjectKey ? 1 : 0;
        const rightActive = right.key === activeProjectKey ? 1 : 0;
        if (leftActive !== rightActive) return rightActive - leftActive;
        return left.title.localeCompare(right.title, "zh-CN");
      });
  }, [activeProjectKey, filtered]);

  const commitRename = (id: string) => {
    renameChatSession(id, titleDraft);
    setEditingId(null);
    setTitleDraft("");
  };

  return (
    <div className="session-panel">
      {showHeader && (
        <div className="session-panel__header">
          <span className="session-panel__title">会话</span>
          <button type="button" className="btn-primary" onClick={() => createChatSession(workspaceRoot)}>
            新建
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="session-panel__search">
          <input
            className="input session-panel__search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索会话"
          />
        </div>
      )}

      <div className="session-panel__list">
        {sorted.length === 0 ? (
          <div className="session-panel__empty">还没有会话，先发出第一条指令吧。</div>
        ) : filtered.length === 0 ? (
          <div className="session-panel__empty">没有匹配的会话，换个关键词试试。</div>
        ) : (
          grouped.map(group => (
            <section key={group.key} className="session-panel__group">
              <button
                type="button"
                className={`session-panel__group-head ${group.key === activeProjectKey ? "is-active" : ""}`}
                onClick={() =>
                  setCollapsedGroups(current => ({
                    ...current,
                    [group.key]: !(current[group.key] ?? false),
                  }))
                }
              >
                <div className="session-panel__group-head-main">
                  <div className="session-panel__group-title">{group.title}</div>
                  {group.key === activeProjectKey && <div className="session-panel__group-pill">当前</div>}
                </div>
                <div className="session-panel__group-head-side">
                  <div className="session-panel__group-count">{group.items.length}</div>
                  <div className="session-panel__group-toggle">
                    {collapsedGroups[group.key] ? "展开" : "收起"}
                  </div>
                </div>
              </button>

              <div
                className={`session-panel__group-list ${collapsedGroups[group.key] ? "is-collapsed" : ""}`}
              >
                {group.items.map(session => {
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
                          {editingId === session.id ? (
                            <input
                              className="input session-panel__rename-input"
                              value={titleDraft}
                              onChange={event => setTitleDraft(event.target.value)}
                              onClick={event => event.stopPropagation()}
                              onKeyDown={event => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRename(session.id);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingId(null);
                                  setTitleDraft("");
                                }
                              }}
                              onBlur={() => commitRename(session.id)}
                              autoFocus
                            />
                          ) : (
                            <div className="session-panel__item-title">
                              {session.title || DEFAULT_CHAT_TITLE}
                            </div>
                          )}
                          <div className="session-panel__item-preview">{shortPreview}</div>
                          <div className="session-panel__item-project">
                            {session.workspaceRoot ?? "No workspace root"}
                          </div>
                        </div>
                        <div className="session-panel__actions">
                          <button
                            type="button"
                            className={`session-panel__icon-btn ${session.pinned ? "is-active" : ""}`}
                            title={session.pinned ? "取消置顶" : "置顶会话"}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleChatSessionPin(session.id);
                            }}
                          >
                            {session.pinned ? "★" : "☆"}
                          </button>
                          <button
                            type="button"
                            className="session-panel__icon-btn"
                            title="重命名会话"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingId(session.id);
                              setTitleDraft(session.title || DEFAULT_CHAT_TITLE);
                            }}
                          >
                            ✎
                          </button>
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
                      </div>
                      <div className="session-panel__item-foot">
                        <div className="session-panel__item-meta" suppressHydrationWarning>
                          {timeAgo(session.updatedAt)}
                        </div>
                        <div className="session-panel__item-count">
                          {session.pinned ? "已置顶 · " : ""}
                          {session.tasks.length} 条
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
