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
    <div className="agent-grid">
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
    <div className={`agent-grid__card animate-fade-in agent-grid__card--${agent.status}`}>
      <div className="agent-grid__head">
        <span className="agent-grid__emoji">{config.emoji || meta.emoji}</span>
        <div className="agent-grid__identity">
          <div className="agent-grid__name">{config.name || meta.name}</div>
          <div className="agent-grid__id">{agentId}</div>
        </div>
        <span className={`agent-grid__status agent-grid__status--${agent.status}`} title={agent.status}>
          {STATUS_ICON[agent.status]}
        </span>
      </div>

      {agent.currentTask && (
        <div className="agent-grid__task" title={agent.currentTask}>
          {agent.currentTask}
        </div>
      )}

      <div className="agent-grid__skills-meta">
        <span>技能</span>
        <span>{enabledSkills.length} 项</span>
      </div>

      {enabledSkills.length > 0 && (
        <div className="agent-grid__skills">
          {enabledSkills.slice(0, 3).map(skill => (
            <div key={skill.id} className="agent-grid__skill">
              {skill.name}
            </div>
          ))}
          {enabledSkills.length > 3 && (
            <div className="agent-grid__more">还有 {enabledSkills.length - 3} 项...</div>
          )}
        </div>
      )}
    </div>
  );
}
