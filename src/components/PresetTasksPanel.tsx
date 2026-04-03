"use client";

import { PRESET_TASKS, CATEGORY_LABELS } from "@/lib/preset-tasks";
import type { PresetTask } from "@/lib/preset-tasks";

interface PresetTasksPanelProps {
  onSelectTask: (instruction: string) => void;
}

export function PresetTasksPanel({ onSelectTask }: PresetTasksPanelProps) {
  return (
    <div className="preset-tasks">
      <div className="preset-tasks__header">
        <span className="preset-tasks__emoji">⚡</span>
        <span>预设任务</span>
      </div>

      <div className="preset-tasks__grid">
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
    <button type="button" className="preset-tasks__card" onClick={onClick}>
      <div className="preset-tasks__card-head">
        <span className="preset-tasks__card-icon">{task.icon}</span>
        <span className="preset-tasks__card-title">{task.name}</span>
      </div>

      <div className="preset-tasks__card-desc">{task.description}</div>

      <div className="preset-tasks__card-category">{CATEGORY_LABELS[task.category]}</div>
    </button>
  );
}
