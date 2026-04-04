import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "🦞 小龙虾 AI 团队",
  description: "跨境电商多 Agent 数字员工公司",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var search = window.location && window.location.search ? window.location.search : "";
                  var isElectron =
                    /desktop-client=electron|electronSafe=1|electron=1|desktop=electron|runtime=electron|shell=electron|target=electron|platform=electron|client=electron|app=electron/.test(search)
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
