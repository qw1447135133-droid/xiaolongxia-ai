"use client";
import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { AGENT_META, PROVIDER_PRESETS, PROVIDER_MODELS, getModelsForProvider } from "@/store/types";
import type { AgentId, ModelProvider } from "@/store/types";
import { randomId } from "@/lib/utils";
import { PlatformSettings } from "./PlatformSettings";
import { sendWs } from "@/hooks/useWebSocket";

// ── 测试结果类型 ──
type TestResult = { ok: true; latencyMs: number; model: string; tokens: number; reply: string }
                | { ok: false; error: string };

async function resolveBackendUrl(path: string): Promise<string> {
  if (typeof window === "undefined") return path;
  const isDesktopRuntime = window.location.protocol === "file:" || Boolean((window as unknown as { electronAPI?: unknown }).electronAPI);
  if (!isDesktopRuntime) return path;
  const electronAPI = (window as unknown as { electronAPI?: { getWsPort?: () => Promise<number> } }).electronAPI;
  const port = electronAPI?.getWsPort ? await electronAPI.getWsPort() : 3001;
  return `http://localhost:${port}${path}`;
}

async function testModel(apiKey: string, baseUrl: string, model: string): Promise<TestResult> {
  const url = await resolveBackendUrl("/api/test-model");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, baseUrl, model }),
  });
  return res.json() as Promise<TestResult>;
}

// ── 测试按钮组件 ──
// testModel 为空时显示输入框让用户填
function TestButton({ apiKey, baseUrl, testModel: initModel }: {
  apiKey: string;
  baseUrl: string;
  testModel: string;  // 空字符串 = 需要用户手动输入
}) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [result, setResult] = useState<TestResult | null>(null);
  const [customModel, setCustomModel] = useState(initModel);

  const model = initModel || customModel;

  const run = async () => {
    if (!apiKey.trim() || !model.trim()) return;
    setState("testing");
    setResult(null);
    const r = await testModel(apiKey, baseUrl, model);
    setResult(r);
    setState(r.ok ? "ok" : "fail");
    setTimeout(() => setState("idle"), 10000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* 没有预设模型时显示输入框 */}
        {!initModel && (
          <input
            className="input"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="输入测试用模型名，如 qwen-max"
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
          />
        )}
        <button
          onClick={run}
          disabled={state === "testing" || !apiKey.trim() || !model.trim()}
          style={{
            padding: "4px 12px",
            fontSize: 11,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${state === "ok" ? "var(--success)" : state === "fail" ? "var(--danger)" : "var(--border)"}`,
            background: state === "ok" ? "rgba(var(--success-rgb),0.1)" : state === "fail" ? "rgba(var(--danger-rgb),0.1)" : "transparent",
            color: state === "ok" ? "var(--success)" : state === "fail" ? "var(--danger)" : "var(--text-muted)",
            cursor: state === "testing" ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 5,
            whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {state === "testing" && <span className="spinner" style={{ width: 10, height: 10 }} />}
          {state === "idle" && "🔌 测试连通"}
          {state === "testing" && "测试中..."}
          {state === "ok" && "✅ 连通"}
          {state === "fail" && "❌ 失败"}
        </button>
      </div>
      {result && (
        <div style={{
          fontSize: 11, padding: "4px 8px", borderRadius: "var(--radius-sm)",
          background: result.ok ? "rgba(var(--success-rgb),0.06)" : "rgba(var(--danger-rgb),0.06)",
          color: result.ok ? "var(--success)" : "var(--danger)",
          border: `1px solid ${result.ok ? "rgba(var(--success-rgb),0.2)" : "rgba(var(--danger-rgb),0.2)"}`,
        }}>
          {result.ok
            ? `✓ 延迟 ${result.latencyMs}ms · ${result.tokens} tokens · 模型: ${result.model}`
            : `✗ ${result.error}`}
        </div>
      )}
    </div>
  );
}

// ── 主面板 ──
export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<"agents" | "providers" | "platforms">("agents");

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", overflow: "hidden" }}>
      <div style={{ width: 140, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "8px 0" }}>
        {(["agents", "providers", "platforms"] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "8px 14px",
            background: activeSection === s ? "var(--accent-dim)" : "none",
            border: "none",
            borderLeft: activeSection === s ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeSection === s ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer", fontSize: 12,
            fontWeight: activeSection === s ? 600 : 400,
          }}>
            {s === "agents" ? "🦞 Agent 配置" : s === "providers" ? "🔑 模型供应商" : "📱 消息平台"}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {activeSection === "agents" ? <AgentsSection /> : activeSection === "providers" ? <ProvidersSection /> : <PlatformSettings />}
      </div>
    </div>
  );
}

// ── Agent 配置区 ──
function AgentsSection() {
  const { agentConfigs, providers, updateAgentConfig } = useStore();
  const [editing, setEditing] = useState<AgentId | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        为每只龙虾单独配置模型、性格和名字。留空则使用全局默认。
      </div>
      {(Object.keys(AGENT_META) as AgentId[]).map(id => (
        <AgentConfigCard
          key={id}
          agentId={id}
          config={agentConfigs[id]}
          providers={providers}
          isEditing={editing === id}
          onEdit={() => setEditing(editing === id ? null : id)}
          onSave={(updates) => { updateAgentConfig(id, updates); setEditing(null); syncToServer(); }}
        />
      ))}
    </div>
  );
}

function AgentConfigCard({ agentId, config, providers, isEditing, onEdit, onSave }: {
  agentId: AgentId;
  config: ReturnType<typeof useStore.getState>["agentConfigs"][AgentId];
  providers: ModelProvider[];
  isEditing: boolean;
  onEdit: () => void;
  onSave: (u: Partial<typeof config>) => void;
}) {
  const meta = AGENT_META[agentId];
  const [draft, setDraft] = useState({ ...config });
  useEffect(() => { setDraft({ ...config }); }, [config]);

  const selectedProvider = providers.find(p => p.id === draft.providerId);
  const modelOptions = selectedProvider ? getModelsForProvider(selectedProvider.id) : [];

  // 用于测试：拿到当前 draft 的 apiKey/baseUrl/model
  const testApiKey = selectedProvider?.apiKey ?? "";
  const testBaseUrl = selectedProvider?.baseUrl ?? "";
  const testModel = draft.model || (selectedProvider ? (getModelsForProvider(selectedProvider.id)?.[0] ?? "") : "");

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: isEditing ? 12 : 0 }}>
        <span style={{ fontSize: 20 }}>{config.emoji || meta.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{config.name || meta.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {config.model || "默认模型"} · {providers.find(p => p.id === config.providerId)?.name || "默认供应商"}
          </div>
        </div>
        {/* 快速测试按钮（非编辑状态也显示） */}
        {config.providerId && config.model && (
          <TestButton
            apiKey={selectedProvider?.apiKey ?? ""}
            baseUrl={selectedProvider?.baseUrl ?? ""}
            testModel={config.model}
          />
        )}
        <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onEdit}>
          {isEditing ? "取消" : "编辑"}
        </button>
      </div>

      {isEditing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle}>Emoji</label>
              <input className="input" style={{ fontSize: 20, textAlign: "center", padding: "6px 4px" }}
                value={draft.emoji} onChange={e => setDraft(d => ({ ...d, emoji: e.target.value }))} maxLength={2} />
            </div>
            <div>
              <label style={labelStyle}>名字</label>
              <input className="input" placeholder={meta.name} value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>模型供应商</label>
            <select className="input" value={draft.providerId}
              onChange={e => setDraft(d => ({ ...d, providerId: e.target.value, model: "" }))}>
              <option value="">— 使用全局默认 —</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>模型</label>
            {modelOptions.length > 0 ? (
              <select className="input" value={draft.model}
                onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}>
                <option value="">— 供应商默认 —</option>
                {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="input" placeholder="如 gpt-4o / deepseek-chat" value={draft.model}
                onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} />
            )}
          </div>

          {/* 编辑状态下的测试按钮 */}
          {draft.providerId && (
            <div>
              <label style={labelStyle}>测试当前配置</label>
              <TestButton
                apiKey={testApiKey}
                baseUrl={testBaseUrl}
                testModel={testModel}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>性格补充（追加到默认 system prompt）</label>
            <textarea className="input" style={{ resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
              placeholder={`默认：${meta.defaultPersonality.slice(0, 40)}...`}
              value={draft.personality} onChange={e => setDraft(d => ({ ...d, personality: e.target.value }))} />
          </div>

          <button className="btn-primary" style={{ alignSelf: "flex-end", padding: "6px 20px" }}
            onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      )}
    </div>
  );
}

// ── 供应商配置区 ──
function ProvidersSection() {
  const { providers, addProvider, updateProvider, removeProvider } = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          配置 API Key 和 Base URL，每个 Agent 可独立选择供应商。
        </div>
        <button className="btn-primary" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => setAdding(true)}>
          + 添加供应商
        </button>
      </div>

      {adding && (
        <AddProviderForm
          onAdd={(p) => { addProvider(p); setAdding(false); syncToServer(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {providers.length === 0 && !adding && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
          暂无供应商，点击「添加供应商」开始配置
        </div>
      )}

      {providers.map(p => (
        <ProviderCard key={p.id} provider={p}
          onUpdate={(u) => { updateProvider(p.id, u); syncToServer(); }}
          onRemove={() => { removeProvider(p.id); syncToServer(); }}
        />
      ))}
    </div>
  );
}

function AddProviderForm({ onAdd, onCancel }: { onAdd: (p: ModelProvider) => void; onCancel: () => void }) {
  const [preset, setPreset] = useState(PROVIDER_PRESETS[0]!);
  const [apiKey, setApiKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const isCustom = preset.id === "custom";
  // 预设模型列表第一个，自定义供应商为空（让用户手动输入）
  const defaultModel = PROVIDER_MODELS[preset.id]?.[0] ?? "";
  return (
    <div className="card" style={{ padding: 12, borderColor: "var(--accent)", background: "var(--accent-dim)" }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: "var(--accent)" }}>添加供应商</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>供应商预设</label>
          <select className="input" value={preset.id}
            onChange={e => setPreset(PROVIDER_PRESETS.find(p => p.id === e.target.value) ?? PROVIDER_PRESETS[0]!)}>
            {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

        {/* 添加前先测试 */}
        {apiKey.trim() && (
          <div>
            <label style={labelStyle}>添加前测试（{defaultModel ? `使用 ${defaultModel}` : "请输入模型名"}）</label>
            <TestButton
              apiKey={apiKey}
              baseUrl={isCustom ? customUrl : preset.baseUrl}
              testModel={defaultModel}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={onCancel}>取消</button>
          <button className="btn-primary" style={{ fontSize: 11 }} disabled={!apiKey.trim()}
            onClick={() => onAdd({
              id: `${preset.id}-${randomId()}`,
              name: isCustom ? (customName || "自定义") : preset.name,
              apiKey,
              baseUrl: isCustom ? customUrl : preset.baseUrl,
            })}>
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onUpdate, onRemove }: {
  provider: ModelProvider;
  onUpdate: (u: Partial<ModelProvider>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...provider });
  const [showKey, setShowKey] = useState(false);
  // 预设模型第一个；自定义供应商（id 以 custom- 开头或 id=custom）为空，让用户手动输入
  const isCustomId = provider.id === "custom" || provider.id.startsWith("custom-");
  const defaultModel = isCustomId ? "" : (getModelsForProvider(provider.id)?.[0] ?? "");

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{provider.baseUrl || "默认 URL"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* 快速测试按钮（非编辑状态） */}
          {!editing && (
            <TestButton apiKey={provider.apiKey} baseUrl={provider.baseUrl} testModel={defaultModel} />
          )}
          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setEditing(!editing)}>
            {editing ? "取消" : "编辑"}
          </button>
          <button style={{
            background: "rgba(var(--danger-rgb),0.1)", color: "var(--danger)",
            border: "1px solid rgba(var(--danger-rgb),0.3)", borderRadius: "var(--radius-sm)",
            padding: "4px 10px", cursor: "pointer", fontSize: 11,
          }} onClick={onRemove}>删除</button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={labelStyle}>名称</label>
            <input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Base URL</label>
            <input className="input" value={draft.baseUrl} onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>API Key</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" type={showKey ? "text" : "password"} value={draft.apiKey}
                onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value }))} style={{ flex: 1 }} />
              <button className="btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => setShowKey(!showKey)}>
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {draft.apiKey.trim() && (
            <div>
              <label style={labelStyle}>
                测试连通{isCustomId ? "（请输入模型名）" : `（使用 ${getModelsForProvider(provider.id)?.[0] ?? ""}）`}
              </label>
              <TestButton
                apiKey={draft.apiKey}
                baseUrl={draft.baseUrl}
                testModel={isCustomId ? "" : (getModelsForProvider(provider.id)?.[0] ?? "")}
              />
            </div>
          )}

          <button className="btn-primary" style={{ alignSelf: "flex-end", fontSize: 11, padding: "6px 20px" }}
            onClick={() => { onUpdate(draft); setEditing(false); }}>
            保存
          </button>
        </div>
      )}
    </div>
  );
}

async function syncToServer() {
  const { providers, agentConfigs } = useStore.getState();
  try {
    if (sendWs({ type: "settings_sync", providers, agentConfigs })) {
      return;
    }

    const url = await resolveBackendUrl("/api/settings");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers, agentConfigs }),
    });
  } catch (e) {
    console.error("Failed to sync settings:", e);
  }
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text-muted)",
  marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
};
