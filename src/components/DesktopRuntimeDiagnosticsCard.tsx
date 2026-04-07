"use client";

import { useEffect, useMemo, useState } from "react";
import { reconnectWebSocket, sendWs } from "@/hooks/useWebSocket";
import { retryExecutionDispatch, sendExecutionDispatch } from "@/lib/execution-dispatch";
import { useStore } from "@/store";
import { getDesktopRuntimeTone } from "./DesktopRuntimeBadge";
import { requestDesktopRuntimeRefresh } from "./DesktopRuntimeBridge";
import type { DesktopInputRetrySuggestion } from "@/types/electron-api";

const DESKTOP_REPAIR_COMMAND = "npm run electron:dev:clean";

export function DesktopRuntimeDiagnosticsCard() {
  const runtime = useStore(s => s.desktopRuntime);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const clearDesktopInputSession = useStore(s => s.clearDesktopInputSession);
  const desktopScreenshot = useStore(s => s.desktopScreenshot);
  const setDesktopScreenshot = useStore(s => s.setDesktopScreenshot);
  const clearDesktopScreenshot = useStore(s => s.clearDesktopScreenshot);
  const desktopEvidenceLog = useStore(s => s.desktopEvidenceLog);
  const appendDesktopEvidence = useStore(s => s.appendDesktopEvidence);
  const clearDesktopEvidenceLog = useStore(s => s.clearDesktopEvidenceLog);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const chatSessions = useStore(s => s.chatSessions);
  const tasks = useStore(s => s.tasks);
  const executionRuns = useStore(s => s.executionRuns);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const wsStatus = useStore(s => s.wsStatus);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [runtimeSource, setRuntimeSource] = useState("检测中");
  const [wsEndpoint, setWsEndpoint] = useState("ws://localhost:3001");
  const tone = useMemo(() => getDesktopRuntimeTone(runtime), [runtime]);
  const linkedSession = useMemo(
    () => chatSessions.find(session => session.id === desktopInputSession.sessionId) ?? null,
    [chatSessions, desktopInputSession.sessionId],
  );
  const linkedTask = useMemo(
    () => desktopInputSession.taskId ? tasks.find(task => task.id === desktopInputSession.taskId) ?? null : null,
    [desktopInputSession.taskId, tasks],
  );
  const linkedExecutionRun = useMemo(
    () => desktopInputSession.executionRunId ? executionRuns.find(run => run.id === desktopInputSession.executionRunId) ?? null : null,
    [desktopInputSession.executionRunId, executionRuns],
  );
  const linkedContentTask = useMemo(
    () =>
      linkedExecutionRun?.entityType === "contentTask" && linkedExecutionRun.entityId
        ? businessContentTasks.find(task => task.id === linkedExecutionRun.entityId) ?? null
        : null,
    [businessContentTasks, linkedExecutionRun?.entityId, linkedExecutionRun?.entityType],
  );
  const screenshotLinkedSession = useMemo(
    () => desktopScreenshot.sessionId ? chatSessions.find(session => session.id === desktopScreenshot.sessionId) ?? null : null,
    [chatSessions, desktopScreenshot.sessionId],
  );
  const screenshotLinkedExecutionRun = useMemo(
    () => desktopScreenshot.executionRunId ? executionRuns.find(run => run.id === desktopScreenshot.executionRunId) ?? null : null,
    [desktopScreenshot.executionRunId, executionRuns],
  );
  const screenshotLinkedContentTask = useMemo(
    () =>
      screenshotLinkedExecutionRun?.entityType === "contentTask" && screenshotLinkedExecutionRun.entityId
        ? businessContentTasks.find(task => task.id === screenshotLinkedExecutionRun.entityId) ?? null
        : null,
    [businessContentTasks, screenshotLinkedExecutionRun?.entityId, screenshotLinkedExecutionRun?.entityType],
  );

  const focusResumeContext = () => {
    if (linkedSession && linkedSession.id !== useStore.getState().activeSessionId) {
      setActiveChatSession(linkedSession.id);
    }
    setTab("tasks");
  };
  const canResumeFromScreenshot =
    desktopInputSession.state === "manual-required"
    && Boolean(desktopInputSession.resumeInstruction)
    && Boolean(screenshotLinkedExecutionRun)
    && desktopInputSession.executionRunId === screenshotLinkedExecutionRun?.id;
  const retryClickAction = desktopInputSession.lastAction === "double_click" || desktopInputSession.lastAction === "right_click"
    ? desktopInputSession.lastAction
    : "click";
  const recentEvidence = useMemo(
    () => desktopEvidenceLog.slice(0, 6),
    [desktopEvidenceLog],
  );

  useEffect(() => {
    let cancelled = false;

    const syncRuntimeContext = async () => {
      if (typeof window === "undefined") return;

      const isElectron = Boolean(window.electronAPI?.isElectron);
      const protocol = window.location.protocol;
      const source = isElectron
        ? protocol === "file:"
          ? "Electron Shell"
          : "Electron Renderer"
        : "Web Browser";

      let endpoint = "ws://localhost:3001";
      if (window.electronAPI?.getWsPort) {
        try {
          const port = await window.electronAPI.getWsPort();
          endpoint = `ws://localhost:${port}`;
        } catch {}
      }

      if (cancelled) return;
      setRuntimeSource(source);
      setWsEndpoint(endpoint);
    };

    void syncRuntimeContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo(() => {
    if (runtime.fetchState === "error") {
      return [
        "确认 `3001` 的 ws-server 仍在运行，并且 `/api/desktop-runtime` 可以返回 JSON。",
        "如果你是从纯浏览器打开的 `3000` 页面，请改用 `electron:dev:clean` 打开桌面实例。",
        "如果刚切过实例，等 3 到 8 秒让 Electron 重新向后端注册能力。",
      ];
    }

    if (runtime.launchCapable > 0 && (runtime.installedAppsCapable === 0 || runtime.inputCapable === 0 || runtime.screenshotCapable === 0)) {
      return [
        "当前桌面实例已经具备部分能力，但扫描程序、输入接管或桌面截图还没有完全就绪。",
        "优先检查 Electron `preload` 是否暴露了 `listInstalledApplications`、`controlDesktopInput` 和 `captureDesktopScreenshot`。",
        "再检查主进程里的扫描 IPC、输入 IPC、截图 IPC 和 PowerShell 调用是否正常返回。",
      ];
    }

    if (runtime.totalClients === 0) {
      return [
        "当前还没有 Electron 客户端接入，Web 页面本身不能直接调用本机程序。",
        "运行 `npm run electron:dev:clean`，确保打开的是这个仓库对应的桌面实例。",
        "如果窗口已打开但仍显示未连接，通常是实例跑错目录或旧进程没清干净。",
      ];
    }

    return [
      "桌面运行态已经就绪，现在可以从聊天或控制台直接启动本机程序，并在必要时接管鼠标键盘。",
      "已安装程序扫描和桌面截图也已可用，适合先观察当前桌面，再决定输入或点击动作。",
      "如果后续状态回落，优先看这里的计数变化，而不是只看页面是否打开。",
    ];
  }, [runtime.fetchState, runtime.inputCapable, runtime.installedAppsCapable, runtime.launchCapable, runtime.screenshotCapable, runtime.totalClients]);

  const actionButtons = useMemo(() => {
    const buttons: Array<{ id: string; label: string; onClick: () => void | Promise<void> }> = [
      {
        id: "refresh",
        label: "立即刷新诊断",
        onClick: () => {
          requestDesktopRuntimeRefresh();
          setActionMessage("已发起一次桌面运行态刷新。");
        },
      },
      {
        id: "open-desktop",
        label: "打开桌面程序中心",
        onClick: () => {
          setActiveControlCenterSection("desktop");
          setTab("settings");
          setActionMessage("已切到桌面程序中心。");
        },
      },
      {
        id: "capture-desktop",
        label: "抓取当前桌面截图",
        onClick: async () => {
          if (!window.electronAPI?.captureDesktopScreenshot) {
            setActionMessage("当前 Electron 实例还没有暴露桌面截图能力。");
            return;
          }
          try {
            setDesktopScreenshot({
              status: "capturing",
              source: "manual",
              message: "正在抓取当前桌面截图。",
            });
            const result = await window.electronAPI.captureDesktopScreenshot({
              intent: "人工观察当前桌面状态",
              maxWidth: 1440,
              quality: 72,
            });
            setDesktopScreenshot({
              status: "ready",
              source: "manual",
              sessionId: linkedSession?.id,
              executionRunId: linkedExecutionRun?.id,
              imageDataUrl: result.dataUrl,
              width: result.width,
              height: result.height,
              format: result.format,
              message: result.message,
            });
            appendDesktopEvidence({
              kind: "screenshot",
              status: "completed",
              source: "manual",
              summary: `已人工抓取桌面截图 ${result.width}x${result.height}。`,
              target: linkedExecutionRun?.instruction ? "当前执行现场" : "当前桌面",
              intent: "人工观察当前桌面状态",
              sessionId: linkedSession?.id,
              executionRunId: linkedExecutionRun?.id,
              imageCaptured: true,
              width: result.width,
              height: result.height,
              format: result.format,
            });
            setActionMessage(result.message || "已抓取当前桌面截图。");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setDesktopScreenshot({
              status: "error",
              source: "manual",
              sessionId: linkedSession?.id,
              executionRunId: linkedExecutionRun?.id,
              message,
            });
            appendDesktopEvidence({
              kind: "screenshot",
              status: "failed",
              source: "manual",
              summary: message,
              target: linkedExecutionRun?.instruction ? "当前执行现场" : "当前桌面",
              intent: "人工观察当前桌面状态",
              sessionId: linkedSession?.id,
              executionRunId: linkedExecutionRun?.id,
              failureReason: message,
            });
            setActionMessage(message);
          }
        },
      },
      {
        id: "copy-command",
        label: "复制修复命令",
        onClick: async () => {
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(DESKTOP_REPAIR_COMMAND);
              setActionMessage(`已复制命令：${DESKTOP_REPAIR_COMMAND}`);
              return;
            }
          } catch {}
          setActionMessage(`请手动执行：${DESKTOP_REPAIR_COMMAND}`);
        },
      },
    ];

    if (wsStatus !== "connected" || runtime.fetchState === "error" || runtime.totalClients === 0) {
      buttons.splice(1, 0, {
        id: "reconnect",
        label: "重连 WS",
        onClick: () => {
          reconnectWebSocket();
          setActionMessage("已发起 WebSocket 重连。");
        },
      });
    }

    if (typeof window !== "undefined" && window.electronAPI?.reloadDesktopWindow) {
      buttons.splice(1, 0, {
        id: "reload-desktop",
        label: "重载桌面窗口",
        onClick: async () => {
          try {
            const result = await window.electronAPI?.reloadDesktopWindow?.();
            setActionMessage(result?.message || "已请求重载当前桌面窗口。");
            window.setTimeout(() => reconnectWebSocket(), 500);
            window.setTimeout(() => requestDesktopRuntimeRefresh(), 1400);
          } catch (error) {
            setActionMessage(error instanceof Error ? error.message : String(error));
          }
        },
      });
    }

    if (typeof window !== "undefined" && window.electronAPI?.relaunchDesktopApp) {
      buttons.splice(2, 0, {
        id: "relaunch-desktop",
        label: "重启 Electron 实例",
        onClick: async () => {
          try {
            const result = await window.electronAPI?.relaunchDesktopApp?.();
            setActionMessage(result?.message || "已请求重启 Electron 实例。");
          } catch (error) {
            setActionMessage(error instanceof Error ? error.message : String(error));
          }
        },
      });
    }

    return buttons;
  }, [linkedExecutionRun?.id, linkedSession?.id, runtime.fetchState, runtime.totalClients, setActiveControlCenterSection, setDesktopScreenshot, setTab, wsStatus]);

  const triggerRetrySuggestion = (suggestion: DesktopInputRetrySuggestion) => {
    const ok = sendWs({
      type: "desktop_input_request",
      requestId: `desktop-retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId: desktopInputSession.sessionId,
      executionRunId: desktopInputSession.executionRunId,
      taskId: desktopInputSession.taskId,
      payload: {
        action: retryClickAction,
        x: suggestion.nextX,
        y: suggestion.nextY,
        target: desktopInputSession.target,
        intent: `${desktopInputSession.lastIntent || "桌面点击"} · 偏移重试 ${suggestion.label}`,
        riskCategory: "normal",
      },
    });

    if (ok) {
      setActionMessage(`已发起偏移重试：${suggestion.label} (${suggestion.nextX}, ${suggestion.nextY})。`);
    } else {
      setActionMessage("偏移重试发送失败：当前 WebSocket 未连接。");
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderColor:
          tone.tone === "ready"
            ? "rgba(134, 239, 172, 0.28)"
            : tone.tone === "partial"
              ? "rgba(251, 191, 36, 0.28)"
              : "rgba(253, 164, 175, 0.28)",
        background:
          tone.tone === "ready"
            ? "linear-gradient(135deg, rgba(134, 239, 172, 0.12), rgba(255,255,255,0.03))"
            : tone.tone === "partial"
              ? "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(255,255,255,0.03))"
              : "linear-gradient(135deg, rgba(253, 164, 175, 0.12), rgba(255,255,255,0.03))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>桌面运行态诊断</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {tone.detail}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className={`control-center__scenario-badge is-${tone.tone}`}>{tone.label}</span>
          <span className="badge badge-orchestrator">客户端 {runtime.totalClients}</span>
          <span className="badge badge-explorer">可启动 {runtime.launchCapable}</span>
          <span className="badge badge-writer">可扫描 {runtime.installedAppsCapable}</span>
          <span className="badge badge-performer">可接管 {runtime.inputCapable}</span>
          <span className="badge badge-designer">可截图 {runtime.screenshotCapable}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {actions.map(action => (
          <div
            key={action}
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.7,
            }}
          >
            {action}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <InfoTile label="当前环境" value={runtimeSource} />
        <InfoTile label="WS 端点" value={wsEndpoint} mono />
        <InfoTile label="修复命令" value={DESKTOP_REPAIR_COMMAND} mono />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {actionButtons.map(button => (
          <button
            key={button.id}
            type="button"
            className="btn-ghost"
            style={{ fontSize: 12 }}
            onClick={button.onClick}
          >
            {button.label}
          </button>
        ))}
      </div>

      {desktopInputSession.state !== "idle" ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>桌面输入接管状态</div>
            <span
              className={`control-center__scenario-badge is-${
                desktopInputSession.state === "executed"
                  ? "ready"
                  : desktopInputSession.state === "manual-required" || desktopInputSession.state === "running"
                    ? "partial"
                    : "blocked"
              }`}
            >
              {desktopInputSession.state === "executed"
                ? "已执行"
                : desktopInputSession.state === "manual-required"
                  ? "人工接管"
                  : desktopInputSession.state === "running"
                    ? "接管中"
                    : "异常"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {desktopInputSession.message || "当前有一条桌面输入接管记录。"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {desktopInputSession.lastAction ? <span className="badge badge-explorer">动作 {desktopInputSession.lastAction}</span> : null}
            {desktopInputSession.target ? <span className="badge badge-writer">目标 {desktopInputSession.target}</span> : null}
            {desktopInputSession.source ? <span className="badge badge-greeter">来源 {desktopInputSession.source === "agent" ? "agent" : "manual"}</span> : null}
            {desktopInputSession.retryStrategy ? <span className="badge badge-performer">偏移重试</span> : null}
            {desktopInputSession.cursor ? <span className="badge badge-explorer">坐标 {desktopInputSession.cursor.x},{desktopInputSession.cursor.y}</span> : null}
            {linkedSession ? <span className="badge badge-orchestrator">会话 {linkedSession.title}</span> : null}
            {linkedExecutionRun ? <span className="badge badge-designer">运行 {linkedExecutionRun.status}</span> : null}
            {linkedContentTask ? <span className="badge badge-writer">内容 {linkedContentTask.status}</span> : null}
          </div>
          {desktopInputSession.lastIntent ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              意图: {desktopInputSession.lastIntent}
            </div>
          ) : null}
          {linkedTask ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              当前任务: {linkedTask.description}
            </div>
          ) : null}
          {linkedContentTask ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              绑定内容任务: {linkedContentTask.title} · {linkedContentTask.status}
            </div>
          ) : null}
          {desktopInputSession.retrySuggestions && desktopInputSession.retrySuggestions.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                偏移重试建议: 复核失败时优先尝试这些附近点击点。
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {desktopInputSession.retrySuggestions.slice(0, 4).map(item => (
                  <button
                    key={`${item.label}-${item.nextX}-${item.nextY}`}
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => triggerRetrySuggestion(item)}
                  >
                    {item.label} · {item.nextX},{item.nextY}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {linkedContentTask ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  focusBusinessContentTask(linkedContentTask.id);
                  setActiveControlCenterSection("entities");
                  setTab("settings");
                }}
              >
                定位到内容实体
              </button>
            ) : null}
            {linkedExecutionRun ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setActiveControlCenterSection("execution");
                  setTab("settings");
                }}
              >
                查看对应执行
              </button>
            ) : null}
            {desktopInputSession.state === "manual-required" && desktopInputSession.resumeInstruction ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    focusResumeContext();
                    setCommandDraft(desktopInputSession.resumeInstruction!);
                    appendDesktopEvidence({
                      kind: "takeover",
                      status: "info",
                      source: "manual",
                      summary: "已从桌面接管切回聊天输入框，等待人工确认后续指令。",
                      target: desktopInputSession.target,
                      intent: desktopInputSession.lastIntent,
                      sessionId: desktopInputSession.sessionId,
                      executionRunId: desktopInputSession.executionRunId,
                      taskId: desktopInputSession.taskId,
                      takeoverBy: "manual",
                      takeoverReason: "chat-handoff",
                      resumeInstruction: desktopInputSession.resumeInstruction,
                      resumeFrom: desktopInputSession.target || "桌面接管卡",
                    });
                    setActionMessage("已切回对应聊天，并把续跑提示放入输入框。你可以先人工接管，再决定是否发送。");
                  }}
                >
                  回到聊天接管
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    focusResumeContext();
                    const resumeRun = linkedExecutionRun ?? screenshotLinkedExecutionRun;
                    const dispatchResult = resumeRun
                      ? await retryExecutionDispatch(resumeRun, {
                        includeUserMessage: false,
                        includeActiveProjectMemory: true,
                        taskDescription: "验证已完成，继续执行",
                        lastRecoveryHint: "人工验证已完成，继续沿用原执行上下文。",
                      })
                      : await sendExecutionDispatch({
                        instruction: desktopInputSession.resumeInstruction!,
                        source: "chat",
                        includeUserMessage: false,
                        includeActiveProjectMemory: true,
                        sessionId: desktopInputSession.sessionId,
                        retryOfRunId: desktopInputSession.executionRunId,
                        lastRecoveryHint: "人工验证已完成，继续沿用原执行上下文。",
                      });
                    const { ok } = dispatchResult;
                    if (ok) {
                      setAutomationPaused(false);
                      appendDesktopEvidence({
                        kind: "resume",
                        status: "completed",
                        source: "manual",
                        summary: "人工验证已完成，已从桌面接管现场恢复执行。",
                        target: desktopInputSession.target,
                        intent: desktopInputSession.lastIntent,
                        sessionId: desktopInputSession.sessionId,
                        executionRunId: resumeRun?.id ?? desktopInputSession.executionRunId,
                        taskId: desktopInputSession.taskId,
                        resumeInstruction: desktopInputSession.resumeInstruction,
                        resumeFrom: "桌面接管卡",
                      });
                      setActionMessage("已恢复自动化，并把“验证已完成，请继续执行”发送回原会话。");
                      clearDesktopInputSession();
                    } else {
                      setAutomationPaused(true);
                      appendDesktopEvidence({
                        kind: "resume",
                        status: "failed",
                        source: "manual",
                        summary: "人工验证后尝试恢复执行失败，当前会话仍保留在待接管状态。",
                        target: desktopInputSession.target,
                        intent: desktopInputSession.lastIntent,
                        sessionId: desktopInputSession.sessionId,
                        executionRunId: resumeRun?.id ?? desktopInputSession.executionRunId,
                        taskId: desktopInputSession.taskId,
                        failureReason: "websocket-disconnected",
                        resumeInstruction: desktopInputSession.resumeInstruction,
                        resumeFrom: "桌面接管卡",
                      });
                      setActionMessage("恢复执行失败：当前 WebSocket 未连接，已保留人工接管状态。");
                    }
                  }}
                >
                  验证已完成，继续执行
                </button>
              </>
            ) : null}
            <button type="button" className="btn-ghost" onClick={clearDesktopInputSession}>
              清空接管状态
            </button>
          </div>
        </div>
      ) : null}

      {desktopScreenshot.status !== "idle" ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>最近桌面截图</div>
            <span
              className={`control-center__scenario-badge is-${
                desktopScreenshot.status === "ready"
                  ? "ready"
                  : desktopScreenshot.status === "capturing"
                    ? "partial"
                    : "blocked"
              }`}
            >
              {desktopScreenshot.status === "ready"
                ? "已就绪"
                : desktopScreenshot.status === "capturing"
                  ? "抓取中"
                  : "异常"}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
            {desktopScreenshot.message || "桌面截图状态已更新。"}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {desktopScreenshot.width && desktopScreenshot.height ? (
              <span className="badge badge-explorer">{desktopScreenshot.width} × {desktopScreenshot.height}</span>
            ) : null}
            {desktopScreenshot.source ? (
              <span className="badge badge-greeter">来源 {desktopScreenshot.source === "agent" ? "agent" : "manual"}</span>
            ) : null}
            {desktopScreenshot.target ? (
              <span className="badge badge-writer">目标 {desktopScreenshot.target}</span>
            ) : null}
            {screenshotLinkedSession ? (
              <span className="badge badge-orchestrator">会话 {screenshotLinkedSession.title}</span>
            ) : null}
            {screenshotLinkedExecutionRun ? (
              <span className="badge badge-designer">运行 {screenshotLinkedExecutionRun.status}</span>
            ) : null}
            {screenshotLinkedContentTask ? (
              <span className="badge badge-writer">内容 {screenshotLinkedContentTask.status}</span>
            ) : null}
          </div>

          {desktopScreenshot.intent ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              用途: {desktopScreenshot.intent}
            </div>
          ) : null}

          {screenshotLinkedContentTask ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              绑定内容任务: {screenshotLinkedContentTask.title} · {screenshotLinkedContentTask.status}
            </div>
          ) : null}
          {desktopInputSession.retrySuggestions && desktopInputSession.retrySuggestions.length > 0 && desktopInputSession.executionRunId === screenshotLinkedExecutionRun?.id ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                当前截图关联的偏移重试点:
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {desktopInputSession.retrySuggestions.slice(0, 4).map(item => (
                  <button
                    key={`shot-${item.label}-${item.nextX}-${item.nextY}`}
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => triggerRetrySuggestion(item)}
                  >
                    {item.label} · dx {item.dx} / dy {item.dy}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {desktopScreenshot.imageDataUrl ? (
            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,253,0.96))",
                boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
              }}
            >
              <img
                src={desktopScreenshot.imageDataUrl}
                alt="桌面截图预览"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: 360,
                  objectFit: "contain",
                  background: "transparent",
                }}
              />
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {screenshotLinkedContentTask ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  focusBusinessContentTask(screenshotLinkedContentTask.id);
                  setActiveControlCenterSection("entities");
                  setTab("settings");
                }}
              >
                定位到内容实体
              </button>
            ) : null}
            {screenshotLinkedExecutionRun ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setActiveControlCenterSection("execution");
                  setTab("settings");
                }}
              >
                查看对应执行
              </button>
            ) : null}
            {screenshotLinkedSession ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (screenshotLinkedSession.id !== useStore.getState().activeSessionId) {
                    setActiveChatSession(screenshotLinkedSession.id);
                  }
                  setTab("tasks");
                  if (desktopInputSession.resumeInstruction && desktopInputSession.executionRunId === screenshotLinkedExecutionRun?.id) {
                    setCommandDraft(desktopInputSession.resumeInstruction);
                    appendDesktopEvidence({
                      kind: "takeover",
                      status: "info",
                      source: "manual",
                      summary: "已带着当前截图现场切回聊天，准备人工接管。",
                      target: desktopScreenshot.target,
                      intent: desktopScreenshot.intent,
                      sessionId: screenshotLinkedSession.id,
                      executionRunId: screenshotLinkedExecutionRun?.id,
                      takeoverBy: "manual",
                      takeoverReason: "screenshot-chat-handoff",
                      resumeInstruction: desktopInputSession.resumeInstruction,
                      resumeFrom: "截图现场",
                    });
                    setActionMessage("已带着当前截图现场切回原聊天，并写入续跑提示。");
                  } else {
                    appendDesktopEvidence({
                      kind: "takeover",
                      status: "info",
                      source: "manual",
                      summary: "已根据截图现场切回聊天会话，等待人工接管。",
                      target: desktopScreenshot.target,
                      intent: desktopScreenshot.intent,
                      sessionId: screenshotLinkedSession.id,
                      executionRunId: screenshotLinkedExecutionRun?.id,
                      takeoverBy: "manual",
                      takeoverReason: "screenshot-chat-handoff",
                      resumeFrom: "截图现场",
                    });
                    setActionMessage("已切回与当前截图关联的聊天会话。");
                  }
                }}
              >
                回聊天接管
              </button>
            ) : null}
            {canResumeFromScreenshot ? (
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  focusResumeContext();
                  const resumeRun = screenshotLinkedExecutionRun ?? linkedExecutionRun;
                  const dispatchResult = resumeRun
                    ? await retryExecutionDispatch(resumeRun, {
                        includeUserMessage: false,
                        includeActiveProjectMemory: true,
                        taskDescription: "截图确认后继续执行",
                        lastRecoveryHint: "已基于最新桌面截图确认状态，继续沿用原执行上下文。",
                      })
                    : await sendExecutionDispatch({
                        instruction: desktopInputSession.resumeInstruction!,
                        source: "chat",
                        includeUserMessage: false,
                        includeActiveProjectMemory: true,
                        sessionId: desktopInputSession.sessionId,
                        retryOfRunId: desktopInputSession.executionRunId,
                        lastRecoveryHint: "已基于最新桌面截图确认状态，继续沿用原执行上下文。",
                      });
                  const { ok } = dispatchResult;
                  if (ok) {
                    setAutomationPaused(false);
                    appendDesktopEvidence({
                      kind: "resume",
                      status: "completed",
                      source: "manual",
                      summary: "已基于最新截图确认现场并恢复执行。",
                      target: desktopScreenshot.target,
                      intent: desktopScreenshot.intent,
                      sessionId: desktopInputSession.sessionId,
                      executionRunId: resumeRun?.id ?? desktopInputSession.executionRunId,
                      taskId: desktopInputSession.taskId,
                      resumeInstruction: desktopInputSession.resumeInstruction,
                      resumeFrom: "截图现场",
                    });
                    setActionMessage("已基于当前截图现场恢复自动化，并把继续执行指令发送回原会话。");
                    clearDesktopInputSession();
                  } else {
                    setAutomationPaused(true);
                    appendDesktopEvidence({
                      kind: "resume",
                      status: "failed",
                      source: "manual",
                      summary: "基于截图现场恢复执行失败，已保留当前截图和接管状态。",
                      target: desktopScreenshot.target,
                      intent: desktopScreenshot.intent,
                      sessionId: desktopInputSession.sessionId,
                      executionRunId: resumeRun?.id ?? desktopInputSession.executionRunId,
                      taskId: desktopInputSession.taskId,
                      failureReason: "websocket-disconnected",
                      resumeInstruction: desktopInputSession.resumeInstruction,
                      resumeFrom: "截图现场",
                    });
                    setActionMessage("恢复执行失败：当前 WebSocket 未连接，截图现场和人工接管状态都已保留。");
                  }
                }}
              >
                验证已完成，继续执行
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={clearDesktopScreenshot}>
              清空截图
            </button>
          </div>
        </div>
      ) : null}

      {recentEvidence.length ? (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 16,
            background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,253,0.96))",
            border: "1px solid var(--border)",
            boxShadow: "0 12px 26px rgba(15, 23, 42, 0.05)",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>最近桌面证据链</div>
            <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={clearDesktopEvidenceLog}>
              清空证据
            </button>
          </div>
          {recentEvidence.map(item => (
            <div
              key={item.id}
              style={{
                display: "grid",
                gap: 4,
                padding: "10px 12px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className={`control-center__scenario-badge is-${getEvidenceTone(item.status)}`}>
                    {getEvidenceKindLabel(item.kind)}
                  </span>
                  <span className="badge badge-explorer">
                    {item.source === "agent" ? "agent" : "manual"}
                  </span>
                  {item.target ? <span className="badge badge-writer">{item.target}</span> : null}
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {formatEvidenceTime(item.createdAt)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{item.summary}</div>
              {item.failureReason ? (
                <div style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.6 }}>
                  失败原因: {item.failureReason}
                </div>
              ) : null}
              {item.retrySuggestions?.length ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  偏移重试建议: {item.retrySuggestions.slice(0, 3).map(suggestion => suggestion.label).join(" / ")}
                </div>
              ) : null}
              {item.takeoverReason ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  接管原因: {item.takeoverReason}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {actionMessage ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.7,
          }}
        >
          {actionMessage}
        </div>
      ) : null}
    </div>
  );
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text)",
          lineHeight: 1.7,
          wordBreak: "break-all",
          fontFamily: mono ? "Consolas, Monaco, monospace" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatEvidenceTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function getEvidenceTone(status: "completed" | "failed" | "blocked" | "info") {
  if (status === "completed") return "ready";
  if (status === "failed") return "blocked";
  if (status === "blocked") return "partial";
  return "partial";
}

function getEvidenceKindLabel(kind: "input" | "screenshot" | "takeover" | "resume") {
  if (kind === "input") return "输入动作";
  if (kind === "screenshot") return "截图现场";
  if (kind === "takeover") return "人工接管";
  return "恢复执行";
}
