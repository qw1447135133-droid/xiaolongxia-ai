"use client";
import { PRESET_TASKS, CATEGORY_LABELS } from "@/lib/preset-tasks";
import type { PresetTask } from "@/lib/preset-tasks";

interface PresetTasksPanelProps {
  onSelectTask: (instruction: string) => void;
}

export function PresetTasksPanel({ onSelectTask }: PresetTasksPanelProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text)",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span>⚡</span>
        <span>预设任务</span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 10,
      }}>
        {PRESET_TASKS.map(task => (
          <PresetTaskCard
            key={task.id}
            task={task}
            onClick={() => onSelectTask(task.instruction)}
          />
        ))}
      </div>
    </div>
  );
}

function PresetTaskCard({ task, onClick }: { task: PresetTask; onClick: () => void }) {
  return (
    <button
      className="card"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        textAlign: "left",
        cursor: "pointer",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.background = "var(--accent-dim)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--bg-card)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>{task.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{task.name}</span>
      </div>

      <div style={{
        fontSize: 10,
        color: "var(--text-muted)",
        lineHeight: 1.4,
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}>
        {task.description}
      </div>

      <div style={{
        fontSize: 9,
        color: "var(--accent)",
        marginTop: 6,
        fontWeight: 500,
      }}>
        {CATEGORY_LABELS[task.category]}
      </div>
    </button>
  );
}
