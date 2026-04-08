"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { randomId } from "@/lib/utils";
import type {
  AgentId,
  AgentStatus,
  Task,
  Activity,
  ExecutionEvent,
  ExecutionRunSource,
  ExecutionRunStatus,
  PlatformConnectionStatus,
} from "@/store/types";
import type { BusinessChannelSession } from "@/types/business-entities";
import type {
  DesktopInputControlPayload,
  DesktopInputControlResult,
  DesktopScreenshotPayload,
  DesktopScreenshotResult,
  NativeAppLaunchPayload,
  NativeAppLaunchResult,
  NativeInstalledApplication,
} from "@/types/electron-api";

type WsMessage =
  | { type: "connected" }
  | { type: "settings_ack" }
  | { type: "pong" }
  | { type: "desktop_launch_request"; requestId: string; payload: NativeAppLaunchPayload; executionRunId?: string; taskId?: string; sessionId?: string }
  | { type: "desktop_input_request"; requestId: string; payload: DesktopInputControlPayload; executionRunId?: string; taskId?: string; sessionId?: string }
  | { type: "desktop_capture_request"; requestId: string; payload?: DesktopScreenshotPayload; executionRunId?: string; sessionId?: string }
  | { type: "desktop_installed_apps_request"; requestId: string; payload?: { forceRefresh?: boolean } }
  | {
      type: "platform_status";
      platformId: string;
      status: PlatformConnectionStatus;
      errorMsg?: string;
      detail?: string;
      accountLabel?: string;
      webhookUrl?: string;
      healthScore?: number;
      pendingEvents?: number;
      lastSyncedAt?: number;
      lastCheckedAt?: number;
      lastEventAt?: number;
      lastInboundAt?: number;
      lastInboundMessageKey?: string;
      lastInboundTarget?: string;
      lastOutboundSuccessAt?: number;
      lastOutboundFailureAt?: number;
      outboundRetryCount?: number;
      outboundCooldownUntil?: number;
      lastDebugAction?: "send_test_message" | "simulate_inbound" | "diagnose" | "probe_webhook";
      lastDebugOk?: boolean;
      lastDebugStatus?: "sent" | "completed" | "failed";
      lastDebugMessage?: string;
      lastDebugTarget?: string;
      lastDebugAt?: number;
      recentFailedMessages?: Array<{
        target: string;
        message: string;
        reason: string;
        at: number;
        retryCount: number;
      }>;
      debugHistory?: Array<{
        action: "send_test_message" | "simulate_inbound" | "diagnose" | "probe_webhook";
        ok: boolean;
        status: "sent" | "completed" | "failed";
        target?: string;
        message: string;
        at: number;
      }>;
    }
  | {
      type: "channel_session_sync";
      session: Pick<BusinessChannelSession, "channel" | "externalRef">
        & Partial<Omit<BusinessChannelSession, "projectId" | "rootPath" | "createdAt" | "updatedAt">>;
    }
  | {
      type: "channel_event";
      session?: Pick<BusinessChannelSession, "channel" | "externalRef">
        & Partial<Omit<BusinessChannelSession, "projectId" | "rootPath" | "createdAt" | "updatedAt">>;
      sessionId?: string;
      title: string;
      detail: string;
      status: "pending" | "sent" | "blocked" | "completed" | "failed";
      trigger?: "manual" | "auto";
      eventType?: "connector" | "message";
      failureReason?: string;
      executionRunId?: string;
      workflowRunId?: string;
      externalRef?: string;
    }
  | {
      type: "channel_action_result";
      requestId: string;
      sessionId?: string;
      ok: boolean;
      message: string;
      failureReason?: string;
    }
  | { type: "agent_status"; agentId: AgentId; status: AgentStatus; currentTask?: string; executionRunId?: string }
  | { type: "task_add"; task: Task; executionRunId?: string }
  | { type: "task_stream_delta"; taskId: string; delta: string; executionRunId?: string }
  | { type: "task_update"; taskId: string; updates: Partial<Task>; executionRunId?: string }
  | {
      type: "assistant_reasoning";
      taskId: string;
      sessionId: string;
      agentId: AgentId;
      executionRunId?: string;
      summary?: string;
      detail?: string;
      status?: "running" | "done" | "failed";
      timestamp?: number;
    }
  | { type: "activity"; activity: Omit<Activity, "id">; executionRunId?: string }
  | { type: "cost"; agentId: AgentId; tokens: number }
  | {
      type: "execution_update";
      executionRunId: string;
      sessionId?: string;
      instruction?: string;
      source?: ExecutionRunSource;
      status?: ExecutionRunStatus;
      currentAgentId?: AgentId;
      totalTasks?: number;
      completedTasks?: number;
      failedTasks?: number;
      completedAt?: number;
      timestamp?: number;
      event?: ExecutionEvent;
    }
  | { type: "meeting_result"; topic?: string; result?: string; error?: string }
  | { type: "meeting_speech"; agentId: string; role: string; text: string; timestamp: number; meetingId?: string };

let _ws: WebSocket | null = null;
let _retryDelay = 1000;
let _retryCount = 0;
let _retryTimer: number | null = null;
let _isConnecting = false;
let _heartbeatTimer: number | null = null;
let _pongTimeoutTimer: number | null = null;
let _connectTimeoutTimer: number | null = null;

const WS_RETRY_MAX = 30000;
const WS_HEARTBEAT_INTERVAL = 15000;
const WS_PONG_TIMEOUT = 7000;
const WS_CONNECT_TIMEOUT = 8000;

function getStore() {
  return useStore.getState();
}

function syncSettingsToSocket() {
  if (_ws?.readyState !== WebSocket.OPEN) return;
  const {
    providers,
    agentConfigs,
    platformConfigs,
    userNickname,
    semanticMemoryConfig,
    desktopProgramSettings,
    hermesDispatchSettings,
  } = getStore();
  _ws.send(JSON.stringify({
    type: "settings_sync",
    providers,
    agentConfigs,
    platformConfigs,
    userNickname,
    semanticMemoryConfig,
    desktopProgramSettings,
    hermesDispatchSettings,
    runtime: {
      isElectron: Boolean(window.electronAPI?.isElectron),
      canLaunchNativeApplications: Boolean(window.electronAPI?.launchNativeApplication),
      canListInstalledApplications: Boolean(window.electronAPI?.listInstalledApplications),
      canControlDesktopInput: Boolean(window.electronAPI?.controlDesktopInput),
      canCaptureDesktopScreenshot: Boolean(window.electronAPI?.captureDesktopScreenshot),
    },
  }));

  for (const [platformId, config] of Object.entries(platformConfigs)) {
    if (config.enabled && Object.keys(config.fields).length > 0) {
      _ws.send(JSON.stringify({
        type: "platform_sync",
        platformId,
        enabled: true,
        fields: config.fields,
      }));
    }
  }
}

async function handleDesktopLaunchRequest(msg: Extract<WsMessage, { type: "desktop_launch_request" }>) {
  const {
    desktopProgramSettings,
  } = getStore();
  const sendResult = (payload: { ok: boolean; result?: NativeAppLaunchResult; error?: string }) => {
    if (_ws?.readyState !== WebSocket.OPEN) return;
    _ws.send(JSON.stringify({
      type: "desktop_launch_result",
      requestId: msg.requestId,
      ...payload,
    }));
  };

  if (!window.electronAPI?.launchNativeApplication) {
    sendResult({ ok: false, error: "当前客户端不是 Electron 桌面运行态，无法启动本机程序。" });
    return;
  }

  try {
    const result = await window.electronAPI.launchNativeApplication({
      ...msg.payload,
      policy: {
        enabled: desktopProgramSettings.enabled,
        whitelistMode: desktopProgramSettings.whitelistMode,
        whitelist: desktopProgramSettings.whitelist.map(item => ({
          label: item.label,
          target: item.target,
        })),
      },
    });
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendResult({ ok: false, error: message });
  }
}

function maybeFocusDesktopControlPanel(enabled: boolean) {
  if (!enabled) return;
  // Keep this toggle as a status reminder only.
  // Desktop evidence / execution state is still recorded in-store,
  // but we no longer auto-switch tabs or panels while the user is chatting.
}

function buildDesktopVerificationResumeInstruction(meta: {
  sessionId?: string;
  executionRunId?: string;
  taskId?: string;
  intent?: string;
  target?: string;
}) {
  const store = getStore();
  const task = meta.taskId ? store.tasks.find(item => item.id === meta.taskId) ?? null : null;
  const run = meta.executionRunId ? store.executionRuns.find(item => item.id === meta.executionRunId) ?? null : null;

  return [
    "验证码或验证步骤已由人工在桌面端完成，请从刚才中断的位置继续执行。",
    "不要重复打开程序，不要重复触发验证；先重新截图确认当前界面，再继续后续动作。",
    run?.instruction ? `原始运行指令: ${run.instruction}` : "",
    task?.description ? `当前任务: ${task.description}` : "",
    meta.intent ? `最近桌面意图: ${meta.intent}` : "",
    meta.target ? `目标界面/程序: ${meta.target}` : "",
    meta.executionRunId ? `关联运行ID: ${meta.executionRunId}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function appendDesktopExecutionEvent(meta: {
  executionRunId?: string;
  sessionId?: string;
  title: string;
  detail: string;
  type?: "system" | "error";
}) {
  if (!meta.executionRunId) return;
  const store = getStore();
  store.updateExecutionRun({
    id: meta.executionRunId,
    sessionId: meta.sessionId,
    timestamp: Date.now(),
    event: {
      id: `evt-desktop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: meta.type ?? "system",
      title: meta.title,
      detail: meta.detail,
      timestamp: Date.now(),
    },
  });
}

function updateExecutionRecovery(meta: {
  executionRunId?: string;
  sessionId?: string;
  status?: ExecutionRunStatus;
  recoveryState: "none" | "retryable" | "manual-required" | "blocked";
  lastFailureReason?: string;
  lastRecoveryHint?: string;
}) {
  if (!meta.executionRunId) return;
  const store = getStore();
  store.updateExecutionRun({
    id: meta.executionRunId,
    sessionId: meta.sessionId,
    ...(meta.status ? { status: meta.status } : {}),
    recoveryState: meta.recoveryState,
    lastFailureReason: meta.lastFailureReason,
    lastRecoveryHint: meta.lastRecoveryHint,
    timestamp: Date.now(),
  });
}

function recordDesktopBusinessOperation(meta: {
  executionRunId?: string;
  title: string;
  detail: string;
  status: "completed" | "failed" | "blocked";
  failureReason?: string;
}) {
  if (!meta.executionRunId) return;
  const store = getStore();
  const linkedRun = store.executionRuns.find(run => run.id === meta.executionRunId) ?? null;
  if (!linkedRun || linkedRun.entityType !== "contentTask" || !linkedRun.entityId) return;

  store.recordBusinessOperation({
    entityType: "contentTask",
    entityId: linkedRun.entityId,
    eventType: "desktop",
    trigger: "auto",
    status: meta.status,
    title: meta.title,
    detail: meta.detail,
    executionRunId: linkedRun.id,
    workflowRunId: linkedRun.workflowRunId,
    failureReason: meta.failureReason,
  });
}

function appendDesktopEvidence(meta: {
  kind: "input" | "screenshot" | "takeover" | "resume";
  status: "completed" | "failed" | "blocked" | "info";
  source: "agent" | "manual";
  summary: string;
  action?: string;
  intent?: string;
  target?: string;
  sessionId?: string;
  executionRunId?: string;
  taskId?: string;
  failureReason?: string;
  retryStrategy?: "visual-recheck-offset";
  retrySuggestions?: DesktopInputControlResult["retrySuggestions"];
  imageCaptured?: boolean;
  width?: number;
  height?: number;
  format?: "png" | "jpeg";
  takeoverBy?: "agent" | "manual";
  takeoverReason?: string;
  resumeInstruction?: string;
  resumeFrom?: string;
}) {
  getStore().appendDesktopEvidence(meta);
}

async function handleDesktopInputRequest(msg: Extract<WsMessage, { type: "desktop_input_request" }>) {
  const {
    desktopProgramSettings,
    setDesktopInputSession,
    setAutomationPaused,
  } = getStore();
  const sendResult = (payload: { ok: boolean; result?: DesktopInputControlResult; error?: string }) => {
    if (_ws?.readyState !== WebSocket.OPEN) return;
    _ws.send(JSON.stringify({
      type: "desktop_input_result",
      requestId: msg.requestId,
      ...payload,
    }));
  };

  setDesktopInputSession({
    state: "running",
    source: "agent",
    lastAction: msg.payload.action,
    lastIntent: msg.payload.intent,
    target: msg.payload.target,
    sessionId: msg.sessionId,
    executionRunId: msg.executionRunId,
    taskId: msg.taskId,
    resumeInstruction: undefined,
    retryStrategy: undefined,
    retrySuggestions: undefined,
    cursor: undefined,
    message: "数字员工正在接管鼠标键盘。",
  });

  if (!window.electronAPI?.controlDesktopInput) {
    const error = "当前客户端不是 Electron 桌面运行态，无法执行鼠标键盘接管。";
    maybeFocusDesktopControlPanel(desktopProgramSettings.inputControl.autoOpenPanelOnAction);
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: "桌面接管失败",
      detail: error,
      type: "error",
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: "桌面接管失败",
      detail: error,
      status: "failed",
      failureReason: error,
    });
    appendDesktopEvidence({
      kind: "input",
      status: "failed",
      source: "agent",
      summary: error,
      action: msg.payload.action,
      intent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      failureReason: error,
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "blocked",
      lastFailureReason: error,
      lastRecoveryHint: "当前运行环境没有桌面接管能力，请切回 Electron 桌面端或回到聊天接管。",
    });
    setDesktopInputSession({
      state: "error",
      source: "agent",
      lastAction: msg.payload.action,
      lastIntent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      retryStrategy: undefined,
      retrySuggestions: undefined,
      cursor: undefined,
      message: error,
    });
    sendResult({ ok: false, error });
    return;
  }

  try {
    const result = await window.electronAPI.controlDesktopInput({
      ...msg.payload,
      policy: {
        enabled: desktopProgramSettings.inputControl.enabled,
        requireManualTakeoverForVerification: desktopProgramSettings.inputControl.requireManualTakeoverForVerification,
      },
    });
    const retrySuggestionMessage = Array.isArray(result.retrySuggestions) && result.retrySuggestions.length > 0
      ? ` 可在复核失败时尝试偏移点：${result.retrySuggestions
          .slice(0, 3)
          .map(item => `${item.label}(${item.nextX},${item.nextY})`)
          .join(" / ")}。`
      : "";
    const resumeInstruction = result.manualRequired
      ? buildDesktopVerificationResumeInstruction({
          sessionId: msg.sessionId,
          executionRunId: msg.executionRunId,
          taskId: msg.taskId,
          intent: msg.payload.intent,
          target: msg.payload.target,
        })
      : undefined;
    if (result.manualRequired) {
      setAutomationPaused(true);
      maybeFocusDesktopControlPanel(desktopProgramSettings.inputControl.autoOpenPanelOnAction);
    }
    const resultDetail = result.manualRequired
      ? `${result.message} 已切到人工验证，目标 ${msg.payload.target || "当前桌面"}。`
      : `${result.message}${retrySuggestionMessage}`;
    setDesktopInputSession({
      state: result.manualRequired ? "manual-required" : "executed",
      source: "agent",
      lastAction: result.action,
      lastIntent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      resumeInstruction,
      retryStrategy: result.retryStrategy,
      retrySuggestions: result.retrySuggestions,
      cursor: result.cursor,
      message: result.manualRequired
        ? `${result.message} 已自动暂停自动化，待人工完成后可一键继续。`
        : resultDetail,
    });
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: result.manualRequired ? "桌面接管转人工" : "桌面接管完成",
      detail: result.manualRequired
        ? `${resultDetail} 已生成人工续跑提示。`
        : resultDetail,
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: result.manualRequired ? "桌面接管转人工" : "桌面接管完成",
      detail: result.manualRequired
        ? `${resultDetail} 已生成人工续跑提示。`
        : resultDetail,
      status: result.manualRequired ? "blocked" : "completed",
      failureReason: result.manualRequired ? "manual-verification-required" : undefined,
    });
    appendDesktopEvidence({
      kind: "input",
      status: result.manualRequired ? "blocked" : "completed",
      source: "agent",
      summary: result.manualRequired
        ? `${resultDetail} 已等待人工验证。`
        : resultDetail,
      action: result.action,
      intent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      failureReason: result.manualRequired ? "manual-verification-required" : undefined,
      retryStrategy: result.retryStrategy,
      retrySuggestions: result.retrySuggestions,
      takeoverBy: result.manualRequired ? "manual" : undefined,
      takeoverReason: result.manualRequired ? "verification-required" : undefined,
      resumeInstruction,
      resumeFrom: msg.payload.target || "当前桌面",
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: result.manualRequired ? "manual-required" : "none",
      lastFailureReason: result.manualRequired ? "manual-verification-required" : undefined,
      lastRecoveryHint: result.manualRequired
        ? "桌面验证完成后可一键继续执行，或回到聊天手动接管。"
        : undefined,
    });
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    maybeFocusDesktopControlPanel(desktopProgramSettings.inputControl.autoOpenPanelOnAction);
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: "桌面接管失败",
      detail: message,
      type: "error",
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: "桌面接管失败",
      detail: message,
      status: "failed",
      failureReason: message,
    });
    appendDesktopEvidence({
      kind: "input",
      status: "failed",
      source: "agent",
      summary: message,
      action: msg.payload.action,
      intent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      failureReason: message,
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "retryable",
      lastFailureReason: message,
      lastRecoveryHint: "可优先尝试偏移重试，仍失败时回到聊天接管。",
    });
    setDesktopInputSession({
      state: "error",
      source: "agent",
      lastAction: msg.payload.action,
      lastIntent: msg.payload.intent,
      target: msg.payload.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      taskId: msg.taskId,
      retryStrategy: undefined,
      retrySuggestions: undefined,
      cursor: undefined,
      message,
    });
    sendResult({ ok: false, error: message });
  }
}

async function handleDesktopCaptureRequest(msg: Extract<WsMessage, { type: "desktop_capture_request" }>) {
  const {
    desktopProgramSettings,
    setDesktopScreenshot,
  } = getStore();
  const sendResult = (payload: { ok: boolean; result?: DesktopScreenshotResult; error?: string }) => {
    if (_ws?.readyState !== WebSocket.OPEN) return;
    _ws.send(JSON.stringify({
      type: "desktop_capture_result",
      requestId: msg.requestId,
      ...payload,
    }));
  };

  appendDesktopExecutionEvent({
    executionRunId: msg.executionRunId,
    sessionId: msg.sessionId,
    title: "开始抓取桌面截图",
    detail: `目标 ${msg.payload?.target || "当前桌面"} · 用途 ${msg.payload?.intent || "桌面观察"}`,
  });

  setDesktopScreenshot({
    status: "capturing",
    source: "agent",
    target: msg.payload?.target,
    intent: msg.payload?.intent,
    sessionId: msg.sessionId,
    executionRunId: msg.executionRunId,
    message: "数字员工正在抓取当前桌面截图。",
  });

  if (!window.electronAPI?.captureDesktopScreenshot) {
    const error = "当前客户端不是 Electron 桌面运行态，无法抓取桌面截图。";
    maybeFocusDesktopControlPanel(desktopProgramSettings.inputControl.autoOpenPanelOnAction);
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: "桌面截图失败",
      detail: error,
      type: "error",
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: "桌面截图失败",
      detail: error,
      status: "failed",
      failureReason: error,
    });
    appendDesktopEvidence({
      kind: "screenshot",
      status: "failed",
      source: "agent",
      summary: error,
      intent: msg.payload?.intent,
      target: msg.payload?.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      failureReason: error,
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "blocked",
      lastFailureReason: error,
      lastRecoveryHint: "当前运行环境没有桌面截图能力，请切回 Electron 桌面端。",
    });
    setDesktopScreenshot({
      status: "error",
      source: "agent",
      target: msg.payload?.target,
      intent: msg.payload?.intent,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      message: error,
    });
    sendResult({ ok: false, error });
    return;
  }

  try {
    const result = await window.electronAPI.captureDesktopScreenshot(msg.payload);
    const captureDetail = `已抓取桌面截图 ${result.width}x${result.height} · 目标 ${msg.payload?.target || "当前桌面"} · 用途 ${msg.payload?.intent || "桌面观察"}`;
    setDesktopScreenshot({
      status: "ready",
      source: "agent",
      target: msg.payload?.target,
      intent: msg.payload?.intent,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      imageDataUrl: result.dataUrl,
      width: result.width,
      height: result.height,
      format: result.format,
      message: result.message,
    });
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: "桌面截图已就绪",
      detail: captureDetail,
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: "桌面截图已就绪",
      detail: captureDetail,
      status: "completed",
    });
    appendDesktopEvidence({
      kind: "screenshot",
      status: "completed",
      source: "agent",
      summary: captureDetail,
      intent: msg.payload?.intent,
      target: msg.payload?.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      imageCaptured: true,
      width: result.width,
      height: result.height,
      format: result.format,
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "none",
    });
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    maybeFocusDesktopControlPanel(desktopProgramSettings.inputControl.autoOpenPanelOnAction);
    appendDesktopExecutionEvent({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      title: "桌面截图失败",
      detail: message,
      type: "error",
    });
    recordDesktopBusinessOperation({
      executionRunId: msg.executionRunId,
      title: "桌面截图失败",
      detail: message,
      status: "failed",
      failureReason: message,
    });
    appendDesktopEvidence({
      kind: "screenshot",
      status: "failed",
      source: "agent",
      summary: message,
      intent: msg.payload?.intent,
      target: msg.payload?.target,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      failureReason: message,
    });
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "retryable",
      lastFailureReason: message,
      lastRecoveryHint: "可重新抓图确认当前界面，必要时回到聊天接管。",
    });
    setDesktopScreenshot({
      status: "error",
      source: "agent",
      target: msg.payload?.target,
      intent: msg.payload?.intent,
      sessionId: msg.sessionId,
      executionRunId: msg.executionRunId,
      message,
    });
    sendResult({ ok: false, error: message });
  }
}

async function handleDesktopInstalledAppsRequest(msg: Extract<WsMessage, { type: "desktop_installed_apps_request" }>) {
  const sendResult = (payload: { ok: boolean; result?: NativeInstalledApplication[]; error?: string }) => {
    if (_ws?.readyState !== WebSocket.OPEN) return;
    _ws.send(JSON.stringify({
      type: "desktop_installed_apps_result",
      requestId: msg.requestId,
      ...payload,
    }));
  };

  if (!window.electronAPI?.listInstalledApplications) {
    sendResult({ ok: false, error: "当前客户端不是 Electron 桌面运行态，无法读取本机程序列表。" });
    return;
  }

  try {
    const result = await window.electronAPI.listInstalledApplications(Boolean(msg.payload?.forceRefresh));
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendResult({ ok: false, error: message });
  }
}

function handleMessage(msg: WsMessage) {
  const {
    setAgentStatus,
    addTask,
    updateTask,
    appendTaskResult,
    addActivity,
    addCost,
    addTokens,
    addMeetingSpeech,
    setMeetingActive,
    finalizeMeeting,
    meetingTopic,
    updateExecutionRun,
    updatePlatformConfig,
    reconcilePlatformConfig,
    upsertBusinessChannelSession,
    recordBusinessOperation,
    setChannelActionResult,
    upsertAssistantReasoning,
  } = getStore();

  switch (msg.type) {
    case "agent_status":
      setAgentStatus(msg.agentId, msg.status, msg.currentTask);
      break;
    case "task_add":
      addTask(msg.task);
      break;
    case "task_update":
      updateTask(msg.taskId, msg.updates);
      break;
    case "task_stream_delta":
      appendTaskResult(msg.taskId, msg.delta);
      break;
    case "assistant_reasoning":
      upsertAssistantReasoning({
        taskId: msg.taskId,
        sessionId: msg.sessionId,
        agentId: msg.agentId,
        executionRunId: msg.executionRunId,
        summary: msg.summary,
        detail: msg.detail,
        status: msg.status,
        updatedAt: msg.timestamp,
      });
      break;
    case "activity":
      addActivity({ ...msg.activity, id: randomId() });
      break;
    case "execution_update":
      updateExecutionRun({
        id: msg.executionRunId,
        sessionId: msg.sessionId,
        instruction: msg.instruction,
        source: msg.source,
        status: msg.status,
        currentAgentId: msg.currentAgentId,
        totalTasks: msg.totalTasks,
        completedTasks: msg.completedTasks,
        failedTasks: msg.failedTasks,
        completedAt: msg.completedAt,
        timestamp: msg.timestamp,
        recoveryState:
          msg.status === "completed"
            ? "none"
            : msg.status === "failed"
              ? "retryable"
              : undefined,
        lastFailureReason:
          msg.status === "failed" && msg.event?.type === "error"
            ? msg.event.detail
            : undefined,
        lastRecoveryHint:
          msg.status === "failed"
            ? "可查看轨迹后重试，或回到聊天接管。"
            : undefined,
        event: msg.event,
      });
      break;
    case "cost":
      addCost(msg.agentId, msg.tokens);
      addTokens(msg.agentId, msg.tokens);
      break;
    case "platform_status":
      updatePlatformConfig(msg.platformId, {
        status: msg.status,
        errorMsg: msg.errorMsg,
        detail: msg.detail,
        accountLabel: msg.accountLabel,
        webhookUrl: msg.webhookUrl,
        healthScore: msg.healthScore,
        pendingEvents: msg.pendingEvents,
        lastSyncedAt: msg.lastSyncedAt,
        lastCheckedAt: msg.lastCheckedAt,
        lastEventAt: msg.lastEventAt,
        lastInboundAt: msg.lastInboundAt,
        lastInboundMessageKey: msg.lastInboundMessageKey,
        lastInboundTarget: msg.lastInboundTarget,
        lastOutboundSuccessAt: msg.lastOutboundSuccessAt,
        lastOutboundFailureAt: msg.lastOutboundFailureAt,
        outboundRetryCount: msg.outboundRetryCount,
        outboundCooldownUntil: msg.outboundCooldownUntil,
        lastDebugAction: msg.lastDebugAction,
        lastDebugOk: msg.lastDebugOk,
        lastDebugStatus: msg.lastDebugStatus,
        lastDebugMessage: msg.lastDebugMessage,
        lastDebugTarget: msg.lastDebugTarget,
        lastDebugAt: msg.lastDebugAt,
        recentFailedMessages: msg.recentFailedMessages,
        debugHistory: msg.debugHistory,
      });
      if (msg.status === "idle" || msg.status === "configured" || msg.status === "webhook_missing") {
        reconcilePlatformConfig(msg.platformId);
      }
      break;
    case "channel_session_sync":
      upsertBusinessChannelSession(msg.session);
      break;
    case "channel_event": {
      const sessionId = msg.session
        ? upsertBusinessChannelSession(msg.session)
        : msg.sessionId;
      if (sessionId) {
        recordBusinessOperation({
          entityType: "channelSession",
          entityId: sessionId,
          eventType: msg.eventType ?? "message",
          trigger: msg.trigger ?? "auto",
          status: msg.status,
          title: msg.title,
          detail: msg.detail,
          executionRunId: msg.executionRunId,
          workflowRunId: msg.workflowRunId,
          externalRef: msg.externalRef ?? msg.session?.externalRef,
          failureReason: msg.failureReason,
        });
      }
      break;
    }
    case "channel_action_result":
      setChannelActionResult({
        requestId: msg.requestId,
        sessionId: msg.sessionId,
        ok: msg.ok,
        message: msg.message,
        failureReason: msg.failureReason,
        at: Date.now(),
      });
      addActivity({
        id: randomId(),
        agentId: "orchestrator",
        type: msg.ok ? "tool_done" : "tool_fail",
        summary: msg.ok ? "渠道动作完成" : "渠道动作失败",
        detail: msg.failureReason ? `${msg.message} · ${msg.failureReason}` : msg.message,
        timestamp: Date.now(),
      });
      break;
    case "meeting_speech":
      addMeetingSpeech({
        id: randomId(),
        agentId: msg.agentId,
        role: msg.role as "open" | "speak" | "rebuttal" | "summary",
        text: msg.text,
        timestamp: msg.timestamp,
      });
      break;
    case "meeting_result":
      setMeetingActive(false);
      if (msg.result) {
        finalizeMeeting({
          topic: msg.topic ?? meetingTopic,
          summary: msg.result,
          finishedAt: Date.now(),
        });
      }
      break;
    default:
      break;
  }
}

async function getWsUrl(): Promise<string> {
  if (
    typeof window !== "undefined" &&
    (window as unknown as { electronAPI?: { getWsPort: () => Promise<number> } }).electronAPI
  ) {
    const port = await (window as unknown as { electronAPI: { getWsPort: () => Promise<number> } }).electronAPI.getWsPort();
    return `ws://127.0.0.1:${port}`;
  }
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:3001";
}

export function getWebSocket(): WebSocket | null {
  return _ws;
}

export function sendWs(msg: object): boolean {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function clearRetryTimer() {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

function clearHeartbeatTimers() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  if (_pongTimeoutTimer) {
    clearTimeout(_pongTimeoutTimer);
    _pongTimeoutTimer = null;
  }
}

function clearConnectTimeout() {
  if (_connectTimeoutTimer) {
    clearTimeout(_connectTimeoutTimer);
    _connectTimeoutTimer = null;
  }
}

function scheduleReconnect() {
  clearRetryTimer();
  _retryTimer = window.setTimeout(() => connectWebSocket(), _retryDelay);
  _retryDelay = Math.min(_retryDelay * 2, WS_RETRY_MAX);
}

function markHeartbeatReceived() {
  if (_pongTimeoutTimer) {
    clearTimeout(_pongTimeoutTimer);
    _pongTimeoutTimer = null;
  }
}

function startHeartbeat() {
  clearHeartbeatTimers();
  _heartbeatTimer = window.setInterval(() => {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      _ws.send(JSON.stringify({ type: "ping" }));
      markHeartbeatReceived();
      _pongTimeoutTimer = window.setTimeout(() => {
        try {
          _ws?.close();
        } catch {
          // Ignore best-effort close failures.
        }
      }, WS_PONG_TIMEOUT);
    } catch {
      try {
        _ws?.close();
      } catch {
        // Ignore best-effort close failures.
      }
    }
  }, WS_HEARTBEAT_INTERVAL);
}

export function connectWebSocket(force = false) {
  const { setWsStatus } = getStore();

  clearRetryTimer();

  if (!force && (_isConnecting || (_ws && _ws.readyState !== WebSocket.CLOSED))) {
    return;
  }

  if (force && _ws) {
    try {
      const staleSocket = _ws;
      staleSocket.onopen = null;
      staleSocket.onmessage = null;
      staleSocket.onerror = null;
      staleSocket.onclose = null;
      staleSocket.close();
    } catch {
      // Ignore best-effort close failures.
    }
    _ws = null;
  }

  _isConnecting = true;
  setWsStatus("connecting");

  getWsUrl().then((wsUrl) => {
    const socket = new WebSocket(wsUrl);
    _ws = socket;
    clearConnectTimeout();
    _connectTimeoutTimer = window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        try {
          socket.close();
        } catch {
          // Ignore best-effort close failures.
        }
      }
    }, WS_CONNECT_TIMEOUT);

    socket.onopen = () => {
      if (_ws !== socket) return;
      clearConnectTimeout();
      _retryDelay = 1000;
      _retryCount = 0;
      _isConnecting = false;
      getStore().setWsStatus("connected");
      startHeartbeat();

      window.setTimeout(() => {
        syncSettingsToSocket();
      }, 100);
    };

    socket.onmessage = (e) => {
      if (_ws !== socket) return;
      try {
        const message = JSON.parse(e.data as string) as WsMessage;
        if (message.type === "desktop_launch_request") {
          void handleDesktopLaunchRequest(message);
          return;
        }
        if (message.type === "desktop_input_request") {
          void handleDesktopInputRequest(message);
          return;
        }
        if (message.type === "desktop_capture_request") {
          void handleDesktopCaptureRequest(message);
          return;
        }
        if (message.type === "desktop_installed_apps_request") {
          void handleDesktopInstalledAppsRequest(message);
          return;
        }
        if (message.type === "pong") {
          markHeartbeatReceived();
          return;
        }
        handleMessage(message);
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    };

    socket.onclose = () => {
      if (_ws !== socket) return;
      _isConnecting = false;
      clearConnectTimeout();
      clearHeartbeatTimers();
      getStore().setWsStatus("disconnected");
      _retryCount += 1;
      _ws = null;
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (_ws !== socket) return;
      console.error("[WS] connection error", {
        url: wsUrl,
        readyState: socket.readyState,
        retryCount: _retryCount,
      });
      _isConnecting = false;
      try {
        socket.close();
      } catch {
        // Ignore best-effort close failures.
      }
    };
  }).catch((err) => {
    console.error("[WS] connect failed:", err);
    _isConnecting = false;
    clearConnectTimeout();
    clearHeartbeatTimers();
    setWsStatus("disconnected");
    scheduleReconnect();
  });
}

export function reconnectWebSocket() {
  _retryDelay = 1000;
  _retryCount = 0;
  connectWebSocket(true);
}

export function useWebSocket() {
  useEffect(() => {
    connectWebSocket();

    const reconnectIfNeeded = () => {
      if (getStore().wsStatus !== "connected") {
        reconnectWebSocket();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectIfNeeded();
      }
    };

    window.addEventListener("online", reconnectIfNeeded);
    window.addEventListener("focus", reconnectIfNeeded);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", reconnectIfNeeded);
      window.removeEventListener("focus", reconnectIfNeeded);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearRetryTimer();
      clearHeartbeatTimers();
      clearConnectTimeout();
    };
  }, []);
}
