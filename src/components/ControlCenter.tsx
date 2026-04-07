"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getRunProjectScopeKey, getSessionProjectLabel } from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { ControlCenterSectionId, UiLocale } from "@/store/types";
import { getUiText, pickLocaleText } from "@/lib/ui-locale";
import { BusinessEntitiesCenter } from "./BusinessEntitiesCenter";
import { ChannelsCenter } from "./ChannelsCenter";
import { LaunchReadinessPanel } from "./LaunchReadinessPanel";
import { PluginsCenter } from "./PluginsCenter";
import { RemoteOpsCenter } from "./RemoteOpsCenter";
import { SettingsPanel } from "./SettingsPanel";
import { SkillsCenter } from "./SkillsCenter";

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function getControlCenterSections(locale: UiLocale): Array<{ id: ControlCenterSectionId; label: string; hint: string }> {
  return [
    {
      id: "overview",
      label: pickLocaleText(locale, { "zh-CN": "总览", "zh-TW": "總覽", en: "Overview", ja: "概要" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "工作台状态与控制台结构",
        "zh-TW": "工作台狀態與控制台結構",
        en: "Workbench status and shell structure",
        ja: "ワークベンチ状態とコントロール構造",
      }),
    },
    {
      id: "entities",
      label: pickLocaleText(locale, { "zh-CN": "业务与渠道", "zh-TW": "業務與渠道", en: "Business & Channels", ja: "業務とチャネル" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "客户、线索、工单、内容任务与渠道会话",
        "zh-TW": "客戶、線索、工單、內容任務與渠道會話",
        en: "Customers, leads, tickets, content tasks, and channels",
        ja: "顧客、リード、チケット、コンテンツ、チャネル会話",
      }),
    },
    {
      id: "remote",
      label: pickLocaleText(locale, { "zh-CN": "远程值守", "zh-TW": "遠程值守", en: "Remote Ops", ja: "遠隔運用" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "数字员工值守状态与缺口",
        "zh-TW": "數位員工值守狀態與缺口",
        en: "Digital workforce readiness and gaps",
        ja: "デジタル社員の監督状態と不足",
      }),
    },
    {
      id: "skills",
      label: pickLocaleText(locale, { "zh-CN": "技能中心", "zh-TW": "技能中心", en: "Skills Center", ja: "スキルセンター" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "跨 agent 能力看板",
        "zh-TW": "跨 agent 能力看板",
        en: "Cross-agent capability board",
        ja: "agent 横断の能力ボード",
      }),
    },
    {
      id: "plugins",
      label: pickLocaleText(locale, { "zh-CN": "插件中心", "zh-TW": "插件中心", en: "Plugins Center", ja: "プラグインセンター" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "扩展能力与本地插件开关",
        "zh-TW": "擴展能力與本地插件開關",
        en: "Extension board and local plugin toggles",
        ja: "拡張ボードとローカルプラグイン切替",
      }),
    },
    {
      id: "settings",
      label: pickLocaleText(locale, { "zh-CN": "设置", "zh-TW": "設定", en: "Settings", ja: "設定" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "Agent 模型、API 提供方与工作区偏好",
        "zh-TW": "Agent 模型、API 供應商與工作區偏好",
        en: "Agent models, API providers, and workspace preferences",
        ja: "Agent モデル、API プロバイダー、ワークスペース設定",
      }),
    },
    {
      id: "about",
      label: pickLocaleText(locale, { "zh-CN": "关于", "zh-TW": "關於", en: "About", ja: "この画面について" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "借鉴来源与当前未移植能力",
        "zh-TW": "借鑑來源與目前未移植能力",
        en: "Borrowed ideas and remaining gaps",
        ja: "参考元と未移植の能力",
      }),
    },
  ];
}

export function ControlCenter() {
  const locale = useStore(s => s.locale);
  const activeTeamOperatingTemplateId = useStore(s => s.activeTeamOperatingTemplateId);
  const section = useStore(s => s.activeControlCenterSectionId);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const [entitiesSubTab, setEntitiesSubTab] = useState<"entities" | "channels">("entities");
  const activeTemplate = activeTeamOperatingTemplateId
    ? getTeamOperatingTemplate(activeTeamOperatingTemplateId)
    : null;
  const activeSurface = activeTeamOperatingTemplateId
    ? TEAM_OPERATING_SURFACES[activeTeamOperatingTemplateId]
    : null;

  const sections = useMemo<Array<{ id: ControlCenterSectionId; label: string; hint: string }>>(() => {
    const baseSections = getControlCenterSections(locale);
    if (!activeSurface) return baseSections;

    const priority = new Set<ControlCenterSectionId>(["overview", ...activeSurface.recommendedSectionIds]);
    return [
      ...baseSections.filter(item => priority.has(item.id)),
      ...baseSections.filter(item => !priority.has(item.id)),
    ];
  }, [activeSurface, locale]);
  const activeSectionMeta = sections.find(item => item.id === section) ?? sections[0];

  useEffect(() => {
    if (section === "agent-models" || section === "api-providers" || section === "workspace") {
      setActiveControlCenterSection("settings");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if ((section as string) === "readiness") {
      setActiveControlCenterSection("overview");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if (section === "execution") {
      setActiveControlCenterSection("overview");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if (section === "workflow") {
      setActiveControlCenterSection("overview");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if (section === "desktop") {
      setActiveControlCenterSection("settings");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if (section === "artifacts") {
      setActiveControlCenterSection("overview");
    }
  }, [section, setActiveControlCenterSection]);

  useEffect(() => {
    if (section === "channels") {
      setEntitiesSubTab("channels");
      setActiveControlCenterSection("entities");
      return;
    }
    if (section === "entities") {
      setEntitiesSubTab("entities");
    }
  }, [section, setActiveControlCenterSection]);

  return (
    <div className="settings-shell">
      <aside className="settings-shell__nav">
        <div className="settings-shell__nav-head">
          <div className="settings-shell__eyebrow">{pickLocaleText(locale, {
            "zh-CN": "控制台",
            "zh-TW": "控制台",
            en: "Control Center",
            ja: "コントロールセンター",
          })}</div>
          <div className="settings-shell__title">{pickLocaleText(locale, {
            "zh-CN": "桌面工作台控制面",
            "zh-TW": "桌面工作台控制面",
            en: "Desktop workbench control surface",
            ja: "デスクトップ作業台コントロール面",
          })}</div>
          {activeTemplate && activeSurface ? (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(var(--accent-rgb), 0.24)",
                  background: "rgba(var(--accent-rgb), 0.08)",
                  color: "var(--accent)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {pickLocaleText(locale, {
                  "zh-CN": "当前模式",
                  "zh-TW": "當前模式",
                  en: "Current Mode",
                  ja: "現在のモード",
                })} · {activeTemplate.label}
              </div>
            </div>
          ) : null}
        </div>

        <div className="settings-shell__nav-list">
          {sections.map(item => (
            <button
              key={item.id}
              type="button"
              className={`settings-shell__nav-item ${section === item.id ? "is-active" : ""}`}
              onClick={() => setActiveControlCenterSection(item.id)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="settings-shell__content">
        {section === "overview" && (
          <div style={{ display: "grid", gap: 14 }}>
            <ControlOverview onSelectSection={setActiveControlCenterSection} />
            <LaunchReadinessPanel compact onSelectSection={setActiveControlCenterSection} />
          </div>
        )}
        {section === "entities" && <EntitiesChannelsCenter activeTab={entitiesSubTab} onTabChange={setEntitiesSubTab} />}
        {section === "remote" && <RemoteOpsCenter />}
        {section === "skills" && <SkillsCenter />}
        {section === "plugins" && <PluginsCenter />}
        {(section === "settings" || section === "desktop") && (
          <UnifiedSettingsCenter initialRuntimeSection={section === "desktop" ? "desktop" : "agents"} />
        )}
        {section === "about" && <AboutControlCenter />}
      </div>
    </div>
  );
}

function UnifiedSettingsCenter({
  initialRuntimeSection = "agents",
}: {
  initialRuntimeSection?: "agents" | "providers" | "desktop" | "semantic" | "platforms";
}) {
  const locale = useStore(s => s.locale);
  const [activeSection, setActiveSection] = useState<"agents" | "providers" | "desktop" | "semantic" | "platforms" | "workspace">(initialRuntimeSection);

  useEffect(() => {
    setActiveSection(initialRuntimeSection);
  }, [initialRuntimeSection]);

  return (
    <div className="control-center">
      <div className="control-center__quick-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
        {[
          { id: "agents", label: pickLocaleText(locale, { "zh-CN": "Agent 设置", "zh-TW": "Agent 設定", en: "Agent Settings", ja: "Agent 設定" }) },
          { id: "providers", label: pickLocaleText(locale, { "zh-CN": "模型供应商", "zh-TW": "模型供應商", en: "Providers", ja: "モデルプロバイダー" }) },
          { id: "desktop", label: pickLocaleText(locale, { "zh-CN": "本机程序", "zh-TW": "本機程式", en: "Desktop Programs", ja: "ローカルプログラム" }) },
          { id: "semantic", label: pickLocaleText(locale, { "zh-CN": "语义记忆", "zh-TW": "語義記憶", en: "Semantic Memory", ja: "セマンティック記憶" }) },
          { id: "platforms", label: pickLocaleText(locale, { "zh-CN": "消息平台", "zh-TW": "訊息平台", en: "Platforms", ja: "メッセージプラットフォーム" }) },
          { id: "workspace", label: pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" }) },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            className="btn-ghost"
            onClick={() => setActiveSection(item.id as typeof activeSection)}
            style={activeSection === item.id ? { borderColor: "rgba(var(--accent-rgb), 0.24)", background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" } : undefined}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeSection === "workspace" ? (
        <WorkspacePreferences />
      ) : (
        <SettingsPanel
          initialSection={activeSection}
          allowedSections={["agents", "providers", "desktop", "semantic", "platforms"]}
          showSectionTabs={false}
        />
      )}
    </div>
  );
}

function EntitiesChannelsCenter({
  activeTab,
  onTabChange,
}: {
  activeTab: "entities" | "channels";
  onTabChange: (tab: "entities" | "channels") => void;
}) {
  const locale = useStore(s => s.locale);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="control-center__quick-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onTabChange("entities")}
          style={activeTab === "entities" ? { borderColor: "rgba(var(--accent-rgb), 0.24)", background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" } : undefined}
        >
          {pickLocaleText(locale, { "zh-CN": "业务实体", "zh-TW": "業務實體", en: "Business Entities", ja: "業務エンティティ" })}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onTabChange("channels")}
          style={activeTab === "channels" ? { borderColor: "rgba(var(--accent-rgb), 0.24)", background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" } : undefined}
        >
          {pickLocaleText(locale, { "zh-CN": "渠道中心", "zh-TW": "渠道中心", en: "Channels Center", ja: "チャネルセンター" })}
        </button>
      </div>

      {activeTab === "entities" ? <BusinessEntitiesCenter /> : <ChannelsCenter />}
    </div>
  );
}

function ControlOverview({
  onSelectSection,
}: {
  onSelectSection: (section: ControlCenterSectionId) => void;
}) {
  const locale = useStore(s => s.locale);
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const agents = useStore(s => s.agents);
  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const chatSessions = useStore(s => s.chatSessions);
  const executionRuns = useStore(s => s.executionRuns);
  const businessApprovals = useStore(s => s.businessApprovals);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const semanticKnowledgeDocs = useStore(s => s.semanticKnowledgeDocs);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const wsStatus = useStore(s => s.wsStatus);
  const activeSessionId = useStore(s => s.activeSessionId);

  const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null;
  const currentProjectKey = activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general";
  const scopedDeskNotes = filterByProjectScope(workspaceDeskNotes, activeSession ?? {});
  const scopedSavedBundles = filterByProjectScope(workspaceSavedBundles, activeSession ?? {});
  const scopedProjectMemories = filterByProjectScope(workspaceProjectMemories, activeSession ?? {});
  const scopedKnowledgeDocs = filterByProjectScope(semanticKnowledgeDocs, activeSession ?? {});
  const scopedRuns = executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey);
  const scopedApprovals = filterByProjectScope(businessApprovals, activeSession ?? {});
  const scopedCustomers = filterByProjectScope(businessCustomers, activeSession ?? {});
  const scopedLeads = filterByProjectScope(businessLeads, activeSession ?? {});
  const scopedTickets = filterByProjectScope(businessTickets, activeSession ?? {});
  const scopedContentTasks = filterByProjectScope(businessContentTasks, activeSession ?? {});
  const scopedChannelSessions = filterByProjectScope(businessChannelSessions, activeSession ?? {});

  const runningAgents = Object.values(agents).filter(agent => agent.status === "running").length;
  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled).length;
  const businessObjectCount =
    scopedCustomers.length +
    scopedLeads.length +
    scopedTickets.length +
    scopedContentTasks.length +
    scopedChannelSessions.length;
  const contextAssetCount =
    scopedDeskNotes.length +
    scopedSavedBundles.length +
    scopedProjectMemories.length +
    scopedKnowledgeDocs.length;
  const pendingApprovals = scopedApprovals.filter(item => item.status === "pending").length;
  const recoveredSourceIds = new Set(scopedRuns.map(run => run.retryOfRunId).filter(Boolean));
  const recoveryRuns = scopedRuns.filter(run => {
    if (recoveredSourceIds.has(run.id)) return false;
    return run.status === "failed" || (run.recoveryState && run.recoveryState !== "none");
  }).length;
  const pendingReplySessions = scopedChannelSessions.filter(session =>
    session.requiresReply || (session.unreadCount ?? 0) > 0,
  ).length;
  const manualTakeoverRequired = desktopInputSession.state === "manual-required";

  const manualFocusCards = [
    pendingApprovals > 0 ? {
      id: "approvals",
      eyebrow: pickLocaleText(locale, { "zh-CN": "审批", "zh-TW": "審批", en: "Approvals", ja: "承認" }),
      title: pickLocaleText(locale, {
        "zh-CN": `${pendingApprovals} 条待审批`,
        "zh-TW": `${pendingApprovals} 條待審批`,
        en: `${pendingApprovals} pending approvals`,
        ja: `${pendingApprovals} 件の承認待ち`,
      }),
      copy: pickLocaleText(locale, {
        "zh-CN": "这些对象需要人工裁决后才应继续派发或外发。",
        "zh-TW": "這些對象需要人工裁決後才應繼續派發或外發。",
        en: "These items should be manually approved before dispatch or external send continues.",
        ja: "これらは配信や外部送信を続ける前に手動判断が必要です。",
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "去遠程值守", en: "Open Remote Ops", ja: "遠隔運用を開く" }),
      section: "remote" as const,
    } : null,
    recoveryRuns > 0 ? {
      id: "recovery",
      eyebrow: pickLocaleText(locale, { "zh-CN": "恢复", "zh-TW": "恢復", en: "Recovery", ja: "復旧" }),
      title: pickLocaleText(locale, {
        "zh-CN": `${recoveryRuns} 条待恢复执行`,
        "zh-TW": `${recoveryRuns} 條待恢復執行`,
        en: `${recoveryRuns} runs need recovery`,
        ja: `${recoveryRuns} 件の実行が復旧待ち`,
      }),
      copy: pickLocaleText(locale, {
        "zh-CN": "失败、阻断或待续跑的 run 统一在这里人工收口。",
        "zh-TW": "失敗、阻斷或待續跑的 run 統一在這裡人工收口。",
        en: "Failed, blocked, or resumable runs should be handled here.",
        ja: "失敗・阻害・再開待ちの run をここで人手収束します。",
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "去远程值守", "zh-TW": "去遠程值守", en: "Open Remote Ops", ja: "遠隔運用を開く" }),
      section: "remote" as const,
    } : null,
    pendingReplySessions > 0 ? {
      id: "sessions",
      eyebrow: pickLocaleText(locale, { "zh-CN": "渠道会话", "zh-TW": "渠道會話", en: "Channel Sessions", ja: "チャネル会話" }),
      title: pickLocaleText(locale, {
        "zh-CN": `${pendingReplySessions} 个待回复会话`,
        "zh-TW": `${pendingReplySessions} 個待回覆會話`,
        en: `${pendingReplySessions} sessions need reply`,
        ja: `${pendingReplySessions} 件の会話が返信待ち`,
      }),
      copy: pickLocaleText(locale, {
        "zh-CN": "这里优先处理未读、待回复和需要人工接管的渠道消息。",
        "zh-TW": "這裡優先處理未讀、待回覆和需要人工接管的渠道訊息。",
        en: "Prioritize unread, waiting, and human-handoff channel messages here.",
        ja: "未読・返信待ち・手動引き継ぎが必要な会話をここで優先処理します。",
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "去渠道中心", "zh-TW": "去渠道中心", en: "Open Channels", ja: "チャネルセンターを開く" }),
      section: "channels" as const,
    } : null,
    manualTakeoverRequired ? {
      id: "takeover",
      eyebrow: pickLocaleText(locale, { "zh-CN": "桌面接管", "zh-TW": "桌面接管", en: "Desktop Takeover", ja: "デスクトップ引き継ぎ" }),
      title: pickLocaleText(locale, {
        "zh-CN": "当前有桌面交互等待人工接管",
        "zh-TW": "目前有桌面互動等待人工接管",
        en: "A desktop interaction is waiting for manual takeover",
        ja: "デスクトップ操作が手動引き継ぎ待ちです",
      }),
      copy: desktopInputSession.message || pickLocaleText(locale, {
        "zh-CN": "鼠标键盘流程已经停在人工边界，处理后才能续跑。",
        "zh-TW": "滑鼠鍵盤流程已經停在人工邊界，處理後才能續跑。",
        en: "Mouse/keyboard automation has paused at a human boundary and needs action to continue.",
        ja: "マウス/キーボード自動化が人手境界で停止しており、続行前に対応が必要です。",
      }),
      actionLabel: pickLocaleText(locale, { "zh-CN": "去桌面接管", "zh-TW": "去桌面接管", en: "Open Desktop", ja: "デスクトップを開く" }),
      section: "desktop" as const,
    } : null,
  ].filter(Boolean) as Array<{
    id: string;
    eyebrow: string;
    title: string;
    copy: string;
    actionLabel: string;
    section: ControlCenterSectionId;
  }>;
  const visibleFocusCards = manualFocusCards.slice(0, 2);

  return (
    <div className="control-center">
      <div className="control-center__stats">
        {[
          {
            label: pickLocaleText(locale, { "zh-CN": "业务对象", "zh-TW": "業務對象", en: "Business Objects", ja: "業務オブジェクト" }),
            value: businessObjectCount,
            color: "var(--accent)",
          },
          {
            label: pickLocaleText(locale, { "zh-CN": "上下文资产", "zh-TW": "上下文資產", en: "Context Assets", ja: "コンテキスト資産" }),
            value: contextAssetCount,
            color: "var(--text)",
          },
          {
            label: pickLocaleText(locale, { "zh-CN": "运行 Agent", "zh-TW": "運行 Agent", en: "Running Agents", ja: "稼働 Agent" }),
            value: runningAgents,
            color: runningAgents > 0 ? "var(--success)" : "var(--text)",
          },
          {
            label: pickLocaleText(locale, { "zh-CN": "启用平台", "zh-TW": "啟用平台", en: "Enabled Platforms", ja: "有効プラットフォーム" }),
            value: enabledPlatforms,
            color: enabledPlatforms > 0 ? "var(--success)" : "var(--warning)",
          },
        ].map(item => (
          <div key={item.label} className="control-center__stat-card" style={{ padding: 14 }}>
            <div className="control-center__stat-label">{item.label}</div>
            <div
              className="control-center__stat-value"
              style={{
                color: item.color,
                fontSize: 22,
                lineHeight: 1.25,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        className="control-center__columns"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.92fr)", alignItems: "start" }}
      >
        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "现在需要你看的",
            "zh-TW": "現在需要你看的",
            en: "What Needs Your Attention",
            ja: "今見るべき項目",
          })}</div>
          {visibleFocusCards.length > 0 ? (
            <div className="control-center__approval-list">
              {visibleFocusCards.map(card => (
                <article key={card.id} className="control-center__approval-card">
                  <div className="control-center__eyebrow">{card.eyebrow}</div>
                  <div className="control-center__panel-title" style={{ fontSize: 15 }}>
                    {truncateText(card.title, 72)}
                  </div>
                  <div className="control-center__copy" style={{ marginTop: 0, fontSize: 12, lineHeight: 1.65 }}>
                    {truncateText(card.copy, 128)}
                  </div>
                  <div className="control-center__quick-actions">
                    <button type="button" className="btn-ghost" onClick={() => onSelectSection(card.section)}>
                      {card.actionLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="control-center__copy">
              {pickLocaleText(locale, {
                "zh-CN": "当前没有需要人工立刻处理的阻塞项。自动运行中的执行、验证和策略状态已从这里隐藏。",
                "zh-TW": "目前沒有需要人工立刻處理的阻塞項。自動運行中的執行、驗證和策略狀態已從這裡隱藏。",
                en: "There are no human-blocking items right now. Auto-running execution, verification, and strategy states are hidden from this view.",
                ja: "今すぐ人手対応が必要な阻害項目はありません。自動実行中の状態はこの画面から隠しています。",
              })}
            </div>
          )}
          {manualFocusCards.length > visibleFocusCards.length ? (
            <div className="control-center__copy" style={{ marginTop: 8, fontSize: 12 }}>
              {pickLocaleText(locale, {
                "zh-CN": `还有 ${manualFocusCards.length - visibleFocusCards.length} 项已折叠，进入远程值守后可查看全部。`,
                "zh-TW": `還有 ${manualFocusCards.length - visibleFocusCards.length} 項已摺疊，進入遠程值守後可查看全部。`,
                en: `${manualFocusCards.length - visibleFocusCards.length} more items are folded into Remote Ops.`,
                ja: `あと ${manualFocusCards.length - visibleFocusCards.length} 件は遠隔運用に折りたたんでいます。`,
              })}
            </div>
          ) : null}
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "项目摘要",
            "zh-TW": "專案摘要",
            en: "Project Summary",
            ja: "プロジェクト要約",
          })}</div>
          <div className="control-center__list control-center__list--dense">
            <div>{pickLocaleText(locale, { "zh-CN": "当前项目", "zh-TW": "目前專案", en: "Current Project", ja: "現在のプロジェクト" })}: <strong className="control-center__strong">{activeSession ? getSessionProjectLabel(activeSession) : uiText.common.generalProject}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "系统链路", "zh-TW": "系統鏈路", en: "System Link", ja: "システム接続" })}: <strong className="control-center__strong">{wsStatus === "connected" ? pickLocaleText(locale, { "zh-CN": "在线", "zh-TW": "在線", en: "Online", ja: "オンライン" }) : pickLocaleText(locale, { "zh-CN": "离线", "zh-TW": "離線", en: "Offline", ja: "オフライン" })}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "客户 / 线索", "zh-TW": "客戶 / 線索", en: "Customers / Leads", ja: "顧客 / リード" })}: <strong className="control-center__strong">{scopedCustomers.length} / {scopedLeads.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "工单 / 内容任务", "zh-TW": "工單 / 內容任務", en: "Tickets / Content Tasks", ja: "チケット / コンテンツ" })}: <strong className="control-center__strong">{scopedTickets.length} / {scopedContentTasks.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "渠道会话", "zh-TW": "渠道會話", en: "Channel Sessions", ja: "チャネル会話" })}: <strong className="control-center__strong">{scopedChannelSessions.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "运行代理 / 平台", "zh-TW": "運行代理 / 平台", en: "Running Agents / Platforms", ja: "稼働 Agent / プラットフォーム" })}: <strong className="control-center__strong">{runningAgents} / {enabledPlatforms}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "提供方", "zh-TW": "提供方", en: "Providers", ja: "プロバイダー" })}: <strong className="control-center__strong">{providers.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "待人工处理", "zh-TW": "待人工處理", en: "Human Queue", ja: "手動対応待ち" })}: <strong className="control-center__strong">{pendingApprovals + pendingReplySessions + (manualTakeoverRequired ? 1 : 0)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspacePreferences() {
  const locale = useStore(s => s.locale);
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const leftOpen = useStore(s => s.leftOpen);
  const rightOpen = useStore(s => s.rightOpen);

  return (
    <div className="control-center">
      <div className="control-center__panel">
        <div className="control-center__panel-title">{pickLocaleText(locale, {
          "zh-CN": "界面主题",
          "zh-TW": "介面主題",
          en: "Shell Theme",
          ja: "シェルテーマ",
        })}</div>
        <div className="control-center__theme-list">
          {([
            {
              id: "dark",
              label: pickLocaleText(locale, { "zh-CN": "深海", "zh-TW": "深海", en: "Deep Sea", ja: "深海" }),
            },
            {
              id: "coral",
              label: pickLocaleText(locale, { "zh-CN": "珊瑚", "zh-TW": "珊瑚", en: "Coral", ja: "コーラル" }),
            },
            {
              id: "jade",
              label: pickLocaleText(locale, { "zh-CN": "玉石", "zh-TW": "玉石", en: "Jade", ja: "ジェイド" }),
            },
          ] as const).map(option => (
            <button
              key={option.id}
              type="button"
              className={`btn-ghost control-center__theme-option ${theme === option.id ? "is-active" : ""}`}
              onClick={() => setTheme(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "桌面快捷键",
            "zh-TW": "桌面快捷鍵",
            en: "Desktop Shortcuts",
            ja: "デスクトップショートカット",
          })}</div>
          <div className="control-center__list">
            <div><strong>Ctrl/Cmd + N</strong> {pickLocaleText(locale, {
              "zh-CN": "创建新会话并跳到任务模式",
              "zh-TW": "建立新會話並跳到任務模式",
              en: "Create a new session and jump into task mode",
              ja: "新しいセッションを作成してタスクモードへ移動",
            })}</div>
            <div><strong>Ctrl/Cmd + B</strong> {pickLocaleText(locale, {
              "zh-CN": "切换左侧会话栏",
              "zh-TW": "切換左側會話欄",
              en: "Toggle the left session rail",
              ja: "左側セッションレールを切り替え",
            })}</div>
            <div><strong>Ctrl/Cmd + Shift + B</strong> {pickLocaleText(locale, {
              "zh-CN": "切换右侧活动栏",
              "zh-TW": "切換右側活動欄",
              en: "Toggle the right activity rail",
              ja: "右側アクティビティレールを切り替え",
            })}</div>
            <div><strong>Ctrl/Cmd + R</strong> {pickLocaleText(locale, {
              "zh-CN": "当链路掉线时重连 WebSocket",
              "zh-TW": "當鏈路掉線時重連 WebSocket",
              en: "Reconnect WebSocket when the link drops",
              ja: "接続が切れたときに WebSocket を再接続",
            })}</div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "侧栏状态",
            "zh-TW": "側欄狀態",
            en: "Sidebar State",
            ja: "サイドバー状態",
          })}</div>
          <div className="control-center__list">
            <div>{pickLocaleText(locale, { "zh-CN": "左侧栏", "zh-TW": "左側欄", en: "Left rail", ja: "左レール" })}: <strong className="control-center__strong">{leftOpen ? uiText.common.expanded : uiText.common.collapsed}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "右侧栏", "zh-TW": "右側欄", en: "Right rail", ja: "右レール" })}: <strong className="control-center__strong">{rightOpen ? uiText.common.expanded : uiText.common.collapsed}</strong></div>
            <div>{pickLocaleText(locale, {
              "zh-CN": "这个壳层保持桌面优先逻辑，同时在视口变窄时也能干净地折叠。",
              "zh-TW": "這個殼層保持桌面優先邏輯，同時在視口變窄時也能乾淨地折疊。",
              en: "The shell keeps desktop-first behavior and still collapses cleanly as the viewport shrinks.",
              ja: "このシェルはデスクトップ優先のまま、表示幅が狭くなってもきれいに折りたためます。",
            })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutControlCenter() {
  const locale = useStore(s => s.locale);
  return (
    <div className="control-center">
      <div className="control-center__panel">
        <div className="control-center__panel-title">{pickLocaleText(locale, {
          "zh-CN": "已带入的能力",
          "zh-TW": "已帶入的能力",
          en: "Already Brought In",
          ja: "すでに取り込んだ能力",
        })}</div>
        <div className="control-center__list control-center__list--dense">
          <div>{pickLocaleText(locale, {
            "zh-CN": "1. 全局会话侧栏，避免上下文埋在单一页面里。",
            "zh-TW": "1. 全域會話側欄，避免上下文埋在單一頁面裡。",
            en: "1. A global session rail so context is not buried inside a single page.",
            ja: "1. 文脈が単一ページに埋もれないよう、グローバルなセッションレールを追加。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "2. 欢迎工作台、快速开始区和更清晰的桌面壳层布局。",
            "zh-TW": "2. 歡迎工作台、快速開始區與更清晰的桌面殼層佈局。",
            en: "2. A welcome workbench, quick-start surface, and clearer desktop shell layout.",
            ja: "2. ウェルカム作業台、クイックスタート面、より明確なデスクトップシェル配置。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "3. 状态栏与重连控制，让连接状态更可见。",
            "zh-TW": "3. 狀態欄與重連控制，讓連線狀態更可見。",
            en: "3. Status bar and reconnect controls so connection state is more visible.",
            ja: "3. 接続状態を見やすくするためのステータスバーと再接続操作。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "4. 带预览、标签、引用架、看板、上下文包与便签卡的 Desk 工作区。",
            "zh-TW": "4. 帶預覽、標籤、引用架、看板、上下文包與便箋卡的 Desk 工作區。",
            en: "4. A Desk workspace with previews, tabs, reference shelf, board, context packs, and note cards.",
            ja: "4. プレビュー、タブ、参照棚、ボード、コンテキストパック、ノートカードを備えた Desk ワークスペース。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "5. Skills Center，用于跨 agent 能力覆盖与快速分发。",
            "zh-TW": "5. Skills Center，用於跨 agent 能力覆蓋與快速分發。",
            en: "5. A Skills Center for cross-agent capability coverage and quick skill distribution.",
            ja: "5. agent 横断の能力整理と配布のための Skills Center。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "6. Plugins Center，用于扩展可见性、权限标签和本地插件包。",
            "zh-TW": "6. Plugins Center，用於擴展可見性、權限標籤與本地插件包。",
            en: "6. A Plugins Center for extension visibility, permission labels, and local plugin packs.",
            ja: "6. 拡張の可視化、権限ラベル、ローカルプラグインを扱う Plugins Center。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "7. Channels Center，复用现有平台配置做多平台桥接可见性。",
            "zh-TW": "7. Channels Center，復用現有平台配置做多平台橋接可見性。",
            en: "7. A Channels Center for multi-platform bridge visibility using the existing platform configs.",
            ja: "7. 既存のプラットフォーム設定を使って可視化する Channels Center。",
          })}</div>
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">{pickLocaleText(locale, {
          "zh-CN": "尚未移植的部分",
          "zh-TW": "尚未移植的部分",
          en: "Still Not Ported",
          ja: "まだ移植していない部分",
        })}</div>
        <div className="control-center__copy">
          {pickLocaleText(locale, {
            "zh-CN": "OpenHanako 仍然有更深的插件页、桥接频道、更丰富的产物流以及更大的后台服务模型。这些部分需要更多后端协议和生命周期工作，所以我们选择逐步带入，而不是一次性硬塞进当前应用。",
            "zh-TW": "OpenHanako 仍然有更深的插件頁、橋接頻道、更豐富的產物流以及更大的後台服務模型。這些部分需要更多後端協議與生命週期工作，所以我們選擇逐步帶入，而不是一次性硬塞進目前應用。",
            en: "OpenHanako still has deeper plugin pages, bridge channels, richer artifact workflows, and a larger background services model. Those pieces need more backend protocol and lifecycle work, so we are bringing them in gradually instead of forcing them into the current app all at once.",
            ja: "OpenHanako には、より深いプラグイン画面、ブリッジチャネル、より豊かな成果物流れ、さらに大きなバックグラウンドサービスモデルがまだあります。これらはバックエンドのプロトコルやライフサイクル整備が必要なため、一度に押し込まず段階的に取り込んでいます。",
          })}
        </div>
      </div>
    </div>
  );
}
