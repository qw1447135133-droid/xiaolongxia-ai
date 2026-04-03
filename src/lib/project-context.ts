import type { ChatSession } from "@/lib/chat-sessions";

type ScopedWorkspaceItem = {
  projectId?: string | null;
  rootPath?: string | null;
  workspaceRoot?: string | null;
};

type SessionScope = {
  sessionId?: string;
  projectId?: string | null;
  workspaceRoot?: string | null;
};

function normalizePath(path: string | null | undefined) {
  return (path ?? "").replace(/\\/g, "/").toLowerCase();
}

export function getProjectNameFromRoot(rootPath: string | null | undefined) {
  const normalized = normalizePath(rootPath);
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

export function getProjectIdFromRoot(rootPath: string | null | undefined) {
  const normalized = normalizePath(rootPath);
  if (!normalized) return null;
  return `project:${normalized}`;
}

export function buildProjectContext(rootPath: string | null | undefined) {
  return {
    projectId: getProjectIdFromRoot(rootPath),
    projectName: getProjectNameFromRoot(rootPath),
    workspaceRoot: rootPath ?? null,
  };
}

export function getProjectScopeKey(scope: { projectId?: string | null; workspaceRoot?: string | null }) {
  if (scope.projectId) return scope.projectId;
  const fallbackRoot = normalizePath(scope.workspaceRoot);
  return fallbackRoot ? `project:${fallbackRoot}` : "project:general";
}

export function getSessionProjectScope(session: ChatSession | null | undefined) {
  return {
    projectId: session?.projectId ?? null,
    workspaceRoot: session?.workspaceRoot ?? null,
  };
}

export function resolveSessionProjectScope(
  scope: SessionScope,
  sessions: ChatSession[],
) {
  const linkedSession = scope.sessionId
    ? sessions.find(session => session.id === scope.sessionId) ?? null
    : null;

  return {
    projectId: scope.projectId ?? linkedSession?.projectId ?? null,
    workspaceRoot: scope.workspaceRoot ?? linkedSession?.workspaceRoot ?? null,
  };
}

export function getRunProjectScopeKey(
  run: Pick<SessionScope, "projectId" | "sessionId" | "workspaceRoot">,
  sessions: ChatSession[],
) {
  return getProjectScopeKey(resolveSessionProjectScope(run, sessions));
}

export function getSessionProjectLabel(session: ChatSession) {
  return session.projectName ?? "General";
}

export function matchProjectScope(
  item: ScopedWorkspaceItem,
  scope: { projectId?: string | null; workspaceRoot?: string | null },
) {
  if (scope.projectId && item.projectId) {
    return item.projectId === scope.projectId;
  }

  const itemRoot = normalizePath(item.rootPath ?? item.workspaceRoot);
  const scopeRoot = normalizePath(scope.workspaceRoot);

  if (itemRoot && scopeRoot) {
    return itemRoot === scopeRoot;
  }

  return !scope.projectId && !item.projectId;
}

export function filterByProjectScope<T extends ScopedWorkspaceItem>(
  items: T[],
  scope: { projectId?: string | null; workspaceRoot?: string | null },
) {
  return items.filter(item => matchProjectScope(item, scope));
}
