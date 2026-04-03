"use client";
import { useLayoutEffect, useMemo, useEffect, useRef } from "react";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { Task } from "@/store/types";
import { timeAgo, formatChatDividerTime } from "@/lib/utils";
import { CHAT_GAP_MS, CHAT_TIMELINE_MAX, CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";

// 每个 Agent 的主题色
const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orchestrator: { bg: "#ff6b6b22", text: "#ff6b6b", border: "#ff6b6b44" },
  explorer:     { bg: "#4ecdc422", text: "#4ecdc4", border: "#4ecdc444" },
  writer:       { bg: "#95e1d322", text: "#95e1d3", border: "#95e1d344" },
  designer:     { bg: "#f3818122", text: "#f38181", border: "#f3818144" },
  performer:    { bg: "#a78bfa22", text: "#a78bfa", border: "#a78bfa44" },
  greeter:      { bg: "#feca5722", text: "#feca57", border: "#feca5744" },
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
      <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
        暂无对话，下发指令后这里会显示对话记录
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 0",
        overflowY: "auto",
        flex: fillHeight ? 1 : undefined,
        minHeight: fillHeight ? 0 : undefined,
        maxHeight: fillHeight ? "100%" : CHAT_VIEWPORT_MAX,
      }}
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
    <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          background: "rgba(128, 128, 128, 0.14)",
          padding: "3px 12px",
          borderRadius: 6,
          border: "1px solid var(--border)",
        }}
      >
        {formatChatDividerTime(at)}
      </span>
    </div>
  );
}

function ChatBubble({ task, highlight }: { task: Task; highlight: boolean }) {
  const meta = AGENT_META[task.assignedTo];
  const colors = AGENT_COLORS[task.assignedTo];
  const isUser = task.isUserMessage === true;

  const userColors = {
    bg: "#3b82f622",
    text: "#60a5fa",
    border: "#3b82f644",
  };

  const bubbleColors = isUser ? userColors : colors;

  return (
    <div
      data-task-id={task.id}
      className={highlight ? "chat-bubble-flash" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 4,
        maxWidth: "85%",
        alignSelf: isUser ? "flex-end" : "flex-start",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: isUser ? 0 : 8,
          paddingRight: isUser ? 8 : 0,
        }}
      >
        {!isUser && <span style={{ fontSize: 16 }}>{meta.emoji}</span>}
        <span style={{ fontSize: 11, fontWeight: 600, color: bubbleColors.text }}>
          {isUser ? "你" : meta.name}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {timeAgo(task.createdAt)}
        </span>
        {!isUser && task.status === "running" && <span style={{ fontSize: 10 }}>⏳</span>}
        {!isUser && task.status === "failed" && <span style={{ fontSize: 10 }}>❌</span>}
      </div>

      <div
        style={{
          background: bubbleColors.bg,
          border: `1px solid ${bubbleColors.border}`,
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          padding: "10px 14px",
          maxWidth: "100%",
          wordBreak: "break-word",
        }}
      >
        {(!task.result || task.status !== "done" || isUser) && (
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>
            {task.description}
          </div>
        )}

        {!isUser && task.result && task.status === "done" && (
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {task.result}
          </div>
        )}

        {task.imageUrl && (
          <div style={{ marginTop: task.result ? 8 : 0 }}>
            <img
              src={task.imageUrl}
              alt="生成图片"
              style={{
                width: "100%",
                maxWidth: 400,
                borderRadius: 8,
                border: `1px solid ${bubbleColors.border}`,
              }}
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
