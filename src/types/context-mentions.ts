export type ContextMentionKind = "chat-session" | "meeting-record" | "channel-session";

export interface ContextMentionRef {
  kind: ContextMentionKind;
  targetId: string;
  label: string;
  description?: string;
}
