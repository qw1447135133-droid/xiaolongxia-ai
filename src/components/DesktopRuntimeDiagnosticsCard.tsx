"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { getDesktopRuntimeTone } from "./DesktopRuntimeBadge";

export function DesktopRuntimeDiagnosticsCard() {
  const runtime = useStore(s => s.desktopRuntime);
  const tone = useMemo(() => getDesktopRuntimeTone(runtime), [runtime]);

  const actions = useMemo(() => {
    if (runtime.fetchState === "error") {
      return [
        "确认 `3001` 的 ws-server 仍在运行，并且 `/api/desktop-runtime` 可以返回 JSON。",
        "如果你是从纯浏览器打开的 `3000` 页面，请改用 `electron:dev:clean` 打开桌面实例。",
        "如果刚切过实例，等 3 到 8 秒让 Electron 重新向后端注册能力。",
      ];
    }

    if (runtime.launchCapable > 0 && runtime.installedAppsCapable === 0) {
      return [
        "当前桌面实例只能启动程序，还不能扫描已安装程序。",
        "优先检查 Electron `preload` 是否暴露了 `listInstalledApplications`。",
        "再检查主进程里的扫描 IPC 和 PowerShell 调用是否正常返回。",
      ];
    }

    if (runtime.totalClients === 0) {
      return [
        "当前还没有 Electron 客户端接入，Web 页面本身不能直接调用本机程序。",
        "运行 `npm run electron:dev:clean`，确保打开的是这个仓库对应的桌面实例。",
        "如果窗口已打开但仍显示未连接，通常是实例跑错目录或旧进程没清干净。",
      ];
    }

    return [
      "桌面运行态已经就绪，现在可以从聊天或控制台直接启动本机程序。",
      "已安装程序扫描也已可用，适合先搜微信、飞书、Chrome、VS Code 再一键加入预设。",
      "如果后续状态回落，优先看这里的计数变化，而不是只看页面是否打开。",
    ];
  }, [runtime.fetchState, runtime.installedAppsCapable, runtime.launchCapable, runtime.totalClients]);

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderColor:
          tone.tone === "ready"
            ? "rgba(134, 239, 172, 0.28)"
            : tone.tone === "partial"
              ? "rgba(251, 191, 36, 0.28)"
              : "rgba(253, 164, 175, 0.28)",
        background:
          tone.tone === "ready"
            ? "linear-gradient(135deg, rgba(134, 239, 172, 0.12), rgba(255,255,255,0.03))"
            : tone.tone === "partial"
              ? "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(255,255,255,0.03))"
              : "linear-gradient(135deg, rgba(253, 164, 175, 0.12), rgba(255,255,255,0.03))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>桌面运行态诊断</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {tone.detail}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`control-center__scenario-badge is-${tone.tone}`}>{tone.label}</span>
          <span className="badge badge-orchestrator">客户端 {runtime.totalClients}</span>
          <span className="badge badge-explorer">可启动 {runtime.launchCapable}</span>
          <span className="badge badge-writer">可扫描 {runtime.installedAppsCapable}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {actions.map(action => (
          <div
            key={action}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.7,
            }}
          >
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}
