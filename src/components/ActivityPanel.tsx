"use client";

import type { CSSProperties } from "react";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { Activity } from "@/store/types";
import { timeAgo, formatDuration } from "@/lib/utils";
import { CHAT_VIEWPORT_MAX } from "@/lib/chat-sessions";
import { pickLocaleText } from "@/lib/ui-locale";
import { AgentIcon } from "./AgentIcon";

const ACTIVITY_COLOR: Record<Activity["type"], string> = {
  dispatch: "var(--accent)",
  task_start: "var(--warning)",
  task_done: "var(--success)",
  task_fail: "var(--danger)",
  meeting: "#a78bfa",
  tool_start: "#7dd3fc",
  tool_done: "#86efac",
  tool_fail: "#fda4af",
};

export function ActivityPanel() {
  const activities = useStore(s => s.activities);
  const navigateToTask = useStore(s => s.navigateToTask);
  const chatSessions = useStore(s => s.chatSessions);
  const locale = useStore(s => s.locale);

  const activityLabel: Record<Activity["type"], string> = {
    dispatch: pickLocaleText(locale, { "zh-CN": "调度", "zh-TW": "調度", en: "Dispatch", ja: "配信" }),
    task_start: pickLocaleText(locale, { "zh-CN": "开始", "zh-TW": "開始", en: "Start", ja: "開始" }),
    task_done: pickLocaleText(locale, { "zh-CN": "完成", "zh-TW": "完成", en: "Done", ja: "完了" }),
    task_fail: pickLocaleText(locale, { "zh-CN": "失败", "zh-TW": "失敗", en: "Failed", ja: "失敗" }),
    meeting: pickLocaleText(locale, { "zh-CN": "会议", "zh-TW": "會議", en: "Meeting", ja: "会議" }),
    tool_start: pickLocaleText(locale, { "zh-CN": "工具", "zh-TW": "工具", en: "Tool", ja: "ツール" }),
    tool_done: pickLocaleText(locale, { "zh-CN": "工具完成", "zh-TW": "工具完成", en: "Tool Done", ja: "ツール完了" }),
    tool_fail: pickLocaleText(locale, { "zh-CN": "工具失败", "zh-TW": "工具失敗", en: "Tool Failed", ja: "ツール失敗" }),
  };

  const findTaskInSessions = (taskId: string) =>
    chatSessions.some(sess => sess.tasks.some(t => t.id === taskId));

  if (activities.length === 0) {
    return (
      <div className="activity-panel__empty">
        {pickLocaleText(locale, {
          "zh-CN": "活动记录为空",
          "zh-TW": "活動記錄為空",
          en: "No activity yet",
          ja: "アクティビティはまだありません",
        })}
      </div>
    );
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
            locale={locale}
            activityLabel={activityLabel}
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
  locale,
  activityLabel,
  onJump,
}: {
  activity: Activity;
  canJump: boolean;
  locale: ReturnType<typeof useStore.getState>["locale"];
  activityLabel: Record<Activity["type"], string>;
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
      title={onJump
        ? pickLocaleText(locale, {
            "zh-CN": "点击跳转到对应对话",
            "zh-TW": "點擊跳轉到對應對話",
            en: "Jump to this conversation",
            ja: "この会話へ移動",
          })
        : activity.taskId
          ? pickLocaleText(locale, {
              "zh-CN": "该任务不在当前历史会话中",
              "zh-TW": "該任務不在目前歷史會話中",
              en: "This task is not in the current chat history",
              ja: "このタスクは現在の会話履歴にありません",
            })
          : undefined}
    >
      <div className="activity-panel__head">
        <span className="activity-panel__emoji"><AgentIcon agentId={activity.agentId} size={14} /></span>
        <span className="activity-panel__name">{meta.name}</span>
        <span
          className="activity-panel__badge"
          style={{ "--activity-accent": ACTIVITY_COLOR[activity.type] } as CSSProperties}
        >
          {activityLabel[activity.type]}
        </span>
        {activity.durationMs && (
          <span className="activity-panel__duration">{formatDuration(activity.durationMs)}</span>
        )}
        <span className="activity-panel__time">{timeAgo(activity.timestamp, locale)}</span>
        {onJump && (
          <span className="activity-panel__jump">
            {pickLocaleText(locale, { "zh-CN": "定位", "zh-TW": "定位", en: "Jump", ja: "移動" })}
          </span>
        )}
      </div>
      <div className="activity-panel__summary">{activity.summary}</div>
    </div>
  );
}
