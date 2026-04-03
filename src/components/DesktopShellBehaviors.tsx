"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { reconnectWebSocket } from "@/hooks/useWebSocket";

export function DesktopShellBehaviors() {
  const createChatSession = useStore(s => s.createChatSession);
  const setTab = useStore(s => s.setTab);

  useEffect(() => {
    let autoClosedLeft = false;
    let autoClosedRight = false;

    const syncResponsiveLayout = () => {
      const width = window.innerWidth;
      const state = useStore.getState();

      if (width < 1180 && state.rightOpen) {
        useStore.setState({ rightOpen: false });
        autoClosedRight = true;
      } else if (width >= 1320 && autoClosedRight && !useStore.getState().rightOpen) {
        useStore.setState({ rightOpen: true });
        autoClosedRight = false;
      }

      if (width < 980 && state.leftOpen) {
        useStore.setState({ leftOpen: false });
        autoClosedLeft = true;
      } else if (width >= 1120 && autoClosedLeft && !useStore.getState().leftOpen) {
        useStore.setState({ leftOpen: true });
        autoClosedLeft = false;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        createChatSession();
        setTab("tasks");
        return;
      }

      if (key === "b" && event.shiftKey) {
        event.preventDefault();
        useStore.setState(state => ({ rightOpen: !state.rightOpen }));
        return;
      }

      if (key === "b") {
        event.preventDefault();
        useStore.setState(state => ({ leftOpen: !state.leftOpen }));
        return;
      }

      if (key === "r" && useStore.getState().wsStatus !== "connected") {
        event.preventDefault();
        reconnectWebSocket();
      }
    };

    syncResponsiveLayout();
    window.addEventListener("resize", syncResponsiveLayout);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", syncResponsiveLayout);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createChatSession, setTab]);

  return null;
}
