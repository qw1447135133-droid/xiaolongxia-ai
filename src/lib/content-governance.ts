import type {
  BusinessContentChannel,
  BusinessContentNextCycleRecommendation,
  BusinessContentPublishTarget,
  BusinessContentTask,
} from "@/types/business-entities";

export type ContentTaskChannelPerformance = {
  key: string;
  channel: BusinessContentPublishTarget["channel"];
  accountLabel: string;
  completed: number;
  failed: number;
  score: number;
  lastPublishedAt: number | null;
};

export type ContentTaskChannelGovernanceSnapshot = {
  preferredTarget: BusinessContentPublishTarget | null;
  riskyTargets: BusinessContentPublishTarget[];
  performance: ContentTaskChannelPerformance[];
};

export type ProjectContentChannelSummary = {
  channel: BusinessContentChannel;
  completed: number;
  failed: number;
  score: number;
  taskCount: number;
  primaryTaskCount: number;
  riskyTaskCount: number;
  queuedTaskIds: string[];
  riskyTaskIds: string[];
  lastPublishedAt: number | null;
};

function getPublishTargetKey(target: Pick<BusinessContentPublishTarget, "channel" | "accountLabel">) {
  return `${target.channel}:${target.accountLabel}`;
}

export function getNextCycleStatusFromRecommendation(
  recommendation?: BusinessContentNextCycleRecommendation,
): BusinessContentTask["status"] {
  switch (recommendation) {
    case "retry":
      return "scheduled";
    case "rewrite":
      return "review";
    case "reuse":
    default:
      return "draft";
  }
}

export function getNextCycleActionLabel(recommendation?: BusinessContentNextCycleRecommendation) {
  switch (recommendation) {
    case "retry":
      return "进入重发准备";
    case "rewrite":
      return "进入改写审校";
    case "reuse":
    default:
      return "进入复用草稿";
  }
}

export function getNextCycleActionDetail(recommendation?: BusinessContentNextCycleRecommendation) {
  switch (recommendation) {
    case "retry":
      return "系统会把内容任务切到 scheduled，并排队发布准备 workflow。";
    case "rewrite":
      return "系统会把内容任务切到 review，并排队定稿与审校 workflow。";
    case "reuse":
    default:
      return "系统会把内容任务切到 draft，并排队一轮新的选题与草稿 workflow。";
  }
}

export function getContentTaskChannelGovernanceSnapshot(
  task: Pick<BusinessContentTask, "channel" | "publishTargets" | "publishedResults">,
): ContentTaskChannelGovernanceSnapshot {
  const orderMap = new Map(task.publishTargets.map((target, index) => [getPublishTargetKey(target), index]));
  const performanceMap = new Map<string, ContentTaskChannelPerformance>();

  for (const target of task.publishTargets) {
    const key = getPublishTargetKey(target);
    performanceMap.set(key, {
      key,
      channel: target.channel,
      accountLabel: target.accountLabel,
      completed: 0,
      failed: 0,
      score: 0,
      lastPublishedAt: null,
    });
  }

  for (const result of task.publishedResults) {
    const key = getPublishTargetKey(result);
    const current = performanceMap.get(key) ?? {
      key,
      channel: result.channel,
      accountLabel: result.accountLabel,
      completed: 0,
      failed: 0,
      score: 0,
      lastPublishedAt: null,
    };

    const nextCompleted = current.completed + (result.status === "completed" ? 1 : 0);
    const nextFailed = current.failed + (result.status === "failed" ? 1 : 0);

    performanceMap.set(key, {
      ...current,
      completed: nextCompleted,
      failed: nextFailed,
      score: nextCompleted - nextFailed,
      lastPublishedAt: current.lastPublishedAt ? Math.max(current.lastPublishedAt, result.publishedAt) : result.publishedAt,
    });
  }

  const performance = [...performanceMap.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if ((right.completed !== left.completed)) return right.completed - left.completed;
    if ((right.lastPublishedAt ?? 0) !== (left.lastPublishedAt ?? 0)) {
      return (right.lastPublishedAt ?? 0) - (left.lastPublishedAt ?? 0);
    }
    return (orderMap.get(left.key) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(right.key) ?? Number.MAX_SAFE_INTEGER);
  });

  const riskyTargets = performance
    .filter(item => item.failed >= 2 && item.failed > item.completed)
    .map(item => ({ channel: item.channel, accountLabel: item.accountLabel }));

  const preferred =
    performance.find(item => item.completed > 0 && item.failed <= item.completed)
    ?? performance.find(item => item.score >= 0)
    ?? performance[0]
    ?? null;

  return {
    preferredTarget: preferred ? { channel: preferred.channel, accountLabel: preferred.accountLabel } : null,
    riskyTargets,
    performance,
  };
}

export function buildContentChannelGovernancePlan(
  task: Pick<BusinessContentTask, "channel" | "publishTargets" | "publishedResults">,
) {
  const snapshot = getContentTaskChannelGovernanceSnapshot(task);
  const preferredTarget = snapshot.preferredTarget;

  if (!preferredTarget) {
    return null;
  }

  const riskyKeys = new Set(snapshot.riskyTargets.map(target => getPublishTargetKey(target)));
  const preferredKey = getPublishTargetKey(preferredTarget);
  const orderedTargets = [...task.publishTargets].sort((left, right) => {
    const leftKey = getPublishTargetKey(left);
    const rightKey = getPublishTargetKey(right);
    const leftWeight = leftKey === preferredKey ? 0 : riskyKeys.has(leftKey) ? 2 : 1;
    const rightWeight = rightKey === preferredKey ? 0 : riskyKeys.has(rightKey) ? 2 : 1;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return task.publishTargets.findIndex(target => getPublishTargetKey(target) === leftKey)
      - task.publishTargets.findIndex(target => getPublishTargetKey(target) === rightKey);
  });

  const detailParts = [`主发建议已切到 ${preferredTarget.channel}:${preferredTarget.accountLabel}`];
  if (snapshot.riskyTargets.length > 0) {
    detailParts.push(`风险渠道 ${snapshot.riskyTargets.map(target => `${target.channel}:${target.accountLabel}`).join(" / ")} 已降到后序目标`);
  } else {
    detailParts.push("当前没有达到阈值的风险渠道");
  }

  const orderChanged = orderedTargets.some((target, index) => {
    const current = task.publishTargets[index];
    return !current || current.channel !== target.channel || current.accountLabel !== target.accountLabel;
  });
  const channelChanged = task.channel !== preferredTarget.channel;

  return {
    preferredTarget,
    riskyTargets: snapshot.riskyTargets,
    publishTargets: orderedTargets,
    channel: preferredTarget.channel,
    changed: orderChanged || channelChanged,
    detail: detailParts.join("，"),
  };
}

export function getProjectContentChannelSummaries(
  tasks: Array<Pick<BusinessContentTask, "id" | "channel" | "publishTargets" | "publishedResults" | "recommendedPrimaryChannel" | "riskyChannels">>,
) {
  const summaryMap = new Map<BusinessContentChannel, ProjectContentChannelSummary>();

  for (const task of tasks) {
    const touchedChannels = new Set<BusinessContentChannel>([
      task.channel,
      task.recommendedPrimaryChannel ?? task.channel,
      ...task.publishTargets.map(target => target.channel),
      ...task.publishedResults.map(result => result.channel),
      ...task.riskyChannels,
    ]);

    for (const channel of touchedChannels) {
      const current = summaryMap.get(channel) ?? {
        channel,
        completed: 0,
        failed: 0,
        score: 0,
        taskCount: 0,
        primaryTaskCount: 0,
        riskyTaskCount: 0,
        queuedTaskIds: [],
        riskyTaskIds: [],
        lastPublishedAt: null,
      };

      current.taskCount += 1;
      if ((task.recommendedPrimaryChannel ?? task.channel) === channel) {
        current.primaryTaskCount += 1;
      }
      if (task.riskyChannels.includes(channel)) {
        current.riskyTaskCount += 1;
        current.riskyTaskIds.push(task.id);
      }
      if (task.publishTargets.some(target => target.channel === channel)) {
        current.queuedTaskIds.push(task.id);
      }

      summaryMap.set(channel, current);
    }

    for (const result of task.publishedResults) {
      const current = summaryMap.get(result.channel) ?? {
        channel: result.channel,
        completed: 0,
        failed: 0,
        score: 0,
        taskCount: 0,
        primaryTaskCount: 0,
        riskyTaskCount: 0,
        queuedTaskIds: [],
        riskyTaskIds: [],
        lastPublishedAt: null,
      };

      if (result.status === "completed") {
        current.completed += 1;
      } else {
        current.failed += 1;
      }
      current.score = current.completed - current.failed;
      current.lastPublishedAt = current.lastPublishedAt
        ? Math.max(current.lastPublishedAt, result.publishedAt)
        : result.publishedAt;
      summaryMap.set(result.channel, current);
    }
  }

  return [...summaryMap.values()]
    .map(item => ({
      ...item,
      queuedTaskIds: [...new Set(item.queuedTaskIds)],
      riskyTaskIds: [...new Set(item.riskyTaskIds)],
      score: item.completed - item.failed,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.primaryTaskCount !== left.primaryTaskCount) return right.primaryTaskCount - left.primaryTaskCount;
      if (right.taskCount !== left.taskCount) return right.taskCount - left.taskCount;
      return (right.lastPublishedAt ?? 0) - (left.lastPublishedAt ?? 0);
    });
}

export function getProjectRiskyContentChannels(
  tasks: Array<Pick<BusinessContentTask, "id" | "channel" | "publishTargets" | "publishedResults" | "recommendedPrimaryChannel" | "riskyChannels">>,
) {
  return getProjectContentChannelSummaries(tasks)
    .filter(item => item.failed >= 2 && item.failed > item.completed)
    .map(item => item.channel);
}
