"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { getProjectScopeKey, getRunProjectScopeKey, getSessionProjectScope } from "@/lib/project-context";
import { runExecutionVerification } from "@/lib/execution-verification";

export function ExecutionVerificationBridge() {
  const executionRuns = useStore(s => s.executionRuns);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null;
  const activeProjectKey = getProjectScopeKey(getSessionProjectScope(activeSession));

  useEffect(() => {
    const targetRun = [...executionRuns]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .find(run =>
        getRunProjectScopeKey(run, chatSessions) === activeProjectKey &&
        (run.status === "completed" || run.status === "failed") &&
        !run.verificationStatus,
      );

    if (!targetRun) return;
    void runExecutionVerification(targetRun.id);
  }, [activeProjectKey, chatSessions, executionRuns]);

  return null;
}
