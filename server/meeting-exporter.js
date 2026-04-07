import os from "os";
import path from "path";
import { promises as fs } from "fs";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const EXPORT_DIR = path.join(os.tmpdir(), "xiaolongxia-ai", "meeting-exports");

const MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const AGENT_LABELS = {
  orchestrator: "鹦鹉螺",
  explorer: "探海鲸鱼",
  writer: "星海章鱼",
  designer: "珊瑚水母",
  performer: "逐浪海豚",
  greeter: "招潮蟹",
};

const ROLE_LABELS = {
  open: "开场",
  speak: "观点",
  rebuttal: "补充/辩论",
  summary: "最终结论",
};

function sanitizeFileName(input) {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "meeting";
}

function toDisplayTime(timestamp) {
  return new Date(timestamp ?? Date.now()).toLocaleString("zh-CN", { hour12: false });
}

function extractSummaryItems(summary) {
  const normalized = String(summary ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[\d一二三四五六七八九十]+[.、)\s-]*/, "").trim())
    .filter(Boolean);

  if (normalized.length > 0) return normalized;

  const fallback = String(summary ?? "")
    .split(/[。；;]+/)
    .map(line => line.trim())
    .filter(Boolean);

  return fallback.length > 0 ? fallback : ["暂无可导出的会议结论"];
}

function normalizeSpeeches(speeches) {
  return Array.isArray(speeches)
    ? speeches.map((speech, index) => ({
        id: speech.id ?? `speech-${index + 1}`,
        agentId: speech.agentId ?? "orchestrator",
        role: speech.role ?? "speak",
        text: String(speech.text ?? "").trim(),
        timestamp: speech.timestamp ?? Date.now(),
      }))
    : [];
}

async function ensureExportDir() {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
}

async function writeDocx(filePath, meeting) {
  const summaryItems = extractSummaryItems(meeting.summary);
  const doc = new Document({
    creator: "xiaolongxia-ai",
    title: `${meeting.topic} - 会议结论`,
    description: "STARCRAW 会议导出",
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun(`${meeting.topic} - 会议纪要`)],
          }),
          new Paragraph({
            children: [new TextRun(`导出时间：${toDisplayTime(meeting.finishedAt)}`)],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("会议结论")],
          }),
          ...summaryItems.map(
            (item, index) =>
              new Paragraph({
                children: [new TextRun(`${index + 1}. ${item}`)],
              }),
          ),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("会议记录")],
          }),
          ...meeting.speeches.flatMap((speech, index) => [
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [
                new TextRun(
                  `${index + 1}. ${AGENT_LABELS[speech.agentId] ?? speech.agentId} / ${ROLE_LABELS[speech.role] ?? speech.role}`,
                ),
              ],
            }),
            new Paragraph({
              children: [new TextRun(`时间：${toDisplayTime(speech.timestamp)}`)],
            }),
            new Paragraph({
              children: [new TextRun(speech.text || "（无内容）")],
            }),
          ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}

async function writeXlsx(filePath, meeting) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "xiaolongxia-ai";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summarySheet = workbook.addWorksheet("会议结论");
  summarySheet.columns = [
    { header: "字段", key: "field", width: 18 },
    { header: "内容", key: "value", width: 72 },
  ];
  summarySheet.getRow(1).font = { name: "Arial", bold: true };
  summarySheet.addRows([
    { field: "会议主题", value: meeting.topic },
    { field: "导出时间", value: toDisplayTime(meeting.finishedAt) },
    { field: "发言条数", value: meeting.speeches.length },
  ]);
  summarySheet.addRow({});
  summarySheet.addRow({ field: "结论拆解", value: "执行项" });
  summarySheet.getRow(summarySheet.rowCount).font = { name: "Arial", bold: true };
  extractSummaryItems(meeting.summary).forEach((item, index) => {
    summarySheet.addRow({ field: `结论 ${index + 1}`, value: item });
  });
  summarySheet.eachRow(row => {
    row.font = { ...(row.font ?? {}), name: "Arial" };
    row.alignment = { vertical: "top", wrapText: true };
  });

  const speechSheet = workbook.addWorksheet("会议记录");
  speechSheet.columns = [
    { header: "序号", key: "index", width: 8 },
    { header: "Agent", key: "agent", width: 16 },
    { header: "角色", key: "role", width: 12 },
    { header: "时间", key: "time", width: 22 },
    { header: "发言内容", key: "text", width: 72 },
  ];
  speechSheet.getRow(1).font = { name: "Arial", bold: true };
  meeting.speeches.forEach((speech, index) => {
    speechSheet.addRow({
      index: index + 1,
      agent: AGENT_LABELS[speech.agentId] ?? speech.agentId,
      role: ROLE_LABELS[speech.role] ?? speech.role,
      time: toDisplayTime(speech.timestamp),
      text: speech.text,
    });
  });
  speechSheet.eachRow(row => {
    row.font = { ...(row.font ?? {}), name: "Arial" };
    row.alignment = { vertical: "top", wrapText: true };
  });

  await workbook.xlsx.writeFile(filePath);
}

function addSummarySlide(pptx, meeting) {
  const slide = pptx.addSlide();
  slide.background = { color: "F6F1E8" };
  slide.addText("会议结论", {
    x: 0.6,
    y: 0.4,
    w: 5.0,
    h: 0.5,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: "243447",
  });
  slide.addText(`议题：${meeting.topic}`, {
    x: 0.6,
    y: 0.95,
    w: 10.8,
    h: 0.35,
    fontFace: "Arial",
    fontSize: 11,
    color: "52606D",
  });

  const items = extractSummaryItems(meeting.summary).slice(0, 6);
  items.forEach((item, index) => {
    const top = 1.55 + index * 0.72;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.75,
      y: top,
      w: 0.42,
      h: 0.42,
      fill: { color: "B85042" },
      line: { color: "B85042" },
      radius: 0.08,
    });
    slide.addText(String(index + 1), {
      x: 0.84,
      y: top + 0.06,
      w: 0.24,
      h: 0.18,
      fontFace: "Arial",
      fontSize: 10,
      bold: true,
      align: "center",
      color: "FFFFFF",
    });
    slide.addText(item, {
      x: 1.35,
      y: top - 0.02,
      w: 10.5,
      h: 0.52,
      fontFace: "Arial",
      fontSize: 15,
      color: "243447",
      breakLine: false,
      margin: 0,
      valign: "mid",
    });
  });
}

function addSpeechSlides(pptx, meeting) {
  const chunks = [];
  for (let i = 0; i < meeting.speeches.length; i += 4) {
    chunks.push(meeting.speeches.slice(i, i + 4));
  }

  chunks.slice(0, 2).forEach((chunk, slideIndex) => {
    const slide = pptx.addSlide();
    slide.background = { color: slideIndex % 2 === 0 ? "FFFDF8" : "EEF3F7" };
    slide.addText(slideIndex === 0 ? "关键发言" : "补充发言", {
      x: 0.6,
      y: 0.4,
      w: 5.0,
      h: 0.5,
      fontFace: "Arial",
      fontSize: 22,
      bold: true,
      color: "243447",
    });

    chunk.forEach((speech, index) => {
      const top = 1.25 + index * 1.45;
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.65,
        y: top,
        w: 12.0,
        h: 1.1,
        fill: { color: "FFFFFF", transparency: 0 },
        line: { color: "D9E2EC", width: 1 },
        radius: 0.08,
      });
      slide.addText(`${AGENT_LABELS[speech.agentId] ?? speech.agentId} · ${ROLE_LABELS[speech.role] ?? speech.role}`, {
        x: 0.9,
        y: top + 0.1,
        w: 4.5,
        h: 0.2,
        fontFace: "Arial",
        fontSize: 11,
        bold: true,
        color: "B85042",
      });
      slide.addText((speech.text || "（无内容）").slice(0, 130), {
        x: 0.9,
        y: top + 0.35,
        w: 11.2,
        h: 0.55,
        fontFace: "Arial",
        fontSize: 13,
        color: "243447",
        margin: 0,
        valign: "top",
      });
    });
  });
}

async function writePptx(filePath, meeting) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "xiaolongxia-ai";
  pptx.company = "xiaolongxia-ai";
  pptx.subject = "会议结论导出";
  pptx.title = `${meeting.topic} - 会议结论`;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
    lang: "zh-CN",
  };

  const cover = pptx.addSlide();
  cover.background = { color: "243447" };
  cover.addText("主管 Agent 会议纪要", {
    x: 0.75,
    y: 1.0,
    w: 6.5,
    h: 0.7,
    fontFace: "Arial",
    fontSize: 28,
    bold: true,
    color: "FFFFFF",
  });
  cover.addText(meeting.topic, {
    x: 0.75,
    y: 1.95,
    w: 8.6,
    h: 0.7,
    fontFace: "Arial",
    fontSize: 20,
    color: "F4D6CC",
  });
  cover.addText(`导出时间：${toDisplayTime(meeting.finishedAt)}`, {
    x: 0.75,
    y: 4.9,
    w: 4.2,
    h: 0.25,
    fontFace: "Arial",
    fontSize: 11,
    color: "D9E2EC",
  });

  addSummarySlide(pptx, meeting);
  addSpeechSlides(pptx, meeting);

  await pptx.writeFile({ fileName: filePath });
}

export async function exportMeetingDocument({ format, meeting }) {
  if (!["docx", "xlsx", "pptx"].includes(format)) {
    throw new Error("不支持的导出格式");
  }

  const normalizedMeeting = {
    topic: String(meeting?.topic ?? "").trim(),
    summary: String(meeting?.summary ?? "").trim(),
    speeches: normalizeSpeeches(meeting?.speeches),
    finishedAt: meeting?.finishedAt ?? Date.now(),
  };

  if (!normalizedMeeting.topic) {
    throw new Error("会议主题不能为空");
  }
  if (!normalizedMeeting.summary) {
    throw new Error("会议结论不能为空");
  }

  await ensureExportDir();

  const baseName = `${sanitizeFileName(normalizedMeeting.topic)}-${Date.now()}`;
  const fileName = `${baseName}.${format}`;
  const filePath = path.join(EXPORT_DIR, fileName);

  if (format === "docx") {
    await writeDocx(filePath, normalizedMeeting);
  } else if (format === "xlsx") {
    await writeXlsx(filePath, normalizedMeeting);
  } else {
    await writePptx(filePath, normalizedMeeting);
  }

  return {
    filePath,
    fileName,
    mimeType: MIME_TYPES[format],
  };
}
