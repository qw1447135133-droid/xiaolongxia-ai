import { filterByProjectScope } from "@/lib/project-context";
import type { Task } from "@/store/types";

type ScopedMeetingRecord = {
  id: string;
  topic: string;
  summary: string;
  speeches: Array<{
    agentId: string;
    role: "open" | "speak" | "rebuttal" | "summary";
    text: string;
    timestamp: number;
  }>;
  finishedAt: number;
  sessionId?: string | null;
  projectId?: string | null;
  rootPath?: string | null;
};

function sanitizeInlineText(value: string, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function buildTaskTranscript(tasks: Task[], limit = 8, maxChars = 6000) {
  if (tasks.length === 0) return "";

  const transcript = [...tasks]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-limit)
    .map(task => {
      const role = task.isUserMessage ? "User" : "Assistant";
      const content = String(task.isUserMessage ? task.description : (task.result ?? task.description) ?? "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return transcript.length <= maxChars ? transcript : transcript.slice(-maxChars);
}

export function buildRecentConversationSnippet(tasks: Task[]) {
  const transcript = buildTaskTranscript(tasks);
  if (!transcript) return "";

  return [
    "Recent chat memory:",
    transcript,
    "请把上面的最近对话当作当前会话的共享短期记忆，延续其中已经生成过的内容，不要把刚刚产出的结论、草稿、清单或设定当成第一次看到。",
  ].join("\n");
}

export function buildMeetingSeedContextFromTasks(tasks: Task[]) {
  const transcript = buildTaskTranscript(tasks, 10, 5000);
  if (!transcript) return "";

  return [
    "当前聊天区最近上下文：",
    transcript,
    "请把这段聊天历史当成开会前已经同步过的背景，不要要求用户重复同样的信息。",
  ].join("\n");
}

export function getRelevantMeetingRecords(
  meetingHistory: ScopedMeetingRecord[],
  scope: { projectId?: string | null; workspaceRoot?: string | null },
  limit = 2,
) {
  const scoped = filterByProjectScope(meetingHistory, scope);
  const hasScopedContext = Boolean(scope.projectId || scope.workspaceRoot);
  const source = hasScopedContext ? scoped : (scoped.length > 0 ? scoped : meetingHistory);
  return [...source]
    .sort((left, right) => right.finishedAt - left.finishedAt)
    .slice(0, limit);
}

export function buildMeetingHistorySnippet(records: ScopedMeetingRecord[]) {
  if (records.length === 0) return "";

  const lines = records.map((record, index) => {
    const decisiveSpeech = [...record.speeches]
      .reverse()
      .find(speech => speech.role === "summary" || speech.role === "rebuttal")
      ?? record.speeches[record.speeches.length - 1]
      ?? null;

    const bulletLines = [
      `${index + 1}. ${sanitizeInlineText(record.topic, 80)} | ${new Date(record.finishedAt).toLocaleString("zh-CN", { hour12: false })}`,
      `结论：${sanitizeInlineText(record.summary, 200)}`,
      decisiveSpeech ? `关键发言：${sanitizeInlineText(decisiveSpeech.text, 180)}` : "",
    ].filter(Boolean);

    return bulletLines.join("\n");
  });

  return [
    "Recent meeting memory:",
    ...lines,
    "如果当前请求与上述会议议题相关，请默认继承这些会议结论、争议点和已经拍板的方向，不要把它们当成全新问题。",
  ].join("\n");
}
