import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const MAX_ATTACHMENT_COUNT = 4;
const MAX_TEXT_CHARS = 12000;
const MAX_XLSX_ROWS = 10;
const MAX_XLSX_COLUMNS = 6;

function truncateText(text, maxChars = MAX_TEXT_CHARS) {
  const normalized = String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return { text: "", truncated: false };
  }

  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }

  return {
    text: `${normalized.slice(0, maxChars)}\n\n[内容已截断，共 ${normalized.length.toLocaleString()} 个字符]`,
    truncated: true,
  };
}

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, raw) => String.fromCodePoint(Number.parseInt(raw, 10)));
}

function extractXmlText(xml, paragraphClosingTagPattern) {
  const withParagraphBreaks = String(xml || "").replace(paragraphClosingTagPattern, "\n");
  return decodeXmlEntities(
    withParagraphBreaks
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n"),
  );
}

function normalizeAttachment(item) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name || "").trim();
  const extension = String(item.extension || "").trim().toLowerCase();
  const transport = String(item.transport || "").trim().toLowerCase();
  if (!name || !transport) return null;

  return {
    id: String(item.id || "").trim(),
    name,
    size: Number(item.size || 0),
    type: String(item.type || "").trim(),
    kind: String(item.kind || "").trim(),
    lastModified: Number(item.lastModified || 0),
    extension,
    transport,
    textContent: typeof item.textContent === "string" ? item.textContent : "",
    dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : "",
    binaryBase64: typeof item.binaryBase64 === "string" ? item.binaryBase64 : "",
    truncated: Boolean(item.truncated),
    note: typeof item.note === "string" ? item.note : "",
  };
}

function parseDataUrl(raw) {
  const match = String(raw || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mediaType: match[1],
    base64: match[2],
  };
}

async function parseDocxAttachment(attachment) {
  const zip = await JSZip.loadAsync(Buffer.from(attachment.binaryBase64, "base64"));
  const candidateFiles = Object.keys(zip.files)
    .filter((name) =>
      name === "word/document.xml"
      || /^word\/header\d+\.xml$/i.test(name)
      || /^word\/footer\d+\.xml$/i.test(name),
    )
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const sections = [];
  for (const fileName of candidateFiles) {
    const file = zip.file(fileName);
    if (!file) continue;
    const xml = await file.async("string");
    const text = extractXmlText(xml, /<\/w:p>/gi);
    if (text.trim()) {
      sections.push(text.trim());
    }
  }

  const { text, truncated } = truncateText(sections.join("\n\n"));
  return {
    text,
    truncated,
    note: truncated ? "已从 docx 中提取正文并按长度截断。" : "已从 docx 中提取正文。",
  };
}

async function parsePptxAttachment(attachment) {
  const zip = await JSZip.loadAsync(Buffer.from(attachment.binaryBase64, "base64"));
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  const slides = [];
  for (const [index, fileName] of slideFiles.entries()) {
    const file = zip.file(fileName);
    if (!file) continue;
    const xml = await file.async("string");
    const slideText = extractXmlText(xml, /<\/a:p>/gi);
    if (slideText.trim()) {
      slides.push(`Slide ${index + 1}:\n${slideText.trim()}`);
    }
  }

  const { text, truncated } = truncateText(slides.join("\n\n"));
  return {
    text,
    truncated,
    note: truncated ? "已从 pptx 中提取文本并按长度截断。" : "已从 pptx 中提取幻灯片文本。",
  };
}

async function parseXlsxAttachment(attachment) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(attachment.binaryBase64, "base64"));

  const sheetSummaries = [];
  workbook.eachSheet((worksheet) => {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_XLSX_ROWS) return;
      const values = row.values.slice(1, MAX_XLSX_COLUMNS + 1)
        .map((value) => {
          if (value === null || value === undefined) return "";
          if (typeof value === "object") {
            if ("text" in value && typeof value.text === "string") return value.text;
            if ("result" in value && value.result !== undefined) return String(value.result);
            if ("formula" in value && typeof value.formula === "string") return `=${value.formula}`;
          }
          return String(value);
        })
        .map((value) => value.trim())
        .filter(Boolean);

      if (values.length > 0) {
        rows.push(`- ${values.join(" | ")}`);
      }
    });

    if (rows.length > 0) {
      sheetSummaries.push(`Sheet ${worksheet.name}:\n${rows.join("\n")}`);
    }
  });

  const { text, truncated } = truncateText(sheetSummaries.join("\n\n"));
  return {
    text,
    truncated,
    note: truncated
      ? "已从 xlsx 中提取工作表预览并按长度截断。"
      : "已从 xlsx 中提取工作表预览。",
  };
}

async function parsePdfAttachment(attachment) {
  const parser = new PDFParse({
    data: Buffer.from(attachment.binaryBase64, "base64"),
  });

  try {
    const result = await parser.getText();
    const { text, truncated } = truncateText(result?.text || "");
    return {
      text,
      truncated,
      note: truncated ? "已从 PDF 中提取正文并按长度截断。" : "已从 PDF 中提取正文。",
    };
  } finally {
    await parser.destroy();
  }
}

async function parseBinaryAttachment(attachment) {
  if (!attachment.binaryBase64) {
    return { text: "", note: attachment.note || "未收到可解析的二进制内容。" };
  }

  if (attachment.extension === "docx") return parseDocxAttachment(attachment);
  if (attachment.extension === "xlsx") return parseXlsxAttachment(attachment);
  if (attachment.extension === "pptx") return parsePptxAttachment(attachment);
  if (attachment.extension === "pdf") return parsePdfAttachment(attachment);

  return {
    text: "",
    note: attachment.note || `当前还不支持解析 ${attachment.extension || "该类型"} 附件。`,
  };
}

export async function buildAttachmentUserContentBlocks(rawAttachments = []) {
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map(normalizeAttachment).filter(Boolean).slice(0, MAX_ATTACHMENT_COUNT)
    : [];

  if (attachments.length === 0) {
    return [];
  }

  const blocks = [
    {
      type: "text",
      text: "以下是用户随本轮消息附带的文件上下文。请把它们当成当前任务的正式输入，而不是只把文件名当参考。",
    },
  ];
  const unresolvedNotes = [];

  for (const attachment of attachments) {
    if (attachment.transport === "text" && attachment.textContent) {
      blocks.push({
        type: "text",
        text: [
          `附件《${attachment.name}》内容${attachment.truncated ? "（已截断）" : ""}：`,
          attachment.textContent,
        ].join("\n"),
      });
      continue;
    }

    if (attachment.transport === "image" && attachment.dataUrl) {
      const parsed = parseDataUrl(attachment.dataUrl);
      if (parsed?.base64) {
        blocks.push({
          type: "text",
          text: `用户上传了图片附件《${attachment.name}》。请结合图片内容理解需求，并在回答中引用你从图里识别出的关键信息。`,
        });
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: parsed.mediaType || "image/png",
            data: parsed.base64,
          },
        });
        continue;
      }
    }

    if (attachment.transport === "binary") {
      try {
        const parsed = await parseBinaryAttachment(attachment);
        if (parsed.text) {
          blocks.push({
            type: "text",
            text: [
              `附件《${attachment.name}》解析结果：`,
              parsed.note ? `说明：${parsed.note}` : "",
              parsed.text,
            ].filter(Boolean).join("\n"),
          });
          continue;
        }
        unresolvedNotes.push(`- ${attachment.name}：${parsed.note || "未能提取正文。"}`);
        continue;
      } catch (error) {
        unresolvedNotes.push(`- ${attachment.name}：解析失败，${error?.message || error}`);
        continue;
      }
    }

    unresolvedNotes.push(`- ${attachment.name}：${attachment.note || "当前仅附带文件元数据，未解析正文。"}`);
  }

  if (unresolvedNotes.length > 0) {
    blocks.push({
      type: "text",
      text: ["以下附件暂未完整解析：", ...unresolvedNotes].join("\n"),
    });
  }

  return blocks;
}
