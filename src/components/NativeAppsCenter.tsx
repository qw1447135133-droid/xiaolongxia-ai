"use client";

import { useDeferredValue, useEffect, useMemo, useState, startTransition } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { applyDesktopLaunchNavigation } from "@/lib/desktop-launch-routing";
import { useStore } from "@/store";
import { getSessionProjectLabel } from "@/lib/project-context";
import type { DesktopProgramEntry } from "@/store/types";
import type { NativeAppLaunchResult, NativeInstalledApplication } from "@/types/electron-api";
import { DesktopRuntimeBadge, getDesktopRuntimeTone } from "./DesktopRuntimeBadge";
import { DesktopRuntimeDiagnosticsCard } from "./DesktopRuntimeDiagnosticsCard";

type LaunchHistoryItem = NativeAppLaunchResult & {
  id: string;
  target: string;
  args: string[];
  createdAt: number;
  destinationLabel?: string;
};

const DEFAULT_PRESETS = [
  { id: "wechat", label: "微信", target: "WeChat.exe", args: [] },
  { id: "feishu", label: "飞书", target: "Feishu.exe", args: [] },
  { id: "chrome", label: "Chrome", target: "chrome.exe", args: [] },
  { id: "code", label: "VS Code", target: "Code.exe", args: [] },
  { id: "explorer", label: "资源管理器", target: "explorer.exe", args: [] },
] as const;
const INSTALLED_APPS_CACHE_KEY = "xlx-installed-apps-cache-v1";

function parseArgLines(value: string) {
  return value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

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
  const saveDesktopFavorite = useStore(s => s.saveDesktopFavorite);
  const removeDesktopFavorite = useStore(s => s.removeDesktopFavorite);
  const saveDesktopWhitelistEntry = useStore(s => s.saveDesktopWhitelistEntry);
  const removeDesktopWhitelistEntry = useStore(s => s.removeDesktopWhitelistEntry);
  const desktopRuntime = useStore(s => s.desktopRuntime);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const [target, setTarget] = useState("");
  const [argText, setArgText] = useState("");
  const [cwd, setCwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<LaunchHistoryItem[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [catalog, setCatalog] = useState<NativeInstalledApplication[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
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

  const favoritePresets = useMemo(
    () => [
      ...desktopProgramSettings.favorites,
      ...DEFAULT_PRESETS
        .filter(item => !isProgramListed(desktopProgramSettings.favorites, item.target))
        .map(item => ({
          id: item.id,
          label: item.label,
          target: item.target,
          args: [...item.args],
          cwd: "",
          source: "preset" as const,
          createdAt: 0,
          updatedAt: 0,
        })),
    ],
    [desktopProgramSettings.favorites],
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

  const groupedCatalog = useMemo(() => {
    const favorite = filteredCatalog.filter(item => isProgramListed(desktopProgramSettings.favorites, item.target));
    const whitelistOnly = filteredCatalog.filter(
      item => !isProgramListed(desktopProgramSettings.favorites, item.target) && isProgramListed(desktopProgramSettings.whitelist, item.target),
    );
    const other = filteredCatalog.filter(
      item =>
        !isProgramListed(desktopProgramSettings.favorites, item.target) &&
        !isProgramListed(desktopProgramSettings.whitelist, item.target),
    );

    return [
      { id: "favorite", title: "已收藏程序", items: favorite },
      { id: "whitelist", title: "白名单程序", items: whitelistOnly },
      { id: "other", title: "其他扫描结果", items: other },
    ].filter(group => group.items.length > 0);
  }, [desktopProgramSettings.favorites, desktopProgramSettings.whitelist, filteredCatalog]);

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
    const { providers, agentConfigs, userNickname, desktopProgramSettings: nextDesktopProgramSettings } = useStore.getState();

    try {
      if (sendWs({ type: "settings_sync", providers, agentConfigs, userNickname, desktopProgramSettings: nextDesktopProgramSettings })) {
        return;
      }

      const url = await resolveBackendUrl("/api/settings");
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers, agentConfigs, userNickname, desktopProgramSettings: nextDesktopProgramSettings }),
      });
    } catch (error) {
      console.error("Failed to sync desktop program settings:", error);
    }
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
    const nextArgs = override?.args ? [...override.args] : parseArgLines(argText);
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

  const fillForm = (entry: { label?: string; target: string; args?: readonly string[]; cwd?: string }) => {
    setTarget(entry.target);
    setArgText((entry.args ?? []).join("\n"));
    setCwd(entry.cwd ?? "");
    setStatus(entry.label ? `已填入 ${entry.label}` : "已填入程序信息");
  };

  const saveCurrentAsFavorite = () => {
    const nextTarget = target.trim();
    if (!nextTarget) return;
    saveDesktopFavorite({
      label: nextTarget,
      target: nextTarget,
      args: parseArgLines(argText),
      cwd: cwd.trim(),
      source: "manual",
      notes: "",
    });
    setStatus("已加入收藏预设。");
    void syncDesktopSettings();
  };

  const saveCurrentAsWhitelist = () => {
    const nextTarget = target.trim();
    if (!nextTarget) return;
    saveDesktopWhitelistEntry({
      label: nextTarget,
      target: nextTarget,
      args: parseArgLines(argText),
      cwd: cwd.trim(),
      source: "manual",
      notes: "",
    });
    setStatus("已加入白名单。");
    void syncDesktopSettings();
  };

  const toggleCatalogSelection = (id: string) => {
    setSelectedCatalogIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
  };

  const selectedCatalogItems = filteredCatalog.filter(item => selectedCatalogIds.includes(item.id));

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
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">Desktop Apps</div>
        <div className="control-center__hero-title">
          扫描本机程序、搜索应用、收藏常用入口，再决定是否走白名单
        </div>
        <div className="control-center__hero-copy">
          这里接的是 Electron 主进程本机启动能力。现在不仅能手动输入程序，也能扫描已安装应用、加入收藏预设，并用白名单模式收紧 agent 的桌面调用范围。
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"} · 运行环境 {isElectron ? "Electron Desktop" : "Web Browser"}
        </div>
        <div className="control-center__quick-actions" style={{ marginTop: 12 }}>
          <DesktopRuntimeBadge compact />
          <span className={`control-center__scenario-badge is-${desktopProgramSettings.enabled ? "ready" : "blocked"}`}>
            本机程序 {desktopProgramSettings.enabled ? "已启用" : "已关闭"}
          </span>
          <span className={`control-center__scenario-badge is-${desktopProgramSettings.whitelistMode ? "blocked" : "ready"}`}>
            白名单模式 {desktopProgramSettings.whitelistMode ? "开启" : "关闭"}
          </span>
          <span className="control-center__scenario-badge is-ready">
            收藏预设 {desktopProgramSettings.favorites.length}
          </span>
          <span className="control-center__scenario-badge is-ready">
            白名单 {desktopProgramSettings.whitelist.length}
          </span>
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          {desktopRuntimeTone.detail}
        </div>
      </div>

      <DesktopRuntimeDiagnosticsCard />

      <div className="control-center__panel">
        <div className="control-center__panel-title">快捷入口</div>
        <div className="control-center__quick-actions">
          {favoritePresets.map(item => {
            const isFavorite = item.source !== "preset";
            return (
              <button
                key={`${item.id}-${item.target}`}
                type="button"
                className="btn-ghost"
                disabled={busy || !isElectron}
                onClick={() => {
                  fillForm(item);
                  void launch({ target: item.target, args: item.args, cwd: item.cwd });
                }}
              >
                启动{item.label}{isFavorite ? " · 收藏" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">任意本机程序</div>
        <div className="control-center__mode-list">
          <div className="scheduled-form__field">
            <label className="scheduled-form__label">程序名 / 可执行路径 / 系统命令</label>
            <input
              className="input scheduled-form__input"
              value={target}
              onChange={event => setTarget(event.target.value)}
              placeholder='例如 WeChat.exe / Feishu.exe / chrome.exe / "C:\\Program Files\\App\\app.exe"'
            />
          </div>

          <div className="scheduled-form__field">
            <label className="scheduled-form__label">启动参数</label>
            <textarea
              className="input scheduled-form__textarea"
              value={argText}
              onChange={event => setArgText(event.target.value)}
              placeholder="每行一个参数，例如：&#10;--profile-directory=Default&#10;https://chatgpt.com/"
            />
          </div>

          <div className="scheduled-form__field">
            <label className="scheduled-form__label">工作目录（可选）</label>
            <input
              className="input scheduled-form__input"
              value={cwd}
              onChange={event => setCwd(event.target.value)}
              placeholder="例如 C:\\Users\\14471\\Desktop"
            />
          </div>

          <div className="control-center__list control-center__list--dense">
            <div>1. 支持程序名、绝对路径、`.lnk` 快捷方式，以及常见系统命令。</div>
            <div>2. 白名单模式开启后，只有白名单里的程序可以启动。</div>
            <div>3. 当前还是“启动程序”，还不包含鼠标键盘模拟或窗口内自动点击。</div>
          </div>

          <div className="scheduled-form__actions">
            <button
              type="button"
              className="btn-ghost scheduled-form__button"
              onClick={() => {
                setTarget("");
                setArgText("");
                setCwd("");
                setStatus(null);
              }}
            >
              清空
            </button>
            <button
              type="button"
              className="btn-ghost scheduled-form__button"
              disabled={!target.trim()}
              onClick={saveCurrentAsFavorite}
            >
              加入收藏
            </button>
            <button
              type="button"
              className="btn-ghost scheduled-form__button"
              disabled={!target.trim()}
              onClick={saveCurrentAsWhitelist}
            >
              加入白名单
            </button>
            <button
              type="button"
              className="btn-primary scheduled-form__button"
              disabled={busy || !isElectron}
              onClick={() => void launch()}
            >
              {busy ? "启动中..." : "启动程序"}
            </button>
          </div>

          {status ? (
            <div className="native-apps__status">{status}</div>
          ) : null}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__approval-head">
          <div>
            <div className="control-center__panel-title">扫描已安装程序</div>
            <div className="control-center__copy">
              从注册表和开始菜单抓取可识别应用，方便搜索、收藏和加入白名单。
            </div>
          </div>
          <div className="scheduled-form__actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={scanBusy || !isElectron}
              onClick={() => void scanInstalledApps(false)}
            >
              {scanBusy ? "扫描中..." : "扫描程序"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={scanBusy || !isElectron}
              onClick={() => void scanInstalledApps(true)}
            >
              强制刷新
            </button>
          </div>
        </div>

        <div className="scheduled-form__field" style={{ marginTop: 12 }}>
          <label className="scheduled-form__label">搜索应用</label>
          <input
            className="input scheduled-form__input"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="搜索程序名、路径或来源"
          />
        </div>

        <div className="scheduled-form__actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn-ghost"
            disabled={selectedCatalogItems.length === 0}
            onClick={addSelectedToFavorites}
          >
            批量加入收藏
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={selectedCatalogItems.length === 0}
            onClick={addSelectedToWhitelist}
          >
            批量加入白名单
          </button>
          <div className="control-center__copy">
            已选 {selectedCatalogItems.length} / {filteredCatalog.length}
          </div>
        </div>

        <div className="control-center__dispatch-list" style={{ marginTop: 12 }}>
          {filteredCatalog.length === 0 ? (
            <div className="control-center__copy">
              {catalog.length === 0 ? "还没有扫描结果。" : "没有匹配到符合搜索条件的程序。"}
            </div>
          ) : (
            groupedCatalog.map(group => (
              <div key={group.id} style={{ display: "grid", gap: 10 }}>
                <div className="control-center__copy" style={{ fontWeight: 700 }}>{group.title} · {group.items.length}</div>
                {group.items.map(item => {
                  const inFavorites = isProgramListed(desktopProgramSettings.favorites, item.target);
                  const inWhitelist = isProgramListed(desktopProgramSettings.whitelist, item.target);
                  const selected = selectedCatalogIds.includes(item.id);

                  return (
                    <article key={item.id} className="control-center__dispatch-card">
                      <div className="control-center__approval-head">
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCatalogSelection(item.id)}
                            style={{ marginTop: 4 }}
                          />
                          <div>
                            <div className="control-center__panel-title">{item.name}</div>
                            <div className="control-center__copy" style={{ wordBreak: "break-all" }}>
                              {item.target}
                            </div>
                          </div>
                        </div>
                        <span className="control-center__scenario-badge is-ready">
                          {item.source === "registry" ? "注册表" : "开始菜单"}
                        </span>
                      </div>

                      {item.location ? (
                        <div className="control-center__copy" style={{ wordBreak: "break-all" }}>
                          位置: {item.location}
                        </div>
                      ) : null}

                      <div className="scheduled-form__actions" style={{ marginTop: 10 }}>
                        <button type="button" className="btn-ghost" onClick={() => fillForm({ target: item.target, label: item.name })}>
                          填入表单
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            saveDesktopFavorite({
                              label: item.name,
                              target: item.target,
                              args: [],
                              source: "scan",
                              cwd: "",
                              notes: "",
                            });
                            void syncDesktopSettings();
                          }}
                        >
                          {inFavorites ? "已收藏" : "加入收藏"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            if (inWhitelist) {
                              const existing = desktopProgramSettings.whitelist.find(entry => isProgramListed([entry], item.target));
                              if (existing) {
                                removeDesktopWhitelistEntry(existing.id);
                              }
                            } else {
                              saveDesktopWhitelistEntry({
                                label: item.name,
                                target: item.target,
                                args: [],
                                source: "scan",
                                cwd: "",
                                notes: "",
                              });
                            }
                            void syncDesktopSettings();
                          }}
                        >
                          {inWhitelist ? "移出白名单" : "加入白名单"}
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busy || !isElectron}
                          onClick={() => {
                            fillForm({ target: item.target, label: item.name });
                            void launch({ target: item.target, args: [] });
                          }}
                        >
                          直接启动
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">当前收藏预设</div>
        <div className="control-center__dispatch-list">
          {desktopProgramSettings.favorites.length === 0 ? (
            <div className="control-center__copy">还没有收藏预设。</div>
          ) : (
            desktopProgramSettings.favorites.map(item => (
              <article key={item.id} className="control-center__dispatch-card">
                <div className="control-center__approval-head">
                  <div>
                    <div className="control-center__panel-title">{item.label}</div>
                    <div className="control-center__copy" style={{ wordBreak: "break-all" }}>{item.target}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      removeDesktopFavorite(item.id);
                      void syncDesktopSettings();
                    }}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">当前白名单</div>
        <div className="control-center__dispatch-list">
          {desktopProgramSettings.whitelist.length === 0 ? (
            <div className="control-center__copy">还没有白名单程序。</div>
          ) : (
            desktopProgramSettings.whitelist.map(item => (
              <article key={item.id} className="control-center__dispatch-card">
                <div className="control-center__approval-head">
                  <div>
                    <div className="control-center__panel-title">{item.label}</div>
                    <div className="control-center__copy" style={{ wordBreak: "break-all" }}>{item.target}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      removeDesktopWhitelistEntry(item.id);
                      void syncDesktopSettings();
                    }}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">最近启动记录</div>
        <div className="control-center__dispatch-list">
          {history.length === 0 ? (
            <div className="control-center__copy">还没有本机程序启动记录。</div>
          ) : (
            history.map(item => (
              <article key={item.id} className="control-center__dispatch-card">
                <div className="control-center__approval-head">
                  <div>
                    <div className="control-center__panel-title">{item.target}</div>
                    <div className="control-center__copy">
                      {new Intl.DateTimeFormat("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      }).format(item.createdAt)} · {item.method === "spawn" ? "直接启动" : "Shell 启动"}
                    </div>
                  </div>
                  <span className={`control-center__scenario-badge is-${item.ok ? "ready" : "blocked"}`}>
                    {item.ok ? "已启动" : "失败"}
                  </span>
                </div>
                <div className="control-center__dispatch-note">{item.message}</div>
                {item.destinationLabel ? (
                  <div className="control-center__copy">已自动切到: {item.destinationLabel}</div>
                ) : null}
                {item.args.length > 0 ? (
                  <div className="control-center__copy">参数: {item.args.join(" ")}</div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
