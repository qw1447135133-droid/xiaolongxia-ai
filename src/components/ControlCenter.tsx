"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import { ArtifactsCenter } from "./ArtifactsCenter";
import { ChannelsCenter } from "./ChannelsCenter";
import { ExecutionCenter } from "./ExecutionCenter";
import { PluginsCenter } from "./PluginsCenter";
import { RemoteOpsCenter } from "./RemoteOpsCenter";
import { SettingsPanel } from "./SettingsPanel";
import { SkillsCenter } from "./SkillsCenter";
import { WorkflowCenter } from "./WorkflowCenter";

type SectionId = "overview" | "remote" | "execution" | "workspace" | "workflow" | "skills" | "plugins" | "artifacts" | "channels" | "settings" | "about";

export function ControlCenter() {
  const [section, setSection] = useState<SectionId>("overview");

  const sections: Array<{ id: SectionId; label: string; hint: string }> = [
    { id: "overview", label: "Overview", hint: "Workbench status and shell structure" },
    { id: "remote", label: "Remote Ops", hint: "Digital workforce readiness and gaps" },
    { id: "execution", label: "Execution Center", hint: "Tracked runs, steps, and outcomes" },
    { id: "workspace", label: "Workspace", hint: "Theme, sidebars, and shortcuts" },
    { id: "workflow", label: "Workflow Center", hint: "Prebuilt flow templates and staged briefs" },
    { id: "skills", label: "Skills Center", hint: "Cross-agent capability board" },
    { id: "plugins", label: "Plugins Center", hint: "Extension board and local plugin toggles" },
    { id: "artifacts", label: "Artifacts Center", hint: "Unified output shelf and result board" },
    { id: "channels", label: "Channels Center", hint: "Bridge-style platform overview" },
    { id: "settings", label: "Detailed Settings", hint: "Agents, models, and platforms" },
    { id: "about", label: "About", hint: "Borrowed ideas and remaining gaps" },
  ];

  return (
    <div className="settings-shell">
      <aside className="settings-shell__nav">
        <div className="settings-shell__nav-head">
          <div className="settings-shell__eyebrow">Control Center</div>
          <div className="settings-shell__title">OpenHanako-inspired desktop control surface</div>
        </div>

        <div className="settings-shell__nav-list">
          {sections.map(item => (
            <button
              key={item.id}
              type="button"
              className={`settings-shell__nav-item ${section === item.id ? "is-active" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="settings-shell__content">
        {section === "overview" && <ControlOverview />}
        {section === "remote" && <RemoteOpsCenter />}
        {section === "execution" && <ExecutionCenter />}
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

function ControlOverview() {
  const agents = useStore(s => s.agents);
  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const chatSessions = useStore(s => s.chatSessions);
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const activeSessionId = useStore(s => s.activeSessionId);

  const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null;
  const scopedDeskNotes = filterByProjectScope(workspaceDeskNotes, activeSession ?? {});
  const scopedSavedBundles = filterByProjectScope(workspaceSavedBundles, activeSession ?? {});
  const scopedProjectMemories = filterByProjectScope(workspaceProjectMemories, activeSession ?? {});

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
