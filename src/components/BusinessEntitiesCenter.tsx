"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import {
  BUSINESS_ENTITY_LABELS,
  getBusinessPriorityTone,
} from "@/lib/business-entities";
import {
  getDecisionTone,
  scoreChannelSession,
  scoreContentTask,
  scoreCustomerHealth,
  scoreLead,
  scoreTicket,
  type QuantDecision,
} from "@/lib/business-quantification";
import type { BusinessEntityType, BusinessOperationRecord } from "@/types/business-entities";
import type { ControlCenterSectionId } from "@/store/types";

export function BusinessEntitiesCenter() {
  const contentTaskRefs = useRef<Record<string, HTMLElement | null>>({});

  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const advanceBusinessLeadStage = useStore(s => s.advanceBusinessLeadStage);
  const advanceBusinessTicketStatus = useStore(s => s.advanceBusinessTicketStatus);
  const advanceBusinessContentTaskStatus = useStore(s => s.advanceBusinessContentTaskStatus);
  const advanceBusinessChannelSessionStatus = useStore(s => s.advanceBusinessChannelSessionStatus);
  const queueContentTaskWorkflowRun = useStore(s => s.queueContentTaskWorkflowRun);
  const applyContentChannelGovernance = useStore(s => s.applyContentChannelGovernance);
  const seedBusinessEntitiesForProject = useStore(s => s.seedBusinessEntitiesForProject);
  const clearBusinessEntitiesForProject = useStore(s => s.clearBusinessEntitiesForProject);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const focusedBusinessContentTaskId = useStore(s => s.focusedBusinessContentTaskId);
  const focusBusinessContentTask = useStore(s => s.focusBusinessContentTask);
  const [highlightedContentTaskId, setHighlightedContentTaskId] = useState<string | null>(null);
  const [expandedEntityCards, setExpandedEntityCards] = useState<Record<string, boolean>>({});

  const openControlCenterSection = (section: ControlCenterSectionId) => {
    setActiveControlCenterSection(section);
    setTab("settings");
  };

  const focusExecutionRun = (runId?: string | null) => {
    if (runId) {
      setActiveExecutionRun(runId);
    }
    openControlCenterSection("execution");
  };

  const focusContentTaskCard = (contentTaskId: string) => {
    setHighlightedContentTaskId(contentTaskId);
    contentTaskRefs.current[contentTaskId]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => {
      setHighlightedContentTaskId(current => (current === contentTaskId ? null : current));
    }, 2200);
  };

  const toggleEntityCard = (entityKey: string) => {
    setExpandedEntityCards(current => ({
      ...current,
      [entityKey]: !current[entityKey],
    }));
  };

  const activeSession = useMemo(
    () => chatSessions.find(session => session.id === activeSessionId) ?? null,
    [activeSessionId, chatSessions],
  );

  const scopedCustomers = useMemo(
    () => filterByProjectScope(businessCustomers, activeSession ?? {}),
    [activeSession, businessCustomers],
  );
  const scopedLeads = useMemo(
    () => filterByProjectScope(businessLeads, activeSession ?? {}),
    [activeSession, businessLeads],
  );
  const scopedTickets = useMemo(
    () => filterByProjectScope(businessTickets, activeSession ?? {}),
    [activeSession, businessTickets],
  );
  const scopedContentTasks = useMemo(
    () => filterByProjectScope(businessContentTasks, activeSession ?? {}),
    [activeSession, businessContentTasks],
  );
  const scopedChannelSessions = useMemo(
    () => filterByProjectScope(businessChannelSessions, activeSession ?? {}),
    [activeSession, businessChannelSessions],
  );
  const scopedOperationLogs = useMemo(
    () => filterByProjectScope(businessOperationLogs, activeSession ?? {}),
    [activeSession, businessOperationLogs],
  );

  const customerNameMap = useMemo(
    () => Object.fromEntries(scopedCustomers.map(item => [item.id, item.name])),
    [scopedCustomers],
  );
  const customerMap = useMemo(
    () => Object.fromEntries(scopedCustomers.map(item => [item.id, item])),
    [scopedCustomers],
  );
  const leadMap = useMemo(
    () => Object.fromEntries(scopedLeads.map(item => [item.id, item])),
    [scopedLeads],
  );
  const channelSessionMap = useMemo(
    () => Object.fromEntries(scopedChannelSessions.map(item => [item.id, item])),
    [scopedChannelSessions],
  );
  const latestOperationByEntity = useMemo(() => {
    const nextMap: Record<string, BusinessOperationRecord> = {};
    for (const record of scopedOperationLogs) {
      const key = `${record.entityType}:${record.entityId}`;
      if (!nextMap[key] || record.updatedAt > nextMap[key].updatedAt) {
        nextMap[key] = record;
      }
    }
    return nextMap;
  }, [scopedOperationLogs]);

  useEffect(() => {
    if (!focusedBusinessContentTaskId) return;
    focusContentTaskCard(focusedBusinessContentTaskId);
    focusBusinessContentTask(null);
  }, [focusBusinessContentTask, focusedBusinessContentTaskId]);

  const quantSummary = useMemo(() => {
    const decisions: QuantDecision[] = [
      ...scopedCustomers.map(customer => scoreCustomerHealth(customer)),
      ...scopedLeads.map(lead => scoreLead(lead, lead.customerId ? customerMap[lead.customerId] ?? null : null)),
      ...scopedTickets.map(ticket => scoreTicket(
        ticket,
        ticket.customerId ? customerMap[ticket.customerId] ?? null : null,
        ticket.channelSessionId ? channelSessionMap[ticket.channelSessionId] ?? null : null,
      )),
      ...scopedContentTasks.map(task => scoreContentTask(
        task,
        task.customerId ? customerMap[task.customerId] ?? null : null,
        task.leadId ? leadMap[task.leadId] ?? null : null,
      )),
      ...scopedChannelSessions.map(session => scoreChannelSession(
        session,
        session.customerId ? customerMap[session.customerId] ?? null : null,
      )),
    ];

    return {
      auto: decisions.filter(item => item.autoRunEligible && !item.humanApprovalRequired).length,
      approval: decisions.filter(item => item.humanApprovalRequired).length,
      watch: decisions.filter(item => !item.autoRunEligible && !item.humanApprovalRequired).length,
    };
  }, [channelSessionMap, customerMap, leadMap, scopedChannelSessions, scopedContentTasks, scopedCustomers, scopedLeads, scopedTickets]);

  return (
    <div className="control-center">
      <div className="control-center__hero">
        <div className="control-center__eyebrow">Business Entities</div>
        <div className="control-center__hero-title">
          让数字员工不只处理聊天，而是处理客户、线索、工单、内容和渠道会话
        </div>
        <div className="control-center__hero-copy">
          这一层是后续世界模型、量化规则和审批策略的基础。先把业务对象定义清楚，自动化才不会一直停留在“发一句自然语言指令”的水平。
        </div>
        <div className="control-center__copy" style={{ marginTop: 10 }}>
          当前项目: {activeSession ? getSessionProjectLabel(activeSession) : "General"}
        </div>
      </div>

      <div className="control-center__quick-actions">
        <button type="button" className="btn-ghost" onClick={() => seedBusinessEntitiesForProject()}>
          为当前项目生成样板实体
        </button>
        <button type="button" className="btn-ghost" onClick={() => clearBusinessEntitiesForProject()}>
          清空当前项目实体
        </button>
      </div>

      <div className="control-center__stats">
        <EntityMetric label={BUSINESS_ENTITY_LABELS.customers} value={scopedCustomers.length} accent="var(--accent)" />
        <EntityMetric label={BUSINESS_ENTITY_LABELS.leads} value={scopedLeads.length} accent="#60a5fa" />
        <EntityMetric label={BUSINESS_ENTITY_LABELS.tickets} value={scopedTickets.length} accent="#f59e0b" />
        <EntityMetric label={BUSINESS_ENTITY_LABELS.contentTasks} value={scopedContentTasks.length} accent="#c084fc" />
        <EntityMetric label={BUSINESS_ENTITY_LABELS.channelSessions} value={scopedChannelSessions.length} accent="#34d399" />
        <EntityMetric label="可自动运行" value={quantSummary.auto} accent="#22c55e" />
        <EntityMetric label="需人工审批" value={quantSummary.approval} accent="#ef4444" />
        <EntityMetric label="需观察" value={quantSummary.watch} accent="#94a3b8" />
      </div>

      <div className="control-center__entity-grid">
        <EntitySection
          title="客户"
          empty="当前项目还没有客户实体。"
          items={scopedCustomers.map(customer => {
            const decision = scoreCustomerHealth(customer);
            const latestOperation = latestOperationByEntity[`customer:${customer.id}`];
            const cardKey = `customer:${customer.id}`;
            const expanded = Boolean(expandedEntityCards[cardKey]);
            return (
              <article key={customer.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{customer.name}</strong>
                  <span className="control-center__entity-pill">{customer.tier}</span>
                </div>
                <DecisionStrip decision={decision} showSummary={expanded} />
                <div className="control-center__copy">{customer.summary}</div>
                <div className="control-center__quick-actions">
                  <button type="button" className="btn-ghost" onClick={() => toggleEntityCard(cardKey)}>
                    {expanded ? "收起详情" : "展开详情"}
                  </button>
                </div>
                {expanded ? (
                  <>
                    <div className="control-center__entity-meta">
                      <span>渠道 {customer.primaryChannel}</span>
                      <span>{customer.company ?? "独立客户"}</span>
                    </div>
                    <EntityAuditSummary
                      operation={latestOperation}
                      onOpenRemoteOps={() => openControlCenterSection("remote")}
                      onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        />

        <EntitySection
          title="线索"
          empty="当前项目还没有线索实体。"
          items={scopedLeads.map(lead => {
            const decision = scoreLead(lead, lead.customerId ? customerMap[lead.customerId] ?? null : null);
            const latestOperation = latestOperationByEntity[`lead:${lead.id}`];
            const cardKey = `lead:${lead.id}`;
            const expanded = Boolean(expandedEntityCards[cardKey]);
            return (
              <article key={lead.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{lead.title}</strong>
                  <span className="control-center__entity-pill">{lead.stage}</span>
                </div>
                <DecisionStrip decision={decision} showSummary={expanded} />
                <div className="control-center__copy">
                  客户: {lead.customerId ? customerNameMap[lead.customerId] ?? "未关联" : "未关联"} · 原始分数 {lead.score}
                </div>
                <div className="control-center__quick-actions">
                  <button type="button" className="btn-ghost" onClick={() => toggleEntityCard(cardKey)}>
                    {expanded ? "收起详情" : "展开详情"}
                  </button>
                </div>
                {expanded ? (
                  <>
                    <div className="control-center__entity-meta">
                      <span>来源 {lead.source}</span>
                      <span>{lead.nextAction}</span>
                    </div>
                    <div className="control-center__quick-actions">
                      <button type="button" className="btn-ghost" onClick={() => advanceBusinessLeadStage(lead.id)}>
                        推进阶段
                      </button>
                    </div>
                    <EntityAuditSummary
                      operation={latestOperation}
                      onOpenRemoteOps={() => openControlCenterSection("remote")}
                      onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        />

        <EntitySection
          title="工单"
          empty="当前项目还没有工单实体。"
          items={scopedTickets.map(ticket => {
            const decision = scoreTicket(
              ticket,
              ticket.customerId ? customerMap[ticket.customerId] ?? null : null,
              ticket.channelSessionId ? channelSessionMap[ticket.channelSessionId] ?? null : null,
            );
            const latestOperation = latestOperationByEntity[`ticket:${ticket.id}`];
            const cardKey = `ticket:${ticket.id}`;
            const expanded = Boolean(expandedEntityCards[cardKey]);
            return (
              <article key={ticket.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{ticket.subject}</strong>
                  <span className="control-center__entity-pill" style={{ color: getBusinessPriorityTone(ticket.priority) }}>
                    {ticket.priority}
                  </span>
                </div>
                <DecisionStrip decision={decision} showSummary={expanded} />
                <div className="control-center__copy">{ticket.summary}</div>
                <div className="control-center__quick-actions">
                  <button type="button" className="btn-ghost" onClick={() => toggleEntityCard(cardKey)}>
                    {expanded ? "收起详情" : "展开详情"}
                  </button>
                </div>
                {expanded ? (
                  <>
                    <div className="control-center__entity-meta">
                      <span>状态 {ticket.status}</span>
                      <span>客户 {ticket.customerId ? customerNameMap[ticket.customerId] ?? "未关联" : "未关联"}</span>
                    </div>
                    <div className="control-center__quick-actions">
                      <button type="button" className="btn-ghost" onClick={() => advanceBusinessTicketStatus(ticket.id)}>
                        推进状态
                      </button>
                    </div>
                    <EntityAuditSummary
                      operation={latestOperation}
                      onOpenRemoteOps={() => openControlCenterSection("remote")}
                      onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        />

        <EntitySection
          title="内容任务"
          empty="当前项目还没有内容任务实体。"
          items={scopedContentTasks.map(task => {
            const decision = scoreContentTask(
              task,
              task.customerId ? customerMap[task.customerId] ?? null : null,
              task.leadId ? leadMap[task.leadId] ?? null : null,
            );
            const latestOperation = latestOperationByEntity[`contentTask:${task.id}`];
            const cardKey = `contentTask:${task.id}`;
            const expanded = Boolean(expandedEntityCards[cardKey]);
            return (
              <article
                key={task.id}
                ref={node => {
                  contentTaskRefs.current[task.id] = node;
                }}
                className="control-center__entity-card"
                style={highlightedContentTaskId === task.id ? {
                  borderColor: "rgba(125, 211, 252, 0.52)",
                  background: "linear-gradient(180deg, rgba(125, 211, 252, 0.18), rgba(255,255,255,0.04))",
                  boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.12), 0 20px 50px rgba(15, 23, 42, 0.24)",
                } : undefined}
              >
                <div className="control-center__entity-head">
                  <strong>{task.title}</strong>
                  <span className="control-center__entity-pill" style={{ color: getBusinessPriorityTone(task.priority) }}>
                    {task.status}
                  </span>
                </div>
                <DecisionStrip decision={decision} showSummary={expanded} />
                <div className="control-center__copy">{task.brief}</div>
                <div className="control-center__quick-actions">
                  <button type="button" className="btn-ghost" onClick={() => toggleEntityCard(cardKey)}>
                    {expanded ? "收起详情" : "展开详情"}
                  </button>
                </div>
                {expanded ? (
                  <>
                    <div className="control-center__entity-meta">
                      <span>{task.format} · {task.channel}</span>
                      <span>客户 {task.customerId ? customerNameMap[task.customerId] ?? "未关联" : "未关联"}</span>
                    </div>
                    <div className="control-center__entity-note">目标: {task.goal}</div>
                    <div className="control-center__entity-meta">
                      <span>发布目标 {task.publishTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ") || "未设置"}</span>
                      <span>{task.scheduledFor ? `排期 ${new Date(task.scheduledFor).toLocaleString("zh-CN", { hour12: false })}` : "未排期"}</span>
                    </div>
                    {task.latestDraftSummary ? (
                      <div className="control-center__entity-note">最近草稿: {task.latestDraftSummary}</div>
                    ) : null}
                    {task.latestPostmortemSummary ? (
                      <div className="control-center__entity-note">最近复盘: {task.latestPostmortemSummary}</div>
                    ) : null}
                    {task.nextCycleRecommendation ? (
                      <div className="control-center__entity-note">下一轮建议: {getNextCycleLabel(task.nextCycleRecommendation)}</div>
                    ) : null}
                    {task.recommendedPrimaryChannel || task.riskyChannels.length > 0 ? (
                      <div className="control-center__entity-note">
                        渠道策略: 主发 {task.recommendedPrimaryChannel ?? task.channel}
                        {task.riskyChannels.length > 0 ? ` · 风险 ${task.riskyChannels.join(" / ")}` : " · 暂无高风险渠道"}
                      </div>
                    ) : null}
                    {task.channelGovernance.length > 0 ? (
                      <div className="control-center__entity-note">
                        渠道表现: {task.channelGovernance.slice(0, 3).map(item =>
                          `${item.channel} ${item.completed}/${item.failed} ${getChannelGovernanceLabel(item.recommendation)}`,
                        ).join(" / ")}
                      </div>
                    ) : null}
                    {task.publishedLinks.length > 0 ? (
                      <div className="control-center__entity-note">已发布链接: {task.publishedLinks.join(" / ")}</div>
                    ) : null}
                    {task.publishedResults.length > 0 ? (
                      <div className="control-center__entity-note">
                        发布结果: {task.publishedResults.slice(0, 2).map(result =>
                          `${result.channel}:${result.accountLabel} · ${result.status}${result.externalId ? ` · ${result.externalId}` : ""}${result.link ? ` · ${result.link}` : ""}`,
                        ).join(" / ")}
                      </div>
                    ) : null}
                    <div className="control-center__entity-meta">
                      <span>{task.lastWorkflowRunId ? `Workflow ${task.lastWorkflowRunId}` : "暂无 workflow"}</span>
                      <span>{task.lastExecutionRunId ? `Execution ${task.lastExecutionRunId}` : "暂无 execution"}</span>
                    </div>
                    <div className="control-center__quick-actions">
                      <button type="button" className="btn-ghost" onClick={() => advanceBusinessContentTaskStatus(task.id)}>
                        手动推进状态
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          const workflowRunId = queueContentTaskWorkflowRun(task.id);
                          if (!workflowRunId) return;
                          openControlCenterSection("workflow");
                        }}
                      >
                        {task.lastWorkflowRunId ? "继续 workflow" : "创建 workflow"}
                      </button>
                      {task.channelGovernance.length > 0 ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => applyContentChannelGovernance({ contentTaskId: task.id })}
                        >
                          应用渠道治理
                        </button>
                      ) : null}
                      {task.lastExecutionRunId ? (
                        <button type="button" className="btn-ghost" onClick={() => focusExecutionRun(task.lastExecutionRunId)}>
                          查看执行链
                        </button>
                      ) : null}
                    </div>
                    <EntityAuditSummary
                      operation={latestOperation}
                      onOpenRemoteOps={() => openControlCenterSection("remote")}
                      onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        />

        <EntitySection
          title="渠道会话"
          empty="当前项目还没有渠道会话实体。"
          items={scopedChannelSessions.map(session => {
            const decision = scoreChannelSession(
              session,
              session.customerId ? customerMap[session.customerId] ?? null : null,
            );
            const latestOperation = latestOperationByEntity[`channelSession:${session.id}`];
            const cardKey = `channelSession:${session.id}`;
            const expanded = Boolean(expandedEntityCards[cardKey]);
            return (
              <article key={session.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{session.title}</strong>
                  <span className="control-center__entity-pill">{session.status}</span>
                </div>
                <DecisionStrip decision={decision} showSummary={expanded} />
                <div className="control-center__copy">{session.summary}</div>
                <div className="control-center__quick-actions">
                  <button type="button" className="btn-ghost" onClick={() => toggleEntityCard(cardKey)}>
                    {expanded ? "收起详情" : "展开详情"}
                  </button>
                </div>
                {expanded ? (
                  <>
                    <div className="control-center__entity-meta">
                      <span>渠道 {session.channel}</span>
                      <span>客户 {session.customerId ? customerNameMap[session.customerId] ?? "未关联" : "未关联"}</span>
                    </div>
                    {(session.lastHandledAt || session.handledBy) ? (
                      <div className="control-center__entity-note">
                        最近处理: {session.handledBy ?? "manual"} {session.lastHandledAt ? `· ${new Date(session.lastHandledAt).toLocaleString("zh-CN", { hour12: false })}` : ""}
                      </div>
                    ) : null}
                    <div className="control-center__quick-actions">
                      <button type="button" className="btn-ghost" onClick={() => advanceBusinessChannelSessionStatus(session.id)}>
                        推进状态
                      </button>
                    </div>
                    <EntityAuditSummary
                      operation={latestOperation}
                      onOpenRemoteOps={() => openControlCenterSection("remote")}
                      onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        />
      </div>
    </div>
  );
}

function EntityMetric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="control-center__stat-card">
      <div className="control-center__stat-label">{label}</div>
      <div className="control-center__stat-value" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function DecisionStrip({ decision, showSummary = true }: { decision: QuantDecision; showSummary?: boolean }) {
  const tone = getDecisionTone(decision);
  return (
    <div className="control-center__quant-strip">
      <span className={`control-center__quant-badge is-${tone}`}>分数 {decision.score}</span>
      <span className={`control-center__quant-badge ${decision.autoRunEligible ? "is-auto" : "is-watch"}`}>
        {decision.autoRunEligible ? "可自动运行" : "先观察"}
      </span>
      <span className={`control-center__quant-badge ${decision.humanApprovalRequired ? "is-approval" : "is-auto"}`}>
        {decision.humanApprovalRequired ? "需人工审批" : "可直接推进"}
      </span>
      {showSummary ? <div className="control-center__entity-note">{decision.summary}</div> : null}
    </div>
  );
}

function EntitySection({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: ReactNode[];
}) {
  return (
    <section className="control-center__panel">
      <div className="control-center__panel-title">{title}</div>
      <div className="control-center__entity-list">
        {items.length > 0 ? items : <div className="control-center__copy">{empty}</div>}
      </div>
    </section>
  );
}

function EntityAuditSummary({
  operation,
  onOpenRemoteOps,
  onOpenExecution,
}: {
  operation?: BusinessOperationRecord;
  onOpenRemoteOps: () => void;
  onOpenExecution?: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "grid",
        gap: 10,
        padding: 12,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>最近审计动作</div>
        {operation ? (
          <span className={`control-center__scenario-badge is-${getOperationTone(operation.status)}`}>
            {getOperationLabel(operation)}
          </span>
        ) : (
          <span className="control-center__scenario-badge is-partial">尚未进入审计链路</span>
        )}
      </div>
      <div className="control-center__entity-note">
        {operation ? operation.detail : "这个实体还没有审批或派发记录，适合从远程值守面板开始建立自动化链路。"}
      </div>
      <div className="control-center__quick-actions">
        <button type="button" className="btn-ghost" onClick={onOpenRemoteOps}>
          去远程值守
        </button>
        {onOpenExecution ? (
          <button type="button" className="btn-ghost" onClick={onOpenExecution}>
            查看对应执行
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getOperationTone(status: BusinessOperationRecord["status"]) {
  if (status === "approved" || status === "sent" || status === "completed") {
    return "ready";
  }
  if (status === "pending") {
    return "partial";
  }
  return "blocked";
}

function getOperationLabel(operation: BusinessOperationRecord) {
  if (operation.eventType === "approval") {
    if (operation.status === "approved") return "已批准";
    if (operation.status === "rejected") return "已驳回";
    return "待审批";
  }

  if (operation.eventType === "workflow") {
    if (operation.status === "completed") return "Workflow 完成";
    if (operation.status === "failed") return "Workflow 失败";
    return "Workflow 处理中";
  }

  if (operation.eventType === "connector") {
    if (operation.status === "failed") return "连接器异常";
    if (operation.status === "completed") return "连接器已同步";
    return "连接器处理中";
  }

  if (operation.eventType === "message") {
    if (operation.status === "failed") return "消息失败";
    if (operation.status === "completed" || operation.status === "sent") return "消息已回写";
    return "消息处理中";
  }

  if (operation.eventType === "publish") {
    if (operation.status === "completed") return "已回写发布";
    if (operation.status === "failed") return "发布失败";
    return "发布处理中";
  }

  if (operation.eventType === "governance") {
    return "治理动作";
  }

  if (operation.eventType === "desktop") {
    if (operation.status === "completed") return "桌面现场已记录";
    if (operation.status === "blocked") return "桌面动作待接管";
    if (operation.status === "failed") return "桌面动作失败";
    return "桌面动作";
  }

  if (operation.status === "sent") {
    return "已派发";
  }
  if (operation.status === "blocked") {
    return "已阻断";
  }
  return "处理中";
}

function getNextCycleLabel(value: "reuse" | "retry" | "rewrite") {
  switch (value) {
    case "reuse":
      return "待复用";
    case "retry":
      return "待重发";
    default:
      return "待改写";
  }
}

function getChannelGovernanceLabel(value: "primary" | "secondary" | "risky") {
  switch (value) {
    case "primary":
      return "主发";
    case "risky":
      return "风险";
    default:
      return "观察";
  }
}
