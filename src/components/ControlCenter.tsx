"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { ArtifactsCenter } from "./ArtifactsCenter";
import { ChannelsCenter } from "./ChannelsCenter";
import { PluginsCenter } from "./PluginsCenter";
import { SettingsPanel } from "./SettingsPanel";
import { SkillsCenter } from "./SkillsCenter";
import { WorkflowCenter } from "./WorkflowCenter";

type SectionId = "overview" | "workspace" | "workflow" | "skills" | "plugins" | "artifacts" | "channels" | "settings" | "about";

export function ControlCenter() {
  const [section, setSection] = useState<SectionId>("overview");

  const sections: Array<{ id: SectionId; label: string; hint: string }> = [
    { id: "overview", label: "Overview", hint: "Workbench status and shell structure" },
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

  const runningAgents = Object.values(agents).filter(agent => agent.status === "running").length;
  const enabledPlatforms = Object.values(platformConfigs).filter(platform => platform.enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Overview
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          The app now behaves more like a desktop workbench than a flat settings page
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          We have already moved session history, desk context, reference boards, note cards, and capability controls into a shell that feels closer to an Electron-first agent workspace.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "Agents", value: Object.keys(agents).length, color: "var(--accent)" },
          { label: "Running Now", value: runningAgents, color: "var(--warning)" },
          { label: "Providers", value: providers.length, color: "var(--success)" },
          { label: "Platforms", value: enabledPlatforms, color: "#7dd3fc" },
          { label: "Sessions", value: chatSessions.length, color: "#fda4af" },
          { label: "Desk Notes", value: workspaceDeskNotes.length, color: "#fbbf24" },
          { label: "Context Packs", value: workspaceSavedBundles.length, color: "#c4b5fd" },
          { label: "Meeting Summary", value: latestMeetingRecord ? "Ready" : "None", color: "#a7f3d0" },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: item.color }}>{item.value}</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Shell Theme</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {([
            { id: "dark", label: "Deep Sea" },
            { id: "coral", label: "Coral" },
            { id: "jade", label: "Jade" },
          ] as const).map(option => (
            <button
              key={option.id}
              type="button"
              className="btn-ghost"
              onClick={() => setTheme(option.id)}
              style={{
                minWidth: 90,
                borderColor: theme === option.id ? "rgba(var(--accent-rgb), 0.35)" : "var(--border)",
                background: theme === option.id ? "var(--accent-dim)" : "transparent",
                color: theme === option.id ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Desktop Shortcuts</div>
          <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
            <div><strong>Ctrl/Cmd + N</strong> Create a new session and jump into task mode</div>
            <div><strong>Ctrl/Cmd + B</strong> Toggle the left session rail</div>
            <div><strong>Ctrl/Cmd + Shift + B</strong> Toggle the right activity rail</div>
            <div><strong>Ctrl/Cmd + R</strong> Reconnect WebSocket when the link drops</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Sidebar State</div>
          <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
            <div>Left rail: <strong style={{ color: "var(--text)" }}>{leftOpen ? "Expanded" : "Collapsed"}</strong></div>
            <div>Right rail: <strong style={{ color: "var(--text)" }}>{rightOpen ? "Expanded" : "Collapsed"}</strong></div>
            <div>The shell keeps desktop-first behavior and still collapses cleanly as the viewport shrinks.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutControlCenter() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Already Brought In</div>
        <div style={{ display: "grid", gap: 10, marginTop: 12, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
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

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Still Not Ported</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 10 }}>
          OpenHanako still has deeper plugin pages, bridge channels, richer artifact workflows, and a larger background services model. Those pieces need more backend protocol and lifecycle work, so we are bringing them in gradually instead of forcing them into the current app all at once.
        </div>
      </div>
    </div>
  );
}
