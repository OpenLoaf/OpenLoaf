"use client";

import { memo } from "react";
import { FileIcon, defaultStyles } from "react-file-icon";
import { isBoardFileExt, isBoardFolderName } from "@/lib/file-name";
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
/** File extensions treated as markdown documents. */
export const MARKDOWN_EXTS = new Set(["md", "mdx", "markdown"]);
/** File extensions treated as plain text for the code viewer fallback. */
export const TEXT_EXTS = new Set([
  "txt",
  "text",
  "log",
  "env",
  "jsonl",
  "jsonc",
  "conf",
  "properties",
  "cfg",
  "ini",
]);
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
  "mdx",
]);

/** Return true when the extension should fall back to the code viewer. */
export function isTextFallbackExt(ext?: string): boolean {
  const normalized = (ext ?? "").toLowerCase();
  if (!normalized) return true;
  if (TEXT_EXTS.has(normalized)) return true;
  if (IMAGE_EXTS.has(normalized)) return false;
  if (ARCHIVE_EXTS.has(normalized)) return false;
  if (AUDIO_EXTS.has(normalized)) return false;
  if (VIDEO_EXTS.has(normalized)) return false;
  if (PDF_EXTS.has(normalized)) return false;
  if (DOC_EXTS.has(normalized)) return false;
  if (SPREADSHEET_EXTS.has(normalized)) return false;
  return true;
}

/** Resolve file icon styles for react-file-icon. */
function resolveFileIconStyle(extension?: string) {
  const normalized = (extension ?? "").toLowerCase();
  const fallbackStyle = defaultStyles.txt ?? {};
  if (!normalized) return fallbackStyle;
  if (defaultStyles[normalized]) return defaultStyles[normalized];
  if (IMAGE_EXTS.has(normalized)) return { ...fallbackStyle, type: "image" };
  if (ARCHIVE_EXTS.has(normalized)) return { ...fallbackStyle, type: "compressed" };
  if (AUDIO_EXTS.has(normalized)) return { ...fallbackStyle, type: "audio" };
  if (VIDEO_EXTS.has(normalized)) return { ...fallbackStyle, type: "video" };
  if (SPREADSHEET_EXTS.has(normalized)) {
    return { ...fallbackStyle, type: "spreadsheet" };
  }
  if (MARKDOWN_EXTS.has(normalized)) return { ...fallbackStyle, type: "document" };
  if (CODE_EXTS.has(normalized)) return { ...fallbackStyle, type: "code" };
  if (PDF_EXTS.has(normalized)) return { ...fallbackStyle, type: "acrobat" };
  if (DOC_EXTS.has(normalized)) return { ...fallbackStyle, type: "document" };
  return fallbackStyle;
}

/** Resolve folder icon palette for the custom folder SVG. */
function resolveFolderIconStyle(isEmpty?: boolean) {
  const baseStyle = {
    color: "#F6D688",
    gradientColor: "#FBE9BC",
    gradientOpacity: 0.25,
    glyphColor: "#B37523",
  };
  // 逻辑：空文件夹更浅，非空文件夹更深，未知状态居中。
  if (isEmpty === true) {
    return {
      ...baseStyle,
      color: "#F9E7B0",
      gradientColor: "#FFF4D9",
      glyphColor: "#C58A2A",
    };
  }
  if (isEmpty === false) {
    return {
      ...baseStyle,
      color: "#F3C86A",
      gradientColor: "#FBE2A5",
      glyphColor: "#A66B1E",
    };
  }
  return {
    ...baseStyle,
    color: "#F6D688",
    gradientColor: "#FBE9BC",
    glyphColor: "#B37523",
  };
}

/** Resolve board icon palette for canvas entries. */
function resolveBoardIconStyle() {
  return {
    color: "#E3F2FF",
    gradientColor: "#C7E6FF",
    gradientOpacity: 0.65,
    glyphColor: "#1E3A8A",
  };
}

/** Folder icon render options. */
type FolderIconProps = {
  /** Whether the folder is empty. */
  isEmpty?: boolean;
  /** Tailwind class names for sizing. */
  className?: string;
  /** Display an upward arrow overlay for parent navigation. */
  showArrow?: boolean;
};

/** Render a folder icon with a tabbed silhouette. */
export const FolderIcon = memo(function FolderIcon({
  isEmpty,
  className = "h-full w-full",
  showArrow = false,
}: FolderIconProps) {
  const { color, gradientColor, gradientOpacity, glyphColor } =
    resolveFolderIconStyle(isEmpty);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5H10l2.5 2.5H19A2.5 2.5 0 0 1 21.5 10v7.5A2.5 2.5 0 0 1 19 20H5.5A2.5 2.5 0 0 1 3 17.5V7.5z"
        fill={color}
      />
      <path
        d="M5 5.5h5.8l2.2 2.2H5z"
        fill={gradientColor}
        opacity={0.65}
      />
      <path
        d="M3 10h18.5v2.5H3z"
        fill={gradientColor}
        opacity={gradientOpacity}
      />
      <path
        d="M3 10h18.5"
        stroke={glyphColor}
        strokeOpacity={0.2}
        strokeWidth={0.6}
      />
      {showArrow ? (
        <path
          d="M12 16V12m0 0l-2.4 2.4M12 12l2.4 2.4"
          stroke={glyphColor}
          strokeOpacity={0.85}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
});

/** Board icon render options. */
type BoardIconProps = {
  /** Tailwind class names for sizing. */
  className?: string;
};

/** Render a canvas icon for board entries. */
const BoardIcon = memo(function BoardIcon({
  className = "h-full w-full",
}: BoardIconProps) {
  const { color, gradientColor, gradientOpacity, glyphColor } =
    resolveBoardIconStyle();
  const blockPalette = {
    blue: "#60A5FA",
    amber: "#F59E0B",
    emerald: "#34D399",
    violet: "#A78BFA",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="15.5" rx="3" fill={color} />
      <rect
        x="3"
        y="4"
        width="18"
        height="3.2"
        rx="3"
        fill={gradientColor}
        opacity={gradientOpacity}
      />
      <rect
        x="5.2"
        y="7.6"
        width="5.6"
        height="3.9"
        rx="1.1"
        fill={blockPalette.blue}
        opacity={0.95}
      />
      <rect
        x="11.3"
        y="7.6"
        width="7.5"
        height="3.9"
        rx="1.1"
        fill={blockPalette.amber}
        opacity={0.92}
      />
      <rect
        x="5.2"
        y="12.1"
        width="8.4"
        height="5.1"
        rx="1.2"
        fill={blockPalette.emerald}
        opacity={0.9}
      />
      <rect
        x="14.2"
        y="12.1"
        width="4.6"
        height="5.1"
        rx="1.2"
        fill={blockPalette.violet}
        opacity={0.88}
      />
      <path
        d="M3 10.8h18"
        stroke={glyphColor}
        strokeOpacity={gradientOpacity}
        strokeWidth={0.8}
      />
      <rect
        x="3"
        y="4"
        width="18"
        height="15.5"
        rx="3"
        fill="none"
        stroke={glyphColor}
        strokeOpacity={0.18}
        strokeWidth={0.8}
      />
    </svg>
  );
});

/** Render a thumbnail preview for image files. */
const ImageThumbnail = memo(function ImageThumbnail({
  src,
  name,
  extension,
  sizeClassName = "h-11 w-11",
  iconClassName = "h-full w-full p-2 text-muted-foreground",
}: {
  src?: string | null;
  name: string;
  extension?: string;
  sizeClassName?: string;
  iconClassName?: string;
}) {
  const style = resolveFileIconStyle(extension);
  return (
    <div className={`${sizeClassName} overflow-hidden bg-muted/40`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className={`${iconClassName} flex items-center justify-center [&>svg]:h-full [&>svg]:w-full`}
        >
          <FileIcon extension={extension || undefined} {...style} />
        </div>
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
  sizeClassName = "h-11 w-11",
  thumbnailIconClassName = "h-full w-full p-2 text-muted-foreground",
}: {
  kind: FileSystemEntry["kind"];
  name: string;
  ext?: string;
  isEmpty?: boolean;
  thumbnailSrc?: string;
  sizeClassName?: string;
  thumbnailIconClassName?: string;
}) {
  if (kind === "folder" && isBoardFolderName(name)) {
    return (
      <BoardIcon className={sizeClassName} />
    );
  }
  if (kind === "folder") {
    return (
      <div
        className={`${sizeClassName} flex items-center justify-center [&>svg]:h-full [&>svg]:w-full`}
      >
        <FolderIcon isEmpty={isEmpty} />
      </div>
    );
  }
  const normalizedExt = resolveEntryExt(kind, name, ext);
  if (isBoardFileExt(normalizedExt)) {
    return <BoardIcon className={sizeClassName} />;
  }
  if (IMAGE_EXTS.has(normalizedExt)) {
    return (
      <ImageThumbnail
        src={thumbnailSrc}
        name={name}
        extension={normalizedExt}
        sizeClassName={sizeClassName}
        iconClassName={thumbnailIconClassName}
      />
    );
  }
  const style = resolveFileIconStyle(normalizedExt);
  return (
    <div
      className={`${sizeClassName} flex items-center justify-center [&>svg]:h-full [&>svg]:w-full`}
    >
      <FileIcon extension={normalizedExt || undefined} {...style} />
    </div>
  );
}
