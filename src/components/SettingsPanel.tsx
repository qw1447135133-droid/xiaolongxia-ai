"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { randomId } from "@/lib/utils";
import { resolveBackendUrl } from "@/lib/backend-url";
import { filterByProjectScope } from "@/lib/project-context";
import { buildBusinessEntityGraph } from "@/lib/business-graph";
import { deriveWorldModelSnapshot } from "@/lib/world-model";
import {
  getSemanticMemoryProviderStatus,
  resolveSemanticMemoryEmbeddingTransport,
} from "@/lib/semantic-memory";
import { isManualInjectableKnowledgeDocument } from "@/lib/memory-compression";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import {
  AGENT_META,
  TEAM_OPERATING_TEMPLATES,
  createDefaultAgentGovernance,
  getAgentModelRoutingProfile,
  getRecommendedTierForAgent,
  PROVIDER_MODELS,
  PROVIDER_PRESETS,
  getConfiguredProviders,
  getModelsForProviderInstance,
  getRecommendedModelSelectionForAgent,
  inferRecommendedModelTier,
} from "@/store/types";
import type {
  AgentConfig,
  AgentEscalationMode,
  AgentId,
  AgentMeetingRoleMode,
  AgentMemoryWriteScope,
  AgentSkill,
  AgentToolAccess,
  DesktopProgramEntry,
  ModelPresetTier,
  ModelProvider,
  AgentResponseStyle,
  TeamOperatingTemplateId,
} from "@/store/types";
import { PlatformSettings } from "./PlatformSettings";
import { NativeAppsCenter } from "./NativeAppsCenter";
import { AgentIcon, getAgentIconColor } from "./AgentIcon";

type TestResult =
  | { ok: true; latencyMs: number; model: string; tokens: number; reply: string }
  | { ok: false; error: string };

type SemanticHealthResult =
  | {
      ok: true;
      schema: string;
      table: string;
      dimensions: number;
      documentCount: number;
      embeddingProvider: string;
    }
  | {
      ok: false;
      error: string;
    };

async function testModel(apiKey: string, baseUrl: string, model: string): Promise<TestResult> {
  const url = await resolveBackendUrl("/api/test-model");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, baseUrl, model }),
  });
  return res.json() as Promise<TestResult>;
}

type SettingsSectionId = "agents" | "providers" | "desktop" | "platforms" | "semantic";

export function SettingsPanel({
  initialSection = "agents",
  allowedSections,
  showSectionTabs = true,
}: {
  initialSection?: SettingsSectionId;
  allowedSections?: SettingsSectionId[];
  showSectionTabs?: boolean;
}) {
  const locale = useStore(s => s.locale);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const visibleSections = useMemo(
    () => ([
      { id: "agents", label: "Agent 设置" },
      { id: "providers", label: "模型供应商" },
      { id: "desktop", label: "本机程序" },
      { id: "semantic", label: "语义记忆" },
      { id: "platforms", label: "消息平台" },
    ] as const).filter(section => !allowedSections || allowedSections.includes(section.id)),
    [allowedSections],
  );

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!visibleSections.some(section => section.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id ?? "agents");
    }
  }, [activeSection, visibleSections]);

  const activeSectionMeta = useMemo(() => {
    const sectionMeta: Record<SettingsSectionId, { title: string; copy: string }> = {
      agents: {
        title: "Agent 设置",
        copy: "调整各个 agent 的模型、个性和团队运行模板。",
      },
      providers: {
        title: "模型供应商",
        copy: "统一管理 API Key、Base URL 和默认模型来源。",
      },
      desktop: {
        title: "本机程序",
        copy: "管理本机程序白名单、桌面接管和本地运行策略。",
      },
      semantic: {
        title: "语义记忆",
        copy: "管理语义召回、pgvector 向量后端、知识图谱与长期记忆压缩。",
      },
      platforms: {
        title: "消息平台",
        copy: "配置渠道平台、联调状态和发送能力。",
      },
    };

    return sectionMeta[activeSection];
  }, [activeSection]);

  return (
    <div style={{ display: "grid", gap: 10, height: "100%", minHeight: 0, overflow: "hidden" }}>
      {showSectionTabs ? (
        <div className="control-center__quick-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
          {visibleSections.map(section => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? "btn-ghost settings-panel__section-tab is-active" : "btn-ghost settings-panel__section-tab"}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <section
          className="control-center__panel"
          style={{
            height: "100%",
            minHeight: 0,
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            padding: 14,
            borderRadius: 28,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 4,
              padding: "2px 2px 10px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div className="control-center__eyebrow">
              {locale === "en" ? "Settings" : locale === "ja" ? "設定" : "设置"}
            </div>
            <div className="control-center__panel-title" style={{ fontSize: 18 }}>
              {activeSectionMeta.title}
            </div>
            <div className="control-center__copy" style={{ marginTop: 2, fontSize: 12, lineHeight: 1.6 }}>
              {activeSectionMeta.copy}
            </div>
          </div>

          <div
            style={{
              minHeight: 0,
              overflowY: "auto",
              paddingTop: 10,
              paddingRight: 2,
            }}
          >
            {activeSection === "agents" && <AgentsSection />}
            {activeSection === "providers" && <ProvidersSection />}
            {activeSection === "desktop" && <DesktopProgramsSection />}
            {activeSection === "semantic" && <SemanticSection />}
            {activeSection === "platforms" && <PlatformSettings />}
          </div>
        </section>
      </div>
    </div>
  );
}

function splitGovernanceList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，、]/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  );
}

function governanceToolAccessLabel(value: AgentToolAccess) {
  switch (value) {
    case "full":
      return "完整执行";
    case "meeting_only":
      return "仅会议";
    case "no_desktop":
      return "禁桌面";
    default:
      return "标准";
  }
}

function governanceMemoryLabel(value: AgentMemoryWriteScope) {
  switch (value) {
    case "project_memory":
      return "项目记忆";
    case "none":
      return "不回写";
    default:
      return "执行事件";
  }
}

function governanceMeetingRoleLabel(value: AgentMeetingRoleMode) {
  return value === "judge" ? "裁判位" : "辩手位";
}

function governanceEscalationLabel(value: AgentEscalationMode) {
  return value === "auto" ? "自动收敛" : "先人工确认";
}

function governanceResponseStyleLabel(value: AgentResponseStyle) {
  switch (value) {
    case "combative":
      return "锋利强辩";
    case "assertive":
      return "强势明确";
    default:
      return "冷静中立";
  }
}

function AgentsSection() {
  const {
    agentConfigs,
    providers,
    updateAgentConfig,
    userNickname,
    setUserNickname,
    activeTeamOperatingTemplateId,
    setActiveTeamOperatingTemplate,
  } = useStore();
  const [editing, setEditing] = useState<AgentId | null>(null);
  const [nickDraft, setNickDraft] = useState(userNickname);
  const configuredProviders = useMemo(() => getConfiguredProviders(providers), [providers]);
  const defaultConfiguredProviderId = configuredProviders[0]?.id || "";

  const handleNicknameSave = async () => {
    setUserNickname(nickDraft);
    await syncToServer();
  };

  const applyRolePresetToAgent = async (agentId: AgentId, preferredProviderId?: string) => {
    const currentConfig = agentConfigs[agentId];
    const recommendedTier = getRecommendedTierForAgent(agentId);
    const selection = getRecommendedModelSelectionForAgent(
      providers,
      preferredProviderId || currentConfig.providerId || defaultConfiguredProviderId,
      agentId,
      recommendedTier,
    );
    if (!selection?.providerId || !selection.model) return;

    updateAgentConfig(agentId, { providerId: selection.providerId, model: selection.model });
    await syncToServer();
  };

  const applyRolePresetToAllAgents = async () => {
    for (const agentId of Object.keys(AGENT_META) as AgentId[]) {
      const currentConfig = agentConfigs[agentId];
      const recommendedTier = getRecommendedTierForAgent(agentId);
      const selection = getRecommendedModelSelectionForAgent(
        providers,
        currentConfig.providerId || defaultConfiguredProviderId,
        agentId,
        recommendedTier,
      );
      if (!selection?.providerId || !selection.model) continue;

      updateAgentConfig(agentId, { providerId: selection.providerId, model: selection.model });
    }

    setActiveTeamOperatingTemplate(null);
    await syncToServer();
  };

  const applyOperatingTemplate = async (templateId: TeamOperatingTemplateId) => {
    const template = TEAM_OPERATING_TEMPLATES.find(item => item.id === templateId);
    if (!template) return;

    for (const agentId of Object.keys(AGENT_META) as AgentId[]) {
      const currentConfig = agentConfigs[agentId];
      const tier = template.agentTiers[agentId];
      const selection = getRecommendedModelSelectionForAgent(
        providers,
        currentConfig.providerId || defaultConfiguredProviderId,
        agentId,
        tier,
      );

      updateAgentConfig(agentId, {
        providerId: selection?.providerId || currentConfig.providerId,
        ...(selection?.model ? { model: selection.model } : {}),
      });
    }

    setActiveTeamOperatingTemplate(template.id);
    await syncToServer();
  };

  return (
    <div style={{ display: "grid", gap: 8, overflow: "visible" }}>
      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 88, fontSize: 12, fontWeight: 700 }}>用户称呼</div>
          <input
            value={nickDraft}
            onChange={e => setNickDraft(e.target.value)}
            onBlur={handleNicknameSave}
            onKeyDown={e => e.key === "Enter" && handleNicknameSave()}
            placeholder="Agent 对你的称呼"
            style={{
              flex: 1,
              background: "var(--input-bg, rgba(255,255,255,0.06))",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "5px 10px",
              color: "var(--text)",
              fontSize: 12,
            }}
          />
          <button
            className="btn-primary"
            onClick={handleNicknameSave}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            保存
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>团队运行模板</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
              一键切换整队模型档位和协作节奏。
              </div>
            </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary settings-panel__template-bulk-button"
              style={{ fontSize: 11, padding: "5px 10px" }}
              onClick={() => void applyRolePresetToAllAgents()}
              disabled={configuredProviders.length === 0}
            >
              按角色批量套用
            </button>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {configuredProviders.length === 0
              ? "请先配置至少一个可用的模型供应商"
              : activeTeamOperatingTemplateId
                ? `当前团队模式：${TEAM_OPERATING_TEMPLATES.find(item => item.id === activeTeamOperatingTemplateId)?.label ?? activeTeamOperatingTemplateId}`
                : "还没有套用团队模板"}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
          {TEAM_OPERATING_TEMPLATES.map(template => {
            const active = activeTeamOperatingTemplateId === template.id;
            return (
              <article
                key={template.id}
                className={`settings-panel__template-card ${active ? "is-active" : ""}`}
                style={{
                  borderRadius: 14,
                  padding: 8,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{template.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45, marginTop: 2 }}>
                    {template.description}
                  </div>
                </div>

                <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {template.summary}
                </div>

                <button
                  type="button"
                  className={active ? "btn-primary settings-panel__template-button settings-panel__template-button--active" : "btn-ghost settings-panel__template-button"}
                  style={{ fontSize: 11, padding: "5px 10px" }}
                  onClick={() => void applyOperatingTemplate(template.id)}
                  disabled={configuredProviders.length === 0}
                >
                  套用这个模板
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="settings-agent-grid">
        {(Object.keys(AGENT_META) as AgentId[]).map(id => (
          <div
            key={id}
            className="settings-agent-grid__cell"
            style={editing === id ? { gridColumn: "1 / -1" } : undefined}
          >
            <AgentConfigCard
              agentId={id}
              config={agentConfigs[id]}
              providers={providers}
              isEditing={editing === id}
              onEdit={() => setEditing(editing === id ? null : id)}
              onSave={async updates => {
                updateAgentConfig(id, updates);
                setEditing(null);
                await syncToServer();
              }}
              onQuickModelPreset={async (providerId, model) => {
                updateAgentConfig(id, { providerId, model });
                await syncToServer();
              }}
              onApplyRolePreset={(providerId) => applyRolePresetToAgent(id, providerId)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentConfigCard({
  agentId,
  config,
  providers,
  isEditing,
  onEdit,
  onSave,
  onQuickModelPreset,
  onApplyRolePreset,
}: {
  agentId: AgentId;
  config: AgentConfig;
  providers: ModelProvider[];
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<AgentConfig>) => Promise<void>;
  onQuickModelPreset: (providerId: string, model: string) => Promise<void>;
  onApplyRolePreset: (providerId?: string) => Promise<void>;
}) {
  const locale = useStore(s => s.locale);
  const runtimeAgentSkills = useStore(s => s.runtimeAgentSkills);
  const meta = AGENT_META[agentId];
  const [draft, setDraft] = useState<AgentConfig>({
    ...config,
    governance: config.governance ?? createDefaultAgentGovernance(agentId),
  });
  const configuredProviders = useMemo(() => getConfiguredProviders(providers), [providers]);
  const defaultConfiguredProviderId = configuredProviders[0]?.id || "";
  const selectedSkills = useMemo(
    () =>
      draft.skills
        .map(skillId => runtimeAgentSkills.find(skill => skill.id === skillId))
        .filter(Boolean) as AgentSkill[],
    [draft.skills, runtimeAgentSkills],
  );
  const visibleSkills = useMemo(() => {
    return [...runtimeAgentSkills].sort((left, right) => {
      const leftSelected = draft.skills.includes(left.id) ? 1 : 0;
      const rightSelected = draft.skills.includes(right.id) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      const leftRecommended = left.recommendedAgents.includes(agentId) ? 1 : 0;
      const rightRecommended = right.recommendedAgents.includes(agentId) ? 1 : 0;
      if (leftRecommended !== rightRecommended) return rightRecommended - leftRecommended;
      return (left.order ?? 9999) - (right.order ?? 9999) || left.id.localeCompare(right.id);
    });
  }, [agentId, draft.skills, runtimeAgentSkills]);

  useEffect(() => {
    setDraft({
      ...config,
      governance: config.governance ?? createDefaultAgentGovernance(agentId),
    });
  }, [agentId, config]);

  const selectedProvider = providers.find(p => p.id === draft.providerId);
  const modelOptions = selectedProvider ? getModelsForProviderInstance(selectedProvider) : [];
  const testApiKey = selectedProvider?.apiKey ?? "";
  const testBaseUrl = selectedProvider?.baseUrl ?? "";
  const testModelName = draft.model || (selectedProvider ? (getModelsForProviderInstance(selectedProvider)[0] ?? "") : "");
  const recommendedTier = inferRecommendedModelTier(draft.providerId, draft.model);
  const roleRecommendedTier = getRecommendedTierForAgent(agentId);
  const routingProfile = getAgentModelRoutingProfile(agentId);
  const roleRecommendedSelection = getRecommendedModelSelectionForAgent(
    providers,
    draft.providerId || config.providerId || defaultConfiguredProviderId,
    agentId,
    roleRecommendedTier,
  );
  const roleRecommendedModel = roleRecommendedSelection?.model ?? null;
  const roleRecommendedProvider = roleRecommendedSelection?.providerId ?? draft.providerId;

  const handleApplyModelPreset = async (tier: ModelPresetTier) => {
    const selection = getRecommendedModelSelectionForAgent(
      providers,
      draft.providerId || defaultConfiguredProviderId,
      agentId,
      tier,
    );
    if (!selection?.providerId || !selection.model) return;
    const nextModel = selection.model;

    setDraft(prev => ({ ...prev, providerId: selection.providerId, model: nextModel }));
    await onQuickModelPreset(selection.providerId, nextModel);
  };

  return (
    <div className="card settings-agent-card" style={{ padding: 10, overflow: "visible", position: "relative" }}>
      <div className="settings-agent-card__preview" style={{ marginBottom: isEditing ? 10 : 0 }}>
        <div
          className="settings-agent-card__avatar-wrap"
          style={{
            width: 48,
            height: 48,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <AgentIcon agentId={agentId} size={34} color={getAgentIconColor(agentId)} />
        </div>

        <div className="settings-agent-card__content">
          <div className="settings-agent-card__title-row">
            <div className="settings-agent-card__name">{config.name || meta.name}</div>
            <span className={`badge ${meta.badge}`}>{agentId}</span>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                background: "rgba(var(--accent-rgb), 0.12)",
                color: "var(--accent)",
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {selectedSkills.length > 0
                ? pickLocaleText(locale, {
                    "zh-CN": `技能档案 ${selectedSkills.length} 项`,
                    "zh-TW": `技能檔案 ${selectedSkills.length} 項`,
                    en: `${selectedSkills.length} skills in registry`,
                    ja: `技能台帳 ${selectedSkills.length} 件`,
                  })
                : pickLocaleText(locale, {
                    "zh-CN": "技能档案同步中",
                    "zh-TW": "技能檔案同步中",
                    en: "Skill registry syncing",
                    ja: "技能台帳を同期中",
                  })}
            </span>
          </div>

          <div className="settings-agent-card__model">
            {config.model || "默认模型"} · {providers.find(p => p.id === config.providerId)?.name || "默认供应商"}
          </div>

          <div className="settings-agent-card__chips">
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid rgba(var(--accent-rgb), 0.24)",
                background: "rgba(var(--accent-rgb), 0.08)",
                fontSize: 10,
                color: "var(--text)",
              }}
            >
              角色推荐: {routingProfile.focusLabel} · {roleRecommendedTier === "reasoning" ? "强推理" : roleRecommendedTier === "balanced" ? "平衡" : "省成本"}
            </span>
            {selectedSkills.slice(0, 2).map(skill => (
              <span
                key={skill.id}
                style={{
                  padding: "2px 7px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                {skill.locales[locale]?.name ?? skill.locales["zh-CN"].name}
              </span>
            ))}
            {selectedSkills.length > 2 ? (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                +{selectedSkills.length - 2}
              </span>
            ) : null}
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid rgba(var(--accent-rgb), 0.18)",
                background: "rgba(var(--accent-rgb), 0.06)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              {governanceMeetingRoleLabel(config.governance?.meetingRoleMode ?? createDefaultAgentGovernance(agentId).meetingRoleMode)}
            </span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid rgba(var(--accent-rgb), 0.18)",
                background: "rgba(var(--accent-rgb), 0.06)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              {governanceToolAccessLabel(config.governance?.toolAccess ?? createDefaultAgentGovernance(agentId).toolAccess)}
            </span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 999,
                border: "1px solid rgba(var(--accent-rgb), 0.18)",
                background: "rgba(var(--accent-rgb), 0.06)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}
            >
              {governanceMemoryLabel(config.governance?.memoryWriteScope ?? createDefaultAgentGovernance(agentId).memoryWriteScope)}
            </span>
          </div>

          <div className="settings-agent-card__summary">
            {routingProfile.summary}
          </div>
        </div>

        <div className="settings-agent-card__actions">
          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 9px" }} onClick={onEdit}>
            {isEditing ? "关闭编辑" : "编辑设置"}
          </button>
        </div>
      </div>

      {isEditing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "visible" }}>
          <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>图标</label>
              <div
                style={{ display: "grid", placeItems: "center", minHeight: 48, padding: "8px 4px", color: "var(--text)" }}
              >
                <AgentIcon agentId={agentId} size={34} color={getAgentIconColor(agentId)} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>名称</label>
              <input
                className="input"
                placeholder={meta.name}
                value={draft.name}
                onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>模型供应商</label>
            <select
              className="input"
              value={draft.providerId}
              onChange={e => setDraft(prev => ({ ...prev, providerId: e.target.value, model: "" }))}
            >
              <option value="">使用全局默认</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>模型</label>
            {modelOptions.length > 0 ? (
              <select
                className="input"
                value={draft.model}
                onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
              >
                <option value="">使用供应商默认模型</option>
                {modelOptions.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="例如 gpt-5.4 / gpt-5.4-mini / deepseek-chat"
                value={draft.model}
                onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>推荐模型档位</label>
            <div style={{ display: "grid", gap: 8 }}>
              <div
                className="settings-panel__role-recommendation"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  该角色推荐档位：
                  <strong style={{ color: "var(--text)" }}>
                    {" "}
                    {roleRecommendedTier === "reasoning" ? "强推理" : roleRecommendedTier === "balanced" ? "平衡" : "省成本"}
                  </strong>
                  {roleRecommendedModel ? ` · ${roleRecommendedModel}` : ""}
                  {roleRecommendedProvider && roleRecommendedProvider !== draft.providerId ? ` · 推荐切到 ${providers.find(provider => provider.id === roleRecommendedProvider)?.name ?? roleRecommendedProvider}` : ""}
                </div>
                <button
                  type="button"
                  className="btn-ghost settings-panel__role-recommendation-action"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                  disabled={!roleRecommendedProvider || !roleRecommendedModel}
                  onClick={() => void onApplyRolePreset(draft.providerId || defaultConfiguredProviderId)}
                >
                  应用角色推荐
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {([
                  {
                    tier: "reasoning",
                    label: "强推理",
                    copy: "给复杂规划、评审、重分析任务。",
                  },
                  {
                    tier: "balanced",
                    label: "平衡",
                    copy: "默认推荐，兼顾质量、速度和成本。",
                  },
                  {
                    tier: "budget",
                    label: "省成本",
                    copy: "给大量日常执行、轻任务或高频客服。",
                  },
                ] as const).map(item => {
                  const selection = getRecommendedModelSelectionForAgent(
                    providers,
                    draft.providerId || defaultConfiguredProviderId,
                    agentId,
                    item.tier,
                  );
                  const model = selection?.model ?? null;
                  const active =
                    recommendedTier === item.tier
                    && draft.model === model
                    && (!selection?.providerId || selection.providerId === draft.providerId);

                  return (
                    <button
                      key={item.tier}
                      type="button"
                      className={`btn-ghost settings-panel__tier-button${active ? " is-active" : ""}${!model ? " is-disabled" : ""}`}
                      disabled={!model}
                      onClick={() => void handleApplyModelPreset(item.tier)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                        padding: "10px 12px",
                        minHeight: 86,
                        opacity: model ? 1 : 0.5,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                      <span style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-muted)", textAlign: "left" }}>
                        {model
                          ? `${selection?.providerId && selection.providerId !== draft.providerId ? `${providers.find(provider => provider.id === selection.providerId)?.name ?? selection.providerId} · ` : ""}${model}`
                          : "没有匹配到合适模型"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {!draft.providerId
                  ? "先选择一个模型供应商，再一键切换推荐档位。"
                  : recommendedTier
                    ? `当前命中推荐档位：${recommendedTier === "reasoning" ? "强推理" : recommendedTier === "balanced" ? "平衡" : "省成本"}。`
                    : "当前模型是手动指定值，不属于推荐预设之一。"}
              </div>
            </div>
          </div>

          {draft.providerId && (
            <div>
              <label style={labelStyle}>测试当前配置</label>
              <TestButton apiKey={testApiKey} baseUrl={testBaseUrl} testModel={testModelName} />
            </div>
          )}

          <div>
            <label style={labelStyle}>个性补充</label>
            <textarea
              className="input"
              style={{ resize: "vertical", minHeight: 88, fontFamily: "inherit" }}
              placeholder={`默认：${meta.defaultPersonality}`}
              value={draft.personality}
              onChange={e => setDraft(prev => ({ ...prev, personality: e.target.value }))}
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={labelStyle}>治理合同</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle}>工具权限</label>
                <select
                  className="input"
                  value={draft.governance.toolAccess}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, toolAccess: e.target.value as AgentToolAccess },
                  }))}
                >
                  <option value="standard">标准</option>
                  <option value="no_desktop">禁用桌面执行</option>
                  <option value="meeting_only">仅会议模式</option>
                  <option value="full">完整执行</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>会议站位</label>
                <select
                  className="input"
                  value={draft.governance.meetingRoleMode}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, meetingRoleMode: e.target.value as AgentMeetingRoleMode },
                  }))}
                >
                  <option value="participant">辩手位</option>
                  <option value="judge">裁判位</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>记忆回写</label>
                <select
                  className="input"
                  value={draft.governance.memoryWriteScope}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, memoryWriteScope: e.target.value as AgentMemoryWriteScope },
                  }))}
                >
                  <option value="none">不回写</option>
                  <option value="execution_events">执行事件</option>
                  <option value="project_memory">项目记忆</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>升级策略</label>
                <select
                  className="input"
                  value={draft.governance.escalationMode}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, escalationMode: e.target.value as AgentEscalationMode },
                  }))}
                >
                  <option value="auto">自动收敛</option>
                  <option value="manual_first">先人工确认</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>表达风格</label>
                <select
                  className="input"
                  value={draft.governance.responseStyle}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, responseStyle: e.target.value as AgentResponseStyle },
                  }))}
                >
                  <option value="neutral">冷静中立</option>
                  <option value="assertive">强势明确</option>
                  <option value="combative">锋利强辩</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <div>
                <label style={labelStyle}>禁区主题</label>
                <textarea
                  className="input"
                  style={{ resize: "vertical", minHeight: 74, fontFamily: "inherit" }}
                  placeholder="多个条目可用逗号、顿号或换行分隔"
                  value={draft.governance.forbiddenTopics.join("\n")}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, forbiddenTopics: splitGovernanceList(e.target.value) },
                  }))}
                />
              </div>
              <div>
                <label style={labelStyle}>停止条件</label>
                <textarea
                  className="input"
                  style={{ resize: "vertical", minHeight: 74, fontFamily: "inherit" }}
                  placeholder="例如：验证码、OTP、删除客户数据"
                  value={draft.governance.stopConditions.join("\n")}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    governance: { ...prev.governance, stopConditions: splitGovernanceList(e.target.value) },
                  }))}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                当前治理摘要：{governanceMeetingRoleLabel(draft.governance.meetingRoleMode)} / {governanceToolAccessLabel(draft.governance.toolAccess)} / {governanceMemoryLabel(draft.governance.memoryWriteScope)} / {governanceEscalationLabel(draft.governance.escalationMode)} / {governanceResponseStyleLabel(draft.governance.responseStyle)}
              </span>
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              {pickLocaleText(locale, {
                "zh-CN": "技能档案",
                "zh-TW": "技能檔案",
                en: "Skill Registry",
                ja: "技能台帳",
              })}
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "系统会在每次任务开始前自动扫描全量技能库，只把本次命中的 skills 注入运行时。这里显示的是该 agent 的完整技能档案，不再手动分配。",
                  "zh-TW": "系統會在每次任務開始前自動掃描全量技能庫，只把本次命中的 skills 注入執行時。這裡顯示的是該 agent 的完整技能檔案，不再手動分配。",
                  en: "The system scans the full skill catalog before every task and injects only the matched skills into runtime. This panel shows the complete registry for the agent and is no longer manually assigned.",
                  ja: "システムは毎回のタスク開始前に全 skill カタログを走査し、今回命中した skills だけを実行時へ注入します。ここは agent の完全な技能台帳で、手動割り当ては行いません。",
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {visibleSkills.map(skill => {
                  const recommended = skill.recommendedAgents.includes(agentId);
                  const copy = skill.locales[locale] ?? skill.locales["zh-CN"];
                  return (
                    <div
                      key={skill.id}
                      style={{
                        display: "grid",
                        gap: 4,
                        minWidth: 142,
                        maxWidth: 220,
                        justifyItems: "start",
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: `1px solid ${recommended ? "rgba(var(--accent-rgb), 0.24)" : "var(--border)"}`,
                        background: recommended ? "rgba(var(--accent-rgb), 0.06)" : "rgba(255,255,255,0.03)",
                        color: "var(--text)",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                        {copy.name}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
                        {copy.short}
                      </span>
                      <span style={{ fontSize: 10, color: recommended ? "var(--accent)" : "var(--text-muted)" }}>
                        {recommended
                          ? pickLocaleText(locale, {
                              "zh-CN": "角色推荐",
                              "zh-TW": "角色推薦",
                              en: "Recommended",
                              ja: "推奨",
                            })
                          : skill.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" style={{ padding: "8px 20px" }} onClick={() => void onSave(draft)}>
              保存基础配置
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SemanticSection() {
  const {
    locale,
    providers,
    workspaceRoot,
    chatSessions,
    activeSessionId,
    executionRuns,
    workspaceProjectMemories,
    workspaceDeskNotes,
    semanticKnowledgeDocs,
    businessApprovals,
    businessOperationLogs,
    businessCustomers,
    businessLeads,
    businessTickets,
    businessContentTasks,
    businessChannelSessions,
    semanticMemoryConfig,
    updateSemanticMemoryConfig,
    updateSemanticMemoryPgvectorConfig,
    resetSemanticMemory,
  } = useStore();
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<SemanticHealthResult | null>(null);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const scope = activeSession ?? { projectId: null, workspaceRoot };
  const scopedProjectMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, scope),
    [scope, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, scope),
    [scope, workspaceDeskNotes],
  );
  const scopedKnowledgeDocs = useMemo(
    () => filterByProjectScope(semanticKnowledgeDocs, scope),
    [scope, semanticKnowledgeDocs],
  );
  const scopedVisibleKnowledgeDocs = useMemo(
    () => scopedKnowledgeDocs.filter(isManualInjectableKnowledgeDocument),
    [scopedKnowledgeDocs],
  );
  const scopedApprovals = useMemo(
    () => filterByProjectScope(businessApprovals, scope),
    [businessApprovals, scope],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, scope),
    [businessOperationLogs, scope],
  );
  const scopedCustomers = useMemo(
    () => filterByProjectScope(businessCustomers, scope),
    [businessCustomers, scope],
  );
  const scopedLeads = useMemo(
    () => filterByProjectScope(businessLeads, scope),
    [businessLeads, scope],
  );
  const scopedTickets = useMemo(
    () => filterByProjectScope(businessTickets, scope),
    [businessTickets, scope],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, scope),
    [businessContentTasks, scope],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, scope),
    [businessChannelSessions, scope],
  );
  const scopedRuns = useMemo(
    () =>
      executionRuns.filter(run =>
        (run.projectId ?? null) === (activeSession?.projectId ?? null)
        || (!run.projectId && !activeSession?.projectId),
      ),
    [activeSession?.projectId, executionRuns],
  );
  const businessGraph = useMemo(
    () =>
      buildBusinessEntityGraph({
        customers: scopedCustomers,
        leads: scopedLeads,
        tickets: scopedTickets,
        contentTasks: scopedContentTasks,
        channelSessions: scopedChannelSessions,
      }),
    [scopedChannelSessions, scopedContentTasks, scopedCustomers, scopedLeads, scopedTickets],
  );
  const worldSnapshot = useMemo(
    () =>
      deriveWorldModelSnapshot({
        projectId: activeSession?.projectId ?? null,
        rootPath: activeSession?.workspaceRoot ?? workspaceRoot,
        graph: businessGraph,
        approvals: scopedApprovals,
        channelSessions: scopedChannelSessions,
        contentTasks: scopedContentTasks,
        tickets: scopedTickets,
        operationLogs: scopedOperationLogs,
        executionRuns: scopedRuns,
      }),
    [
      activeSession?.projectId,
      activeSession?.workspaceRoot,
      businessGraph,
      scopedApprovals,
      scopedChannelSessions,
      scopedContentTasks,
      scopedOperationLogs,
      scopedRuns,
      scopedTickets,
      workspaceRoot,
    ],
  );
  const providerStatus = useMemo(
    () => getSemanticMemoryProviderStatus(semanticMemoryConfig),
    [semanticMemoryConfig],
  );
  const statusColor =
    providerStatus.tone === "ready"
      ? "var(--success)"
      : providerStatus.tone === "partial"
        ? "var(--warning)"
        : "var(--text-muted)";

  const handleReset = async () => {
    setIsResetting(true);
    try {
      resetSemanticMemory();
      setHealthResult(null);
      await syncToServer();
    } finally {
      setIsResetting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await syncToServer();
    } finally {
      setIsSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    setIsChecking(true);
    setHealthResult(null);
    try {
      const url = await resolveBackendUrl("/api/semantic-memory/health");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: semanticMemoryConfig.pgvector,
          embedding: resolveSemanticMemoryEmbeddingTransport(providers, semanticMemoryConfig) ?? {},
        }),
      });
      const payload = await response.json();
      setHealthResult(payload as SemanticHealthResult);
    } catch (error) {
      setHealthResult({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                {pickLocaleText(locale, {
                  "zh-CN": "语义记忆由 AI 自动管理",
                  "zh-TW": "語義記憶由 AI 自動管理",
                  en: "Semantic memory is managed automatically by AI",
                  ja: "セマンティック記憶は AI が自動管理します",
                })}
              </div>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${statusColor}`,
                  color: statusColor,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {providerStatus.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 720 }}>
              {pickLocaleText(locale, {
                "zh-CN": "这个模块会在后台自动维护召回策略、项目记忆与知识缓存。长期记忆压缩不会提供人工触发入口，只有在估算上下文接近 230K tokens 时才会自动执行。",
                "zh-TW": "這個模組會在背景自動維護召回策略、專案記憶與知識快取。長期記憶壓縮不提供手動觸發入口，只有在估算上下文接近 230K tokens 時才會自動執行。",
                en: "This module manages recall, project memory, and knowledge cache in the background. Long-term memory compression has no manual trigger and only runs automatically when the estimated context approaches 230K tokens.",
                ja: "このモジュールは想起戦略、プロジェクト記憶、知識キャッシュを自動管理します。長期記憶圧縮は手動起動を提供せず、推定コンテキストが 230K tokens 付近に近づいた時だけ自動実行されます。",
              })}
            </div>
            <div style={{ fontSize: 11, color: statusColor, lineHeight: 1.7 }}>
              {providerStatus.detail}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {[
              {
                label: pickLocaleText(locale, { "zh-CN": "知识文档", "zh-TW": "知識文件", en: "Knowledge Docs", ja: "知識ドキュメント" }),
                value: scopedVisibleKnowledgeDocs.length,
              },
              {
                label: pickLocaleText(locale, { "zh-CN": "图谱节点", "zh-TW": "圖譜節點", en: "Graph Nodes", ja: "グラフノード" }),
                value: businessGraph.nodes.length,
              },
              {
                label: pickLocaleText(locale, { "zh-CN": "图谱关系", "zh-TW": "圖譜關係", en: "Graph Edges", ja: "グラフエッジ" }),
                value: businessGraph.edges.length,
              },
              {
                label: pickLocaleText(locale, { "zh-CN": "自动化就绪度", "zh-TW": "自動化就緒度", en: "Automation Readiness", ja: "自動化準備度" }),
                value: `${worldSnapshot.automationReadiness}%`,
              },
            ].map(item => (
              <div key={item.label} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <label style={labelStyle}>召回后端</label>
              <select
                className="input"
                value={semanticMemoryConfig.providerId}
                onChange={event => {
                  const providerId = event.target.value as "local" | "pgvector";
                  updateSemanticMemoryConfig({ providerId });
                  setHealthResult(null);
                }}
              >
                <option value="local">Local</option>
                <option value="pgvector">pgvector</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                {[
                  {
                    label: pickLocaleText(locale, { "zh-CN": "召回项目记忆", "zh-TW": "召回專案記憶", en: "Recall Project Memory", ja: "プロジェクト記憶を想起" }),
                    checked: semanticMemoryConfig.autoRecallProjectMemories,
                    onChange: (checked: boolean) => updateSemanticMemoryConfig({ autoRecallProjectMemories: checked }),
                  },
                  {
                    label: pickLocaleText(locale, { "zh-CN": "召回 Desk Notes", "zh-TW": "召回 Desk Notes", en: "Recall Desk Notes", ja: "Desk Notes を想起" }),
                    checked: semanticMemoryConfig.autoRecallDeskNotes,
                    onChange: (checked: boolean) => updateSemanticMemoryConfig({ autoRecallDeskNotes: checked }),
                  },
                  {
                    label: pickLocaleText(locale, { "zh-CN": "召回知识文档", "zh-TW": "召回知識文件", en: "Recall Knowledge Docs", ja: "知識ドキュメントを想起" }),
                    checked: semanticMemoryConfig.autoRecallKnowledgeDocs,
                    onChange: (checked: boolean) => updateSemanticMemoryConfig({ autoRecallKnowledgeDocs: checked }),
                  },
                ].map(item => (
                  <label
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.02)",
                      fontSize: 11,
                      color: "var(--text)",
                    }}
                  >
                    <input type="checkbox" checked={item.checked} onChange={event => item.onChange(event.target.checked)} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              {semanticMemoryConfig.providerId === "pgvector" ? (
                <div style={{ display: "grid", gap: 10, border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text)" }}>
                    <input
                      type="checkbox"
                      checked={semanticMemoryConfig.pgvector.enabled}
                      onChange={event => {
                        updateSemanticMemoryPgvectorConfig({ enabled: event.target.checked });
                        setHealthResult(null);
                      }}
                    />
                    <span>启用 pgvector 向量后端</span>
                  </label>

                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Connection String</label>
                      <input
                        className="input"
                        placeholder="postgres://user:password@host:5432/db"
                        value={semanticMemoryConfig.pgvector.connectionString}
                        onChange={event => {
                          updateSemanticMemoryPgvectorConfig({ connectionString: event.target.value });
                          setHealthResult(null);
                        }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Embedding Model</label>
                      <input
                        className="input"
                        placeholder="text-embedding-3-small"
                        value={semanticMemoryConfig.pgvector.embeddingModel}
                        onChange={event => updateSemanticMemoryPgvectorConfig({ embeddingModel: event.target.value })}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Dimensions</label>
                      <input
                        className="input"
                        type="number"
                        min={64}
                        step={1}
                        value={semanticMemoryConfig.pgvector.dimensions}
                        onChange={event => updateSemanticMemoryPgvectorConfig({ dimensions: Number(event.target.value || 1536) })}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Schema</label>
                      <input
                        className="input"
                        value={semanticMemoryConfig.pgvector.schema}
                        onChange={event => updateSemanticMemoryPgvectorConfig({ schema: event.target.value })}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Table</label>
                      <input
                        className="input"
                        value={semanticMemoryConfig.pgvector.table}
                        onChange={event => updateSemanticMemoryPgvectorConfig({ table: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {healthResult ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${healthResult.ok ? "rgba(var(--success-rgb), 0.24)" : "rgba(var(--danger-rgb), 0.24)"}`,
                background: healthResult.ok ? "rgba(var(--success-rgb), 0.08)" : "rgba(var(--danger-rgb), 0.08)",
                color: healthResult.ok ? "var(--success)" : "var(--danger)",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              {healthResult.ok
                ? `pgvector 已连通 · ${healthResult.schema}.${healthResult.table} · ${healthResult.documentCount} docs · ${healthResult.dimensions} dims · ${healthResult.embeddingProvider}`
                : healthResult.error}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {pickLocaleText(locale, {
                "zh-CN": `当前世界状态：${worldSnapshot.summary} 打开的业务回路 ${worldSnapshot.openLoops.length} 条。长期记忆压缩由系统自动执行，不需要人工操作。`,
                "zh-TW": `當前世界狀態：${worldSnapshot.summary} 打開中的業務回路 ${worldSnapshot.openLoops.length} 條。長期記憶壓縮由系統自動執行，不需要人工操作。`,
                en: `Current world state: ${worldSnapshot.summary} ${worldSnapshot.openLoops.length} business loops remain open. Long-term memory compression is system-driven and requires no manual action.`,
                ja: `現在のワールド状態: ${worldSnapshot.summary} 未完了の業務ループは ${worldSnapshot.openLoops.length} 件です。長期記憶圧縮はシステムが自動実行し、手動操作は不要です。`,
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              {semanticMemoryConfig.providerId === "pgvector" ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handleHealthCheck()}
                  disabled={
                    isChecking
                    || !semanticMemoryConfig.pgvector.enabled
                    || !semanticMemoryConfig.pgvector.connectionString.trim()
                  }
                  style={{ fontSize: 12, padding: "8px 14px" }}
                >
                  {isChecking ? "测试中..." : "测试 pgvector"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSave()}
                disabled={isSaving}
                style={{ minWidth: 120, fontSize: 12, padding: "8px 16px" }}
              >
                {isSaving ? "保存中..." : "保存语义设置"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void handleReset()}
                disabled={isResetting}
                style={{
                  minWidth: 140,
                  fontSize: 12,
                  padding: "8px 18px",
                  color: "var(--danger)",
                  borderColor: "rgba(var(--danger-rgb), 0.24)",
                }}
              >
                {isResetting
                  ? pickLocaleText(locale, {
                      "zh-CN": "重置中...",
                      "zh-TW": "重置中...",
                      en: "Resetting...",
                      ja: "リセット中...",
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "重置记忆缓存",
                      "zh-TW": "重置記憶快取",
                      en: "Reset Memory Cache",
                      ja: "記憶キャッシュをリセット",
                    })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvidersSection() {
  const { providers, addProvider, updateProvider, removeProvider } = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          配置 API Key 与 Base URL，每个 agent 都可以独立选择供应商。
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setAdding(true)}>
          + 添加供应商
        </button>
      </div>

      {adding && (
        <AddProviderForm
          onAdd={async provider => {
            addProvider(provider);
            setAdding(false);
            await syncToServer();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {providers.length === 0 && !adding && (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: 28 }}>
          暂无供应商，点击“添加供应商”开始配置。
        </div>
      )}

      {providers.map(provider => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          onUpdate={async updates => {
            updateProvider(provider.id, updates);
            await syncToServer();
          }}
          onRemove={async () => {
            removeProvider(provider.id);
            await syncToServer();
          }}
        />
      ))}
    </div>
  );
}

function DesktopProgramsSection() {
  return (
    <div style={{ height: "100%", minHeight: 0 }}>
      <NativeAppsCenter />
    </div>
  );
}

function AddProviderForm({ onAdd, onCancel }: { onAdd: (provider: ModelProvider) => Promise<void>; onCancel: () => void }) {
  const [preset, setPreset] = useState(PROVIDER_PRESETS[0]!);
  const [apiKey, setApiKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const isCustom = preset.id === "custom";
  const previewProvider = isCustom
    ? { id: `custom-preview`, baseUrl: customUrl }
    : { id: preset.id, baseUrl: preset.baseUrl };
  const defaultModel = getModelsForProviderInstance(previewProvider)[0] ?? PROVIDER_MODELS[preset.id]?.[0] ?? "";

  return (
    <div className="card settings-panel__provider-form" style={{ padding: 14 }}>
      <div className="settings-panel__provider-form-title">新增供应商</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={labelStyle}>供应商预设</label>
          <select
            className="input"
            value={preset.id}
            onChange={e => setPreset(PROVIDER_PRESETS.find(item => item.id === e.target.value) ?? PROVIDER_PRESETS[0]!)}
          >
            {PROVIDER_PRESETS.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        {isCustom && (
          <>
            <div>
              <label style={labelStyle}>名称</label>
              <input className="input" placeholder="我的供应商" value={customName} onChange={e => setCustomName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Base URL</label>
              <input className="input" placeholder="https://api.example.com/v1" value={customUrl} onChange={e => setCustomUrl(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label style={labelStyle}>API Key</label>
          <input className="input" type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
        </div>

        {apiKey.trim() && (
          <div>
            <label style={labelStyle}>添加前测试</label>
            <TestButton apiKey={apiKey} baseUrl={isCustom ? customUrl : preset.baseUrl} testModel={defaultModel} />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={onCancel}>
            取消
          </button>
          <button
            className="btn-primary"
            style={{ fontSize: 12 }}
            disabled={!apiKey.trim()}
            onClick={() =>
              void onAdd({
                id: `${preset.id}-${randomId()}`,
                name: isCustom ? (customName || "自定义供应商") : preset.name,
                apiKey,
                baseUrl: isCustom ? customUrl : preset.baseUrl,
              })
            }
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  onUpdate,
  onRemove,
}: {
  provider: ModelProvider;
  onUpdate: (updates: Partial<ModelProvider>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(provider);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setDraft(provider);
  }, [provider]);

  const defaultModel = getModelsForProviderInstance(provider)[0] ?? "";

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{provider.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{provider.baseUrl || "默认 URL"}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!editing && <TestButton apiKey={provider.apiKey} baseUrl={provider.baseUrl} testModel={defaultModel} />}
          <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setEditing(prev => !prev)}>
            {editing ? "取消编辑" : "编辑"}
          </button>
          <button
            onClick={() => void onRemove()}
            style={{
              background: "rgba(var(--danger-rgb), 0.1)",
              color: "var(--danger)",
              border: "1px solid rgba(var(--danger-rgb), 0.25)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            删除
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <div>
            <label style={labelStyle}>名称</label>
            <input className="input" value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} />
          </div>

          <div>
            <label style={labelStyle}>Base URL</label>
            <input className="input" value={draft.baseUrl} onChange={e => setDraft(prev => ({ ...prev, baseUrl: e.target.value }))} />
          </div>

          <div>
            <label style={labelStyle}>API Key</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={e => setDraft(prev => ({ ...prev, apiKey: e.target.value }))}
                style={{ flex: 1 }}
              />
              <button className="btn-ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setShowKey(prev => !prev)}>
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {draft.apiKey.trim() && (
            <div>
              <label style={labelStyle}>测试连接</label>
              <TestButton apiKey={draft.apiKey} baseUrl={draft.baseUrl} testModel={getModelsForProviderInstance(draft)[0] ?? ""} />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: "8px 18px" }}
              onClick={async () => {
                await onUpdate(draft);
                setEditing(false);
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TestButton({ apiKey, baseUrl, testModel: initialModel }: { apiKey: string; baseUrl: string; testModel: string }) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [result, setResult] = useState<TestResult | null>(null);
  const [customModel, setCustomModel] = useState(initialModel);

  useEffect(() => {
    setCustomModel(initialModel);
  }, [initialModel]);

  const model = initialModel || customModel;

  const run = async () => {
    if (!apiKey.trim() || !model.trim()) return;
    setState("testing");
    setResult(null);
    const nextResult = await testModel(apiKey, baseUrl, model);
    setResult(nextResult);
    setState(nextResult.ok ? "ok" : "fail");
    window.setTimeout(() => setState("idle"), 10000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!initialModel && (
          <input
            className="input"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="输入测试模型名，例如 qwen-max"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
          />
        )}

        <button
          onClick={() => void run()}
          disabled={state === "testing" || !apiKey.trim() || !model.trim()}
          style={{
            padding: "6px 12px",
            fontSize: 11,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${state === "ok" ? "var(--success)" : state === "fail" ? "var(--danger)" : "var(--border)"}`,
            background: state === "ok" ? "rgba(var(--success-rgb), 0.1)" : state === "fail" ? "rgba(var(--danger-rgb), 0.1)" : "transparent",
            color: state === "ok" ? "var(--success)" : state === "fail" ? "var(--danger)" : "var(--text-muted)",
            cursor: state === "testing" ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {state === "testing" && <span className="spinner" style={{ width: 10, height: 10 }} />}
          {state === "idle" && "测试连接"}
          {state === "testing" && "测试中..."}
          {state === "ok" && "连接成功"}
          {state === "fail" && "连接失败"}
        </button>
      </div>

      {result && (
        <div
          style={{
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
            background: result.ok ? "rgba(var(--success-rgb), 0.06)" : "rgba(var(--danger-rgb), 0.06)",
            color: result.ok ? "var(--success)" : "var(--danger)",
            border: `1px solid ${result.ok ? "rgba(var(--success-rgb), 0.2)" : "rgba(var(--danger-rgb), 0.2)"}`,
          }}
        >
          {result.ok
            ? `延迟 ${result.latencyMs}ms · ${result.tokens} tokens · 模型 ${result.model}`
            : result.error}
        </div>
      )}
    </div>
  );
}

async function syncToServer() {
  await syncRuntimeSettings();
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "var(--text-muted)",
  marginBottom: 4,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

