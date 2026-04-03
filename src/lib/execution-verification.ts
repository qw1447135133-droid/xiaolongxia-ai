"use client";

import { useStore } from "@/store";
import type { VerificationStepResult, VerificationStatus } from "@/store/types";
import { randomId } from "@/lib/utils";

const pendingVerificationRuns = new Set<string>();

function summarizeVerification(results: VerificationStepResult[]) {
  if (results.length === 0) {
    return "当前工作区没有可运行的验证命令，已跳过自动验证。";
  }

  return results
    .map(result => `${result.label}: ${result.status === "passed" ? "通过" : result.status === "failed" ? "失败" : "跳过"} · ${result.command}`)
    .join("\n");
}

function resolveVerificationStatus(results: VerificationStepResult[]): VerificationStatus {
  if (results.length === 0) return "skipped";
  if (results.some(result => result.status === "failed")) return "failed";
  if (results.some(result => result.status === "passed")) return "passed";
  return "skipped";
}

export async function runExecutionVerification(runId: string) {
  if (pendingVerificationRuns.has(runId)) return;

  const store = useStore.getState();
  const run = store.executionRuns.find(item => item.id === runId);
  const workspaceRoot = store.workspaceRoot;
  const electronApi = typeof window !== "undefined" ? window.electronAPI : undefined;

  if (!run || !workspaceRoot || !electronApi?.runWorkspaceVerification) return;

  pendingVerificationRuns.add(runId);
  const startedAt = Date.now();

  store.updateExecutionRun({
    id: runId,
    verificationStatus: "running",
    verificationUpdatedAt: startedAt,
    event: {
      id: randomId(),
      type: "system",
      title: "开始自动验证",
      detail: `目标工作区：${workspaceRoot}`,
      timestamp: startedAt,
    },
  });

  try {
    const payload = await electronApi.runWorkspaceVerification(workspaceRoot);
    const nextStatus = resolveVerificationStatus(payload.results);
    const finishedAt = Date.now();

    store.updateExecutionRun({
      id: runId,
      verificationStatus: nextStatus,
      verificationResults: payload.results,
      verificationUpdatedAt: finishedAt,
      event: {
        id: randomId(),
        type: nextStatus === "failed" ? "error" : "system",
        title:
          nextStatus === "passed"
            ? "自动验证通过"
            : nextStatus === "failed"
              ? "自动验证失败"
              : "自动验证已跳过",
        detail: summarizeVerification(payload.results),
        timestamp: finishedAt,
      },
    });
  } catch (error) {
    const finishedAt = Date.now();
    store.updateExecutionRun({
      id: runId,
      verificationStatus: "failed",
      verificationUpdatedAt: finishedAt,
      event: {
        id: randomId(),
        type: "error",
        title: "自动验证执行异常",
        detail: error instanceof Error ? error.message : String(error),
        timestamp: finishedAt,
      },
    });
  } finally {
    pendingVerificationRuns.delete(runId);
  }
}
