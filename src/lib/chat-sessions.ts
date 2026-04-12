import type { Task } from "@/store/types";

export interface ChatSession {
  id: string;
  title: string;
  pinned?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  workspaceRoot?: string | null;
  linkedChannelSessionId?: string | null;
  updatedAt: number;
  tasks: Task[];
}

export const DEFAULT_CHAT_TITLE = "新对话";
export const MAX_CHAT_SESSIONS = 50;
export const MAX_TASKS_PER_SESSION = 300;
export const CHAT_GAP_MS = 5 * 60 * 1000;
export const CHAT_TIMELINE_MAX = 50;

/** 对话区 / 活动记录区统一可视高度，便于左右对齐 */
export const CHAT_VIEWPORT_MAX = "min(560px, calc(100vh - 200px))";

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function makeEmptySession(project?: {
  projectId?: string | null;
  projectName?: string | null;
  workspaceRoot?: string | null;
}): ChatSession {
  const id = newSessionId();
  return {
    id,
    title: DEFAULT_CHAT_TITLE,
    pinned: false,
    projectId: project?.projectId ?? null,
    projectName: project?.projectName ?? null,
    workspaceRoot: project?.workspaceRoot ?? null,
    linkedChannelSessionId: null,
    updatedAt: Date.now(),
    tasks: [],
  };
}

/** 合并持久化状态时：补齐会话字段并同步 tasks */
export function ensureChatHydration<T extends {
  chatSessions?: ChatSession[];
  activeSessionId?: string;
  tasks?: Task[];
}>(state: T): T {
  let chatSessions = state.chatSessions;
  if (!chatSessions?.length) {
    const s = makeEmptySession();
    chatSessions = [s];
    return {
      ...state,
      chatSessions,
      activeSessionId: s.id,
      tasks: [],
    };
  }

  chatSessions = chatSessions.map(session => ({
    ...session,
    pinned: session.pinned === true,
    projectId: session.projectId ?? null,
    projectName: session.projectName ?? null,
    workspaceRoot: session.workspaceRoot ?? null,
    linkedChannelSessionId: session.linkedChannelSessionId ?? null,
  }));

  let activeSessionId = state.activeSessionId ?? "";
  if (!chatSessions.some(s => s.id === activeSessionId)) {
    const sorted = sortChatSessions(chatSessions);
    activeSessionId = sorted[0]!.id;
  }

  const active = chatSessions.find(s => s.id === activeSessionId)!;
  return {
    ...state,
    chatSessions,
    activeSessionId,
    tasks: active.tasks,
  };
}

export function capTaskList(tasks: Task[]): Task[] {
  return tasks.slice(0, MAX_TASKS_PER_SESSION);
}

export function capSessions(sessions: ChatSession[]): ChatSession[] {
  if (sessions.length <= MAX_CHAT_SESSIONS) return sessions;
  return sortChatSessions(sessions).slice(0, MAX_CHAT_SESSIONS);
}

export function sortChatSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => {
    if ((left.pinned ?? false) !== (right.pinned ?? false)) {
      return left.pinned ? -1 : 1;
    }
    return right.updatedAt - left.updatedAt;
  });
}
