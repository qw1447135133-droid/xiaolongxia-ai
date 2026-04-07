"use client";

import { pickLocaleText } from "@/lib/ui-locale";
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
  const locale = useStore(state => state.locale);
  const config = useStore(state => state.agentConfigs[agentId]);
  const meta = AGENT_META[agentId];
  const autoSkills = AGENT_SKILLS.filter(skill => skill.recommendedAgents.includes(agentId));

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
        <span>{pickLocaleText(locale, { "zh-CN": "技能", "zh-TW": "技能", en: "Skills", ja: "スキル" })}</span>
        <span>{autoSkills.length}</span>
      </div>

      {autoSkills.length > 0 && (
        <div className="agent-grid__skills">
          {autoSkills.slice(0, 3).map(skill => (
            <div key={skill.id} className="agent-grid__skill">
              {skill.locales[locale]?.name ?? skill.locales["zh-CN"].name}
            </div>
          ))}
          {autoSkills.length > 3 && (
            <div className="agent-grid__more">
              {pickLocaleText(locale, {
                "zh-CN": `还有 ${autoSkills.length - 3} 项...`,
                "zh-TW": `還有 ${autoSkills.length - 3} 項...`,
                en: `${autoSkills.length - 3} more...`,
                ja: `ほか ${autoSkills.length - 3} 件...`,
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
