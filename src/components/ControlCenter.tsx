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
