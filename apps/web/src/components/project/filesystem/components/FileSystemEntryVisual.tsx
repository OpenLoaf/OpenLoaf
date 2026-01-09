"use client";

import { memo } from "react";
import {
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileScan,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
} from "lucide-react";
import { isBoardFolderName } from "@/lib/file-name";
import { type FileSystemEntry } from "../utils/file-system-utils";

export const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "avif",
  "tiff",
  "heic",
]);
export const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "gz", "tar", "bz2", "xz"]);
export const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac"]);
export const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
export const SPREADSHEET_EXTS = new Set(["xls", "xlsx", "csv", "tsv", "numbers"]);
export const PDF_EXTS = new Set(["pdf"]);
export const DOC_EXTS = new Set(["doc", "docx"]);
export const CODE_EXTS = new Set([
  "js",
  "ts",
  "tsx",
  "jsx",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "py",
  "go",
  "rs",
  "java",
  "cpp",
  "c",
  "h",
  "hpp",
  "css",
  "scss",
  "less",
  "html",
  "xml",
  "sh",
  "zsh",
  "md",
  "mdx",
]);

/** Render a thumbnail preview for image files. */
const ImageThumbnail = memo(function ImageThumbnail({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  return (
    <div className="h-11 w-11 overflow-hidden rounded-md bg-muted/40">
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <FileImage className="h-full w-full p-2 text-muted-foreground" />
      )}
    </div>
  );
});

/** Resolve normalized file extension. */
export function resolveEntryExt(
  kind: FileSystemEntry["kind"],
  name: string,
  ext?: string
) {
  if (kind !== "file") return "";
  if (ext) return ext.toLowerCase();
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/** Resolve file icon or image thumbnail for grid items. */
export function getEntryVisual({
  kind,
  name,
  ext,
  isEmpty,
  thumbnailSrc,
}: {
  kind: FileSystemEntry["kind"];
  name: string;
  ext?: string;
  isEmpty?: boolean;
  thumbnailSrc?: string;
}) {
  if (kind === "folder" && isBoardFolderName(name)) {
    return (
      <img
        src="/board/sketchbook-sketch-svgrepo-com.svg"
        alt="画布"
        className="h-11 w-11"
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (kind === "folder") {
    if (isEmpty === true) {
      return <Folder className="h-11 w-11 text-muted-foreground" />;
    }
    if (isEmpty === false) {
      return <FolderOpen className="h-11 w-11 text-muted-foreground" />;
    }
    return <Folder className="h-11 w-11 text-muted-foreground" />;
  }
  const normalizedExt = resolveEntryExt(kind, name, ext);
  if (IMAGE_EXTS.has(normalizedExt)) {
    return <ImageThumbnail src={thumbnailSrc} name={name} />;
  }
  if (ARCHIVE_EXTS.has(normalizedExt)) {
    return <FileArchive className="h-11 w-11 text-muted-foreground" />;
  }
  if (AUDIO_EXTS.has(normalizedExt)) {
    return <FileAudio className="h-11 w-11 text-muted-foreground" />;
  }
  if (VIDEO_EXTS.has(normalizedExt)) {
    return <FileVideo className="h-11 w-11 text-muted-foreground" />;
  }
  if (SPREADSHEET_EXTS.has(normalizedExt)) {
    return <FileSpreadsheet className="h-11 w-11 text-muted-foreground" />;
  }
  if (CODE_EXTS.has(normalizedExt)) {
    return <FileCode className="h-11 w-11 text-muted-foreground" />;
  }
  if (PDF_EXTS.has(normalizedExt)) {
    return <FileScan className="h-11 w-11 text-muted-foreground" />;
  }
  if (DOC_EXTS.has(normalizedExt)) {
    return <FileType className="h-11 w-11 text-muted-foreground" />;
  }
  return <FileText className="h-11 w-11 text-muted-foreground" />;
}
