import type {
  AttachmentPreviewInput,
  AttachmentPreviewResult,
  AttachmentResolverPort,
  AttachmentSaveResult,
  BuildFilePartInput,
  FilePart,
  ProjectImageBufferInput,
  ProjectImageBufferResult,
  SaveChatImageAttachmentFromPathInput,
  SaveChatImageAttachmentInput,
} from "@/ai/image/AttachmentResolverPort";
import {
  buildFilePartFromPath,
  getFilePreview,
  loadProjectImageBuffer,
  replaceRelativeFileParts,
  saveChatImageAttachment,
  saveChatImageAttachmentFromPath,
} from "@/ai/image/attachmentResolver";
import type { UIMessage } from "ai";

export class AttachmentResolverAdapter implements AttachmentResolverPort {
  /** Save a chat image attachment from raw buffer. */
  async saveChatImageAttachment(
    input: SaveChatImageAttachmentInput
  ): Promise<AttachmentSaveResult> {
    return saveChatImageAttachment(input);
  }

  /** Save a chat image attachment from a relative path. */
  async saveChatImageAttachmentFromPath(
    input: SaveChatImageAttachmentFromPathInput
  ): Promise<AttachmentSaveResult> {
    return saveChatImageAttachmentFromPath(input);
  }

  /** Build a file part from a relative path. */
  async buildFilePartFromPath(input: BuildFilePartInput): Promise<FilePart | null> {
    return buildFilePartFromPath(input);
  }

  /** Resolve preview content for an attachment. */
  async getFilePreview(input: AttachmentPreviewInput): Promise<AttachmentPreviewResult | null> {
    return getFilePreview(input);
  }

  /** Load image buffer from a relative path. */
  async loadProjectImageBuffer(
    input: ProjectImageBufferInput
  ): Promise<ProjectImageBufferResult | null> {
    return loadProjectImageBuffer(input);
  }

  /** Replace relative file parts with data URLs. */
  async replaceRelativeFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
    return replaceRelativeFileParts(messages);
  }
}
