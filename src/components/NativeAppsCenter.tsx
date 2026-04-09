"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { applyDesktopLaunchNavigation } from "@/lib/desktop-launch-routing";
import { useStore } from "@/store";
import { getSessionProjectLabel } from "@/lib/project-context";
import type { DesktopProgramEntry } from "@/store/types";
import type { NativeAppLaunchResult, NativeInstalledApplication } from "@/types/electron-api";
import { DesktopRuntimeBadge, getDesktopRuntimeTone } from "./DesktopRuntimeBadge";

type LaunchHistoryItem = NativeAppLaunchResult & {
  id: string;
  target: string;
  args: string[];
  createdAt: number;
  destinationLabel?: string;
};

const INSTALLED_APPS_CACHE_KEY = "xlx-installed-apps-cache-v1";

function normalizeProgramIdentity(target: string) {
  const normalized = target.trim().toLowerCase().replace(/^"+|"+$/g, "");
  if (!normalized) return [];
  const slashNormalized = normalized.replace(/\//g, "\\");
  const parts = slashNormalized.split("\\").filter(Boolean);
  const base = parts[parts.length - 1] ?? slashNormalized;
  const stem = base.endsWith(".exe") ? base.slice(0, -4) : base;
  return Array.from(new Set([slashNormalized, base, stem]));
}

function isProgramListed(entries: DesktopProgramEntry[], target: string) {
  const targetIdentities = new Set(normalizeProgramIdentity(target));
  return entries.some(entry =>
    normalizeProgramIdentity(entry.target).some(identity => targetIdentities.has(identity)),
  );
}

export function NativeAppsCenter() {
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const desktopProgramSettings = useStore(s => s.desktopProgramSettings);
  const updateDesktopProgramSettings = useStore(s => s.updateDesktopProgramSettings);
  const saveDesktopFavorite = useStore(s => s.saveDesktopFavorite);
  const removeDesktopFavorite = useStore(s => s.removeDesktopFavorite);
  const saveDesktopWhitelistEntry = useStore(s => s.saveDesktopWhitelistEntry);
  const removeDesktopWhitelistEntry = useStore(s => s.removeDesktopWhitelistEntry);
  const desktopRuntime = useStore(s => s.desktopRuntime);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const [target, setTarget] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<LaunchHistoryItem[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [catalog, setCatalog] = useState<NativeInstalledApplication[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const appFileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const isElectron = Boolean(
    window.electronAPI?.isElectron &&
    window.electronAPI?.launchNativeApplication &&
    window.electronAPI?.listInstalledApplications,
  );
  const desktopRuntimeTone = useMemo(
    () => getDesktopRuntimeTone(desktopRuntime),
    [desktopRuntime],
  );

  const filteredCatalog = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    if (!keyword) return catalog.slice(0, 36);

    return catalog
      .filter(item =>
        [item.name, item.target, item.location ?? "", item.source].some(value =>
          value.toLowerCase().includes(keyword),
        ),
      )
      .slice(0, 36);
  }, [catalog, deferredSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(INSTALLED_APPS_CACHE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        startTransition(() => {
          setCatalog(parsed);
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(INSTALLED_APPS_CACHE_KEY, JSON.stringify(catalog.slice(0, 400)));
    } catch {}
  }, [catalog]);

  useEffect(() => {
    setSelectedCatalogIds(current => current.filter(id => filteredCatalog.some(item => item.id === id)));
  }, [filteredCatalog]);

  const syncDesktopSettings = async () => {
    const {
      providers,
      agentConfigs,
      platformConfigs,
      userNickname,
      semanticMemoryConfig,
      desktopProgramSettings: nextDesktopProgramSettings,
      hermesDispatchSettings,
    } = useStore.getState();

    try {
      if (sendWs({
        type: "settings_sync",
        providers,
        agentConfigs,
        platformConfigs,
        userNickname,
        semanticMemoryConfig,
        desktopProgramSettings: nextDesktopProgramSettings,
        hermesDispatchSettings,
      })) {
        void syncRuntimeSettings();
        return;
      }

      const url = await resolveBackendUrl("/api/settings");
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers,
          agentConfigs,
          platformConfigs,
          userNickname,
          semanticMemoryConfig,
          desktopProgramSettings: nextDesktopProgramSettings,
          hermesDispatchSettings,
        }),
      });
    } catch (error) {
      console.error("Failed to sync desktop program settings:", error);
    }
  };

  const applyDesktopSettingUpdates = async (
    updates: Parameters<typeof updateDesktopProgramSettings>[0],
    nextStatus?: string,
  ) => {
    updateDesktopProgramSettings(updates);
    if (nextStatus) {
      setStatus(nextStatus);
    }
    await syncDesktopSettings();
  };

  const buildPolicy = () => ({
    enabled: desktopProgramSettings.enabled,
    whitelistMode: desktopProgramSettings.whitelistMode,
    whitelist: desktopProgramSettings.whitelist.map(item => ({
      label: item.label,
      target: item.target,
    })),
  });

  const launch = async (override?: { target: string; args?: readonly string[]; cwd?: string }) => {
    const nextTarget = override?.target ?? target.trim();
    const nextArgs = override?.args ? [...override.args] : [];
    const nextCwd = override?.cwd ?? cwd.trim();

    if (!nextTarget) {
      setStatus("请先输入程序路径、程序名或系统命令。");
      return;
    }

    if (!window.electronAPI?.launchNativeApplication) {
      setStatus("当前不是 Electron 运行态，无法调用本机程序。");
      return;
    }

    try {
      setBusy(true);
      setStatus(null);
      const result = await window.electronAPI.launchNativeApplication({
        target: nextTarget,
        args: nextArgs,
        ...(nextCwd ? { cwd: nextCwd } : {}),
        policy: buildPolicy(),
      });
      const destination = result.ok
        ? applyDesktopLaunchNavigation(nextTarget, {
            setTab,
            setActiveControlCenterSection,
          })
        : null;

      setHistory(current => [
        {
          ...result,
          id: `launch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          target: nextTarget,
          args: nextArgs,
          createdAt: Date.now(),
          destinationLabel: destination?.label,
        },
        ...current,
      ].slice(0, 8));
      setStatus(destination ? `${result.message} 已自动切到${destination.label}。` : result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedItem: LaunchHistoryItem = {
        ok: false,
        method: "spawn",
        message,
        id: `launch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        target: nextTarget,
        args: nextArgs,
        createdAt: Date.now(),
      };
      setHistory(current => [failedItem, ...current].slice(0, 8));
      setStatus(message);
    } finally {
      setBusy(false);
    }
  };

  const scanInstalledApps = async (forceRefresh = false) => {
    if (!window.electronAPI?.listInstalledApplications) {
      setStatus("当前不是 Electron 运行态，无法扫描本机已安装程序。");
      return;
    }

    try {
      setScanBusy(true);
      setStatus(null);
      const result = await window.electronAPI.listInstalledApplications(forceRefresh);
      startTransition(() => {
        setCatalog(result);
      });
      setStatus(`已扫描到 ${result.length} 个可识别程序。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setScanBusy(false);
    }
  };

  const addSelectedApplicationToWhitelist = async (selectedPath: string) => {
    const normalizedTarget = selectedPath.trim();
    if (!normalizedTarget) return;

    setTarget(normalizedTarget);

    if (isProgramListed(desktopProgramSettings.whitelist, normalizedTarget)) {
      setStatus("该应用已经在白名单中。");
      return;
    }

    const label = normalizedTarget.split(/[\\/]/).filter(Boolean).pop() ?? normalizedTarget;
    saveDesktopWhitelistEntry({
      label,
      target: normalizedTarget,
      args: [],
      cwd: "",
      source: "manual",
      notes: "",
    });
    setStatus(`已将 ${label} 加入白名单。`);
    await syncDesktopSettings();
  };

  const selectApplicationPath = async () => {
    try {
      setPickerBusy(true);
      if (window.electronAPI?.selectNativeApplicationFile) {
        const selectedPath = await window.electronAPI.selectNativeApplicationFile();
        if (!selectedPath) return;
        await addSelectedApplicationToWhitelist(selectedPath);
        return;
      }

      appFileInputRef.current?.click();
    } catch (error) {
      appFileInputRef.current?.click();
    } finally {
      setPickerBusy(false);
    }
  };

  const fillForm = (entry: { label?: string; target: string; args?: readonly string[]; cwd?: string }) => {
    setTarget(entry.target);
    setCwd(entry.cwd ?? "");
    setStatus(entry.label ? `已填入 ${entry.label}` : "已填入程序信息");
  };

  const toggleCatalogSelection = (id: string) => {
    setSelectedCatalogIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  };

  const selectedCatalogItems = filteredCatalog.filter(item => selectedCatalogIds.includes(item.id));
  const compactFavorites = desktopProgramSettings.favorites.slice(0, 6);
  const compactWhitelist = desktopProgramSettings.whitelist.slice(0, 6);
  const compactHistory = history.slice(0, 6);

  const addSelectedToFavorites = () => {
    for (const item of selectedCatalogItems) {
      saveDesktopFavorite({
        label: item.name,
        target: item.target,
        args: [],
        source: "scan",
        cwd: "",
        notes: "",
      });
    }
    setStatus(`已将 ${selectedCatalogItems.length} 个程序加入收藏。`);
    setSelectedCatalogIds([]);
    void syncDesktopSettings();
  };

  const addSelectedToWhitelist = () => {
    for (const item of selectedCatalogItems) {
      saveDesktopWhitelistEntry({
        label: item.name,
        target: item.target,
        args: [],
        source: "scan",
        cwd: "",
        notes: "",
      });
    }
    setStatus(`已将 ${selectedCatalogItems.length} 个程序加入白名单。`);
    setSelectedCatalogIds([]);
    void syncDesktopSettings();
  };

  return (
    <div
      className="control-center"
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr)",
        gap: 10,
      }}
    >
      <div className="control-center__panel" style={{ padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div className="control-center__eyebrow">Desktop Apps</div>
            <div className="control-center__hero-title" style={{ marginTop: 0 }}>本机程序控制台</div>
            <div className="control-center__copy">
              当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"} · {isElectron ? "Electron Desktop" : "Web Browser"}
            </div>
          </div>
          <div className="control-center__quick-actions" style={{ gap: 8 }}>
            <DesktopRuntimeBadge compact />
            <span className={`control-center__scenario-badge is-${desktopProgramSettings.enabled ? "ready" : "blocked"}`}>
              本机程序 {desktopProgramSettings.enabled ? "已启用" : "已关闭"}
            </span>
            <span className={`control-center__scenario-badge is-${desktopProgramSettings.whitelistMode ? "blocked" : "ready"}`}>
              白名单 {desktopProgramSettings.whitelistMode ? "开启" : "关闭"}
            </span>
            <span className={`control-center__scenario-badge is-${desktopProgramSettings.inputControl.enabled ? "ready" : "partial"}`}>
              输入接管 {desktopProgramSettings.inputControl.enabled ? "已启用" : "已关闭"}
            </span>
          </div>
        </div>

        <div className="control-center__stats" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">客户端</div>
            <div className="control-center__stat-value" style={{ color: "var(--accent)" }}>{desktopRuntime.totalClients}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">可启动</div>
            <div className="control-center__stat-value" style={{ color: "#22c55e" }}>{desktopRuntime.launchCapable}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">可扫描</div>
            <div className="control-center__stat-value" style={{ color: "#60a5fa" }}>{desktopRuntime.installedAppsCapable}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">可接管</div>
            <div className="control-center__stat-value" style={{ color: "#f59e0b" }}>{desktopRuntime.inputCapable}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">可截图</div>
            <div className="control-center__stat-value" style={{ color: "#c084fc" }}>{desktopRuntime.screenshotCapable}</div>
          </div>
        </div>

        <div className="control-center__copy">{desktopRuntimeTone.detail}</div>
      </div>

      <div className="control-center__panel" style={{ padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.9fr)",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <input
              ref={appFileInputRef}
              type="file"
              accept=".exe,.lnk,.bat,.cmd,.com"
              style={{ display: "none" }}
              onChange={event => {
                const file = event.target.files?.[0] as (File & { path?: string }) | undefined;
                const selectedPath = file?.path ?? "";
                event.currentTarget.value = "";
                if (!selectedPath) {
                  setStatus("未能读取应用路径，请重试或重启 Electron 窗口。");
                  return;
                }
                void addSelectedApplicationToWhitelist(selectedPath);
              }}
            />

            <div className="control-center__approval-head">
              <div>
                <div className="control-center__panel-title">加入白名单</div>
                <div className="control-center__copy">从资源管理器选择应用后，自动加入本机程序白名单。</div>
              </div>
            </div>

            <div className="native-apps__allowlist-row">
              <input
                className="input scheduled-form__input native-apps__allowlist-input"
                value={target}
                onChange={event => setTarget(event.target.value)}
                placeholder='选择应用路径，例如 "C:\\Program Files\\App\\app.exe"'
                readOnly
              />
              <button
                type="button"
                className="btn-handoff native-apps__allowlist-button"
                disabled={pickerBusy}
                onClick={() => void selectApplicationPath()}
                title="打开资源管理器选择应用程序"
              >
                {pickerBusy ? "选择中..." : "加入白名单"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setTarget("");
                  setCwd("");
                  setStatus(null);
                }}
              >
                清空
              </button>
              <div className="control-center__copy" style={{ marginLeft: "auto" }}>
                可从资源管理器选择 `.exe`、`.lnk`、`.bat`、`.cmd`
              </div>
            </div>

            {status ? <div className="native-apps__status" style={{ marginTop: 0 }}>{status}</div> : null}
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              alignContent: "start",
              padding: 12,
              borderRadius: 18,
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-elevated)",
            }}
          >
            <div className="control-center__panel-title">运行策略</div>
            {[
              {
                label: "启用本机程序调用",
                value: desktopProgramSettings.enabled,
                action: () =>
                  void applyDesktopSettingUpdates(
                    { enabled: !desktopProgramSettings.enabled },
                    `本机程序调用已${desktopProgramSettings.enabled ? "关闭" : "启用"}。`,
                  ),
              },
              {
                label: "白名单模式",
                value: desktopProgramSettings.whitelistMode,
                action: () =>
                  void applyDesktopSettingUpdates(
                    { whitelistMode: !desktopProgramSettings.whitelistMode },
                    `白名单模式已${desktopProgramSettings.whitelistMode ? "关闭" : "开启"}。`,
                  ),
              },
              {
                label: "启用鼠标键盘接管",
                value: desktopProgramSettings.inputControl.enabled,
                action: () =>
                  void applyDesktopSettingUpdates(
                    {
                      inputControl: {
                        ...desktopProgramSettings.inputControl,
                        enabled: !desktopProgramSettings.inputControl.enabled,
                      },
                    },
                    `输入接管已${desktopProgramSettings.inputControl.enabled ? "关闭" : "启用"}。`,
                  ),
              },
              {
                label: "接管异常时显示状态提醒",
                value: desktopProgramSettings.inputControl.autoOpenPanelOnAction,
                action: () =>
                  void applyDesktopSettingUpdates(
                    {
                      inputControl: {
                        ...desktopProgramSettings.inputControl,
                        autoOpenPanelOnAction: !desktopProgramSettings.inputControl.autoOpenPanelOnAction,
                      },
                    },
                    `桌面接管状态提醒已${desktopProgramSettings.inputControl.autoOpenPanelOnAction ? "关闭" : "启用"}。`,
                  ),
              },
              {
                label: "验证场景强制人工接管",
                value: desktopProgramSettings.inputControl.requireManualTakeoverForVerification,
                action: () =>
                  void applyDesktopSettingUpdates(
                    {
                      inputControl: {
                        ...desktopProgramSettings.inputControl,
                        requireManualTakeoverForVerification:
                          !desktopProgramSettings.inputControl.requireManualTakeoverForVerification,
                      },
                    },
                    `验证场景已${desktopProgramSettings.inputControl.requireManualTakeoverForVerification ? "改为自动" : "改为人工接管"}。`,
                  ),
              },
            ].map(item => (
              <button
                key={item.label}
                type="button"
                className="btn-ghost"
                onClick={item.action}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: 12, minHeight: 40 }}
              >
                <span>{item.label}</span>
                <span className={`control-center__scenario-badge is-${item.value ? "ready" : "blocked"}`}>
                  {item.value ? "开启" : "关闭"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
