"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { MeetingExportFormat } from "@/lib/meeting-exports";
import { downloadMeetingExport, sendMeetingExportToPlatform } from "@/lib/meeting-exports";

const FORMAT_LABEL: Record<MeetingExportFormat, string> = {
  docx: "Word",
  xlsx: "Excel",
  pptx: "PPT",
};

const FILE_PLATFORM_IDS = new Set(["telegram", "feishu"]);

export function MeetingRecordPanel() {
  const latestMeetingRecord = useStore(s => s.latestMeetingRecord);
  const platformConfigs = useStore(s => s.platformConfigs);
  const [sendFormat, setSendFormat] = useState<MeetingExportFormat>("docx");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");

  const enabledPlatforms = useMemo(
    () =>
      PLATFORM_DEFINITIONS.filter(
        platform => FILE_PLATFORM_IDS.has(platform.id) && platformConfigs[platform.id]?.enabled,
      ),
    [platformConfigs],
  );

  if (!latestMeetingRecord) {
    return (
      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>会议记录</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 8 }}>
          会议结束后，主管 agent 的会议结论会显示在这里，并支持导出为 Word、Excel、PPT 或发送到 Telegram、飞书。
        </div>
      </div>
    );
  }

  const meetingPayload = {
    topic: latestMeetingRecord.topic,
    summary: latestMeetingRecord.summary,
    speeches: latestMeetingRecord.speeches,
    finishedAt: latestMeetingRecord.finishedAt,
  };

  async function handleExport(format: MeetingExportFormat) {
    const actionKey = `export:${format}`;
    setBusyAction(actionKey);
    setStatusText(`[1/2] 正在生成 ${FORMAT_LABEL[format]} 文档...`);
    try {
      const { fileName } = await downloadMeetingExport(meetingPayload, format);
      setStatusText(`[2/2] 已导出 ${fileName}`);
    } catch (error) {
      setStatusText(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSend(platformId: string) {
    const actionKey = `send:${platformId}`;
    setBusyAction(actionKey);
    setStatusText(`[1/3] 正在生成 ${FORMAT_LABEL[sendFormat]} 文档...`);
    try {
      setStatusText(`[2/3] 正在发送到 ${platformId}...`);
      const result = await sendMeetingExportToPlatform(meetingPayload, { format: sendFormat, platformId });
      setStatusText(`[3/3] ${result.message ?? "已发送完成"}`);
    } catch (error) {
      setStatusText(`发送失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>最新会议记录</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {new Date(latestMeetingRecord.finishedAt).toLocaleString("zh-CN", { hour12: false })}
          </div>
        </div>
        <div
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 10,
            color: "var(--accent)",
            background: "var(--accent-dim)",
            border: "1px solid rgba(var(--accent-rgb), 0.25)",
          }}
        >
          {latestMeetingRecord.speeches.length} 条发言
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        议题：<span style={{ color: "var(--text)", fontWeight: 600 }}>{latestMeetingRecord.topic}</span>
      </div>

      <div
        style={{
          fontSize: 11,
          lineHeight: 1.7,
          color: "var(--text)",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 12px",
          whiteSpace: "pre-wrap",
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {latestMeetingRecord.summary}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {(["docx", "xlsx", "pptx"] as MeetingExportFormat[]).map(format => (
          <button
            key={format}
            className="btn-ghost"
            onClick={() => handleExport(format)}
            disabled={busyAction !== null}
            style={{ fontSize: 11, padding: "6px 8px", minWidth: 0 }}
          >
            {busyAction === `export:${format}` ? `导出${FORMAT_LABEL[format]}中...` : `导出 ${FORMAT_LABEL[format]}`}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>发送格式</span>
          <select
            className="input"
            value={sendFormat}
            onChange={e => setSendFormat(e.target.value as MeetingExportFormat)}
            disabled={busyAction !== null}
            style={{ fontSize: 11, minWidth: 0 }}
          >
            <option value="docx">Word</option>
            <option value="xlsx">Excel</option>
            <option value="pptx">PPT</option>
          </select>
        </div>

        {enabledPlatforms.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
            如需主管 agent 主动发送文件，请先在“设置 → 消息平台”里启用 Telegram 或飞书，并填写默认接收人。
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {enabledPlatforms.map(platform => (
              <button
                key={platform.id}
                className="btn-primary"
                onClick={() => handleSend(platform.id)}
                disabled={busyAction !== null}
                style={{ fontSize: 11, padding: "6px 8px", minWidth: 0 }}
              >
                {busyAction === `send:${platform.id}` ? `发送到 ${platform.name} 中...` : `发到 ${platform.name}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {statusText ? (
        <div
          style={{
            fontSize: 10,
            color: busyAction ? "var(--accent)" : "var(--text-muted)",
            background: "rgba(var(--accent-rgb), 0.06)",
            border: "1px solid rgba(var(--accent-rgb), 0.15)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 8px",
            lineHeight: 1.5,
          }}
        >
          {statusText}
        </div>
      ) : null}
    </div>
  );
}
