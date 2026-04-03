"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { randomId } from "@/lib/utils";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import {
  AGENT_META,
  AGENT_SKILLS,
  PROVIDER_MODELS,
  PROVIDER_PRESETS,
  getModelsForProvider,
} from "@/store/types";
import type { AgentConfig, AgentId, AgentSkillId, ModelProvider } from "@/store/types";
import { PlatformSettings } from "./PlatformSettings";

type TestResult =
  | { ok: true; latencyMs: number; model: string; tokens: number; reply: string }
  | { ok: false; error: string };

async function testModel(apiKey: string, baseUrl: string, model: string): Promise<TestResult> {
  const url = await resolveBackendUrl("/api/test-model");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, baseUrl, model }),
  });
  return res.json() as Promise<TestResult>;
}

function toggleSkill(skills: AgentSkillId[], skillId: AgentSkillId): AgentSkillId[] {
  return skills.includes(skillId)
    ? skills.filter(id => id !== skillId)
    : [...skills, skillId];
}

export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<"agents" | "providers" | "platforms">("agents");

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", overflow: "hidden" }}>
      <div style={{ width: 156, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "8px 0" }}>
        {([
          { id: "agents", label: "Agent 设置" },
          { id: "providers", label: "模型供应商" },
          { id: "platforms", label: "消息平台" },
        ] as const).map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 14px",
              background: activeSection === section.id ? "var(--accent-dim)" : "transparent",
              border: "none",
              borderLeft: activeSection === section.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeSection === section.id ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: activeSection === section.id ? 600 : 500,
            }}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {activeSection === "agents" && <AgentsSection />}
        {activeSection === "providers" && <ProvidersSection />}
        {activeSection === "platforms" && <PlatformSettings />}
      </div>
    </div>
  );
}

function AgentsSection() {
  const { agentConfigs, providers, updateAgentConfig, userNickname, setUserNickname } = useStore();
  const [editing, setEditing] = useState<AgentId | null>(null);
  const [nickDraft, setNickDraft] = useState(userNickname);

  const handleNicknameSave = async () => {
    setUserNickname(nickDraft);
    await syncToServer();
  };

  const handleSkillChange = async (agentId: AgentId, skills: AgentSkillId[]) => {
    updateAgentConfig(agentId, { skills });
    await syncToServer();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "visible" }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>用户称呼</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              padding: "6px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <button
            onClick={handleNicknameSave}
            style={{
              padding: "6px 14px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            保存
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          Agent 在对话中会用这个称呼称呼你
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 14,
          background: "linear-gradient(135deg, rgba(var(--accent-rgb), 0.12), rgba(255,255,255,0.02))",
          borderColor: "rgba(var(--accent-rgb), 0.22)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Agent 技能面板</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
          每个 agent 都可以单独配置技能。打开技能菜单后，技能栏会固定显示在右侧空余区域，并保持顶部对齐。
        </div>
      </div>

      {(Object.keys(AGENT_META) as AgentId[]).map(id => (
        <AgentConfigCard
          key={id}
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
          onSkillChange={skills => handleSkillChange(id, skills)}
        />
      ))}
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
  onSkillChange,
}: {
  agentId: AgentId;
  config: AgentConfig;
  providers: ModelProvider[];
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<AgentConfig>) => Promise<void>;
  onSkillChange: (skills: AgentSkillId[]) => Promise<void>;
}) {
  const meta = AGENT_META[agentId];
  const [draft, setDraft] = useState<AgentConfig>(config);
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rightOpen = useStore(state => state.rightOpen);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!isEditing) {
      setSkillsMenuOpen(false);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!skillsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSkillsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [skillsMenuOpen]);

  const selectedProvider = providers.find(p => p.id === draft.providerId);
  const modelOptions = selectedProvider ? getModelsForProvider(selectedProvider.id) : [];
  const testApiKey = selectedProvider?.apiKey ?? "";
  const testBaseUrl = selectedProvider?.baseUrl ?? "";
  const testModelName = draft.model || (selectedProvider ? (getModelsForProvider(selectedProvider.id)[0] ?? "") : "");
  const selectedSkillItems = useMemo(
    () => AGENT_SKILLS.filter(skill => config.skills.includes(skill.id)),
    [config.skills]
  );

  const handleToggleSkill = async (skillId: AgentSkillId) => {
    const nextSkills = toggleSkill(draft.skills, skillId);
    setDraft(prev => ({ ...prev, skills: nextSkills }));
    await onSkillChange(nextSkills);
  };

  return (
    <div className="card" style={{ padding: 14, overflow: "visible", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: isEditing ? 14 : 0 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background: "rgba(var(--accent-rgb), 0.08)",
            border: "1px solid rgba(var(--accent-rgb), 0.2)",
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {config.emoji || meta.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{config.name || meta.name}</div>
            <span className={`badge ${meta.badge}`}>{agentId}</span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(var(--accent-rgb), 0.12)",
                color: "var(--accent)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              已启用 {config.skills.length} 项技能
            </span>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {config.model || "默认模型"} · {providers.find(p => p.id === config.providerId)?.name || "默认供应商"}
          </div>

          {selectedSkillItems.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {selectedSkillItems.map(skill => (
                <span
                  key={skill.id}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    fontSize: 11,
                    color: "var(--text)",
                  }}
                >
                  {skill.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {config.providerId && config.model && (
            <TestButton apiKey={selectedProvider?.apiKey ?? ""} baseUrl={selectedProvider?.baseUrl ?? ""} testModel={config.model} />
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={onEdit}>
            {isEditing ? "关闭编辑" : "编辑设置"}
          </button>
        </div>
      </div>

      {isEditing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "visible" }}>
          <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Emoji</label>
              <input
                className="input"
                style={{ fontSize: 22, textAlign: "center", padding: "8px 4px" }}
                value={draft.emoji}
                onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))}
                maxLength={2}
              />
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
                placeholder="例如 gpt-4o / deepseek-chat"
                value={draft.model}
                onChange={e => setDraft(prev => ({ ...prev, model: e.target.value }))}
              />
            )}
          </div>

          {draft.providerId && (
            <div>
              <label style={labelStyle}>测试当前配置</label>
              <TestButton apiKey={testApiKey} baseUrl={testBaseUrl} testModel={testModelName} />
            </div>
          )}

          <div ref={menuRef} style={{ position: "relative", overflow: "visible" }}>
            <label style={labelStyle}>技能开关</label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSkillsMenuOpen(open => !open)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                color: skillsMenuOpen ? "var(--accent)" : "var(--text)",
                borderColor: skillsMenuOpen ? "rgba(var(--accent-rgb), 0.4)" : "var(--border)",
                background: skillsMenuOpen ? "rgba(var(--accent-rgb), 0.08)" : "transparent",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>打开技能菜单</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  已选择 {draft.skills.length} 项，点击后在右侧空余区域展开
                </span>
              </span>
              <span style={{ fontSize: 16 }}>{skillsMenuOpen ? "×" : "＋"}</span>
            </button>

            {skillsMenuOpen && (
              <div
                className="animate-fade-in"
                style={{
                  position: "fixed",
                  top: 74,
                  right: rightOpen ? "calc(var(--right-w) + 22px)" : 22,
                  width: 332,
                  maxWidth: "min(332px, calc(100vw - 48px))",
                  maxHeight: "calc(100vh - 96px)",
                  overflowY: "auto",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid rgba(var(--accent-rgb), 0.2)",
                  background: "linear-gradient(180deg, rgba(22, 25, 32, 0.98), rgba(15, 18, 24, 0.98))",
                  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.45)",
                  zIndex: 60,
                }}
              >
                <div
                  style={{
                    padding: "14px 14px 12px",
                    borderBottom: "1px solid var(--border)",
                    background: "linear-gradient(180deg, rgba(var(--accent-rgb), 0.08), rgba(255,255,255,0.01))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>技能二级菜单</div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(var(--accent-rgb), 0.12)",
                        color: "var(--accent)",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {draft.skills.length} 项
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    顶部对齐显示，分组和勾选项统一使用同一套卡片排版。
                  </div>
                </div>

                <div style={{ padding: 14 }}>
                  {renderSkillGroups(draft.skills, handleToggleSkill)}
                </div>
              </div>
            )}
          </div>

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

function renderSkillGroups(selectedSkills: AgentSkillId[], onToggle: (skillId: AgentSkillId) => void) {
  const groupMap = AGENT_SKILLS.reduce<Record<string, (typeof AGENT_SKILLS)[number][]>>((acc, skill) => {
    if (!acc[skill.category]) acc[skill.category] = [];
    acc[skill.category].push(skill);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Object.entries(groupMap).map(([category, skills]) => (
        <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {category}
          </div>

          {skills.map(skill => {
            const checked = selectedSkills.includes(skill.id);
            return (
              <label
                key={skill.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${checked ? "rgba(var(--accent-rgb), 0.35)" : "var(--border)"}`,
                  background: checked ? "rgba(var(--accent-rgb), 0.08)" : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(skill.id)}
                  style={{ marginTop: 2, accentColor: "var(--accent)" }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{skill.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>{skill.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      ))}
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

function AddProviderForm({ onAdd, onCancel }: { onAdd: (provider: ModelProvider) => Promise<void>; onCancel: () => void }) {
  const [preset, setPreset] = useState(PROVIDER_PRESETS[0]!);
  const [apiKey, setApiKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const isCustom = preset.id === "custom";
  const defaultModel = PROVIDER_MODELS[preset.id]?.[0] ?? "";

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

  const isCustomId = provider.id === "custom" || provider.id.startsWith("custom-");
  const defaultModel = isCustomId ? "" : (getModelsForProvider(provider.id)[0] ?? "");

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
              <TestButton apiKey={draft.apiKey} baseUrl={draft.baseUrl} testModel={isCustomId ? "" : defaultModel} />
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

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  color: "var(--text-muted)",
  marginBottom: 4,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
