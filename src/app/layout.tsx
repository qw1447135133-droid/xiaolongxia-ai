import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "🦞 小龙虾 AI 团队",
  description: "跨境电商多 Agent 数字员工公司",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
