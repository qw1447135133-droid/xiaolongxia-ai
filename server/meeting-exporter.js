import os from "os";
import path from "path";
import { promises as fs } from "fs";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { normalizeMeetingExportBrief } from "./meeting-export-brief.js";

const EXPORT_DIR = path.join(os.tmpdir(), "xiaolongxia-ai", "meeting-exports");
const LOCAL_EXPORT_ROOT = path.join(os.homedir(), "Desktop", "STARCRAW", "meeting-exports");
const DOC_FONT = "Microsoft YaHei";

const MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const PALETTE = {
  ink: "0F172A",
  slate: "334155",
  muted: "64748B",
  border: "CBD5E1",
  panel: "F8FAFC",
  sand: "E7E8D1",
  accent: "B85042",
  accentSoft: "F4D6CC",
  accentDark: "8C3D32",
  teal: "0F766E",
  tealSoft: "E6FFFA",
  green: "2F855A",
  greenSoft: "E8F5EC",
  white: "FFFFFF",
  roseSoft: "FDF2F2",
};

function sanitizeFileName(input) {
  return String(input ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "meeting";
}

function cleanText(input) {
  return String(input ?? "").replace(/\r/g, "").trim();
}

function toDisplayTime(timestamp) {
  return new Date(timestamp ?? Date.now()).toLocaleString("zh-CN", { hour12: false });
}

function normalizeSpeeches(speeches) {
  return Array.isArray(speeches)
    ? speeches.map((speech, index) => ({
        id: speech.id ?? `speech-${index + 1}`,
        agentId: speech.agentId ?? "orchestrator",
        role: speech.role ?? "speak",
        text: cleanText(speech.text),
        timestamp: speech.timestamp ?? Date.now(),
      }))
    : [];
}

function toArgb(hex) {
  return `FF${String(hex || "").replace(/^#/, "").toUpperCase()}`;
}

function createText(text, options = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: DOC_FONT,
    ...options,
  });
}

function createSpacer(after = 140) {
  return new Paragraph({
    spacing: { after },
  });
}

function createSectionHeading(title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 220, after: 120 },
    children: [
      createText(title, {
        bold: true,
        color: PALETTE.ink,
      }),
    ],
  });
}

function createBodyParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 120, line: 320 },
    alignment: options.alignment,
    children: [
      createText(text, {
        color: options.color ?? PALETTE.slate,
        size: options.size,
        bold: options.bold,
        italics: options.italics,
      }),
    ],
  });
}

function createBulletParagraph(text, color = PALETTE.slate) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 300 },
    children: [
      createText(text, {
        color,
      }),
    ],
  });
}

function createInfoTable(meeting, brief) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ["会议议题", meeting.topic],
      ["导出时间", toDisplayTime(meeting.finishedAt)],
      ["建议主责", brief.ownerRecommendation],
    ].map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            shading: { fill: PALETTE.sand },
            borders: {
              top: { style: BorderStyle.SINGLE, color: PALETTE.border },
              bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
              left: { style: BorderStyle.SINGLE, color: PALETTE.border },
              right: { style: BorderStyle.SINGLE, color: PALETTE.border },
            },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [createText(label, { bold: true, color: PALETTE.ink })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            shading: { fill: PALETTE.panel },
            borders: {
              top: { style: BorderStyle.SINGLE, color: PALETTE.border },
              bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
              left: { style: BorderStyle.SINGLE, color: PALETTE.border },
              right: { style: BorderStyle.SINGLE, color: PALETTE.border },
            },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [createText(value, { color: PALETTE.slate })],
              }),
            ],
          }),
        ],
      }),
    ),
  });
}

function createHighlightPanel(title, body, fill = PALETTE.accentSoft, bodyColor = PALETTE.accentDark) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill },
            borders: {
              top: { style: BorderStyle.SINGLE, color: PALETTE.border },
              bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
              left: { style: BorderStyle.SINGLE, color: PALETTE.border },
              right: { style: BorderStyle.SINGLE, color: PALETTE.border },
            },
            children: [
              new Paragraph({
                spacing: { after: 100 },
                children: [createText(title, { bold: true, color: PALETTE.ink })],
              }),
              createBodyParagraph(body, { after: 0, color: bodyColor }),
            ],
          }),
        ],
      }),
    ],
  });
}

function createBorderedCell(children, fill) {
  return new TableCell({
    shading: { fill },
    borders: {
      top: { style: BorderStyle.SINGLE, color: PALETTE.border },
      bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
      left: { style: BorderStyle.SINGLE, color: PALETTE.border },
      right: { style: BorderStyle.SINGLE, color: PALETTE.border },
    },
    children: Array.isArray(children) ? children : [children],
  });
}

function createActionTable(items) {
  const rows = [
    new TableRow({
      children: ["执行动作", "主责", "时间节奏", "成功标志"].map(title =>
        createBorderedCell(
          new Paragraph({
            spacing: { after: 0 },
            alignment: AlignmentType.CENTER,
            children: [createText(title, { bold: true, color: PALETTE.white })],
          }),
          PALETTE.ink,
        ),
      ),
    }),
    ...items.map((item, index) => {
      const fill = index % 2 === 0 ? PALETTE.panel : PALETTE.white;
      return new TableRow({
        children: [
          createBorderedCell(createBodyParagraph(item.task, { after: 0 }), fill),
          createBorderedCell(createBodyParagraph(item.owner, { after: 0, color: PALETTE.teal, bold: true }), fill),
          createBorderedCell(createBodyParagraph(item.deadline, { after: 0 }), fill),
          createBorderedCell(createBodyParagraph(item.successMetric, { after: 0 }), fill),
        ],
      });
    }),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function createRejectedTable(items) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: ["备选方向", "未被采纳原因"].map(title =>
          new TableCell({
            shading: { fill: PALETTE.sand },
            borders: {
              top: { style: BorderStyle.SINGLE, color: PALETTE.border },
              bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
              left: { style: BorderStyle.SINGLE, color: PALETTE.border },
              right: { style: BorderStyle.SINGLE, color: PALETTE.border },
            },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [createText(title, { bold: true, color: PALETTE.ink })],
              }),
            ],
          }),
        ),
      }),
      ...items.map((item, index) =>
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: index % 2 === 0 ? PALETTE.white : PALETTE.panel },
              borders: {
                top: { style: BorderStyle.SINGLE, color: PALETTE.border },
                bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
                left: { style: BorderStyle.SINGLE, color: PALETTE.border },
                right: { style: BorderStyle.SINGLE, color: PALETTE.border },
              },
              children: [createBodyParagraph(item.option, { after: 0, bold: true })],
            }),
            new TableCell({
              shading: { fill: index % 2 === 0 ? PALETTE.white : PALETTE.panel },
              borders: {
                top: { style: BorderStyle.SINGLE, color: PALETTE.border },
                bottom: { style: BorderStyle.SINGLE, color: PALETTE.border },
                left: { style: BorderStyle.SINGLE, color: PALETTE.border },
                right: { style: BorderStyle.SINGLE, color: PALETTE.border },
              },
              children: [createBodyParagraph(item.reason, { after: 0 })],
            }),
          ],
        }),
      ),
    ],
  });
}

function setWorksheetBase(worksheet) {
  worksheet.properties.defaultRowHeight = 22;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function styleCell(cell, options = {}) {
  cell.font = {
    name: DOC_FONT,
    size: options.size ?? 10.5,
    bold: Boolean(options.bold),
    color: { argb: toArgb(options.color ?? PALETTE.ink) },
  };
  cell.alignment = {
    vertical: options.vertical ?? "middle",
    horizontal: options.horizontal,
    wrapText: options.wrapText !== false,
  };
  if (options.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: toArgb(options.fill) },
    };
  }
  if (options.border !== false) {
    cell.border = {
      top: { style: "thin", color: { argb: toArgb(PALETTE.border) } },
      bottom: { style: "thin", color: { argb: toArgb(PALETTE.border) } },
      left: { style: "thin", color: { argb: toArgb(PALETTE.border) } },
      right: { style: "thin", color: { argb: toArgb(PALETTE.border) } },
    };
  }
}

function addWorksheetTitle(worksheet, title, subtitle) {
  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = title;
  styleCell(worksheet.getCell("A1"), {
    fill: PALETTE.ink,
    color: PALETTE.white,
    bold: true,
    size: 16,
    horizontal: "left",
  });

  worksheet.mergeCells("A2:F2");
  worksheet.getCell("A2").value = subtitle;
  styleCell(worksheet.getCell("A2"), {
    fill: PALETTE.panel,
    color: PALETTE.muted,
    size: 10,
    horizontal: "left",
  });
}

function addKeyValueRow(worksheet, rowNumber, label, value, fill = PALETTE.white) {
  worksheet.mergeCells(`B${rowNumber}:F${rowNumber}`);
  worksheet.getCell(`A${rowNumber}`).value = label;
  worksheet.getCell(`B${rowNumber}`).value = value;
  styleCell(worksheet.getCell(`A${rowNumber}`), {
    fill: PALETTE.sand,
    bold: true,
  });
  styleCell(worksheet.getCell(`B${rowNumber}`), {
    fill,
    horizontal: "left",
  });
}

async function ensureExportDir() {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
}

function resolveMeetingLocalExportDir(outputDir) {
  const normalized = String(outputDir || "desktop").trim().toLowerCase();

  if (normalized === "downloads" || normalized === "download") {
    return path.join(os.homedir(), "Downloads", "STARCRAW", "meeting-exports");
  }
  if (normalized === "documents" || normalized === "document") {
    return path.join(os.homedir(), "Documents", "STARCRAW", "meeting-exports");
  }
  if (normalized === "temp" || normalized === "tmp") {
    return EXPORT_DIR;
  }

  return LOCAL_EXPORT_ROOT;
}

async function writeDocx(filePath, meeting) {
  const brief = meeting.exportBrief;
  const doc = new Document({
    creator: "STARCRAW",
    title: brief.reportTitle,
    description: "鹦鹉螺会议结果稿",
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1280,
              right: 1280,
              bottom: 1280,
              left: 1280,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              createText(brief.reportTitle, {
                bold: true,
                color: PALETTE.ink,
                size: 34,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              createText("鹦鹉螺结果稿 · 仅保留最终结论", {
                color: PALETTE.accent,
                size: 22,
              }),
            ],
          }),
          createInfoTable(meeting, brief),
          createSpacer(180),
          createHighlightPanel("执行摘要", brief.executiveSummary),
          createSectionHeading("最终拍板"),
          createBodyParagraph(brief.finalDecision),
          createSectionHeading("最佳方案说明"),
          createBodyParagraph(brief.bestPlan),
          createSectionHeading("胜出原因"),
          ...brief.winningReasons.map(item => createBulletParagraph(item)),
          createSectionHeading("执行动作"),
          createActionTable(brief.actionItems),
          createSectionHeading("备选方案与未采纳原因"),
          createRejectedTable(brief.rejectedAlternatives),
          createSectionHeading("风险提醒"),
          ...brief.riskAlerts.map(item => createBulletParagraph(item, PALETTE.accentDark)),
          createSpacer(180),
          createHighlightPanel("备注", brief.decisionNote, PALETTE.tealSoft, PALETTE.teal),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);
}

async function writeXlsx(filePath, meeting) {
  const brief = meeting.exportBrief;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STARCRAW";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = brief.reportTitle;
  workbook.subject = "鹦鹉螺会议结果稿";

  const overviewSheet = workbook.addWorksheet("决策总览");
  overviewSheet.columns = [
    { header: "字段", key: "field", width: 18 },
    { header: "内容", key: "value1", width: 22 },
    { header: "内容2", key: "value2", width: 22 },
    { header: "内容3", key: "value3", width: 22 },
    { header: "内容4", key: "value4", width: 22 },
    { header: "内容5", key: "value5", width: 22 },
  ];
  setWorksheetBase(overviewSheet);
  addWorksheetTitle(overviewSheet, brief.reportTitle, "鹦鹉螺整理的结果型导出内容，仅保留最终结论。");
  addKeyValueRow(overviewSheet, 4, "会议议题", meeting.topic, PALETTE.panel);
  addKeyValueRow(overviewSheet, 5, "导出时间", toDisplayTime(meeting.finishedAt), PALETTE.panel);
  addKeyValueRow(overviewSheet, 6, "建议主责", brief.ownerRecommendation, PALETTE.greenSoft);
  addKeyValueRow(overviewSheet, 8, "执行摘要", brief.executiveSummary, PALETTE.accentSoft);
  addKeyValueRow(overviewSheet, 10, "最终拍板", brief.finalDecision, PALETTE.white);
  addKeyValueRow(overviewSheet, 12, "最佳方案说明", brief.bestPlan, PALETTE.white);

  overviewSheet.mergeCells("A14:F14");
  overviewSheet.getCell("A14").value = "胜出原因";
  styleCell(overviewSheet.getCell("A14"), {
    fill: PALETTE.ink,
    color: PALETTE.white,
    bold: true,
    size: 11,
    horizontal: "left",
  });
  brief.winningReasons.forEach((reason, index) => {
    overviewSheet.mergeCells(`B${15 + index}:F${15 + index}`);
    overviewSheet.getCell(`A${15 + index}`).value = `原因 ${index + 1}`;
    overviewSheet.getCell(`B${15 + index}`).value = reason;
    styleCell(overviewSheet.getCell(`A${15 + index}`), { fill: PALETTE.sand, bold: true });
    styleCell(overviewSheet.getCell(`B${15 + index}`), {
      fill: index % 2 === 0 ? PALETTE.panel : PALETTE.white,
      horizontal: "left",
    });
  });

  overviewSheet.mergeCells(`A${16 + brief.winningReasons.length}:F${16 + brief.winningReasons.length}`);
  overviewSheet.getCell(`A${16 + brief.winningReasons.length}`).value = brief.decisionNote;
  styleCell(overviewSheet.getCell(`A${16 + brief.winningReasons.length}`), {
    fill: PALETTE.tealSoft,
    color: PALETTE.teal,
    size: 10,
    horizontal: "left",
  });

  const actionSheet = workbook.addWorksheet("执行清单");
  actionSheet.columns = [
    { header: "序号", key: "index", width: 10 },
    { header: "执行动作", key: "task", width: 38 },
    { header: "主责", key: "owner", width: 18 },
    { header: "时间节奏", key: "deadline", width: 16 },
    { header: "成功标志", key: "successMetric", width: 28 },
    { header: "备注", key: "note", width: 20 },
  ];
  setWorksheetBase(actionSheet);
  addWorksheetTitle(actionSheet, "执行清单", "优先展示拍板后的动作、主责与判断标准。");
  const actionHeaderRow = 4;
  actionSheet.getRow(actionHeaderRow).values = ["序号", "执行动作", "主责", "时间节奏", "成功标志", "备注"];
  actionSheet.getRow(actionHeaderRow).eachCell((cell) => {
    styleCell(cell, {
      fill: PALETTE.ink,
      color: PALETTE.white,
      bold: true,
      horizontal: "center",
    });
  });
  brief.actionItems.forEach((item, index) => {
    const rowNumber = actionHeaderRow + 1 + index;
    actionSheet.getRow(rowNumber).values = [
      index + 1,
      item.task,
      item.owner,
      item.deadline,
      item.successMetric,
      item.note || "",
    ];
    actionSheet.getRow(rowNumber).eachCell((cell, colNumber) => {
      styleCell(cell, {
        fill: index % 2 === 0 ? PALETTE.panel : PALETTE.white,
        color: colNumber === 3 ? PALETTE.teal : PALETTE.ink,
        bold: colNumber === 3,
        horizontal: colNumber === 1 ? "center" : "left",
      });
    });
  });

  const riskSheet = workbook.addWorksheet("风险与备选");
  riskSheet.columns = [
    { header: "分类", key: "type", width: 14 },
    { header: "名称", key: "name", width: 28 },
    { header: "说明", key: "detail", width: 56 },
  ];
  setWorksheetBase(riskSheet);
  addWorksheetTitle(riskSheet, "风险与备选", "保留结果层面的取舍说明，不写讨论过程。");
  riskSheet.getRow(4).values = ["分类", "名称", "说明"];
  riskSheet.getRow(4).eachCell((cell) => {
    styleCell(cell, {
      fill: PALETTE.ink,
      color: PALETTE.white,
      bold: true,
      horizontal: "center",
    });
  });

  let riskRow = 5;
  brief.rejectedAlternatives.forEach((item, index) => {
    riskSheet.getRow(riskRow).values = ["备选方向", item.option, item.reason];
    riskSheet.getRow(riskRow).eachCell((cell) => {
      styleCell(cell, {
        fill: index % 2 === 0 ? PALETTE.roseSoft : PALETTE.white,
        horizontal: "left",
      });
    });
    riskRow += 1;
  });

  brief.riskAlerts.forEach((item, index) => {
    riskSheet.getRow(riskRow).values = ["风险提醒", `提醒 ${index + 1}`, item];
    riskSheet.getRow(riskRow).eachCell((cell, colNumber) => {
      styleCell(cell, {
        fill: index % 2 === 0 ? PALETTE.tealSoft : PALETTE.white,
        color: colNumber === 1 ? PALETTE.teal : PALETTE.ink,
        bold: colNumber === 1,
        horizontal: "left",
      });
    });
    riskRow += 1;
  });

  await workbook.xlsx.writeFile(filePath);
}

function addSlideTitle(slide, badge, title, subtitle, accent = PALETTE.accent) {
  slide.addShape("roundRect", {
    x: 0.6,
    y: 0.52,
    w: 2.1,
    h: 0.36,
    rectRadius: 0.08,
    fill: { color: accent, transparency: 6 },
    line: { color: accent },
  });
  slide.addText(badge, {
    x: 0.88,
    y: 0.6,
    w: 1.5,
    h: 0.15,
    fontFace: DOC_FONT,
    fontSize: 10,
    bold: true,
    color: PALETTE.white,
  });
  slide.addText(title, {
    x: 0.7,
    y: 1.1,
    w: 8.8,
    h: 0.58,
    fontFace: DOC_FONT,
    fontSize: 24,
    bold: true,
    color: PALETTE.ink,
    margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.7,
      y: 1.72,
      w: 11.2,
      h: 0.48,
      fontFace: DOC_FONT,
      fontSize: 11,
      color: PALETTE.muted,
      margin: 0,
    });
  }
}

function addCard(slide, { x, y, w, h, fill = PALETTE.white, title, body, accent = PALETTE.accent, bodySize = 14 }) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: fill },
    line: { color: PALETTE.border, pt: 1 },
    shadow: { type: "outer", color: PALETTE.border, blur: 1, angle: 45, distance: 1, opacity: 0.12 },
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.18,
    w: w - 0.44,
    h: 0.22,
    fontFace: DOC_FONT,
    fontSize: 10.5,
    bold: true,
    color: accent,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.5,
    w: w - 0.44,
    h: h - 0.65,
    fontFace: DOC_FONT,
    fontSize: bodySize,
    color: PALETTE.ink,
    margin: 0,
    valign: "top",
  });
}

function addBulletList(slide, bullets, x, y, w, h, color = PALETTE.ink, fontSize = 14) {
  slide.addText(
    bullets.map(item => ({
      text: item,
      options: { bullet: { indent: 18 } },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: DOC_FONT,
      fontSize,
      color,
      breakLine: true,
      margin: 0.02,
      paraSpaceAfterPt: 10,
      valign: "top",
    },
  );
}

async function writePptx(filePath, meeting) {
  const brief = meeting.exportBrief;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "STARCRAW";
  pptx.company = "STARCRAW";
  pptx.subject = "鹦鹉螺会议结果稿";
  pptx.title = brief.reportTitle;
  pptx.theme = {
    headFontFace: DOC_FONT,
    bodyFontFace: DOC_FONT,
    lang: "zh-CN",
  };

  const cover = pptx.addSlide();
  cover.background = { color: PALETTE.ink };
  cover.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: PALETTE.ink },
    line: { color: PALETTE.ink },
  });
  cover.addShape("roundRect", {
    x: 0.72,
    y: 0.72,
    w: 2.45,
    h: 0.38,
    rectRadius: 0.08,
    fill: { color: PALETTE.accent, transparency: 4 },
    line: { color: PALETTE.accent },
  });
  cover.addText("鹦鹉螺结果稿", {
    x: 1.02,
    y: 0.8,
    w: 1.8,
    h: 0.16,
    fontFace: DOC_FONT,
    fontSize: 11,
    bold: true,
    color: PALETTE.white,
  });
  cover.addText(brief.reportTitle, {
    x: 0.78,
    y: 1.52,
    w: 8.8,
    h: 1.1,
    fontFace: DOC_FONT,
    fontSize: 28,
    bold: true,
    color: PALETTE.white,
    margin: 0,
  });
  cover.addText(brief.executiveSummary, {
    x: 0.82,
    y: 3.08,
    w: 8.2,
    h: 0.95,
    fontFace: DOC_FONT,
    fontSize: 14,
    color: PALETTE.accentSoft,
    margin: 0,
  });
  cover.addText(`会议议题：${meeting.topic}`, {
    x: 0.82,
    y: 5.72,
    w: 5.8,
    h: 0.24,
    fontFace: DOC_FONT,
    fontSize: 11,
    color: "D6DEE8",
  });
  cover.addText(`导出时间：${toDisplayTime(meeting.finishedAt)}`, {
    x: 0.82,
    y: 6.05,
    w: 5.8,
    h: 0.24,
    fontFace: DOC_FONT,
    fontSize: 11,
    color: "D6DEE8",
  });

  const summarySlide = pptx.addSlide();
  summarySlide.background = { color: PALETTE.panel };
  addSlideTitle(summarySlide, "决策摘要", "本次会议拍板结果", "只保留结果层信息，不展示辩论过程。");
  addCard(summarySlide, {
    x: 0.72,
    y: 2.34,
    w: 6.2,
    h: 2.05,
    fill: PALETTE.accentSoft,
    title: "最终拍板",
    body: brief.finalDecision,
    accent: PALETTE.accentDark,
    bodySize: 16,
  });
  addCard(summarySlide, {
    x: 7.18,
    y: 2.34,
    w: 2.35,
    h: 2.05,
    fill: PALETTE.greenSoft,
    title: "建议主责",
    body: brief.ownerRecommendation,
    accent: PALETTE.green,
    bodySize: 15,
  });
  addCard(summarySlide, {
    x: 9.82,
    y: 2.34,
    w: 2.72,
    h: 2.05,
    fill: PALETTE.white,
    title: "导出时间",
    body: toDisplayTime(meeting.finishedAt),
    accent: PALETTE.teal,
    bodySize: 14,
  });
  addCard(summarySlide, {
    x: 0.72,
    y: 4.68,
    w: 11.82,
    h: 1.65,
    fill: PALETTE.white,
    title: "执行摘要",
    body: brief.executiveSummary,
    accent: PALETTE.teal,
    bodySize: 15,
  });

  const planSlide = pptx.addSlide();
  planSlide.background = { color: "FFFDF8" };
  addSlideTitle(planSlide, "最佳方案", "为什么这一方案胜出", "保留单一最佳方向，并说明胜出逻辑。", PALETTE.teal);
  addCard(planSlide, {
    x: 0.72,
    y: 2.18,
    w: 5.5,
    h: 3.86,
    fill: PALETTE.white,
    title: "最佳方案说明",
    body: brief.bestPlan,
    accent: PALETTE.teal,
    bodySize: 15,
  });
  addCard(planSlide, {
    x: 6.52,
    y: 2.18,
    w: 6.02,
    h: 3.86,
    fill: PALETTE.panel,
    title: "胜出原因",
    body: "",
    accent: PALETTE.accent,
  });
  addBulletList(planSlide, brief.winningReasons, 6.8, 2.72, 5.45, 3.0);

  const actionSlide = pptx.addSlide();
  actionSlide.background = { color: PALETTE.panel };
  addSlideTitle(actionSlide, "执行动作", "拍板后立即推进的 3 件事", "每项动作都对应主责、节奏与结果标准。", PALETTE.accent);
  brief.actionItems.slice(0, 3).forEach((item, index) => {
    addCard(actionSlide, {
      x: 0.72 + index * 4.12,
      y: 2.18,
      w: 3.78,
      h: 3.96,
      fill: index === 0 ? PALETTE.accentSoft : index === 1 ? PALETTE.tealSoft : PALETTE.white,
      title: `动作 ${index + 1}`,
      body: `${item.task}\n\n主责：${item.owner}\n节奏：${item.deadline}\n成功标志：${item.successMetric}`,
      accent: index === 1 ? PALETTE.teal : PALETTE.accentDark,
      bodySize: 14,
    });
  });

  const riskSlide = pptx.addSlide();
  riskSlide.background = { color: "FFFDF8" };
  addSlideTitle(riskSlide, "风险与备选", "决策边界与未采纳方向", brief.decisionNote, PALETTE.teal);
  addCard(riskSlide, {
    x: 0.72,
    y: 2.18,
    w: 5.7,
    h: 3.9,
    fill: PALETTE.white,
    title: "风险提醒",
    body: "",
    accent: PALETTE.accent,
  });
  addBulletList(riskSlide, brief.riskAlerts, 1.0, 2.72, 5.1, 2.95, PALETTE.ink, 14);
  addCard(riskSlide, {
    x: 6.72,
    y: 2.18,
    w: 5.82,
    h: 3.9,
    fill: PALETTE.panel,
    title: "未采纳方向",
    body: "",
    accent: PALETTE.teal,
  });
  addBulletList(
    riskSlide,
    brief.rejectedAlternatives.map(item => `${item.option}：${item.reason}`),
    7.0,
    2.72,
    5.25,
    2.95,
    PALETTE.ink,
    13,
  );

  await pptx.writeFile({ fileName: filePath });
}

export async function exportMeetingDocument({ format, meeting }) {
  if (!["docx", "xlsx", "pptx"].includes(format)) {
    throw new Error("不支持的导出格式");
  }

  const normalizedMeeting = {
    topic: cleanText(meeting?.topic),
    summary: cleanText(meeting?.summary),
    speeches: normalizeSpeeches(meeting?.speeches),
    finishedAt: meeting?.finishedAt ?? Date.now(),
  };

  if (!normalizedMeeting.topic) {
    throw new Error("会议主题不能为空");
  }
  if (!normalizedMeeting.summary) {
    throw new Error("会议结论不能为空");
  }

  normalizedMeeting.exportBrief = normalizeMeetingExportBrief(meeting?.exportBrief, normalizedMeeting);

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

export async function saveMeetingDocumentToLocalLibrary(fileResult, options = {}) {
  if (!fileResult?.filePath || !fileResult?.fileName) {
    throw new Error("会议导出文件不存在，无法保存到本地目录");
  }

  const targetDir = resolveMeetingLocalExportDir(options.outputDir);
  await fs.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, fileResult.fileName);
  await fs.copyFile(fileResult.filePath, targetPath);

  return {
    directory: targetDir,
    filePath: targetPath,
    fileName: fileResult.fileName,
  };
}
