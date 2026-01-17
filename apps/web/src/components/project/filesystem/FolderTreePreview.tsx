"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FileSystemGitTree from "./components/FileSystemGitTree";
import type { FileSystemEntry } from "./utils/file-system-utils";
import {
  buildChildUri,
  getEntryExt,
  getRelativePathFromUri,
} from "./utils/file-system-utils";
import {
  BOARD_INDEX_FILE_NAME,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "./components/FileSystemEntryVisual";
import BoardFileViewer from "@/components/board/BoardFileViewer";
import CodeViewer from "@/components/file/CodeViewer";
import DocViewer from "@/components/file/DocViewer";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import PdfViewer from "@/components/file/PdfViewer";
import SheetViewer from "@/components/file/SheetViewer";

interface FolderTreePreviewProps {
  rootUri?: string;
  /** Optional root uri for preview resolution. */
  viewerRootUri?: string;
  currentUri?: string | null;
  projectId?: string;
  projectTitle?: string;
}

/** Resolve the entry name from uri. */
function resolveEntryNameFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts.at(-1) ?? "");
  } catch {
    return uri;
  }
}

/** Resolve a display label for the preview viewer. */
function resolveViewerLabel(entry: FileSystemEntry): string {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Render a lightweight folder tree preview panel. */
export default function FolderTreePreview({
  rootUri,
  viewerRootUri,
  currentUri,
  projectId,
  projectTitle,
}: FolderTreePreviewProps) {
  const [selectedUris, setSelectedUris] = useState<Set<string>>(() => {
    const initial = currentUri?.trim();
    return initial ? new Set([initial]) : new Set();
  });
  const [selectedEntry, setSelectedEntry] = useState<FileSystemEntry | null>(() => {
    const initial = currentUri?.trim();
    if (!initial) return null;
    return {
      uri: initial,
      name: resolveEntryNameFromUri(initial),
      kind: "folder",
    };
  });

  useEffect(() => {
    const initial = currentUri?.trim();
    setSelectedUris(initial ? new Set([initial]) : new Set());
    setSelectedEntry(
      initial
        ? {
            uri: initial,
            name: resolveEntryNameFromUri(initial),
            kind: "folder",
          }
        : null
    );
  }, [currentUri, rootUri]);

  const handleSelectEntry = useCallback((entry: FileSystemEntry) => {
    // 中文注释：点击条目时更新高亮与预览内容。
    setSelectedUris(new Set([entry.uri]));
    setSelectedEntry(entry);
  }, []);

  const viewer = useMemo(() => {
    if (!selectedEntry) {
      return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
    }
    const entry = selectedEntry;
    const displayName = resolveViewerLabel(entry);
    const effectiveViewerRootUri = viewerRootUri ?? rootUri;
    if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
      const boardFolderUri = entry.uri;
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      return (
        <BoardFileViewer
          boardFolderUri={boardFolderUri}
          boardFileUri={boardFileUri}
          projectId={projectId}
          rootUri={effectiveViewerRootUri}
        />
      );
    }
    if (entry.kind === "folder") {
      return (
        <div className="h-full w-full p-4 text-muted-foreground">
          请选择文件以预览
        </div>
      );
    }
    const ext = getEntryExt(entry);
    // 逻辑：先处理已知类型，再回退到通用预览。
    if (IMAGE_EXTS.has(ext)) {
      return <ImageViewer uri={entry.uri} name={displayName} ext={ext} />;
    }
    if (MARKDOWN_EXTS.has(ext)) {
      return (
        <MarkdownViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={effectiveViewerRootUri}
          projectId={projectId}
        />
      );
    }
    if (CODE_EXTS.has(ext) || isTextFallbackExt(ext)) {
      return (
        <CodeViewer
          uri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={effectiveViewerRootUri}
          projectId={projectId}
        />
      );
    }
    if (PDF_EXTS.has(ext)) {
      if (!projectId || !effectiveViewerRootUri) {
        return <div className="h-full w-full p-4 text-destructive">未找到项目路径</div>;
      }
      const relativePath = getRelativePathFromUri(effectiveViewerRootUri, entry.uri);
      if (!relativePath) {
        return <div className="h-full w-full p-4 text-destructive">无法解析PDF路径</div>;
      }
      const pdfUri = relativePath;
      return (
        <PdfViewer
          uri={pdfUri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
        />
      );
    }
    if (DOC_EXTS.has(ext)) {
      return <DocViewer uri={entry.uri} openUri={entry.uri} name={displayName} ext={ext} />;
    }
    if (SPREADSHEET_EXTS.has(ext)) {
      return <SheetViewer uri={entry.uri} openUri={entry.uri} name={displayName} ext={ext} />;
    }
    return <FileViewer uri={entry.uri} name={displayName} ext={ext} />;
  }, [projectId, rootUri, selectedEntry, viewerRootUri]);

  if (!rootUri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未找到目录</div>;
  }

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="flex h-full min-h-0">
        <div className="flex w-72 min-w-[220px] flex-col border-r border-border/70">
          <div className="flex-1 min-h-0 overflow-auto p-2">
            <FileSystemGitTree
              rootUri={rootUri}
              projectTitle={projectTitle}
              currentUri={currentUri}
              selectedUris={selectedUris}
              showHidden={false}
              sortField="name"
              sortOrder="asc"
              onSelectEntry={handleSelectEntry}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <div className="h-full w-full">{viewer}</div>
        </div>
      </div>
    </div>
  );
}
