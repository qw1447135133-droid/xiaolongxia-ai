"use client";
import { useState } from "react";
import { useStore } from "@/store";
import { sendWs } from "@/hooks/useWebSocket";
import { randomId } from "@/lib/utils";

export function CommandInput() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const { isDispatching, wsStatus, setDispatching, setLastInstruction, addTask } = useStore();

  const dispatch = async () => {
    const instruction = input.trim();
    if (!instruction || isDispatching) return;

    if (wsStatus !== "connected") {
      setError("WebSocket 未连接，请稍候重试");
      return;
    }

    setDispatching(true);
    setLastInstruction(instruction);
    setError("");
    setInput("");

    // 立即添加用户消息到对话列表
    addTask({
      id: randomId(),
      description: instruction,
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      createdAt: Date.now(),
      completedAt: Date.now(),
      isUserMessage: true,  // 标记为用户消息
    });

    // 同步最新配置并发送指令
    const { providers, agentConfigs } = useStore.getState();
    sendWs({ type: "settings_sync", providers, agentConfigs });
    const ok = sendWs({ type: "dispatch", instruction });

    if (!ok) {
      setError("发送失败，WebSocket 连接已断开");
    }

    setDispatching(false);
  };

  return (
    <div style={{
      padding: "10px 14px",
      borderTop: "1px solid var(--border)",
      background: "var(--bg-sidebar)",
    }}>
      {error && (
        <div style={{
          fontSize: 11, color: "var(--danger)",
          background: "rgba(var(--danger-rgb),0.08)",
          border: "1px solid rgba(var(--danger-rgb),0.2)",
          borderRadius: "var(--radius-sm)",
          padding: "5px 8px", marginBottom: 8,
        }}>
          ❌ {error}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5 }}>
        🦞 向虾总管下发指令
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          style={{ fontSize: 13 }}
          placeholder="例：分析无线耳机市场，写英文文案，规划 TikTok 视频..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && dispatch()}
          disabled={isDispatching}
        />
        <button
          className="btn-primary"
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, minWidth: 72 }}
          onClick={dispatch}
          disabled={isDispatching || !input.trim()}
        >
          {isDispatching ? <><span className="spinner" /> 执行中</> : "发送"}
        </button>
      </div>
    </div>
  );
}
