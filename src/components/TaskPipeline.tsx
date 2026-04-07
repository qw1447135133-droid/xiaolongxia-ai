"use client";
import { useLayoutEffect, useMemo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { Task } from "@/store/types";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { timeAgo, formatChatDividerTime } from "@/lib/utils";
import { CHAT_GAP_MS, CHAT_TIMELINE_MAX, CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";
import { pickLocaleText } from "@/lib/ui-locale";

// 每个 Agent 的主题色
const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orchestrator: { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
  explorer:     { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
  writer:       { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
  designer:     { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
  performer:    { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
  greeter:      { bg: "rgba(255, 255, 255, 0.94)", text: "var(--text)", border: "rgba(148, 163, 184, 0.18)" },
};

type TimelineItem =
  | { kind: "task"; task: Task }
  | { kind: "divider"; at: number };

function buildTimeline(sortedAsc: Task[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let prevAt: number | null = null;
  for (const task of sortedAsc) {
    if (prevAt !== null && task.createdAt - prevAt > CHAT_GAP_MS) {
      items.push({ kind: "divider", at: task.createdAt });
    }
    items.push({ kind: "task", task });
    prevAt = task.createdAt;
  }
  return items;
}

function sanitizeMessageContent(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const footerPatterns = [
    /\n*3\.\s*用户协同[\s\S]*$/u,
    /\n*3\.\s*用戶協同[\s\S]*$/u,
    /\n*3\.\s*User Collaboration[\s\S]*$/u,
    /\n*3\.\s*ユーザー連携[\s\S]*$/u,
    /\n*您可以告诉我您的修改意见[\s\S]*$/u,
    /\n*您可以告訴我您的修改意見[\s\S]*$/u,
    /\n*You can tell me what to change[\s\S]*$/u,
    /\n*修正したい点を教えてください[\s\S]*$/u,
  ];

  let next = trimmed;
  for (const pattern of footerPatterns) {
    next = next.replace(pattern, "").trimEnd();
  }

  return next;
}

export function TaskPipeline({
  autoScroll = true,
  fillHeight = false,
}: {
  autoScroll?: boolean;
  /** 任务 Tab 内占满剩余高度并内部滚动 */
  fillHeight?: boolean;
}) {
  const tasks = useStore(s => s.tasks);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollTaskId = useStore(s => s.pendingScrollTaskId);
  const highlightTaskId = useStore(s => s.highlightTaskId);
  const finishPendingScroll = useStore(s => s.finishPendingScroll);
  const clearHighlightTask = useStore(s => s.clearHighlightTask);
  const locale = useStore(s => s.locale);
  const activeSessionId = useStore(s => s.activeSessionId);
  const executionRuns = useStore(s => s.executionRuns);
  const wsStatus = useStore(s => s.wsStatus);
  const setDispatching = useStore(s => s.setDispatching);
  const setLastInstruction = useStore(s => s.setLastInstruction);
  const updateTask = useStore(s => s.updateTask);
  const truncateTasksAfter = useStore(s => s.truncateTasksAfter);
  const rateAssistantTask = useStore(s => s.rateAssistantTask);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingError, setEditingError] = useState("");
  const [editingBusy, setEditingBusy] = useState(false);
  const [assistantActionErrorTaskId, setAssistantActionErrorTaskId] = useState<string | null>(null);
  const [assistantActionError, setAssistantActionError] = useState("");
  const [regeneratingTaskId, setRegeneratingTaskId] = useState<string | null>(null);

  const { sortedAsc, timeline, scrollSig } = useMemo(() => {
    const sortedAsc = [...tasks].sort((a, b) => a.createdAt - b.createdAt).slice(-CHAT_TIMELINE_MAX);
    const timelineInner = buildTimeline(sortedAsc);
    const last = sortedAsc[sortedAsc.length - 1];
    const scrollSigInner = last
      ? `${last.id}:${last.status}:${last.completedAt ?? 0}:${last.result?.length ?? 0}`
      : "";
    return { sortedAsc, timeline: timelineInner, scrollSig: scrollSigInner };
  }, [tasks]);

  useLayoutEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    if (pendingScrollTaskId) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [autoScroll, scrollSig, timeline.length, pendingScrollTaskId]);

  useLayoutEffect(() => {
    if (!pendingScrollTaskId || !scrollRef.current) return;
    const id = pendingScrollTaskId;
    const tryScroll = () => {
      const node = scrollRef.current?.querySelector(`[data-task-id="${id}"]`);
      if (node) {
        node.scrollIntoView({ block: "center", behavior: "smooth" });
        finishPendingScroll();
        return true;
      }
      return false;
    };
    if (!tryScroll()) {
      requestAnimationFrame(() => {
        if (!tryScroll()) finishPendingScroll();
      });
    }
  }, [pendingScrollTaskId, tasks, finishPendingScroll]);

  useEffect(() => {
    if (!highlightTaskId) return;
    const t = window.setTimeout(() => clearHighlightTask(), 2600);
    return () => clearTimeout(t);
  }, [highlightTaskId, clearHighlightTask]);

  const latestUserTaskId = useMemo(
    () => tasks.find(task => task.isUserMessage)?.id ?? null,
    [tasks],
  );

  const hasPendingSessionRun = useMemo(
    () => executionRuns.some(run =>
      run.sessionId === activeSessionId && ["queued", "analyzing", "running"].includes(run.status),
    ),
    [activeSessionId, executionRuns],
  );

  useEffect(() => {
    if (!editingTaskId) return;
    if (tasks.some(task => task.id === editingTaskId)) return;
    setEditingTaskId(null);
    setEditingDraft("");
    setEditingError("");
    setEditingBusy(false);
  }, [editingTaskId, tasks]);

  useEffect(() => {
    if (!assistantActionErrorTaskId) return;
    if (tasks.some(task => task.id === assistantActionErrorTaskId)) return;
    setAssistantActionErrorTaskId(null);
    setAssistantActionError("");
    setRegeneratingTaskId(null);
  }, [assistantActionErrorTaskId, tasks]);

  const handleStartEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingDraft(task.description);
    setEditingError("");
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingDraft("");
    setEditingError("");
    setEditingBusy(false);
  };

  const getTruncatedTaskSnapshot = (taskId: string) => {
    const targetIndex = tasks.findIndex(task => task.id === taskId);
    return targetIndex === -1 ? tasks : tasks.slice(targetIndex);
  };

  const handleSaveEdit = async (task: Task) => {
    const nextInstruction = editingDraft.trim();
    if (!nextInstruction) {
      setEditingError(
        pickLocaleText(locale, {
          "zh-CN": "请输入修改后的内容。",
          "zh-TW": "請輸入修改後的內容。",
          en: "Please enter the updated message.",
          ja: "修正後の内容を入力してください。",
        }),
      );
      return;
    }

    if (wsStatus !== "connected") {
      setEditingError(
        pickLocaleText(locale, {
          "zh-CN": "当前连接已断开，暂时无法重新生成。",
          "zh-TW": "目前連線已中斷，暫時無法重新生成。",
          en: "The connection is offline right now, so regeneration cannot start yet.",
          ja: "現在は接続が切れているため、再生成を開始できません。",
        }),
      );
      return;
    }

    if (hasPendingSessionRun) {
      setEditingError(
        pickLocaleText(locale, {
          "zh-CN": "当前仍有任务在生成中，请等待完成后再修改。",
          "zh-TW": "目前仍有任務生成中，請等待完成後再修改。",
          en: "A reply is still being generated. Please wait until it finishes before editing.",
          ja: "まだ生成中の応答があります。完了してから編集してください。",
        }),
      );
      return;
    }

    setEditingBusy(true);
    setEditingError("");
    setDispatching(true);
    setLastInstruction(nextInstruction);
    const nextTaskSnapshot = getTruncatedTaskSnapshot(task.id).map(item =>
      item.id === task.id
        ? {
            ...item,
            description: nextInstruction,
          }
        : item,
    );

    const { ok } = sendExecutionDispatch({
      instruction: nextInstruction,
      source: "chat",
      includeUserMessage: false,
      taskDescription: nextInstruction,
      includeActiveProjectMemory: true,
      sessionId: activeSessionId,
      recentTasksOverride: nextTaskSnapshot,
    });

    if (!ok) {
      setEditingError(
        pickLocaleText(locale, {
          "zh-CN": "发送失败，请稍后重试。",
          "zh-TW": "送出失敗，請稍後再試。",
          en: "Sending failed. Please try again in a moment.",
          ja: "送信に失敗しました。しばらくしてからもう一度お試しください。",
        }),
      );
      setDispatching(false);
      setEditingBusy(false);
      return;
    }

    updateTask(task.id, {
      description: nextInstruction,
      completedAt: Date.now(),
    });
    truncateTasksAfter(task.id);
    setDispatching(false);
    handleCancelEdit();
  };

  const { latestAssistantTaskId, latestAssistantSourceUserId } = useMemo(() => {
    let lastUserTaskId: string | null = null;
    let latestAssistantTaskIdInner: string | null = null;
    let latestAssistantSourceUserIdInner: string | null = null;

    for (const task of sortedAsc) {
      if (task.isUserMessage) {
        lastUserTaskId = task.id;
        continue;
      }

      const hasRenderableResponse = task.status === "done" && Boolean((task.result ?? task.description).trim());
      if (!hasRenderableResponse) continue;
      latestAssistantTaskIdInner = task.id;
      latestAssistantSourceUserIdInner = lastUserTaskId;
    }

    return {
      latestAssistantTaskId: latestAssistantTaskIdInner,
      latestAssistantSourceUserId: latestAssistantSourceUserIdInner,
    };
  }, [sortedAsc]);

  const handleRateAssistant = (task: Task, feedback: "up" | "down") => {
    rateAssistantTask({
      taskId: task.id,
      feedback,
      sessionId: activeSessionId,
    });
    setAssistantActionErrorTaskId(null);
    setAssistantActionError("");
  };

  const handleRegenerateAssistant = async (task: Task) => {
    if (task.id !== latestAssistantTaskId) return;

    if (wsStatus !== "connected") {
      setAssistantActionErrorTaskId(task.id);
      setAssistantActionError(
        pickLocaleText(locale, {
          "zh-CN": "当前连接已断开，暂时无法重新生成。",
          "zh-TW": "目前連線已中斷，暫時無法重新生成。",
          en: "The connection is offline right now, so regeneration cannot start yet.",
          ja: "現在は接続が切れているため、再生成を開始できません。",
        }),
      );
      return;
    }

    if (hasPendingSessionRun) {
      setAssistantActionErrorTaskId(task.id);
      setAssistantActionError(
        pickLocaleText(locale, {
          "zh-CN": "当前仍有任务在生成中，请等待完成后再重试。",
          "zh-TW": "目前仍有任務生成中，請等待完成後再重試。",
          en: "A reply is still being generated. Please wait until it finishes before retrying.",
          ja: "まだ生成中の応答があります。完了してから再生成してください。",
        }),
      );
      return;
    }

    const sourceUserId = latestAssistantSourceUserId;
    const sourceUserTask = sourceUserId
      ? tasks.find(item => item.id === sourceUserId) ?? null
      : null;

    if (!sourceUserTask) {
      setAssistantActionErrorTaskId(task.id);
      setAssistantActionError(
        pickLocaleText(locale, {
          "zh-CN": "没有找到可用于重生成的上一条用户消息。",
          "zh-TW": "沒有找到可用於重新生成的上一條使用者訊息。",
          en: "The previous user message needed for regeneration could not be found.",
          ja: "再生成に必要な直前のユーザーメッセージが見つかりません。",
        }),
      );
      return;
    }

    setRegeneratingTaskId(task.id);
    setAssistantActionErrorTaskId(null);
    setAssistantActionError("");
    setDispatching(true);
    setLastInstruction(sourceUserTask.description);

    const nextTaskSnapshot = getTruncatedTaskSnapshot(sourceUserTask.id);
    const { ok } = sendExecutionDispatch({
      instruction: sourceUserTask.description,
      source: "chat",
      includeUserMessage: false,
      taskDescription: sourceUserTask.description,
      includeActiveProjectMemory: true,
      sessionId: activeSessionId,
      recentTasksOverride: nextTaskSnapshot,
    });

    if (!ok) {
      setAssistantActionErrorTaskId(task.id);
      setAssistantActionError(
        pickLocaleText(locale, {
          "zh-CN": "发送失败，请稍后重试。",
          "zh-TW": "送出失敗，請稍後再試。",
          en: "Sending failed. Please try again in a moment.",
          ja: "送信に失敗しました。しばらくしてからもう一度お試しください。",
        }),
      );
      setDispatching(false);
      setRegeneratingTaskId(null);
      return;
    }

    truncateTasksAfter(sourceUserTask.id);
    setDispatching(false);
    setRegeneratingTaskId(null);
  };

  if (tasks.length === 0) {
    return (
      <div className="task-pipeline__empty">
        {pickLocaleText(locale, {
          "zh-CN": "暂无对话，下发指令后这里会显示对话记录",
          "zh-TW": "暫無對話，下發指令後這裡會顯示對話記錄",
          en: "No conversation yet. Messages will appear here after you send the first instruction.",
          ja: "まだ会話はありません。最初の指示を送ると、ここに会話履歴が表示されます。",
        })}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`task-pipeline ${fillHeight ? "task-pipeline--fill" : ""}`}
      style={{ maxHeight: fillHeight ? "100%" : CHAT_VIEWPORT_MAX }}
    >
      {timeline.map(item => {
        if (item.kind === "divider") {
          return <TimeDivider key={`div-${item.at}`} at={item.at} locale={locale} />;
        }
        return (
          <ChatBubble
            key={item.task.id}
            task={item.task}
            highlight={highlightTaskId === item.task.id}
            isLatestEditableUserMessage={item.task.id === latestUserTaskId}
            isLatestRegeneratableAssistantMessage={item.task.id === latestAssistantTaskId}
            isEditing={editingTaskId === item.task.id}
            editingDraft={editingTaskId === item.task.id ? editingDraft : ""}
            editingError={editingTaskId === item.task.id ? editingError : ""}
            editingBusy={editingTaskId === item.task.id && editingBusy}
            assistantActionError={assistantActionErrorTaskId === item.task.id ? assistantActionError : ""}
            regenerating={regeneratingTaskId === item.task.id}
            onStartEdit={() => handleStartEdit(item.task)}
            onCancelEdit={handleCancelEdit}
            onEditingDraftChange={setEditingDraft}
            onSaveEdit={() => void handleSaveEdit(item.task)}
            onRateAssistant={(feedback) => handleRateAssistant(item.task, feedback)}
            onRegenerateAssistant={() => void handleRegenerateAssistant(item.task)}
          />
        );
      })}
    </div>
  );
}

function TimeDivider({
  at,
  locale,
}: {
  at: number;
  locale: ReturnType<typeof useStore.getState>["locale"];
}) {
  return (
    <div className="task-pipeline__divider">
      <span>{formatChatDividerTime(at, locale)}</span>
    </div>
  );
}

function ChatBubble({
  task,
  highlight,
  isLatestEditableUserMessage,
  isLatestRegeneratableAssistantMessage,
  isEditing,
  editingDraft,
  editingError,
  editingBusy,
  assistantActionError,
  regenerating,
  onStartEdit,
  onCancelEdit,
  onEditingDraftChange,
  onSaveEdit,
  onRateAssistant,
  onRegenerateAssistant,
}: {
  task: Task;
  highlight: boolean;
  isLatestEditableUserMessage: boolean;
  isLatestRegeneratableAssistantMessage: boolean;
  isEditing: boolean;
  editingDraft: string;
  editingError: string;
  editingBusy: boolean;
  assistantActionError: string;
  regenerating: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditingDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onRateAssistant: (feedback: "up" | "down") => void;
  onRegenerateAssistant: () => void;
}) {
  const locale = useStore(s => s.locale);
  const meta = AGENT_META[task.assignedTo];
  const colors = AGENT_COLORS[task.assignedTo];
  const isUser = task.isUserMessage === true;
  const [copied, setCopied] = useState(false);

  const userColors = {
    bg: "rgba(233, 243, 255, 0.96)",
    text: "#1F1F1F",
    border: "rgba(147, 197, 253, 0.32)",
  };

  const bubbleColors = isUser ? userColors : colors;
  const displayDescription = sanitizeMessageContent(task.description);
  const displayResult = task.result ? sanitizeMessageContent(task.result) : "";
  const copyLabel = pickLocaleText(locale, {
    "zh-CN": "复制消息",
    "zh-TW": "複製訊息",
    en: "Copy message",
    ja: "メッセージをコピー",
  });
  const editLabel = pickLocaleText(locale, {
    "zh-CN": "修改消息",
    "zh-TW": "修改訊息",
    en: "Edit message",
    ja: "メッセージを編集",
  });
  const likeLabel = pickLocaleText(locale, {
    "zh-CN": "喜欢这条回复",
    "zh-TW": "喜歡這則回覆",
    en: "Like this reply",
    ja: "この返信を高評価",
  });
  const dislikeLabel = pickLocaleText(locale, {
    "zh-CN": "不喜欢这条回复",
    "zh-TW": "不喜歡這則回覆",
    en: "Dislike this reply",
    ja: "この返信を低評価",
  });
  const regenerateLabel = pickLocaleText(locale, {
    "zh-CN": "重新生成回复",
    "zh-TW": "重新生成回覆",
    en: "Regenerate reply",
    ja: "返信を再生成",
  });

  const handleCopy = async () => {
    const message = displayDescription || displayResult || "";
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const handleEditingKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSaveEdit();
    }
  };

  return (
    <div
      data-task-id={task.id}
      className={[
        "chat-bubble",
        isUser ? "chat-bubble--user" : "chat-bubble--agent",
        highlight ? "chat-bubble--highlight" : "",
      ].join(" ").trim()}
      style={
        {
          "--bubble-bg": bubbleColors.bg,
          "--bubble-text": bubbleColors.text,
          "--bubble-border": bubbleColors.border,
        } as CSSProperties
      }
    >
      <div className="chat-bubble__meta">
        {!isUser && <span className="chat-bubble__avatar">{meta.emoji}</span>}
        <span className="chat-bubble__author">
          {isUser ? pickLocaleText(locale, { "zh-CN": "你", "zh-TW": "你", en: "You", ja: "あなた" }) : meta.name}
        </span>
        <span className="chat-bubble__time">{timeAgo(task.createdAt, locale)}</span>
        {!isUser && task.status === "running" && <span className="chat-bubble__state">⏳</span>}
        {!isUser && task.status === "failed" && <span className="chat-bubble__state">❌</span>}
      </div>

      <div className="chat-bubble__body">
        {isUser && !isEditing ? (
          <div className="chat-bubble__actions" aria-label={pickLocaleText(locale, {
            "zh-CN": "消息操作",
            "zh-TW": "訊息操作",
            en: "Message actions",
            ja: "メッセージ操作",
          })}>
            <button
              type="button"
              className={`chat-bubble__icon-button ${copied ? "is-active" : ""}`}
              onClick={() => void handleCopy()}
              title={copyLabel}
              aria-label={copyLabel}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M7 3.5h7.5A1.5 1.5 0 0 1 16 5v9.5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 14.5V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4.5 13.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v.5" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </button>
            {isLatestEditableUserMessage ? (
              <button
                type="button"
                className="chat-bubble__icon-button"
                onClick={onStartEdit}
                title={editLabel}
                aria-label={editLabel}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                  <path d="M3 14.75V17h2.25L14.9 7.35l-2.25-2.25L3 14.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="m11.95 5.8 2.25 2.25M13.4 4.35l1.1-1.1a1.59 1.59 0 0 1 2.25 2.25l-1.1 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}

        {isEditing ? (
          <div className="chat-bubble__editor">
            <textarea
              className="chat-bubble__editor-input"
              value={editingDraft}
              onChange={(event) => onEditingDraftChange(event.target.value)}
              onKeyDown={handleEditingKeyDown}
              rows={4}
              autoFocus
            />
            {editingError ? <div className="chat-bubble__editor-error">{editingError}</div> : null}
            <div className="chat-bubble__editor-actions">
              <button
                type="button"
                className="chat-bubble__editor-button chat-bubble__editor-button--ghost"
                onClick={onCancelEdit}
                disabled={editingBusy}
              >
                {pickLocaleText(locale, {
                  "zh-CN": "取消",
                  "zh-TW": "取消",
                  en: "Cancel",
                  ja: "キャンセル",
                })}
              </button>
              <button
                type="button"
                className="chat-bubble__editor-button chat-bubble__editor-button--primary"
                onClick={onSaveEdit}
                disabled={editingBusy}
              >
                {editingBusy
                  ? pickLocaleText(locale, {
                      "zh-CN": "重新生成中",
                      "zh-TW": "重新生成中",
                      en: "Regenerating",
                      ja: "再生成中",
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "保存并重生成",
                      "zh-TW": "儲存並重新生成",
                      en: "Save and regenerate",
                      ja: "保存して再生成",
                    })}
              </button>
            </div>
          </div>
        ) : null}

        {(!task.result || task.status !== "done" || isUser) && displayDescription && !isEditing && (
          <div className="chat-bubble__content">
            {displayDescription}
          </div>
        )}

        {!isUser && task.result && task.status === "done" && displayResult && (
          <div className="chat-bubble__content chat-bubble__content--result">
            {displayResult}
          </div>
        )}

        {!isUser && assistantActionError ? (
          <div className="chat-bubble__assistant-error">{assistantActionError}</div>
        ) : null}

        {task.imageUrl && (
          <div className="chat-bubble__image-wrap">
            <img
              src={task.imageUrl}
              alt={pickLocaleText(locale, { "zh-CN": "生成图片", "zh-TW": "生成圖片", en: "Generated image", ja: "生成画像" })}
              className="chat-bubble__image"
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {!isUser && task.status === "done" ? (
          <div className="chat-bubble__assistant-actions" aria-label={pickLocaleText(locale, {
            "zh-CN": "AI 回复操作",
            "zh-TW": "AI 回覆操作",
            en: "AI reply actions",
            ja: "AI 返信操作",
          })}>
            <button
              type="button"
              className={`chat-bubble__icon-button ${task.feedback === "up" ? "is-active" : ""}`}
              onClick={() => onRateAssistant("up")}
              title={likeLabel}
              aria-label={likeLabel}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M8.2 7.1 9.8 3.9a1.8 1.8 0 0 1 3.4.8V7.1h2.1a1.7 1.7 0 0 1 1.67 2.04l-.9 4.6a1.7 1.7 0 0 1-1.67 1.36H8.2m0-8.01V15.1m0-8.01H5.7A1.7 1.7 0 0 0 4 8.8v4.6a1.7 1.7 0 0 0 1.7 1.7h2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              type="button"
              className={`chat-bubble__icon-button ${task.feedback === "down" ? "is-active" : ""}`}
              onClick={() => onRateAssistant("down")}
              title={dislikeLabel}
              aria-label={dislikeLabel}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M11.8 12.9 10.2 16.1a1.8 1.8 0 0 1-3.4-.8V12.9H4.7a1.7 1.7 0 0 1-1.67-2.04l.9-4.6A1.7 1.7 0 0 1 5.6 4.9h6.2m0 8.01V4.9m0 8.01h2.5A1.7 1.7 0 0 0 16 11.2V6.6a1.7 1.7 0 0 0-1.7-1.7h-2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {isLatestRegeneratableAssistantMessage ? (
              <button
                type="button"
                className={`chat-bubble__icon-button ${regenerating ? "is-active" : ""}`}
                onClick={onRegenerateAssistant}
                title={regenerateLabel}
                aria-label={regenerateLabel}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true">
                  <path d="M15.5 8.3A5.8 5.8 0 0 0 5.9 5.2M4.5 11.7A5.8 5.8 0 0 0 14.1 14.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M15.5 3.9v4.4h-4.4M4.5 16.1v-4.4h4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
