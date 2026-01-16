import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import * as mammoth from "mammoth";
import { fileReadDocxToolDef } from "@tenas-ai/api/types/tools/system";
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

/** Max bytes for reading a docx file. */
const MAX_DOCX_BYTES = 10 * 1024 * 1024;
/** Max characters returned from docx extraction. */
const MAX_DOCX_TEXT_CHARS = 200_000;
/** Supported docx extension. */
const DOCX_EXTENSION = ".docx";
/** Max images extracted from docx. */
const MAX_DOCX_IMAGE_COUNT = 20;
/** Max total bytes for docx images. */
const MAX_DOCX_IMAGE_TOTAL_BYTES = 10 * 1024 * 1024;

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

/** Docx read tool output. */
type FileReadDocxToolOutput = {
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
    /** Extracted image attachments. */
    images: ChatAttachmentInfo[];
    /** Whether image extraction was truncated. */
    imagesTruncated: boolean;
  };
};

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

/** Load docx file buffer with size guards. */
async function loadDocxBuffer(
  absPath: string,
): Promise<{ buffer: Buffer; bytes: number }> {
  const stat = await ensureFile(absPath);
  const ext = path.extname(absPath).toLowerCase();
  if (ext !== DOCX_EXTENSION) {
    throw new Error("Only .docx files are supported.");
  }
  // 逻辑：限制文件大小，避免解析超大文档。
  if (stat.size > MAX_DOCX_BYTES) {
    throw new Error("Docx file too large.");
  }
  const buffer = await fs.readFile(absPath);
  return { buffer, bytes: stat.size };
}

/** Extract raw text from a docx buffer. */
async function extractDocxText(buffer: Buffer): Promise<{ text: string; truncated: boolean }> {
  const result = await mammoth.extractRawText({ buffer });
  let text = result.value ?? "";
  let truncated = false;
  if (text.length > MAX_DOCX_TEXT_CHARS) {
    // 逻辑：输出长度超出上限时截断，避免响应过大。
    text = text.slice(0, MAX_DOCX_TEXT_CHARS);
    truncated = true;
  }
  return { text, truncated };
}

/** Save extracted images into chat attachment storage. */
async function saveExtractedImages(input: {
  images: ZipImageEntry[];
  context: ChatAttachmentContext;
}): Promise<ChatAttachmentInfo[]> {
  const results: ChatAttachmentInfo[] = [];
  for (const image of input.images) {
    // 逻辑：逐张写入 .tenas/chat/{sessionId}，并返回相对路径。
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

/** Read docx file content as plain text. */
export const fileReadDocxTool = tool({
  description: fileReadDocxToolDef.description,
  inputSchema: zodSchema(fileReadDocxToolDef.parameters),
  execute: async ({ path: rawPath }): Promise<FileReadDocxToolOutput> => {
    const resolved = resolveProjectPath(rawPath);
    const { buffer, bytes } = await loadDocxBuffer(resolved.absPath);
    const { text, truncated } = await extractDocxText(buffer);
    const extractedImages = await extractZipImages({
      buffer,
      folderPrefix: "word/media",
      maxImages: MAX_DOCX_IMAGE_COUNT,
      maxTotalBytes: MAX_DOCX_IMAGE_TOTAL_BYTES,
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
        images,
        imagesTruncated: extractedImages.truncated,
      },
    };
  },
});
