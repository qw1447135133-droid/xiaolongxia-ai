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
}: {
  variant?: "dock" | "panel";
  title?: string;
  hint?: string;
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

      <div className="command-input__header">
        <div className="command-input__title">{title ?? "给小龙虾团队发送消息"}</div>
        <div className="command-input__hint">
          {hint ?? "像 ChatGPT 一样直接发问题、任务或文件上下文，系统会自动派发给合适的角色。"}
        </div>
      </div>

      {activeProjectMemory && (
        <div className="command-input__memory">
          <div className="command-input__memory-copy">
            <span className="command-input__memory-label">Active Memory</span>
            <strong>{activeProjectMemory.name}</strong>
            <span>{describeProjectMemory(activeProjectMemory)}</span>
          </div>
          <div className="command-input__memory-actions">
            <button
              type="button"
              className={`btn-ghost command-input__memory-toggle ${includeProjectMemory ? "is-active" : ""}`}
              onClick={() => setIncludeProjectMemory(value => !value)}
            >
              {includeProjectMemory ? "发送时附带" : "暂不附带"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => appendCommandDraft(buildProjectMemorySnippet(activeProjectMemory))}
            >
              展开到输入框
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActiveWorkspaceProjectMemory(null)}
            >
              清除激活
            </button>
          </div>
        </div>
      )}

      {!activeProjectMemory && recommendedProjectMemories.length > 0 && (
        <div className="command-input__memory command-input__memory--suggested">
          <div className="command-input__memory-copy">
            <span className="command-input__memory-label">Suggested Memory</span>
            <strong>{recommendedProjectMemories[0]!.memory.name}</strong>
            <span>{recommendedProjectMemories[0]!.reasons.join(" · ") || describeProjectMemory(recommendedProjectMemories[0]!.memory)}</span>
          </div>
          <div className="command-input__memory-actions">
            <button
              type="button"
              className="btn-ghost command-input__memory-toggle is-active"
              onClick={() => setActiveWorkspaceProjectMemory(recommendedProjectMemories[0]!.memory.id)}
            >
              激活推荐
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => appendCommandDraft(buildProjectMemorySnippet(recommendedProjectMemories[0]!.memory))}
            >
              展开到输入框
            </button>
          </div>
        </div>
      )}

      {recommendedProjectMemories.length > 1 && (
        <div className="command-input__memory-rail">
          {recommendedProjectMemories.slice(0, 3).map(item => (
            <button
              key={item.memory.id}
              type="button"
              className="command-input__memory-chip"
              onClick={() => setActiveWorkspaceProjectMemory(item.memory.id)}
            >
              <strong>{item.memory.name}</strong>
              <span>{item.reasons.join(" · ") || describeProjectMemory(item.memory)}</span>
            </button>
          ))}
        </div>
      )}

      {recommendedDeskNotes.length > 0 && (
        <div className="command-input__memory-rail">
          {recommendedDeskNotes.map(item => (
            <button
              key={item.note.id}
              type="button"
              className="command-input__memory-chip"
              onClick={() => appendCommandDraft(buildDeskNoteSnippet(item.note))}
            >
              <strong>{item.note.title}</strong>
              <span>{item.reasons.join(" · ") || describeDeskNote(item.note)}</span>
            </button>
          ))}
        </div>
      )}

      {recommendedKnowledgeDocuments.length > 0 && (
        <div className="command-input__memory-rail">
          {recommendedKnowledgeDocuments.map(item => (
            <button
              key={item.document.id}
              type="button"
              className="command-input__memory-chip"
              onClick={() => appendCommandDraft(buildKnowledgeDocumentSnippet(item.document))}
            >
              <strong>{item.document.title}</strong>
              <span>{item.reasons.join(" · ") || describeKnowledgeDocument(item.document)}</span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map(item => (
            <div key={item.id} className="attachment-chip">
              <span className="attachment-chip__type">{getAttachmentBadge(item.kind)}</span>
              <span className="attachment-chip__name" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="attachment-chip__size">{formatFileSize(item.file.size)}</span>
              <button
                type="button"
                className="attachment-chip__remove"
                onClick={() => removeAttachment(item.id)}
                aria-label={`Remove attachment ${item.file.name}`}
                title="Remove attachment"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="command-input__row">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <button
          type="button"
          onClick={openFilePicker}
          disabled={isDispatching}
          title="Upload files"
          aria-label="Upload attachments"
          className={`btn-ghost command-input__upload ${attachments.length > 0 ? "is-active" : ""}`}
        >
          +
        </button>

        <textarea
          className="input command-input__field"
          placeholder="例如：帮我分析这个需求、写一版开发计划，或结合 Desk 里的文件上下文继续当前任务..."
          value={commandDraft}
          onChange={(event) => setCommandDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void dispatch();
            }
          }}
          disabled={isDispatching}
          rows={1}
        />

        <button
          className="btn-primary command-input__send"
          onClick={() => void dispatch()}
          disabled={isDispatching || !commandDraft.trim()}
        >
          {isDispatching ? (
            <>
              <span className="spinner" />
              Running
            </>
          ) : (
            "Send"
          )}
        </button>
      </div>

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
    </div>
  );
}
