"use client";

import { Fragment, memo, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { type FileSystemEntry, getEntryExt } from "./file-system-utils";

const IMAGE_EXTS = new Set([
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
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "gz", "tar", "bz2", "xz"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aac"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const SPREADSHEET_EXTS = new Set(["xls", "xlsx", "csv", "tsv", "numbers"]);
const CODE_EXTS = new Set([
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

type FileSystemGridProps = {
  entries: FileSystemEntry[];
  isLoading: boolean;
  parentUri?: string | null;
  onNavigate?: (nextUri: string) => void;
  showEmptyActions?: boolean;
  renderEntry?: (entry: FileSystemEntry, node: ReactNode) => ReactNode;
  onEntryContextMenu?: (
    entry: FileSystemEntry,
    event: MouseEvent<HTMLButtonElement>
  ) => void;
  selectedUri?: string | null;
};

type FileSystemEntryCardProps = {
  entry: FileSystemEntry;
  onDoubleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isSelected?: boolean;
};

/** Build a low-res preview for image files. */
const ImageThumbnail = memo(function ImageThumbnail({
  uri,
  name,
}: {
  uri: string;
  name: string;
}) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (canceled) return;
      const maxSize = 96;
      const scale = Math.min(
        maxSize / image.width,
        maxSize / image.height,
        1
      );
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setPreviewSrc(uri);
        return;
      }
      // 生成低分辨率缩略图，避免显示原图尺寸。
      ctx.drawImage(image, 0, 0, width, height);
      setPreviewSrc(canvas.toDataURL("image/jpeg", 0.6));
    };
    image.onerror = () => {
      if (canceled) return;
      setPreviewSrc(null);
    };
    image.src = uri;
    return () => {
      canceled = true;
    };
  }, [uri]);

  return (
    <div className="h-12 w-12 overflow-hidden rounded-md bg-muted/40">
      {previewSrc ? (
        <img
          src={previewSrc}
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

/** Resolve file icon or image thumbnail for grid items. */
function getEntryVisual(entry: FileSystemEntry) {
  if (entry.kind === "folder") {
    return <Folder className="h-10 w-10 text-muted-foreground" />;
  }
  const ext = getEntryExt(entry);
  if (IMAGE_EXTS.has(ext)) {
    return <ImageThumbnail uri={entry.uri} name={entry.name} />;
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return <FileArchive className="h-10 w-10 text-muted-foreground" />;
  }
  if (AUDIO_EXTS.has(ext)) {
    return <FileAudio className="h-10 w-10 text-muted-foreground" />;
  }
  if (VIDEO_EXTS.has(ext)) {
    return <FileVideo className="h-10 w-10 text-muted-foreground" />;
  }
  if (SPREADSHEET_EXTS.has(ext)) {
    return <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />;
  }
  if (CODE_EXTS.has(ext)) {
    return <FileCode className="h-10 w-10 text-muted-foreground" />;
  }
  return <FileText className="h-10 w-10 text-muted-foreground" />;
}

/** Render a single file system entry card. */
const FileSystemEntryCard = memo(function FileSystemEntryCard({
  entry,
  onDoubleClick,
  onContextMenu,
  isSelected = false,
}: FileSystemEntryCardProps) {
  const visual = getEntryVisual(entry);
  return (
    <button
      type="button"
      className={`flex flex-col items-center gap-3 rounded-md px-3 py-4 text-center text-xs text-foreground hover:bg-muted/60 ${
        isSelected ? "bg-muted/70 ring-1 ring-border" : ""
      }`}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {visual}
      <span className="line-clamp-2 w-full">{entry.name}</span>
    </button>
  );
});

/** File system grid with empty state. */
const FileSystemGrid = memo(function FileSystemGrid({
  entries,
  isLoading,
  parentUri,
  onNavigate,
  showEmptyActions = true,
  renderEntry,
  onEntryContextMenu,
  selectedUri,
}: FileSystemGridProps) {
  return (
    <>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">正在读取文件...</div>
      ) : null}
      {!isLoading && entries.length === 0 ? (
        <div className="flex h-full items-center justify-center -translate-y-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Folder />
              </EmptyMedia>
              <EmptyTitle>暂无文件</EmptyTitle>
              <EmptyDescription>创建一个智能文档或智能画布开始工作。</EmptyDescription>
            </EmptyHeader>
            {showEmptyActions ? (
              <EmptyContent>
                <div className="flex gap-2">
                  <Button>创建智能文档</Button>
                  <Button variant="outline">创建智能画布</Button>
                </div>
              </EmptyContent>
            ) : null}
            {parentUri ? (
              <Button
                variant="link"
                className="text-muted-foreground"
                size="sm"
                onClick={() => onNavigate?.(parentUri)}
              >
                <ArrowLeftIcon />
                返回上级
              </Button>
            ) : null}
          </Empty>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {entries.map((entry) => {
          const card = (
            <FileSystemEntryCard
              entry={entry}
              isSelected={selectedUri === entry.uri}
              onDoubleClick={() => {
                if (entry.kind !== "folder") return;
                // 双击文件夹进入下一级目录。
                onNavigate?.(entry.uri);
              }}
              onContextMenu={(event) => onEntryContextMenu?.(entry, event)}
            />
          );
          return (
            <Fragment key={entry.uri}>
              {renderEntry ? renderEntry(entry, card) : card}
            </Fragment>
          );
        })}
      </div>
    </>
  );
});

export type { FileSystemEntry };
export { FileSystemEntryCard, FileSystemGrid };
