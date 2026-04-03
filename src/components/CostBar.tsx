"use client";
import { useStore } from "@/store";

export function CostBar() {
  const cost = useStore(s => s.cost);
  const wsStatus = useStore(s => s.wsStatus);

  const WS_COLOR = { connected: "var(--success)", connecting: "var(--warning)", disconnected: "var(--danger)" };
  const WS_LABEL = { connected: "已连接", connecting: "连接中", disconnected: "未连接" };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "6px 16px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-sidebar)",
      fontSize: 11,
      color: "var(--text-muted)",
    }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>🦞 小龙虾 AI</span>
      <span>Tokens: <b style={{ color: "var(--text)" }}>{cost.totalTokens.toLocaleString()}</b></span>
      <span>成本: <b style={{ color: "var(--success)" }}>${cost.totalCostUsd.toFixed(4)}</b></span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: WS_COLOR[wsStatus], display: "inline-block" }} />
        {WS_LABEL[wsStatus]}
      </span>
    </div>
  );
}
