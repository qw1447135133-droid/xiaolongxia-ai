function isOperationalStatus(status) {
  return status === "connected" || status === "configured" || status === "syncing";
}

function buildChannelSection(platformConfigs) {
  const items = Object.entries(platformConfigs ?? {}).map(([platformId, config]) => {
    const healthScore = Number(config?.healthScore || 0);
    const pendingEvents = Number(config?.pendingEvents || 0);
    const failedCount = Array.isArray(config?.recentFailedMessages) ? config.recentFailedMessages.length : 0;
    return {
      platformId,
      enabled: Boolean(config?.enabled),
      status: config?.status || "idle",
      healthScore,
      pendingEvents,
      failedCount,
      accountLabel: config?.accountLabel || "",
      detail: config?.detail || config?.errorMsg || "",
      lastInboundAt: config?.lastInboundAt || null,
      lastOutboundSuccessAt: config?.lastOutboundSuccessAt || null,
      lastDebugAt: config?.lastDebugAt || null,
    };
  });

  const enabled = items.filter(item => item.enabled);
  const connected = enabled.filter(item => isOperationalStatus(item.status));
  const attention = enabled.filter(item => !isOperationalStatus(item.status) || item.pendingEvents > 0 || item.failedCount > 0);
  const backlog = enabled.reduce((sum, item) => sum + item.pendingEvents, 0);

  return {
    enabledCount: enabled.length,
    connectedCount: connected.length,
    attentionCount: attention.length,
    backlog,
    items: items.sort((left, right) =>
      Number(right.enabled) - Number(left.enabled)
      || right.pendingEvents - left.pendingEvents
      || right.failedCount - left.failedCount
      || left.platformId.localeCompare(right.platformId, "zh-CN"),
    ),
  };
}

function buildPlannerSection({ availability, runs, hermesDispatchSettings }) {
  const runList = Array.isArray(runs) ? runs : [];
  const activeRuns = runList.filter(run => run.status === "queued" || run.status === "running");
  const failedRuns = runList.filter(run => run.status === "failed");
  const plannedRuns = runList.filter(run => run.status === "planned");
  const completedRuns = runList.filter(run => run.status === "completed");
  const availableCommands = Object.entries(availability ?? {}).filter(([, item]) => item?.available);
  const missingCommands = Object.entries(availability ?? {})
    .filter(([, item]) => !item?.available)
    .map(([key, item]) => ({
      key,
      command: item?.command || key,
    }));

  return {
    profileCount: Array.isArray(hermesDispatchSettings?.plannerProfiles) ? hermesDispatchSettings.plannerProfiles.length : 0,
    activeProfileId: hermesDispatchSettings?.activePlannerProfileId || null,
    activeRuns: activeRuns.length,
    plannedRuns: plannedRuns.length,
    failedRuns: failedRuns.length,
    completedRuns: completedRuns.length,
    availableCommands: availableCommands.map(([key, item]) => ({
      key,
      command: item.command,
    })),
    missingCommands,
    latestRun: runList[0] || null,
  };
}

function buildMemorySection({ semanticMemoryConfig, semanticMemoryHealth }) {
  const pgvectorEnabled = Boolean(semanticMemoryConfig?.pgvector?.enabled);
  const hasConnectionString = Boolean(String(semanticMemoryConfig?.pgvector?.connectionString || "").trim());

  return {
    providerId: semanticMemoryConfig?.providerId || "local",
    autoRecallProjectMemories: Boolean(semanticMemoryConfig?.autoRecallProjectMemories),
    autoRecallDeskNotes: Boolean(semanticMemoryConfig?.autoRecallDeskNotes),
    autoRecallKnowledgeDocs: Boolean(semanticMemoryConfig?.autoRecallKnowledgeDocs),
    pgvectorEnabled,
    hasConnectionString,
    pgvector: semanticMemoryHealth ?? {
      ok: false,
      skipped: !pgvectorEnabled,
      error: !pgvectorEnabled
        ? "pgvector disabled"
        : hasConnectionString
          ? "health check unavailable"
          : "connection string missing",
    },
  };
}

function buildGovernanceSection(agentConfigs) {
  const items = Object.entries(agentConfigs ?? {}).map(([agentId, config]) => ({
    agentId,
    toolAccess: config?.governance?.toolAccess || "standard",
    meetingRoleMode: config?.governance?.meetingRoleMode || "participant",
    memoryWriteScope: config?.governance?.memoryWriteScope || "execution_events",
    escalationMode: config?.governance?.escalationMode || "manual_first",
  }));

  const judges = items.filter(item => item.meetingRoleMode === "judge").map(item => item.agentId);
  const noDesktopAgents = items.filter(item => item.toolAccess === "no_desktop").map(item => item.agentId);
  const projectMemoryAgents = items.filter(item => item.memoryWriteScope === "project_memory").map(item => item.agentId);

  return {
    judgeCount: judges.length,
    judges,
    noDesktopAgentCount: noDesktopAgents.length,
    noDesktopAgents,
    projectMemoryAgentCount: projectMemoryAgents.length,
    projectMemoryAgents,
    items,
  };
}

function buildRecommendations({ channelSection, plannerSection, memorySection, governanceSection }) {
  const recommendations = [];

  if (plannerSection.missingCommands.length > 0) {
    recommendations.push(`先补齐 Hermes 调度命令：${plannerSection.missingCommands.map(item => item.command).join(" / ")}`);
  }

  if (channelSection.attentionCount > 0) {
    recommendations.push(`先处理 ${channelSection.attentionCount} 个异常渠道或积压通道，避免自主值守继续放大失败消息。`);
  }

  if (channelSection.backlog > 0) {
    recommendations.push(`当前渠道待处理事件 ${channelSection.backlog} 条，建议先清 backlog 再做主动推送。`);
  }

  if (memorySection.pgvectorEnabled && !memorySection.pgvector?.ok) {
    recommendations.push("语义记忆已开启但 pgvector 仍未健康，先修复存储连通性再扩大长期记忆依赖。");
  }

  if (!memorySection.autoRecallProjectMemories && !memorySection.autoRecallDeskNotes && !memorySection.autoRecallKnowledgeDocs) {
    recommendations.push("当前自动召回全部关闭，Hermes 记忆层只能依赖短期会话和显式 @ 上下文。");
  }

  if (governanceSection.judgeCount !== 1) {
    recommendations.push(`会议裁判位当前为 ${governanceSection.judgeCount} 个，建议固定为 1 个，避免会议总结与拍板责任漂移。`);
  }

  if (governanceSection.projectMemoryAgentCount === 0) {
    recommendations.push("当前没有 agent 具备项目记忆回写权限，长期事实沉淀会变弱。");
  }

  if (recommendations.length === 0) {
    recommendations.push("当前基础架构已具备 Hermes 化的调度、渠道和记忆底座，可以继续往角色治理和 agent 生命周期审计推进。");
  }

  return recommendations;
}

export function buildHermesDiagnostics({
  availability,
  runs,
  hermesDispatchSettings,
  semanticMemoryConfig,
  platformConfigs,
  agentConfigs,
  semanticMemoryHealth = null,
}) {
  const plannerSection = buildPlannerSection({ availability, runs, hermesDispatchSettings });
  const channelSection = buildChannelSection(platformConfigs);
  const memorySection = buildMemorySection({ semanticMemoryConfig, semanticMemoryHealth });
  const governanceSection = buildGovernanceSection(agentConfigs);
  const recommendations = buildRecommendations({
    channelSection,
    plannerSection,
    memorySection,
    governanceSection,
  });

  return {
    ok: true,
    snapshotAt: Date.now(),
    planner: plannerSection,
    channels: channelSection,
    memory: memorySection,
    governance: governanceSection,
    recommendations,
  };
}
