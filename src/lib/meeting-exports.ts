"use client";

import { resolveBackendUrl } from "@/lib/backend-url";
import type { MeetingSpeech } from "@/store";

export type MeetingExportFormat = "docx" | "xlsx" | "pptx";

export interface MeetingExportPayload {
  topic: string;
  summary: string;
  speeches: MeetingSpeech[];
  finishedAt?: number;
}

function parseFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] ?? fallback;
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function downloadMeetingExport(meeting: MeetingExportPayload, format: MeetingExportFormat): Promise<{ fileName: string }> {
  const url = await resolveBackendUrl("/api/meeting/export");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, meeting }),
  });

  if (!res.ok) {
    throw new Error(`导出失败：HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const fallback = `meeting-export.${format}`;
  const fileName = parseFileName(res.headers.get("content-disposition"), fallback);
  triggerDownload(blob, fileName);
  return { fileName };
}

export async function sendMeetingExportToPlatform(
  meeting: MeetingExportPayload,
  options: { format: MeetingExportFormat; platformId: string },
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const url = await resolveBackendUrl("/api/meeting/send");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meeting,
      format: options.format,
      platformId: options.platformId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `发送失败：HTTP ${res.status}`);
  }

  return data;
}
