/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { getWorkspaceByIdConfig } from "@openloaf/api/services/workspaceConfig";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  getFilePreview,
  saveChatImageAttachment,
  saveChatImageAttachmentFromPath,
} from "@/ai/services/image/attachmentResolver";

/** Max upload size for chat images. */
const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
/** Multipart boundary prefix for preview responses. */
const MULTIPART_BOUNDARY_PREFIX = "openloaf-preview";

export type ChatAttachmentBody = {
  /** Workspace id. */
  workspaceId?: unknown;
  /** Project id. */
  projectId?: unknown;
  /** Session id. */
  sessionId?: unknown;
  /** File payload or path. */
  file?: unknown;
};

type ParsedChatAttachmentBody = {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** File payload or path. */
  file: File | string | null;
};

type ChatAttachmentResponse =
  | {
      /** Response payload type. */
      type: "json";
      /** HTTP status code. */
      status: ContentfulStatusCode;
      /** JSON body payload. */
      body: Record<string, unknown>;
    }
  | {
      /** Response payload type. */
      type: "binary";
      /** HTTP status code. */
      status: ContentfulStatusCode;
      /** Binary response body. */
      body: Uint8Array<ArrayBuffer>;
      /** Response content type. */
      contentType: string;
    };

type PreviewQueryInput = {
  /** Path query string. */
  path?: string;
  /** Project id query string. */
  projectId?: string;
  /** Workspace id query string. */
  workspaceId?: string;
  /** Include metadata query flag. */
  includeMetadata?: string;
  /** Max bytes query string. */
  maxBytes?: string;
};

type PreviewQueryResult = {
  /** Normalized attachment path. */
  path?: string;
  /** Normalized project id. */
  projectId?: string;
  /** Normalized workspace id. */
  workspaceId?: string;
  /** Include metadata flag. */
  includeMetadata?: boolean;
  /** Max bytes limit. */
  maxBytes?: number;
};

type PreviewRequestInput = {
  /** Attachment path. */
  path?: string;
  /** Project id. */
  projectId?: string;
  /** Workspace id. */
  workspaceId?: string;
  /** Include metadata flag. */
  includeMetadata?: boolean;
  /** Max bytes limit. */
  maxBytes?: number;
};

/** Parse a positive integer from a query value. */
function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Build multipart/mixed response payload. */
function buildMultipartMixed(input: {
  /** Metadata payload text. */
  metadata: string | null | undefined;
  /** Binary content buffer. */
  buffer: Buffer;
  /** Media type for the binary part. */
  mediaType: string;
}): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = `${MULTIPART_BOUNDARY_PREFIX}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const metadataBody = input.metadata?.trim() ? input.metadata : "null";
  // 逻辑：metadata 放首段，图片放第二段，前端可只解析元信息。
  const header =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=utf-8\r\n\r\n" +
    `${metadataBody}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${input.mediaType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const bodyBuffer = Buffer.concat([
    Buffer.from(header, "utf8"),
    input.buffer,
    Buffer.from(footer, "utf8"),
  ]);
  const arrayBuffer = new ArrayBuffer(bodyBuffer.byteLength);
  const body = new Uint8Array(arrayBuffer);
  body.set(bodyBuffer);
  return {
    body,
    contentType: `multipart/mixed; boundary=${boundary}`,
  };
}

/** Check if value is file-like. */
function isFileLike(value: unknown): value is File {
  return Boolean(value) && typeof value === "object" && "arrayBuffer" in (value as File);
}

/** Parse and normalize chat attachment body. */
function parseChatAttachmentBody(body: ChatAttachmentBody): ParsedChatAttachmentBody {
  const workspaceId = toText(body.workspaceId);
  const projectId = toText(body.projectId) || undefined;
  const sessionId = toText(body.sessionId);
  const rawFile = body.file;
  const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
  if (isFileLike(file)) {
    return { workspaceId, projectId, sessionId, file };
  }
  if (typeof file === "string" && file.trim()) {
    return { workspaceId, projectId, sessionId, file: file.trim() };
  }
  return { workspaceId, projectId, sessionId, file: null };
}

/** Normalize primitive values to text. */
function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class ChatAttachmentController {
  /** Handle attachment upload requests. */
  async upload(body: ChatAttachmentBody): Promise<ChatAttachmentResponse> {
    const { workspaceId, projectId, sessionId, file } = parseChatAttachmentBody(body);

    if (!workspaceId || !sessionId || !file) {
      return { type: "json", status: 400, body: { error: "Missing required upload fields" } };
    }

    const workspaceExists = Boolean(getWorkspaceByIdConfig(workspaceId));
    if (!workspaceExists) {
      return { type: "json", status: 400, body: { error: "Workspace not found" } };
    }

    try {
      if (isFileLike(file)) {
        const size = typeof file.size === "number" ? file.size : 0;
        if (size > MAX_CHAT_IMAGE_BYTES) {
          return { type: "json", status: 413, body: { error: "Image too large" } };
        }
        // 上传阶段即压缩并落盘，返回相对路径给前端。
        const buffer = Buffer.from(await file.arrayBuffer());
        const mediaType = file.type || "application/octet-stream";
        const result = await saveChatImageAttachment({
          workspaceId,
          projectId,
          sessionId,
          fileName: file.name || "upload",
          mediaType,
          buffer,
        });
        return {
          type: "json",
          status: 200,
          body: { url: result.url, mediaType: result.mediaType },
        };
      }
      // 中文注释：相对路径仍需压缩转码后再落盘。
      const result = await saveChatImageAttachmentFromPath({
        workspaceId,
        projectId,
        sessionId,
        path: file,
      });
      return {
        type: "json",
        status: 200,
        body: { url: result.url, mediaType: result.mediaType },
      };
    } catch (error) {
      return {
        type: "json",
        status: 500,
        body: { error: error instanceof Error ? error.message : "Upload failed" },
      };
    }
  }

  /** Handle attachment preview requests. */
  async preview(input: PreviewRequestInput): Promise<ChatAttachmentResponse> {
    const pathValue = input.path?.trim() ?? "";
    const projectId = input.projectId?.trim() || undefined;
    const workspaceId = input.workspaceId?.trim() || undefined;
    const includeMetadata = Boolean(input.includeMetadata);
    const maxBytes = input.maxBytes;
    if (!pathValue) {
      return { type: "json", status: 400, body: { error: "Invalid preview path" } };
    }

    try {
      const preview = await getFilePreview({
        path: pathValue,
        projectId,
        workspaceId,
        includeMetadata,
        maxBytes,
      });
      if (!preview) {
        return { type: "json", status: 404, body: { error: "Preview not found" } };
      }
      if (preview.kind === "too-large") {
        // 逻辑：附件超过预览阈值时告知前端大小与上限。
        return {
          type: "json",
          status: 413,
          body: {
            error: "Preview too large",
            sizeBytes: preview.sizeBytes,
            maxBytes: preview.maxBytes,
          },
        };
      }
      if (includeMetadata) {
        const multipart = buildMultipartMixed({
          metadata: preview.metadata ?? null,
          buffer: preview.buffer,
          mediaType: preview.mediaType,
        });
        return {
          type: "binary",
          status: 200,
          body: multipart.body,
          contentType: multipart.contentType,
        };
      }
      // Hono 的 body 需要 Uint8Array，避免 Buffer 类型推断问题。
      const arrayBuffer = new ArrayBuffer(preview.buffer.byteLength);
      const body = new Uint8Array(arrayBuffer);
      body.set(preview.buffer);
      return {
        type: "binary",
        status: 200,
        body,
        contentType: preview.mediaType,
      };
    } catch (error) {
      return {
        type: "json",
        status: 500,
        body: { error: error instanceof Error ? error.message : "Preview failed" },
      };
    }
  }

  /** Parse preview query params into normalized input. */
  parsePreviewQuery(query: PreviewQueryInput): PreviewQueryResult {
    return {
      path: query.path,
      projectId: query.projectId,
      workspaceId: query.workspaceId,
      includeMetadata: query.includeMetadata === "1",
      maxBytes: parsePositiveInt(query.maxBytes),
    };
  }
}
