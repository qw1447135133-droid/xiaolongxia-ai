import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "🦞 小龙虾 AI 团队",
  description: "跨境电商多 Agent 数字员工公司",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var isElectron =
                    !!(window.electronAPI && window.electronAPI.isElectron) ||
                    /electron/i.test((navigator && navigator.userAgent) || "");
                  if (!isElectron) return;
                  window.__XLX_ELECTRON__ = true;
                  var mark = function () {
                    document.documentElement.classList.add("runtime-electron");
                    document.documentElement.setAttribute("data-runtime", "electron");
                    if (document.body) {
                      document.body.classList.add("runtime-electron");
                    }
                  };
                  if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", mark, { once: true });
                  } else {
                    mark();
                  }
                } catch (error) {
                  console.warn("runtime-electron bootstrap failed", error);
                }
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
