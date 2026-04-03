"use client";

import { useEffect, useMemo, useState } from "react";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import { useStore } from "@/store";
import { getDesktopRuntimeTone } from "./DesktopRuntimeBadge";
import { requestDesktopRuntimeRefresh } from "./DesktopRuntimeBridge";

const DESKTOP_REPAIR_COMMAND = "npm run electron:dev:clean";

export function DesktopRuntimeDiagnosticsCard() {
  const runtime = useStore(s => s.desktopRuntime);
  const desktopInputSession = useStore(s => s.desktopInputSession);
  const clearDesktopInputSession = useStore(s => s.clearDesktopInputSession);
  const desktopScreenshot = useStore(s => s.desktopScreenshot);
  const setDesktopScreenshot = useStore(s => s.setDesktopScreenshot);
  const clearDesktopScreenshot = useStore(s => s.clearDesktopScreenshot);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setCommandDraft = useStore(s => s.setCommandDraft);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const chatSessions = useStore(s => s.chatSessions);
  const tasks = useStore(s => s.tasks);
  const executionRuns = useStore(s => s.executionRuns);
  const wsStatus = useStore(s => s.wsStatus);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
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

  const focusResumeContext = () => {
    if (linkedSession && linkedSession.id !== useStore.getState().activeSessionId) {
      setActiveChatSession(linkedSession.id);
    }
    setTab("tasks");
  };

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
              imageDataUrl: result.dataUrl,
              width: result.width,
              height: result.height,
              format: result.format,
              message: result.message,
            });
            setActionMessage(result.message || "已抓取当前桌面截图。");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setDesktopScreenshot({
              status: "error",
              source: "manual",
              message,
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
  }, [runtime.fetchState, runtime.totalClients, setActiveControlCenterSection, setDesktopScreenshot, setTab, wsStatus]);

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
            {linkedSession ? <span className="badge badge-orchestrator">会话 {linkedSession.title}</span> : null}
            {linkedExecutionRun ? <span className="badge badge-designer">运行 {linkedExecutionRun.status}</span> : null}
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {desktopInputSession.state === "manual-required" && desktopInputSession.resumeInstruction ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    focusResumeContext();
                    setCommandDraft(desktopInputSession.resumeInstruction!);
                    setActionMessage("已切回对应聊天，并把续跑提示放入输入框。你可以先人工接管，再决定是否发送。");
                  }}
                >
                  回到聊天接管
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    focusResumeContext();
                    const { ok } = sendExecutionDispatch({
                      instruction: desktopInputSession.resumeInstruction!,
                      source: "chat",
                      includeUserMessage: false,
                      includeActiveProjectMemory: true,
                      sessionId: desktopInputSession.sessionId,
                    });
                    if (ok) {
                      setAutomationPaused(false);
                      setActionMessage("已恢复自动化，并把“验证已完成，请继续执行”发送回原会话。");
                      clearDesktopInputSession();
                    } else {
                      setAutomationPaused(true);
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
          </div>

          {desktopScreenshot.intent ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              用途: {desktopScreenshot.intent}
            </div>
          ) : null}

          {desktopScreenshot.imageDataUrl ? (
            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(15, 23, 42, 0.55)",
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
                  background: "rgba(15,23,42,0.55)",
                }}
              />
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={clearDesktopScreenshot}>
              清空截图
            </button>
          </div>
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
