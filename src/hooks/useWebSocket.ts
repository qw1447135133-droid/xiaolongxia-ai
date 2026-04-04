"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { randomId } from "@/lib/utils";
import type { AgentId, AgentStatus, Task, Activity } from "@/store/types";

type WsMessage =
  | { type: "connected" }
  | { type: "settings_ack" }
  | { type: "pong" }
  | { type: "agent_status"; agentId: AgentId; status: AgentStatus; currentTask?: string }
  | { type: "task_add"; task: Task }
  | { type: "task_update"; taskId: string; updates: Partial<Task> }
  | { type: "activity"; activity: Omit<Activity, "id"> }
  | { type: "cost"; agentId: AgentId; tokens: number }
  | { type: "meeting_result"; topic?: string; result?: string; error?: string }
  | { type: "meeting_speech"; agentId: string; role: string; text: string; timestamp: number; meetingId?: string };

let _ws: WebSocket | null = null;
let _retryDelay = 1000;
let _retryCount = 0;
let _retryTimer: number | null = null;
let _isConnecting = false;
let _lastWsUrl: string | null = null;
let _pendingSettingsSync: string | null = null;

const WS_MAX_RETRIES = 20;
const WS_RETRY_MAX = 30000;

function getStore() {
  return useStore.getState();
}

<<<<<<< Updated upstream
function syncSettingsToSocket() {
  if (_ws?.readyState !== WebSocket.OPEN) return;
  const { providers, agentConfigs, platformConfigs } = getStore();
  _ws.send(JSON.stringify({ type: "settings_sync", providers, agentConfigs }));
=======
function buildSettingsSyncPayload() {
  const { providers, agentConfigs, platformConfigs, userNickname, desktopProgramSettings } = getStore();
  return {
    type: "settings_sync",
    providers,
    agentConfigs,
    userNickname,
    desktopProgramSettings,
    runtime: {
      isElectron: Boolean(window.electronAPI?.isElectron),
      canLaunchNativeApplications: Boolean(window.electronAPI?.launchNativeApplication),
      canListInstalledApplications: Boolean(window.electronAPI?.listInstalledApplications),
      canControlDesktopInput: Boolean(window.electronAPI?.controlDesktopInput),
      canCaptureDesktopScreenshot: Boolean(window.electronAPI?.captureDesktopScreenshot),
    },
  };
}
>>>>>>> Stashed changes

function syncSettingsToSocket() {
  const payload = buildSettingsSyncPayload();
  const serialized = JSON.stringify(payload);

  if (_ws?.readyState !== WebSocket.OPEN) {
    _pendingSettingsSync = serialized;
    return;
  }

  _ws.send(serialized);
  _pendingSettingsSync = null;

  const { platformConfigs } = getStore();
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
  const serialized = (() => {
    const maybeSettingsSync = msg as { type?: string };
    if (maybeSettingsSync.type === "settings_sync") {
      return JSON.stringify(buildSettingsSyncPayload());
    }
    return JSON.stringify(msg);
  })();

  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(serialized);
    return true;
  }

  const maybeSettingsSync = msg as { type?: string };
  if (maybeSettingsSync.type === "settings_sync") {
    _pendingSettingsSync = serialized;
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
    _lastWsUrl = wsUrl;
    _ws = new WebSocket(wsUrl);

    _ws.onopen = () => {
      _retryDelay = 1000;
      _retryCount = 0;
      _isConnecting = false;
      getStore().setWsStatus("connected");

      window.setTimeout(() => {
        syncSettingsToSocket();
        if (_pendingSettingsSync && _ws?.readyState === WebSocket.OPEN) {
          _ws.send(_pendingSettingsSync);
          _pendingSettingsSync = null;
        }
      }, 100);
    };

    _ws.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data as string) as WsMessage);
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    };

    _ws.onclose = (event) => {
      _isConnecting = false;
      _ws = null;
      getStore().setWsStatus("disconnected");
      _retryCount += 1;
      const wasClean = typeof event?.wasClean === "boolean" ? event.wasClean : false;
      const reason = event?.reason ? ` reason=${event.reason}` : "";
      console.warn(`[WS] closed code=${event?.code ?? "unknown"} clean=${wasClean}${reason}`);
      if (_retryCount <= WS_MAX_RETRIES) {
        _retryTimer = window.setTimeout(() => connectWebSocket(), _retryDelay);
        _retryDelay = Math.min(_retryDelay * 2, WS_RETRY_MAX);
      }
    };

    _ws.onerror = (err) => {
      console.warn("[WS] transport error", {
        url: _lastWsUrl,
        readyState: _ws?.readyState ?? null,
      });
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
