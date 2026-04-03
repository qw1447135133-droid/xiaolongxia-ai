"use client";

import type { CSSProperties } from "react";
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
    return <div className="activity-panel__empty">活动记录为空</div>;
  }

  return (
    <div className="activity-panel" style={{ maxHeight: CHAT_VIEWPORT_MAX }}>
      {activities.slice(0, 80).map(activity => {
        const canJump = Boolean(activity.taskId && findTaskInSessions(activity.taskId));
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
      className={`activity-panel__card animate-fade-in ${onJump ? "is-jumpable" : ""}`}
      title={onJump ? "点击跳转到对应对话" : activity.taskId ? "该任务不在当前历史会话中" : undefined}
    >
      <div className="activity-panel__head">
        <span className="activity-panel__emoji">{meta.emoji}</span>
        <span className="activity-panel__name">{meta.name}</span>
        <span
          className="activity-panel__badge"
          style={{ "--activity-accent": ACTIVITY_COLOR[activity.type] } as CSSProperties}
        >
          {ACTIVITY_LABEL[activity.type]}
        </span>
        {activity.durationMs && (
          <span className="activity-panel__duration">{formatDuration(activity.durationMs)}</span>
        )}
        <span className="activity-panel__time">{timeAgo(activity.timestamp)}</span>
        {onJump && <span className="activity-panel__jump">定位</span>}
      </div>
      <div className="activity-panel__summary">{activity.summary}</div>
    </div>
  );
}
