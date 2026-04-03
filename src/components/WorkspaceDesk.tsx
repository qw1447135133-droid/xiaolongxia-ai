"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import {
  buildDeskNoteSnippet,
  buildProjectMemoryScratchpad,
  buildProjectMemorySnippet,
  describeProjectMemory,
} from "@/lib/workspace-memory";
import type { WorkspaceDeskNote, WorkspaceEntry, WorkspacePreview, WorkspaceProjectMemory } from "@/types/desktop-workspace";

type DeskSortMode = "name-asc" | "modified-desc" | "size-desc";
const DESK_NOTE_TONES: WorkspaceDeskNote["tone"][] = ["amber", "mint", "sky", "rose"];

function formatBytes(size: number) {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** power;
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`;
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function getEntryIcon(entry: WorkspaceEntry) {
  if (entry.kind === "directory") return "DIR";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(entry.extension)) return "IMG";
  if (["md", "txt", "json", "ts", "tsx", "js", "jsx", "css", "html"].includes(entry.extension)) return "TXT";
  return "FILE";
}

function getPreviewTone(preview: WorkspacePreview | null) {
  switch (preview?.kind) {
    case "image":
      return "Image";
    case "text":
      return preview.language?.toUpperCase() ?? "Text";
    case "directory":
      return "Folder";
    case "binary":
      return "Binary";
    case "unsupported":
      return "Meta";
    default:
      return "Preview";
  }
}

function buildPromptSnippet(preview: WorkspacePreview, includeContent: boolean) {
  if (preview.kind === "text") {
    const excerpt = preview.content?.slice(0, 1200).trim() ?? "";
    return includeContent
      ? `Workspace context: ${preview.path}\nPlease use this file as context.\n\n${excerpt}`
      : `Workspace file path: ${preview.path}\nPlease use this file as context.`;
  }

  if (preview.kind === "image") {
    return `Workspace image: ${preview.path}\nPlease consider this image while completing the task.`;
  }

  if (preview.kind === "directory") {
    return `Workspace folder: ${preview.path}\nUse this folder as the current working context.`;
  }

  return `Workspace asset: ${preview.path}\nType: ${preview.kind}\nUse this file as additional context.`;
}

function buildDeskActionTemplate(actionId: string, activePreview: WorkspacePreview | null, folderPath: string | null, notes: string) {
  const notesSection = notes.trim() ? `\n\nDesk notes:\n${notes.trim()}` : "";
  const previewPath = activePreview?.path ?? "(no active file)";
  const folderSection = folderPath ? `\nCurrent folder: ${folderPath}` : "";

  switch (actionId) {
    case "summarize-file":
      return `Summarize the currently selected file and highlight the most important takeaways.\nFile: ${previewPath}${notesSection}`;
    case "review-code":
      return `Review the currently selected file like a senior engineer. Focus on bugs, risks, regressions, and missing tests.\nFile: ${previewPath}${notesSection}`;
    case "extract-todos":
      return `Read the currently selected file and extract actionable TODO items, edge cases, and follow-up tasks.\nFile: ${previewPath}${notesSection}`;
    case "explain-file":
      return `Explain the currently selected file in plain language, including its purpose, flow, and important implementation details.\nFile: ${previewPath}${notesSection}`;
    case "map-folder":
      return `Map the current folder and explain the role of the important files and entry points.${folderSection}${notesSection}`;
    case "plan-folder":
      return `Use the current folder as context and create an implementation plan for the next change.${folderSection}${notesSection}`;
    case "find-risks":
      return `Inspect the current folder and identify the most likely technical risks, fragile areas, and regression points.${folderSection}${notesSection}`;
    case "locate-entry":
      return `Find the main entry points, data flow, and control surfaces in the current folder.${folderSection}${notesSection}`;
    default:
      return "";
  }
}

function buildPinnedBundleSnippet(previews: WorkspacePreview[], notes: string) {
  const fileList = previews
    .map((preview, index) => `${index + 1}. ${preview.name} (${preview.kind})\n   Path: ${preview.path}`)
    .join("\n");
  const notesSection = notes.trim() ? `\n\nDesk notes:\n${notes.trim()}` : "";
  return `Use the pinned workspace references as a shared context bundle.\n\nPinned references:\n${fileList}${notesSection}`;
}

function summarizeProjectMemoryNotes(memory: WorkspaceProjectMemory) {
  if (memory.deskNotes.length === 0) return "No note snapshots";
  return memory.deskNotes.map(note => note.title).join(" · ");
}

function sortEntries(entries: WorkspaceEntry[], mode: DeskSortMode) {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }

    if (mode === "modified-desc") {
      return right.modifiedAt - left.modifiedAt || left.name.localeCompare(right.name);
    }

    if (mode === "size-desc") {
      return right.size - left.size || left.name.localeCompare(right.name);
    }

    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

function renderPreviewContent(preview: WorkspacePreview) {
  if (preview.kind === "image" && preview.dataUrl) {
    return (
      <div className="workspace-desk__image-wrap">
        <img src={preview.dataUrl} alt={preview.name} className="workspace-desk__image" />
      </div>
    );
  }

  if (preview.kind === "text") {
    return (
      <pre className="workspace-desk__code">
        {preview.content}
      </pre>
    );
  }

  return (
    <div className="workspace-desk__meta-grid">
      <div className="workspace-desk__meta-item">
        <span>Type</span>
        <strong>{preview.kind}</strong>
      </div>
      <div className="workspace-desk__meta-item">
        <span>Updated</span>
        <strong>{formatTimestamp(preview.modifiedAt)}</strong>
      </div>
      {typeof preview.itemCount === "number" && (
        <div className="workspace-desk__meta-item">
          <span>Items</span>
          <strong>{preview.itemCount}</strong>
        </div>
      )}
      {preview.message && (
        <div className="workspace-desk__meta-item workspace-desk__meta-item--wide">
          <span>Message</span>
          <strong>{preview.message}</strong>
        </div>
      )}
    </div>
  );
}

export function WorkspaceDesk() {
  const {
    workspaceRoot,
    workspaceCurrentPath,
    workspaceParentPath,
    workspaceEntries,
    workspaceSelectedPath,
    workspacePreview,
    workspaceLoading,
    workspacePreviewLoading,
    workspacePreviewOpen,
    workspaceError,
    workspacePreviewTabs,
    workspaceActivePreviewPath,
    workspaceRecentPreviews,
    workspacePinnedPreviews,
    workspaceSavedBundles,
    workspaceProjectMemories,
    activeWorkspaceProjectMemoryId,
    workspaceDeskNotes,
    workspaceScratchpad,
    setWorkspaceRoot,
    setWorkspaceCurrentPath,
    setWorkspaceParentPath,
    setWorkspaceEntries,
    setWorkspaceSelectedPath,
    setWorkspacePreview,
    setWorkspaceLoading,
    setWorkspacePreviewLoading,
    setWorkspacePreviewOpen,
    setWorkspaceError,
    setWorkspaceScratchpad,
    setWorkspaceActivePreviewPath,
    openWorkspacePreviewTab,
    closeWorkspacePreviewTab,
    pinWorkspacePreview,
    unpinWorkspacePreview,
    saveWorkspaceBundle,
    applyWorkspaceBundle,
    deleteWorkspaceBundle,
    saveWorkspaceProjectMemory,
    applyWorkspaceProjectMemory,
    deleteWorkspaceProjectMemory,
    setActiveWorkspaceProjectMemory,
    createWorkspaceDeskNote,
    toggleWorkspaceDeskNotePin,
    deleteWorkspaceDeskNote,
    appendCommandDraft,
    resetWorkspace,
  } = useStore();
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);

  const [copied, setCopied] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [projectMemoryTitle, setProjectMemoryTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<DeskSortMode>("name-asc");
  const [studioOpen, setStudioOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardActivePath, setBoardActivePath] = useState<string | null>(null);

  const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;
  const isAvailable = Boolean(electronApi?.selectWorkspaceFolder);

  const activePreview = useMemo(
    () =>
      workspacePreviewTabs.find(item => item.path === workspaceActivePreviewPath) ??
      workspacePreview ??
      null,
    [workspaceActivePreviewPath, workspacePreview, workspacePreviewTabs],
  );

  const pinnedPaths = useMemo(
    () => new Set(workspacePinnedPreviews.map(item => item.path)),
    [workspacePinnedPreviews],
  );

  const boardPreview = useMemo(
    () =>
      workspacePinnedPreviews.find(item => item.path === boardActivePath) ??
      workspacePinnedPreviews[0] ??
      null,
    [boardActivePath, workspacePinnedPreviews],
  );

  useEffect(() => {
    if (!studioOpen && !boardOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStudioOpen(false);
        setBoardOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [boardOpen, studioOpen]);

  useEffect(() => {
    if (workspacePinnedPreviews.length === 0) {
      setBoardOpen(false);
      setBoardActivePath(null);
      return;
    }

    if (!boardActivePath || !workspacePinnedPreviews.some(item => item.path === boardActivePath)) {
      setBoardActivePath(workspacePinnedPreviews[0].path);
    }
  }, [boardActivePath, workspacePinnedPreviews]);

  const breadcrumbs = useMemo(() => {
    if (!workspaceRoot || !workspaceCurrentPath) return [];
    const relative = workspaceCurrentPath.slice(workspaceRoot.length).replace(/^[\\/]+/, "");
    const parts = relative ? relative.split(/[\\/]+/).filter(Boolean) : [];
    return ["Workspace", ...parts];
  }, [workspaceCurrentPath, workspaceRoot]);

  const activeFolderLabel = useMemo(() => {
    if (!workspaceCurrentPath) return "No folder selected";
    const parts = workspaceCurrentPath.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? workspaceCurrentPath;
  }, [workspaceCurrentPath]);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? workspaceEntries.filter(entry => {
          const haystack = `${entry.name} ${entry.extension} ${entry.path}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : workspaceEntries;

    return sortEntries(filtered, sortMode);
  }, [searchQuery, sortMode, workspaceEntries]);

  const sortedDeskNotes = useMemo(
    () =>
      [...workspaceDeskNotes].sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return right.updatedAt - left.updatedAt;
      }),
    [workspaceDeskNotes],
  );

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scopedWorkspaceSavedBundles = useMemo(
    () =>
      filterByProjectScope(workspaceSavedBundles, {
        projectId: activeSession?.projectId,
        workspaceRoot: activeSession?.workspaceRoot,
      }),
    [activeSession?.projectId, activeSession?.workspaceRoot, workspaceSavedBundles],
  );

  const scopedWorkspaceProjectMemories = useMemo(
    () =>
      filterByProjectScope(workspaceProjectMemories, {
        projectId: activeSession?.projectId,
        workspaceRoot: activeSession?.workspaceRoot,
      }),
    [activeSession?.projectId, activeSession?.workspaceRoot, workspaceProjectMemories],
  );

  const scopedDeskNotes = useMemo(
    () =>
      filterByProjectScope(sortedDeskNotes, {
        projectId: activeSession?.projectId,
        workspaceRoot: activeSession?.workspaceRoot,
      }),
    [activeSession?.projectId, activeSession?.workspaceRoot, sortedDeskNotes],
  );

  const latestProjectMemory = scopedWorkspaceProjectMemories[0] ?? null;

  const canSaveProjectMemory = useMemo(
    () =>
      Boolean(
        workspaceRoot ||
        workspacePinnedPreviews.length ||
        workspaceScratchpad.trim() ||
        scopedDeskNotes.length,
      ),
    [scopedDeskNotes.length, workspacePinnedPreviews.length, workspaceRoot, workspaceScratchpad],
  );

  const fileActions = useMemo(() => {
    if (!activePreview) return [];
    return [
      { id: "summarize-file", title: "Summarize File", copy: "Turn this file into a concise brief." },
      { id: "review-code", title: "Review Code", copy: "Look for bugs, regressions, and risky patterns." },
      { id: "extract-todos", title: "Extract TODOs", copy: "Pull follow-up tasks and implementation gaps." },
      { id: "explain-file", title: "Explain File", copy: "Translate the file into plain-language understanding." },
    ];
  }, [activePreview]);

  const folderActions = useMemo(() => {
    if (!workspaceCurrentPath) return [];
    return [
      { id: "map-folder", title: "Map Folder", copy: "Outline structure and responsibilities." },
      { id: "plan-folder", title: "Plan Change", copy: "Build a next-step implementation plan from this folder." },
      { id: "find-risks", title: "Find Risks", copy: "Identify fragile spots and likely regressions." },
      { id: "locate-entry", title: "Locate Entry Points", copy: "Find the main flow and starting surfaces." },
    ];
  }, [workspaceCurrentPath]);

  const applyWorkspaceList = (result: {
    rootPath: string;
    currentPath: string;
    parentPath: string | null;
    entries: WorkspaceEntry[];
  }) => {
    setWorkspaceRoot(result.rootPath);
    setWorkspaceCurrentPath(result.currentPath);
    setWorkspaceParentPath(result.parentPath);
    setWorkspaceEntries(result.entries);
  };

  const loadEntries = async (targetPath: string) => {
    if (!electronApi?.listWorkspaceEntries) return;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const result = await electronApi.listWorkspaceEntries(targetPath);
      applyWorkspaceList(result);
      if (workspaceSelectedPath && !result.entries.some(entry => entry.path === workspaceSelectedPath)) {
        setWorkspaceSelectedPath(null);
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to load workspace");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const loadPreview = async (targetPath: string) => {
    if (!electronApi?.readWorkspacePreview) return;
    setWorkspacePreviewLoading(true);
    setWorkspaceError(null);
    try {
      const preview = await electronApi.readWorkspacePreview(targetPath);
      setWorkspaceSelectedPath(targetPath);
      setWorkspacePreview(preview);
      setWorkspacePreviewOpen(true);
      openWorkspacePreviewTab(preview);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Failed to load preview");
      setWorkspacePreview(null);
      setWorkspacePreviewOpen(false);
    } finally {
      setWorkspacePreviewLoading(false);
    }
  };

  const handleChooseWorkspace = async () => {
    if (!electronApi?.selectWorkspaceFolder) return;
    const selectedPath = await electronApi.selectWorkspaceFolder();
    if (!selectedPath) return;
    resetWorkspace();
    await loadEntries(selectedPath);
  };

  const handleRefresh = async () => {
    if (!workspaceCurrentPath) return;
    await loadEntries(workspaceCurrentPath);
    if (workspaceActivePreviewPath) {
      await loadPreview(workspaceActivePreviewPath);
    }
  };

  const handleEntryClick = async (entry: WorkspaceEntry) => {
    if (entry.kind === "directory") {
      setWorkspaceSelectedPath(null);
      setWorkspacePreviewOpen(false);
      await loadEntries(entry.path);
      return;
    }
    await loadPreview(entry.path);
  };

  const handleCopyPath = async (targetPath: string) => {
    try {
      await navigator.clipboard.writeText(targetPath);
      setCopied(targetPath);
      window.setTimeout(() => setCopied(current => (current === targetPath ? null : current)), 1500);
    } catch {
      setWorkspaceError("Clipboard is unavailable in the current environment.");
    }
  };

  const handleOpenSystemPath = async (targetPath: string | null) => {
    if (!targetPath || !electronApi?.openWorkspacePath) return;
    try {
      await electronApi.openWorkspacePath(targetPath);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to open system path.");
    }
  };

  const handlePopOutPreview = async (preview: WorkspacePreview | null = activePreview) => {
    if (!preview || !electronApi?.openWorkspacePreviewWindow) return;
    try {
      await electronApi.openWorkspacePreviewWindow(preview);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Unable to open detached preview window.");
    }
  };

  const injectPreview = (mode: "path" | "context") => {
    if (!activePreview) return;
    appendCommandDraft(buildPromptSnippet(activePreview, mode === "context"));
  };

  const runDeskAction = (actionId: string) => {
    const nextPrompt = buildDeskActionTemplate(actionId, activePreview, workspaceCurrentPath, workspaceScratchpad);
    if (!nextPrompt) return;
    appendCommandDraft(nextPrompt);
  };

  const injectPinnedBundle = () => {
    if (workspacePinnedPreviews.length === 0) return;
    appendCommandDraft(buildPinnedBundleSnippet(workspacePinnedPreviews, workspaceScratchpad));
  };

  const handleSaveBundle = () => {
    if (workspacePinnedPreviews.length === 0 && !workspaceScratchpad.trim()) return;
    const bundleLabel = `${activeFolderLabel === "No folder selected" ? "Desk" : activeFolderLabel} Pack ${formatTimestamp(Date.now())}`;
    saveWorkspaceBundle(bundleLabel);
  };

  const handleSaveProjectMemory = () => {
    if (!canSaveProjectMemory) return;
    const memoryLabel =
      projectMemoryTitle.trim() ||
      `${activeFolderLabel === "No folder selected" ? "Workspace" : activeFolderLabel} Memory ${formatTimestamp(Date.now())}`;
    saveWorkspaceProjectMemory(memoryLabel);
    setProjectMemoryTitle("");
  };

  const handleSaveDeskNote = () => {
    if (!workspaceScratchpad.trim()) return;
    const normalizedTitle = noteTitle.trim() || activePreview?.name || `Desk Note ${formatTimestamp(Date.now())}`;
    const tone = DESK_NOTE_TONES[workspaceDeskNotes.length % DESK_NOTE_TONES.length] ?? "amber";
    createWorkspaceDeskNote({
      title: normalizedTitle,
      content: workspaceScratchpad.trim(),
      tone,
      linkedPreview: activePreview,
    });
    setNoteTitle("");
    setWorkspaceScratchpad("");
  };

  const handleLoadDeskNote = async (note: WorkspaceDeskNote) => {
    setNoteTitle(note.title);
    setWorkspaceScratchpad(note.content);
    if (note.linkedPath) {
      await loadPreview(note.linkedPath);
    }
  };

  return (
    <>
      <section className="workspace-card workspace-desk">
        <div className="workspace-card__head workspace-desk__head">
          <div>
            <div className="workspace-card__eyebrow">Desk Workspace</div>
            <div className="workspace-card__title">Local files, search, and preview studio</div>
          </div>
          <div className="workspace-desk__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleRefresh}
              disabled={!isAvailable || !workspaceCurrentPath || workspaceLoading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void handleOpenSystemPath(activePreview?.path ?? workspaceCurrentPath ?? workspaceRoot)}
              disabled={!isAvailable || !electronApi?.openWorkspacePath || (!workspaceCurrentPath && !activePreview?.path && !workspaceRoot)}
            >
              Reveal
            </button>
            <button type="button" className="btn-primary" onClick={handleChooseWorkspace} disabled={!isAvailable}>
              {workspaceRoot ? "Switch Folder" : "Open Folder"}
            </button>
          </div>
        </div>

        {!isAvailable && (
          <div className="workspace-desk__notice">
            Desk workspace browsing is available in the Electron desktop runtime.
          </div>
        )}

        {workspaceError && <div className="workspace-desk__notice workspace-desk__notice--error">{workspaceError}</div>}

        <div className="workspace-desk__hero">
          <div>
            <div className="workspace-desk__hero-label">Current Root</div>
            <div className="workspace-desk__hero-value">{workspaceRoot ?? "No local folder selected yet"}</div>
          </div>
          <div className="workspace-desk__hero-meta">
            <span>{activeSession ? getSessionProjectLabel(activeSession) : "General"}</span>
            <span>{workspaceEntries.length} items</span>
            <span>{workspacePreviewOpen ? "preview live" : "preview idle"}</span>
            <span>{workspacePreviewTabs.length} tabs</span>
          </div>
        </div>

        <div className="workspace-desk__toolbar">
          <div className="workspace-desk__breadcrumbs">
            {breadcrumbs.length > 0 ? breadcrumbs.map((part, index) => (
              <span key={`${part}-${index}`} className="workspace-desk__crumb">
                {part}
              </span>
            )) : (
              <span className="workspace-desk__crumb">Workspace</span>
            )}
          </div>
          <div className="workspace-desk__folder">
            <strong>{activeFolderLabel}</strong>
            {workspaceParentPath && (
              <button type="button" className="btn-ghost" onClick={() => void loadEntries(workspaceParentPath)}>
                Up
              </button>
            )}
          </div>
        </div>

        <div className="workspace-desk__controls">
          <input
            className="input workspace-desk__search"
            placeholder="Search files in the current folder..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="workspace-desk__sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as DeskSortMode)}
          >
            <option value="name-asc">Sort: Name</option>
            <option value="modified-desc">Sort: Updated</option>
            <option value="size-desc">Sort: Size</option>
          </select>
        </div>

        {workspaceRecentPreviews.length > 0 && (
          <div className="workspace-desk__recents">
            <span className="workspace-desk__recent-label">Recent</span>
            {workspaceRecentPreviews.map(item => (
              <button
                key={item.path}
                type="button"
                className="workspace-desk__recent-pill"
                onClick={() => void loadPreview(item.path)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {workspacePinnedPreviews.length > 0 && (
          <section className="workspace-desk__references">
            <div className="workspace-desk__references-head">
              <div>
                <div className="workspace-card__eyebrow">Reference Shelf</div>
                <div className="workspace-card__title">Pinned workspace context</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={() => setBoardOpen(true)}>
                  Open Board
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleSaveBundle}
                  disabled={workspacePinnedPreviews.length === 0 && !workspaceScratchpad.trim()}
                >
                  Save Pack
                </button>
                <button type="button" className="btn-ghost" onClick={injectPinnedBundle}>
                  Use Bundle
                </button>
              </div>
            </div>
            <div className="workspace-desk__references-grid">
              {workspacePinnedPreviews.map(item => (
                <article key={item.path} className="workspace-desk__reference-card">
                  <button
                    type="button"
                    className="workspace-desk__reference-main"
                    onClick={() => {
                      setWorkspaceActivePreviewPath(item.path);
                      setWorkspacePreviewOpen(true);
                    }}
                  >
                    <span className="workspace-desk__reference-title">{item.name}</span>
                    <span className="workspace-desk__reference-copy">{item.kind} · {item.path}</span>
                  </button>
                  <div className="workspace-desk__reference-actions">
                    <button type="button" className="btn-ghost" onClick={() => appendCommandDraft(buildPromptSnippet(item, false))}>
                      Path
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => unpinWorkspacePreview(item.path)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {scopedWorkspaceSavedBundles.length > 0 && (
          <section className="workspace-desk__references">
            <div className="workspace-desk__references-head">
              <div>
                <div className="workspace-card__eyebrow">Context Packs</div>
                <div className="workspace-card__title">Saved bundles for repeatable desk context</div>
              </div>
            </div>
            <div className="workspace-desk__references-grid">
              {scopedWorkspaceSavedBundles.map(bundle => (
                <article key={bundle.id} className="workspace-desk__reference-card">
                  <div className="workspace-desk__reference-main">
                    <span className="workspace-desk__reference-title">{bundle.name}</span>
                    <span className="workspace-desk__reference-copy">
                      {bundle.previews.length} refs · {bundle.notes.trim() ? "notes ready" : "no notes"} · {bundle.rootPath ?? "no root"}
                    </span>
                  </div>
                  <div className="workspace-desk__reference-actions">
                    <button type="button" className="btn-ghost" onClick={() => applyWorkspaceBundle(bundle.id)}>
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => appendCommandDraft(buildPinnedBundleSnippet(bundle.previews, bundle.notes))}
                    >
                      Use
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceBundle(bundle.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="workspace-desk__references workspace-desk__memories">
          <div className="workspace-desk__references-head">
            <div>
              <div className="workspace-card__eyebrow">Project Memory</div>
              <div className="workspace-card__title">Freeze the current workspace state into a reusable memory card</div>
            </div>
            <div className="workspace-desk__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => latestProjectMemory && setWorkspaceScratchpad(buildProjectMemoryScratchpad(latestProjectMemory))}
                disabled={!latestProjectMemory}
              >
                Load Latest
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveProjectMemory}
                disabled={!canSaveProjectMemory}
              >
                Save Memory
              </button>
            </div>
          </div>

          <div className="workspace-desk__memory-compose">
            <input
              className="input workspace-desk__memory-input"
              value={projectMemoryTitle}
              onChange={(event) => setProjectMemoryTitle(event.target.value)}
              placeholder="Optional memory name. Leave blank to auto-name from the current folder."
            />
            <div className="workspace-desk__memory-metrics">
              <span>{workspacePinnedPreviews.length} refs</span>
              <span>{sortedDeskNotes.length} notes</span>
              <span>{workspaceScratchpad.trim() ? "scratchpad ready" : "no scratchpad"}</span>
              <span>{workspaceRoot ?? "no root"}</span>
            </div>
          </div>

          {scopedWorkspaceProjectMemories.length === 0 ? (
            <div className="workspace-desk__empty workspace-desk__empty--memory">
              Save the current desk state once you have pinned references, rough notes, or a useful workspace root. This becomes your reusable codebase memory layer.
            </div>
          ) : (
            <div className="workspace-desk__memory-grid">
              {scopedWorkspaceProjectMemories.map(memory => (
                <article
                  key={memory.id}
                  className={`workspace-desk__memory-card ${activeWorkspaceProjectMemoryId === memory.id ? "is-active" : ""}`}
                >
                  <div className="workspace-desk__memory-head">
                    <div>
                      <div className="workspace-desk__memory-title">{memory.name}</div>
                      <div className="workspace-desk__reference-copy">
                        {formatTimestamp(memory.updatedAt)} · {describeProjectMemory(memory)}
                      </div>
                    </div>
                    <div className="workspace-desk__preview-badges">
                      {activeWorkspaceProjectMemoryId === memory.id && <span>active</span>}
                      {memory.focusPath && <span>focus ready</span>}
                      {memory.previews.length > 0 && <span>{memory.previews.length} refs</span>}
                    </div>
                  </div>

                  <div className="workspace-desk__memory-body">
                    <div className="workspace-desk__memory-line">
                      <span>Root</span>
                      <strong>{memory.rootPath ?? "No root captured"}</strong>
                    </div>
                    <div className="workspace-desk__memory-line">
                      <span>Focus</span>
                      <strong>{memory.focusPath ?? "No focus file captured"}</strong>
                    </div>
                    <div className="workspace-desk__memory-line">
                      <span>Notes</span>
                      <strong>{summarizeProjectMemoryNotes(memory)}</strong>
                    </div>
                    <p className="workspace-desk__memory-copy">
                      {memory.scratchpad.trim()
                        ? memory.scratchpad
                        : "No scratchpad snapshot was captured for this memory."}
                    </p>
                  </div>

                  {memory.deskNotes.length > 0 && (
                    <div className="workspace-desk__memory-note-list">
                      {memory.deskNotes.map(note => (
                        <span
                          key={`${memory.id}-${note.id}`}
                          className={`workspace-desk__memory-note workspace-desk__memory-note--${note.tone}`}
                        >
                          {note.title}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="workspace-desk__reference-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setActiveWorkspaceProjectMemory(memory.id)}
                    >
                      {activeWorkspaceProjectMemoryId === memory.id ? "Active" : "Activate"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => applyWorkspaceProjectMemory(memory.id)}>
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => appendCommandDraft(buildProjectMemorySnippet(memory))}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setWorkspaceScratchpad(buildProjectMemoryScratchpad(memory))}
                    >
                      Load Notes
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void handleOpenSystemPath(memory.rootPath)}
                      disabled={!memory.rootPath || !electronApi?.openWorkspacePath}
                    >
                      Reveal
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceProjectMemory(memory.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {(fileActions.length > 0 || folderActions.length > 0) && (
          <div className="workspace-desk__skills">
            {fileActions.length > 0 && (
              <section className="workspace-desk__skill-block">
                <div className="workspace-desk__skill-head">
                  <span>File Skills</span>
                  <strong>{activePreview?.name}</strong>
                </div>
                <div className="workspace-desk__skill-grid">
                  {fileActions.map(action => (
                    <button
                      key={action.id}
                      type="button"
                      className="workspace-desk__skill-card"
                      onClick={() => runDeskAction(action.id)}
                    >
                      <span className="workspace-desk__skill-title">{action.title}</span>
                      <span className="workspace-desk__skill-copy">{action.copy}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {folderActions.length > 0 && (
              <section className="workspace-desk__skill-block">
                <div className="workspace-desk__skill-head">
                  <span>Folder Skills</span>
                  <strong>{activeFolderLabel}</strong>
                </div>
                <div className="workspace-desk__skill-grid">
                  {folderActions.map(action => (
                    <button
                      key={action.id}
                      type="button"
                      className="workspace-desk__skill-card"
                      onClick={() => runDeskAction(action.id)}
                    >
                      <span className="workspace-desk__skill-title">{action.title}</span>
                      <span className="workspace-desk__skill-copy">{action.copy}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="workspace-desk__body">
          <div className="workspace-desk__files">
            <div className="workspace-desk__section-head">
              <span>Files</span>
              <span>{workspaceLoading ? "loading..." : `${visibleEntries.length} shown`}</span>
            </div>

            {!workspaceRoot && (
              <div className="workspace-desk__empty">
                Pick a local project folder to browse files and attach working context to the task flow.
              </div>
            )}

            {workspaceRoot && visibleEntries.length === 0 && !workspaceLoading && (
              <div className="workspace-desk__empty">
                {searchQuery.trim()
                  ? "No file matches the current search."
                  : "This folder is empty or no files are visible yet."}
              </div>
            )}

            <div className="workspace-desk__file-list">
              {visibleEntries.map(entry => {
                const active = workspaceSelectedPath === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className={`workspace-desk__file ${active ? "is-active" : ""}`}
                    onClick={() => void handleEntryClick(entry)}
                  >
                    <span className={`workspace-desk__file-icon ${entry.kind === "directory" ? "is-folder" : ""}`}>
                      {getEntryIcon(entry)}
                    </span>
                    <span className="workspace-desk__file-main">
                      <span className="workspace-desk__file-name">{entry.name}</span>
                      <span className="workspace-desk__file-meta">
                        {entry.kind === "directory" ? "folder" : formatBytes(entry.size)} · {formatTimestamp(entry.modifiedAt)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="workspace-desk__preview">
            <div className="workspace-desk__section-head">
              <span>{getPreviewTone(activePreview)}</span>
              <span>{activePreview ? formatBytes(activePreview.size) : "waiting"}</span>
            </div>

            {workspacePreviewTabs.length > 0 && (
              <div className="workspace-desk__tabs">
                {workspacePreviewTabs.map(item => (
                  <div
                    key={item.path}
                    className={`workspace-desk__tab ${workspaceActivePreviewPath === item.path ? "is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="workspace-desk__tab-button"
                      onClick={() => setWorkspaceActivePreviewPath(item.path)}
                    >
                      {item.name}
                    </button>
                    <button
                      type="button"
                      className="workspace-desk__tab-close"
                      onClick={() => closeWorkspacePreviewTab(item.path)}
                      aria-label={`Close ${item.name}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!activePreview && !workspacePreviewLoading && (
              <div className="workspace-desk__empty">
                Open a file to preview it, keep it in tabs, and send it into the command composer as context.
              </div>
            )}

            {workspacePreviewLoading && (
              <div className="workspace-desk__empty">Loading preview...</div>
            )}

            {activePreview && (
              <div className="workspace-desk__preview-card">
                <div className="workspace-desk__preview-meta">
                  <div>
                    <div className="workspace-desk__preview-name">{activePreview.name}</div>
                    <div className="workspace-desk__preview-subtitle">
                      {activePreview.path}
                    </div>
                  </div>
                  <div className="workspace-desk__preview-badges">
                    <span>{activePreview.kind}</span>
                    {activePreview.truncated && <span>truncated</span>}
                    {copied === activePreview.path && <span>copied</span>}
                  </div>
                </div>

                <div className="workspace-desk__preview-actions">
                  <button type="button" className="btn-ghost" onClick={() => injectPreview("path")}>
                    Add Path
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => injectPreview("context")}
                    disabled={activePreview.kind === "directory"}
                  >
                    Add Context
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void handleCopyPath(activePreview.path)}>
                    Copy Path
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => pinWorkspacePreview(activePreview)}
                    disabled={pinnedPaths.has(activePreview.path)}
                  >
                    {pinnedPaths.has(activePreview.path) ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void handlePopOutPreview()}
                    disabled={!electronApi?.openWorkspacePreviewWindow}
                  >
                    Pop Out
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setStudioOpen(true)}>
                    Studio
                  </button>
                </div>

                {renderPreviewContent(activePreview)}
              </div>
            )}
          </div>
        </div>

        <section className="workspace-desk__scratchpad">
          <div className="workspace-desk__scratchpad-head">
            <div>
              <div className="workspace-card__eyebrow">Desk Composer</div>
              <div className="workspace-card__title">Draft async notes before turning them into desk cards</div>
            </div>
            <div className="workspace-desk__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleSaveDeskNote}
                disabled={!workspaceScratchpad.trim()}
              >
                Save Note
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => appendCommandDraft(`Desk notes:\n${workspaceScratchpad.trim()}`)}
                disabled={!workspaceScratchpad.trim()}
              >
                Use Notes
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setWorkspaceScratchpad("")}
                disabled={!workspaceScratchpad}
              >
                Clear
              </button>
            </div>
          </div>
          <input
            className="input workspace-desk__note-title"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder="Optional note title. Leave blank to use the active file or timestamp."
          />
          <div className="workspace-desk__note-link">
            <span className="workspace-desk__recent-label">Linked file</span>
            <strong>{activePreview?.name ?? "No active preview linked"}</strong>
          </div>
          <textarea
            className="input workspace-desk__scratchpad-input"
            value={workspaceScratchpad}
            onChange={(event) => setWorkspaceScratchpad(event.target.value)}
            placeholder="Capture hypotheses, reminders, file relationships, or the task angle you want the team to follow..."
          />
        </section>

        {scopedDeskNotes.length > 0 && (
          <section className="workspace-desk__notes">
            <div className="workspace-desk__notes-head">
              <div>
                <div className="workspace-card__eyebrow">Desk Notes</div>
                <div className="workspace-card__title">Reusable async collaboration cards</div>
              </div>
              <div className="workspace-desk__preview-badges">
                <span>{scopedDeskNotes.length} saved</span>
                <span>{scopedDeskNotes.filter(note => note.pinned).length} pinned</span>
              </div>
            </div>
            <div className="workspace-desk__notes-grid">
              {scopedDeskNotes.map(note => (
                <article
                  key={note.id}
                  className={`workspace-desk__note-card workspace-desk__note-card--${note.tone} ${note.pinned ? "is-pinned" : ""}`}
                >
                  <div className="workspace-desk__note-meta">
                    <div>
                      <div className="workspace-desk__note-title-text">{note.title}</div>
                      <div className="workspace-desk__reference-copy">
                        {formatTimestamp(note.updatedAt)}
                        {note.rootPath ? ` · ${note.rootPath}` : ""}
                      </div>
                    </div>
                    <div className="workspace-desk__preview-badges">
                      {note.pinned && <span>pinned</span>}
                      {note.linkedKind && <span>{note.linkedKind}</span>}
                    </div>
                  </div>
                  {note.linkedPath && (
                    <button
                      type="button"
                      className="workspace-desk__note-link-card"
                      onClick={() => void handleLoadDeskNote(note)}
                    >
                      <span className="workspace-desk__recent-label">Linked reference</span>
                      <strong>{note.linkedName ?? note.linkedPath}</strong>
                    </button>
                  )}
                  <p className="workspace-desk__note-content">{note.content}</p>
                  <div className="workspace-desk__reference-actions">
                    <button type="button" className="btn-ghost" onClick={() => appendCommandDraft(buildDeskNoteSnippet(note))}>
                      Use
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void handleLoadDeskNote(note)}>
                      Load
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => toggleWorkspaceDeskNotePin(note.id)}>
                      {note.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceDeskNote(note.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>

      {studioOpen && activePreview && (
        <div className="workspace-desk__studio-overlay" onClick={() => setStudioOpen(false)}>
          <div className="workspace-desk__studio" onClick={(event) => event.stopPropagation()}>
            <div className="workspace-desk__studio-head">
              <div>
                <div className="workspace-card__eyebrow">Preview Studio</div>
                <div className="workspace-card__title">Focused reading and context handling</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={() => injectPreview("context")}>
                  Add Context
                </button>
                <button type="button" className="btn-ghost" onClick={() => void handleCopyPath(activePreview.path)}>
                  Copy Path
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => pinWorkspacePreview(activePreview)}
                  disabled={pinnedPaths.has(activePreview.path)}
                >
                  {pinnedPaths.has(activePreview.path) ? "Pinned" : "Pin"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handlePopOutPreview()}
                  disabled={!electronApi?.openWorkspacePreviewWindow}
                >
                  Pop Out
                </button>
                <button type="button" className="btn-primary" onClick={() => setStudioOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="workspace-desk__tabs workspace-desk__tabs--studio">
              {workspacePreviewTabs.map(item => (
                <div
                  key={item.path}
                  className={`workspace-desk__tab ${workspaceActivePreviewPath === item.path ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="workspace-desk__tab-button"
                    onClick={() => setWorkspaceActivePreviewPath(item.path)}
                  >
                    {item.name}
                  </button>
                  <button
                    type="button"
                    className="workspace-desk__tab-close"
                    onClick={() => closeWorkspacePreviewTab(item.path)}
                    aria-label={`Close ${item.name}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>

            <div className="workspace-desk__studio-body">
              <div className="workspace-desk__studio-meta">
                <div>
                  <div className="workspace-desk__preview-name">{activePreview.name}</div>
                  <div className="workspace-desk__preview-subtitle">{activePreview.path}</div>
                </div>
                <div className="workspace-desk__preview-badges">
                  <span>{activePreview.kind}</span>
                  <span>{formatBytes(activePreview.size)}</span>
                  <span>{formatTimestamp(activePreview.modifiedAt)}</span>
                </div>
              </div>
              <div className="workspace-desk__studio-content">
                {renderPreviewContent(activePreview)}
              </div>
            </div>
          </div>
        </div>
      )}

      {boardOpen && boardPreview && (
        <div className="workspace-desk__studio-overlay" onClick={() => setBoardOpen(false)}>
          <div className="workspace-desk__studio workspace-desk__board" onClick={(event) => event.stopPropagation()}>
            <div className="workspace-desk__board-head">
              <div>
                <div className="workspace-card__eyebrow">Reference Board</div>
                <div className="workspace-card__title">Pinned previews arranged for cross-reading</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={injectPinnedBundle}>
                  Use Bundle
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => appendCommandDraft(buildPromptSnippet(boardPreview, true))}
                >
                  Use Focused
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handlePopOutPreview(boardPreview)}
                  disabled={!electronApi?.openWorkspacePreviewWindow}
                >
                  Pop Out
                </button>
                <button type="button" className="btn-primary" onClick={() => setBoardOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="workspace-desk__board-body">
              <aside className="workspace-desk__board-rail">
                <div className="workspace-desk__section-head">
                  <span>Pinned Files</span>
                  <span>{workspacePinnedPreviews.length}</span>
                </div>
                <div className="workspace-desk__board-list">
                  {workspacePinnedPreviews.map(item => {
                    const active = item.path === boardPreview.path;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        className={`workspace-desk__board-item ${active ? "is-active" : ""}`}
                        onClick={() => setBoardActivePath(item.path)}
                      >
                        <div className="workspace-desk__board-item-main">
                          <span className="workspace-desk__reference-title">{item.name}</span>
                          <span className="workspace-desk__reference-copy">{item.kind}</span>
                        </div>
                        <span className="workspace-desk__reference-copy">{formatTimestamp(item.modifiedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="workspace-desk__board-preview">
                <div className="workspace-desk__board-head workspace-desk__board-head--inner">
                  <div>
                    <div className="workspace-desk__preview-name">{boardPreview.name}</div>
                    <div className="workspace-desk__preview-subtitle">{boardPreview.path}</div>
                  </div>
                  <div className="workspace-desk__preview-badges">
                    <span>{boardPreview.kind}</span>
                    <span>{formatBytes(boardPreview.size)}</span>
                    <span>{formatTimestamp(boardPreview.modifiedAt)}</span>
                  </div>
                </div>
                <div className="workspace-desk__board-content">
                  {renderPreviewContent(boardPreview)}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
