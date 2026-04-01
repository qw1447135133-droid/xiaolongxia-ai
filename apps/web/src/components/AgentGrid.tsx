"use client";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { AgentId } from "@/store/types";

const STATUS_ICON = { idle: "💤", running: "⏳", error: "❌" };

export function AgentGrid() {
  const agents = useStore(s => s.agents);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
      {(Object.keys(AGENT_META) as AgentId[]).map(id => (
        <AgentCard key={id} agentId={id} />
      ))}
    </div>
  );
}

function AgentCard({ agentId }: { agentId: AgentId }) {
  const agent = useStore(s => s.agents[agentId]);
  const meta = AGENT_META[agentId];

  return (
    <div
      className="card animate-fade-in"
      style={{
        padding: "6px 8px",
        borderColor: agent.status === "running"
          ? "rgba(var(--accent-rgb), 0.4)"
          : agent.status === "error"
          ? "rgba(var(--danger-rgb), 0.4)"
          : undefined,
        background: agent.status === "running" ? "var(--accent-dim)" : undefined,
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{meta.emoji}</span>
        <span style={{ fontWeight: 600, fontSize: 11, flex: 1 }}>{meta.name}</span>
        <span style={{ fontSize: 12 }}>{STATUS_ICON[agent.status]}</span>
      </div>

      {agent.currentTask && (
        <div style={{
          fontSize: 10,
          color: "var(--accent)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {agent.currentTask}
        </div>
      )}
    </div>
  );
}
