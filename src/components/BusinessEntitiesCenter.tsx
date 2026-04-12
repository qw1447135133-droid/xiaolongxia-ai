"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/store";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import {
  BUSINESS_ENTITY_LABELS,
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
import type { BusinessChannelSession, BusinessCustomer, BusinessOperationRecord } from "@/types/business-entities";
import type { ControlCenterSectionId } from "@/store/types";

const BUSINESS_CHANNEL_LABELS: Record<BusinessChannelSession["channel"], string> = {
  wecom: "企业微信",
  feishu: "飞书",
  telegram: "Telegram",
  line: "LINE",
  dingtalk: "钉钉",
  wechat_official: "微信公众号",
  qq: "QQ",
  email: "Email",
  web: "Web",
};
type BusinessMessageTone = "customer" | "manual" | "ai" | "system";

function getBusinessChannelServiceModeLabel(session: BusinessChannelSession) {
  return session.serviceMode === "customer_service" ? "客服模式" : "私域模式";
}

function formatBusinessEntityTimestamp(timestamp?: number) {
  if (!timestamp) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function getBusinessMessageTone(operation: BusinessOperationRecord) {
  const signal = `${operation.title} ${operation.detail}`;
  if (/收到|入站|inbound|客户|客戶|用户消息|用戶消息/u.test(signal)) return "customer" as const;
  if (/已处理|已處理|连接器|連接器|connector|同步|webhook|拦截|攔截|审批|審批|失败|失敗/u.test(signal)) {
    return "system" as const;
  }
  if (operation.trigger === "manual") return "manual" as const;
  return "ai" as const;
}

function getBusinessMessageActorLabel(operation: BusinessOperationRecord) {
  const tone = getBusinessMessageTone(operation);
  if (tone === "customer") return "客户";
  if (tone === "manual") return "人工回复";
  if (tone === "system") return "系统记录";
  return "AI值守";
}

function truncateCustomerSummary(value: string, maxLength = 78) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getCustomerPlatformChannels(customer: BusinessCustomer, sessions: BusinessChannelSession[]) {
  const ordered: BusinessChannelSession["channel"][] = [];
  const seen = new Set<BusinessChannelSession["channel"]>();
  const register = (channel: BusinessChannelSession["channel"] | undefined) => {
    if (!channel || seen.has(channel)) return;
    seen.add(channel);
    ordered.push(channel);
  };

  sessions.forEach(session => register(session.channel));
  customer.channelIdentities.forEach(identity => register(identity.channel));
  register(customer.primaryChannel);

  return ordered;
}

function getCustomerLastActivityAt(customer: BusinessCustomer, sessions: BusinessChannelSession[]) {
  return Math.max(
    customer.updatedAt,
    customer.profileLastUpdatedAt,
    ...customer.channelIdentities.map(identity => identity.lastSeenAt),
    ...sessions.map(session => session.lastMessageAt),
  );
}

function getCustomerTierLabel(tier: BusinessCustomer["tier"]) {
  if (tier === "vip") return "VIP 客户";
  if (tier === "active") return "活跃客户";
  return "潜在客户";
}

export function BusinessEntitiesCenter() {
  const chatSessions = useStore(s => s.chatSessions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const businessCustomers = useStore(s => s.businessCustomers);
  const businessLeads = useStore(s => s.businessLeads);
  const businessTickets = useStore(s => s.businessTickets);
  const businessContentTasks = useStore(s => s.businessContentTasks);
  const businessChannelSessions = useStore(s => s.businessChannelSessions);
  const businessOperationLogs = useStore(s => s.businessOperationLogs);
  const openChannelSessionChat = useStore(s => s.openChannelSessionChat);
  const advanceBusinessChannelSessionStatus = useStore(s => s.advanceBusinessChannelSessionStatus);
  const markBusinessChannelSessionHandled = useStore(s => s.markBusinessChannelSessionHandled);
  const seedBusinessEntitiesForProject = useStore(s => s.seedBusinessEntitiesForProject);
  const clearBusinessEntitiesForProject = useStore(s => s.clearBusinessEntitiesForProject);
  const setActiveExecutionRun = useStore(s => s.setActiveExecutionRun);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);
  const setTab = useStore(s => s.setTab);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);

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

  const handoffChannelSessionToChat = (channelSessionId: string) => {
    openChannelSessionChat(channelSessionId);
    setTab("tasks");
  };

  const closeCustomerDialog = () => setActiveCustomerId(null);

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
  const sortedScopedChannelSessions = useMemo(
    () => [...scopedChannelSessions].sort((left, right) => right.lastMessageAt - left.lastMessageAt),
    [scopedChannelSessions],
  );
  const channelSessionOwnerMap = useMemo(() => {
    const nextMap = new Map<string, string>();
    for (const customer of scopedCustomers) {
      customer.linkedSessionIds.forEach(sessionId => {
        if (!nextMap.has(sessionId)) {
          nextMap.set(sessionId, customer.id);
        }
      });
    }
    for (const session of sortedScopedChannelSessions) {
      if (session.customerId) {
        nextMap.set(session.id, session.customerId);
      }
    }
    return nextMap;
  }, [scopedCustomers, sortedScopedChannelSessions]);
  const customerChannelSessionsMap = useMemo(() => {
    const nextMap = new Map<string, BusinessChannelSession[]>();
    for (const session of sortedScopedChannelSessions) {
      const ownerId = channelSessionOwnerMap.get(session.id);
      if (!ownerId) continue;
      const current = nextMap.get(ownerId) ?? [];
      current.push(session);
      nextMap.set(ownerId, current);
    }
    return nextMap;
  }, [channelSessionOwnerMap, sortedScopedChannelSessions]);
  const sessionMessageLogMap = useMemo(() => {
    const nextMap = new Map<string, BusinessOperationRecord[]>();
    const messageLogs = scopedOperationLogs
      .filter(record => record.entityType === "channelSession" && record.eventType === "message")
      .sort((left, right) => left.createdAt - right.createdAt);
    for (const record of messageLogs) {
      const current = nextMap.get(record.entityId) ?? [];
      current.push(record);
      nextMap.set(record.entityId, current);
    }
    return nextMap;
  }, [scopedOperationLogs]);
  const unassignedChannelSessions = useMemo(
    () => sortedScopedChannelSessions.filter(session => !channelSessionOwnerMap.has(session.id)),
    [channelSessionOwnerMap, sortedScopedChannelSessions],
  );
  const activeCustomer = useMemo(
    () => (activeCustomerId ? scopedCustomers.find(customer => customer.id === activeCustomerId) ?? null : null),
    [activeCustomerId, scopedCustomers],
  );
  const sortedScopedCustomers = useMemo(
    () =>
      [...scopedCustomers].sort((left, right) => {
        const leftSessions = customerChannelSessionsMap.get(left.id) ?? [];
        const rightSessions = customerChannelSessionsMap.get(right.id) ?? [];
        return getCustomerLastActivityAt(right, rightSessions) - getCustomerLastActivityAt(left, leftSessions);
      }),
    [customerChannelSessionsMap, scopedCustomers],
  );

  useEffect(() => {
    if (!activeCustomerId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCustomerId(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCustomerId]);

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
          把客户档案和客户会话集中放在一个业务实体视图里
        </div>
        <div className="control-center__hero-copy">
          这里保留客户画像、会话归档、消息记录和接管入口，让值守、人工回复和客户运营都围绕同一份客户档案展开。
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
          wide
          listClassName="control-center__entity-list--customer-cards"
          items={sortedScopedCustomers.map(customer => {
            const decision = scoreCustomerHealth(customer);
            const customerSessions = customerChannelSessionsMap.get(customer.id) ?? [];
            const customerConversationCount = customerSessions.reduce(
              (total, session) => total + (sessionMessageLogMap.get(session.id)?.length ?? 0),
              0,
            );
            const platformChannels = getCustomerPlatformChannels(customer, customerSessions);
            const lastActivityAt = getCustomerLastActivityAt(customer, customerSessions);
            return (
              <article
                key={customer.id}
                className="control-center__entity-card control-center__customer-card"
                role="button"
                tabIndex={0}
                onClick={() => setActiveCustomerId(customer.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActiveCustomerId(customer.id);
                  }
                }}
              >
                <div className="control-center__entity-head">
                  <strong>{customer.name}</strong>
                  <span className="control-center__entity-pill">{customer.tier}</span>
                </div>
                <DecisionStrip decision={decision} showSummary={false} />
                <div className="control-center__customer-platforms">
                  {platformChannels.length > 0 ? (
                    platformChannels.map(channel => (
                      <span key={`${customer.id}-${channel}`} className="control-center__customer-platform-pill">
                        {BUSINESS_CHANNEL_LABELS[channel]}
                      </span>
                    ))
                  ) : (
                    <span className="control-center__customer-platform-pill">
                      {BUSINESS_CHANNEL_LABELS[customer.primaryChannel]}
                    </span>
                  )}
                </div>
                <div className="control-center__copy control-center__customer-card-summary">
                  {truncateCustomerSummary(customer.summary)}
                </div>
                <div className="control-center__entity-meta control-center__customer-card-meta">
                  <span>{customer.company ?? "独立客户"}</span>
                  <span>会话 {customerSessions.length} · 消息 {customerConversationCount}</span>
                </div>
                <div className="control-center__customer-card-footer">
                  <div className="control-center__customer-card-metrics">
                    <span className="control-center__customer-metric-pill">标签 {customer.tags.length}</span>
                    <span className="control-center__customer-metric-pill">平台 {platformChannels.length}</span>
                    <span className="control-center__customer-metric-pill">活跃 {formatBusinessEntityTimestamp(lastActivityAt)}</span>
                  </div>
                </div>
              </article>
            );
          })}
        />

        {unassignedChannelSessions.length > 0 ? (
          <EntitySection
            title="待归属会话"
            empty="当前项目没有未归属会话。"
            wide
            items={unassignedChannelSessions.map(session => {
              const decision = scoreChannelSession(session, null);
              const latestOperation = latestOperationByEntity[`channelSession:${session.id}`];
              const sessionLogs = sessionMessageLogMap.get(session.id) ?? [];
              return (
                <article key={session.id} className="control-center__entity-card">
                  <div className="control-center__entity-head">
                    <strong>{session.title}</strong>
                    <span className="control-center__entity-pill">{BUSINESS_CHANNEL_LABELS[session.channel]}</span>
                  </div>
                  <DecisionStrip decision={decision} />
                  <div className="control-center__copy">{session.summary}</div>
                  <div className="control-center__entity-meta">
                    <span>{getBusinessChannelServiceModeLabel(session)}</span>
                    <span>{session.participantLabel || session.accountLabel || session.externalRef}</span>
                  </div>
                  <div className="control-center__quick-actions">
                    <button type="button" className="btn-ghost" onClick={() => handoffChannelSessionToChat(session.id)}>
                      聊天接管
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => advanceBusinessChannelSessionStatus(session.id)}>
                      推进状态
                    </button>
                  </div>
                  {sessionLogs.length > 0 ? (
                    <div className="control-center__customer-message-list">
                      {sessionLogs.map(operation => {
                        const tone = getBusinessMessageTone(operation);
                        return (
                          <article
                            key={operation.id}
                            className={`control-center__customer-message control-center__customer-message--${tone}`}
                          >
                            <div className="control-center__customer-message-meta">
                              <span>{getBusinessMessageActorLabel(operation)}</span>
                              <span>{formatBusinessEntityTimestamp(operation.createdAt)}</span>
                            </div>
                            <div className="control-center__customer-message-title">{operation.title}</div>
                            <div className="control-center__customer-message-detail">{operation.detail}</div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                  <EntityAuditSummary
                    operation={latestOperation}
                    onOpenRemoteOps={() => openControlCenterSection("remote")}
                    onOpenExecution={latestOperation?.executionRunId ? () => focusExecutionRun(latestOperation.executionRunId) : undefined}
                  />
                </article>
              );
            })}
          />
        ) : null}
      </div>

      {activeCustomer ? (
        <CustomerDetailDialog
          customer={activeCustomer}
          customerSessions={customerChannelSessionsMap.get(activeCustomer.id) ?? []}
          latestOperation={latestOperationByEntity[`customer:${activeCustomer.id}`]}
          sessionMessageLogMap={sessionMessageLogMap}
          onClose={closeCustomerDialog}
          onOpenRemoteOps={() => openControlCenterSection("remote")}
          onOpenExecution={(runId) => focusExecutionRun(runId)}
          onHandoffChannelSession={handoffChannelSessionToChat}
          onAdvanceChannelSession={advanceBusinessChannelSessionStatus}
          onMarkChannelSessionHandled={(channelSessionId, title) => markBusinessChannelSessionHandled({
            channelSessionId,
            trigger: "manual",
            detail: `已在业务实体中将 ${title} 标记为已处理。`,
            handledBy: "manual",
          })}
        />
      ) : null}
    </div>
  );
}

function CustomerDetailDialog({
  customer,
  customerSessions,
  latestOperation,
  sessionMessageLogMap,
  onClose,
  onOpenRemoteOps,
  onOpenExecution,
  onHandoffChannelSession,
  onAdvanceChannelSession,
  onMarkChannelSessionHandled,
}: {
  customer: BusinessCustomer;
  customerSessions: BusinessChannelSession[];
  latestOperation?: BusinessOperationRecord;
  sessionMessageLogMap: Map<string, BusinessOperationRecord[]>;
  onClose: () => void;
  onOpenRemoteOps: () => void;
  onOpenExecution: (runId?: string | null) => void;
  onHandoffChannelSession: (channelSessionId: string) => void;
  onAdvanceChannelSession: (channelSessionId: string) => void;
  onMarkChannelSessionHandled: (channelSessionId: string, title: string) => void;
}) {
  const decision = scoreCustomerHealth(customer);
  const platformChannels = getCustomerPlatformChannels(customer, customerSessions);
  const customerMessageCount = customerSessions.reduce(
    (total, session) => total + (sessionMessageLogMap.get(session.id)?.length ?? 0),
    0,
  );
  const customerLastActivityAt = getCustomerLastActivityAt(customer, customerSessions);
  const preferredContactMethods = customer.crmProfile.interaction.preferredContactMethods.join(" / ");
  const keyFacts = [
    { label: "联系人", value: customer.crmProfile.basic.contactName || customer.name },
    { label: "行业", value: customer.crmProfile.basic.industry || "未填写" },
    { label: "联系偏好", value: preferredContactMethods || customer.crmProfile.interaction.preferredContactTime || "未填写" },
    { label: "推送敏感度", value: customer.crmProfile.derived.pushSensitivity || "未标注" },
  ].filter(item => Boolean(item.value));
  const compactInsights = [
    customer.crmProfile.interaction.recentConversationSummary
      ? `最近互动: ${customer.crmProfile.interaction.recentConversationSummary}`
      : null,
    customer.campaignPreferences.preferredTopics.length > 0
      ? `偏好推送: ${customer.campaignPreferences.preferredTopics.slice(0, 3).join(" / ")}`
      : null,
    customer.crmProfile.interaction.refuseCommunication
      ? `沟通限制: ${customer.crmProfile.interaction.refuseCommunicationReason ?? "当前不宜频繁打扰"}`
      : null,
    customer.lastCampaignAssessment
      ? `活动适配: ${customer.lastCampaignAssessment.decision} · ${customer.lastCampaignAssessment.score}`
      : null,
  ].filter(Boolean) as string[];
  const compactTags = [
    ...customer.tags.slice(0, 4),
    ...customer.crmProfile.behavior.interests.slice(0, 4),
  ].slice(0, 6);
  const recentSessionEntries = [...customerSessions]
    .sort((left, right) => right.lastMessageAt - left.lastMessageAt)
    .slice(0, 2);
  const remainingSessionCount = Math.max(0, customerSessions.length - recentSessionEntries.length);
  const recentMessageEntries = customerSessions
    .flatMap(session =>
      (sessionMessageLogMap.get(session.id) ?? []).map(operation => ({
        session,
        operation,
      })),
    )
    .sort((left, right) => right.operation.createdAt - left.operation.createdAt)
    .slice(0, 4);
  const remainingMessageCount = Math.max(0, customerMessageCount - recentMessageEntries.length);

  return (
    <div className="control-center__dialog-backdrop" onClick={onClose}>
      <div
        className="control-center__dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${customer.name} 详情`}
      >
        <div className="control-center__dialog-head">
          <div className="control-center__dialog-head-main">
            <div className="control-center__panel-title control-center__dialog-title">{customer.name}</div>
            <div className="control-center__copy">
              {customer.company ?? "独立客户"} · {getCustomerTierLabel(customer.tier)} · 画像完整度 {customer.profileCompletenessScore}/100
            </div>
          </div>
          <div className="control-center__dialog-head-side">
            <span className="control-center__entity-pill">{customer.tier}</span>
            <button type="button" className="btn-ghost" onClick={onClose}>关闭</button>
          </div>
        </div>

        <DecisionStrip decision={decision} showSummary={false} />

        <div className="control-center__dialog-shell">
          <aside className="control-center__dialog-sidebar">
            <div className="control-center__customer-overview-grid">
              <OverviewMetric label="平台触点" value={String(platformChannels.length)} note="已归并来源平台" />
              <OverviewMetric label="渠道会话" value={String(customerSessions.length)} note="客户名下归档会话" />
              <OverviewMetric label="消息流水" value={String(customerMessageCount)} note="已入库的互动记录" />
              <OverviewMetric
                label="最近活跃"
                value={formatBusinessEntityTimestamp(customerLastActivityAt)}
                note="综合画像更新与消息活动"
              />
            </div>

            <section className="control-center__dialog-card">
              <div className="control-center__customer-section-title">客户速览</div>
              <div className="control-center__customer-platforms">
                {platformChannels.map(channel => (
                  <span key={`${customer.id}-${channel}`} className="control-center__customer-platform-pill">
                    {BUSINESS_CHANNEL_LABELS[channel]}
                  </span>
                ))}
              </div>
              <div className="control-center__copy">{customer.summary || "暂未补充客户摘要。"}</div>
              <div className="control-center__customer-brief-grid">
                {keyFacts.map(field => (
                  <article key={`${customer.id}-${field.label}`} className="control-center__customer-brief-item">
                    <div className="control-center__customer-brief-label">{field.label}</div>
                    <div className="control-center__customer-brief-value">{field.value}</div>
                  </article>
                ))}
              </div>
            </section>

            <section className="control-center__dialog-card">
              <div className="control-center__customer-section-title">运营判断</div>
              {compactInsights.length > 0 ? (
                <div className="control-center__dialog-meta">
                  {compactInsights.map(note => (
                    <div key={`${customer.id}-${note}`} className="control-center__entity-note">
                      {note}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="control-center__entity-note">当前没有额外需要关注的运营提醒。</div>
              )}
              {compactTags.length > 0 ? (
                <div className="control-center__customer-tag-list">
                  {compactTags.map(tag => (
                    <span key={`${customer.id}-tag-${tag}`} className="control-center__customer-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          </aside>

          <section className="control-center__dialog-main">
            <section className="control-center__dialog-card">
              <div className="control-center__customer-session-headline">
                <div className="control-center__customer-session-title">最近会话</div>
                <div className="control-center__customer-session-summary">
                  <span>{customerSessions.length} 条会话</span>
                </div>
              </div>
              {recentSessionEntries.length > 0 ? (
                <div className="control-center__customer-session-list">
                  {recentSessionEntries.map(session => {
                    const sessionDecision = scoreChannelSession(session, customer);
                    const pendingCount = (session.unreadCount ?? 0) > 0 || session.requiresReply
                      ? `${session.unreadCount ?? 0} 未读 / 待回复`
                      : "已收口";

                    return (
                      <section key={session.id} className="control-center__customer-session-card">
                        <div className="control-center__customer-session-head">
                          <div>
                            <div className="control-center__customer-session-name">{session.title}</div>
                            <div className="control-center__entity-note" style={{ marginTop: 4 }}>
                              {session.summary || session.lastMessagePreview || "暂无会话摘要"}
                            </div>
                          </div>
                          <div className="control-center__customer-session-badges">
                            <span className="control-center__entity-pill">{BUSINESS_CHANNEL_LABELS[session.channel]}</span>
                            <span className="control-center__entity-pill">{session.status}</span>
                          </div>
                        </div>
                        <div className="control-center__entity-meta">
                          <span>{getBusinessChannelServiceModeLabel(session)}</span>
                          <span>{session.participantLabel || session.accountLabel || session.externalRef}</span>
                          <span>{pendingCount}</span>
                        </div>
                        {session.lastMessagePreview ? (
                          <div className="control-center__entity-note">
                            最近预览: {session.lastMessagePreview}
                          </div>
                        ) : null}
                        {(session.lastHandledAt || session.handledBy) ? (
                          <div className="control-center__entity-note">
                            最近处理: {session.handledBy ?? "manual"} · {formatBusinessEntityTimestamp(session.lastHandledAt ?? session.updatedAt)}
                          </div>
                        ) : null}
                        <div className="control-center__entity-note">值守判断: {sessionDecision.summary}</div>
                        <div className="control-center__quick-actions">
                          <button type="button" className="btn-ghost" onClick={() => onHandoffChannelSession(session.id)}>
                            聊天接管
                          </button>
                          <button type="button" className="btn-ghost" onClick={() => onAdvanceChannelSession(session.id)}>
                            推进状态
                          </button>
                          {(session.requiresReply || (session.unreadCount ?? 0) > 0) ? (
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => onMarkChannelSessionHandled(session.id, session.title)}
                            >
                              标记已处理
                            </button>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="control-center__entity-note">
                  这个客户目前还没有归档到客户档案下的渠道会话。
                </div>
              )}
              {remainingSessionCount > 0 ? (
                <div className="control-center__entity-note">其余 {remainingSessionCount} 条会话已收纳，当前页只展示最近重点会话。</div>
              ) : null}
            </section>

            <section className="control-center__dialog-card">
              <div className="control-center__customer-session-headline">
                <div className="control-center__customer-session-title">最近消息</div>
                <div className="control-center__customer-session-summary">
                  <span>{customerMessageCount} 条消息</span>
                </div>
              </div>
              {recentMessageEntries.length > 0 ? (
                <div className="control-center__customer-message-list control-center__customer-message-list--compact">
                  {recentMessageEntries.map(({ session, operation }) => {
                    const tone = getBusinessMessageTone(operation);
                    return (
                      <article
                        key={`${session.id}-${operation.id}`}
                        className={`control-center__customer-message control-center__customer-message--${tone}`}
                      >
                        <div className="control-center__customer-message-meta">
                          <span>{getBusinessMessageActorLabel(operation)} · {BUSINESS_CHANNEL_LABELS[session.channel]}</span>
                          <span>{formatBusinessEntityTimestamp(operation.createdAt)}</span>
                        </div>
                        <div className="control-center__customer-message-title">{operation.title}</div>
                        <div className="control-center__customer-message-detail">{operation.detail}</div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="control-center__entity-note">当前还没有可展示的客户消息记录。</div>
              )}
              {remainingMessageCount > 0 ? (
                <div className="control-center__entity-note">其余 {remainingMessageCount} 条消息已收纳，避免当前详情页信息过载。</div>
              ) : null}
            </section>

            <EntityAuditSummary
              operation={latestOperation}
              onOpenRemoteOps={onOpenRemoteOps}
              onOpenExecution={latestOperation?.executionRunId ? () => onOpenExecution(latestOperation.executionRunId) : undefined}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="control-center__customer-overview-card">
      <div className="control-center__customer-overview-label">{label}</div>
      <div className="control-center__customer-overview-value">{value}</div>
      <div className="control-center__customer-overview-note">{note}</div>
    </article>
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
  wide = false,
  listClassName = "",
}: {
  title: string;
  empty: string;
  items: ReactNode[];
  wide?: boolean;
  listClassName?: string;
}) {
  return (
    <section className={`control-center__panel ${wide ? "control-center__panel--wide" : ""}`}>
      <div className="control-center__panel-title">{title}</div>
      <div className={`control-center__entity-list ${listClassName}`.trim()}>
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

