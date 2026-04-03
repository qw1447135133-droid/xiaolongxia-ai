import type { WorkspaceListResult, WorkspacePreview } from "@/types/desktop-workspace";
import type { VerificationStepResult, VerificationStatus } from "@/store/types";

export interface NativeAppLaunchPayload {
  target: string;
  args?: string[];
  cwd?: string;
  reason?: string;
  policy?: {
    enabled: boolean;
    whitelistMode: boolean;
    whitelist: Array<{
      label?: string;
      target: string;
    }>;
  };
}

export interface NativeAppLaunchResult {
  ok: boolean;
  method: "spawn" | "shell";
  message: string;
  pid?: number | null;
}

export interface NativeInstalledApplication {
  id: string;
  name: string;
  target: string;
  source: "registry" | "start-menu";
  location?: string;
}

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
      launchNativeApplication?: (payload: NativeAppLaunchPayload) => Promise<NativeAppLaunchResult>;
      listInstalledApplications?: (forceRefresh?: boolean) => Promise<NativeInstalledApplication[]>;
    };
  }
}

export {};
