"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { getTeamOperatingTemplate, TEAM_OPERATING_SURFACES } from "@/store/types";
import type { ControlCenterSectionId, TeamOperatingTemplateId } from "@/store/types";
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
import { WorkflowCenter } from "./WorkflowCenter";

export function ControlCenter() {
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
    const baseSections: Array<{ id: ControlCenterSectionId; label: string; hint: string }> = [
      { id: "overview", label: "Overview", hint: "Workbench status and shell structure" },
      { id: "readiness", label: "Launch Readiness", hint: "Go-live blockers, recovery, and launch risks" },
      { id: "entities", label: "Business Entities", hint: "Customers, leads, tickets, content, sessions" },
      { id: "remote", label: "Remote Ops", hint: "Digital workforce readiness and gaps" },
      { id: "execution", label: "Execution Center", hint: "Tracked runs, steps, and outcomes" },
      { id: "desktop", label: "Desktop Apps", hint: "Launch local programs and native tools" },
      { id: "workspace", label: "Workspace", hint: "Theme, sidebars, and shortcuts" },
      { id: "workflow", label: "Workflow Center", hint: "Prebuilt flow templates and staged briefs" },
      { id: "skills", label: "Skills Center", hint: "Cross-agent capability board" },
      { id: "plugins", label: "Plugins Center", hint: "Extension board and local plugin toggles" },
      { id: "artifacts", label: "Artifacts Center", hint: "Unified output shelf and result board" },
      { id: "channels", label: "Channels Center", hint: "Bridge-style platform overview" },
      { id: "settings", label: "Detailed Settings", hint: "Agents, models, and platforms" },
      { id: "about", label: "About", hint: "Borrowed ideas and remaining gaps" },
    ];

    if (!activeSurface) return baseSections;

    const priority = new Set<ControlCenterSectionId>(["overview", ...activeSurface.recommendedSectionIds]);
    return [
      ...baseSections.filter(item => priority.has(item.id)),
      ...baseSections.filter(item => !priority.has(item.id)),
    ];
  }, [activeSurface]);
  const activeSectionMeta = sections.find(item => item.id === section) ?? sections[0];

  return (
    <div className="settings-shell">
      <aside className="settings-shell__nav">
        <div className="settings-shell__nav-head">
          <div className="settings-shell__eyebrow">Control Center</div>
          <div className="settings-shell__title">OpenHanako-inspired desktop control surface</div>
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
                当前模式 · {activeTemplate.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {activeSurface.statusCopy}
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
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="settings-shell__content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Control Path
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {activeSectionMeta?.label ?? "Overview"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {activeSectionMeta?.hint ?? "Workbench status and shell structure"}
            </div>
          </div>

          {section !== "overview" ? (
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: 12, padding: "8px 14px" }}
              onClick={() => setActiveControlCenterSection("overview")}
            >
              返回总览
            </button>
          ) : null}
        </div>

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
        {section === "workflow" && <WorkflowCenter />}
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
  const agents = useStore(s => s.agents);
  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const chatSessions = useStore(s => s.chatSessions);
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const semanticKnowledgeDocs = useStore(s => s.semanticKnowledgeDocs);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const activeSessionId = useStore(s => s.activeSessionId);

  const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null;
  const scopedDeskNotes = filterByProjectScope(workspaceDeskNotes, activeSession ?? {});
  const scopedSavedBundles = filterByProjectScope(workspaceSavedBundles, activeSession ?? {});
  const scopedProjectMemories = filterByProjectScope(workspaceProjectMemories, activeSession ?? {});
  const scopedKnowledgeDocs = filterByProjectScope(semanticKnowledgeDocs, activeSession ?? {});
  const scopedCustomers = filterByProjectScope(businessCustomers, activeSession ?? {});
  const scopedLeads = filterByProjectScope(businessLeads, activeSession ?? {});
  const scopedTickets = filterByProjectScope(businessTickets, activeSession ?? {});
  const scopedContentTasks = filterByProjectScope(businessContentTasks, activeSession ?? {});
  const scopedChannelSessions = filterByProjectScope(businessChannelSessions, activeSession ?? {});
  const activeTemplate = activeTemplateId ? getTeamOperatingTemplate(activeTemplateId) : null;
  const activeSurface = activeTemplateId ? TEAM_OPERATING_SURFACES[activeTemplateId] : null;

  const runningAgents = Object.values(agents).filter(agent => agent.status === "running").length;
  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled).length;

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">
          Overview
        </div>
        <div className="control-center__hero-title">
          The app now behaves more like a desktop workbench than a flat settings page
        </div>
        <div className="control-center__hero-copy">
          We have already moved session history, desk context, reference boards, note cards, and capability controls into a shell that feels closer to an Electron-first agent workspace.
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          Current project scope: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </div>
      </div>

      <LaunchReadinessPanel onSelectSection={onSelectSection} />

      {activeTemplate && activeSurface ? (
        <div
          className="control-center__panel"
          style={{
            background: "linear-gradient(135deg, rgba(var(--accent-rgb), 0.12), rgba(255,255,255,0.02))",
            borderColor: "rgba(var(--accent-rgb), 0.24)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div className="control-center__panel-title">
                当前团队模式 · {activeTemplate.label}
              </div>
              <div className="control-center__copy">{activeTemplate.description}</div>
              <div className="control-center__copy">{activeSurface.statusCopy}</div>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid rgba(var(--accent-rgb), 0.24)",
                background: "rgba(var(--accent-rgb), 0.08)",
                color: "var(--accent)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              推荐工作面 · {activeSurface.statusLabel}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
            {activeSurface.recommendedSectionIds.map(sectionId => {
              const labelMap: Record<ControlCenterSectionId, string> = {
                overview: "Overview",
                readiness: "Launch Readiness",
                entities: "Business Entities",
                remote: "Remote Ops",
                execution: "Execution Center",
                desktop: "Desktop Apps",
                workspace: "Workspace",
                workflow: "Workflow Center",
                skills: "Skills Center",
                plugins: "Plugins Center",
                artifacts: "Artifacts Center",
                channels: "Channels Center",
                settings: "Detailed Settings",
                about: "About",
              };

              return (
                <button
                  key={sectionId}
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "12px 14px", textAlign: "left" }}
                  onClick={() => onSelectSection(sectionId)}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{labelMap[sectionId]}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    打开这个面板，优先处理当前模式最该盯的工作区块。
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="control-center__stats">
        {[
          { label: "Agents", value: Object.keys(agents).length, color: "var(--accent)" },
          { label: "Running Now", value: runningAgents, color: "var(--warning)" },
          { label: "Providers", value: providers.length, color: "var(--success)" },
          { label: "Platforms", value: enabledPlatforms, color: "#7dd3fc" },
          { label: "Sessions", value: chatSessions.length, color: "#fda4af" },
          { label: "Desk Notes", value: scopedDeskNotes.length, color: "#fbbf24" },
          { label: "Context Packs", value: scopedSavedBundles.length, color: "#c4b5fd" },
          { label: "Project Memory", value: scopedProjectMemories.length, color: "#93c5fd" },
          { label: "Knowledge Docs", value: scopedKnowledgeDocs.length, color: "#38bdf8" },
          { label: "Customers", value: scopedCustomers.length, color: "#60a5fa" },
          { label: "Leads", value: scopedLeads.length, color: "#34d399" },
          { label: "Tickets", value: scopedTickets.length, color: "#f59e0b" },
          { label: "Content Tasks", value: scopedContentTasks.length, color: "#c084fc" },
          { label: "Channel Sessions", value: scopedChannelSessions.length, color: "#22c55e" },
          { label: "Meeting Summary", value: latestMeetingRecord ? "Ready" : "None", color: "#a7f3d0" },
        ].map(item => (
          <div key={item.label} className="control-center__stat-card">
            <div className="control-center__stat-label">{item.label}</div>
            <div className="control-center__stat-value" style={{ color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadinessCenter({
  onSelectSection,
}: {
  onSelectSection: (section: ControlCenterSectionId) => void;
}) {
  const platformConfigs = useStore(s => s.platformConfigs);
  const executionRuns = useStore(s => s.executionRuns);
  const businessApprovals = useStore(s => s.businessApprovals);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const desktopInputSession = useStore(s => s.desktopInputSession);

  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled);
  const connectedPlatforms = enabledPlatforms.filter(platform =>
    platform.status === "connected" || platform.status === "degraded",
  );
  const recoveryQueue = executionRuns.filter(run =>
    run.status === "failed" || (run.recoveryState && run.recoveryState !== "none"),
  ).length;
  const pendingApprovals = businessApprovals.filter(item => item.status === "pending").length;
  const publishFailures = businessOperationLogs.filter(log =>
    log.eventType === "publish" && log.status === "failed",
  ).length;
  const blockedDispatches = businessOperationLogs.filter(log =>
    (log.eventType === "dispatch" || log.eventType === "desktop") && (log.status === "blocked" || log.status === "failed"),
  ).length;
  const platformAlerts = enabledPlatforms.filter(platform =>
    !["connected", "configured", "degraded", "syncing"].includes(platform.status),
  ).length;

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">Launch Readiness</div>
        <div className="control-center__hero-title">
          把上线前阻断项集中看，不再分散在执行、连接器和远程值守里
        </div>
        <div className="control-center__hero-copy">
          这一页只做一件事：把当前项目距离“可托管、可监督、可恢复”的差距一次摊开，方便上线前最后收口。
        </div>
      </div>

      <LaunchReadinessPanel onSelectSection={onSelectSection} />

      <div className="control-center__stats">
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">平台告警</div>
          <div className="control-center__stat-value" style={{ color: "#fb7185" }}>{platformAlerts}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">已连接平台</div>
          <div className="control-center__stat-value" style={{ color: "#22c55e" }}>
            {connectedPlatforms.length}/{enabledPlatforms.length}
          </div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">恢复队列</div>
          <div className="control-center__stat-value" style={{ color: "#f59e0b" }}>{recoveryQueue}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">待审批</div>
          <div className="control-center__stat-value" style={{ color: "#ef4444" }}>{pendingApprovals}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">发布失败</div>
          <div className="control-center__stat-value" style={{ color: "#c084fc" }}>{publishFailures}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">阻断派发</div>
          <div className="control-center__stat-value" style={{ color: "#7dd3fc" }}>{blockedDispatches}</div>
        </div>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">当前托管模式</div>
          <div className="control-center__list control-center__list--dense">
            <div>自动化模式: <strong className="control-center__strong">{automationMode}</strong></div>
            <div>自动化暂停: <strong className="control-center__strong">{automationPaused ? "是" : "否"}</strong></div>
            <div>远程值守: <strong className="control-center__strong">{remoteSupervisorEnabled ? "开启" : "关闭"}</strong></div>
            <div>桌面接管: <strong className="control-center__strong">{desktopInputSession.state}</strong></div>
          </div>
          <div className="control-center__quick-actions">
            <button type="button" className="btn-ghost" onClick={() => onSelectSection("remote")}>
              去远程值守
            </button>
            <button type="button" className="btn-ghost" onClick={() => onSelectSection("desktop")}>
              去桌面接管
            </button>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">最后收口建议</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 平台告警不为 0 时，优先去 Channels Center 处理 webhook、鉴权和限流问题。</div>
            <div>2. 恢复队列不清空时，不建议直接进入全自动托管。</div>
            <div>3. 审批积压或发布失败仍存在时，应由 Remote Ops 先做人工裁决。</div>
            <div>4. 桌面接管若仍是 `manual-required`，说明真人兜底链路还在前台。</div>
          </div>
          <div className="control-center__quick-actions">
            <button type="button" className="btn-ghost" onClick={() => onSelectSection("channels")}>
              去连接器看板
            </button>
            <button type="button" className="btn-ghost" onClick={() => onSelectSection("execution")}>
              去执行恢复
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspacePreferences() {
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const leftOpen = useStore(s => s.leftOpen);
  const rightOpen = useStore(s => s.rightOpen);

  return (
    <div className="control-center">
      <div className="control-center__panel">
        <div className="control-center__panel-title">Shell Theme</div>
        <div className="control-center__theme-list">
          {([
            { id: "dark", label: "Deep Sea" },
            { id: "coral", label: "Coral" },
            { id: "jade", label: "Jade" },
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
          <div className="control-center__panel-title">Desktop Shortcuts</div>
          <div className="control-center__list">
            <div><strong>Ctrl/Cmd + N</strong> Create a new session and jump into task mode</div>
            <div><strong>Ctrl/Cmd + B</strong> Toggle the left session rail</div>
            <div><strong>Ctrl/Cmd + Shift + B</strong> Toggle the right activity rail</div>
            <div><strong>Ctrl/Cmd + R</strong> Reconnect WebSocket when the link drops</div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">Sidebar State</div>
          <div className="control-center__list">
            <div>Left rail: <strong className="control-center__strong">{leftOpen ? "Expanded" : "Collapsed"}</strong></div>
            <div>Right rail: <strong className="control-center__strong">{rightOpen ? "Expanded" : "Collapsed"}</strong></div>
            <div>The shell keeps desktop-first behavior and still collapses cleanly as the viewport shrinks.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutControlCenter() {
  return (
    <div className="control-center">
      <div className="control-center__panel">
        <div className="control-center__panel-title">Already Brought In</div>
        <div className="control-center__list control-center__list--dense">
          <div>1. Global session rail so context is not buried inside a single page.</div>
          <div>2. Welcome workbench, quick-start surface, and clearer desktop shell layout.</div>
          <div>3. Status bar and reconnect controls so connection state is more visible.</div>
          <div>4. Desk workspace with previews, tabs, reference shelf, board, context packs, and note cards.</div>
          <div>5. Skills Center for cross-agent capability coverage and quick skill distribution.</div>
          <div>6. Plugins Center for extension visibility, permission labels, and local plugin packs.</div>
          <div>7. Artifacts Center for task results, images, meeting summaries, and desk context in one output shelf.</div>
          <div>8. Channels Center for multi-platform bridge visibility using the existing platform configs.</div>
          <div>9. Workflow Center for staging reusable multi-step briefs into the main execution flow.</div>
        </div>
      </div>

      <div className="control-center__panel">
        <div className="control-center__panel-title">Still Not Ported</div>
        <div className="control-center__copy">
          OpenHanako still has deeper plugin pages, bridge channels, richer artifact workflows, and a larger background services model. Those pieces need more backend protocol and lifecycle work, so we are bringing them in gradually instead of forcing them into the current app all at once.
        </div>
      </div>
    </div>
  );
}
