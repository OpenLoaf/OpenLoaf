import type { MaskedAttachmentInput } from "@/components/chat/chat-attachments";

export type FilePreviewViewer =
  | "image"
  | "markdown"
  | "code"
  | "pdf"
  | "doc"
  | "sheet"
  | "video"
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
  /** Optional root uri for system open. */
  rootUri?: string;
  /** Optional media width in pixels. */
  width?: number;
  /** Optional media height in pixels. */
  height?: number;
  /** Optional thumbnail for image preview. */
  thumbnailSrc?: string;
  /** Optional media type for naming. */
  mediaType?: string;
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
