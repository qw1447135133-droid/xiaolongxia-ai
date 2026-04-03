import { resolveBackendUrl } from "@/lib/backend-url";

export type AttachmentKind = "image" | "document" | "audio" | "video" | "other";

export type AttachmentParseStatus = "pending" | "parsed" | "partial" | "failed" | "unsupported";

export interface DispatchAttachmentRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  parseStatus: AttachmentParseStatus;
  summary?: string;
}

export interface ClientAttachmentUploadResult {
  ok: boolean;
  attachments: DispatchAttachmentRef[];
  error?: string;
}

export interface NormalizedAttachment extends DispatchAttachmentRef {
  parsedText?: string;
  unsupportedReason?: string;
}

export interface StoredAttachment extends NormalizedAttachment {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

export function detectAttachmentKind(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (
    file.type.includes("pdf") ||
    file.type.includes("word") ||
    file.type.includes("sheet") ||
    file.type.includes("excel") ||
    file.type.includes("powerpoint") ||
    file.type.startsWith("text/")
  ) {
    return "document";
  }
  return "other";
}

export function formatAttachmentSummary(
  instruction: string,
  attachments: Array<Pick<DispatchAttachmentRef, "name">>,
): string {
  const text = instruction.trim() || "请读取我上传的文件并给出关键信息总结。";
  if (attachments.length === 0) return text;
  return `${text}\n\n附件：${attachments.map((item) => item.name).join("、")}`;
}

export async function uploadAttachments(
  files: File[],
  sessionId: string,
): Promise<ClientAttachmentUploadResult> {
  if (files.length === 0) {
    return { ok: true, attachments: [] };
  }

  const url = await resolveBackendUrl("/api/attachments/upload");
  const form = new FormData();
  form.append("sessionId", sessionId);

  for (const file of files) {
    form.append("files", file, file.name);
  }

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as ClientAttachmentUploadResult;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `附件上传失败：HTTP ${res.status}`);
  }

  return data;
}
