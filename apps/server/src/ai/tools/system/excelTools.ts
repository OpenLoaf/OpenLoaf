import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import * as xlsx from "xlsx";
import { fileReadExcelToolDef } from "@tenas-ai/api/types/tools/system";
import { saveChatBinaryAttachment } from "@/ai/chat-stream/attachmentResolver";
import {
  getProjectId,
  getSessionId,
  getWorkspaceId,
} from "@/ai/chat-stream/requestContext";
import { resolveProjectPath } from "@/ai/tools/system/projectPath";
import { ensureFile } from "@/ai/tools/system/fileTools";
import {
  extractZipImages,
  type ZipImageEntry,
} from "@/ai/tools/system/zipImageExtractor";

/** Max bytes for reading an Excel file. */
const MAX_EXCEL_BYTES = 20 * 1024 * 1024;
/** Max characters returned from Excel text extraction. */
const MAX_EXCEL_TEXT_CHARS = 200_000;
/** Max rows extracted per sheet. */
const MAX_EXCEL_ROWS = 2000;
/** Max columns extracted per row. */
const MAX_EXCEL_COLS = 200;
/** Max images extracted from Excel. */
const MAX_EXCEL_IMAGE_COUNT = 20;
/** Max total bytes for Excel images. */
const MAX_EXCEL_IMAGE_TOTAL_BYTES = 10 * 1024 * 1024;
/** Supported Excel file extensions. */
const SUPPORTED_EXCEL_EXTS = new Set([".xlsx", ".xls", ".xlsm"]);

type ChatAttachmentContext = {
  /** Workspace id. */
  workspaceId?: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
};

type ChatAttachmentInfo = {
  /** Attachment url. */
  url: string;
  /** Attachment media type. */
  mediaType: string;
  /** Stored file name. */
  fileName: string;
  /** Relative path from root. */
  relativePath: string;
  /** File size in bytes. */
  bytes: number;
};

/** Excel read tool output. */
type FileReadExcelToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Project-relative file path. */
    path: string;
    /** File size in bytes. */
    bytes: number;
    /** Extracted plain text. */
    text: string;
    /** Whether output was truncated. */
    truncated: boolean;
    /** Sheet names. */
    sheetNames: string[];
    /** Extracted image attachments. */
    images: ChatAttachmentInfo[];
    /** Whether image extraction was truncated. */
    imagesTruncated: boolean;
  };
};

/** Normalize a single cell value. */
function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Build plain text from Excel workbook. */
function buildExcelText(workbook: xlsx.WorkBook): { text: string; truncated: boolean } {
  const parts: string[] = [];
  let truncated = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    parts.push(`# Sheet: ${sheetName}`);
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const limitedRows = rows.slice(0, MAX_EXCEL_ROWS);
    if (rows.length > limitedRows.length) truncated = true;

    for (const row of limitedRows) {
      const limitedRow = Array.isArray(row) ? row.slice(0, MAX_EXCEL_COLS) : [];
      if (Array.isArray(row) && row.length > limitedRow.length) truncated = true;
      const line = limitedRow.map(normalizeCellValue).join("\t");
      parts.push(line);
    }
  }

  let text = parts.join("\n");
  if (text.length > MAX_EXCEL_TEXT_CHARS) {
    // 逻辑：输出长度超出上限时截断，避免响应过大。
    text = text.slice(0, MAX_EXCEL_TEXT_CHARS);
    truncated = true;
  }
  return { text, truncated };
}

/** Resolve chat attachment context for saving extracted files. */
function resolveChatAttachmentContext(): ChatAttachmentContext {
  const sessionId = getSessionId();
  if (!sessionId) {
    throw new Error("sessionId is required.");
  }
  const workspaceId = getWorkspaceId() ?? undefined;
  const projectId = getProjectId() ?? undefined;
  if (!projectId && !workspaceId) {
    throw new Error("workspaceId is required when projectId is missing.");
  }
  return {
    sessionId,
    workspaceId,
    projectId,
  };
}

/** Load Excel file buffer with size guards. */
async function loadExcelBuffer(
  absPath: string,
): Promise<{ buffer: Buffer; bytes: number; ext: string }> {
  const stat = await ensureFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  if (!SUPPORTED_EXCEL_EXTS.has(ext)) {
    throw new Error("Only .xlsx/.xls/.xlsm files are supported.");
  }
  // 逻辑：限制文件大小，避免解析超大 Excel。
  if (stat.size > MAX_EXCEL_BYTES) {
    throw new Error("Excel file too large.");
  }
  const buffer = await fs.readFile(absPath);
  return { buffer, bytes: stat.size, ext };
}

/** Save extracted images into chat attachment storage. */
async function saveExtractedImages(input: {
  images: ZipImageEntry[];
  context: ChatAttachmentContext;
}): Promise<ChatAttachmentInfo[]> {
  const results: ChatAttachmentInfo[] = [];
  for (const image of input.images) {
    // 逻辑：逐张写入 .tenas/chat/{sessionId}，并返回 tenas-file url。
    const saved = await saveChatBinaryAttachment({
      workspaceId: input.context.workspaceId,
      projectId: input.context.projectId,
      sessionId: input.context.sessionId,
      fileName: image.fileName,
      buffer: image.buffer,
      mediaType: image.mediaType,
    });
    results.push({
      url: saved.url,
      mediaType: saved.mediaType,
      fileName: saved.fileName,
      relativePath: saved.relativePath,
      bytes: saved.bytes,
    });
  }
  return results;
}

/** Read Excel file content as plain text. */
export const fileReadExcelTool = tool({
  description: `${fileReadExcelToolDef.description}路径不要使用 URL Encoding 编码。`,
  inputSchema: zodSchema(fileReadExcelToolDef.parameters),
  execute: async ({ path: rawPath }): Promise<FileReadExcelToolOutput> => {
    const resolved = resolveProjectPath(rawPath);
    const { buffer, bytes, ext } = await loadExcelBuffer(resolved.absPath);
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const { text, truncated } = buildExcelText(workbook);
    const extractedImages =
      ext === ".xls"
        ? { images: [], truncated: false }
        : await extractZipImages({
            buffer,
            folderPrefix: "xl/media",
            maxImages: MAX_EXCEL_IMAGE_COUNT,
            maxTotalBytes: MAX_EXCEL_IMAGE_TOTAL_BYTES,
          });
    const images =
      extractedImages.images.length > 0
        ? await saveExtractedImages({
            images: extractedImages.images,
            context: resolveChatAttachmentContext(),
          })
        : [];
    return {
      ok: true,
      data: {
        path: resolved.relativePath,
        bytes,
        text,
        truncated,
        sheetNames: workbook.SheetNames,
        images,
        imagesTruncated: extractedImages.truncated,
      },
    };
  },
});
