"use client";

import { useMemo, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import { AGENT_META, AGENT_SKILLS } from "@/store/types";
import type { AgentConfig, AgentId, AgentSkillId } from "@/store/types";

const SKILL_RECOMMENDATIONS: Record<AgentSkillId, AgentId[]> = {
  frontend: ["designer", "orchestrator"],
  doc_word: ["writer", "greeter"],
  doc_ppt: ["writer", "performer"],
  doc_excel: ["explorer", "orchestrator"],
  screenshot: ["explorer", "designer"],
  image_edit: ["designer", "performer"],
};

const SKILL_PLAYBOOKS: Array<{
  id: string;
  title: string;
  copy: string;
  accent: string;
  assignments: Array<{ agentId: AgentId; skillIds: AgentSkillId[] }>;
}> = [
  {
    id: "commerce-launch",
    title: "Launch Pack",
    copy: "Frontend, image editing, and screenshots for product-page shipping.",
    accent: "#7dd3fc",
    assignments: [
      { agentId: "designer", skillIds: ["frontend", "image_edit", "screenshot"] },
      { agentId: "orchestrator", skillIds: ["frontend"] },
    ],
  },
  {
    id: "content-factory",
    title: "Content Pack",
    copy: "Docs and deck skills for copy, reports, and buyer-facing materials.",
    accent: "#fda4af",
    assignments: [
      { agentId: "writer", skillIds: ["doc_word", "doc_ppt"] },
      { agentId: "greeter", skillIds: ["doc_word"] },
      { agentId: "performer", skillIds: ["doc_ppt"] },
    ],
  },
  {
    id: "research-ops",
    title: "Research Pack",
    copy: "Spreadsheet analysis plus capture workflow for research and ops.",
    accent: "#86efac",
    assignments: [
      { agentId: "explorer", skillIds: ["doc_excel", "screenshot"] },
      { agentId: "orchestrator", skillIds: ["doc_excel"] },
    ],
  },
];

export function SkillsCenter() {
  const { agentConfigs, updateAgentConfig } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(AGENT_SKILLS.map(skill => skill.category)))],
    [],
  );

  const filteredSkills = useMemo(
    () => AGENT_SKILLS.filter(skill => activeCategory === "all" || skill.category === activeCategory),
    [activeCategory],
  );

  const skillCoverage = useMemo(
    () =>
      Object.fromEntries(
        AGENT_SKILLS.map(skill => [
          skill.id,
          (Object.keys(AGENT_META) as AgentId[]).filter(agentId => agentConfigs[agentId].skills.includes(skill.id)).length,
        ]),
      ) as Record<AgentSkillId, number>,
    [agentConfigs],
  );

  const enabledAssignments = useMemo(
    () =>
      (Object.keys(AGENT_META) as AgentId[]).reduce(
        (total, agentId) => total + agentConfigs[agentId].skills.length,
        0,
      ),
    [agentConfigs],
  );

  const agentsWithoutSkills = useMemo(
    () => (Object.keys(AGENT_META) as AgentId[]).filter(agentId => agentConfigs[agentId].skills.length === 0),
    [agentConfigs],
  );

  const mostUsedSkill = useMemo(
    () =>
      [...AGENT_SKILLS].sort(
        (left, right) => (skillCoverage[right.id] ?? 0) - (skillCoverage[left.id] ?? 0),
      )[0] ?? null,
    [skillCoverage],
  );

  const toggleSkill = async (agentId: AgentId, skillId: AgentSkillId) => {
    const config = agentConfigs[agentId];
    const nextSkills = config.skills.includes(skillId)
      ? config.skills.filter(id => id !== skillId)
      : [...config.skills, skillId];
    updateAgentConfig(agentId, { skills: nextSkills });
    await syncSettings();
  };

  const applyRecommended = async (skillId: AgentSkillId) => {
    for (const agentId of SKILL_RECOMMENDATIONS[skillId]) {
      const config = useStore.getState().agentConfigs[agentId];
      if (config.skills.includes(skillId)) continue;
      useStore.getState().updateAgentConfig(agentId, { skills: [...config.skills, skillId] });
    }
    await syncSettings();
  };

  const applyPlaybook = async (playbookId: string) => {
    const playbook = SKILL_PLAYBOOKS.find(item => item.id === playbookId);
    if (!playbook) return;

    for (const assignment of playbook.assignments) {
      const config = useStore.getState().agentConfigs[assignment.agentId];
      const mergedSkills = Array.from(new Set([...config.skills, ...assignment.skillIds]));
      useStore.getState().updateAgentConfig(assignment.agentId, { skills: mergedSkills });
    }

    await syncSettings();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(125, 211, 252, 0.16), rgba(255,255,255,0.02))",
          borderColor: "rgba(125, 211, 252, 0.24)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Skills Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Cross-agent capability board inspired by openhanako
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          Use this page to see coverage, apply suggested skill layouts, and rebalance agent capability without opening each card one by one.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Skill Types" value={AGENT_SKILLS.length} accent="var(--accent)" />
        <MetricCard label="Assignments" value={enabledAssignments} accent="#7dd3fc" />
        <MetricCard label="Agents Ready" value={Object.keys(AGENT_META).length - agentsWithoutSkills.length} accent="var(--success)" />
        <MetricCard label="Needs Setup" value={agentsWithoutSkills.length} accent="var(--warning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.9fr)", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Playbooks</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                One-click layouts for common collaboration modes.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {SKILL_PLAYBOOKS.map(playbook => (
              <article
                key={playbook.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: 180,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${playbook.accent}33`,
                  background: `linear-gradient(180deg, ${playbook.accent}1f, rgba(255,255,255,0.02) 55%)`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{playbook.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{playbook.copy}</div>
                <div style={{ display: "grid", gap: 6, marginTop: "auto" }}>
                  {playbook.assignments.map(assignment => (
                    <div key={`${playbook.id}-${assignment.agentId}`} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text)" }}>{AGENT_META[assignment.agentId].name}</strong>
                      {` · ${assignment.skillIds.length} skills`}
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost" onClick={() => void applyPlaybook(playbook.id)}>
                  Apply Pack
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Coverage Notes</div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>Most Used Skill</span>
              <strong>{mostUsedSkill ? `${mostUsedSkill.name} · ${skillCoverage[mostUsedSkill.id]} agents` : "None"}</strong>
            </div>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>Agents Missing Skills</span>
              <strong>{agentsWithoutSkills.length > 0 ? agentsWithoutSkills.map(agentId => AGENT_META[agentId].name).join(", ") : "All agents have at least one skill"}</strong>
            </div>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>Category Mix</span>
              <strong>{Array.from(new Set(AGENT_SKILLS.map(skill => skill.category))).join(" · ")}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Skill Library</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Toggle skills across the team and apply recommended placements.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map(category => (
              <button
                key={category}
                type="button"
                className="btn-ghost"
                onClick={() => setActiveCategory(category)}
                style={{
                  borderColor: activeCategory === category ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)",
                  background: activeCategory === category ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                  color: activeCategory === category ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {category === "all" ? "All" : category}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {filteredSkills.map(skill => (
            <article
              key={skill.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.025)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{skill.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 4 }}>
                    {skill.description}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(var(--accent-rgb), 0.12)",
                      color: "var(--accent)",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {skill.category}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{skillCoverage[skill.id]} agents</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {(Object.keys(AGENT_META) as AgentId[]).map(agentId => {
                  const enabled = agentConfigs[agentId].skills.includes(skill.id);
                  return (
                    <button
                      key={`${skill.id}-${agentId}`}
                      type="button"
                      onClick={() => void toggleSkill(agentId, skill.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: `1px solid ${enabled ? "rgba(var(--accent-rgb), 0.34)" : "var(--border)"}`,
                        background: enabled ? "rgba(var(--accent-rgb), 0.1)" : "rgba(255,255,255,0.02)",
                        color: "var(--text)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{agentConfigs[agentId].emoji || AGENT_META[agentId].emoji}</span>
                        <span>
                          <strong style={{ display: "block", fontSize: 12 }}>{agentConfigs[agentId].name || AGENT_META[agentId].name}</strong>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{agentId}</span>
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
                        {enabled ? "Enabled" : "Off"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Suggested: {SKILL_RECOMMENDATIONS[skill.id].map(agentId => AGENT_META[agentId].name).join(", ")}
                </span>
                <button type="button" className="btn-ghost" onClick={() => void applyRecommended(skill.id)}>
                  Apply Suggested
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Agent Matrix</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
          {(Object.keys(AGENT_META) as AgentId[]).map(agentId => (
            <AgentSkillsCard key={agentId} agentId={agentId} config={agentConfigs[agentId]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentSkillsCard({ agentId, config }: { agentId: AgentId; config: AgentConfig }) {
  const enabledSkills = AGENT_SKILLS.filter(skill => config.skills.includes(skill.id));

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{config.emoji || AGENT_META[agentId].emoji}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{config.name || AGENT_META[agentId].name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{agentId}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {enabledSkills.length > 0 ? `${enabledSkills.length} enabled skills` : "No skills assigned yet"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {enabledSkills.length > 0 ? enabledSkills.map(skill => (
          <span
            key={`${agentId}-${skill.id}`}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 11,
              color: "var(--text)",
            }}
          >
            {skill.name}
          </span>
        )) : (
          <span style={{ fontSize: 11, color: "var(--warning)" }}>Recommended to configure before heavy tasks</span>
        )}
      </div>
    </article>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

async function syncSettings() {
  const { providers, agentConfigs, userNickname } = useStore.getState();

  try {
    if (sendWs({ type: "settings_sync", providers, agentConfigs, userNickname })) {
      return;
    }

    const url = await resolveBackendUrl("/api/settings");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers, agentConfigs, userNickname }),
    });
  } catch (error) {
    console.error("Failed to sync settings:", error);
  }
}

const noteBlockStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  padding: 12,
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.025)",
};

const noteLabelStyle = {
  fontSize: 10,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};
