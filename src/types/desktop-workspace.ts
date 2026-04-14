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
  projectId: string | null;
  rootPath: string | null;
  previews: WorkspacePreview[];
  notes: string;
}

export interface WorkspaceProjectMemoryNote {
  id: string;
  title: string;
  content: string;
  tone: WorkspaceDeskNoteTone;
  linkedPath: string | null;
  linkedName: string | null;
  linkedKind: WorkspacePreviewKind | null;
}

export interface WorkspaceProjectFact {
  id: string;
  key: string;
  summary: string;
  detail: string;
  sourceType: "world_model" | "execution" | "channel" | "operation";
  sourceLabel: string;
  sourceRunId?: string;
  sourceIds: string[];
  entityType?: string | null;
  entityId?: string | null;
  confidence: "high" | "medium";
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceProjectMemory {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  projectId: string | null;
  rootPath: string | null;
  focusPath: string | null;
  previews: WorkspacePreview[];
  scratchpad: string;
  deskNotes: WorkspaceProjectMemoryNote[];
  facts?: WorkspaceProjectFact[];
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
  projectId: string | null;
  rootPath: string | null;
  linkedPath: string | null;
  linkedName: string | null;
  linkedKind: WorkspacePreviewKind | null;
}
