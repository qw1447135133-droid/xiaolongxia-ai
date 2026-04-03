"use client";

import { useState, useEffect } from "react";
import {
  getScheduledTasks,
  addScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  type ScheduledTask,
} from "@/lib/scheduled-tasks";

interface ScheduledTasksPanelProps {
  onExecuteTask: (instruction: string) => void;
}

const SCHEDULE_TYPE_LABELS = {
  once: "一次性",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
};

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function ScheduledTasksPanel({ onExecuteTask }: ScheduledTasksPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setTasks(getScheduledTasks());
  }, []);

  const handleAddTask = (task: Omit<ScheduledTask, "id" | "createdAt" | "nextRunTime">) => {
    addScheduledTask(task);
    setTasks(getScheduledTasks());
    setShowForm(false);
  };

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    updateScheduledTask(id, { enabled });
    setTasks(getScheduledTasks());
  };

  const handleDelete = (id: string) => {
    if (confirm("确定要删除这个定时任务吗？")) {
      deleteScheduledTask(id);
      setTasks(getScheduledTasks());
    }
  };

  return (
    <div className="scheduled-tasks">
      <div className="scheduled-tasks__header">
        <div className="scheduled-tasks__title-wrap">
          <span className="scheduled-tasks__emoji">⏰</span>
          <span>定时任务</span>
        </div>
        <button
          type="button"
          className="btn-primary scheduled-tasks__toggle"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "取消" : "+ 添加"}
        </button>
      </div>

      {showForm && <TaskForm onSubmit={handleAddTask} onCancel={() => setShowForm(false)} />}

      {tasks.length === 0 ? (
        <div className="scheduled-tasks__empty">暂无定时任务</div>
      ) : (
        <div className="scheduled-tasks__list">
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={handleToggleEnabled}
              onDelete={handleDelete}
              onExecute={onExecuteTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  onToggle,
  onDelete,
  onExecute,
}: {
  task: ScheduledTask;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onExecute: (instruction: string) => void;
}) {
  const nextRun = new Date(task.nextRunTime);
  const lastRun = task.lastRunTime ? new Date(task.lastRunTime) : null;

  const formatSchedule = () => {
    const { type, time, dayOfWeek, dayOfMonth } = task.schedule;
    let desc = SCHEDULE_TYPE_LABELS[type];
    if (type === "weekly" && dayOfWeek !== undefined) {
      desc += ` ${WEEKDAY_LABELS[dayOfWeek]}`;
    } else if (type === "monthly" && dayOfMonth !== undefined) {
      desc += ` ${dayOfMonth}号`;
    }
    return `${desc} ${time}`;
  };

  return (
    <div className={`scheduled-tasks__item ${task.enabled ? "" : "is-disabled"}`}>
      <div className="scheduled-tasks__item-body">
        <input
          type="checkbox"
          checked={task.enabled}
          onChange={e => onToggle(task.id, e.target.checked)}
          className="scheduled-tasks__checkbox"
        />

        <div className="scheduled-tasks__content">
          <div className="scheduled-tasks__name">{task.name}</div>
          <div className="scheduled-tasks__schedule">{formatSchedule()}</div>
          <div className="scheduled-tasks__instruction">{task.instruction}</div>
          <div className="scheduled-tasks__meta">
            下次执行: {nextRun.toLocaleString("zh-CN")}
            {lastRun && ` · 上次: ${lastRun.toLocaleString("zh-CN")}`}
          </div>
          <div className="scheduled-tasks__actions">
            <button
              type="button"
              className="btn-ghost scheduled-tasks__run"
              onClick={() => onExecute(task.instruction)}
            >
              立即执行
            </button>
            <button
              type="button"
              className="scheduled-tasks__delete"
              onClick={() => onDelete(task.id)}
              title="删除"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (task: Omit<ScheduledTask, "id" | "createdAt" | "nextRunTime">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [type, setType] = useState<ScheduledTask["schedule"]["type"]>("daily");
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [date, setDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instruction.trim()) return;

    const schedule: ScheduledTask["schedule"] = { type, time };
    if (type === "weekly") schedule.dayOfWeek = dayOfWeek;
    if (type === "monthly") schedule.dayOfMonth = dayOfMonth;
    if (type === "once") schedule.date = date;

    onSubmit({
      name: name.trim(),
      instruction: instruction.trim(),
      schedule,
      enabled: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="scheduled-form">
      <div className="scheduled-form__field">
        <label className="scheduled-form__label">任务名称</label>
        <input
          className="input scheduled-form__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例：每日市场分析"
          required
        />
      </div>

      <div className="scheduled-form__field">
        <label className="scheduled-form__label">执行指令</label>
        <textarea
          className="input scheduled-form__textarea"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="输入要执行的任务指令..."
          required
        />
      </div>

      <div className="scheduled-form__grid">
        <div>
          <label className="scheduled-form__label">执行频率</label>
          <select
            className="input scheduled-form__input"
            value={type}
            onChange={e => setType(e.target.value as ScheduledTask["schedule"]["type"])}
          >
            <option value="once">一次性</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </div>

        <div>
          <label className="scheduled-form__label">执行时间</label>
          <input
            className="input scheduled-form__input"
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            required
          />
        </div>
      </div>

      {type === "once" && (
        <div className="scheduled-form__field">
          <label className="scheduled-form__label">执行日期</label>
          <input
            className="input scheduled-form__input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />
        </div>
      )}

      {type === "weekly" && (
        <div className="scheduled-form__field">
          <label className="scheduled-form__label">星期几</label>
          <select
            className="input scheduled-form__input"
            value={dayOfWeek}
            onChange={e => setDayOfWeek(Number(e.target.value))}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "monthly" && (
        <div className="scheduled-form__field">
          <label className="scheduled-form__label">每月几号</label>
          <input
            className="input scheduled-form__input"
            type="number"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={e => setDayOfMonth(Number(e.target.value))}
            required
          />
        </div>
      )}

      <div className="scheduled-form__actions">
        <button type="button" className="btn-ghost scheduled-form__button" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn-primary scheduled-form__button">
          创建任务
        </button>
      </div>
    </form>
  );
}
