"use client";

import { useEffect, useMemo, useState } from "react";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import {
  buildDeskNoteSnippet,
  buildProjectMemoryScratchpad,
  buildProjectMemorySnippet,
  describeProjectMemory,
} from "@/lib/workspace-memory";
import type { UiLocale } from "@/store/types";
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

function formatTimestamp(timestamp: number, locale: UiLocale) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat(locale, {
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

function getPreviewTone(locale: UiLocale, preview: WorkspacePreview | null) {
  switch (preview?.kind) {
    case "image":
      return pickLocaleText(locale, { "zh-CN": "图片", "zh-TW": "圖片", en: "Image", ja: "画像" });
    case "text":
      return preview.language?.toUpperCase() ?? pickLocaleText(locale, { "zh-CN": "文本", "zh-TW": "文本", en: "Text", ja: "テキスト" });
    case "directory":
      return pickLocaleText(locale, { "zh-CN": "文件夹", "zh-TW": "資料夾", en: "Folder", ja: "フォルダ" });
    case "binary":
      return pickLocaleText(locale, { "zh-CN": "二进制", "zh-TW": "二進位", en: "Binary", ja: "バイナリ" });
    case "unsupported":
      return pickLocaleText(locale, { "zh-CN": "元信息", "zh-TW": "中繼資訊", en: "Meta", ja: "メタ" });
    default:
      return pickLocaleText(locale, { "zh-CN": "预览", "zh-TW": "預覽", en: "Preview", ja: "プレビュー" });
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

function summarizeProjectMemoryNotes(locale: UiLocale, memory: WorkspaceProjectMemory) {
  if (memory.deskNotes.length === 0) {
    return pickLocaleText(locale, {
      "zh-CN": "没有便签快照",
      "zh-TW": "沒有便箋快照",
      en: "No note snapshots",
      ja: "ノートのスナップショットなし",
    });
  }
  return memory.deskNotes.map(note => note.title).join(" · ");
}

function summarizeProjectMemoryFacts(locale: UiLocale, memory: WorkspaceProjectMemory) {
  const facts = memory.facts ?? [];
  if (facts.length === 0) {
    return pickLocaleText(locale, {
      "zh-CN": "暂无结构化事实",
      "zh-TW": "暫無結構化事實",
      en: "No structured facts yet",
      ja: "構造化された事実はまだありません",
    });
  }
  return facts.slice(0, 3).map(fact => fact.summary).join(" · ");
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

function renderPreviewContent(locale: UiLocale, preview: WorkspacePreview) {
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
        <span>{pickLocaleText(locale, { "zh-CN": "类型", "zh-TW": "類型", en: "Type", ja: "種類" })}</span>
        <strong>{preview.kind}</strong>
      </div>
      <div className="workspace-desk__meta-item">
        <span>{pickLocaleText(locale, { "zh-CN": "更新于", "zh-TW": "更新於", en: "Updated", ja: "更新" })}</span>
        <strong>{formatTimestamp(preview.modifiedAt, locale)}</strong>
      </div>
      {typeof preview.itemCount === "number" && (
        <div className="workspace-desk__meta-item">
          <span>{pickLocaleText(locale, { "zh-CN": "项目数", "zh-TW": "項目數", en: "Items", ja: "項目数" })}</span>
          <strong>{preview.itemCount}</strong>
        </div>
      )}
      {preview.message && (
        <div className="workspace-desk__meta-item workspace-desk__meta-item--wide">
          <span>{pickLocaleText(locale, { "zh-CN": "提示", "zh-TW": "提示", en: "Message", ja: "メッセージ" })}</span>
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
  const locale = useStore(s => s.locale);

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
  const noFolderSelected = pickLocaleText(locale, {
    "zh-CN": "未选择文件夹",
    "zh-TW": "未選擇資料夾",
    en: "No folder selected",
    ja: "フォルダ未選択",
  });

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
    return [pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" }), ...parts];
  }, [locale, workspaceCurrentPath, workspaceRoot]);

  const activeFolderLabel = useMemo(() => {
    if (!workspaceCurrentPath) return noFolderSelected;
    const parts = workspaceCurrentPath.split(/[\\/]+/).filter(Boolean);
    return parts.at(-1) ?? workspaceCurrentPath;
  }, [noFolderSelected, workspaceCurrentPath]);

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
      {
        id: "summarize-file",
        title: pickLocaleText(locale, { "zh-CN": "总结文件", "zh-TW": "總結檔案", en: "Summarize File", ja: "ファイル要約" }),
        copy: pickLocaleText(locale, { "zh-CN": "把当前文件整理成精简摘要。", "zh-TW": "把目前檔案整理成精簡摘要。", en: "Turn this file into a concise brief.", ja: "このファイルを簡潔な要約にします。" }),
      },
      {
        id: "review-code",
        title: pickLocaleText(locale, { "zh-CN": "审查代码", "zh-TW": "審查代碼", en: "Review Code", ja: "コードレビュー" }),
        copy: pickLocaleText(locale, { "zh-CN": "检查 bug、回归风险和脆弱点。", "zh-TW": "檢查 bug、回歸風險和脆弱點。", en: "Look for bugs, regressions, and risky patterns.", ja: "不具合、回帰リスク、危険なパターンを確認します。" }),
      },
      {
        id: "extract-todos",
        title: pickLocaleText(locale, { "zh-CN": "提取待办", "zh-TW": "提取待辦", en: "Extract TODOs", ja: "TODO抽出" }),
        copy: pickLocaleText(locale, { "zh-CN": "提炼后续动作和缺口。", "zh-TW": "提煉後續動作和缺口。", en: "Pull follow-up tasks and implementation gaps.", ja: "後続タスクと実装ギャップを抽出します。" }),
      },
      {
        id: "explain-file",
        title: pickLocaleText(locale, { "zh-CN": "解释文件", "zh-TW": "解釋檔案", en: "Explain File", ja: "ファイル解説" }),
        copy: pickLocaleText(locale, { "zh-CN": "用通俗语言解释文件作用和结构。", "zh-TW": "用白話解釋檔案作用和結構。", en: "Translate the file into plain-language understanding.", ja: "ファイルの役割と構造を平易に説明します。" }),
      },
    ];
  }, [activePreview, locale]);

  const folderActions = useMemo(() => {
    if (!workspaceCurrentPath) return [];
    return [
      {
        id: "map-folder",
        title: pickLocaleText(locale, { "zh-CN": "梳理文件夹", "zh-TW": "梳理資料夾", en: "Map Folder", ja: "フォルダ整理" }),
        copy: pickLocaleText(locale, { "zh-CN": "概览结构和职责分工。", "zh-TW": "概覽結構和職責分工。", en: "Outline structure and responsibilities.", ja: "構造と責務を整理します。" }),
      },
      {
        id: "plan-folder",
        title: pickLocaleText(locale, { "zh-CN": "规划改动", "zh-TW": "規劃變更", en: "Plan Change", ja: "変更計画" }),
        copy: pickLocaleText(locale, { "zh-CN": "基于当前目录生成下一步实施计划。", "zh-TW": "基於目前目錄生成下一步實施計畫。", en: "Build a next-step implementation plan from this folder.", ja: "このフォルダから次の実装計画を作ります。" }),
      },
      {
        id: "find-risks",
        title: pickLocaleText(locale, { "zh-CN": "查找风险", "zh-TW": "查找風險", en: "Find Risks", ja: "リスク確認" }),
        copy: pickLocaleText(locale, { "zh-CN": "找出脆弱点和高概率回归区。", "zh-TW": "找出脆弱點和高機率回歸區。", en: "Identify fragile spots and likely regressions.", ja: "脆弱な箇所と回帰しやすい部分を見つけます。" }),
      },
      {
        id: "locate-entry",
        title: pickLocaleText(locale, { "zh-CN": "定位入口", "zh-TW": "定位入口", en: "Locate Entry Points", ja: "入口特定" }),
        copy: pickLocaleText(locale, { "zh-CN": "找到主流程和关键入口。", "zh-TW": "找到主流程和關鍵入口。", en: "Find the main flow and starting surfaces.", ja: "主なフローと入口を特定します。" }),
      },
    ];
  }, [locale, workspaceCurrentPath]);

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
      setWorkspaceError(error instanceof Error ? error.message : pickLocaleText(locale, {
        "zh-CN": "加载工作区失败",
        "zh-TW": "載入工作區失敗",
        en: "Failed to load workspace",
        ja: "ワークスペースの読み込みに失敗しました",
      }));
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
      setWorkspaceError(error instanceof Error ? error.message : pickLocaleText(locale, {
        "zh-CN": "加载预览失败",
        "zh-TW": "載入預覽失敗",
        en: "Failed to load preview",
        ja: "プレビューの読み込みに失敗しました",
      }));
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
      setWorkspaceError(pickLocaleText(locale, {
        "zh-CN": "当前环境无法使用剪贴板。",
        "zh-TW": "目前環境無法使用剪貼簿。",
        en: "Clipboard is unavailable in the current environment.",
        ja: "現在の環境ではクリップボードを利用できません。",
      }));
    }
  };

  const handleOpenSystemPath = async (targetPath: string | null) => {
    if (!targetPath || !electronApi?.openWorkspacePath) return;
    try {
      await electronApi.openWorkspacePath(targetPath);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : pickLocaleText(locale, {
        "zh-CN": "无法打开系统路径。",
        "zh-TW": "無法開啟系統路徑。",
        en: "Unable to open system path.",
        ja: "システムパスを開けません。",
      }));
    }
  };

  const handlePopOutPreview = async (preview: WorkspacePreview | null = activePreview) => {
    if (!preview || !electronApi?.openWorkspacePreviewWindow) return;
    try {
      await electronApi.openWorkspacePreviewWindow(preview);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : pickLocaleText(locale, {
        "zh-CN": "无法打开独立预览窗口。",
        "zh-TW": "無法開啟獨立預覽視窗。",
        en: "Unable to open detached preview window.",
        ja: "分離プレビューウィンドウを開けません。",
      }));
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
    const bundleLabel = `${activeFolderLabel === noFolderSelected
      ? pickLocaleText(locale, { "zh-CN": "工作台", "zh-TW": "工作台", en: "Desk", ja: "Desk" })
      : activeFolderLabel} ${pickLocaleText(locale, { "zh-CN": "上下文包", "zh-TW": "上下文包", en: "Pack", ja: "パック" })} ${formatTimestamp(Date.now(), locale)}`;
    saveWorkspaceBundle(bundleLabel);
  };

  const handleSaveProjectMemory = () => {
    if (!canSaveProjectMemory) return;
    const memoryLabel =
      projectMemoryTitle.trim() ||
      `${activeFolderLabel === noFolderSelected
        ? pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" })
        : activeFolderLabel} ${pickLocaleText(locale, { "zh-CN": "记忆", "zh-TW": "記憶", en: "Memory", ja: "メモリー" })} ${formatTimestamp(Date.now(), locale)}`;
    saveWorkspaceProjectMemory(memoryLabel);
    setProjectMemoryTitle("");
  };

  const handleSaveDeskNote = () => {
    if (!workspaceScratchpad.trim()) return;
    const normalizedTitle = noteTitle.trim() || activePreview?.name || `${pickLocaleText(locale, {
      "zh-CN": "工作台便签",
      "zh-TW": "工作台便箋",
      en: "Desk Note",
      ja: "Deskノート",
    })} ${formatTimestamp(Date.now(), locale)}`;
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
            <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "工作台工作区", "zh-TW": "工作台工作區", en: "Desk Workspace", ja: "Deskワークスペース" })}</div>
            <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "本地文件、搜索与预览工作室", "zh-TW": "本地檔案、搜尋與預覽工作室", en: "Local files, search, and preview studio", ja: "ローカルファイル、検索、プレビュースタジオ" })}</div>
          </div>
          <div className="workspace-desk__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleRefresh}
              disabled={!isAvailable || !workspaceCurrentPath || workspaceLoading}
            >
              {pickLocaleText(locale, { "zh-CN": "刷新", "zh-TW": "重新整理", en: "Refresh", ja: "更新" })}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void handleOpenSystemPath(activePreview?.path ?? workspaceCurrentPath ?? workspaceRoot)}
              disabled={!isAvailable || !electronApi?.openWorkspacePath || (!workspaceCurrentPath && !activePreview?.path && !workspaceRoot)}
            >
              {pickLocaleText(locale, { "zh-CN": "打开位置", "zh-TW": "打開位置", en: "Reveal", ja: "場所を開く" })}
            </button>
            <button type="button" className="btn-primary" onClick={handleChooseWorkspace} disabled={!isAvailable}>
              {workspaceRoot
                ? pickLocaleText(locale, { "zh-CN": "切换文件夹", "zh-TW": "切換資料夾", en: "Switch Folder", ja: "フォルダ切替" })
                : pickLocaleText(locale, { "zh-CN": "打开文件夹", "zh-TW": "打開資料夾", en: "Open Folder", ja: "フォルダを開く" })}
            </button>
          </div>
        </div>

        {!isAvailable && (
          <div className="workspace-desk__notice">
            {pickLocaleText(locale, {
              "zh-CN": "工作台文件浏览仅在 Electron 桌面端可用。",
              "zh-TW": "工作台檔案瀏覽僅在 Electron 桌面端可用。",
              en: "Desk workspace browsing is available in the Electron desktop runtime.",
              ja: "Desk ワークスペース閲覧は Electron デスクトップ環境でのみ利用できます。",
            })}
          </div>
        )}

        {workspaceError && <div className="workspace-desk__notice workspace-desk__notice--error">{workspaceError}</div>}

        <div className="workspace-desk__hero">
          <div>
            <div className="workspace-desk__hero-label">{pickLocaleText(locale, { "zh-CN": "当前根目录", "zh-TW": "目前根目錄", en: "Current Root", ja: "現在のルート" })}</div>
            <div className="workspace-desk__hero-value">{workspaceRoot ?? pickLocaleText(locale, { "zh-CN": "还没有选择本地文件夹", "zh-TW": "還沒有選擇本地資料夾", en: "No local folder selected yet", ja: "ローカルフォルダはまだ未選択です" })}</div>
          </div>
          <div className="workspace-desk__hero-meta">
            <span>{activeSession ? getSessionProjectLabel(activeSession) : pickLocaleText(locale, { "zh-CN": "通用项目", "zh-TW": "通用專案", en: "General", ja: "共通プロジェクト" })}</span>
            <span>{pickLocaleText(locale, {
              "zh-CN": `${workspaceEntries.length} 项`,
              "zh-TW": `${workspaceEntries.length} 項`,
              en: `${workspaceEntries.length} items`,
              ja: `${workspaceEntries.length} 件`,
            })}</span>
            <span>{workspacePreviewOpen
              ? pickLocaleText(locale, { "zh-CN": "预览运行中", "zh-TW": "預覽執行中", en: "preview live", ja: "プレビュー中" })
              : pickLocaleText(locale, { "zh-CN": "预览待机", "zh-TW": "預覽待機", en: "preview idle", ja: "プレビュー待機" })}</span>
            <span>{pickLocaleText(locale, {
              "zh-CN": `${workspacePreviewTabs.length} 个标签`,
              "zh-TW": `${workspacePreviewTabs.length} 個標籤`,
              en: `${workspacePreviewTabs.length} tabs`,
              ja: `${workspacePreviewTabs.length} タブ`,
            })}</span>
          </div>
        </div>

        <div className="workspace-desk__toolbar">
          <div className="workspace-desk__breadcrumbs">
            {breadcrumbs.length > 0 ? breadcrumbs.map((part, index) => (
              <span key={`${part}-${index}`} className="workspace-desk__crumb">
                {part}
              </span>
            )) : (
              <span className="workspace-desk__crumb">{pickLocaleText(locale, { "zh-CN": "工作区", "zh-TW": "工作區", en: "Workspace", ja: "ワークスペース" })}</span>
            )}
          </div>
          <div className="workspace-desk__folder">
            <strong>{activeFolderLabel}</strong>
            {workspaceParentPath && (
              <button type="button" className="btn-ghost" onClick={() => void loadEntries(workspaceParentPath)}>
                {pickLocaleText(locale, { "zh-CN": "上一级", "zh-TW": "上一層", en: "Up", ja: "上へ" })}
              </button>
            )}
          </div>
        </div>

        <div className="workspace-desk__controls">
          <input
            className="input workspace-desk__search"
            placeholder={pickLocaleText(locale, {
              "zh-CN": "搜索当前文件夹中的文件...",
              "zh-TW": "搜尋目前資料夾中的檔案...",
              en: "Search files in the current folder...",
              ja: "現在のフォルダ内を検索...",
            })}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="workspace-desk__sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as DeskSortMode)}
          >
            <option value="name-asc">{pickLocaleText(locale, { "zh-CN": "排序：名称", "zh-TW": "排序：名稱", en: "Sort: Name", ja: "並び順: 名前" })}</option>
            <option value="modified-desc">{pickLocaleText(locale, { "zh-CN": "排序：更新时间", "zh-TW": "排序：更新時間", en: "Sort: Updated", ja: "並び順: 更新" })}</option>
            <option value="size-desc">{pickLocaleText(locale, { "zh-CN": "排序：大小", "zh-TW": "排序：大小", en: "Sort: Size", ja: "並び順: サイズ" })}</option>
          </select>
        </div>

        {workspaceRecentPreviews.length > 0 && (
          <div className="workspace-desk__recents">
            <span className="workspace-desk__recent-label">{pickLocaleText(locale, { "zh-CN": "最近", "zh-TW": "最近", en: "Recent", ja: "最近" })}</span>
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
                <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "引用架", "zh-TW": "引用架", en: "Reference Shelf", ja: "参照シェルフ" })}</div>
                <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "已固定的工作区上下文", "zh-TW": "已固定的工作區上下文", en: "Pinned workspace context", ja: "固定されたワークスペース文脈" })}</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={() => setBoardOpen(true)}>
                  {pickLocaleText(locale, { "zh-CN": "打开看板", "zh-TW": "打開看板", en: "Open Board", ja: "ボードを開く" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleSaveBundle}
                  disabled={workspacePinnedPreviews.length === 0 && !workspaceScratchpad.trim()}
                >
                  {pickLocaleText(locale, { "zh-CN": "保存上下文包", "zh-TW": "保存上下文包", en: "Save Pack", ja: "パック保存" })}
                </button>
                <button type="button" className="btn-ghost" onClick={injectPinnedBundle}>
                  {pickLocaleText(locale, { "zh-CN": "使用整包", "zh-TW": "使用整包", en: "Use Bundle", ja: "まとめて使う" })}
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
                      {pickLocaleText(locale, { "zh-CN": "路径", "zh-TW": "路徑", en: "Path", ja: "パス" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => unpinWorkspacePreview(item.path)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
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
                <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "上下文包", "zh-TW": "上下文包", en: "Context Packs", ja: "コンテキストパック" })}</div>
                <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "可重复使用的工作台上下文包", "zh-TW": "可重複使用的工作台上下文包", en: "Saved bundles for repeatable desk context", ja: "再利用できる Desk コンテキスト" })}</div>
              </div>
            </div>
            <div className="workspace-desk__references-grid">
              {scopedWorkspaceSavedBundles.map(bundle => (
                <article key={bundle.id} className="workspace-desk__reference-card">
                  <div className="workspace-desk__reference-main">
                    <span className="workspace-desk__reference-title">{bundle.name}</span>
                    <span className="workspace-desk__reference-copy">
                      {pickLocaleText(locale, {
                        "zh-CN": `${bundle.previews.length} 个引用 · ${bundle.notes.trim() ? "便签已就绪" : "无便签"} · ${bundle.rootPath ?? "无根目录"}`,
                        "zh-TW": `${bundle.previews.length} 個引用 · ${bundle.notes.trim() ? "便箋已就緒" : "無便箋"} · ${bundle.rootPath ?? "無根目錄"}`,
                        en: `${bundle.previews.length} refs · ${bundle.notes.trim() ? "notes ready" : "no notes"} · ${bundle.rootPath ?? "no root"}`,
                        ja: `${bundle.previews.length} refs ・ ${bundle.notes.trim() ? "ノートあり" : "ノートなし"} ・ ${bundle.rootPath ?? "ルートなし"}`,
                      })}
                    </span>
                  </div>
                  <div className="workspace-desk__reference-actions">
                    <button type="button" className="btn-ghost" onClick={() => applyWorkspaceBundle(bundle.id)}>
                      {pickLocaleText(locale, { "zh-CN": "应用", "zh-TW": "套用", en: "Apply", ja: "適用" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => appendCommandDraft(buildPinnedBundleSnippet(bundle.previews, bundle.notes))}
                    >
                      {pickLocaleText(locale, { "zh-CN": "使用", "zh-TW": "使用", en: "Use", ja: "使う" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceBundle(bundle.id)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
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
              <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "项目记忆", "zh-TW": "專案記憶", en: "Project Memory", ja: "プロジェクト記憶" })}</div>
              <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "把当前工作区状态冻结成可复用的记忆卡", "zh-TW": "把目前工作區狀態凍結成可重用的記憶卡", en: "Freeze the current workspace state into a reusable memory card", ja: "現在のワークスペース状態を再利用できる記憶カードに保存する" })}</div>
            </div>
            <div className="workspace-desk__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => latestProjectMemory && setWorkspaceScratchpad(buildProjectMemoryScratchpad(latestProjectMemory))}
                disabled={!latestProjectMemory}
              >
                {pickLocaleText(locale, { "zh-CN": "载入最新", "zh-TW": "載入最新", en: "Load Latest", ja: "最新を読み込む" })}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveProjectMemory}
                disabled={!canSaveProjectMemory}
              >
                {pickLocaleText(locale, { "zh-CN": "保存记忆", "zh-TW": "保存記憶", en: "Save Memory", ja: "記憶を保存" })}
              </button>
            </div>
          </div>

          <div className="workspace-desk__memory-compose">
            <input
              className="input workspace-desk__memory-input"
              value={projectMemoryTitle}
              onChange={(event) => setProjectMemoryTitle(event.target.value)}
              placeholder={pickLocaleText(locale, { "zh-CN": "可选记忆名称，留空则按当前文件夹自动命名。", "zh-TW": "可選記憶名稱，留空則按目前資料夾自動命名。", en: "Optional memory name. Leave blank to auto-name from the current folder.", ja: "任意の記憶名。空欄なら現在のフォルダ名で自動命名します。" })}
            />
            <div className="workspace-desk__memory-metrics">
              <span>{pickLocaleText(locale, { "zh-CN": `${workspacePinnedPreviews.length} 个引用`, "zh-TW": `${workspacePinnedPreviews.length} 個引用`, en: `${workspacePinnedPreviews.length} refs`, ja: `${workspacePinnedPreviews.length} refs` })}</span>
              <span>{pickLocaleText(locale, { "zh-CN": `${sortedDeskNotes.length} 条便签`, "zh-TW": `${sortedDeskNotes.length} 條便箋`, en: `${sortedDeskNotes.length} notes`, ja: `${sortedDeskNotes.length} ノート` })}</span>
              <span>{workspaceScratchpad.trim()
                ? pickLocaleText(locale, { "zh-CN": "草稿已就绪", "zh-TW": "草稿已就緒", en: "scratchpad ready", ja: "スクラッチパッドあり" })
                : pickLocaleText(locale, { "zh-CN": "无草稿", "zh-TW": "無草稿", en: "no scratchpad", ja: "スクラッチパッドなし" })}</span>
              <span>{workspaceRoot ?? pickLocaleText(locale, { "zh-CN": "无根目录", "zh-TW": "無根目錄", en: "no root", ja: "ルートなし" })}</span>
            </div>
          </div>

          {scopedWorkspaceProjectMemories.length === 0 ? (
            <div className="workspace-desk__empty workspace-desk__empty--memory">
              {pickLocaleText(locale, {
                "zh-CN": "当你固定了引用、写好粗稿或选好了根目录后，就可以把当前工作台状态保存成可复用的代码库记忆层。",
                "zh-TW": "當你固定了引用、寫好草稿或選好了根目錄後，就可以把目前工作台狀態保存成可重用的代碼庫記憶層。",
                en: "Save the current desk state once you have pinned references, rough notes, or a useful workspace root. This becomes your reusable codebase memory layer.",
                ja: "参照、下書き、ルートフォルダが揃ったら現在の Desk 状態を保存できます。再利用できるコードベース記憶レイヤーになります。",
              })}
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
                        {formatTimestamp(memory.updatedAt, locale)} · {describeProjectMemory(memory)}
                      </div>
                    </div>
                    <div className="workspace-desk__preview-badges">
                      {activeWorkspaceProjectMemoryId === memory.id && <span>{pickLocaleText(locale, { "zh-CN": "当前", "zh-TW": "目前", en: "active", ja: "現在" })}</span>}
                      {memory.focusPath && <span>{pickLocaleText(locale, { "zh-CN": "焦点已就绪", "zh-TW": "焦點已就緒", en: "focus ready", ja: "フォーカス準備済み" })}</span>}
                      {memory.previews.length > 0 && <span>{pickLocaleText(locale, { "zh-CN": `${memory.previews.length} 个引用`, "zh-TW": `${memory.previews.length} 個引用`, en: `${memory.previews.length} refs`, ja: `${memory.previews.length} refs` })}</span>}
                    </div>
                  </div>

                  <div className="workspace-desk__memory-body">
                    <div className="workspace-desk__memory-line">
                      <span>{pickLocaleText(locale, { "zh-CN": "根目录", "zh-TW": "根目錄", en: "Root", ja: "ルート" })}</span>
                      <strong>{memory.rootPath ?? pickLocaleText(locale, { "zh-CN": "未记录根目录", "zh-TW": "未記錄根目錄", en: "No root captured", ja: "ルート未記録" })}</strong>
                    </div>
                    <div className="workspace-desk__memory-line">
                      <span>{pickLocaleText(locale, { "zh-CN": "焦点文件", "zh-TW": "焦點檔案", en: "Focus", ja: "フォーカス" })}</span>
                      <strong>{memory.focusPath ?? pickLocaleText(locale, { "zh-CN": "未记录焦点文件", "zh-TW": "未記錄焦點檔案", en: "No focus file captured", ja: "フォーカス未記録" })}</strong>
                    </div>
                    <div className="workspace-desk__memory-line">
                      <span>{pickLocaleText(locale, { "zh-CN": "便签", "zh-TW": "便箋", en: "Notes", ja: "ノート" })}</span>
                      <strong>{summarizeProjectMemoryNotes(locale, memory)}</strong>
                    </div>
                    <div className="workspace-desk__memory-line">
                      <span>{pickLocaleText(locale, { "zh-CN": "事实卡", "zh-TW": "事實卡", en: "Facts", ja: "ファクト" })}</span>
                      <strong>{summarizeProjectMemoryFacts(locale, memory)}</strong>
                    </div>
                    <p className="workspace-desk__memory-copy">
                      {memory.scratchpad.trim()
                        ? memory.scratchpad
                        : pickLocaleText(locale, { "zh-CN": "这条记忆没有记录草稿快照。", "zh-TW": "這條記憶沒有記錄草稿快照。", en: "No scratchpad snapshot was captured for this memory.", ja: "この記憶にはスクラッチパッドの記録がありません。" })}
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

                  {(memory.facts?.length ?? 0) > 0 && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {(memory.facts ?? []).slice(0, 4).map(fact => (
                        <div
                          key={`${memory.id}-${fact.id}`}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(148,163,184,0.18)",
                            background: "rgba(255,255,255,0.03)",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 12 }}>{fact.summary}</strong>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {fact.sourceType} · {fact.confidence}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, lineHeight: 1.7, color: "var(--text-muted)" }}>
                            {fact.detail}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            Source: {fact.sourceLabel}{fact.sourceRunId ? ` · run ${fact.sourceRunId.slice(0, 8)}` : ""} · {formatTimestamp(fact.updatedAt, locale)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="workspace-desk__reference-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setActiveWorkspaceProjectMemory(memory.id)}
                    >
                      {activeWorkspaceProjectMemoryId === memory.id
                        ? pickLocaleText(locale, { "zh-CN": "当前", "zh-TW": "目前", en: "Active", ja: "現在" })
                        : pickLocaleText(locale, { "zh-CN": "设为当前", "zh-TW": "設為目前", en: "Activate", ja: "有効化" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => applyWorkspaceProjectMemory(memory.id)}>
                      {pickLocaleText(locale, { "zh-CN": "恢复", "zh-TW": "恢復", en: "Restore", ja: "復元" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => appendCommandDraft(buildProjectMemorySnippet(memory))}
                    >
                      {pickLocaleText(locale, { "zh-CN": "使用", "zh-TW": "使用", en: "Use", ja: "使う" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setWorkspaceScratchpad(buildProjectMemoryScratchpad(memory))}
                    >
                      {pickLocaleText(locale, { "zh-CN": "载入便签", "zh-TW": "載入便箋", en: "Load Notes", ja: "ノート読込" })}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void handleOpenSystemPath(memory.rootPath)}
                      disabled={!memory.rootPath || !electronApi?.openWorkspacePath}
                    >
                      {pickLocaleText(locale, { "zh-CN": "打开位置", "zh-TW": "打開位置", en: "Reveal", ja: "場所を開く" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceProjectMemory(memory.id)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
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
                  <span>{pickLocaleText(locale, { "zh-CN": "文件技能", "zh-TW": "檔案技能", en: "File Skills", ja: "ファイルスキル" })}</span>
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
                  <span>{pickLocaleText(locale, { "zh-CN": "文件夹技能", "zh-TW": "資料夾技能", en: "Folder Skills", ja: "フォルダスキル" })}</span>
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
              <span>{pickLocaleText(locale, { "zh-CN": "文件", "zh-TW": "檔案", en: "Files", ja: "ファイル" })}</span>
              <span>{workspaceLoading
                ? pickLocaleText(locale, { "zh-CN": "加载中...", "zh-TW": "載入中...", en: "loading...", ja: "読み込み中..." })
                : pickLocaleText(locale, { "zh-CN": `显示 ${visibleEntries.length} 项`, "zh-TW": `顯示 ${visibleEntries.length} 項`, en: `${visibleEntries.length} shown`, ja: `${visibleEntries.length} 件表示` })}</span>
            </div>

            {!workspaceRoot && (
              <div className="workspace-desk__empty">
                {pickLocaleText(locale, { "zh-CN": "选择一个本地项目文件夹后，就可以浏览文件并把工作上下文接入任务流。", "zh-TW": "選擇一個本地專案資料夾後，就可以瀏覽檔案並把工作上下文接入任務流。", en: "Pick a local project folder to browse files and attach working context to the task flow.", ja: "ローカルのプロジェクトフォルダを選ぶと、ファイル閲覧と作業コンテキストの接続ができます。" })}
              </div>
            )}

            {workspaceRoot && visibleEntries.length === 0 && !workspaceLoading && (
              <div className="workspace-desk__empty">
                {searchQuery.trim()
                  ? pickLocaleText(locale, { "zh-CN": "当前搜索没有匹配文件。", "zh-TW": "目前搜尋沒有匹配檔案。", en: "No file matches the current search.", ja: "現在の検索に一致するファイルはありません。" })
                  : pickLocaleText(locale, { "zh-CN": "这个文件夹为空，或暂时没有可见文件。", "zh-TW": "這個資料夾為空，或暫時沒有可見檔案。", en: "This folder is empty or no files are visible yet.", ja: "このフォルダは空か、まだ表示できるファイルがありません。" })}
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
                        {entry.kind === "directory"
                          ? pickLocaleText(locale, { "zh-CN": "文件夹", "zh-TW": "資料夾", en: "folder", ja: "フォルダ" })
                          : formatBytes(entry.size)} · {formatTimestamp(entry.modifiedAt, locale)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="workspace-desk__preview">
            <div className="workspace-desk__section-head">
              <span>{getPreviewTone(locale, activePreview)}</span>
              <span>{activePreview ? formatBytes(activePreview.size) : pickLocaleText(locale, { "zh-CN": "等待中", "zh-TW": "等待中", en: "waiting", ja: "待機中" })}</span>
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
                      aria-label={`${pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })} ${item.name}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!activePreview && !workspacePreviewLoading && (
              <div className="workspace-desk__empty">
                {pickLocaleText(locale, { "zh-CN": "打开一个文件后，你可以预览、保留多标签，并把它作为上下文送进命令编辑器。", "zh-TW": "打開一個檔案後，你可以預覽、保留多標籤，並把它作為上下文送進命令編輯器。", en: "Open a file to preview it, keep it in tabs, and send it into the command composer as context.", ja: "ファイルを開くと、プレビュー、タブ保持、コマンド入力欄への文脈注入ができます。" })}
              </div>
            )}

            {workspacePreviewLoading && (
              <div className="workspace-desk__empty">{pickLocaleText(locale, { "zh-CN": "预览加载中...", "zh-TW": "預覽載入中...", en: "Loading preview...", ja: "プレビュー読み込み中..." })}</div>
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
                    {activePreview.truncated && <span>{pickLocaleText(locale, { "zh-CN": "已截断", "zh-TW": "已截斷", en: "truncated", ja: "省略あり" })}</span>}
                    {copied === activePreview.path && <span>{pickLocaleText(locale, { "zh-CN": "已复制", "zh-TW": "已複製", en: "copied", ja: "コピー済み" })}</span>}
                  </div>
                </div>

                <div className="workspace-desk__preview-actions">
                  <button type="button" className="btn-ghost" onClick={() => injectPreview("path")}>
                    {pickLocaleText(locale, { "zh-CN": "添加路径", "zh-TW": "加入路徑", en: "Add Path", ja: "パスを追加" })}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => injectPreview("context")}
                    disabled={activePreview.kind === "directory"}
                  >
                    {pickLocaleText(locale, { "zh-CN": "添加上下文", "zh-TW": "加入上下文", en: "Add Context", ja: "文脈を追加" })}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void handleCopyPath(activePreview.path)}>
                    {pickLocaleText(locale, { "zh-CN": "复制路径", "zh-TW": "複製路徑", en: "Copy Path", ja: "パスをコピー" })}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => pinWorkspacePreview(activePreview)}
                    disabled={pinnedPaths.has(activePreview.path)}
                  >
                    {pinnedPaths.has(activePreview.path)
                      ? pickLocaleText(locale, { "zh-CN": "已固定", "zh-TW": "已固定", en: "Pinned", ja: "固定済み" })
                      : pickLocaleText(locale, { "zh-CN": "固定", "zh-TW": "固定", en: "Pin", ja: "固定" })}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void handlePopOutPreview()}
                    disabled={!electronApi?.openWorkspacePreviewWindow}
                  >
                    {pickLocaleText(locale, { "zh-CN": "弹出窗口", "zh-TW": "彈出視窗", en: "Pop Out", ja: "別ウィンドウ" })}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setStudioOpen(true)}>
                    {pickLocaleText(locale, { "zh-CN": "工作室", "zh-TW": "工作室", en: "Studio", ja: "スタジオ" })}
                  </button>
                </div>

                {renderPreviewContent(locale, activePreview)}
              </div>
            )}
          </div>
        </div>

        <section className="workspace-desk__scratchpad">
          <div className="workspace-desk__scratchpad-head">
            <div>
              <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "工作台编写区", "zh-TW": "工作台編寫區", en: "Desk Composer", ja: "Deskコンポーザー" })}</div>
              <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "先写异步草稿，再转成工作台卡片", "zh-TW": "先寫非同步草稿，再轉成工作台卡片", en: "Draft async notes before turning them into desk cards", ja: "非同期ノートを書いてから Desk カードへ変換" })}</div>
            </div>
            <div className="workspace-desk__actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={handleSaveDeskNote}
                disabled={!workspaceScratchpad.trim()}
              >
                {pickLocaleText(locale, { "zh-CN": "保存便签", "zh-TW": "保存便箋", en: "Save Note", ja: "ノート保存" })}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => appendCommandDraft(`Desk notes:\n${workspaceScratchpad.trim()}`)}
                disabled={!workspaceScratchpad.trim()}
              >
                {pickLocaleText(locale, { "zh-CN": "使用便签", "zh-TW": "使用便箋", en: "Use Notes", ja: "ノートを使う" })}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setWorkspaceScratchpad("")}
                disabled={!workspaceScratchpad}
              >
                {pickLocaleText(locale, { "zh-CN": "清空", "zh-TW": "清空", en: "Clear", ja: "クリア" })}
              </button>
            </div>
          </div>
          <input
            className="input workspace-desk__note-title"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder={pickLocaleText(locale, { "zh-CN": "可选便签标题，留空则使用当前文件名或时间。", "zh-TW": "可選便箋標題，留空則使用目前檔名或時間。", en: "Optional note title. Leave blank to use the active file or timestamp.", ja: "任意のノート名。空欄なら現在のファイル名か時刻を使います。" })}
          />
          <div className="workspace-desk__note-link">
            <span className="workspace-desk__recent-label">{pickLocaleText(locale, { "zh-CN": "关联文件", "zh-TW": "關聯檔案", en: "Linked file", ja: "関連ファイル" })}</span>
            <strong>{activePreview?.name ?? pickLocaleText(locale, { "zh-CN": "当前没有关联预览", "zh-TW": "目前沒有關聯預覽", en: "No active preview linked", ja: "関連プレビューなし" })}</strong>
          </div>
          <textarea
            className="input workspace-desk__scratchpad-input"
            value={workspaceScratchpad}
            onChange={(event) => setWorkspaceScratchpad(event.target.value)}
            placeholder={pickLocaleText(locale, { "zh-CN": "记录假设、提醒、文件关系，或希望团队沿着哪个任务角度继续推进...", "zh-TW": "記錄假設、提醒、檔案關係，或希望團隊沿著哪個任務角度繼續推進...", en: "Capture hypotheses, reminders, file relationships, or the task angle you want the team to follow...", ja: "仮説、メモ、ファイル関係、チームに追ってほしい進め方を記録..." })}
          />
        </section>

        {scopedDeskNotes.length > 0 && (
          <section className="workspace-desk__notes">
            <div className="workspace-desk__notes-head">
              <div>
                <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "工作台便签", "zh-TW": "工作台便箋", en: "Desk Notes", ja: "Deskノート" })}</div>
                <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "可复用的异步协作卡片", "zh-TW": "可重用的非同步協作卡片", en: "Reusable async collaboration cards", ja: "再利用できる非同期コラボカード" })}</div>
              </div>
              <div className="workspace-desk__preview-badges">
                <span>{pickLocaleText(locale, { "zh-CN": `${scopedDeskNotes.length} 条已保存`, "zh-TW": `${scopedDeskNotes.length} 條已保存`, en: `${scopedDeskNotes.length} saved`, ja: `${scopedDeskNotes.length} 件保存済み` })}</span>
                <span>{pickLocaleText(locale, { "zh-CN": `${scopedDeskNotes.filter(note => note.pinned).length} 条已固定`, "zh-TW": `${scopedDeskNotes.filter(note => note.pinned).length} 條已固定`, en: `${scopedDeskNotes.filter(note => note.pinned).length} pinned`, ja: `${scopedDeskNotes.filter(note => note.pinned).length} 件固定済み` })}</span>
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
                        {formatTimestamp(note.updatedAt, locale)}
                        {note.rootPath ? ` · ${note.rootPath}` : ""}
                      </div>
                    </div>
                    <div className="workspace-desk__preview-badges">
                      {note.pinned && <span>{pickLocaleText(locale, { "zh-CN": "已固定", "zh-TW": "已固定", en: "pinned", ja: "固定済み" })}</span>}
                      {note.linkedKind && <span>{note.linkedKind}</span>}
                    </div>
                  </div>
                  {note.linkedPath && (
                    <button
                      type="button"
                      className="workspace-desk__note-link-card"
                      onClick={() => void handleLoadDeskNote(note)}
                    >
                      <span className="workspace-desk__recent-label">{pickLocaleText(locale, { "zh-CN": "关联引用", "zh-TW": "關聯引用", en: "Linked reference", ja: "関連参照" })}</span>
                      <strong>{note.linkedName ?? note.linkedPath}</strong>
                    </button>
                  )}
                  <p className="workspace-desk__note-content">{note.content}</p>
                  <div className="workspace-desk__reference-actions">
                    <button type="button" className="btn-ghost" onClick={() => appendCommandDraft(buildDeskNoteSnippet(note))}>
                      {pickLocaleText(locale, { "zh-CN": "使用", "zh-TW": "使用", en: "Use", ja: "使う" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void handleLoadDeskNote(note)}>
                      {pickLocaleText(locale, { "zh-CN": "载入", "zh-TW": "載入", en: "Load", ja: "読込" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => toggleWorkspaceDeskNotePin(note.id)}>
                      {note.pinned
                        ? pickLocaleText(locale, { "zh-CN": "取消固定", "zh-TW": "取消固定", en: "Unpin", ja: "固定解除" })
                        : pickLocaleText(locale, { "zh-CN": "固定", "zh-TW": "固定", en: "Pin", ja: "固定" })}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => deleteWorkspaceDeskNote(note.id)}>
                      {pickLocaleText(locale, { "zh-CN": "移除", "zh-TW": "移除", en: "Remove", ja: "削除" })}
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
                <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "预览工作室", "zh-TW": "預覽工作室", en: "Preview Studio", ja: "プレビュースタジオ" })}</div>
                <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "专注阅读与上下文处理", "zh-TW": "專注閱讀與上下文處理", en: "Focused reading and context handling", ja: "集中読解とコンテキスト処理" })}</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={() => injectPreview("context")}>
                  {pickLocaleText(locale, { "zh-CN": "添加上下文", "zh-TW": "加入上下文", en: "Add Context", ja: "文脈を追加" })}
                </button>
                <button type="button" className="btn-ghost" onClick={() => void handleCopyPath(activePreview.path)}>
                  {pickLocaleText(locale, { "zh-CN": "复制路径", "zh-TW": "複製路徑", en: "Copy Path", ja: "パスをコピー" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => pinWorkspacePreview(activePreview)}
                  disabled={pinnedPaths.has(activePreview.path)}
                >
                  {pinnedPaths.has(activePreview.path)
                    ? pickLocaleText(locale, { "zh-CN": "已固定", "zh-TW": "已固定", en: "Pinned", ja: "固定済み" })
                    : pickLocaleText(locale, { "zh-CN": "固定", "zh-TW": "固定", en: "Pin", ja: "固定" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handlePopOutPreview()}
                  disabled={!electronApi?.openWorkspacePreviewWindow}
                >
                  {pickLocaleText(locale, { "zh-CN": "弹出窗口", "zh-TW": "彈出視窗", en: "Pop Out", ja: "別ウィンドウ" })}
                </button>
                <button type="button" className="btn-primary" onClick={() => setStudioOpen(false)}>
                  {pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })}
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
                      aria-label={`${pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })} ${item.name}`}
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
                  <span>{formatTimestamp(activePreview.modifiedAt, locale)}</span>
                </div>
              </div>
              <div className="workspace-desk__studio-content">
                {renderPreviewContent(locale, activePreview)}
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
                <div className="workspace-card__eyebrow">{pickLocaleText(locale, { "zh-CN": "引用看板", "zh-TW": "引用看板", en: "Reference Board", ja: "参照ボード" })}</div>
                <div className="workspace-card__title">{pickLocaleText(locale, { "zh-CN": "把固定预览排成便于交叉阅读的看板", "zh-TW": "把固定預覽排成便於交叉閱讀的看板", en: "Pinned previews arranged for cross-reading", ja: "固定プレビューを横断参照しやすく並べたボード" })}</div>
              </div>
              <div className="workspace-desk__actions">
                <button type="button" className="btn-ghost" onClick={injectPinnedBundle}>
                  {pickLocaleText(locale, { "zh-CN": "使用整包", "zh-TW": "使用整包", en: "Use Bundle", ja: "まとめて使う" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => appendCommandDraft(buildPromptSnippet(boardPreview, true))}
                >
                  {pickLocaleText(locale, { "zh-CN": "使用当前焦点", "zh-TW": "使用目前焦點", en: "Use Focused", ja: "現在の焦点を使う" })}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handlePopOutPreview(boardPreview)}
                  disabled={!electronApi?.openWorkspacePreviewWindow}
                >
                  {pickLocaleText(locale, { "zh-CN": "弹出窗口", "zh-TW": "彈出視窗", en: "Pop Out", ja: "別ウィンドウ" })}
                </button>
                <button type="button" className="btn-primary" onClick={() => setBoardOpen(false)}>
                  {pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Close", ja: "閉じる" })}
                </button>
              </div>
            </div>

            <div className="workspace-desk__board-body">
              <aside className="workspace-desk__board-rail">
                <div className="workspace-desk__section-head">
                  <span>{pickLocaleText(locale, { "zh-CN": "已固定文件", "zh-TW": "已固定檔案", en: "Pinned Files", ja: "固定ファイル" })}</span>
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
                        <span className="workspace-desk__reference-copy">{formatTimestamp(item.modifiedAt, locale)}</span>
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
                    <span>{formatTimestamp(boardPreview.modifiedAt, locale)}</span>
                  </div>
                </div>
                <div className="workspace-desk__board-content">
                  {renderPreviewContent(locale, boardPreview)}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
