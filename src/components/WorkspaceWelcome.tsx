"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { sendWs } from "@/hooks/useWebSocket";
import { randomId } from "@/lib/utils";

const QUICK_PROMPTS = [
  "分析今天最值得推进的一项电商任务，并拆成团队分工。",
  "基于当前产品方向，给我一份适合 TikTok 的内容计划。",
  "帮我检查现有 Agent 配置是否存在角色冲突，并给出优化建议。",
];

export function WorkspaceWelcome() {
  const agents = useStore(s => s.agents);
  const tasks = useStore(s => s.tasks);
  const wsStatus = useStore(s => s.wsStatus);
  const createChatSession = useStore(s => s.createChatSession);
  const setTab = useStore(s => s.setTab);
  const [busyPrompt, setBusyPrompt] = useState<string | null>(null);

  const agentList = useMemo(() => Object.values(agents), [agents]);
  const hasConversation = tasks.length > 0;

  const runPrompt = (prompt: string) => {
    if (wsStatus !== "connected") return;
    setBusyPrompt(prompt);

    const { providers, agentConfigs, addTask, setLastInstruction, setDispatching } = useStore.getState();
    setDispatching(true);
    setLastInstruction(prompt);
    addTask({
      id: randomId(),
      description: prompt,
      assignedTo: "orchestrator",
      complexity: "low",
      status: "done",
      createdAt: Date.now(),
      completedAt: Date.now(),
      isUserMessage: true,
    });
    sendWs({ type: "settings_sync", providers, agentConfigs });
    sendWs({ type: "dispatch", instruction: prompt });
    setDispatching(false);
    setBusyPrompt(null);
    setTab("tasks");
  };

  return (
    <section className="workspace-welcome">
      <div className="workspace-welcome__hero">
        <div className="workspace-welcome__intro">
          <div className="workspace-welcome__eyebrow">Inspired by openhanako</div>
          <h1 className="workspace-welcome__title">把会话、任务、会议和配置收进同一个工作台</h1>
          <p className="workspace-welcome__copy">
            借鉴 openhanako 的桌面工作流布局后，我们把会话入口固定到侧栏，把实时状态留给底栏，把欢迎区变成可以直接发起工作的控制台。
          </p>

          <div className="workspace-welcome__actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                createChatSession();
                setTab("tasks");
              }}
            >
              新建工作会话
            </button>
            <button type="button" className="btn-ghost" onClick={() => setTab("settings")}>
              打开设置中心
            </button>
            <button type="button" className="btn-ghost" onClick={() => setTab("meeting")}>
              发起内部会议
            </button>
          </div>
        </div>

        <div className="workspace-welcome__team">
          <div className="workspace-welcome__team-title">当前编组</div>
          <div className="workspace-welcome__agents">
            {agentList.map(agent => (
              <div key={agent.id} className="workspace-welcome__agent">
                <span className="workspace-welcome__agent-emoji">{agent.emoji}</span>
                <div>
                  <div className="workspace-welcome__agent-name">{agent.name}</div>
                  <div className="workspace-welcome__agent-status">{agent.currentTask || "待命中"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="workspace-welcome__prompt-panel">
        <div className="workspace-welcome__prompt-head">
          <div>
            <div className="workspace-welcome__prompt-title">一键启动任务</div>
            <div className="workspace-welcome__prompt-hint">
              {hasConversation ? "继续把今天的工作往前推" : "从一个明确的问题开始，会比空白输入更快进入状态"}
            </div>
          </div>
          <span className={`workspace-welcome__status workspace-welcome__status--${wsStatus}`}>
            {wsStatus === "connected" ? "可立即派发" : wsStatus === "connecting" ? "连接中" : "等待连接"}
          </span>
        </div>

        <div className="workspace-welcome__prompt-list">
          {QUICK_PROMPTS.map(prompt => (
            <button
              key={prompt}
              type="button"
              className="workspace-welcome__prompt"
              disabled={wsStatus !== "connected" || busyPrompt === prompt}
              onClick={() => runPrompt(prompt)}
            >
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
