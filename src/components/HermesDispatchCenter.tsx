"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { useStore } from "@/store";
import type { HermesDispatchSettings, HermesPlannerProfile } from "@/store/types";

type HermesAvailability = Record<string, { command: string; available: boolean }>;

type HermesDispatchTask = {
  id: string;
  title: string;
  executor: "codex" | "claude" | "gemini";
  objective: string;
  workdir: string;
  dependsOn: string[];
};

type HermesDispatchPlan = {
  summary: string;
  tasks: HermesDispatchTask[];
};

type HermesDispatchRun = {
  id: string;
  instruction: string;
  mode: "execute" | "plan-only";
  plannerProfileId?: string | null;
  planner: "codex-brain" | "sample-plan" | string;
  plannerModel?: string | null;
  plannerSessionId?: string | null;
  plannerSessionStateFile?: string | null;
  executorModels?: {
    codex?: string | null;
    claude?: string | null;
    gemini?: string | null;
  } | null;
  status: "queued" | "running" | "completed" | "failed" | "planned";
  createdAt: number;
  updatedAt: number;
  outputDir?: string;
  exitCode?: number | null;
  plan?: HermesDispatchPlan | null;
  summary?: {
    completed?: number;
    failed?: number;
    runDir?: string;
  } | null;
  results?: Array<Record<string, unknown>>;
  stdoutTail?: string;
  stderrTail?: string;
  error?: string | null;
};

type HermesDispatchStatusResponse = {
  ok: boolean;
  availability: HermesAvailability;
  runs: HermesDispatchRun[];
  hermesDispatchSettings: HermesDispatchSettings;
  prototypePath: string;
};

type HermesDispatchLaunchResponse = {
  ok: boolean;
  run: HermesDispatchRun;
};

type HermesDispatchResetSessionResponse = {
  ok: boolean;
  profileId: string;
  label: string;
  sessionStateFile: string;
  deleted: boolean;
};

type HermesPlannerProfileDraft = {
  id: string;
  label: string;
  sessionStateFile: string;
  description: string;
  models: {
    planner: string;
    codex: string;
    claude: string;
    gemini: string;
  };
};

const MODEL_SUGGESTIONS = {
  planner: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2-codex"],
  codex: ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2-codex"],
  claude: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "sonnet", "opus"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
} as const;

const RUN_STATUS_TONE: Record<HermesDispatchRun["status"], { label: string; color: string }> = {
  queued: { label: "Queued", color: "#94a3b8" },
  running: { label: "Running", color: "#fbbf24" },
  completed: { label: "Completed", color: "#86efac" },
  failed: { label: "Failed", color: "#fda4af" },
  planned: { label: "Planned", color: "#7dd3fc" },
};

function formatTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function badgeStyle(color: string): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}18`,
    color,
    fontSize: 10,
    fontWeight: 700,
  };
}

export function HermesDispatchCenter() {
  const hermesDispatchSettings = useStore(state => state.hermesDispatchSettings);
  const replaceHermesDispatchSettings = useStore(state => state.replaceHermesDispatchSettings);
  const profileImportRef = useRef<HTMLInputElement | null>(null);
  const [instruction, setInstruction] = useState("");
  const [availability, setAvailability] = useState<HermesAvailability>({});
  const [runs, setRuns] = useState<HermesDispatchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [prototypePath, setPrototypePath] = useState("");
  const [profileDraft, setProfileDraft] = useState<HermesPlannerProfileDraft | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<"execute" | "plan-only" | "sample" | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const loadStatus = async () => {
    const url = await resolveBackendUrl("/api/hermes-dispatch/status");
    const response = await fetch(url, { method: "GET" });
    const payload = await response.json() as HermesDispatchStatusResponse;
    if (!payload.ok) {
      throw new Error("无法读取 Hermes dispatch 状态。");
    }

    setAvailability(payload.availability);
    setRuns(payload.runs);
    if (!settingsHydrated) {
      replaceHermesDispatchSettings(payload.hermesDispatchSettings);
      setSettingsHydrated(true);
    }
    setPrototypePath(payload.prototypePath);
    setSelectedRunId(current => current ?? payload.runs[0]?.id ?? null);
  };

  useEffect(() => {
    void loadStatus().catch(error => {
      setRequestError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  useEffect(() => {
    const hasActiveRun = runs.some(run => run.status === "queued" || run.status === "running");
    const interval = window.setInterval(() => {
      void loadStatus().catch(() => {});
    }, hasActiveRun ? 2500 : 10000);

    return () => window.clearInterval(interval);
  }, [runs]);

  const selectedRun = useMemo(
    () => runs.find(run => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );

  const commandList = useMemo(
    () => Object.entries(availability),
    [availability],
  );
  const selectedProfile = useMemo(
    () => hermesDispatchSettings.plannerProfiles.find(
      profile => profile.id === hermesDispatchSettings.activePlannerProfileId,
    ) ?? hermesDispatchSettings.plannerProfiles[0] ?? null,
    [hermesDispatchSettings],
  );

  useEffect(() => {
    setProfileDraft(selectedProfile ? createProfileDraft(selectedProfile) : null);
  }, [selectedProfile]);

  const isProfileDirty = useMemo(() => {
    if (!selectedProfile || !profileDraft) return false;
    return JSON.stringify(normalizeProfileDraft(profileDraft)) !== JSON.stringify(selectedProfile);
  }, [profileDraft, selectedProfile]);

  const missingCommands = commandList.filter(([, item]) => !item.available).map(([name]) => name);
  const plannerReady = availability.planner?.available ?? false;

  const persistHermesDispatchSettings = async (nextSettings: HermesDispatchSettings) => {
    replaceHermesDispatchSettings(nextSettings);
    const store = useStore.getState();
    const syncPayload = {
      type: "settings_sync",
      providers: store.providers,
      agentConfigs: store.agentConfigs,
      platformConfigs: store.platformConfigs,
      userNickname: store.userNickname,
      desktopProgramSettings: store.desktopProgramSettings,
      hermesDispatchSettings: nextSettings,
    };

    if (!sendWs(syncPayload)) {
      const url = await resolveBackendUrl("/api/settings");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: store.providers,
          agentConfigs: store.agentConfigs,
          platformConfigs: store.platformConfigs,
          userNickname: store.userNickname,
          desktopProgramSettings: store.desktopProgramSettings,
          hermesDispatchSettings: nextSettings,
        }),
      });
      if (!response.ok) {
        throw new Error("保存 Hermes dispatch 设置失败。");
      }
    }
    void syncRuntimeSettings();
  };

  const exportProfiles = () => {
    const blob = new Blob([JSON.stringify(hermesDispatchSettings, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `hermes-dispatch-profiles-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setRequestError(null);
    setRequestNotice("已导出当前 Hermes profiles JSON。");
  };

  const importProfiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as HermesDispatchSettings | { hermesDispatchSettings?: HermesDispatchSettings };
      const importedSettings = "hermesDispatchSettings" in parsed && parsed.hermesDispatchSettings
        ? parsed.hermesDispatchSettings
        : parsed;
      await persistHermesDispatchSettings(importedSettings as HermesDispatchSettings);
      setRequestError(null);
      setRequestNotice(`已导入 profiles：${file.name}`);
      await loadStatus();
    } catch (error) {
      setRequestNotice(null);
      setRequestError(error instanceof Error ? `导入失败：${error.message}` : `导入失败：${String(error)}`);
    }
  };

  const resetSelectedProfileSession = async () => {
    if (!selectedProfile) return;
    const confirmed = window.confirm(`确定清空 brain "${selectedProfile.label}" 的 planner session 记忆吗？下一次 dispatch 会从新会话开始。`);
    if (!confirmed) return;

    const url = await resolveBackendUrl("/api/hermes-dispatch/reset-session");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: selectedProfile.id }),
    });
    const payload = await response.json() as HermesDispatchResetSessionResponse & { error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "清空 planner session 失败。");
    }

    setRequestError(null);
    setRequestNotice(payload.deleted
      ? `已清空 ${selectedProfile.label} 的 session 记忆。`
      : `${selectedProfile.label} 当前没有可清空的 session 文件。`);
    await loadStatus();
  };

  const submitRun = async (mode: "execute" | "plan-only" | "sample") => {
    const trimmed = instruction.trim();
    if (!trimmed && mode !== "sample") {
      setRequestError("先输入一条任务指令。");
      return;
    }

    setSubmittingMode(mode);
    setRequestError(null);
    setRequestNotice(null);

    try {
      const url = await resolveBackendUrl("/api/hermes-dispatch/run");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: trimmed,
          planOnly: mode === "plan-only",
          useSamplePlan: mode === "sample",
          plannerProfileId: mode === "sample" ? undefined : selectedProfile?.id,
        }),
      });
      const payload = await response.json() as HermesDispatchLaunchResponse & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "启动 Hermes dispatch 失败。");
      }
      setSelectedRunId(payload.run.id);
      await loadStatus();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingMode(null);
    }
  };

  const saveProfileDraft = async () => {
    if (!profileDraft || !selectedProfile) return;

    const nextId = slugifyProfileId(profileDraft.id);
    if (!nextId) {
      setRequestError("Profile ID 不能为空。");
      setRequestNotice(null);
      return;
    }
    if (!profileDraft.sessionStateFile.trim()) {
      setRequestError("Session State File 不能为空。");
      setRequestNotice(null);
      return;
    }
    if (nextId !== selectedProfile.id && hermesDispatchSettings.plannerProfiles.some(profile => profile.id === nextId)) {
      setRequestError(`Profile ID "${nextId}" 已存在。`);
      setRequestNotice(null);
      return;
    }

    const nextProfile = normalizeProfileDraft(profileDraft);
    nextProfile.id = nextId;

    const nextProfiles = hermesDispatchSettings.plannerProfiles.map(profile =>
      profile.id === selectedProfile.id ? nextProfile : profile,
    );
    const nextSettings: HermesDispatchSettings = {
      activePlannerProfileId:
        hermesDispatchSettings.activePlannerProfileId === selectedProfile.id
          ? nextProfile.id
          : hermesDispatchSettings.activePlannerProfileId,
      plannerProfiles: nextProfiles,
    };

    setRequestError(null);
    setRequestNotice(`已保存槽位 ${nextProfile.label}。`);
    await persistHermesDispatchSettings(nextSettings);
  };

  const addProfile = async () => {
    const nextId = nextAvailableProfileId(hermesDispatchSettings.plannerProfiles);
    const nextProfile: HermesPlannerProfile = {
      id: nextId,
      label: `Brain ${nextId}`,
      sessionStateFile: `output/hermes-dispatch/planner-sessions/${nextId}.json`,
      description: "New planner slot.",
      models: {},
    };
    const nextSettings: HermesDispatchSettings = {
      activePlannerProfileId: nextProfile.id,
      plannerProfiles: [...hermesDispatchSettings.plannerProfiles, nextProfile].slice(0, 6),
    };

    setRequestError(null);
    setRequestNotice(`已新增槽位 ${nextProfile.label}。`);
    await persistHermesDispatchSettings(nextSettings);
  };

  const removeSelectedProfile = async () => {
    if (!selectedProfile) return;
    if (hermesDispatchSettings.plannerProfiles.length <= 1) {
      setRequestError("至少保留一个 planner profile。");
      setRequestNotice(null);
      return;
    }

    const nextProfiles = hermesDispatchSettings.plannerProfiles.filter(profile => profile.id !== selectedProfile.id);
    const nextSettings: HermesDispatchSettings = {
      activePlannerProfileId:
        hermesDispatchSettings.activePlannerProfileId === selectedProfile.id
          ? nextProfiles[0].id
          : hermesDispatchSettings.activePlannerProfileId,
      plannerProfiles: nextProfiles,
    };

    setRequestError(null);
    setRequestNotice(`已删除槽位 ${selectedProfile.label}。`);
    await persistHermesDispatchSettings(nextSettings);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section
        className="card"
        style={{
          padding: 18,
          borderColor: "rgba(96, 165, 250, 0.26)",
          background: "linear-gradient(135deg, rgba(96, 165, 250, 0.14), rgba(255,255,255,0.03))",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Hermes Dispatch
        </div>
        <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 700 }}>
          侧栏直达的 Hermes 控制面板
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
          这里直接拉起 {"`Hermes -> Codex / Claude / Gemini`"} 原型。你不需要手动敲脚本，面板会调用本地 dispatcher，并把计划、运行状态、stdout、stderr 和结果统一展示出来。
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>
          Prototype: {prototypePath || "loading..."}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(300px, 0.8fr)", gap: 16 }}>
        <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Launch</div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700 }}>新建一个 dispatch run</div>
            </div>
            <span style={badgeStyle(plannerReady ? "#86efac" : "#fda4af")}>
              {plannerReady ? "Planner ready" : "Planner missing"}
            </span>
          </div>

          <textarea
            className="input"
            style={{ minHeight: 140, resize: "vertical" }}
            placeholder="例如：为当前仓库做一个多代理调度 MVP，并把后端实现派给 Codex、前端界面派给 Gemini、查漏补缺 / review / 风险总结派给 Claude。"
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
          />

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Planner Brain Slot</div>
            <select
              className="input"
              value={selectedProfile?.id ?? ""}
              onChange={event => {
                const nextSettings: HermesDispatchSettings = {
                  ...hermesDispatchSettings,
                  activePlannerProfileId: event.target.value,
                };
                void persistHermesDispatchSettings(nextSettings).catch(error => {
                  setRequestError(error instanceof Error ? error.message : String(error));
                });
              }}
              disabled={submittingMode !== null}
            >
              {hermesDispatchSettings.plannerProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.label} · {profile.id}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
              {selectedProfile?.description || "当前槽位会复用自己的 Codex planner 会话，不同槽位之间互不串上下文。"}
            </div>
            {isProfileDirty ? (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "#fbbf24" }}>
                当前 profile 有未保存修改。点击“保存当前槽位”后，新模型和新 session 文件才会用于下一次 dispatch。
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void submitRun("execute")}
              disabled={submittingMode !== null || !plannerReady}
            >
              {submittingMode === "execute" ? "启动中..." : "Hermes 执行 Dispatch"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void submitRun("plan-only")}
              disabled={submittingMode !== null || !plannerReady}
            >
              {submittingMode === "plan-only" ? "生成中..." : "只生成计划"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void submitRun("sample")}
              disabled={submittingMode !== null}
            >
              {submittingMode === "sample" ? "演示中..." : "样例计划演示"}
            </button>
          </div>

          {requestError ? (
            <div style={warningCardStyle("#fda4af")}>{requestError}</div>
          ) : null}

          {requestNotice ? (
            <div style={warningCardStyle("#7dd3fc")}>{requestNotice}</div>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Environment</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {commandList.map(([name, item]) => (
                <span key={name} style={badgeStyle(item.available ? "#86efac" : "#fbbf24")}>
                  {name}: {item.available ? "ready" : "missing"}
                </span>
              ))}
            </div>
            {missingCommands.length > 0 ? (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
                当前缺失: {missingCommands.join(", ")}。缺 `planner` 或 `codex` 时，面板仍可用样例计划演示 UI 流程，但不能跑真实 Codex 规划大脑。
              </div>
            ) : null}
          </div>
        </section>

        <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Recent Runs</div>
          {runs.length === 0 ? (
            <div style={emptyPanelStyle}>还没有 Hermes dispatch run。点击左侧按钮就会在这里生成记录。</div>
          ) : (
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflowY: "auto" }}>
              {runs.map(run => {
                const tone = RUN_STATUS_TONE[run.status];
                const isActive = run.id === selectedRunId;
                return (
                  <button
                    key={run.id}
                    type="button"
                    className="card"
                    onClick={() => setSelectedRunId(run.id)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      display: "grid",
                      gap: 8,
                      borderColor: isActive ? `${tone.color}55` : "var(--border)",
                      background: isActive ? `${tone.color}12` : "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ fontSize: 13 }}>{run.instruction || "样例计划演示"}</strong>
                      <span style={badgeStyle(tone.color)}>{tone.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {formatTime(run.createdAt)} · {run.mode} · {run.planner}
                      {run.plannerProfileId ? ` · slot ${run.plannerProfileId}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {run.plan?.tasks?.length ?? 0} tasks
                      {typeof run.summary?.failed === "number"
                        ? ` · 完成 ${run.summary?.completed ?? 0} / 失败 ${run.summary.failed}`
                        : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Profile Manager</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>可编辑的 Hermes brain profiles</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={profileImportRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={event => {
                void importProfiles(event);
              }}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={exportProfiles}
            >
              导出 JSON
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => profileImportRef.current?.click()}
            >
              导入 JSON
            </button>
            <button type="button" className="btn-ghost" onClick={() => void addProfile().catch(error => {
              setRequestNotice(null);
              setRequestError(error instanceof Error ? error.message : String(error));
            })}>
              新增槽位
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void removeSelectedProfile().catch(error => {
                setRequestNotice(null);
                setRequestError(error instanceof Error ? error.message : String(error));
              })}
              disabled={hermesDispatchSettings.plannerProfiles.length <= 1 || !selectedProfile}
            >
              删除当前槽位
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void resetSelectedProfileSession().catch(error => {
                setRequestNotice(null);
                setRequestError(error instanceof Error ? error.message : String(error));
              })}
              disabled={!selectedProfile}
            >
              清空当前记忆
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void saveProfileDraft().catch(error => {
                setRequestNotice(null);
                setRequestError(error instanceof Error ? error.message : String(error));
              })}
              disabled={!profileDraft}
            >
              保存当前槽位
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.7fr) minmax(320px, 1.3fr)", gap: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {hermesDispatchSettings.plannerProfiles.map(profile => {
              const isActive = profile.id === selectedProfile?.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  className="card"
                  onClick={() => {
                    const nextSettings: HermesDispatchSettings = {
                      ...hermesDispatchSettings,
                      activePlannerProfileId: profile.id,
                    };
                    void persistHermesDispatchSettings(nextSettings).catch(error => {
                      setRequestError(error instanceof Error ? error.message : String(error));
                    });
                  }}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    display: "grid",
                    gap: 6,
                    borderColor: isActive ? "rgba(96, 165, 250, 0.55)" : "var(--border)",
                    background: isActive ? "rgba(96, 165, 250, 0.12)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{profile.label}</strong>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{profile.id}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    {profile.description || "No description"}
                  </div>
                </button>
              );
            })}
          </div>

          {!profileDraft ? (
            <div style={emptyPanelStyle}>没有可编辑的 profile。</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <LabeledInput
                  label="Profile ID"
                  value={profileDraft.id}
                  onChange={value => setProfileDraft(current => current ? { ...current, id: value } : current)}
                  placeholder="default"
                />
                <LabeledInput
                  label="Label"
                  value={profileDraft.label}
                  onChange={value => setProfileDraft(current => current ? { ...current, label: value } : current)}
                  placeholder="Default Brain"
                />
              </div>

              <LabeledInput
                label="Session State File"
                value={profileDraft.sessionStateFile}
                onChange={value => setProfileDraft(current => current ? { ...current, sessionStateFile: value } : current)}
                placeholder="output/hermes-dispatch/planner-sessions/default.json"
              />

              <LabeledTextarea
                label="Description"
                value={profileDraft.description}
                onChange={value => setProfileDraft(current => current ? { ...current, description: value } : current)}
                placeholder="这个槽位的用途说明。"
              />

              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Models</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <LabeledInput
                  label="Planner / Codex"
                  value={profileDraft.models.planner}
                  onChange={value => setProfileDraft(current => current ? { ...current, models: { ...current.models, planner: value } } : current)}
                  placeholder="留空则使用 codex CLI 默认"
                  suggestions={MODEL_SUGGESTIONS.planner}
                  listId="hermes-model-planner"
                />
                <LabeledInput
                  label="Executor / Codex"
                  value={profileDraft.models.codex}
                  onChange={value => setProfileDraft(current => current ? { ...current, models: { ...current.models, codex: value } } : current)}
                  placeholder="留空则使用 codex CLI 默认"
                  suggestions={MODEL_SUGGESTIONS.codex}
                  listId="hermes-model-codex"
                />
                <LabeledInput
                  label="Executor / Claude"
                  value={profileDraft.models.claude}
                  onChange={value => setProfileDraft(current => current ? { ...current, models: { ...current.models, claude: value } } : current)}
                  placeholder="例如 claude-sonnet-4-6"
                  suggestions={MODEL_SUGGESTIONS.claude}
                  listId="hermes-model-claude"
                />
                <LabeledInput
                  label="Executor / Gemini"
                  value={profileDraft.models.gemini}
                  onChange={value => setProfileDraft(current => current ? { ...current, models: { ...current.models, gemini: value } } : current)}
                  placeholder="例如 gemini-2.5-pro"
                  suggestions={MODEL_SUGGESTIONS.gemini}
                  listId="hermes-model-gemini"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Run Detail</div>
            <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>
              {selectedRun?.instruction || "还没有选中的 run"}
            </div>
          </div>
          {selectedRun ? (
            <span style={badgeStyle(RUN_STATUS_TONE[selectedRun.status].color)}>
              {RUN_STATUS_TONE[selectedRun.status].label}
            </span>
          ) : null}
        </div>

        {!selectedRun ? (
          <div style={emptyPanelStyle}>选中一条 run 后，这里会显示计划、输出和错误信息。</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <TraceStat label="Run ID" value={selectedRun.id} />
              <TraceStat label="Brain Slot" value={selectedRun.plannerProfileId || "manual"} />
              <TraceStat label="Planner" value={selectedRun.planner} />
              <TraceStat label="Planner Model" value={selectedRun.plannerModel || "default"} />
              <TraceStat label="Planner Session" value={selectedRun.plannerSessionId || "none"} />
              <TraceStat label="Mode" value={selectedRun.mode} />
              <TraceStat label="Updated" value={formatTime(selectedRun.updatedAt)} />
            </div>

            {selectedRun.plannerSessionStateFile ? (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)", wordBreak: "break-all" }}>
                Session State File: {selectedRun.plannerSessionStateFile}
              </div>
            ) : null}

            {selectedRun.executorModels ? (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
                Executor Models: codex={selectedRun.executorModels.codex || "default"} · claude={selectedRun.executorModels.claude || "default"} · gemini={selectedRun.executorModels.gemini || "default"}
              </div>
            ) : null}

            {selectedRun.error ? (
              <div style={warningCardStyle("#fda4af")}>{selectedRun.error}</div>
            ) : null}

            {selectedRun.plan ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Dispatch Plan</div>
                {selectedRun.plan.summary ? (
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>{selectedRun.plan.summary}</div>
                ) : null}
                <div style={{ display: "grid", gap: 10 }}>
                  {selectedRun.plan.tasks.map(task => (
                    <div
                      key={task.id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <strong style={{ fontSize: 13 }}>{task.title}</strong>
                        <span style={badgeStyle(task.executor === "codex" ? "#7dd3fc" : task.executor === "claude" ? "#fbbf24" : "#c4b5fd")}>
                          {task.executor}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {task.id} · {task.workdir}
                        {task.dependsOn.length > 0 ? ` · depends on ${task.dependsOn.join(", ")}` : ""}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{task.objective}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <LogPanel title="stdout tail" value={selectedRun.stdoutTail || "暂无输出"} />
              <LogPanel title="stderr tail" value={selectedRun.stderrTail || "暂无错误输出"} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function createProfileDraft(profile: HermesPlannerProfile): HermesPlannerProfileDraft {
  return {
    id: profile.id,
    label: profile.label,
    sessionStateFile: profile.sessionStateFile,
    description: profile.description || "",
    models: {
      planner: profile.models?.planner || "",
      codex: profile.models?.codex || "",
      claude: profile.models?.claude || "",
      gemini: profile.models?.gemini || "",
    },
  };
}

function normalizeProfileDraft(draft: HermesPlannerProfileDraft): HermesPlannerProfile {
  const models = Object.fromEntries(
    Object.entries(draft.models)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => Boolean(value)),
  ) as HermesPlannerProfile["models"];

  return {
    id: slugifyProfileId(draft.id),
    label: draft.label.trim() || slugifyProfileId(draft.id),
    sessionStateFile: draft.sessionStateFile.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(Object.keys(models || {}).length > 0 ? { models } : {}),
  };
}

function slugifyProfileId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function nextAvailableProfileId(profiles: HermesPlannerProfile[]) {
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `brain-${index}`;
    if (!profiles.some(profile => profile.id === candidate)) {
      return candidate;
    }
  }
  return `brain-${Date.now()}`;
}

function TraceStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <strong style={{ fontSize: 12, wordBreak: "break-word" }}>{value}</strong>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
  listId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suggestions?: readonly string[];
  listId?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <input
        className="input"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
      />
      {suggestions?.length && listId ? (
        <datalist id={listId}>
          {suggestions.map(option => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <textarea
        className="input"
        style={{ minHeight: 88, resize: "vertical" }}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function LogPanel({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{title}</div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function warningCardStyle(color: string): CSSProperties {
  return {
    padding: 12,
    borderRadius: 14,
    border: `1px solid ${color}44`,
    background: `${color}12`,
    color: "var(--text)",
    fontSize: 12,
    lineHeight: 1.7,
  };
}

const emptyPanelStyle = {
  padding: 16,
  borderRadius: 16,
  border: "1px dashed var(--border)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--text-muted)",
  fontSize: 12,
  lineHeight: 1.75,
} satisfies CSSProperties;
