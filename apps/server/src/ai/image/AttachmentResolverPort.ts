import type { UIMessage } from "ai";
import type { TenasImageMetadataV1 } from "@tenas-ai/api/types/image";

export type AttachmentSaveResult = {
  /** Relative attachment url. */
  url: string;
  /** Attachment media type. */
  mediaType: string;
};

export type SaveChatImageAttachmentInput = {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** Source file name. */
  fileName: string;
  /** Source media type. */
  mediaType: string;
  /** Source image buffer. */
  buffer: Buffer;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
};

export type SaveChatImageAttachmentFromPathInput = {
  /** Workspace id. */
  workspaceId: string;
  /** Project id. */
  projectId?: string;
  /** Session id. */
  sessionId: string;
  /** Relative source path. */
  path: string;
  /** Optional image metadata. */
  metadata?: TenasImageMetadataV1;
};

export type AttachmentPreviewInput = {
  /** Relative file path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id fallback. */
  workspaceId?: string;
  /** Whether to include metadata. */
  includeMetadata?: boolean;
  /** Max bytes for preview compression. */
  maxBytes?: number;
};

export type AttachmentPreviewResult =
  | {
      /** Result kind. */
      kind: "ready";
      /** Preview payload buffer. */
      buffer: Buffer;
      /** Preview media type. */
      mediaType: string;
      /** Optional metadata payload. */
      metadata?: string | null;
    }
  | {
      /** Result kind. */
      kind: "too-large";
      /** Original file size. */
      sizeBytes: number;
      /** Max bytes allowed for preview. */
      maxBytes: number;
    };

export type BuildFilePartInput = {
  /** Relative file path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id for resolving path. */
  workspaceId?: string;
  /** Media type override. */
  mediaType?: string;
};

export type FilePart = {
  /** Part type. */
  type: "file";
  /** Data URL for the file. */
  url: string;
  /** Media type for the data URL. */
  mediaType: string;
};

export type ProjectImageBufferInput = {
  /** Relative file path. */
  path: string;
  /** Project id for resolving path. */
  projectId?: string;
  /** Workspace id for resolving path. */
  workspaceId?: string;
  /** Media type override. */
  mediaType?: string;
};

export type ProjectImageBufferResult = {
  /** Resolved image buffer. */
  buffer: Buffer;
  /** Resolved media type. */
  mediaType: string;
};

export interface AttachmentResolverPort {
  /** Save a chat image attachment from raw buffer. */
  saveChatImageAttachment(input: SaveChatImageAttachmentInput): Promise<AttachmentSaveResult>;
  /** Save a chat image attachment from a relative path. */
  saveChatImageAttachmentFromPath(
    input: SaveChatImageAttachmentFromPathInput
  ): Promise<AttachmentSaveResult>;
  /** Build a file part from a relative path. */
  buildFilePartFromPath(input: BuildFilePartInput): Promise<FilePart | null>;
  /** Resolve preview content for an attachment. */
  getFilePreview(input: AttachmentPreviewInput): Promise<AttachmentPreviewResult | null>;
  /** Load image buffer from a relative path. */
  loadProjectImageBuffer(input: ProjectImageBufferInput): Promise<ProjectImageBufferResult | null>;
  /** Replace relative file parts with data URLs. */
  replaceRelativeFileParts(messages: UIMessage[]): Promise<UIMessage[]>;
}
