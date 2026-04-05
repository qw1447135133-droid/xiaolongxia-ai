"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { getProjectScopeKey, getSessionProjectLabel, getSessionProjectScope } from "@/lib/project-context";
import { DEFAULT_CHAT_TITLE, sortChatSessions } from "@/lib/chat-sessions";
import { timeAgo } from "@/lib/utils";
import { pickLocaleText } from "@/lib/ui-locale";

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
  const locale = useStore(s => s.locale);

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
          <span className="session-panel__title">
            {pickLocaleText(locale, { "zh-CN": "会话", "zh-TW": "會話", en: "Sessions", ja: "会話" })}
          </span>
          <button type="button" className="btn-primary" onClick={() => createChatSession(workspaceRoot)}>
            {pickLocaleText(locale, { "zh-CN": "新建", "zh-TW": "新增", en: "New", ja: "新規" })}
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="session-panel__search">
          <input
            className="input session-panel__search-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={pickLocaleText(locale, {
              "zh-CN": "搜索会话",
              "zh-TW": "搜尋會話",
              en: "Search sessions",
              ja: "会話を検索",
            })}
          />
        </div>
      )}

      <div className="session-panel__list">
        {sorted.length === 0 ? (
          <div className="session-panel__empty">
            {pickLocaleText(locale, {
              "zh-CN": "还没有会话，先发出第一条指令吧。",
              "zh-TW": "還沒有會話，先發出第一條指令吧。",
              en: "No sessions yet. Send the first instruction to get started.",
              ja: "まだ会話がありません。最初の指示を送って始めましょう。",
            })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="session-panel__empty">
            {pickLocaleText(locale, {
              "zh-CN": "没有匹配的会话，换个关键词试试。",
              "zh-TW": "沒有符合的會話，換個關鍵字試試。",
              en: "No matching sessions. Try another keyword.",
              ja: "一致する会話がありません。別のキーワードで試してください。",
            })}
          </div>
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
                  {group.key === activeProjectKey && (
                    <div className="session-panel__group-pill">
                      {pickLocaleText(locale, { "zh-CN": "当前", "zh-TW": "目前", en: "Current", ja: "現在" })}
                    </div>
                  )}
                </div>
                <div className="session-panel__group-head-side">
                  <div className="session-panel__group-count">{group.items.length}</div>
                  <div className="session-panel__group-toggle">
                    {collapsedGroups[group.key]
                      ? pickLocaleText(locale, { "zh-CN": "展开", "zh-TW": "展開", en: "Expand", ja: "展開" })
                      : pickLocaleText(locale, { "zh-CN": "收起", "zh-TW": "收起", en: "Collapse", ja: "折りたたむ" })}
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
                      : previewTask?.result || previewTask?.description || pickLocaleText(locale, {
                          "zh-CN": "空白会话",
                          "zh-TW": "空白會話",
                          en: "Empty session",
                          ja: "空の会話",
                        });
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
                            {session.workspaceRoot ?? pickLocaleText(locale, {
                              "zh-CN": "未设置工作区",
                              "zh-TW": "未設定工作區",
                              en: "No workspace root",
                              ja: "ワークスペース未設定",
                            })}
                          </div>
                        </div>
                        <div className="session-panel__actions">
                          <button
                            type="button"
                            className={`session-panel__icon-btn ${session.pinned ? "is-active" : ""}`}
                            title={session.pinned
                              ? pickLocaleText(locale, { "zh-CN": "取消置顶", "zh-TW": "取消置頂", en: "Unpin", ja: "ピン留め解除" })
                              : pickLocaleText(locale, { "zh-CN": "置顶会话", "zh-TW": "置頂會話", en: "Pin session", ja: "会話をピン留め" })}
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
                            title={pickLocaleText(locale, { "zh-CN": "重命名会话", "zh-TW": "重新命名會話", en: "Rename session", ja: "会話名を変更" })}
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
                            title={pickLocaleText(locale, { "zh-CN": "删除会话", "zh-TW": "刪除會話", en: "Delete session", ja: "会話を削除" })}
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
                          {timeAgo(session.updatedAt, locale)}
                        </div>
                        <div className="session-panel__item-count">
                          {session.pinned
                            ? pickLocaleText(locale, { "zh-CN": "已置顶 · ", "zh-TW": "已置頂 · ", en: "Pinned · ", ja: "ピン留め済み · " })
                            : ""}
                          {pickLocaleText(locale, {
                            "zh-CN": `${session.tasks.length} 条`,
                            "zh-TW": `${session.tasks.length} 則`,
                            en: `${session.tasks.length} msgs`,
                            ja: `${session.tasks.length} 件`,
                          })}
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
