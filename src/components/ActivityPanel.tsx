"use client";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { Activity } from "@/store/types";
import { timeAgo, formatDuration } from "@/lib/utils";
import { CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";

const ACTIVITY_LABEL: Record<Activity["type"], string> = {
  dispatch: "调度",
  task_start: "开始",
  task_done: "完成",
  task_fail: "失败",
  meeting: "会议",
};

const ACTIVITY_COLOR: Record<Activity["type"], string> = {
  dispatch: "var(--accent)",
  task_start: "var(--warning)",
  task_done: "var(--success)",
  task_fail: "var(--danger)",
  meeting: "#a78bfa",
};

export function ActivityPanel() {
  const activities = useStore(s => s.activities);
  const navigateToTask = useStore(s => s.navigateToTask);
  const chatSessions = useStore(s => s.chatSessions);

  const findTaskInSessions = (taskId: string) =>
    chatSessions.some(sess => sess.tasks.some(t => t.id === taskId));

  if (activities.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
        活动记录为空
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxHeight: CHAT_VIEWPORT_MAX,
        overflowY: "auto",
        paddingRight: 2,
      }}
    >
      {activities.slice(0, 80).map(activity => {
        const canJump = Boolean(activity.taskId && findTaskInSessions(activity.taskId!));
        return (
          <ActivityCard
            key={activity.id}
            activity={activity}
            canJump={canJump}
            onJump={
              canJump && activity.taskId
                ? () => navigateToTask(activity.taskId!)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

function ActivityCard({
  activity,
  canJump,
  onJump,
}: {
  activity: Activity;
  canJump: boolean;
  onJump?: () => void;
}) {
  const meta = AGENT_META[activity.agentId];

  return (
    <div
      role={onJump ? "button" : undefined}
      tabIndex={onJump ? 0 : undefined}
      onClick={onJump}
      onKeyDown={
        onJump
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJump();
              }
            }
          : undefined
      }
      className="card animate-fade-in"
      style={{
        padding: "8px 10px",
        cursor: onJump ? "pointer" : "default",
        opacity: canJump || activity.type === "meeting" ? 1 : 0.95,
        border: onJump ? "1px solid transparent" : undefined,
      }}
      title={onJump ? "点击跳转到对应对话" : activity.taskId ? "该任务不在当前历史会话中" : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{meta.emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{meta.name}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 5px",
            borderRadius: 4,
            background: `${ACTIVITY_COLOR[activity.type]}22`,
            color: ACTIVITY_COLOR[activity.type],
          }}
        >
          {ACTIVITY_LABEL[activity.type]}
        </span>
        {activity.durationMs && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
            {formatDuration(activity.durationMs)}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          {timeAgo(activity.timestamp)}
        </span>
        {onJump && (
          <span style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>
            定位
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, paddingLeft: 22 }}>
        {activity.summary}
      </div>
    </div>
  );
}
