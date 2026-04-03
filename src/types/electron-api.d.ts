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

export type DesktopInputAction =
  | "move"
  | "click"
  | "double_click"
  | "right_click"
  | "scroll"
  | "type"
  | "key"
  | "hotkey"
  | "wait";

export interface DesktopInputControlPayload {
  action: DesktopInputAction;
  target?: string;
  intent?: string;
  x?: number;
  y?: number;
  deltaY?: number;
  text?: string;
  key?: string;
  keys?: string[];
  durationMs?: number;
  riskCategory?: "normal" | "verification";
  policy?: {
    enabled: boolean;
    requireManualTakeoverForVerification: boolean;
  };
}

export interface DesktopInputRetrySuggestion {
  label: string;
  dx: number;
  dy: number;
  nextX: number;
  nextY: number;
}

export interface DesktopInputControlResult {
  ok: boolean;
  action: DesktopInputAction;
  message: string;
  mode: "executed" | "manual-handoff";
  manualRequired?: boolean;
  retryStrategy?: "visual-recheck-offset";
  retrySuggestions?: DesktopInputRetrySuggestion[];
  cursor?: {
    x: number;
    y: number;
  };
}

export interface DesktopScreenshotPayload {
  target?: string;
  intent?: string;
  maxWidth?: number;
  quality?: number;
}

export interface DesktopScreenshotResult {
  ok: boolean;
  message: string;
  dataUrl: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
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
      controlDesktopInput?: (payload: DesktopInputControlPayload) => Promise<DesktopInputControlResult>;
      captureDesktopScreenshot?: (payload?: DesktopScreenshotPayload) => Promise<DesktopScreenshotResult>;
      listInstalledApplications?: (forceRefresh?: boolean) => Promise<NativeInstalledApplication[]>;
      reloadDesktopWindow?: () => Promise<{ ok: boolean; message: string }>;
      relaunchDesktopApp?: () => Promise<{ ok: boolean; message: string }>;
    };
  }
}

export {};
