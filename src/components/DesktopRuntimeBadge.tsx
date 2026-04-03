"use client";

import { useMemo, type CSSProperties } from "react";
import { useStore } from "@/store";

export function getDesktopRuntimeTone(runtime: ReturnType<typeof useStore.getState>["desktopRuntime"]) {
  if (runtime.fetchState === "loading" && runtime.lastCheckedAt === null) {
    return {
      tone: "partial",
      dot: "#fbbf24",
      label: "桌面运行态检查中",
      detail: "正在确认 Electron 客户端是否已经接入。",
    } as const;
  }

  if (runtime.launchCapable > 0 && runtime.installedAppsCapable > 0 && runtime.inputCapable > 0 && runtime.screenshotCapable > 0) {
    return {
      tone: "ready",
      dot: "#86efac",
      label: "桌面运行态已连接",
      detail: `已连接 ${runtime.totalClients} 个客户端，可启动程序 ${runtime.launchCapable}，可扫描程序 ${runtime.installedAppsCapable}，可接管输入 ${runtime.inputCapable}，可抓取截图 ${runtime.screenshotCapable}。`,
    } as const;
  }

  if (runtime.launchCapable > 0) {
    return {
      tone: "partial",
      dot: "#fbbf24",
      label: "桌面部分连接",
      detail: `已有 ${runtime.launchCapable} 个客户端可启动程序；扫描能力 ${runtime.installedAppsCapable}，输入接管能力 ${runtime.inputCapable}，截图能力 ${runtime.screenshotCapable}。`,
    } as const;
  }

  if (runtime.fetchState === "error") {
    return {
      tone: "blocked",
      dot: "#fda4af",
      label: "桌面运行态不可用",
      detail: runtime.error || "当前无法读取 Electron 运行态状态。",
    } as const;
  }

  return {
    tone: "blocked",
    dot: "#fda4af",
    label: "未检测到桌面客户端",
    detail: "请用 electron:dev 打开正确实例，Web 页面本身不具备本机程序调用能力。",
  } as const;
}

export function DesktopRuntimeBadge({
  compact = false,
  showDetail = false,
}: {
  compact?: boolean;
  showDetail?: boolean;
}) {
  const runtime = useStore(s => s.desktopRuntime);
  const tone = useMemo(() => getDesktopRuntimeTone(runtime), [runtime]);

  return (
    <div
      className={compact ? `control-center__scenario-badge is-${tone.tone}` : undefined}
      style={compact ? undefined : badgePanelStyle(tone.dot)}
      title={tone.detail}
    >
      <span style={dotStyle(tone.dot)} />
      <span>{tone.label}</span>
      {showDetail ? (
        <span style={detailStyle}>
          {tone.detail}
        </span>
      ) : null}
    </div>
  );
}

function badgePanelStyle(dot: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: 600,
    flexWrap: "wrap",
    boxShadow: `0 0 0 1px ${dot}22 inset`,
  };
}

function dotStyle(color: string): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: color,
    boxShadow: `0 0 10px ${color}`,
    flexShrink: 0,
  };
}

const detailStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-muted)",
};
