import type { BusinessApprovalRecord, BusinessChannelSession, BusinessContentTask, BusinessOperationRecord, BusinessTicket } from "@/types/business-entities";
import type { ExecutionRun } from "@/store/types";
import type { BusinessEntityGraph } from "@/lib/business-graph";
import type { WorldAttentionItem, WorldModelSnapshot } from "@/types/world-model";

type WorldModelInput = {
  projectId: string | null;
  rootPath: string | null;
  graph: BusinessEntityGraph;
  approvals: BusinessApprovalRecord[];
  channelSessions: BusinessChannelSession[];
  contentTasks: BusinessContentTask[];
  tickets: BusinessTicket[];
  operationLogs: BusinessOperationRecord[];
  executionRuns: ExecutionRun[];
};

function capItems<T>(items: T[], limit: number) {
  return items.slice(0, limit);
}

function createAttentionItem(
  id: string,
  title: string,
  detail: string,
  level: WorldAttentionItem["level"],
  entityType?: WorldAttentionItem["entityType"],
  entityId?: string,
): WorldAttentionItem {
  return { id, title, detail, level, entityType, entityId };
}

export function deriveWorldModelSnapshot(input: WorldModelInput): WorldModelSnapshot {
  const now = Date.now();
  const attentionItems: WorldAttentionItem[] = [];

  input.approvals
    .filter(item => item.status === "pending")
    .forEach(item => {
      attentionItems.push(
        createAttentionItem(
          `approval-${item.entityType}-${item.entityId}`,
          "Pending approval",
          `Entity ${item.entityType}:${item.entityId} is blocked on human approval.`,
          "risk",
          item.entityType,
          item.entityId,
        ),
      );
    });

  input.channelSessions
    .filter(session => session.requiresReply || session.lastDeliveryStatus === "failed")
    .forEach(session => {
      attentionItems.push(
        createAttentionItem(
          `session-${session.id}`,
          session.lastDeliveryStatus === "failed" ? "Channel delivery failed" : "Session needs reply",
          session.lastDeliveryError ?? session.summary,
          session.lastDeliveryStatus === "failed" ? "risk" : "watch",
          "channelSession",
          session.id,
        ),
      );
    });

  input.contentTasks
    .filter(task => task.status === "review" || task.status === "scheduled" || task.publishedResults.some(result => result.status === "failed"))
    .forEach(task => {
      const failedPublish = task.publishedResults.find(result => result.status === "failed");
      attentionItems.push(
        createAttentionItem(
          `content-${task.id}`,
          failedPublish ? "Publish failed" : task.status === "review" ? "Content needs approval" : "Content waiting to publish",
          failedPublish?.failureReason ?? task.latestDraftSummary ?? task.brief,
          failedPublish ? "risk" : "watch",
          "contentTask",
          task.id,
        ),
      );
    });

  input.tickets
    .filter(ticket => ticket.priority === "urgent" || ticket.status === "waiting")
    .forEach(ticket => {
      attentionItems.push(
        createAttentionItem(
          `ticket-${ticket.id}`,
          ticket.priority === "urgent" ? "Urgent ticket" : "Ticket waiting",
          ticket.summary,
          ticket.priority === "urgent" ? "risk" : "watch",
          "ticket",
          ticket.id,
        ),
      );
    });

  input.executionRuns
    .filter(run => run.status === "failed" || run.recoveryState === "manual-required" || run.recoveryState === "blocked")
    .forEach(run => {
      attentionItems.push(
        createAttentionItem(
          `run-${run.id}`,
          run.recoveryState === "manual-required" ? "Execution needs takeover" : "Execution failure",
          run.lastFailureReason ?? run.lastRecoveryHint ?? run.instruction,
          run.recoveryState === "blocked" || run.status === "failed" ? "risk" : "watch",
        ),
      );
    });

  const failedOperations = input.operationLogs.filter(item => item.status === "failed" || item.status === "blocked");
  const riskCount = attentionItems.filter(item => item.level === "risk").length;
  const watchCount = attentionItems.filter(item => item.level === "watch").length;
  const automationReadiness = Math.max(
    0,
    Math.min(
      100,
      100
        - riskCount * 12
        - watchCount * 5
        - failedOperations.length * 4,
    ),
  );

  const openLoops = capItems([
    ...input.channelSessions
      .filter(item => item.requiresReply)
      .map(item => `Session "${item.title}" still needs a reply.`),
    ...input.contentTasks
      .filter(item => item.status !== "published" && item.status !== "archived")
      .map(item => `Content task "${item.title}" is still in ${item.status}.`),
    ...input.approvals
      .filter(item => item.status === "pending")
      .map(item => `Approval pending for ${item.entityType}:${item.entityId}.`),
  ], 6);

  const summary = [
    `Automation readiness ${automationReadiness}.`,
    riskCount > 0 ? `${riskCount} high-risk loops active.` : "No high-risk loops active.",
    watchCount > 0 ? `${watchCount} items need observation.` : "No watch items pending.",
  ].join(" ");

  return {
    id: `world-${input.projectId ?? "general"}-${now}`,
    projectId: input.projectId,
    rootPath: input.rootPath,
    createdAt: now,
    updatedAt: now,
    summary,
    automationReadiness,
    graphNodes: input.graph.nodes.length,
    graphEdges: input.graph.edges.length,
    openLoops,
    attentionItems: capItems(attentionItems, 8),
  };
}

export function buildWorldModelSnippet(snapshot: WorldModelSnapshot) {
  const attentionLines = snapshot.attentionItems.map(item => `- [${item.level}] ${item.title}: ${item.detail}`);
  const loopLines = snapshot.openLoops.map(item => `- ${item}`);

  return [
    `World state snapshot: ${snapshot.summary}`,
    `Graph coverage: ${snapshot.graphNodes} entities, ${snapshot.graphEdges} relationships.`,
    loopLines.length > 0 ? "Open loops:" : "",
    ...loopLines,
    attentionLines.length > 0 ? "Attention items:" : "",
    ...attentionLines,
  ]
    .filter(Boolean)
    .join("\n");
}
