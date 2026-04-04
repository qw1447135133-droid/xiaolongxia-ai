import dynamic from "next/dynamic";

const ElectronClientPage = dynamic(() => import("../page"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b1220",
        color: "#eef4ff",
        fontFamily: "\"Microsoft YaHei UI\", \"PingFang SC\", sans-serif",
      }}
    >
      <div style={{ display: "grid", gap: 12, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#91a4c4" }}>
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
