"use client";

import { useStore } from "@/store";
import { AGENT_META, AGENT_SKILLS } from "@/store/types";
import type { AgentId } from "@/store/types";

const STATUS_ICON = {
  idle: "●",
  running: "◐",
  error: "✕",
} as const;

export function AgentGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
      {(Object.keys(AGENT_META) as AgentId[]).map(id => (
        <AgentCard key={id} agentId={id} />
      ))}
    </div>
  );
}

function AgentCard({ agentId }: { agentId: AgentId }) {
  const agent = useStore(state => state.agents[agentId]);
  const config = useStore(state => state.agentConfigs[agentId]);
  const meta = AGENT_META[agentId];
  const enabledSkills = AGENT_SKILLS.filter(skill => config.skills.includes(skill.id));

  return (
    <div
      className="card animate-fade-in"
      style={{
        padding: "10px 10px 12px",
        borderColor: agent.status === "running"
          ? "rgba(var(--accent-rgb), 0.35)"
          : agent.status === "error"
            ? "rgba(var(--danger-rgb), 0.35)"
            : undefined,
        background: agent.status === "running" ? "var(--accent-dim)" : undefined,
        transition: "all 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{config.emoji || meta.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>{config.name || meta.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{agentId}</div>
        </div>
        <span
          style={{
            fontSize: 13,
            color: agent.status === "error" ? "var(--danger)" : agent.status === "running" ? "var(--accent)" : "var(--text-muted)",
          }}
          title={agent.status}
        >
          {STATUS_ICON[agent.status]}
        </span>
      </div>

      {agent.currentTask && (
        <div
          style={{
            fontSize: 10,
            color: "var(--accent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 8,
          }}
          title={agent.currentTask}
        >
          {agent.currentTask}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: enabledSkills.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>技能</span>
        <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{enabledSkills.length} 项</span>
      </div>

      {enabledSkills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {enabledSkills.slice(0, 3).map(skill => (
            <div
              key={skill.id}
              style={{
                fontSize: 10,
                color: "var(--text)",
                padding: "4px 6px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {skill.name}
            </div>
          ))}
          {enabledSkills.length > 3 && (
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>还有 {enabledSkills.length - 3} 项...</div>
          )}
        </div>
      )}
    </div>
  );
}
