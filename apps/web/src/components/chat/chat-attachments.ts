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

export type ChatAttachment = {
  id: string;
  file: File;
  objectUrl: string;
  remoteUrl?: string;
  mediaType?: string;
  status: ChatAttachmentStatus;
  errorMessage?: string;
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
