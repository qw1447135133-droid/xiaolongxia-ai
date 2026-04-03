"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useStore } from "@/store";
import { sendWs } from "@/hooks/useWebSocket";
import { randomId } from "@/lib/utils";

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

export function CommandInput() {
  const [error, setError] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    isDispatching,
    wsStatus,
    commandDraft,
    setCommandDraft,
    clearCommandDraft,
    setDispatching,
    setLastInstruction,
    addTask,
  } = useStore();

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

    addTask({
      id: randomId(),
      description: taskDescription,
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      createdAt: Date.now(),
      completedAt: Date.now(),
      isUserMessage: true,
    });

    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    const ok = sendWs({ type: "dispatch", instruction, attachments: attachmentMetas });

    if (!ok) {
      setError("Failed to send. The WebSocket connection was lost.");
    }

    setDispatching(false);
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-sidebar)",
      }}
    >
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

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5 }}>
        Dispatch a new task to the orchestrator
      </div>

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

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
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
          className="btn-ghost"
          onClick={openFilePicker}
          disabled={isDispatching}
          title="Upload files"
          aria-label="Upload attachments"
          style={{
            width: 44,
            minWidth: 44,
            padding: 0,
            fontSize: 24,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: attachments.length > 0 ? "var(--accent)" : "var(--text-muted)",
            borderColor: attachments.length > 0 ? "rgba(var(--accent-rgb),0.35)" : "var(--border)",
            background: attachments.length > 0 ? "var(--accent-dim)" : "transparent",
          }}
        >
          +
        </button>

        <textarea
          className="input command-input__field"
          placeholder="Example: analyze this market, write a campaign plan, or use the file context from Desk to continue the task..."
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
          className="btn-primary"
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 84 }}
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

      <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
        {attachments.length > 0
          ? `${attachments.length} attachment(s) ready. You can also inject file context directly from Desk preview tabs.`
          : "Use the + button for attachments, or send file path/context from Desk with one click."}
      </div>
    </div>
  );
}
