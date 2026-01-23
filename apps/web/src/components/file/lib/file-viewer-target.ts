import {
  getEntryExt,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  VIDEO_EXTS,
  isTextFallbackExt,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import type { FilePreviewViewer } from "./file-preview-types";

export type FileViewerTarget = {
  /** Viewer type resolved from entry. */
  viewer: FilePreviewViewer;
  /** Normalized extension. */
  ext: string;
};

/** Resolve viewer target from a filesystem entry. */
export function resolveFileViewerTarget(entry: FileSystemEntry): FileViewerTarget | null {
  if (entry.kind !== "file") return null;
  const ext = (getEntryExt(entry) || "").toLowerCase();
  if (IMAGE_EXTS.has(ext)) return { viewer: "image", ext };
  if (MARKDOWN_EXTS.has(ext)) return { viewer: "markdown", ext };
  if (CODE_EXTS.has(ext) || isTextFallbackExt(ext)) return { viewer: "code", ext };
  if (PDF_EXTS.has(ext)) return { viewer: "pdf", ext };
  if (DOC_EXTS.has(ext)) return { viewer: "doc", ext };
  if (SPREADSHEET_EXTS.has(ext)) return { viewer: "sheet", ext };
  if (VIDEO_EXTS.has(ext)) return { viewer: "video", ext };
  return { viewer: "file", ext };
}
