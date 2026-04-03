"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import {
  filterByProjectScope,
  getRunProjectScopeKey,
  getSessionProjectLabel,
  getSessionProjectScope,
} from "@/lib/project-context";

export function ProjectHubCard({ compact = false }: { compact?: boolean }) {
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const executionRuns = useStore(s => s.executionRuns);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scope = getSessionProjectScope(activeSession);
  const scopeKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );

  const scopedSessions = useMemo(
    () => chatSessions.filter(session => getRunProjectScopeKey(session, chatSessions) === scopeKey),
    [chatSessions, scopeKey],
  );
  const scopedRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === scopeKey),
    [chatSessions, executionRuns, scopeKey],
  );
  const scopedMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, scope),
    [scope, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, scope),
    [scope, workspaceDeskNotes],
  );
  const scopedBundles = useMemo(
    () => filterByProjectScope(workspaceSavedBundles, scope),
    [scope, workspaceSavedBundles],
  );

  return (
    <article className={`project-hub-card ${compact ? "is-compact" : ""}`}>
      <div className="project-hub-card__eyebrow">Project Hub</div>
      <div className="project-hub-card__title">
        {activeSession ? getSessionProjectLabel(activeSession) : "General"}
      </div>
      <div className="project-hub-card__path">
        {activeSession?.workspaceRoot ?? "No workspace root connected"}
      </div>

      <div className="project-hub-card__stats">
        <ProjectHubMetric label="会话" value={scopedSessions.length} />
        <ProjectHubMetric label="Runs" value={scopedRuns.length} />
        <ProjectHubMetric label="记忆" value={scopedMemories.length} />
        <ProjectHubMetric label="笔记" value={scopedDeskNotes.length} />
      </div>

      {!compact && (
        <div className="project-hub-card__footer">
          <span>上下文包 {scopedBundles.length}</span>
          <span>
            最近运行 {scopedRuns[0] ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(scopedRuns[0].updatedAt) : "暂无"}
          </span>
        </div>
      )}
    </article>
  );
}

function ProjectHubMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="project-hub-card__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
