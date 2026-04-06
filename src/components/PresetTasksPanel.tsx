"use client";

import { useState } from "react";
import { PRESET_TASKS, CATEGORY_LABELS } from "@/lib/preset-tasks";
import type { PresetTask } from "@/lib/preset-tasks";

interface PresetTasksPanelProps {
  onSelectTask: (instruction: string) => void;
}

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as PresetTask["category"][];

export function PresetTasksPanel({ onSelectTask }: PresetTasksPanelProps) {
  const [activeCategory, setActiveCategory] = useState<PresetTask["category"] | "all">("all");

  const filtered = activeCategory === "all"
    ? PRESET_TASKS
    : PRESET_TASKS.filter(task => task.category === activeCategory);

  return (
    <div className="preset-tasks">
      <div className="preset-tasks__header">
        <span className="preset-tasks__emoji">🎬</span>
        <span>短剧题材</span>
      </div>

      <div className="preset-tasks__filters">
        <button
          type="button"
          className={`preset-tasks__filter-btn ${activeCategory === "all" ? "is-active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          全部
        </button>
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            className={`preset-tasks__filter-btn ${activeCategory === cat ? "is-active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="preset-tasks__grid">
        {filtered.map(task => (
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
      <div className="preset-tasks__card-category">{task.audience} · {CATEGORY_LABELS[task.category]}</div>
    </button>
  );
}
