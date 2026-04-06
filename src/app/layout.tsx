import type { Metadata } from "next";
import "@/styles/globals.css";
import { ELECTRON_RUNTIME_QUERY_KEYS } from "@/lib/electron-runtime";

export const metadata: Metadata = {
  title: "🦞 小龙虾 AI 团队",
  description: "跨境电商多 Agent 数字员工公司",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const electronRuntimeKeys = JSON.stringify(ELECTRON_RUNTIME_QUERY_KEYS);
  return (
    <html lang="zh" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var search = window.location && window.location.search ? window.location.search : "";
                  var params = new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search);
                  var electronKeys = ${electronRuntimeKeys};
                  var isElectron =
                    electronKeys.some(function (key) {
                      var value = params.get(key);
                      return value === "electron" || value === "1";
                    })
                    || /electron/i.test((window.navigator && window.navigator.userAgent) || "");
                  if (!isElectron) return;
                  window.__XLX_ELECTRON__ = true;
                  document.documentElement.dataset.runtime = "electron";
                  document.documentElement.classList.add("runtime-electron");
                  document.body && document.body.classList.add("runtime-electron");
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
