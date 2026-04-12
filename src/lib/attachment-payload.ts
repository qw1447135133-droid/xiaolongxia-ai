export type DispatchAttachmentTransport = "text" | "image" | "binary" | "metadata";

export type DispatchAttachmentPayload = {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: string;
  lastModified: number;
  extension: string;
  transport: DispatchAttachmentTransport;
  textContent?: string;
  dataUrl?: string;
  binaryBase64?: string;
  truncated?: boolean;
  note?: string;
};

const TEXT_ATTACHMENT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "log"]);
const BINARY_ATTACHMENT_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "pdf"]);
const LEGACY_OFFICE_EXTENSIONS = new Set(["doc", "xls", "ppt"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z"]);
const MAX_INLINE_TEXT_CHARS = 12000;
const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MAX_INLINE_BINARY_BYTES = 2_000_000;

function getFileExtension(name: string) {
  const normalized = String(name || "").trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index + 1) : "";
}

function truncateTextContent(text: string, maxChars = MAX_INLINE_TEXT_CHARS) {
  const normalized = String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export async function serializeAttachmentForDispatch({
  id,
  file,
  kind,
}: {
  id: string;
  file: File;
  kind: string;
}): Promise<DispatchAttachmentPayload> {
  const extension = getFileExtension(file.name);
  const basePayload: Omit<DispatchAttachmentPayload, "transport"> = {
    id,
    name: file.name,
    size: file.size,
    type: file.type,
    kind,
    lastModified: file.lastModified,
    extension,
  };

  if (kind === "image" && file.size <= MAX_INLINE_IMAGE_BYTES) {
    return {
      ...basePayload,
      transport: "image",
      dataUrl: await readFileAsDataUrl(file),
    };
  }

  if (kind === "image") {
    return {
      ...basePayload,
      transport: "metadata",
      note: "图片体积过大，当前未内联到会话。建议压缩到 1.5 MB 以内后再上传。",
    };
  }

  if (file.type.startsWith("text/") || TEXT_ATTACHMENT_EXTENSIONS.has(extension)) {
    const { text, truncated } = truncateTextContent(await file.text());
    return {
      ...basePayload,
      transport: "text",
      textContent: text,
      truncated,
      note: truncated ? "文本附件已按长度截断。" : undefined,
    };
  }

  if (BINARY_ATTACHMENT_EXTENSIONS.has(extension)) {
    if (file.size > MAX_INLINE_BINARY_BYTES) {
      return {
        ...basePayload,
        transport: "metadata",
        note: "文件体积过大，当前未发送正文。建议压缩到 2 MB 以内后再上传。",
      };
    }

    return {
      ...basePayload,
      transport: "binary",
      binaryBase64: arrayBufferToBase64(await file.arrayBuffer()),
    };
  }

  if (LEGACY_OFFICE_EXTENSIONS.has(extension)) {
    return {
      ...basePayload,
      transport: "metadata",
      note: "旧版 Office 文件暂不支持直接解析，请另存为 docx / xlsx / pptx 后再上传。",
    };
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return {
      ...basePayload,
      transport: "metadata",
      note: "压缩包不会自动展开读取，请解压后上传具体文件。",
    };
  }

  return {
    ...basePayload,
    transport: "metadata",
    note: "当前文件类型还没有可读解析器，已仅附带文件名和元数据。",
  };
}
