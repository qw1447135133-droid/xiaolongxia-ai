"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  buildDeskNoteSnippet,
  buildKnowledgeDocumentSnippet,
  buildProjectMemorySnippet,
  describeDeskNote,
  describeKnowledgeDocument,
  describeProjectMemory,
  getRecommendedDeskNotes,
  getRecommendedKnowledgeDocuments,
  getRecommendedProjectMemories,
} from "@/lib/workspace-memory";
import { filterByProjectScope } from "@/lib/project-context";
import { useStore } from "@/store";
import { randomId } from "@/lib/utils";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";

type AttachmentKind = "image" | "document" | "audio" | "video" | "other";

type AttachmentItem = {
  id: string;
  file: File;
  kind: AttachmentKind;
};

const ACCEPTED_FILE_TYPES = [
  "image/*",
  "audio/*",
  "video/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".zip",
  ".rar",
  ".7z",
].join(",");

function detectAttachmentKind(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (
    file.type.includes("pdf") ||
    file.type.includes("word") ||
    file.type.includes("sheet") ||
    file.type.includes("excel") ||
    file.type.includes("powerpoint") ||
    file.type.startsWith("text/")
  ) {
    return "document";
  }
  return "other";
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getAttachmentBadge(kind: AttachmentKind) {
  switch (kind) {
    case "image":
      return "IMG";
    case "document":
      return "DOC";
    case "audio":
      return "AUDIO";
    case "video":
      return "VIDEO";
    default:
      return "FILE";
  }
}

export function CommandInput({
  variant = "dock",
  title,
  hint,
  showHeader = true,
  showFooter = true,
}: {
  variant?: "dock" | "panel";
  title?: string;
  hint?: string;
  showHeader?: boolean;
  showFooter?: boolean;
}) {
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [includeProjectMemory, setIncludeProjectMemory] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    isDispatching,
    wsStatus,
    commandDraft,
    tasks,
    workspaceRoot,
    workspaceCurrentPath,
    workspaceActivePreviewPath,
    workspacePinnedPreviews,
    workspaceDeskNotes,
    workspaceProjectMemories,
    semanticKnowledgeDocs,
    activeWorkspaceProjectMemoryId,
    chatSessions,
    activeSessionId,
    appendCommandDraft,
    setCommandDraft,
    clearCommandDraft,
    setDispatching,
    setLastInstruction,
    setActiveWorkspaceProjectMemory,
  } = useStore();

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scopedProjectMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, activeSession ?? {}),
    [activeSession, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, activeSession ?? {}),
    [activeSession, workspaceDeskNotes],
  );
  const scopedKnowledgeDocs = useMemo(
    () => filterByProjectScope(semanticKnowledgeDocs, activeSession ?? {}),
    [activeSession, semanticKnowledgeDocs],
  );

  const activeProjectMemory = useMemo(
    () =>
      activeWorkspaceProjectMemoryId
        ? scopedProjectMemories.find(memory => memory.id === activeWorkspaceProjectMemoryId) ?? null
        : null,
    [activeWorkspaceProjectMemoryId, scopedProjectMemories],
  );

  const recommendedProjectMemories = useMemo(
    () =>
      getRecommendedProjectMemories(scopedProjectMemories, {
        instruction: commandDraft,
        workspaceRoot,
        workspaceCurrentPath,
        activePreviewPath: workspaceActivePreviewPath,
        pinnedPaths: workspacePinnedPreviews.map(preview => preview.path),
        recentTranscript: tasks.slice(-8).map(task => task.result ?? task.description).join("\n\n"),
      }).filter((item) => item.memory.id !== activeProjectMemory?.id),
    [
      activeProjectMemory?.id,
      commandDraft,
      tasks,
      workspaceActivePreviewPath,
      workspaceCurrentPath,
      workspacePinnedPreviews,
      scopedProjectMemories,
      workspaceRoot,
    ],
  );

  const recommendedDeskNotes = useMemo(
    () =>
      getRecommendedDeskNotes(scopedDeskNotes, {
        instruction: commandDraft,
        workspaceRoot,
        workspaceCurrentPath,
        activePreviewPath: workspaceActivePreviewPath,
        pinnedPaths: workspacePinnedPreviews.map(preview => preview.path),
        recentTranscript: tasks.slice(-8).map(task => task.result ?? task.description).join("\n\n"),
      }).slice(0, activeProjectMemory ? 3 : 2),
    [
      activeProjectMemory?.id,
      commandDraft,
      scopedDeskNotes,
      tasks,
      workspaceActivePreviewPath,
      workspaceCurrentPath,
      workspacePinnedPreviews,
      workspaceRoot,
    ],
  );

  const recommendedKnowledgeDocuments = useMemo(
    () =>
      getRecommendedKnowledgeDocuments(scopedKnowledgeDocs, {
        instruction: commandDraft,
        workspaceRoot,
        workspaceCurrentPath,
        activePreviewPath: workspaceActivePreviewPath,
        pinnedPaths: workspacePinnedPreviews.map(preview => preview.path),
        recentTranscript: tasks.slice(-8).map(task => task.result ?? task.description).join("\n\n"),
      }).slice(0, activeProjectMemory ? 3 : 2),
    [
      activeProjectMemory?.id,
      commandDraft,
      scopedKnowledgeDocs,
      tasks,
      workspaceActivePreviewPath,
      workspaceCurrentPath,
      workspacePinnedPreviews,
      workspaceRoot,
    ],
  );

  useEffect(() => {
    setIncludeProjectMemory(Boolean(activeProjectMemory));
  }, [activeProjectMemory?.id]);

  const openFilePicker = () => {
    if (isDispatching) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setAttachments(current => {
      const exists = new Set(
        current.map(item => `${item.file.name}_${item.file.size}_${item.file.lastModified}`),
      );

      const next = [...current];
      for (const file of files) {
        const key = `${file.name}_${file.size}_${file.lastModified}`;
        if (exists.has(key)) continue;
        exists.add(key);
        next.push({
          id: randomId(),
          file,
          kind: detectAttachmentKind(file),
        });
      }
      return next;
    });

    event.target.value = "";
    setError("");
  };

  const removeAttachment = (id: string) => {
    setAttachments(current => current.filter(item => item.id !== id));
  };

  const dispatch = async () => {
    const instruction = commandDraft.trim();
    if (!instruction || isDispatching) return;

    if (wsStatus !== "connected") {
      setError("WebSocket is disconnected. Please retry in a moment.");
      return;
    }

    const attachmentMetas = attachments.map(({ id, file, kind }) => ({
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      kind,
      lastModified: file.lastModified,
    }));

    const taskDescription = attachmentMetas.length
      ? `${instruction}\n\nAttachments: ${attachmentMetas.map(item => item.name).join(", ")}`
      : instruction;

    setDispatching(true);
    setLastInstruction(instruction);
    setError("");
    clearCommandDraft();
    setAttachments([]);

    const { ok } = sendExecutionDispatch({
      instruction,
      source: "chat",
      attachments: attachmentMetas,
      includeUserMessage: true,
      taskDescription,
      includeActiveProjectMemory: includeProjectMemory || !activeProjectMemory,
    });

    if (!ok) {
      setError("Failed to send. The WebSocket connection was lost.");
    }

    setDispatching(false);
  };

  return (
    <div className={`command-input command-input--${variant}`}>
      {error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--danger)",
            background: "rgba(var(--danger-rgb),0.08)",
            border: "1px solid rgba(var(--danger-rgb),0.2)",
            borderRadius: "var(--radius-sm)",
            padding: "5px 8px",
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      {showHeader ? (
        <div className="command-input__header">
          <div className="command-input__title">{title ?? "给小龙虾团队发送消息"}</div>
          <div className="command-input__hint">
            {hint ?? "像 ChatGPT 一样直接发问题、任务或文件上下文，系统会自动派发给合适的角色。"}
          </div>
        </div>
      ) : null}

      {activeProjectMemory && (
        <div className="command-input__memory">
          <div className="command-input__memory-copy">
            <span className="command-input__memory-label">Active Memory</span>
            <strong>{activeProjectMemory.name}</strong>
            <span>{describeProjectMemory(activeProjectMemory)}</span>
          </div>
          <div className="command-input__memory-actions">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={includeProjectMemory}
                onChange={(event) => setIncludeProjectMemory(event.target.checked)}
              />
              发送时附带
            </label>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setActiveWorkspaceProjectMemory(null)}
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {recommendedProjectMemories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>推荐项目记忆</div>
          {recommendedProjectMemories.slice(0, 2).map(({ memory, score }) => (
            <button
              key={memory.id}
              type="button"
              className="btn-ghost"
              onClick={() => setActiveWorkspaceProjectMemory(memory.id)}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, padding: "8px 10px" }}
            >
              <span style={{ textAlign: "left" }}>
                <strong style={{ display: "block", color: "var(--text)" }}>{memory.name}</strong>
                <span style={{ color: "var(--text-muted)" }}>{describeProjectMemory(memory)}</span>
              </span>
              <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>相关度 {Math.round(score * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {(recommendedDeskNotes.length > 0 || recommendedKnowledgeDocuments.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>可注入上下文</div>
          {recommendedDeskNotes.slice(0, 2).map(({ note }) => (
            <button
              key={note.id}
              type="button"
              className="btn-ghost"
              onClick={() => appendCommandDraft(`\n\n${buildDeskNoteSnippet(note)}`)}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, padding: "8px 10px" }}
            >
              <span style={{ textAlign: "left" }}>
                <strong style={{ display: "block", color: "var(--text)" }}>{note.title}</strong>
                <span style={{ color: "var(--text-muted)" }}>{describeDeskNote(note)}</span>
              </span>
              <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>注入 Desk Note</span>
            </button>
          ))}
          {recommendedKnowledgeDocuments.slice(0, 2).map(({ document }) => (
            <button
              key={document.id}
              type="button"
              className="btn-ghost"
              onClick={() => appendCommandDraft(`\n\n${buildKnowledgeDocumentSnippet(document)}`)}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, padding: "8px 10px" }}
            >
              <span style={{ textAlign: "left" }}>
                <strong style={{ display: "block", color: "var(--text)" }}>{document.title}</strong>
                <span style={{ color: "var(--text-muted)" }}>{describeKnowledgeDocument(document)}</span>
              </span>
              <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>注入知识文档</span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {attachments.map(({ id, file, kind }) => (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "rgba(247,249,253,0.96)",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>{getAttachmentBadge(kind)}</span>
              <span style={{ color: "var(--text)" }}>{file.name}</span>
              <span style={{ color: "var(--text-muted)" }}>{formatFileSize(file.size)}</span>
              <button type="button" className="btn-ghost" onClick={() => removeAttachment(id)} style={{ padding: "2px 6px", fontSize: 11 }}>
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="command-input__row">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="command-input__upload command-input__send2"
          onClick={openFilePicker}
          disabled={isDispatching}
          title="添加附件"
        >
          +
        </button>
        <textarea
          className="input command-input__field"
          value={commandDraft}
          onChange={(event) => setCommandDraft(event.target.value)}
          placeholder="输入你的任务、问题、网页研究需求或桌面执行目标"
          rows={4}
        />
        <button
          className={`command-input__send command-input__send2 ${commandDraft.trim() && !isDispatching ? "is-ready" : ""}`}
          onClick={() => void dispatch()}
          disabled={isDispatching || !commandDraft.trim()}
          title="Send message"
          type="button"
        >
          {isDispatching ? (
            <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>

      {showFooter ? (
        <div className="command-input__footer">
          {attachments.length > 0
            ? `${attachments.length} attachment(s) ready.${activeProjectMemory && includeProjectMemory ? ` Active memory: ${activeProjectMemory.name}.` : ""} You can also inject file context directly from Desk preview tabs.`
            : activeProjectMemory && includeProjectMemory
              ? `当前发送会自动附带项目记忆「${activeProjectMemory.name}」，也可以在上方随时关闭。`
              : recommendedProjectMemories.length > 0
                ? `未手动激活项目记忆时，系统会优先参考推荐结果，并在命中足够高时自动召回。`
                : recommendedDeskNotes.length > 0
                  ? `系统已找到相关 Desk Notes，可一键注入输入框作为语义上下文。`
                  : recommendedKnowledgeDocuments.length > 0
                    ? `系统已命中可复用知识文档，可直接注入输入框或在发送时自动参与召回。`
                    : "Use the + button for attachments, or send file path/context from Desk with one click."}
        </div>
      ) : null}
    </div>
  );
}
