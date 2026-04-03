"use client";

import { useEffect } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";

const DESKTOP_RUNTIME_REFRESH_EVENT = "xlx:desktop-runtime-refresh";

async function fetchDesktopRuntime() {
  const url = await resolveBackendUrl("/api/desktop-runtime");
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`桌面运行态接口返回 ${response.status}`);
  }

  return response.json() as Promise<{
    totalClients: number;
    launchCapable: number;
    installedAppsCapable: number;
    inputCapable: number;
    screenshotCapable: number;
  }>;
}

export function requestDesktopRuntimeRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DESKTOP_RUNTIME_REFRESH_EVENT));
}

export function DesktopRuntimeBridge() {
  const setDesktopRuntime = useStore(s => s.setDesktopRuntime);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const runtime = await fetchDesktopRuntime();
        if (cancelled) return;
        setDesktopRuntime({
          ...runtime,
          inputCapable: runtime.inputCapable ?? 0,
          screenshotCapable: runtime.screenshotCapable ?? 0,
          fetchState: "ready",
          error: undefined,
          lastCheckedAt: Date.now(),
        });
      } catch (error) {
        if (cancelled) return;
        setDesktopRuntime({
          totalClients: 0,
          launchCapable: 0,
          installedAppsCapable: 0,
          inputCapable: 0,
          screenshotCapable: 0,
          fetchState: "error",
          error: error instanceof Error ? error.message : String(error),
          lastCheckedAt: Date.now(),
        });
      }
    };

    setDesktopRuntime({ fetchState: "loading" });
    void sync();

    const timer = window.setInterval(() => {
      void sync();
    }, 8000);

    const handleRefresh = () => {
      void sync();
    };
    window.addEventListener(DESKTOP_RUNTIME_REFRESH_EVENT, handleRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DESKTOP_RUNTIME_REFRESH_EVENT, handleRefresh);
    };
  }, [setDesktopRuntime]);

  return null;
}
