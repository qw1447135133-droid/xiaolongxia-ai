"use client";

import dynamic from "next/dynamic";

const ElectronClientPage = dynamic(() => import("../page"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f6f8fb",
        color: "#0f172a",
        fontFamily: "\"Microsoft YaHei UI\", \"PingFang SC\", sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>
          Desktop Workspace
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>正在启动桌面工作台...</div>
      </div>
    </div>
  ),
});

export default function ElectronPage() {
  return <ElectronClientPage />;
}
