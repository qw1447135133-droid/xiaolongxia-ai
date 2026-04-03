"use client";

import { useEffect, useMemo, useState } from "react";
import { reconnectWebSocket } from "@/hooks/useWebSocket";
import { useStore } from "@/store";
import { getScheduledTasks, type ScheduledTask } from "@/lib/scheduled-tasks";
import {
  filterByProjectScope,
  getRunProjectScopeKey,
  getSessionProjectLabel,
  getSessionProjectScope,
} from "@/lib/project-context";
import { type AutomationMode, PLATFORM_DEFINITIONS } from "@/store/types";

export function RemoteOpsCenter() {
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);

  const providers = useStore(s => s.providers);
  const platformConfigs = useStore(s => s.platformConfigs);
  const workflowRuns = useStore(s => s.workflowRuns);
  const executionRuns = useStore(s => s.executionRuns);
  const workspaceProjectMemories = useStore(s => s.workspaceProjectMemories);
  const workspaceDeskNotes = useStore(s => s.workspaceDeskNotes);
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const automationMode = useStore(s => s.automationMode);
  const automationPaused = useStore(s => s.automationPaused);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const autoDispatchScheduledTasks = useStore(s => s.autoDispatchScheduledTasks);
  const setAutomationMode = useStore(s => s.setAutomationMode);
  const setAutomationPaused = useStore(s => s.setAutomationPaused);
  const setRemoteSupervisorEnabled = useStore(s => s.setRemoteSupervisorEnabled);
  const setAutoDispatchScheduledTasks = useStore(s => s.setAutoDispatchScheduledTasks);
  const setTab = useStore(s => s.setTab);

  useEffect(() => {
    setScheduledTasks(getScheduledTasks());
  }, []);

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );
  const currentProjectKey = useMemo(
    () => (activeSession ? getRunProjectScopeKey(activeSession, chatSessions) : "project:general"),
    [activeSession, chatSessions],
  );
  const currentProjectScope = getSessionProjectScope(activeSession);

  const enabledPlatforms = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.enabled),
    [platformConfigs],
  );
  const connectedPlatforms = useMemo(
    () => PLATFORM_DEFINITIONS.filter(def => platformConfigs[def.id]?.status === "connected"),
    [platformConfigs],
  );
  const enabledScheduledTasks = useMemo(
    () => scheduledTasks.filter(task => task.enabled),
    [scheduledTasks],
  );
  const projectRuns = useMemo(
    () => executionRuns.filter(run => getRunProjectScopeKey(run, chatSessions) === currentProjectKey),
    [chatSessions, currentProjectKey, executionRuns],
  );
  const recentProjectRuns = useMemo(
    () => [...projectRuns].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 8),
    [projectRuns],
  );
  const scopedMemories = useMemo(
    () => filterByProjectScope(workspaceProjectMemories, currentProjectScope),
    [currentProjectScope, workspaceProjectMemories],
  );
  const scopedDeskNotes = useMemo(
    () => filterByProjectScope(workspaceDeskNotes, currentProjectScope),
    [currentProjectScope, workspaceDeskNotes],
  );

  const verificationReadyRuns = recentProjectRuns.filter(
    run => run.verificationStatus === "passed" || run.verificationStatus === "failed",
  ).length;
  const completedRuns = recentProjectRuns.filter(run => run.status === "completed").length;
  const failedRuns = recentProjectRuns.filter(run => run.status === "failed").length;
  const activeRuns = recentProjectRuns.filter(run => run.status === "analyzing" || run.status === "running").length;
  const remoteReadinessScore = [
    providers.length > 0,
    enabledPlatforms.length > 0,
    enabledScheduledTasks.length > 0,
    recentProjectRuns.length > 0,
    verificationReadyRuns > 0,
  ].filter(Boolean).length;
  const remoteReadinessPercent = Math.round((remoteReadinessScore / 5) * 100);

  const scenarioCards = [
    buildScenarioCard({
      title: "自动化客服",
      description: "适合接 Webhook/机器人消息，自动分派给客服型数字员工并保留执行轨迹。",
      checks: {
        channels: enabledPlatforms.length > 0,
        supervision: recentProjectRuns.length > 0,
        memory: scopedMemories.length > 0 || scopedDeskNotes.length > 0,
      },
      missingMessage: enabledPlatforms.length === 0
        ? "还没有开启任何远程渠道，手机端无法真正接入消息。"
        : connectedPlatforms.length === 0
          ? "渠道已配置入口，但连接状态还没有打通成稳定桥接。"
          : "可以试运行，但仍缺用户鉴权、队列和 SLA 兜底。",
    }),
    buildScenarioCard({
      title: "自动化销售",
      description: "更像多步骤流程执行，需要预设工作流、定时触发、结果回传和上下文记忆。",
      checks: {
        channels: enabledPlatforms.length > 0,
        supervision: workflowRuns.length > 0 || enabledScheduledTasks.length > 0,
        memory: scopedMemories.length > 0,
      },
      missingMessage: workflowRuns.length === 0 && enabledScheduledTasks.length === 0
        ? "现在还缺稳定的销售编排层，更多是手动派发，不是真正自动销售流水线。"
        : "编排雏形已经有了，但缺 CRM 状态、客户分层、重试与回访闭环。",
    }),
    buildScenarioCard({
      title: "自动推文 / 社媒分发",
      description: "这类能力需要独立的社媒渠道适配器、内容审核、发布时间窗和平台回执。",
      checks: {
        channels: false,
        supervision: enabledScheduledTasks.length > 0,
        memory: true,
      },
      missingMessage: "当前仓库里还没有 X/Twitter 等社媒通道，也没有发布结果回执链路，所以这块还不能算已具备。",
    }),
  ];

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">Remote Ops</div>
        <div className="control-center__hero-title">
          当前更像“可进化中的数字员工工作台”，还不是完全合格的远程运营平台
        </div>
        <div className="control-center__hero-copy">
          它已经具备远程接入、任务派发、执行追踪、项目记忆和监督面板的骨架，但离“手机上放心托管一群数字员工自动跑业务”还差最后几层系统能力。
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"} · 远程运营就绪度 {remoteReadinessPercent}%
        </div>
      </div>

      <div className="control-center__stats">
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">已开启渠道</div>
          <div className="control-center__stat-value" style={{ color: "var(--accent)" }}>{enabledPlatforms.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">已连接渠道</div>
          <div className="control-center__stat-value" style={{ color: "var(--success)" }}>{connectedPlatforms.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">自动化计划</div>
          <div className="control-center__stat-value" style={{ color: "#7dd3fc" }}>{enabledScheduledTasks.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">最近项目 Runs</div>
          <div className="control-center__stat-value" style={{ color: "#fbbf24" }}>{recentProjectRuns.length}</div>
        </div>
        <div className="control-center__stat-card">
          <div className="control-center__stat-label">验证覆盖</div>
          <div className="control-center__stat-value" style={{ color: "#c4b5fd" }}>
            {verificationReadyRuns}/{recentProjectRuns.length || 0}
          </div>
        </div>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">远程值守模式</div>
          <div className="control-center__mode-list">
            {([
              { id: "manual", label: "人工模式", hint: "只允许人工在聊天里手动下发任务" },
              { id: "supervised", label: "监督模式", hint: "允许自动化，但保留人工监督和随时接管" },
              { id: "autonomous", label: "自治模式", hint: "适合低风险重复工作，尽量自动推进" },
            ] satisfies Array<{ id: AutomationMode; label: string; hint: string }>).map(mode => (
              <button
                key={mode.id}
                type="button"
                className={`control-center__mode-card ${automationMode === mode.id ? "is-active" : ""}`}
                onClick={() => setAutomationMode(mode.id)}
              >
                <strong>{mode.label}</strong>
                <span>{mode.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">值守开关</div>
          <div className="control-center__toggle-list">
            <button
              type="button"
              className={`control-center__toggle-card ${automationPaused ? "is-alert" : "is-active"}`}
              onClick={() => setAutomationPaused(!automationPaused)}
            >
              <strong>{automationPaused ? "已暂停自动化" : "自动化运行中"}</strong>
              <span>暂停后会停止定时任务自动派发，便于手机端临时接管。</span>
            </button>
            <button
              type="button"
              className={`control-center__toggle-card ${remoteSupervisorEnabled ? "is-active" : ""}`}
              onClick={() => setRemoteSupervisorEnabled(!remoteSupervisorEnabled)}
            >
              <strong>{remoteSupervisorEnabled ? "远程值守开启" : "远程值守关闭"}</strong>
              <span>用于标记当前是否允许通过远程渠道继续监督和接管。</span>
            </button>
            <button
              type="button"
              className={`control-center__toggle-card ${autoDispatchScheduledTasks ? "is-active" : ""}`}
              onClick={() => setAutoDispatchScheduledTasks(!autoDispatchScheduledTasks)}
            >
              <strong>{autoDispatchScheduledTasks ? "定时任务自动派发开启" : "定时任务自动派发关闭"}</strong>
              <span>关闭后计划任务仍保留，但不会自动发起执行。</span>
            </button>
          </div>
        </div>
      </div>

      <div className="control-center__quick-actions">
        <button type="button" className="btn-ghost" onClick={() => reconnectWebSocket()}>
          重连远程通道
        </button>
        <button type="button" className="btn-ghost" onClick={() => setTab("tasks")}>
          进入人工接管聊天
        </button>
        <button type="button" className="btn-ghost" onClick={() => setTab("settings")}>
          打开执行与渠道面板
        </button>
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">这项目现在能做什么</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 通过 WebSocket + 渠道配置把任务派发进来，形成远程控制入口。</div>
            <div>2. 用执行 run、活动流、会议总结、项目记忆来监督数字员工过程，而不只是看最终结果。</div>
            <div>3. 用定时任务和工作流模板让一部分动作自动触发，适合做半自动运营。</div>
            <div>4. 用项目作用域把会话、工作区、记忆、执行历史绑定到具体项目，避免上下文串台。</div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">为什么还不能算完全合格</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 缺正式的手机端登录、权限和多用户协同，当前更像控制台而不是完整 SaaS。</div>
            <div>2. 缺渠道稳定性闭环：连接回执、失败重试、离线补偿、消息队列和任务 SLA 还不完整。</div>
            <div>3. 缺真正业务适配器，比如 CRM、社媒发布、客服工单、销售漏斗，而不只是通用指令分发。</div>
            <div>4. 缺审计与治理：谁批准、谁发送、谁回滚、谁接管，目前监督面板有了，但制度层还弱。</div>
          </div>
        </div>
      </div>

      <div className="control-center__scenario-grid">
        {scenarioCards.map(card => (
          <article key={card.title} className={`control-center__scenario control-center__scenario--${card.tone}`}>
            <div className="control-center__scenario-head">
              <div>
                <div className="control-center__panel-title">{card.title}</div>
                <div className="control-center__copy">{card.description}</div>
              </div>
              <span className={`control-center__scenario-badge is-${card.tone}`}>{card.label}</span>
            </div>
            <div className="control-center__scenario-checks">
              <ScenarioCheck label="远程入口" passed={card.checks.channels} />
              <ScenarioCheck label="监督追踪" passed={card.checks.supervision} />
              <ScenarioCheck label="业务记忆" passed={card.checks.memory} />
            </div>
            <div className="control-center__copy">{card.missingMessage}</div>
          </article>
        ))}
      </div>

      <div className="control-center__columns">
        <div className="control-center__panel">
          <div className="control-center__panel-title">当前监督视图</div>
          <div className="control-center__list">
            <div>运行中任务: <strong className="control-center__strong">{activeRuns}</strong></div>
            <div>最近完成: <strong className="control-center__strong">{completedRuns}</strong></div>
            <div>最近失败: <strong className="control-center__strong">{failedRuns}</strong></div>
            <div>项目记忆: <strong className="control-center__strong">{scopedMemories.length}</strong></div>
            <div>Desk Notes: <strong className="control-center__strong">{scopedDeskNotes.length}</strong></div>
          </div>
        </div>

        <div className="control-center__panel">
          <div className="control-center__panel-title">最值得继续补的 4 层</div>
          <div className="control-center__list control-center__list--dense">
            <div>1. 手机端真实控制入口：登录、消息通知、审批、接管、暂停。</div>
            <div>2. 业务连接器：客服渠道、CRM、社媒发布器、工单和线索状态同步。</div>
            <div>3. 后台稳定性：任务队列、失败重试、幂等、回执、告警。</div>
            <div>4. 组织治理：多租户、角色权限、审计日志、人工接管和交付标准。</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioCheck({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className={`control-center__scenario-check ${passed ? "is-passed" : "is-missing"}`}>
      <span>{passed ? "已具备" : "缺失"}</span>
      <strong>{label}</strong>
    </div>
  );
}

function buildScenarioCard({
  title,
  description,
  checks,
  missingMessage,
}: {
  title: string;
  description: string;
  checks: Record<string, boolean>;
  missingMessage: string;
}) {
  const passedCount = Object.values(checks).filter(Boolean).length;
  if (passedCount === 3) {
    return { title, description, checks, missingMessage, tone: "ready" as const, label: "可试运行" };
  }
  if (passedCount >= 1) {
    return { title, description, checks, missingMessage, tone: "partial" as const, label: "半成品" };
  }
  return { title, description, checks, missingMessage, tone: "blocked" as const, label: "未就绪" };
}
