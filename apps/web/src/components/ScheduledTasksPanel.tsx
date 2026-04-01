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
  once: '一次性',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function ScheduledTasksPanel({ onExecuteTask }: ScheduledTasksPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setTasks(getScheduledTasks());
  }, []);

  const handleAddTask = (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'nextRunTime'>) => {
    const newTask = addScheduledTask(task);
    setTasks(getScheduledTasks());
    setShowForm(false);
  };

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    updateScheduledTask(id, { enabled });
    setTasks(getScheduledTasks());
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个定时任务吗？')) {
      deleteScheduledTask(id);
      setTasks(getScheduledTasks());
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text)",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>⏰</span>
          <span>定时任务</span>
        </div>
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: "4px 10px" }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '取消' : '+ 添加'}
        </button>
      </div>

      {showForm && <TaskForm onSubmit={handleAddTask} onCancel={() => setShowForm(false)} />}

      {tasks.length === 0 ? (
        <div style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "center",
          padding: "20px 0",
        }}>
          暂无定时任务
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={handleToggleEnabled}
              onDelete={handleDelete}
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
}: {
  task: ScheduledTask;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const nextRun = new Date(task.nextRunTime);
  const lastRun = task.lastRunTime ? new Date(task.lastRunTime) : null;

  const formatSchedule = () => {
    const { type, time, dayOfWeek, dayOfMonth } = task.schedule;
    let desc = SCHEDULE_TYPE_LABELS[type];
    if (type === 'weekly' && dayOfWeek !== undefined) {
      desc += ` ${WEEKDAY_LABELS[dayOfWeek]}`;
    } else if (type === 'monthly' && dayOfMonth !== undefined) {
      desc += ` ${dayOfMonth}号`;
    }
    return `${desc} ${time}`;
  };

  return (
    <div
      className="card"
      style={{
        padding: "10px 12px",
        opacity: task.enabled ? 1 : 0.5,
        border: `1px solid ${task.enabled ? 'var(--border)' : 'var(--border-dim)'}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input
          type="checkbox"
          checked={task.enabled}
          onChange={e => onToggle(task.id, e.target.checked)}
          style={{ marginTop: 2, cursor: "pointer" }}
        />

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            {task.name}
          </div>

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
            {formatSchedule()}
          </div>

          <div style={{
            fontSize: 10,
            color: "var(--accent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {task.instruction}
          </div>

          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
            下次执行: {nextRun.toLocaleString('zh-CN')}
            {lastRun && ` · 上次: ${lastRun.toLocaleString('zh-CN')}`}
          </div>
        </div>

        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: "none",
            border: "none",
            color: "var(--danger)",
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
          }}
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function TaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'nextRunTime'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [type, setType] = useState<ScheduledTask['schedule']['type']>('daily');
  const [time, setTime] = useState('09:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instruction.trim()) return;

    const schedule: ScheduledTask['schedule'] = { type, time };
    if (type === 'weekly') schedule.dayOfWeek = dayOfWeek;
    if (type === 'monthly') schedule.dayOfMonth = dayOfMonth;
    if (type === 'once') schedule.date = date;

    onSubmit({
      name: name.trim(),
      instruction: instruction.trim(),
      schedule,
      enabled: true,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card"
      style={{ padding: "12px", marginBottom: 12, border: "1px solid var(--accent)" }}
    >
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          任务名称
        </label>
        <input
          className="input"
          style={{ fontSize: 12 }}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例：每日市场分析"
          required
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
          执行指令
        </label>
        <textarea
          className="input"
          style={{ fontSize: 12, minHeight: 60, resize: "vertical" }}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="输入要执行的任务指令..."
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            执行频率
          </label>
          <select
            className="input"
            style={{ fontSize: 12 }}
            value={type}
            onChange={e => setType(e.target.value as ScheduledTask['schedule']['type'])}
          >
            <option value="once">一次性</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            执行时间
          </label>
          <input
            className="input"
            style={{ fontSize: 12 }}
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            required
          />
        </div>
      </div>

      {type === 'once' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            执行日期
          </label>
          <input
            className="input"
            style={{ fontSize: 12 }}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />
        </div>
      )}

      {type === 'weekly' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            星期几
          </label>
          <select
            className="input"
            style={{ fontSize: 12 }}
            value={dayOfWeek}
            onChange={e => setDayOfWeek(Number(e.target.value))}
          >
            {WEEKDAY_LABELS.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {type === 'monthly' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            每月几号
          </label>
          <input
            className="input"
            style={{ fontSize: 12 }}
            type="number"
            min="1"
            max="31"
            value={dayOfMonth}
            onChange={e => setDayOfMonth(Number(e.target.value))}
            required
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 11, padding: "6px 12px" }}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="submit"
          className="btn-primary"
          style={{ fontSize: 11, padding: "6px 12px" }}
        >
          创建任务
        </button>
      </div>
    </form>
  );
}
