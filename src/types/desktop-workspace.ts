export type WorkspaceEntryKind = "file" | "directory";

export interface WorkspaceEntry {
  name: string;
  path: string;
  kind: WorkspaceEntryKind;
  extension: string;
  size: number;
  modifiedAt: number;
}

export interface WorkspaceListResult {
  rootPath: string;
  currentPath: string;
  parentPath: string | null;
  entries: WorkspaceEntry[];
}

export type WorkspacePreviewKind = "text" | "image" | "binary" | "unsupported" | "directory";

export interface WorkspacePreview {
  kind: WorkspacePreviewKind;
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  content?: string;
  dataUrl?: string;
  language?: string;
  truncated?: boolean;
  itemCount?: number;
  message?: string;
}

export interface WorkspaceReferenceBundle {
  id: string;
  name: string;
  createdAt: number;
  rootPath: string | null;
  previews: WorkspacePreview[];
  notes: string;
}

export type WorkspaceDeskNoteTone = "amber" | "mint" | "sky" | "rose";

export interface WorkspaceDeskNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  tone: WorkspaceDeskNoteTone;
  rootPath: string | null;
  linkedPath: string | null;
  linkedName: string | null;
  linkedKind: WorkspacePreviewKind | null;
}
