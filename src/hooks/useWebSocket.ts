"use client";

import { useEffect } from "react";
import { applyDesktopLaunchNavigation } from "@/lib/desktop-launch-routing";
import { useStore } from "@/store";
import { randomId } from "@/lib/utils";
import type { AgentId, AgentStatus, Task, Activity, ExecutionEvent, ExecutionRunSource, ExecutionRunStatus } from "@/store/types";
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
  | { type: "agent_status"; agentId: AgentId; status: AgentStatus; currentTask?: string; executionRunId?: string }
  | { type: "task_add"; task: Task; executionRunId?: string }
  | { type: "task_update"; taskId: string; updates: Partial<Task>; executionRunId?: string }
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

const WS_MAX_RETRIES = 20;
const WS_RETRY_MAX = 30000;

function getStore() {
  return useStore.getState();
}

function syncSettingsToSocket() {
  if (_ws?.readyState !== WebSocket.OPEN) return;
  const { providers, agentConfigs, platformConfigs, userNickname, desktopProgramSettings, hermesDispatchSettings } = getStore();
  _ws.send(JSON.stringify({
    type: "settings_sync",
    providers,
    agentConfigs,
    userNickname,
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
    setTab,
    setActiveControlCenterSection,
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
    if (result.ok) {
      applyDesktopLaunchNavigation(msg.payload.target, {
        setTab,
        setActiveControlCenterSection,
      });
    }
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendResult({ ok: false, error: message });
  }
}

function focusDesktopControlPanel() {
  const { setTab, setActiveControlCenterSection } = getStore();
  setActiveControlCenterSection("desktop");
  setTab("settings");
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

  if (desktopProgramSettings.inputControl.autoOpenPanelOnAction) {
    focusDesktopControlPanel();
  }

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

  if (desktopProgramSettings.inputControl.autoOpenPanelOnAction) {
    focusDesktopControlPanel();
  }

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
    updateExecutionRecovery({
      executionRunId: msg.executionRunId,
      sessionId: msg.sessionId,
      recoveryState: "none",
    });
    sendResult({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
    addActivity,
    addCost,
    addTokens,
    addMeetingSpeech,
    setMeetingActive,
    finalizeMeeting,
    meetingTopic,
    updateExecutionRun,
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
    return `ws://localhost:${port}`;
  }
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
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

export function connectWebSocket(force = false) {
  const { setWsStatus } = getStore();

  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }

  if (!force && (_isConnecting || (_ws && _ws.readyState !== WebSocket.CLOSED))) {
    return;
  }

  if (force && _ws) {
    try {
      _ws.onclose = null;
      _ws.close();
    } catch {
      // Ignore best-effort close failures.
    }
    _ws = null;
  }

  _isConnecting = true;
  setWsStatus("connecting");

  getWsUrl().then((wsUrl) => {
    _ws = new WebSocket(wsUrl);

    _ws.onopen = () => {
      _retryDelay = 1000;
      _retryCount = 0;
      _isConnecting = false;
      getStore().setWsStatus("connected");

      window.setTimeout(() => {
        syncSettingsToSocket();
      }, 100);
    };

    _ws.onmessage = (e) => {
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
        handleMessage(message);
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    };

    _ws.onclose = () => {
      _isConnecting = false;
      getStore().setWsStatus("disconnected");
      _retryCount += 1;
      if (_retryCount <= WS_MAX_RETRIES) {
        _retryTimer = window.setTimeout(() => connectWebSocket(), _retryDelay);
        _retryDelay = Math.min(_retryDelay * 2, WS_RETRY_MAX);
      }
    };

    _ws.onerror = (err) => {
      console.error("[WS] error:", err);
      _isConnecting = false;
    };
  }).catch((err) => {
    console.error("[WS] connect failed:", err);
    _isConnecting = false;
    setWsStatus("disconnected");
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

    return () => {
      if (_retryTimer) {
        clearTimeout(_retryTimer);
        _retryTimer = null;
      }
    };
  }, []);
}
