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

export interface HermesDispatchRuntimeStatus {
  command: string;
  available: boolean;
}

export interface HermesDispatchEnvironment {
  prototypeAvailable: boolean;
  repoRoot: string;
  prototypeRoot?: string;
  outputRoot: string;
  commands: {
    node: HermesDispatchRuntimeStatus;
    hermes: HermesDispatchRuntimeStatus;
    codex: HermesDispatchRuntimeStatus;
    claude: HermesDispatchRuntimeStatus;
    gemini: HermesDispatchRuntimeStatus;
  };
}

export interface HermesDispatchRequest {
  instruction?: string;
  mode: "plan-only" | "execute";
  planner: "hermes" | "sample-plan";
  configPath?: string;
}

export interface HermesDispatchTaskResult {
  status: "fulfilled" | "rejected";
  taskId: string;
  executor: "codex" | "claude" | "gemini";
  title: string;
  workdir?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface HermesDispatchResponse {
  ok: boolean;
  runDir: string;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  plan?: {
    summary: string;
    tasks: Array<{
      id: string;
      title: string;
      executor: "codex" | "claude" | "gemini";
      objective: string;
      workdir: string;
      dependsOn: string[];
    }>;
  };
  results?: HermesDispatchTaskResult[];
  summary?: {
    runDir: string;
    completed: number;
    failed: number;
  };
}

declare global {
  interface Window {
    __XLX_ELECTRON__?: boolean;
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
      inspectHermesDispatchEnvironment?: () => Promise<HermesDispatchEnvironment>;
      runHermesDispatchPrototype?: (payload: HermesDispatchRequest) => Promise<HermesDispatchResponse>;
      reloadDesktopWindow?: () => Promise<{ ok: boolean; message: string }>;
      relaunchDesktopApp?: () => Promise<{ ok: boolean; message: string }>;
    };
  }
}

export {};
