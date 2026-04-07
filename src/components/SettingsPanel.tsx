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
  AgentId,
  DesktopProgramEntry,
  ModelPresetTier,
  ModelProvider,
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
              className="btn-ghost"
              onClick={() => setActiveSection(section.id)}
              style={activeSection === section.id ? { borderColor: "rgba(var(--accent-rgb), 0.24)", background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" } : undefined}
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
            onClick={handleNicknameSave}
            style={{
              padding: "5px 12px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 11,
              cursor: "pointer",
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
              className="btn-primary"
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
                style={{
                  borderRadius: 14,
                  border: `1px solid ${active ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)"}`,
                  background: active ? "rgba(var(--accent-rgb), 0.08)" : "rgba(255,255,255,0.03)",
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
                  className={active ? "btn-primary" : "btn-ghost"}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {(Object.keys(AGENT_META) as AgentId[]).map(id => (
          <div key={id} style={editing === id ? { gridColumn: "1 / -1" } : undefined}>
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
  const meta = AGENT_META[agentId];
  const [draft, setDraft] = useState<AgentConfig>(config);
  const configuredProviders = useMemo(() => getConfiguredProviders(providers), [providers]);
  const defaultConfiguredProviderId = configuredProviders[0]?.id || "";

  useEffect(() => {
    setDraft(config);
  }, [config]);

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
    <div className="card" style={{ padding: 10, overflow: "visible", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: isEditing ? 10 : 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "rgba(var(--accent-rgb), 0.08)",
            border: "1px solid rgba(var(--accent-rgb), 0.2)",
            flexShrink: 0,
          }}
        >
          <AgentIcon agentId={agentId} size={20} color={getAgentIconColor(agentId)} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{config.name || meta.name}</div>
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
              技能自动分配
            </span>
          </div>

          <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
            {config.model || "默认模型"} · {providers.find(p => p.id === config.providerId)?.name || "默认供应商"}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
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
          </div>

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 }}>
            {routingProfile.summary}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
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
                className="input"
                style={{ display: "grid", placeItems: "center", minHeight: 42, padding: "8px 4px", color: "var(--text)" }}
              >
                <AgentIcon agentId={agentId} size={22} color={getAgentIconColor(agentId)} />
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(var(--accent-rgb), 0.22)",
                  background: "rgba(var(--accent-rgb), 0.06)",
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
                  className="btn-ghost"
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
                      className="btn-ghost"
                      disabled={!model}
                      onClick={() => void handleApplyModelPreset(item.tier)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                        padding: "10px 12px",
                        minHeight: 86,
                        borderColor: active ? "rgba(var(--accent-rgb), 0.42)" : "var(--border)",
                        background: active ? "rgba(var(--accent-rgb), 0.1)" : "rgba(255,255,255,0.02)",
                        color: active ? "var(--accent)" : "var(--text)",
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
    <div className="card" style={{ padding: 14, borderColor: "rgba(var(--accent-rgb), 0.3)", background: "var(--accent-dim)" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--accent)" }}>新增供应商</div>

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

