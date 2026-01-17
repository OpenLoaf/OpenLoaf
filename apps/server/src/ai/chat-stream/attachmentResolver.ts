import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { UIMessage } from "ai";
import type { TenasImageMetadataV1 } from "@tenas-ai/api/types/image";
import { getProjectRootPath, getWorkspaceRootPathById } from "@tenas-ai/api/services/vfsService";
import { getProjectId, getWorkspaceId } from "@/ai/chat-stream/requestContext";

/** Max image edge length for chat. */
const CHAT_IMAGE_MAX_EDGE = 1024;
/** Image output quality for chat. */
const CHAT_IMAGE_QUALITY = 80;
/** Max bytes for chat binary attachments. */
const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Supported image types. */
const SUPPORTED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
/** PNG metadata key for image payloads. */
const IMAGE_METADATA_KEY = "tenas-image:metadata";
/** Max metadata bytes allowed in embedded chunk. */
const METADATA_MAX_BYTES = 128 * 1024;
/** PNG file signature bytes. */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** CRC32 lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();
/** Last timestamp used for name generation. */
let lastTimestamp = 0;
/** Sequence counter for same-timestamp collisions. */
let timestampSequence = 0;

/** Image format definition. */
type ImageFormat = {
  /** File extension. */
  ext: string;
  /** Media type. */
  mediaType: string;
};

/** Image output definition. */
type ImageOutput = ImageFormat & {
  /** Output buffer. */
  buffer: Buffer;
};

/** Format timestamp base name as YYYYMMDD_HHmmss_SSS. */
function formatTimestampBaseName(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}

/** Build a unique timestamp base name for attachments. */
function buildTimestampBaseName(): string {
  const now = Date.now();
  if (now === lastTimestamp) {
    timestampSequence += 1;
  } else {
    lastTimestamp = now;
    timestampSequence = 0;
  }
  const base = formatTimestampBaseName(new Date(now));
  if (timestampSequence === 0) return base;
  return `${base}_${String(timestampSequence).padStart(2, "0")}`;
}

/** Resolve stored file name for chat attachment. */
function buildChatAttachmentFileName(ext: string): string {
  return `${buildTimestampBaseName()}.${ext}`;
}

/** Check whether mime is supported. */
function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIME.has(mime);
}

/** Resolve image format from mime and filename. */
function resolveImageFormat(mime: string, fileName: string): ImageFormat | null {
  const lowerName = fileName.toLowerCase();
  if (mime === "image/png" || lowerName.endsWith(".png")) {
    return { ext: "png", mediaType: "image/png" };
  }
  if (mime === "image/webp" || lowerName.endsWith(".webp")) {
    return { ext: "webp", mediaType: "image/webp" };
  }
  if (mime === "image/jpeg" || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return { ext: "jpg", mediaType: "image/jpeg" };
  }
  if (mime === "image/svg+xml" || lowerName.endsWith(".svg")) {
    return { ext: "svg", mediaType: "image/svg+xml" };
  }
  return null;
}

/** Normalize a relative path for storage. */
function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

/** Return true when a relative path attempts to traverse parents. */
function hasParentTraversal(value: string): boolean {
  return value.split("/").some((segment) => segment === "..");
}

/** Compute CRC32 for PNG chunk integrity. */
function computeCrc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a PNG iTXt metadata chunk. */
function buildPngMetadataChunk(metadata: string): Buffer {
  const keyword = Buffer.from(IMAGE_METADATA_KEY, "utf8");
  const text = Buffer.from(metadata, "utf8");
  const zero = Buffer.from([0]);
  const flags = Buffer.from([0, 0]);
  const data = Buffer.concat([keyword, zero, flags, zero, zero, text]);
  const type = Buffer.from("iTXt", "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(computeCrc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([length, type, data, crc]);
}

/** Inject metadata chunk into a PNG buffer. */
export function injectPngMetadata(buffer: Buffer, metadata: string): Buffer {
  if (buffer.length < PNG_SIGNATURE.length) return buffer;
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return buffer;
  const chunk = buildPngMetadataChunk(metadata);
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const nextOffset = offset + 12 + length;
    if (nextOffset > buffer.length) break;
    if (type === "IEND") {
      return Buffer.concat([buffer.subarray(0, offset), chunk, buffer.subarray(offset)]);
    }
    offset = nextOffset;
  }
  return buffer;
}

/** Resolve sidecar metadata path for an image file. */
export function resolveMetadataSidecarPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.json`);
}

/** Trim text to a maximum utf8 byte length. */
function trimTextToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const sliced = Buffer.from(text, "utf8").subarray(0, maxBytes);
  return sliced.toString("utf8");
}

/** Serialize metadata and enforce byte limits for embedded chunks. */
export function serializeImageMetadata(metadata: TenasImageMetadataV1): {
  fullJson: string;
  chunkJson: string;
} {
  const fullPayload: TenasImageMetadataV1 = {
    ...metadata,
    flags: { ...metadata.flags },
  };
  const fullJson = JSON.stringify(fullPayload);
  if (Buffer.byteLength(fullJson, "utf8") <= METADATA_MAX_BYTES) {
    return { fullJson, chunkJson: fullJson };
  }
  const flaggedPayload: TenasImageMetadataV1 = {
    ...fullPayload,
    flags: { ...fullPayload.flags, truncated: true },
  };
  const flaggedJson = JSON.stringify(flaggedPayload);

  const trimmedPayload: TenasImageMetadataV1 = {
    ...flaggedPayload,
    request: undefined,
    flags: { ...flaggedPayload.flags, truncated: true },
  };
  const trimmedJson = JSON.stringify(trimmedPayload);
  if (Buffer.byteLength(trimmedJson, "utf8") <= METADATA_MAX_BYTES) {
    return { fullJson: flaggedJson, chunkJson: trimmedJson };
  }

  const minimalPayload: TenasImageMetadataV1 = {
    version: flaggedPayload.version,
    chatSessionId: flaggedPayload.chatSessionId,
    prompt: flaggedPayload.prompt,
    revised_prompt: flaggedPayload.revised_prompt,
    modelId: flaggedPayload.modelId,
    createdAt: flaggedPayload.createdAt,
    flags: { ...flaggedPayload.flags, truncated: true },
  };
  let minimalJson = JSON.stringify(minimalPayload);
  if (Buffer.byteLength(minimalJson, "utf8") > METADATA_MAX_BYTES) {
    // 逻辑：prompt 过长时做截断，保证 chunk 不超过上限。
    minimalPayload.prompt = trimTextToBytes(flaggedPayload.prompt, 4096);
    minimalJson = JSON.stringify(minimalPayload);
  }
  return { fullJson: flaggedJson, chunkJson: minimalJson };
}

/** Read metadata from a PNG iTXt/tEXt chunk. */
function readPngMetadataText(buffer: Buffer): string | null {
  if (buffer.length < PNG_SIGNATURE.length) return null;
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (nextOffset > buffer.length) break;
    if (type === "iTXt") {
      const chunk = buffer.subarray(dataStart, dataEnd);
      const keywordEnd = chunk.indexOf(0);
      if (keywordEnd <= 0) {
        offset = nextOffset;
        continue;
      }
      const keyword = chunk.subarray(0, keywordEnd).toString("utf8");
      if (keyword !== IMAGE_METADATA_KEY) {
        offset = nextOffset;
        continue;
      }
      const compressionFlag = chunk[keywordEnd + 1];
      const compressionMethod = chunk[keywordEnd + 2];
      if (compressionFlag !== 0 || compressionMethod !== 0) {
        offset = nextOffset;
        continue;
      }
      let cursor = keywordEnd + 3;
      const languageEnd = chunk.indexOf(0, cursor);
      if (languageEnd === -1) return null;
      cursor = languageEnd + 1;
      const translatedEnd = chunk.indexOf(0, cursor);
      if (translatedEnd === -1) return null;
      const text = chunk.subarray(translatedEnd + 1).toString("utf8").trim();
      return text || null;
    }
    if (type === "tEXt") {
      const chunk = buffer.subarray(dataStart, dataEnd);
      const keywordEnd = chunk.indexOf(0);
      if (keywordEnd <= 0) {
        offset = nextOffset;
        continue;
      }
      const keyword = chunk.subarray(0, keywordEnd).toString("utf8");
      if (keyword !== IMAGE_METADATA_KEY) {
        offset = nextOffset;
        continue;
      }
      const text = chunk.subarray(keywordEnd + 1).toString("utf8").trim();
      return text || null;
    }
    offset = nextOffset;
  }
  return null;
}

/** Resolve metadata text from sidecar or embedded PNG chunk. */
async function resolveImageMetadataText(filePath: string): Promise<string | null> {
  const sidecarPath = resolveMetadataSidecarPath(filePath);
  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as TenasImageMetadataV1;
    return serializeImageMetadata(parsed).chunkJson;
  } catch {
    // 逻辑：sidecar 不存在或解析失败时回退读取 PNG chunk。
  }
  if (!filePath.toLowerCase().endsWith(".png")) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return readPngMetadataText(buffer);
  } catch {
    return null;
  }
}
/** Resolve root path for chat attachments. */
async function resolveChatAttachmentRoot(input: {
  /** Project id. */
  projectId?: string;
  /** Workspace id. */
  workspaceId?: string;
}): Promise<{ rootPath: string } | null> {
  const projectId = input.projectId?.trim();
  if (projectId) {
    const projectRootPath = await getProjectRootPath(projectId);
    if (projectRootPath) return { rootPath: projectRootPath };
  }
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return null;
  const workspaceRootPath = getWorkspaceRootPathById(workspaceId);
  if (!workspaceRootPath) return null;
  return { rootPath: workspaceRootPath };
}

export type ChatBinaryAttachmentResult = {
  /** Relative path for the saved attachment. */
  url: string;
  /** Media type for the attachment. */
  mediaType: string;
  /** Stored file name. */
  fileName: string;
  /** Relative path within the project/workspace root. */
  relativePath: string;
  /** File size in bytes. */
  bytes: number;
};

/** Save a binary attachment for the current chat session. */
export async function saveChatBinaryAttachment(input: {
  /** Workspace id. */
  workspaceId?: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** Source file name. */
  fileName: string;
  /** File buffer. */
  buffer: Buffer;
  /** Optional media type. */
  mediaType?: string;
}): Promise<ChatBinaryAttachmentResult> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    throw new Error("sessionId is required.");
  }
  if (!input.projectId && !input.workspaceId) {
    throw new Error("workspaceId is required when projectId is missing.");
  }
  if (input.buffer.length > CHAT_ATTACHMENT_MAX_BYTES) {
    throw new Error("Attachment too large.");
  }
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }
  const ext = path.extname(input.fileName).toLowerCase().replace(/^\./, "") || "bin";
  const storedName = buildChatAttachmentFileName(ext);
  const relativePath = path.posix.join(".tenas", "chat", sessionId, storedName);
  const targetPath = path.join(root.rootPath, ".tenas", "chat", sessionId, storedName);
  // 逻辑：确保目录存在后再写入文件，避免落盘失败。
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, input.buffer);
  return {
    url: relativePath,
    mediaType: input.mediaType ?? "application/octet-stream",
    fileName: storedName,
    relativePath,
    bytes: input.buffer.length,
  };
}

/** Scoped project path matcher like [projectId]/path/to/file. */
const PROJECT_SCOPE_REGEX = /^\[([^\]]+)\]\/(.+)$/;
/** Scheme matcher for absolute URLs. */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Parse a scoped relative path with optional [projectId] prefix. */
function parseScopedRelativePath(raw: string): { projectId?: string; relativePath: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (SCHEME_REGEX.test(normalized)) return null;
  const match = normalized.match(PROJECT_SCOPE_REGEX);
  if (match) {
    return {
      projectId: match[1]?.trim(),
      relativePath: match[2] ?? "",
    };
  }
  return { relativePath: normalized };
}

/** Resolve a relative path into an absolute file path within the project/workspace root. */
async function resolveProjectFilePath(input: {
  /** Raw relative path string. */
  path: string;
  /** Optional project id override. */
  projectId?: string;
  /** Optional workspace id fallback. */
  workspaceId?: string;
}): Promise<{ absPath: string; relativePath: string } | null> {
  const parsed = parseScopedRelativePath(input.path);
  if (!parsed) return null;
  const relativePath = normalizeRelativePath(parsed.relativePath);
  if (!relativePath || hasParentTraversal(relativePath)) return null;
  const root = await resolveChatAttachmentRoot({
    projectId: parsed.projectId ?? input.projectId ?? getProjectId(),
    workspaceId: input.workspaceId ?? getWorkspaceId(),
  });
  if (!root) return null;
  const targetPath = path.resolve(root.rootPath, relativePath);
  const rootPathResolved = path.resolve(root.rootPath);
  // 逻辑：必须限制在 rootPath 内，避免路径穿越。
  if (targetPath !== rootPathResolved && !targetPath.startsWith(rootPathResolved + path.sep)) {
    return null;
  }
  return { absPath: targetPath, relativePath };
}

/** Compress image buffer to chat constraints. */
async function compressImageBuffer(input: Buffer, format: ImageFormat): Promise<ImageOutput> {
  return compressImageBufferWithOptions(input, format, {
    maxEdge: CHAT_IMAGE_MAX_EDGE,
    quality: CHAT_IMAGE_QUALITY,
  });
}

/** Compress image buffer with explicit size/quality settings. */
async function compressImageBufferWithOptions(
  input: Buffer,
  format: ImageFormat,
  options: { maxEdge: number; quality: number }
): Promise<ImageOutput> {
  if (format.ext === "svg") {
    // 中文注释：SVG 直接返回原始内容，避免栅格化。
    return { buffer: input, ext: format.ext, mediaType: format.mediaType };
  }
  // 逻辑：统一限制最大边长与质量，避免超大图片传给模型。
  const transformer = sharp(input).resize({
    width: options.maxEdge,
    height: options.maxEdge,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buffer: Buffer;
  if (format.ext === "png") {
    buffer = await transformer.png({ compressionLevel: 9 }).toBuffer();
  } else if (format.ext === "webp") {
    buffer = await transformer.webp({ quality: options.quality }).toBuffer();
  } else {
    buffer = await transformer.jpeg({ quality: options.quality, mozjpeg: true }).toBuffer();
  }

  return { buffer, ext: format.ext, mediaType: format.mediaType };
}

/** Compress image buffer until it is close to a target byte size. */
async function compressImageBufferToTarget(
  input: Buffer,
  format: ImageFormat,
  options: { maxBytes: number }
): Promise<ImageOutput> {
  const qualitySteps = [CHAT_IMAGE_QUALITY, 70, 60, 50, 40, 30];
  const edgeScales = [1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25];
  const formatCandidates: ImageFormat[] = [format];

  // 逻辑：先降质量再缩尺寸，尽量贴近目标体积。
  // 逻辑：原格式仍偏大时尝试 webp，以进一步压缩体积。
  if (format.ext !== "webp") {
    formatCandidates.push({ ext: "webp", mediaType: "image/webp" });
  }

  let best: ImageOutput | null = null;
  for (const candidate of formatCandidates) {
    for (const scale of edgeScales) {
      const maxEdge = Math.max(1, Math.round(CHAT_IMAGE_MAX_EDGE * scale));
      for (const quality of qualitySteps) {
        const result = await compressImageBufferWithOptions(input, candidate, {
          maxEdge,
          quality,
        });
        if (!best || result.buffer.byteLength < best.buffer.byteLength) {
          best = result;
        }
        if (result.buffer.byteLength <= options.maxBytes) {
          return result;
        }
        if (candidate.ext === "png") {
          break;
        }
      }
    }
  }

  return best ?? compressImageBuffer(input, format);
}

/** Save chat image attachment and return url. */
export async function saveChatImageAttachment(input: {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** File name. */
  fileName: string;
  /** Media type. */
  mediaType: string;
  /** File buffer. */
  buffer: Buffer;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
}): Promise<{ url: string; mediaType: string }> {
  const format = resolveImageFormat(input.mediaType, input.fileName);
  if (!format || !isSupportedImageMime(format.mediaType)) {
    throw new Error("Unsupported image type");
  }

  // 上传阶段即压缩并落盘，避免保存原图。
  const compressed = await compressImageBuffer(input.buffer, format);
  const fileName = buildChatAttachmentFileName(compressed.ext);
  const relativePath = path.posix.join(".tenas", "chat", input.sessionId, fileName);
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }

  const targetPath = path.join(root.rootPath, ".tenas", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  // 逻辑：PNG 写入 iTXt，其他格式仅写 sidecar。
  const metadataPayload = input.metadata ? serializeImageMetadata(input.metadata) : null;
  const outputBuffer =
    compressed.ext === "png" && metadataPayload
      ? injectPngMetadata(compressed.buffer, metadataPayload.chunkJson)
      : compressed.buffer;
  await fs.writeFile(targetPath, outputBuffer);
  if (metadataPayload) {
    const sidecarPath = resolveMetadataSidecarPath(targetPath);
    await fs.writeFile(sidecarPath, metadataPayload.fullJson, "utf8");
  }

  return {
    url: relativePath,
    mediaType: compressed.mediaType,
  };
}

/** Save chat image attachment from a project-relative path. */
export async function saveChatImageAttachmentFromPath(input: {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** Source relative path. */
  path: string;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
}): Promise<{ url: string; mediaType: string }> {
  const resolved = await resolveProjectFilePath({
    path: input.path,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!resolved) {
    throw new Error("Invalid attachment path");
  }
  const filePath = resolved.absPath;
  const buffer = await fs.readFile(filePath);
  const format = resolveImageFormat("application/octet-stream", filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) {
    throw new Error("Unsupported image type");
  }
  // 中文注释：相对路径来源仍需压缩转码，统一 chat 侧尺寸与质量。
  const compressed = await compressImageBuffer(buffer, format);
  const fileName = buildChatAttachmentFileName(compressed.ext);
  const relativePath = path.posix.join(".tenas", "chat", input.sessionId, fileName);
  const root = await resolveChatAttachmentRoot({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!root) {
    throw new Error("Workspace or project not found");
  }
  const targetPath = path.join(root.rootPath, ".tenas", "chat", input.sessionId, fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  // 逻辑：PNG 写入 iTXt，其他格式仅写 sidecar。
  const metadataPayload = input.metadata ? serializeImageMetadata(input.metadata) : null;
  const outputBuffer =
    compressed.ext === "png" && metadataPayload
      ? injectPngMetadata(compressed.buffer, metadataPayload.chunkJson)
      : compressed.buffer;
  await fs.writeFile(targetPath, outputBuffer);
  if (metadataPayload) {
    const sidecarPath = resolveMetadataSidecarPath(targetPath);
    await fs.writeFile(sidecarPath, metadataPayload.fullJson, "utf8");
  }

  return {
    url: relativePath,
    mediaType: compressed.mediaType,
  };
}

/** Build UI file part from a relative path. */
export async function buildFilePartFromPath(input: {
  /** File path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id for resolving path. */
  workspaceId?: string;
  /** Media type override. */
  mediaType?: string;
}): Promise<{ type: "file"; url: string; mediaType: string } | null> {
  const payload = await loadProjectImageBuffer(input);
  if (!payload) return null;
  const base64 = payload.buffer.toString("base64");
  return {
    type: "file",
    url: `data:${payload.mediaType};base64,${base64}`,
    mediaType: payload.mediaType,
  };
}

/** Resolve preview content for supported attachments. */
export async function getFilePreview(input: {
  /** File path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id for resolving path. */
  workspaceId?: string;
  /** Whether to include metadata. */
  includeMetadata?: boolean;
  /** Target byte size for preview compression. */
  maxBytes?: number;
}): Promise<{ buffer: Buffer; mediaType: string; metadata?: string | null } | null> {
  const resolved = await resolveProjectFilePath({
    path: input.path,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!resolved) return null;
  const filePath = resolved.absPath;
  const lowerPath = filePath.toLowerCase();
  // PDF 直接返回原文件内容，图片继续压缩预览。
  if (lowerPath.endsWith(".pdf")) {
    const buffer = await fs.readFile(filePath);
    return { buffer, mediaType: "application/pdf", metadata: null };
  }
  const format = resolveImageFormat("application/octet-stream", filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) return null;
  const buffer = await fs.readFile(filePath);
  const compressed = input.maxBytes
    ? await compressImageBufferToTarget(buffer, format, { maxBytes: input.maxBytes })
    : await compressImageBuffer(buffer, format);
  const metadata = input.includeMetadata ? await resolveImageMetadataText(filePath) : null;
  return { buffer: compressed.buffer, mediaType: compressed.mediaType, metadata };
}

/** Load image buffer from a relative path. */
export async function loadProjectImageBuffer(input: {
  /** File path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id for resolving path. */
  workspaceId?: string;
  /** Media type override. */
  mediaType?: string;
}): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const resolved = await resolveProjectFilePath({
    path: input.path,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
  });
  if (!resolved) return null;
  const filePath = resolved.absPath;
  const buffer = await fs.readFile(filePath);
  const fallbackType = input.mediaType || "application/octet-stream";
  const format = resolveImageFormat(fallbackType, filePath);
  if (!format || !isSupportedImageMime(format.mediaType)) return null;

  const compressed = await compressImageBuffer(buffer, format);
  return {
    buffer: compressed.buffer,
    mediaType: compressed.mediaType,
  };
}

/** Replace relative file parts with data urls. */
export async function replaceRelativeFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  const next: UIMessage[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const replaced: any[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        replaced.push(part);
        continue;
      }
      if ((part as any).type !== "file") {
        replaced.push(part);
        continue;
      }
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url || SCHEME_REGEX.test(url)) {
        replaced.push(part);
        continue;
      }
      const mediaType =
        typeof (part as any).mediaType === "string" ? (part as any).mediaType : undefined;
      try {
        const filePart = await buildFilePartFromPath({ path: url, mediaType });
        if (filePart) replaced.push(filePart);
      } catch {
        // 读取或压缩失败时直接跳过该图片，避免阻断对话。
      }
    }
    next.push({ ...message, parts: replaced } as UIMessage);
  }
  return next;
}
