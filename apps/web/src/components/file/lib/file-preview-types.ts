/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { MaskedAttachmentInput } from "@/components/ai/input/chat-attachments";

export type FilePreviewViewer =
  | "image"
  | "markdown"
  | "code"
  | "pdf"
  | "doc"
  | "sheet"
  | "pptx"
  | "video"
  | "audio"
  | "file";

export type FilePreviewItem = {
  /** Source uri for preview. */
  uri: string;
  /** Optional system-open uri. */
  openUri?: string;
  /** Optional display name. */
  name?: string;
  /** Optional title for headers. */
  title?: string;
  /** Optional file extension. */
  ext?: string;
  /** Optional project id for file queries. */
  projectId?: string;
  /** Optional chat session id — required for ${CURRENT_CHAT_DIR} template previews. */
  sessionId?: string;
  /** Optional root uri for system open. */
  rootUri?: string;
  /** Optional board id for resolving board-relative assets. */
  boardId?: string;
  /** Optional media width in pixels. */
  width?: number;
  /** Optional media height in pixels. */
  height?: number;
  /** Optional thumbnail for image preview. */
  thumbnailSrc?: string;
  /** Optional media type for naming. */
  mediaType?: string;
  /** Optional clip start time in seconds. */
  clipStart?: number;
  /** Optional clip end time in seconds. */
  clipEnd?: number;
  /** Optional mask uri for image edit. */
  maskUri?: string;
  /** Optional file name for save. */
  saveName?: string;
};

export type FilePreviewPayload = {
  /** Viewer type to render. */
  viewer: FilePreviewViewer;
  /** Whether preview content should be read-only. */
  readOnly?: boolean;
  /** Optional owner id for coordination. */
  sourceId?: string;
  /** Callback when dialog closes. */
  onClose?: () => void;
  /** Previewable items (images may include multiple). */
  items: FilePreviewItem[];
  /** Active item index. */
  activeIndex: number;
  /** Whether to show the save button. */
  showSave?: boolean;
  /** Whether to enable edit mode. */
  enableEdit?: boolean;
  /** Default directory for save dialog. */
  saveDefaultDir?: string;
  /** Callback for image mask edits. */
  onApplyMask?: (input: MaskedAttachmentInput) => void;
  /** Callback when active index changes. */
  onActiveIndexChange?: (index: number) => void;
};
