import type { WorkspaceListResult, WorkspacePreview } from "@/types/desktop-workspace";
import type { VerificationStepResult, VerificationStatus } from "@/store/types";

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
      runWorkspaceVerification?: (targetPath: string) => Promise<{
        status: VerificationStatus;
        rootPath: string;
        results: VerificationStepResult[];
      }>;
    };
  }
}

export {};
