"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { getProjectScopeKey, getSessionProjectLabel, getSessionProjectScope } from "@/lib/project-context";
import { DEFAULT_CHAT_TITLE, sortChatSessions, type ChatSession } from "@/lib/chat-sessions";
import { timeAgo } from "@/lib/utils";
import { pickLocaleText } from "@/lib/ui-locale";
import type { BusinessChannelSession } from "@/types/business-entities";

function normalizeSessionSearchText(value: string) {
  return value.trim().toLowerCase();
}

function escapeHighlightPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderSessionHighlightedText(text: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;

  const pattern = new RegExp(`(${escapeHighlightPattern(normalizedQuery)})`, "gi");
  const segments = text.split(pattern);
  if (segments.length === 1) return text;
  const normalizedNeedle = normalizedQuery.toLowerCase();

  return segments.map((segment, index) => (
    segment.toLowerCase() === normalizedNeedle ? (
      <mark key={`${segment}-${index}`} className="history-search-highlight">{segment}</mark>
    ) : (
      segment
    )
  ));
}

function buildSessionTranscriptText(session: ChatSession) {
  return session.tasks
    .map(task => [task.description, task.result ?? ""].filter(Boolean).join(" "))
    .join(" ");
}

function findFirstMatchingTaskId(session: ChatSession, query: string) {
  const normalizedQuery = normalizeSessionSearchText(query);
  if (!normalizedQuery) return null;

  const matchedTask = [...session.tasks]
    .sort((left, right) => left.createdAt - right.createdAt)
    .find(task => {
      const haystack = normalizeSessionSearchText([task.description, task.result ?? ""].join(" "));
      return haystack.includes(normalizedQuery);
    });

  return matchedTask?.id ?? null;
}

function getMatchSnippet(content: string, query: string, radius = 34) {
  const normalizedContent = normalizeSessionSearchText(content);
  const normalizedQuery = normalizeSessionSearchText(query);
  if (!normalizedQuery) return "";

  const index = normalizedContent.indexOf(normalizedQuery);
  if (index === -1) return "";

  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + normalizedQuery.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

function getMappedChannelLabel(channel: BusinessChannelSession["channel"]) {
  switch (channel) {
    case "wecom":
      return "企业微信";
    case "feishu":
      return "飞书";
    case "telegram":
      return "Telegram";
    case "line":
      return "LINE";
    case "dingtalk":
      return "钉钉";
    case "wechat_official":
      return "微信公众号";
    case "qq":
      return "QQ";
    case "email":
      return "Email";
    default:
      return "Web";
  }
}

function getSessionPreviewText(
  session: ChatSession,
  linkedChannelSession: BusinessChannelSession | null,
  locale: ReturnType<typeof useStore.getState>["locale"],
) {
  const previewTask = session.tasks.find(task => !task.isUserMessage && task.result) ?? session.tasks[0];
  if (previewTask) {
    return previewTask.isUserMessage === true
      ? previewTask.description
      : previewTask.result || previewTask.description;
  }

  if (linkedChannelSession) {
    return linkedChannelSession.lastMessagePreview
      || linkedChannelSession.summary
      || pickLocaleText(locale, {
        "zh-CN": "已映射渠道会话，历史仍保留在业务实体客户档案中。",
        "zh-TW": "已映射渠道會話，歷史仍保留在業務實體客戶檔案中。",
        en: "Mapped channel session. History remains in the customer record under business entities.",
        ja: "チャネル会話を関連付け済みです。履歴は業務エンティティ内の顧客記録に保持されています。",
      });
  }

  return pickLocaleText(locale, {
    "zh-CN": "空白会话",
    "zh-TW": "空白會話",
    en: "Empty session",
    ja: "空の会話",
  });
}

function getSessionScopeText(
  session: ChatSession,
  linkedChannelSession: BusinessChannelSession | null,
  locale: ReturnType<typeof useStore.getState>["locale"],
) {
  if (session.workspaceRoot) return session.workspaceRoot;
  if (linkedChannelSession) {
    return [
      pickLocaleText(locale, {
        "zh-CN": "渠道映射",
        "zh-TW": "渠道映射",
        en: "Mapped",
        ja: "マップ済み",
      }),
      getMappedChannelLabel(linkedChannelSession.channel),
      linkedChannelSession.participantLabel || linkedChannelSession.accountLabel || linkedChannelSession.externalRef,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return pickLocaleText(locale, {
    "zh-CN": "未设置工作区",
    "zh-TW": "未設定工作區",
    en: "No workspace root",
    ja: "ワークスペース未設定",
  });
}

export function ChatSessionsPanel({ showHeader = true }: { showHeader?: boolean }) {
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const workspaceRoot = useStore(s => s.workspaceRoot);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const createChatSession = useStore(s => s.createChatSession);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const deleteChatSession = useStore(s => s.deleteChatSession);
  const renameChatSession = useStore(s => s.renameChatSession);
  const toggleChatSessionPin = useStore(s => s.toggleChatSessionPin);
  const navigateToTask = useStore(s => s.navigateToTask);
  const seedTaskSearch = useStore(s => s.seedTaskSearch);
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
  const channelSessionMap = useMemo(
    () => new Map(businessChannelSessions.map(session => [session.id, session])),
    [businessChannelSessions],
  );
  const channelMessageCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of businessOperationLogs) {
      if (log.entityType !== "channelSession" || log.eventType !== "message") continue;
      counts.set(log.entityId, (counts.get(log.entityId) ?? 0) + 1);
    }
    return counts;
  }, [businessOperationLogs]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sorted;

    return sorted.filter(session => {
      const linkedChannelSession = session.linkedChannelSessionId
        ? channelSessionMap.get(session.linkedChannelSessionId) ?? null
        : null;
      const preview = getSessionPreviewText(session, linkedChannelSession, locale);
      const scopeText = getSessionScopeText(session, linkedChannelSession, locale);
      const transcript = buildSessionTranscriptText(session);

      return `${session.title || DEFAULT_CHAT_TITLE} ${preview} ${scopeText} ${transcript}`.toLowerCase().includes(keyword);
    });
  }, [channelSessionMap, locale, query, sorted]);

  const grouped = useMemo(() => {
    const projectBuckets = new Map<string, {
      key: string;
      title: string;
      latestUpdatedAt: number;
      items: typeof filtered;
    }>();

    for (const session of filtered) {
      const title = getSessionProjectLabel(session);
      const key = getProjectScopeKey(getSessionProjectScope(session));
      const current = projectBuckets.get(key);
      if (current) {
        current.items.push(session);
        current.latestUpdatedAt = Math.max(current.latestUpdatedAt, session.updatedAt);
      } else {
        projectBuckets.set(key, {
          key,
          title,
          latestUpdatedAt: session.updatedAt,
          items: [session],
        });
      }
    }

    return Array.from(projectBuckets.values())
      .map(group => ({
        ...group,
        items: sortChatSessions(group.items),
      }))
      .sort((left, right) => {
        if (left.latestUpdatedAt !== right.latestUpdatedAt) {
          return right.latestUpdatedAt - left.latestUpdatedAt;
        }
        const leftPinnedCount = left.items.filter(session => session.pinned).length;
        const rightPinnedCount = right.items.filter(session => session.pinned).length;
        if (leftPinnedCount !== rightPinnedCount) {
          return rightPinnedCount - leftPinnedCount;
        }
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
                  const linkedChannelSession = session.linkedChannelSessionId
                    ? channelSessionMap.get(session.linkedChannelSessionId) ?? null
                    : null;
                  const linkedMessageCount = linkedChannelSession
                    ? channelMessageCountMap.get(linkedChannelSession.id) ?? 0
                    : 0;
                  const preview = getSessionPreviewText(session, linkedChannelSession, locale);
                  const transcript = buildSessionTranscriptText(session);
                  const shortPreview = preview.length > 56 ? `${preview.slice(0, 56)}...` : preview;
                  const matchSnippet = query.trim() ? getMatchSnippet(transcript || preview, query) : "";
                  const firstMatchingTaskId = query.trim() ? findFirstMatchingTaskId(session, query) : null;
                  const matchCount = query.trim()
                    ? session.tasks.reduce((count, task) => {
                      const haystack = normalizeSessionSearchText([task.description, task.result ?? ""].join(" "));
                      return haystack.includes(normalizeSessionSearchText(query)) ? count + 1 : count;
                    }, 0)
                    : 0;
                  const scopeText = getSessionScopeText(session, linkedChannelSession, locale);

                  return (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      className={`session-panel__item ${active ? "is-active" : ""}`}
                      onClick={() => {
                        if (firstMatchingTaskId && query.trim()) {
                          seedTaskSearch(session.id, query);
                          navigateToTask(firstMatchingTaskId);
                          return;
                        }
                        setActiveChatSession(session.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (firstMatchingTaskId && query.trim()) {
                            seedTaskSearch(session.id, query);
                            navigateToTask(firstMatchingTaskId);
                            return;
                          }
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
                              {renderSessionHighlightedText(session.title || DEFAULT_CHAT_TITLE, query)}
                            </div>
                          )}
                          <div className="session-panel__item-preview">
                            {renderSessionHighlightedText(matchSnippet || shortPreview, query)}
                          </div>
                          {query.trim() && matchCount > 0 ? (
                            <div className="session-panel__item-match">
                              {pickLocaleText(locale, {
                                "zh-CN": `命中 ${matchCount} 条消息`,
                                "zh-TW": `命中 ${matchCount} 則訊息`,
                                en: `${matchCount} matching messages`,
                                ja: `${matchCount} 件ヒット`,
                              })}
                            </div>
                          ) : null}
                          <div className="session-panel__item-project">{scopeText}</div>
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
                          {linkedChannelSession
                            ? `${pickLocaleText(locale, {
                                "zh-CN": `客户历史 ${linkedMessageCount} 条 · `,
                                "zh-TW": `客戶歷史 ${linkedMessageCount} 則 · `,
                                en: `Customer ${linkedMessageCount} msgs · `,
                                ja: `顧客履歴 ${linkedMessageCount} 件 · `,
                              })}`
                            : ""}
                          {session.pinned
                            ? pickLocaleText(locale, { "zh-CN": "已置顶 · ", "zh-TW": "已置頂 · ", en: "Pinned · ", ja: "ピン留め済み · " })
                            : ""}
                          {pickLocaleText(locale, {
                            "zh-CN": `AI ${session.tasks.length} 条`,
                            "zh-TW": `AI ${session.tasks.length} 則`,
                            en: `AI ${session.tasks.length} msgs`,
                            ja: `AI ${session.tasks.length} 件`,
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
