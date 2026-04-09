import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { createRequire } from "module";
import ExcelJS from "exceljs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const MIME_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const TEMP_EXPORT_DIR = path.join(os.tmpdir(), "xiaolongxia-ai", "documents");

function sanitizeFileName(input) {
  return String(input || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "document";
}

function resolveOutputDirectory(outputDir) {
  const homeDir = os.homedir();
  const normalized = String(outputDir || "desktop").trim().toLowerCase();

  if (normalized === "documents" || normalized === "document") {
    return path.join(homeDir, "Documents");
  }
  if (normalized === "downloads" || normalized === "download") {
    return path.join(homeDir, "Downloads");
  }
  if (normalized === "temp" || normalized === "tmp") {
    return TEMP_EXPORT_DIR;
  }
  return path.join(homeDir, "Desktop");
}

async function ensureOutputDirectory(outputDir) {
  const targetDir = resolveOutputDirectory(outputDir);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

function buildOutputPath(fileName, outputDir, extension) {
  const normalizedExtension = String(extension || "").replace(/^\./, "");
  const normalizedFileName = sanitizeFileName(fileName);
  return path.join(outputDir, `${normalizedFileName}.${normalizedExtension}`);
}

function buildBodyParagraphs(text, headingLevel = HeadingLevel.HEADING_1) {
  const normalized = String(text || "").replace(/\r/g, "").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const paragraphs = [];

  for (const block of blocks) {
    if (/^#{1,3}\s+/.test(block)) {
      const levelCount = block.match(/^#+/)?.[0].length ?? 1;
      const headingText = block.replace(/^#{1,3}\s+/, "").trim();
      const level =
        levelCount >= 3 ? HeadingLevel.HEADING_3
          : levelCount === 2 ? HeadingLevel.HEADING_2
            : headingLevel;
      paragraphs.push(new Paragraph({
        heading: level,
        spacing: { before: 200, after: 120 },
        children: [new TextRun(headingText || "未命名章节")],
      }));
      continue;
    }

    const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
    if (lines.every(line => /^[-*•]\s+/.test(line))) {
      for (const line of lines) {
        paragraphs.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [new TextRun(line.replace(/^[-*•]\s+/, "").trim())],
        }));
      }
      continue;
    }

    paragraphs.push(new Paragraph({
      spacing: { after: 160, line: 320 },
      children: [new TextRun(lines.join("\n"))],
    }));
  }

  return paragraphs;
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section, index) => ({
      heading: String(section?.heading ?? "").trim() || `章节 ${index + 1}`,
      body: String(section?.body ?? "").trim(),
    }))
    .filter(section => section.body);
}

function normalizeWorkbookSheets(sheets, fallbackTitle) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return [
      {
        name: "Summary",
        notes: String(fallbackTitle || "").trim(),
        columns: [],
        rows: [],
      },
    ];
  }

  return sheets.map((sheet, index) => ({
    name: sanitizeFileName(sheet?.name || `Sheet-${index + 1}`).slice(0, 31) || `Sheet${index + 1}`,
    notes: String(sheet?.notes || "").trim(),
    columns: Array.isArray(sheet?.columns)
      ? sheet.columns.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
  }));
}

function normalizeSlideList(slides, fallbackTitle, fallbackSummary) {
  const normalizedSlides = Array.isArray(slides) ? slides : [];
  const mapped = normalizedSlides
    .map((slide, index) => ({
      title: String(slide?.title || "").trim() || `Slide ${index + 1}`,
      body: String(slide?.body || "").trim(),
      bullets: Array.isArray(slide?.bullets)
        ? slide.bullets.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      note: String(slide?.note || "").trim(),
      accent: String(slide?.accent || "").trim(),
    }))
    .filter(slide => slide.body || slide.bullets.length > 0 || slide.note);

  if (mapped.length > 0) return mapped;

  return [
    {
      title: fallbackTitle || "Overview",
      body: String(fallbackSummary || "").trim(),
      bullets: [],
      note: "",
      accent: "",
    },
  ];
}

export async function exportWordDocument({
  title,
  summary = "",
  content = "",
  sections = [],
  fileName,
  outputDir = "desktop",
}) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    throw new Error("文档标题不能为空");
  }

  const normalizedSummary = String(summary || "").trim();
  const normalizedContent = String(content || "").trim();
  const normalizedSections = normalizeSections(sections);

  if (!normalizedSummary && !normalizedContent && normalizedSections.length === 0) {
    throw new Error("文档内容不能为空");
  }

  const targetDir = await ensureOutputDirectory(outputDir);

  const resolvedFileName = `${sanitizeFileName(fileName || normalizedTitle)}.docx`;
  const filePath = buildOutputPath(fileName || normalizedTitle, targetDir, "docx");

  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 220 },
      children: [new TextRun(normalizedTitle)],
    }),
  ];

  if (normalizedSummary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 160, after: 120 },
        children: [new TextRun("摘要")],
      }),
      ...buildBodyParagraphs(normalizedSummary, HeadingLevel.HEADING_2),
    );
  }

  if (normalizedContent) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 160, after: 120 },
        children: [new TextRun("正文")],
      }),
      ...buildBodyParagraphs(normalizedContent, HeadingLevel.HEADING_2),
    );
  }

  for (const section of normalizedSections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 220, after: 120 },
        children: [new TextRun(section.heading)],
      }),
      ...buildBodyParagraphs(section.body, HeadingLevel.HEADING_2),
    );
  }

  const doc = new Document({
    creator: "STARCRAW",
    title: normalizedTitle,
    description: "STARCRAW document export",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    fileName: resolvedFileName,
    directory: targetDir,
    mimeType: MIME_TYPES.docx,
  };
}

export async function exportExcelDocument({
  title,
  summary = "",
  sheets = [],
  fileName,
  outputDir = "desktop",
}) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    throw new Error("Excel 标题不能为空");
  }

  const targetDir = await ensureOutputDirectory(outputDir);
  const resolvedFileName = `${sanitizeFileName(fileName || normalizedTitle)}.xlsx`;
  const filePath = buildOutputPath(fileName || normalizedTitle, targetDir, "xlsx");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "STARCRAW";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = normalizedTitle;
  workbook.subject = normalizedTitle;

  const normalizedSheets = normalizeWorkbookSheets(sheets, summary || normalizedTitle);

  normalizedSheets.forEach((sheet, sheetIndex) => {
    const worksheet = workbook.addWorksheet(sheet.name || `Sheet${sheetIndex + 1}`);
    let currentRow = 1;

    worksheet.getCell(`A${currentRow}`).value = normalizedTitle;
    worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 15, bold: true, color: { argb: "1F2937" } };
    currentRow += 2;

    if (sheet.notes) {
      sheet.notes.split(/\r?\n/).filter(Boolean).forEach((line) => {
        worksheet.getCell(`A${currentRow}`).value = line;
        worksheet.getCell(`A${currentRow}`).font = { name: "Arial", size: 11, color: { argb: "475569" } };
        currentRow += 1;
      });
      currentRow += 1;
    }

    const objectRows = sheet.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
    const rowColumns = objectRows.length > 0
      ? Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))))
      : [];
    const columns = sheet.columns.length > 0 ? sheet.columns : rowColumns;

    if (columns.length > 0) {
      worksheet.columns = columns.map((column) => ({
        header: column,
        key: column,
        width: Math.min(36, Math.max(14, String(column).length + 6)),
      }));
      worksheet.spliceRows(currentRow, 0, columns);
      const headerRow = worksheet.getRow(currentRow);
      headerRow.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F766E" } };
        cell.border = {
          top: { style: "thin", color: { argb: "D1D5DB" } },
          left: { style: "thin", color: { argb: "D1D5DB" } },
          bottom: { style: "thin", color: { argb: "D1D5DB" } },
          right: { style: "thin", color: { argb: "D1D5DB" } },
        };
      });
      currentRow += 1;
    }

    sheet.rows.forEach((row) => {
      if (Array.isArray(row)) {
        const inserted = worksheet.getRow(currentRow);
        row.forEach((value, index) => {
          inserted.getCell(index + 1).value = value;
        });
        currentRow += 1;
        return;
      }

      if (row && typeof row === "object" && columns.length > 0) {
        const inserted = worksheet.getRow(currentRow);
        columns.forEach((column, index) => {
          inserted.getCell(index + 1).value = row[column] ?? "";
        });
        currentRow += 1;
      }
    });

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.font = rowNumber === 1
          ? cell.font
          : { ...(cell.font ?? {}), name: "Arial", size: 10.5, color: { argb: "111827" } };
        cell.alignment = { vertical: "top", wrapText: true };
        if (rowNumber >= currentRow && columns.length > 0) return;
        if (rowNumber > 1 && rowNumber >= currentRow - sheet.rows.length) {
          cell.border = {
            top: { style: "thin", color: { argb: "E5E7EB" } },
            left: { style: "thin", color: { argb: "E5E7EB" } },
            bottom: { style: "thin", color: { argb: "E5E7EB" } },
            right: { style: "thin", color: { argb: "E5E7EB" } },
          };
        }
      });
    });

    worksheet.views = [{ state: "frozen", ySplit: columns.length > 0 ? Math.max(0, currentRow - sheet.rows.length - 1) : 0 }];
  });

  await workbook.xlsx.writeFile(filePath);

  return {
    filePath,
    fileName: resolvedFileName,
    directory: targetDir,
    mimeType: MIME_TYPES.xlsx,
  };
}

function addPresentationCover(pptx, title, subtitle) {
  const slide = pptx.addSlide();
  slide.background = { color: "0F172A" };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    fill: { color: "0F172A" },
    line: { color: "0F172A" },
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 0.8,
    w: 2.1,
    h: 0.35,
    rectRadius: 0.08,
    fill: { color: "14B8A6", transparency: 6 },
    line: { color: "14B8A6" },
  });
  slide.addText("STARCRAW", {
    x: 0.95,
    y: 0.86,
    w: 1.4,
    h: 0.18,
    fontFace: "Arial",
    fontSize: 10,
    bold: true,
    color: "E2E8F0",
  });
  slide.addText(title, {
    x: 0.9,
    y: 1.6,
    w: 8.9,
    h: 1.5,
    fontFace: "Arial",
    fontSize: 28,
    bold: true,
    color: "F8FAFC",
    margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.95,
      y: 3.2,
      w: 8.4,
      h: 1.0,
      fontFace: "Arial",
      fontSize: 13,
      color: "CBD5E1",
      breakLine: false,
      margin: 0,
    });
  }
}

function addPresentationContentSlide(pptx, slideData, index) {
  const slide = pptx.addSlide();
  slide.background = { color: index % 2 === 0 ? "F8FAFC" : "EFF6FF" };
  const accent = slideData.accent || (index % 2 === 0 ? "0F766E" : "2563EB");

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 0.65,
    w: 0.22,
    h: 0.75,
    rectRadius: 0.06,
    fill: { color: accent },
    line: { color: accent },
  });
  slide.addText(slideData.title, {
    x: 1.05,
    y: 0.72,
    w: 8.8,
    h: 0.5,
    fontFace: "Arial",
    fontSize: 23,
    bold: true,
    color: "0F172A",
    margin: 0,
  });

  if (slideData.body) {
    slide.addText(slideData.body, {
      x: 1.05,
      y: 1.45,
      w: 5.3,
      h: 1.2,
      fontFace: "Arial",
      fontSize: 13,
      color: "334155",
      valign: "top",
      margin: 0.02,
    });
  }

  if (slideData.bullets.length > 0) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 6.85,
      y: 1.42,
      w: 5.0,
      h: 4.9,
      rectRadius: 0.08,
      fill: { color: "FFFFFF" },
      line: { color: "CBD5E1", pt: 1 },
      shadow: { type: "outer", color: "CBD5E1", blur: 1, angle: 45, distance: 1, opacity: 0.16 },
    });
    slide.addText(slideData.bullets.map(item => ({ text: item, options: { bullet: { indent: 14 } } })), {
      x: 7.15,
      y: 1.78,
      w: 4.45,
      h: 4.15,
      fontFace: "Arial",
      fontSize: 14,
      color: "0F172A",
      breakLine: true,
      margin: 0.02,
      paraSpaceAfterPt: 10,
      valign: "top",
    });
  }

  if (slideData.note) {
    slide.addText(slideData.note, {
      x: 1.05,
      y: 5.85,
      w: 5.5,
      h: 0.6,
      fontFace: "Arial",
      fontSize: 10.5,
      color: accent,
      italic: true,
      margin: 0,
    });
  }
}

export async function exportPresentationDocument({
  title,
  subtitle = "",
  slides = [],
  fileName,
  outputDir = "desktop",
}) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    throw new Error("PPT 标题不能为空");
  }

  const normalizedSubtitle = String(subtitle || "").trim();
  const normalizedSlides = normalizeSlideList(slides, normalizedTitle, normalizedSubtitle);
  const targetDir = await ensureOutputDirectory(outputDir);
  const resolvedFileName = `${sanitizeFileName(fileName || normalizedTitle)}.pptx`;
  const filePath = buildOutputPath(fileName || normalizedTitle, targetDir, "pptx");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "STARCRAW";
  pptx.company = "STARCRAW";
  pptx.subject = normalizedTitle;
  pptx.title = normalizedTitle;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
    lang: "zh-CN",
  };

  addPresentationCover(pptx, normalizedTitle, normalizedSubtitle);
  normalizedSlides.forEach((slide, index) => addPresentationContentSlide(pptx, slide, index));

  await pptx.writeFile({ fileName: filePath });

  return {
    filePath,
    fileName: resolvedFileName,
    directory: targetDir,
    mimeType: MIME_TYPES.pptx,
  };
}
