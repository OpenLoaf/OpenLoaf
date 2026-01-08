/**
 * 聊天输入框附件（当前仅图片）相关的 UI 逻辑类型与通用限制。
 * 说明：此文件只做前端 UI 状态管理；不包含任何上传/业务逻辑。
 */

export const CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const CHAT_ATTACHMENT_ACCEPT_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const CHAT_ATTACHMENT_ACCEPT_ATTR = CHAT_ATTACHMENT_ACCEPT_MIME.join(",");

export type ChatAttachmentStatus = "loading" | "ready" | "error";

export type ChatAttachmentMask = {
  /** Mask file used for image editing. */
  file: File;
  /** Preview URL for the mask (optional). */
  objectUrl?: string;
  /** Remote URL resolved after upload. */
  remoteUrl?: string;
  /** Media type resolved after upload. */
  mediaType?: string;
  /** Upload status for the mask. */
  status: ChatAttachmentStatus;
  /** Error message from mask upload. */
  errorMessage?: string;
};

export type ChatAttachment = {
  /** Attachment id. */
  id: string;
  /** Source file for the attachment. */
  file: File;
  /** Optional source url for internal attachments. */
  sourceUrl?: string;
  /** Preview URL for display. */
  objectUrl: string;
  /** Remote URL resolved after upload. */
  remoteUrl?: string;
  /** Media type resolved after upload. */
  mediaType?: string;
  /** Upload status for the attachment. */
  status: ChatAttachmentStatus;
  /** Error message from upload. */
  errorMessage?: string;
  /** Optional mask attachment for image editing. */
  mask?: ChatAttachmentMask;
  /** Whether this attachment has a mask applied. */
  hasMask?: boolean;
};

export type ChatAttachmentSource = {
  /** Source file used for local preview. */
  file: File;
  /** Original attachment url for upload. */
  sourceUrl?: string;
};

export type ChatAttachmentInput = File | ChatAttachmentSource;

export type MaskedAttachmentInput = {
  /** Base image file used for model input. */
  file: File;
  /** Mask image file used for editing. */
  maskFile: File;
  /** Composite preview URL with brush overlay. */
  previewUrl: string;
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function isSupportedImageFile(file: File) {
  return (CHAT_ATTACHMENT_ACCEPT_MIME as readonly string[]).includes(file.type);
}
