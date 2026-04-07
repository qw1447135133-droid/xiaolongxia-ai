"use client";

import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { useStore } from "@/store";

export async function syncRuntimeSettings() {
  const {
    providers,
    agentConfigs,
    platformConfigs,
    userNickname,
    semanticMemoryConfig,
    desktopProgramSettings,
    hermesDispatchSettings,
  } = useStore.getState();

  const payload = {
    providers,
    agentConfigs,
    platformConfigs,
    userNickname,
    semanticMemoryConfig,
    desktopProgramSettings,
    hermesDispatchSettings,
  };

  try {
    if (sendWs({ type: "settings_sync", ...payload })) {
      return true;
    }

    const url = await resolveBackendUrl("/api/settings");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error("Failed to sync runtime settings:", error);
    return false;
  }
}
