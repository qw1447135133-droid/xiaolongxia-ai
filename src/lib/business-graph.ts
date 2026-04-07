import type {
  BusinessChannelSession,
  BusinessContentTask,
  BusinessCustomer,
  BusinessEntityType,
  BusinessLead,
  BusinessTicket,
} from "@/types/business-entities";

export interface BusinessGraphNode {
  id: string;
  entityType: BusinessEntityType;
  label: string;
  priority?: string;
}

export interface BusinessGraphEdge {
  id: string;
  fromEntityType: BusinessEntityType;
  fromId: string;
  toEntityType: BusinessEntityType;
  toId: string;
  relation: string;
}

export interface BusinessEntityGraph {
  nodes: BusinessGraphNode[];
  edges: BusinessGraphEdge[];
}

type BusinessGraphInput = {
  customers: BusinessCustomer[];
  leads: BusinessLead[];
  tickets: BusinessTicket[];
  contentTasks: BusinessContentTask[];
  channelSessions: BusinessChannelSession[];
};

function pushNode(nodes: BusinessGraphNode[], seen: Set<string>, node: BusinessGraphNode) {
  const key = `${node.entityType}:${node.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  nodes.push(node);
}

function pushEdge(edges: BusinessGraphEdge[], seen: Set<string>, edge: Omit<BusinessGraphEdge, "id">) {
  const id = `${edge.fromEntityType}:${edge.fromId}:${edge.relation}:${edge.toEntityType}:${edge.toId}`;
  if (seen.has(id)) return;
  seen.add(id);
  edges.push({ id, ...edge });
}

export function buildBusinessEntityGraph(input: BusinessGraphInput): BusinessEntityGraph {
  const nodes: BusinessGraphNode[] = [];
  const edges: BusinessGraphEdge[] = [];
  const nodeSeen = new Set<string>();
  const edgeSeen = new Set<string>();

  input.customers.forEach(customer => {
    pushNode(nodes, nodeSeen, {
      id: customer.id,
      entityType: "customer",
      label: customer.name,
      priority: customer.tier,
    });
  });

  input.leads.forEach(lead => {
    pushNode(nodes, nodeSeen, {
      id: lead.id,
      entityType: "lead",
      label: lead.title,
      priority: lead.stage,
    });
    if (lead.customerId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "customer",
        fromId: lead.customerId,
        toEntityType: "lead",
        toId: lead.id,
        relation: "owns-lead",
      });
    }
  });

  input.tickets.forEach(ticket => {
    pushNode(nodes, nodeSeen, {
      id: ticket.id,
      entityType: "ticket",
      label: ticket.subject,
      priority: ticket.priority,
    });
    if (ticket.customerId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "customer",
        fromId: ticket.customerId,
        toEntityType: "ticket",
        toId: ticket.id,
        relation: "owns-ticket",
      });
    }
    if (ticket.channelSessionId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "channelSession",
        fromId: ticket.channelSessionId,
        toEntityType: "ticket",
        toId: ticket.id,
        relation: "spawned-ticket",
      });
    }
  });

  input.contentTasks.forEach(task => {
    pushNode(nodes, nodeSeen, {
      id: task.id,
      entityType: "contentTask",
      label: task.title,
      priority: task.priority,
    });
    if (task.customerId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "customer",
        fromId: task.customerId,
        toEntityType: "contentTask",
        toId: task.id,
        relation: "targets-content",
      });
    }
    if (task.leadId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "lead",
        fromId: task.leadId,
        toEntityType: "contentTask",
        toId: task.id,
        relation: "drives-content",
      });
    }
  });

  input.channelSessions.forEach(session => {
    pushNode(nodes, nodeSeen, {
      id: session.id,
      entityType: "channelSession",
      label: session.title,
      priority: session.status,
    });
    if (session.customerId) {
      pushEdge(edges, edgeSeen, {
        fromEntityType: "customer",
        fromId: session.customerId,
        toEntityType: "channelSession",
        toId: session.id,
        relation: "owns-session",
      });
    }
  });

  input.contentTasks.forEach(task => {
    input.channelSessions.forEach(session => {
      if (!task.customerId || !session.customerId || task.customerId !== session.customerId) return;
      const targetsChannel = task.publishTargets.some(target => target.channel === session.channel);
      if (!targetsChannel) return;
      pushEdge(edges, edgeSeen, {
        fromEntityType: "contentTask",
        fromId: task.id,
        toEntityType: "channelSession",
        toId: session.id,
        relation: "publishes-into",
      });
    });
  });

  return { nodes, edges };
}

export function getEntityGraphNeighborhood(
  graph: BusinessEntityGraph,
  entityType: BusinessEntityType,
  entityId: string,
) {
  const relatedEdges = graph.edges.filter(edge =>
    (edge.fromEntityType === entityType && edge.fromId === entityId)
    || (edge.toEntityType === entityType && edge.toId === entityId),
  );

  const relatedNodeKeys = new Set<string>();
  relatedEdges.forEach(edge => {
    relatedNodeKeys.add(`${edge.fromEntityType}:${edge.fromId}`);
    relatedNodeKeys.add(`${edge.toEntityType}:${edge.toId}`);
  });

  const relatedNodes = graph.nodes.filter(node => relatedNodeKeys.has(`${node.entityType}:${node.id}`));
  return { relatedNodes, relatedEdges };
}

export function buildBusinessGraphSnippet(
  graph: BusinessEntityGraph,
  focus?: { entityType?: BusinessEntityType; entityId?: string },
) {
  const targetNeighborhood =
    focus?.entityType && focus?.entityId
      ? getEntityGraphNeighborhood(graph, focus.entityType, focus.entityId)
      : null;
  const nodes = targetNeighborhood?.relatedNodes ?? graph.nodes.slice(0, 8);
  const edges = targetNeighborhood?.relatedEdges ?? graph.edges.slice(0, 10);

  const nodeLines = nodes.map(node => `- ${node.entityType}: ${node.label}${node.priority ? ` (${node.priority})` : ""}`);
  const edgeLines = edges.map(edge => `- ${edge.fromEntityType}:${edge.fromId} --${edge.relation}--> ${edge.toEntityType}:${edge.toId}`);

  return [
    `Business graph snapshot: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
    nodeLines.length > 0 ? "Key entities:" : "",
    ...nodeLines,
    edgeLines.length > 0 ? "Key relationships:" : "",
    ...edgeLines,
  ]
    .filter(Boolean)
    .join("\n");
}
