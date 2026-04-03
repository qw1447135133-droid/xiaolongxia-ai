"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { AGENT_META } from "@/store/types";
import type { AgentId, Task } from "@/store/types";

type ArtifactFilter = "all" | "task" | "image" | "meeting" | "desk";

type ArtifactItem =
  | {
      id: string;
      kind: "task";
      title: string;
      meta: string;
      body: string;
      agentId: AgentId;
      createdAt: number;
      actionLabel: string;
      action: () => void;
    }
  | {
      id: string;
      kind: "image";
      title: string;
      meta: string;
      imageUrl: string;
      agentId: AgentId;
      createdAt: number;
      actionLabel: string;
      action: () => void;
    }
  | {
      id: string;
      kind: "meeting";
      title: string;
      meta: string;
      body: string;
      createdAt: number;
      actionLabel: string;
      action: () => void;
    }
  | {
      id: string;
      kind: "desk";
      title: string;
      meta: string;
      body: string;
      createdAt: number;
      actionLabel: string;
      action: () => void;
    };

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}

function buildTaskArtifacts(tasks: Task[], navigateToTask: (taskId: string) => void): ArtifactItem[] {
  return tasks
    .filter(task => !task.isUserMessage && (task.result?.trim() || task.imageUrl))
    .map(task => {
      if (task.imageUrl) {
        return {
          id: `artifact-image-${task.id}`,
          kind: "image" as const,
          title: task.description.slice(0, 56) || "Generated image",
          meta: `${AGENT_META[task.assignedTo].name} · ${timeLabel(task.completedAt ?? task.createdAt)}`,
          imageUrl: task.imageUrl,
          agentId: task.assignedTo,
          createdAt: task.completedAt ?? task.createdAt,
          actionLabel: "Jump to task",
          action: () => navigateToTask(task.id),
        };
      }

      return {
        id: `artifact-task-${task.id}`,
        kind: "task" as const,
        title: task.description.slice(0, 56) || "Task output",
        meta: `${AGENT_META[task.assignedTo].name} · ${timeLabel(task.completedAt ?? task.createdAt)}`,
        body: task.result ?? "",
        agentId: task.assignedTo,
        createdAt: task.completedAt ?? task.createdAt,
        actionLabel: "Jump to task",
        action: () => navigateToTask(task.id),
      };
    });
}

export function ArtifactsCenter() {
  const tasks = useStore(s => s.tasks);
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const workspaceSavedBundles = useStore(s => s.workspaceSavedBundles);
  const navigateToTask = useStore(s => s.navigateToTask);
  const appendCommandDraft = useStore(s => s.appendCommandDraft);
  const setTab = useStore(s => s.setTab);
  const [filter, setFilter] = useState<ArtifactFilter>("all");

  const taskArtifacts = useMemo(
    () => buildTaskArtifacts(tasks, navigateToTask),
    [navigateToTask, tasks],
  );

  const meetingArtifact = useMemo<ArtifactItem[]>(
    () =>
      latestMeetingRecord
        ? [{
            id: "artifact-meeting-latest",
            kind: "meeting",
            title: latestMeetingRecord.topic,
            meta: `Meeting summary · ${timeLabel(latestMeetingRecord.finishedAt)}`,
            body: latestMeetingRecord.summary,
            createdAt: latestMeetingRecord.finishedAt,
            actionLabel: "Open meeting tab",
            action: () => setTab("meeting"),
          }]
        : [],
    [latestMeetingRecord, setTab],
  );

  const deskArtifacts = useMemo<ArtifactItem[]>(
    () => [
      ...workspaceDeskNotes.map(note => ({
        id: `artifact-note-${note.id}`,
        kind: "desk" as const,
        title: note.title,
        meta: `Desk note · ${timeLabel(note.updatedAt)}`,
        body: note.content,
        createdAt: note.updatedAt,
        actionLabel: "Use in prompt",
        action: () => appendCommandDraft(`Desk note: ${note.title}\n\n${note.content}`),
      })),
      ...workspaceSavedBundles.map(bundle => ({
        id: `artifact-bundle-${bundle.id}`,
        kind: "desk" as const,
        title: bundle.name,
        meta: `Context pack · ${timeLabel(bundle.createdAt)}`,
        body: `${bundle.previews.length} references\n${bundle.notes || "No notes"}`,
        createdAt: bundle.createdAt,
        actionLabel: "Use in prompt",
        action: () => appendCommandDraft(`Context pack: ${bundle.name}\n${bundle.notes}`),
      })),
    ],
    [appendCommandDraft, workspaceDeskNotes, workspaceSavedBundles],
  );

  const artifacts = useMemo(
    () =>
      [...taskArtifacts, ...meetingArtifact, ...deskArtifacts]
        .filter(item => {
          if (filter === "all") return true;
          if (filter === "task") return item.kind === "task";
          if (filter === "image") return item.kind === "image";
          if (filter === "meeting") return item.kind === "meeting";
          return item.kind === "desk";
        })
        .sort((left, right) => right.createdAt - left.createdAt),
    [deskArtifacts, filter, meetingArtifact, taskArtifacts],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(167, 243, 208, 0.14), rgba(255,255,255,0.02))",
          borderColor: "rgba(167, 243, 208, 0.22)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Artifacts Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Unified output shelf for task results, images, meeting conclusions, and desk context
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          This is the lightweight bridge toward openhanako-style artifact workflows: a single place to revisit what the team has already produced and push it back into the main flow.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <ArtifactMetric label="Artifacts" value={artifacts.length} accent="var(--accent)" />
        <ArtifactMetric label="Task Outputs" value={taskArtifacts.filter(item => item.kind === "task").length} accent="#7dd3fc" />
        <ArtifactMetric label="Images" value={taskArtifacts.filter(item => item.kind === "image").length} accent="#f472b6" />
        <ArtifactMetric label="Desk Assets" value={deskArtifacts.length} accent="#fbbf24" />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Artifact Shelf</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Filter recent outputs and jump back into the right workflow surface.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["all", "All"],
              ["task", "Task"],
              ["image", "Images"],
              ["meeting", "Meeting"],
              ["desk", "Desk"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="btn-ghost"
                onClick={() => setFilter(id)}
                style={{
                  borderColor: filter === id ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)",
                  background: filter === id ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                  color: filter === id ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {artifacts.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "32px 0" }}>
            No artifacts yet. Run tasks, save desk notes, or finish a meeting to populate this shelf.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
            {artifacts.map(item => (
              <article
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minHeight: 240,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{item.meta}</div>
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(var(--accent-rgb), 0.12)",
                      color: "var(--accent)",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {item.kind}
                  </span>
                </div>

                {"body" in item ? (
                  <div
                    style={{
                      flex: 1,
                      fontSize: 12,
                      lineHeight: 1.75,
                      color: "var(--text)",
                      whiteSpace: "pre-wrap",
                      overflow: "auto",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(8, 12, 20, 0.35)",
                    }}
                  >
                    {item.body}
                  </div>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      placeItems: "center",
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(8, 12, 20, 0.35)",
                    }}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 12, display: "block" }}
                    />
                  </div>
                )}

                <button type="button" className="btn-ghost" onClick={item.action}>
                  {item.actionLabel}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}
