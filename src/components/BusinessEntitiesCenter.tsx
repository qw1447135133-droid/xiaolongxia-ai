"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import type { BusinessContentFormat, BusinessEntityType, BusinessOperationRecord } from "@/types/business-entities";
import type { ControlCenterSectionId } from "@/store/types";

export function BusinessEntitiesCenter() {
  const [creatorType, setCreatorType] = useState<"customer" | "lead" | "ticket" | "content" | "session">("customer");
  const [primaryText, setPrimaryText] = useState("");
  const [detailText, setDetailText] = useState("");
  const [contentFormat, setContentFormat] = useState<BusinessContentFormat>("post");
  const [contentGoal, setContentGoal] = useState("");
  const [publishTargetsText, setPublishTargetsText] = useState("blog:官网博客");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedChannelSessionId, setSelectedChannelSessionId] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const createBusinessCustomer = useStore(s => s.createBusinessCustomer);
  const createBusinessLead = useStore(s => s.createBusinessLead);
  const createBusinessTicket = useStore(s => s.createBusinessTicket);
  const createBusinessContentTask = useStore(s => s.createBusinessContentTask);
  const createBusinessChannelSession = useStore(s => s.createBusinessChannelSession);
  const advanceBusinessLeadStage = useStore(s => s.advanceBusinessLeadStage);
  const advanceBusinessTicketStatus = useStore(s => s.advanceBusinessTicketStatus);
  const advanceBusinessContentTaskStatus = useStore(s => s.advanceBusinessContentTaskStatus);
  const advanceBusinessChannelSessionStatus = useStore(s => s.advanceBusinessChannelSessionStatus);
  const queueContentTaskWorkflowRun = useStore(s => s.queueContentTaskWorkflowRun);
  const seedBusinessEntitiesForProject = useStore(s => s.seedBusinessEntitiesForProject);
  const clearBusinessEntitiesForProject = useStore(s => s.clearBusinessEntitiesForProject);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);

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

  const resetCreator = () => {
    setPrimaryText("");
    setDetailText("");
    setContentFormat("post");
    setContentGoal("");
    setPublishTargetsText("blog:官网博客");
    setSelectedCustomerId("");
    setSelectedChannelSessionId("");
    setSelectedLeadId("");
  };

  const submitCreate = () => {
    const title = primaryText.trim();
    const detail = detailText.trim();
    if (!title) return;

    if (creatorType === "customer") {
      createBusinessCustomer({
        name: title,
        tier: "prospect",
        primaryChannel: "web",
        company: "",
        summary: detail || "待补充客户摘要",
      });
    }

    if (creatorType === "lead") {
      createBusinessLead({
        title,
        customerId: selectedCustomerId || null,
        source: "manual",
        stage: "new",
        score: 50,
        nextAction: detail || "待补充下一步动作",
      });
    }

    if (creatorType === "ticket") {
      createBusinessTicket({
        subject: title,
        customerId: selectedCustomerId || null,
        channelSessionId: selectedChannelSessionId || null,
        status: "new",
        priority: "normal",
        summary: detail || "待补充工单摘要",
      });
    }

    if (creatorType === "content") {
      const parsedTargets = parsePublishTargets(publishTargetsText);
      createBusinessContentTask({
        title,
        customerId: selectedCustomerId || null,
        leadId: selectedLeadId || null,
        channel: "blog",
        format: contentFormat,
        goal: contentGoal.trim() || detail || "待补充内容目标",
        publishTargets: parsedTargets.length > 0 ? parsedTargets : [{ channel: "blog", accountLabel: "官网博客" }],
        status: "draft",
        priority: "normal",
        brief: detail || "待补充内容任务说明",
      });
    }

    if (creatorType === "session") {
      createBusinessChannelSession({
        title,
        customerId: selectedCustomerId || null,
        channel: "web",
        externalRef: `manual:${Date.now()}`,
        status: "open",
        summary: detail || "待补充渠道会话摘要",
      });
    }

    resetCreator();
  };

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

      <div className="control-center__panel">
        <div className="control-center__panel-title">快速创建实体</div>
        <div className="control-center__mode-list">
          <div className="control-center__theme-list">
            {([
              ["customer", "客户"],
              ["lead", "线索"],
              ["ticket", "工单"],
              ["content", "内容任务"],
              ["session", "渠道会话"],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                type="button"
                className={`btn-ghost control-center__theme-option ${creatorType === type ? "is-active" : ""}`}
                onClick={() => setCreatorType(type)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="scheduled-form__field">
            <label className="scheduled-form__label">
              {creatorType === "customer" ? "名称" : creatorType === "ticket" ? "主题" : "标题"}
            </label>
            <input
              className="input scheduled-form__input"
              value={primaryText}
              onChange={event => setPrimaryText(event.target.value)}
              placeholder="输入主要标题"
            />
          </div>

          <div className="scheduled-form__field">
            <label className="scheduled-form__label">摘要 / 下一步 / Brief</label>
            <textarea
              className="input scheduled-form__textarea"
              value={detailText}
              onChange={event => setDetailText(event.target.value)}
              placeholder="输入补充说明"
            />
          </div>

          {creatorType !== "customer" && (
            <div className="scheduled-form__field">
              <label className="scheduled-form__label">关联客户</label>
              <select
                className="input scheduled-form__input"
                value={selectedCustomerId}
                onChange={event => setSelectedCustomerId(event.target.value)}
              >
                <option value="">暂不关联</option>
                {scopedCustomers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {creatorType === "ticket" && (
            <div className="scheduled-form__field">
              <label className="scheduled-form__label">关联渠道会话</label>
              <select
                className="input scheduled-form__input"
                value={selectedChannelSessionId}
                onChange={event => setSelectedChannelSessionId(event.target.value)}
              >
                <option value="">暂不关联</option>
                {scopedChannelSessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {creatorType === "content" && (
            <>
              <div className="scheduled-form__field">
                <label className="scheduled-form__label">关联线索</label>
                <select
                  className="input scheduled-form__input"
                  value={selectedLeadId}
                  onChange={event => setSelectedLeadId(event.target.value)}
                >
                  <option value="">暂不关联</option>
                  {scopedLeads.map(lead => (
                    <option key={lead.id} value={lead.id}>
                      {lead.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="scheduled-form__field">
                <label className="scheduled-form__label">内容形式</label>
                <select
                  className="input scheduled-form__input"
                  value={contentFormat}
                  onChange={event => setContentFormat(event.target.value as BusinessContentFormat)}
                >
                  {(["post", "thread", "article", "script", "campaign"] as const).map(format => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>

              <div className="scheduled-form__field">
                <label className="scheduled-form__label">内容目标</label>
                <textarea
                  className="input scheduled-form__textarea"
                  value={contentGoal}
                  onChange={event => setContentGoal(event.target.value)}
                  placeholder="例如：生成一版可转销售线索的产品介绍内容"
                />
              </div>

              <div className="scheduled-form__field">
                <label className="scheduled-form__label">发布目标</label>
                <textarea
                  className="input scheduled-form__textarea"
                  value={publishTargetsText}
                  onChange={event => setPublishTargetsText(event.target.value)}
                  placeholder={"每行一个目标，例如：\nblog:官网博客\nx:品牌账号"}
                />
              </div>
            </>
          )}

          <div className="scheduled-form__actions">
            <button type="button" className="btn-ghost scheduled-form__button" onClick={resetCreator}>
              清空
            </button>
            <button type="button" className="btn-primary scheduled-form__button" onClick={submitCreate}>
              创建实体
            </button>
          </div>
        </div>
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
            return (
              <article key={customer.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{customer.name}</strong>
                  <span className="control-center__entity-pill">{customer.tier}</span>
                </div>
                <DecisionStrip decision={decision} />
                <div className="control-center__copy">{customer.summary}</div>
                <div className="control-center__entity-meta">
                  <span>渠道 {customer.primaryChannel}</span>
                  <span>{customer.company ?? "独立客户"}</span>
                </div>
                <EntityAuditSummary
                  operation={latestOperation}
                  onOpenRemoteOps={() => openControlCenterSection("remote")}
                  onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                />
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
            return (
              <article key={lead.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{lead.title}</strong>
                  <span className="control-center__entity-pill">{lead.stage}</span>
                </div>
                <DecisionStrip decision={decision} />
                <div className="control-center__copy">
                  客户: {lead.customerId ? customerNameMap[lead.customerId] ?? "未关联" : "未关联"} · 原始分数 {lead.score}
                </div>
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
            return (
              <article key={ticket.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{ticket.subject}</strong>
                  <span className="control-center__entity-pill" style={{ color: getBusinessPriorityTone(ticket.priority) }}>
                    {ticket.priority}
                  </span>
                </div>
                <DecisionStrip decision={decision} />
                <div className="control-center__copy">{ticket.summary}</div>
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
            return (
              <article key={task.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{task.title}</strong>
                  <span className="control-center__entity-pill" style={{ color: getBusinessPriorityTone(task.priority) }}>
                    {task.status}
                  </span>
                </div>
                <DecisionStrip decision={decision} />
                <div className="control-center__copy">{task.brief}</div>
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
            return (
              <article key={session.id} className="control-center__entity-card">
                <div className="control-center__entity-head">
                  <strong>{session.title}</strong>
                  <span className="control-center__entity-pill">{session.status}</span>
                </div>
                <DecisionStrip decision={decision} />
                <div className="control-center__copy">{session.summary}</div>
                <div className="control-center__entity-meta">
                  <span>渠道 {session.channel}</span>
                  <span>客户 {session.customerId ? customerNameMap[session.customerId] ?? "未关联" : "未关联"}</span>
                </div>
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

function DecisionStrip({ decision }: { decision: QuantDecision }) {
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
      <div className="control-center__entity-note">{decision.summary}</div>
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

  if (operation.eventType === "publish") {
    if (operation.status === "completed") return "已回写发布";
    if (operation.status === "failed") return "发布失败";
    return "发布处理中";
  }

  if (operation.status === "sent") {
    return "已派发";
  }
  if (operation.status === "blocked") {
    return "已阻断";
  }
  return "处理中";
}

function parsePublishTargets(value: string) {
  return value
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const [channelRaw, ...labelParts] = item.split(":");
      const channel = channelRaw?.trim();
      const accountLabel = labelParts.join(":").trim();
      if (!channel || !accountLabel) return null;
      if (!["x", "telegram", "line", "feishu", "wecom", "blog"].includes(channel)) return null;

      return {
        channel: channel as "x" | "telegram" | "line" | "feishu" | "wecom" | "blog",
        accountLabel,
      };
    })
    .filter((item): item is { channel: "x" | "telegram" | "line" | "feishu" | "wecom" | "blog"; accountLabel: string } => Boolean(item));
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
