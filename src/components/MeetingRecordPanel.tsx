"use client";

import { useMemo, useState } from "react";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { PLATFORM_DEFINITIONS } from "@/store/types";
import type { UiLocale } from "@/store/types";
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
  const locale = useStore(s => s.locale);
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
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{pickLocaleText(locale, { "zh-CN": "会议记录", "zh-TW": "會議記錄", en: "Meeting Record", ja: "会議記録" })}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 8 }}>
          {pickLocaleText(locale, {
            "zh-CN": "会议结束后，主管 agent 的会议结论会显示在这里，并支持导出为 Word、Excel、PPT 或发送到 Telegram、飞书。",
            "zh-TW": "會議結束後，主管 agent 的會議結論會顯示在這裡，並支援匯出為 Word、Excel、PPT 或發送到 Telegram、飛書。",
            en: "After a meeting ends, the lead agent summary appears here. You can export it as Word, Excel, PPT, or send it to Telegram or Feishu.",
            ja: "会議終了後、主管 agent の要約がここに表示されます。Word、Excel、PPT への書き出しや Telegram、Feishu への送信もできます。",
          })}
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
    setStatusText(pickLocaleText(locale, {
      "zh-CN": `[1/2] 正在生成 ${FORMAT_LABEL[format]} 文档...`,
      "zh-TW": `[1/2] 正在產生 ${FORMAT_LABEL[format]} 文件...`,
      en: `[1/2] Generating ${FORMAT_LABEL[format]} document...`,
      ja: `[1/2] ${FORMAT_LABEL[format]} ドキュメントを生成中...`,
    }));
    try {
      const { fileName } = await downloadMeetingExport(meetingPayload, format);
      setStatusText(pickLocaleText(locale, {
        "zh-CN": `[2/2] 已导出 ${fileName}`,
        "zh-TW": `[2/2] 已匯出 ${fileName}`,
        en: `[2/2] Exported ${fileName}`,
        ja: `[2/2] ${fileName} を書き出しました`,
      }));
    } catch (error) {
      setStatusText(pickLocaleText(locale, {
        "zh-CN": `导出失败：${error instanceof Error ? error.message : String(error)}`,
        "zh-TW": `匯出失敗：${error instanceof Error ? error.message : String(error)}`,
        en: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        ja: `書き出し失敗: ${error instanceof Error ? error.message : String(error)}`,
      }));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSend(platformId: string) {
    const actionKey = `send:${platformId}`;
    setBusyAction(actionKey);
    setStatusText(pickLocaleText(locale, {
      "zh-CN": `[1/3] 正在生成 ${FORMAT_LABEL[sendFormat]} 文档...`,
      "zh-TW": `[1/3] 正在產生 ${FORMAT_LABEL[sendFormat]} 文件...`,
      en: `[1/3] Generating ${FORMAT_LABEL[sendFormat]} document...`,
      ja: `[1/3] ${FORMAT_LABEL[sendFormat]} ドキュメントを生成中...`,
    }));
    try {
      setStatusText(pickLocaleText(locale, {
        "zh-CN": `[2/3] 正在发送到 ${platformId}...`,
        "zh-TW": `[2/3] 正在發送到 ${platformId}...`,
        en: `[2/3] Sending to ${platformId}...`,
        ja: `[2/3] ${platformId} に送信中...`,
      }));
      const result = await sendMeetingExportToPlatform(meetingPayload, { format: sendFormat, platformId });
      setStatusText(pickLocaleText(locale, {
        "zh-CN": `[3/3] ${result.message ?? "已发送完成"}`,
        "zh-TW": `[3/3] ${result.message ?? "已發送完成"}`,
        en: `[3/3] ${result.message ?? "Sent successfully"}`,
        ja: `[3/3] ${result.message ?? "送信完了"}`,
      }));
    } catch (error) {
      setStatusText(pickLocaleText(locale, {
        "zh-CN": `发送失败：${error instanceof Error ? error.message : String(error)}`,
        "zh-TW": `發送失敗：${error instanceof Error ? error.message : String(error)}`,
        en: `Send failed: ${error instanceof Error ? error.message : String(error)}`,
        ja: `送信失敗: ${error instanceof Error ? error.message : String(error)}`,
      }));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{pickLocaleText(locale, { "zh-CN": "最新会议记录", "zh-TW": "最新會議記錄", en: "Latest Meeting Record", ja: "最新の会議記録" })}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {new Date(latestMeetingRecord.finishedAt).toLocaleString(locale, { hour12: false })}
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
          {pickLocaleText(locale, {
            "zh-CN": `${latestMeetingRecord.speeches.length} 条发言`,
            "zh-TW": `${latestMeetingRecord.speeches.length} 條發言`,
            en: `${latestMeetingRecord.speeches.length} speeches`,
            ja: `${latestMeetingRecord.speeches.length} 発言`,
          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {pickLocaleText(locale, { "zh-CN": "议题", "zh-TW": "議題", en: "Topic", ja: "議題" })}: <span style={{ color: "var(--text)", fontWeight: 600 }}>{latestMeetingRecord.topic}</span>
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
            {busyAction === `export:${format}`
              ? pickLocaleText(locale, {
                  "zh-CN": `导出${FORMAT_LABEL[format]}中...`,
                  "zh-TW": `正在匯出 ${FORMAT_LABEL[format]}...`,
                  en: `Exporting ${FORMAT_LABEL[format]}...`,
                  ja: `${FORMAT_LABEL[format]} を書き出し中...`,
                })
              : pickLocaleText(locale, {
                  "zh-CN": `导出 ${FORMAT_LABEL[format]}`,
                  "zh-TW": `匯出 ${FORMAT_LABEL[format]}`,
                  en: `Export ${FORMAT_LABEL[format]}`,
                  ja: `${FORMAT_LABEL[format]} を書き出す`,
                })}
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
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{pickLocaleText(locale, { "zh-CN": "发送格式", "zh-TW": "發送格式", en: "Send format", ja: "送信形式" })}</span>
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
            {pickLocaleText(locale, {
              "zh-CN": "如需主管 agent 主动发送文件，请先在“设置 → 消息平台”里启用 Telegram 或飞书，并填写默认接收人。",
              "zh-TW": "如需主管 agent 主動發送文件，請先在「設定 → 消息平台」裡啟用 Telegram 或飛書，並填寫預設接收人。",
              en: "To let the lead agent send files automatically, enable Telegram or Feishu in Settings -> Messaging Platforms and fill in the default recipient first.",
              ja: "主管 agent に自動送信させるには、まず 設定 -> メッセージプラットフォーム で Telegram か Feishu を有効にし、既定の受信者を設定してください。",
            })}
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
                {busyAction === `send:${platform.id}`
                  ? pickLocaleText(locale, {
                      "zh-CN": `发送到 ${platform.name} 中...`,
                      "zh-TW": `正在發送到 ${platform.name}...`,
                      en: `Sending to ${platform.name}...`,
                      ja: `${platform.name} に送信中...`,
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": `发到 ${platform.name}`,
                      "zh-TW": `發到 ${platform.name}`,
                      en: `Send to ${platform.name}`,
                      ja: `${platform.name} に送る`,
                    })}
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
