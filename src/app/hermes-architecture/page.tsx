"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useStore } from "@/store";

type HermesDiagnosticsPayload = {
  ok: boolean;
  snapshotAt: number;
  planner: {
    profileCount: number;
    activeProfileId: string | null;
    activeRuns: number;
    plannedRuns: number;
    failedRuns: number;
    completedRuns: number;
    missingCommands: Array<{ key: string; command: string }>;
  };
  channels: {
    enabledCount: number;
    connectedCount: number;
    attentionCount: number;
    backlog: number;
  };
  memory: {
    providerId: string;
    autoRecallProjectMemories: boolean;
    autoRecallDeskNotes: boolean;
    autoRecallKnowledgeDocs: boolean;
    pgvectorEnabled: boolean;
    pgvector?: {
      ok?: boolean;
      skipped?: boolean;
      error?: string;
      documentCount?: number;
      schema?: string;
      table?: string;
    } | null;
  };
  governance: {
    judgeCount: number;
    judges: string[];
    noDesktopAgentCount: number;
    noDesktopAgents: string[];
    projectMemoryAgentCount: number;
    projectMemoryAgents: string[];
  };
  recommendations: string[];
};

const architectureSections = [
  {
    title: "1. Planner Brain",
    status: "已落地",
    summary: "把 Hermes 的 planner / brain 思路映射到当前 `HermesDispatchCenter + hermesDispatchSettings + profile session file` 体系。",
    details: [
      "多 profile brain 已存在，可按研究 / 默认 / scratch 隔离规划上下文。",
      "本次新增统一诊断汇总，能直接看 active profile、缺失命令和 run 失败情况。",
      "下一步建议补 run transcript 与 planner doctor，形成可回溯的脑状态审计。",
    ],
  },
  {
    title: "2. Channel Gateway",
    status: "已落地",
    summary: "把 Hermes 的 gateway / transport 思路映射到现有 `server/platforms/* + webhook-router + orchestrator`。",
    details: [
      "Web、钉钉、公众号、QQ Bridge 已经进入真实接入路径，不再只是占位实现。",
      "本次把渠道健康、积压和失败消息收拢进统一 Hermes 诊断视图。",
      "下一步建议补平台级 doctor 动作和更细的重试 / 降级策略。",
    ],
  },
  {
    title: "3. Memory Layers",
    status: "本次增强",
    summary: "把 Hermes 的 layered memory 映射到 `短期会话 + 显式@外部历史 + 项目记忆 + Desk Notes + 知识库 + 世界状态`。",
    details: [
      "本次新增统一 Hermes 上下文装配器，聊天 dispatch 不再手写拼接 prompt。",
      "每次执行都会把启用的记忆层、token 估算和是否压缩写入执行事件，便于排查“失忆”。",
      "保持你之前定下的规则：跨区历史默认不自动串联，只有显式 @ 才会接入外部会话。",
    ],
  },
  {
    title: "4. World Model",
    status: "已落地，待深化",
    summary: "把 Hermes 的 state / world view 映射到客户、渠道、内容工单、审批、执行失败等业务实体图。",
    details: [
      "现有 `world-model.ts` 已能输出 attention items 和 automation readiness。",
      "本次把它纳入 Hermes context bundle 的标准层，成为稳定的执行输入。",
      "下一步建议补 entity-level timeline 和记忆回写策略，让模型能显式维护事实卡片。",
    ],
  },
  {
    title: "5. Diagnostics / Doctor",
    status: "本次新增",
    summary: "把 Hermes 的 doctor / status 页面映射到当前仓库的 `channel-debug + /api/hermes-diagnostics + 本页`。",
    details: [
      "现在可以一眼看到 planner、渠道、pgvector 记忆层的健康状态和建议动作。",
      "它不替代原有调试页，而是站在编排层做总览诊断。",
      "下一步建议加入执行链路回放、最近失败样本和一键导出诊断快照。",
    ],
  },
  {
    title: "6. Agent Governance",
    status: "本次新增",
    summary: "把 Hermes 的 role contract / lifecycle 治理映射到会议与执行代理的约束、上下文边界和回写策略。",
    details: [
      "治理字段已经变成显式配置：工具权限、会议站位、记忆回写、升级策略、表达风格、禁区与停止条件。",
      "会议和普通聊天都会自动附加治理合同，不再只靠硬编码 prompt 约束角色行为。",
      "当前页也会展示裁判位数量、禁桌面 agent 数量和项目记忆回写责任归属。",
    ],
  },
] as const;

function metricCardStyle() {
  return {
    display: "grid",
    gap: 8,
    padding: 18,
    borderRadius: 22,
    background: "rgba(255,255,255,0.94)",
    border: "1px solid rgba(148,163,184,0.18)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
  } as const;
}

export default function HermesArchitecturePage() {
  const automationMode = useStore(s => s.automationMode);
  const remoteSupervisorEnabled = useStore(s => s.remoteSupervisorEnabled);
  const autoDispatchScheduledTasks = useStore(s => s.autoDispatchScheduledTasks);
  const [diagnostics, setDiagnostics] = useState<HermesDiagnosticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = await resolveBackendUrl("/api/hermes-diagnostics");
        const response = await fetch(url, { method: "GET" });
        const payload = await response.json() as HermesDiagnosticsPayload & { error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "无法读取 Hermes 诊断信息。");
        }
        if (!cancelled) {
          setDiagnostics(payload);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const automationSummary = useMemo(() => {
    const parts = [
      automationMode === "manual" ? "人工模式" : automationMode === "supervised" ? "监管模式" : "自治模式",
      remoteSupervisorEnabled ? "远程值守开启" : "远程值守关闭",
      autoDispatchScheduledTasks ? "计划自动派发开启" : "计划自动派发关闭",
    ];
    return parts.join(" / ");
  }, [autoDispatchScheduledTasks, automationMode, remoteSupervisorEnabled]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%)",
        color: "#0f172a",
        padding: "32px 20px 56px",
        fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 20 }}>
        <section
          style={{
            display: "grid",
            gap: 12,
            padding: 26,
            borderRadius: 30,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(148,163,184,0.18)",
            boxShadow: "0 26px 90px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
            Hermes Mapping
          </div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08 }}>把 Hermes 思路映射到当前仓库的落地改造清单</h1>
          <div style={{ fontSize: 14, lineHeight: 1.85, color: "#475569", maxWidth: 980 }}>
            这不是另起一套新系统，而是把你现在已经有的渠道层、客户画像、会议系统、执行流和语义记忆，
            收束成一套更像 Hermes 的编排架构。当前这一版已经把最值得先落的两块接上了：
            `统一上下文装配` 和 `统一诊断总览`。
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href="/channel-debug" style={linkStyle("dark")}>打开渠道联调页</a>
            <a href="/channel-integration-guide" style={linkStyle("light")}>打开接入指南</a>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <article style={metricCardStyle()}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Planner</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{diagnostics?.planner.profileCount ?? "--"}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Active profile: {diagnostics?.planner.activeProfileId ?? "读取中"}<br />
              运行中 {diagnostics?.planner.activeRuns ?? 0} / 失败 {diagnostics?.planner.failedRuns ?? 0}
            </div>
          </article>
          <article style={metricCardStyle()}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Channels</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {diagnostics ? `${diagnostics.channels.connectedCount}/${diagnostics.channels.enabledCount}` : "--"}
            </div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              异常渠道 {diagnostics?.channels.attentionCount ?? 0}<br />
              待处理事件 {diagnostics?.channels.backlog ?? 0}
            </div>
          </article>
          <article style={metricCardStyle()}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Memory</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {diagnostics?.memory.providerId ?? "--"}
            </div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              项目记忆 {diagnostics?.memory.autoRecallProjectMemories ? "开" : "关"} / Desk {diagnostics?.memory.autoRecallDeskNotes ? "开" : "关"} / 知识 {diagnostics?.memory.autoRecallKnowledgeDocs ? "开" : "关"}
              <br />
              pgvector {diagnostics?.memory.pgvectorEnabled ? (diagnostics.memory.pgvector?.ok ? "健康" : "待修复") : "未启用"}
            </div>
          </article>
          <article style={metricCardStyle()}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Automation</div>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.45 }}>{automationSummary}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              这一栏来自前端运行态，用来补足编排层诊断里还看不到的自治配置。
            </div>
          </article>
          <article style={metricCardStyle()}>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>Governance</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {diagnostics ? `${diagnostics.governance.judgeCount} judge` : "--"}
            </div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              禁桌面 agent {diagnostics?.governance.noDesktopAgentCount ?? 0}<br />
              项目记忆回写 {diagnostics?.governance.projectMemoryAgentCount ?? 0}
            </div>
          </article>
        </section>

        {error ? (
          <section style={{
            padding: 18,
            borderRadius: 22,
            background: "rgba(254,242,242,0.94)",
            border: "1px solid rgba(248,113,113,0.28)",
            color: "#b91c1c",
            fontSize: 13,
            lineHeight: 1.7,
          }}>
            读取 Hermes 诊断失败：{error}
          </section>
        ) : null}

        {diagnostics?.recommendations?.length ? (
          <section style={{
            display: "grid",
            gap: 10,
            padding: 22,
            borderRadius: 24,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(148,163,184,0.16)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
          }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>当前最值得继续做的 3 类事</h2>
            {diagnostics.recommendations.map((item) => (
              <div key={item} style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
                {item}
              </div>
            ))}
          </section>
        ) : null}

        {diagnostics?.governance ? (
          <section style={{
            display: "grid",
            gap: 10,
            padding: 22,
            borderRadius: 24,
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(148,163,184,0.16)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
          }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>治理快照</h2>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
              裁判位：{diagnostics.governance.judges.length ? diagnostics.governance.judges.join(" / ") : "未配置"}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
              禁桌面执行：{diagnostics.governance.noDesktopAgents.length ? diagnostics.governance.noDesktopAgents.join(" / ") : "无"}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#334155" }}>
              项目记忆回写：{diagnostics.governance.projectMemoryAgents.length ? diagnostics.governance.projectMemoryAgents.join(" / ") : "无"}
            </div>
          </section>
        ) : null}

        <section style={{ display: "grid", gap: 16 }}>
          {architectureSections.map((section) => {
            const isUpcoming = String(section.status) === "下一阶段";
            return (
            <article
              key={section.title}
              style={{
                display: "grid",
                gap: 12,
                padding: 22,
                borderRadius: 24,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(148,163,184,0.16)",
                boxShadow: "0 18px 42px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>{section.title}</h2>
                <span
                  style={{
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 800,
                    background: isUpcoming ? "rgba(251,191,36,0.14)" : "rgba(16,185,129,0.12)",
                    color: isUpcoming ? "#b45309" : "#047857",
                  }}
                >
                  {section.status}
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: "#475569" }}>{section.summary}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {section.details.map((detail) => (
                  <div key={detail} style={{ fontSize: 13, lineHeight: 1.75, color: "#334155" }}>
                    {detail}
                  </div>
                ))}
              </div>
            </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function linkStyle(tone: "dark" | "light") {
  return tone === "dark"
    ? {
        textDecoration: "none",
        borderRadius: 999,
        padding: "10px 14px",
        background: "#0f172a",
        color: "#fff",
        fontSize: 12,
        fontWeight: 800,
      }
    : {
        textDecoration: "none",
        borderRadius: 999,
        padding: "10px 14px",
        background: "#fff",
        color: "#334155",
        border: "1px solid rgba(148,163,184,0.24)",
        fontSize: 12,
        fontWeight: 800,
      };
}
