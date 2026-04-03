"use client";

import { useEffect } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";

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
  }>;
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

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [setDesktopRuntime]);

  return null;
}
