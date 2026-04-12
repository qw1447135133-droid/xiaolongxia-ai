import { buildTaskTranscript } from "@/lib/conversation-bridge";
import { filterByProjectScope, getSessionProjectLabel } from "@/lib/project-context";
import type { ChatSession } from "@/lib/chat-sessions";
import type { BusinessChannelSession, BusinessOperationRecord } from "@/types/business-entities";
import type { ContextMentionKind, ContextMentionRef } from "@/types/context-mentions";

type MeetingSpeechLike = {
  agentId: string;
  role: "open" | "speak" | "rebuttal" | "summary";
  text: string;
  timestamp: number;
};

type MeetingRecordLike = {
  id: string;
  topic: string;
  summary: string;
  speeches: MeetingSpeechLike[];
  finishedAt: number;
  sessionId?: string | null;
  projectId?: string | null;
  rootPath?: string | null;
};

type ProjectScope = {
  projectId?: string | null;
  workspaceRoot?: string | null;
};

export type ContextMentionCandidate = ContextMentionRef & {
  key: string;
  kindLabel: string;
  groupId: ContextMentionKind;
  groupLabel: string;
  searchText: string;
  updatedAt: number;
  priority: number;
};

export type ContextMentionSuggestionGroup = {
  groupId: ContextMentionKind;
  groupLabel: string;
  items: ContextMentionCandidate[];
  updatedAt: number;
  priority: number;
  count: number;
};

export type ContextMentionQueryMatch = {
  query: string;
  start: number;
  end: number;
};

function normalizeText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getMentionKindLabel(kind: ContextMentionKind) {
  switch (kind) {
    case "chat-session":
      return "聊天";
    case "meeting-record":
      return "会议";
    default:
      return "客户";
  }
}

function getChannelLabel(channel: BusinessChannelSession["channel"]) {
  switch (channel) {
    case "telegram":
      return "Telegram";
    case "line":
      return "LINE";
    case "feishu":
      return "飞书";
    case "wecom":
      return "企微";
    case "dingtalk":
      return "钉钉";
    case "wechat_official":
      return "公众号";
    case "qq":
      return "QQ";
    case "email":
      return "Email";
    default:
      return "Web";
  }
}

function getMeetingRoleLabel(role: MeetingSpeechLike["role"]) {
  switch (role) {
    case "open":
      return "开场";
    case "rebuttal":
      return "反驳";
    case "summary":
      return "总结";
    default:
      return "观点";
  }
}

function getChannelLogSpeaker(log: BusinessOperationRecord) {
  const signal = `${log.title} ${log.detail}`;
  if (/收到|入站|inbound|客户|客戶|用户|用戶|customer/u.test(signal)) return "客户";
  if (/系统|同步|connector|webhook|审批|審批|失败|失敗|拦截|攔截/u.test(signal)) return "系统";
  if (log.trigger === "manual") return "人工";
  return "AI";
}

function buildChatSessionPreview(session: ChatSession) {
  const lastTask = [...session.tasks].sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
  if (!lastTask) return "暂无消息";
  const content = lastTask.isUserMessage ? lastTask.description : (lastTask.result ?? lastTask.description);
  return truncateText(content, 72) || "暂无消息";
}

function buildMentionCandidate(
  ref: ContextMentionRef,
  extra: { kindLabel?: string; searchText: string; updatedAt: number; priority: number },
): ContextMentionCandidate {
  const groupLabel = getMentionKindLabel(ref.kind);
  return {
    ...ref,
    key: getContextMentionKey(ref),
    kindLabel: extra.kindLabel ?? groupLabel,
    groupId: ref.kind,
    groupLabel,
    searchText: extra.searchText,
    updatedAt: extra.updatedAt,
    priority: extra.priority,
  };
}

export function getContextMentionKey(ref: Pick<ContextMentionRef, "kind" | "targetId">) {
  return `${ref.kind}:${ref.targetId}`;
}

export function isSameContextMention(
  left: Pick<ContextMentionRef, "kind" | "targetId">,
  right: Pick<ContextMentionRef, "kind" | "targetId">,
) {
  return left.kind === right.kind && left.targetId === right.targetId;
}

export function extractContextMentionQuery(value: string, caret: number) {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex === -1) return null;

  const prefix = beforeCaret.slice(0, atIndex);
  const prefixChar = prefix.slice(-1);
  if (prefixChar && /[A-Za-z0-9._-]/.test(prefixChar)) {
    return null;
  }

  const query = beforeCaret.slice(atIndex + 1);
  if (/[\s]/.test(query)) {
    return null;
  }

  return {
    query,
    start: atIndex,
    end: safeCaret,
  } satisfies ContextMentionQueryMatch;
}

export function replaceContextMentionQuery(
  value: string,
  match: ContextMentionQueryMatch,
): { value: string; caret: number } {
  const before = value.slice(0, match.start);
  const after = value.slice(match.end);
  const normalizedAfter = /\s$/.test(before) ? after.replace(/^[ \t]+/, "") : after;
  const needsSpacer = before.length > 0 && !/\s$/.test(before) && normalizedAfter.length > 0 && !/^\s/.test(normalizedAfter);
  const nextValue = `${before}${needsSpacer ? " " : ""}${normalizedAfter}`;
  return {
    value: nextValue,
    caret: before.length + (needsSpacer ? 1 : 0),
  };
}

export function filterContextMentionCandidateGroups(
  candidates: ContextMentionCandidate[],
  query: string,
  selectedMentions: ContextMentionRef[],
  limit = 8,
) {
  const selectedKeys = new Set(selectedMentions.map(getContextMentionKey));
  const normalizedQuery = normalizeText(query);

  const rankedCandidates = candidates
    .filter(candidate => !selectedKeys.has(candidate.key))
    .map(candidate => {
      if (!normalizedQuery) {
        return { candidate, score: 0 };
      }

      const label = normalizeText(candidate.label);
      const description = normalizeText(candidate.description ?? "");
      const searchText = candidate.searchText;
      let score = Number.POSITIVE_INFINITY;
      if (label.startsWith(normalizedQuery)) {
        score = 0;
      } else if (label.includes(normalizedQuery)) {
        score = 1;
      } else if (description.includes(normalizedQuery)) {
        score = 2;
      } else if (searchText.includes(normalizedQuery)) {
        score = 3;
      }

      return { candidate, score };
    })
    .filter(item => Number.isFinite(item.score))
    .sort((left, right) =>
      left.score - right.score
      || right.candidate.updatedAt - left.candidate.updatedAt
      || left.candidate.priority - right.candidate.priority,
    )
    .map(item => item.candidate);

  const groupedSections = new Map<ContextMentionKind, ContextMentionSuggestionGroup>();
  for (const candidate of rankedCandidates) {
    const current = groupedSections.get(candidate.groupId);
    if (current) {
      current.count += 1;
      current.updatedAt = Math.max(current.updatedAt, candidate.updatedAt);
      current.priority = Math.min(current.priority, candidate.priority);
      if (current.items.length < limit) {
        current.items.push(candidate);
      }
      continue;
    }

    groupedSections.set(candidate.groupId, {
      groupId: candidate.groupId,
      groupLabel: candidate.groupLabel,
      items: [candidate],
      updatedAt: candidate.updatedAt,
      priority: candidate.priority,
      count: 1,
    });
  }

  return Array.from(groupedSections.values()).sort((left, right) =>
    right.updatedAt - left.updatedAt
    || left.priority - right.priority
    || left.groupLabel.localeCompare(right.groupLabel, "zh-CN"),
  );
}

export function buildContextMentionCandidates({
  chatSessions,
  activeSessionId,
  meetingHistory,
  channelSessions,
  scope,
  includeActiveChatSession = false,
}: {
  chatSessions: ChatSession[];
  activeSessionId?: string | null;
  meetingHistory: MeetingRecordLike[];
  channelSessions: BusinessChannelSession[];
  scope: ProjectScope;
  includeActiveChatSession?: boolean;
}) {
  const scopedChatSessionIds = new Set(filterByProjectScope(chatSessions, scope).map(session => session.id));
  const scopedMeetingIds = new Set(filterByProjectScope(meetingHistory, scope).map(record => record.id));
  const scopedChannelIds = new Set(filterByProjectScope(channelSessions, scope).map(session => session.id));

  const chatCandidates = chatSessions
    .filter(session => includeActiveChatSession || session.id !== activeSessionId)
    .map(session =>
      buildMentionCandidate(
        {
          kind: "chat-session",
          targetId: session.id,
          label: session.title?.trim() || "未命名聊天",
          description: `${getSessionProjectLabel(session)} · ${buildChatSessionPreview(session)}`,
        },
        {
          searchText: normalizeText([
            session.title,
            session.projectName,
            buildChatSessionPreview(session),
            getMentionKindLabel("chat-session"),
          ].join(" ")),
          updatedAt: session.updatedAt,
          priority: scopedChatSessionIds.has(session.id) ? 0 : 1,
        },
      ),
    );

  const meetingCandidates = meetingHistory.map(record =>
    buildMentionCandidate(
      {
        kind: "meeting-record",
        targetId: record.id,
        label: record.topic?.trim() || "未命名会议",
        description: truncateText(record.summary || record.speeches.at(-1)?.text || "暂无结论", 88),
      },
      {
        searchText: normalizeText([
          record.topic,
          record.summary,
          record.speeches.at(-1)?.text,
          getMentionKindLabel("meeting-record"),
        ].join(" ")),
        updatedAt: record.finishedAt,
        priority: scopedMeetingIds.has(record.id) ? 0 : 1,
      },
    ),
  );

  const channelCandidates = channelSessions.map(session =>
    buildMentionCandidate(
      {
        kind: "channel-session",
        targetId: session.id,
        label: session.title?.trim() || session.participantLabel?.trim() || "未命名客户会话",
        description: truncateText(
          [
            getChannelLabel(session.channel),
            session.participantLabel || session.accountLabel || "",
            session.summary || session.lastMessagePreview || "暂无消息",
          ]
            .filter(Boolean)
            .join(" · "),
          88,
        ),
      },
      {
        searchText: normalizeText([
          session.title,
          session.participantLabel,
          session.accountLabel,
          session.summary,
          session.lastMessagePreview,
          session.channel,
          getMentionKindLabel("channel-session"),
          getChannelLabel(session.channel),
        ].join(" ")),
        updatedAt: session.lastMessageAt ?? session.updatedAt,
        priority: scopedChannelIds.has(session.id) ? 0 : 1,
      },
    ),
  );

  return [...chatCandidates, ...meetingCandidates, ...channelCandidates].sort(
    (left, right) => right.updatedAt - left.updatedAt || left.priority - right.priority,
  );
}

function buildChatSessionMentionSnippet(session: ChatSession) {
  const transcript = buildTaskTranscript(session.tasks, 10, 4800);
  return [
    `[@聊天区] ${session.title?.trim() || "未命名聊天"}`,
    `项目范围: ${getSessionProjectLabel(session)}`,
    transcript ? `引用记录:\n${transcript}` : "引用记录: 该聊天暂时还没有可复用的消息。",
    "这是用户显式 @ 的聊天记录，只在相关时引用，不要把它当成当前会话默认上下文。",
  ].join("\n");
}

function buildMeetingRecordMentionSnippet(record: MeetingRecordLike) {
  const decisiveSpeeches = [...record.speeches]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 4)
    .reverse()
    .map(speech => `- ${speech.agentId} · ${getMeetingRoleLabel(speech.role)}: ${truncateText(speech.text, 180)}`);

  return [
    `[@会议区] ${record.topic?.trim() || "未命名会议"}`,
    `会议结论: ${truncateText(record.summary, 220) || "暂无结论"}`,
    decisiveSpeeches.length > 0 ? `关键发言:\n${decisiveSpeeches.join("\n")}` : "关键发言: 暂无",
    "这是用户显式 @ 的会议记录，只在相关时继承其中结论和争议点。",
  ].join("\n");
}

function buildChannelSessionMentionSnippet(
  session: BusinessChannelSession,
  operationLogs: BusinessOperationRecord[],
) {
  const scopedLogs = operationLogs
    .filter(log => log.entityType === "channelSession" && log.entityId === session.id)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-8)
    .map(log => `- ${getChannelLogSpeaker(log)}: ${truncateText(log.detail || log.title, 160)}`);

  return [
    `[@客户会话] ${session.title?.trim() || session.participantLabel?.trim() || "未命名客户会话"}`,
    `渠道: ${getChannelLabel(session.channel)} · 状态: ${session.status}`,
    `会话摘要: ${truncateText(session.summary || session.lastMessagePreview || "暂无摘要", 220)}`,
    scopedLogs.length > 0 ? `最近消息:\n${scopedLogs.join("\n")}` : "最近消息: 暂无可引用的客户消息日志。",
    "这是用户显式 @ 的客户沟通记录，只在当前任务确实相关时把它作为补充上下文。",
  ].join("\n");
}

export function buildExplicitMentionContext({
  mentions,
  chatSessions,
  meetingHistory,
  channelSessions,
  operationLogs,
}: {
  mentions: ContextMentionRef[];
  chatSessions: ChatSession[];
  meetingHistory: MeetingRecordLike[];
  channelSessions: BusinessChannelSession[];
  operationLogs: BusinessOperationRecord[];
}) {
  const sections = mentions
    .map((mention) => {
      if (mention.kind === "chat-session") {
        const session = chatSessions.find(item => item.id === mention.targetId);
        return session ? buildChatSessionMentionSnippet(session) : "";
      }

      if (mention.kind === "meeting-record") {
        const record = meetingHistory.find(item => item.id === mention.targetId);
        return record ? buildMeetingRecordMentionSnippet(record) : "";
      }

      const session = channelSessions.find(item => item.id === mention.targetId);
      return session ? buildChannelSessionMentionSnippet(session, operationLogs) : "";
    })
    .filter(Boolean);

  if (sections.length === 0) return "";

  return [
    "以下内容是用户通过 @ 显式指定的外部历史上下文，仅在当前任务相关时引用：",
    ...sections,
  ].join("\n\n---\n\n");
}

export function hydrateContextMentions(
  mentions: ContextMentionRef[],
  candidates: ContextMentionCandidate[],
) {
  const candidateMap = new Map(candidates.map(candidate => [candidate.key, candidate]));
  return mentions.map((mention) => {
    const matched = candidateMap.get(getContextMentionKey(mention));
    if (!matched) return mention;
    return {
      kind: matched.kind,
      targetId: matched.targetId,
      label: matched.label,
      description: matched.description,
    } satisfies ContextMentionRef;
  });
}
