"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getRunProjectScopeKey, getSessionProjectLabel } from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { ControlCenterSectionId, TeamOperatingTemplateId, UiLocale } from "@/store/types";
import { formatAutomationModeLabel, getUiText, pickLocaleText } from "@/lib/ui-locale";
import { ArtifactsCenter } from "./ArtifactsCenter";
import { BusinessEntitiesCenter } from "./BusinessEntitiesCenter";
import { ChannelsCenter } from "./ChannelsCenter";
import { ExecutionCenter } from "./ExecutionCenter";
import { LaunchReadinessPanel } from "./LaunchReadinessPanel";
import { NativeAppsCenter } from "./NativeAppsCenter";
import { PluginsCenter } from "./PluginsCenter";
import { RemoteOpsCenter } from "./RemoteOpsCenter";
import { SettingsPanel } from "./SettingsPanel";
import { SkillsCenter } from "./SkillsCenter";

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
      id: "readiness",
      label: pickLocaleText(locale, { "zh-CN": "上线准备度", "zh-TW": "上線準備度", en: "Launch Readiness", ja: "公開準備度" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "上线阻断、恢复项与发布风险",
        "zh-TW": "上線阻斷、恢復項與發布風險",
        en: "Go-live blockers, recovery, and launch risks",
        ja: "公開前の阻害要因、復旧項目、リスク",
      }),
    },
    {
      id: "entities",
      label: pickLocaleText(locale, { "zh-CN": "业务实体", "zh-TW": "業務實體", en: "Business Entities", ja: "業務エンティティ" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "客户、线索、工单、内容任务、会话",
        "zh-TW": "客戶、線索、工單、內容任務、會話",
        en: "Customers, leads, tickets, content tasks, sessions",
        ja: "顧客、リード、チケット、コンテンツ、会話",
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
      id: "execution",
      label: pickLocaleText(locale, { "zh-CN": "执行日志", "zh-TW": "執行日誌", en: "Execution Log", ja: "実行ログ" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "查看运行轨迹、失败与恢复",
        "zh-TW": "查看運行軌跡、失敗與恢復",
        en: "Trace runs, failures, and recovery",
        ja: "実行履歴、失敗、復旧を確認",
      }),
    },
    {
      id: "desktop",
      label: pickLocaleText(locale, { "zh-CN": "桌面应用", "zh-TW": "桌面應用", en: "Desktop Apps", ja: "デスクトップアプリ" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "启动本机程序与原生工具",
        "zh-TW": "啟動本機程式與原生工具",
        en: "Launch local programs and native tools",
        ja: "ローカルアプリとネイティブツールを起動",
      }),
    },
    {
      id: "workspace",
      label: pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "主题、侧栏与快捷方式",
        "zh-TW": "主題、側欄與快捷方式",
        en: "Theme, sidebars, and shortcuts",
        ja: "テーマ、サイドバー、ショートカット",
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
      id: "artifacts",
      label: pickLocaleText(locale, { "zh-CN": "产物中心", "zh-TW": "產物中心", en: "Artifacts Center", ja: "成果物センター" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "统一结果面板与输出架",
        "zh-TW": "統一結果面板與輸出架",
        en: "Unified output shelf and result board",
        ja: "統合出力シェルフと結果ボード",
      }),
    },
    {
      id: "channels",
      label: pickLocaleText(locale, { "zh-CN": "渠道中心", "zh-TW": "渠道中心", en: "Channels Center", ja: "チャネルセンター" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "桥接式平台与消息入口概览",
        "zh-TW": "橋接式平台與消息入口概覽",
        en: "Bridge-style platform overview",
        ja: "ブリッジ型プラットフォーム概要",
      }),
    },
    {
      id: "settings",
      label: pickLocaleText(locale, { "zh-CN": "详细设置", "zh-TW": "詳細設定", en: "Detailed Settings", ja: "詳細設定" }),
      hint: pickLocaleText(locale, {
        "zh-CN": "Agents、模型与平台参数",
        "zh-TW": "Agents、模型與平台參數",
        en: "Agents, models, and platforms",
        ja: "Agents、モデル、プラットフォーム設定",
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
          <ControlOverview
            activeTemplateId={activeTeamOperatingTemplateId}
            onSelectSection={setActiveControlCenterSection}
          />
        )}
        {section === "readiness" && <ReadinessCenter onSelectSection={setActiveControlCenterSection} />}
        {section === "entities" && <BusinessEntitiesCenter />}
        {section === "remote" && <RemoteOpsCenter />}
        {section === "execution" && <ExecutionCenter />}
        {section === "desktop" && <NativeAppsCenter />}
        {section === "workspace" && <WorkspacePreferences />}
        {section === "skills" && <SkillsCenter />}
        {section === "plugins" && <PluginsCenter />}
        {section === "artifacts" && <ArtifactsCenter />}
        {section === "channels" && <ChannelsCenter />}
        {section === "settings" && <SettingsPanel />}
        {section === "about" && <AboutControlCenter />}
      </div>
    </div>
  );
}

function ControlOverview({
  activeTemplateId,
  onSelectSection,
}: {
  activeTemplateId: TeamOperatingTemplateId | null;
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
      actionLabel: pickLocaleText(locale, { "zh-CN": "去执行日志", "zh-TW": "去執行日誌", en: "Open Execution Log", ja: "実行ログを開く" }),
      section: "execution" as const,
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

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">
          {pickLocaleText(locale, { "zh-CN": "总览", "zh-TW": "總覽", en: "Overview", ja: "概要" })}
        </div>
        <div className="control-center__hero-title">
          {pickLocaleText(locale, {
            "zh-CN": "这里只保留需要人工判断和接管的事项",
            "zh-TW": "這裡只保留需要人工判斷與接管的事項",
            en: "Only items that need human judgment or takeover stay here",
            ja: "ここには人手判断や引き継ぎが必要な項目だけを残します",
          })}
        </div>
        <div className="control-center__hero-copy">
          {pickLocaleText(locale, {
            "zh-CN": "自动运行中的任务和内部策略不再堆在这里，主面板只展示待审批、待恢复、待回复和桌面接管。",
            "zh-TW": "自動運行中的任務和內部策略不再堆在這裡，主面板只顯示待審批、待恢復、待回覆和桌面接管。",
            en: "Auto-running tasks and internal strategy details are hidden from this surface. The main panel only shows approvals, recovery, replies, and desktop takeover.",
            ja: "自動実行中のタスクや内部戦略はここから外し、主面には承認・復旧・返信・デスクトップ引き継ぎだけを表示します。",
          })}
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          {pickLocaleText(locale, {
            "zh-CN": "当前项目范围",
            "zh-TW": "當前專案範圍",
            en: "Current project scope",
            ja: "現在のプロジェクト範囲",
          })}: {activeSession ? getSessionProjectLabel(activeSession) : uiText.common.generalProject}
        </div>
      </div>

      <div className="control-center__stats">
        {[
          { label: pickLocaleText(locale, { "zh-CN": "待审批", "zh-TW": "待審批", en: "Pending Approvals", ja: "承認待ち" }), value: pendingApprovals, color: pendingApprovals > 0 ? "var(--warning)" : "var(--success)" },
          { label: pickLocaleText(locale, { "zh-CN": "恢复队列", "zh-TW": "恢復佇列", en: "Recovery Queue", ja: "復旧キュー" }), value: recoveryRuns, color: recoveryRuns > 0 ? "var(--warning)" : "var(--success)" },
          { label: pickLocaleText(locale, { "zh-CN": "待回复会话", "zh-TW": "待回覆會話", en: "Pending Replies", ja: "返信待ち" }), value: pendingReplySessions, color: pendingReplySessions > 0 ? "#60a5fa" : "var(--success)" },
          { label: pickLocaleText(locale, { "zh-CN": "桌面接管", "zh-TW": "桌面接管", en: "Desktop Takeover", ja: "デスクトップ引き継ぎ" }), value: manualTakeoverRequired ? pickLocaleText(locale, { "zh-CN": "待处理", "zh-TW": "待處理", en: "Required", ja: "対応待ち" }) : pickLocaleText(locale, { "zh-CN": "正常", "zh-TW": "正常", en: "Clear", ja: "正常" }), color: manualTakeoverRequired ? "#ef4444" : "var(--success)" },
        ].map(item => (
          <div key={item.label} className="control-center__stat-card">
            <div className="control-center__stat-label">{item.label}</div>
            <div className="control-center__stat-value" style={{ color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "现在需要你看的",
            "zh-TW": "現在需要你看的",
            en: "What Needs Your Attention",
            ja: "今見るべき項目",
          })}</div>
          {manualFocusCards.length > 0 ? (
            <div className="control-center__approval-list">
              {manualFocusCards.map(card => (
                <article key={card.id} className="control-center__approval-card">
                  <div className="control-center__action-eyebrow">{card.eyebrow}</div>
                  <div className="control-center__panel-title" style={{ fontSize: 16 }}>{card.title}</div>
                  <div className="control-center__copy">{card.copy}</div>
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
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">{pickLocaleText(locale, {
            "zh-CN": "项目快照",
            "zh-TW": "專案快照",
            en: "Project Snapshot",
            ja: "プロジェクト概要",
          })}</div>
          <div className="control-center__list control-center__list--dense">
            <div>{pickLocaleText(locale, { "zh-CN": "当前项目", "zh-TW": "目前專案", en: "Current Project", ja: "現在のプロジェクト" })}: <strong className="control-center__strong">{activeSession ? getSessionProjectLabel(activeSession) : uiText.common.generalProject}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "渠道会话", "zh-TW": "渠道會話", en: "Channel Sessions", ja: "チャネル会話" })}: <strong className="control-center__strong">{scopedChannelSessions.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "客户 / 线索", "zh-TW": "客戶 / 線索", en: "Customers / Leads", ja: "顧客 / リード" })}: <strong className="control-center__strong">{scopedCustomers.length} / {scopedLeads.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "工单 / 内容任务", "zh-TW": "工單 / 內容任務", en: "Tickets / Content Tasks", ja: "チケット / コンテンツ" })}: <strong className="control-center__strong">{scopedTickets.length} / {scopedContentTasks.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "上下文资产", "zh-TW": "上下文資產", en: "Context Assets", ja: "コンテキスト資産" })}: <strong className="control-center__strong">{scopedDeskNotes.length + scopedSavedBundles.length + scopedProjectMemories.length + scopedKnowledgeDocs.length}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "运行代理 / 平台", "zh-TW": "運行代理 / 平台", en: "Running Agents / Platforms", ja: "稼働 Agent / プラットフォーム" })}: <strong className="control-center__strong">{runningAgents} / {enabledPlatforms}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "实时链路", "zh-TW": "即時鏈路", en: "Realtime Link", ja: "リアルタイム接続" })}: <strong className="control-center__strong">{wsStatus === "connected" ? pickLocaleText(locale, { "zh-CN": "在线", "zh-TW": "在線", en: "Online", ja: "オンライン" }) : pickLocaleText(locale, { "zh-CN": "离线", "zh-TW": "離線", en: "Offline", ja: "オフライン" })}</strong></div>
            <div>{pickLocaleText(locale, { "zh-CN": "提供方", "zh-TW": "提供方", en: "Providers", ja: "プロバイダー" })}: <strong className="control-center__strong">{providers.length}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadinessCenter({
  onSelectSection,
}: {
  onSelectSection: (section: ControlCenterSectionId) => void;
}) {
  return (
    <div className="control-center">
      <LaunchReadinessPanel onSelectSection={onSelectSection} />
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
            "zh-CN": "7. Artifacts Center，把任务结果、图片、会议摘要和 Desk 上下文统一收口。",
            "zh-TW": "7. Artifacts Center，把任務結果、圖片、會議摘要與 Desk 上下文統一收口。",
            en: "7. An Artifacts Center for task results, images, meeting summaries, and desk context in one output shelf.",
            ja: "7. タスク結果、画像、会議要約、Desk 文脈をひとつにまとめる Artifacts Center。",
          })}</div>
          <div>{pickLocaleText(locale, {
            "zh-CN": "8. Channels Center，复用现有平台配置做多平台桥接可见性。",
            "zh-TW": "8. Channels Center，復用現有平台配置做多平台橋接可見性。",
            en: "8. A Channels Center for multi-platform bridge visibility using the existing platform configs.",
            ja: "8. 既存のプラットフォーム設定を使って可視化する Channels Center。",
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
