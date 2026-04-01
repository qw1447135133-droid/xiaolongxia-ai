"use client";
import { useEffect, useRef } from "react";
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
  | { type: "meeting_result"; result?: string; error?: string }
  | { type: "meeting_speech"; agentId: string; role: string; text: string; timestamp: number; meetingId?: string };

// 模块级单例（参考 openhanako websocket.ts）
let _ws: WebSocket | null = null;
let _retryDelay = 1000;
let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _isConnecting = false; // 防止并发连接
const WS_MAX_RETRIES = 20;
const WS_RETRY_MAX = 30000;

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

export function useWebSocket() {
  const { setWsStatus, setAgentStatus, addTask, updateTask, addActivity, addCost, addTokens, addMeetingSpeech, setMeetingActive } = useStore();
  const connectedRef = useRef(false);

  useEffect(() => {
    // 如果已经有连接在进行中或已连接，不要创建新连接
    if (_isConnecting || (_ws && _ws.readyState !== WebSocket.CLOSED)) {
      console.log('[WS] Connection already exists or in progress, skipping');
      return;
    }

    function connect() {
      if (_isConnecting) {
        console.log('[WS] Already connecting, skipping');
        return;
      }

      if (_ws && _ws.readyState !== WebSocket.CLOSED) {
        console.log('[WS] Connection already active, skipping');
        return;
      }

      _isConnecting = true;

      if (_ws) {
        console.log('[WS] Closing existing connection');
        try { _ws.onclose = null; _ws.close(); } catch {}
      }

      setWsStatus("connecting");

      // Electron 环境通过 IPC 获取端口，否则用默认值
      const getWsUrl = async (): Promise<string> => {
        if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { getWsPort: () => Promise<number> } }).electronAPI) {
          const port = await (window as unknown as { electronAPI: { getWsPort: () => Promise<number> } }).electronAPI.getWsPort();
          return `ws://localhost:${port}`;
        }
        return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
      };

      getWsUrl().then(wsUrl => {
        console.log("[WS] connecting to", wsUrl);
        _ws = new WebSocket(wsUrl);

        _ws.onopen = () => {
          console.log("[WS] connected");
          _retryDelay = 1000;
          _retryCount = 0;
          _isConnecting = false;
          setWsStatus("connected");
          connectedRef.current = true;

          // 等待一小段时间确保连接完全建立
          setTimeout(() => {
            if (_ws?.readyState === WebSocket.OPEN) {
              const { providers, agentConfigs, platformConfigs } = useStore.getState();
              _ws.send(JSON.stringify({ type: "settings_sync", providers, agentConfigs }));
              // 启动时恢复已启用的平台
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
          }, 100);
        };

        _ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as WsMessage;
            handleMessage(msg);
          } catch (err) {
            console.error("[WS] parse error:", err);
          }
        };

        _ws.onclose = () => {
          console.log("[WS] disconnected, retry in", _retryDelay, "ms");
          _isConnecting = false;
          setWsStatus("disconnected");
          connectedRef.current = false;
          _retryCount++;
          if (_retryCount <= WS_MAX_RETRIES) {
            _retryTimer = setTimeout(connect, _retryDelay);
            _retryDelay = Math.min(_retryDelay * 2, WS_RETRY_MAX);
          }
        };

        _ws.onerror = (e) => {
          console.error("[WS] error:", e);
          _isConnecting = false;
        };
      });
    }

    function handleMessage(msg: WsMessage) {
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
          break;
      }
    }

    connect();

    return () => {
      console.log('[WS] Cleanup called');
      // 不要在 cleanup 时关闭连接，因为可能有其他组件还在使用
      // 只清理定时器
      if (_retryTimer) clearTimeout(_retryTimer);
    };
  }, []);
}
