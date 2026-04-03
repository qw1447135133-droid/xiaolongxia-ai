import type { WorkspaceListResult, WorkspacePreview } from "@/types/desktop-workspace";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getWsPort: () => Promise<number>;
      selectWorkspaceFolder?: () => Promise<string | null>;
      listWorkspaceEntries?: (targetPath: string) => Promise<WorkspaceListResult>;
      readWorkspacePreview?: (targetPath: string) => Promise<WorkspacePreview>;
      openWorkspacePath?: (targetPath: string) => Promise<void>;
      openWorkspacePreviewWindow?: (preview: WorkspacePreview) => Promise<void>;
    };
  }
}

export {};
