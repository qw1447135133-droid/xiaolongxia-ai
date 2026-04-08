"use client";

import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { AGENT_META, AGENT_SKILLS } from "@/store/types";
import type { AgentId, AgentSkill } from "@/store/types";
import { AgentIcon } from "./AgentIcon";

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
  const registeredSkills = config.skills
    .map(skillId => AGENT_SKILLS.find(skill => skill.id === skillId))
    .filter((skill): skill is AgentSkill => Boolean(skill));
  const recommendedSkills = registeredSkills.filter(skill => skill.recommendedAgents.includes(agentId));
  const previewSkills = recommendedSkills.length > 0 ? recommendedSkills : registeredSkills;

  return (
    <div className={`agent-grid__card animate-fade-in agent-grid__card--${agent.status}`}>
      <div className="agent-grid__head">
        <span className="agent-grid__emoji"><AgentIcon agentId={agentId} size={18} /></span>
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
        <span>{pickLocaleText(locale, { "zh-CN": "技能档案", "zh-TW": "技能檔案", en: "Skill Registry", ja: "技能台帳" })}</span>
        <span>{registeredSkills.length}</span>
      </div>

      {previewSkills.length > 0 ? (
        <div className="agent-grid__skills">
          {previewSkills.slice(0, 3).map(skill => (
            <div key={skill.id} className="agent-grid__skill">
              {skill.locales[locale]?.name ?? skill.locales["zh-CN"].name}
            </div>
          ))}
          {previewSkills.length > 3 && (
            <div className="agent-grid__more">
              {pickLocaleText(locale, {
                "zh-CN": `还有 ${previewSkills.length - 3} 项...`,
                "zh-TW": `還有 ${previewSkills.length - 3} 項...`,
                en: `${previewSkills.length - 3} more...`,
                ja: `ほか ${previewSkills.length - 3} 件...`,
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="agent-grid__more">
          {pickLocaleText(locale, {
            "zh-CN": "执行前自动扫描技能库",
            "zh-TW": "執行前自動掃描技能庫",
            en: "Runtime scans the skill catalog",
            ja: "実行前に skill カタログを走査",
          })}
        </div>
      )}
    </div>
  );
}
