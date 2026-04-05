"use client";
import { useLayoutEffect, useMemo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { Task } from "@/store/types";
import { timeAgo, formatChatDividerTime } from "@/lib/utils";
import { CHAT_GAP_MS, CHAT_TIMELINE_MAX, CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";

// 每个 Agent 的主题色
const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orchestrator: { bg: "transparent", text: "var(--text)", border: "transparent" },
  explorer:     { bg: "transparent", text: "var(--text)", border: "transparent" },
  writer:       { bg: "transparent", text: "var(--text)", border: "transparent" },
  designer:     { bg: "transparent", text: "var(--text)", border: "transparent" },
  performer:    { bg: "transparent", text: "var(--text)", border: "transparent" },
  greeter:      { bg: "transparent", text: "var(--text)", border: "transparent" },
};

const DESK_NOTE_TONES = ["amber", "mint", "sky", "rose"] as const;

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

function truncateForPrompt(text: string, max = 800) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function buildWorkspaceSnippet(label: string, text: string) {
  return [`# ${label}`, "", text.trim()].join("\n");
}

function mergeWorkspaceScratchpad(current: string, snippet: string) {
  const trimmedCurrent = current.trim();
  const trimmedSnippet = snippet.trim();
  if (!trimmedCurrent) return trimmedSnippet;
  if (trimmedCurrent.includes(trimmedSnippet)) return trimmedCurrent;
  return `${trimmedCurrent}\n\n---\n\n${trimmedSnippet}`;
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

  const { timeline, scrollSig } = useMemo(() => {
    const sortedAsc = [...tasks].sort((a, b) => a.createdAt - b.createdAt).slice(-CHAT_TIMELINE_MAX);
    const timelineInner = buildTimeline(sortedAsc);
    const last = sortedAsc[sortedAsc.length - 1];
    const scrollSigInner = last
      ? `${last.id}:${last.status}:${last.completedAt ?? 0}:${last.result?.length ?? 0}`
      : "";
    return { timeline: timelineInner, scrollSig: scrollSigInner };
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

  if (tasks.length === 0) {
    return (
      <div className="task-pipeline__empty">
        暂无对话，下发指令后这里会显示对话记录
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
          return <TimeDivider key={`div-${item.at}`} at={item.at} />;
        }
        return (
          <ChatBubble
            key={item.task.id}
            task={item.task}
            highlight={highlightTaskId === item.task.id}
          />
        );
      })}
    </div>
  );
}

function TimeDivider({ at }: { at: number }) {
  return (
    <div className="task-pipeline__divider">
      <span>{formatChatDividerTime(at)}</span>
    </div>
  );
}

function ChatBubble({ task, highlight }: { task: Task; highlight: boolean }) {
  const [copied, setCopied] = useState(false);
  const appendCommandDraft = useStore(s => s.appendCommandDraft);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setTab = useStore(s => s.setTab);
  const workspacePreview = useStore(s => s.workspacePreview);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const createWorkspaceDeskNote = useStore(s => s.createWorkspaceDeskNote);
  const saveWorkspaceProjectMemory = useStore(s => s.saveWorkspaceProjectMemory);
  const meta = AGENT_META[task.assignedTo];
  const colors = AGENT_COLORS[task.assignedTo];
  const isUser = task.isUserMessage === true;

  const userColors = {
    bg: "#F0F4F9",
    text: "#1F1F1F",
    border: "transparent",
  };

  const bubbleColors = isUser ? userColors : colors;
  const copyText = (!task.result || task.status !== "done" || isUser) ? task.description : task.result;

  const handleCopy = async () => {
    if (!copyText?.trim()) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const handleQuote = () => {
    if (!copyText?.trim()) return;
    appendCommandDraft(`引用内容：\n${truncateForPrompt(copyText)}\n\n请基于这段继续。`);
  };

  const handleContinue = () => {
    if (!copyText?.trim()) return;
    setCommandDraft(
      isUser
        ? truncateForPrompt(copyText)
        : `基于这条内容继续展开并往下执行：\n${truncateForPrompt(copyText)}`,
    );
  };

  const handleSaveToDesk = () => {
    if (!copyText?.trim()) return;
    const tone = DESK_NOTE_TONES[workspaceDeskNotes.length % DESK_NOTE_TONES.length] ?? "amber";
    const stamp = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(task.createdAt);

    createWorkspaceDeskNote({
      title: `${isUser ? "用户消息" : meta.name} ${stamp}`,
      content: copyText.trim(),
      tone,
      linkedPreview: workspacePreview,
    });
    setTab("workspace");
  };

  const handleSaveToScratchpad = () => {
    if (!copyText?.trim()) return;

    const store = useStore.getState();
    const stamp = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(task.createdAt);
    const sourceLabel = `${isUser ? "用户消息" : meta.name} ${stamp}`;
    const snippet = buildWorkspaceSnippet(sourceLabel, copyText);

    store.setWorkspaceScratchpad(
      mergeWorkspaceScratchpad(store.workspaceScratchpad, snippet),
    );
    setTab("workspace");
  };

  const handleSaveToBundle = () => {
    if (!copyText?.trim()) return;

    const store = useStore.getState();
    const stamp = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(task.createdAt);
    const label = `${isUser ? "用户消息" : meta.name} ${stamp}`;
    const nextScratchpad = mergeWorkspaceScratchpad(
      store.workspaceScratchpad,
      buildWorkspaceSnippet(label, copyText),
    );

    store.setWorkspaceScratchpad(nextScratchpad);
    useStore.getState().saveWorkspaceBundle(`${label} 上下文包`);
    setTab("workspace");
  };

  const handleSaveToProjectMemory = () => {
    if (!copyText?.trim()) return;

    const store = useStore.getState();
    const stamp = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(task.createdAt);
    const label = `${isUser ? "用户消息" : meta.name} ${stamp}`;
    const nextScratchpad = mergeWorkspaceScratchpad(
      store.workspaceScratchpad,
      buildWorkspaceSnippet(label, copyText),
    );

    store.setWorkspaceScratchpad(nextScratchpad);
    saveWorkspaceProjectMemory(`${label} 项目记忆`);
    setTab("workspace");
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
        <span className="chat-bubble__author">{isUser ? "你" : meta.name}</span>
        <span className="chat-bubble__time">{timeAgo(task.createdAt)}</span>
        {!isUser && task.status === "running" && <span className="chat-bubble__state">⏳</span>}
        {!isUser && task.status === "failed" && <span className="chat-bubble__state">❌</span>}
        <div className="chat-bubble__actions">
          <button type="button" className="chat-bubble__action" onClick={() => void handleCopy()}>
            {copied ? "已复制" : "复制"}
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleQuote}>
            引用
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleContinue}>
            {isUser ? "重发" : "继续"}
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleSaveToDesk}>
            存 Desk
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleSaveToScratchpad}>
            存草稿
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleSaveToBundle}>
            存上下文包
          </button>
          <button type="button" className="chat-bubble__action" onClick={handleSaveToProjectMemory}>
            存记忆
          </button>
        </div>
      </div>

      <div className="chat-bubble__body">
        {(!task.result || task.status !== "done" || isUser) && (
          <div className="chat-bubble__content">
            {task.description}
          </div>
        )}

        {!isUser && task.result && task.status === "done" && (
          <div className="chat-bubble__content chat-bubble__content--result">
            {task.result}
          </div>
        )}

        {task.imageUrl && (
          <div className="chat-bubble__image-wrap">
            <img
              src={task.imageUrl}
              alt="生成图片"
              className="chat-bubble__image"
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
