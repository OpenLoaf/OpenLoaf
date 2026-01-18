"use client";

import { memo } from "react";
import {
  BOARD_INDEX_FILE_NAME,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import {
  buildChildUri,
  getEntryExt,
  getRelativePathFromUri,
  type FileSystemEntry,
} from "../utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "./FileSystemEntryVisual";
import BoardFileViewer from "@/components/board/BoardFileViewer";
import CodeViewer from "@/components/file/CodeViewer";
import DocViewer from "@/components/file/DocViewer";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import PdfViewer from "@/components/file/PdfViewer";
import SheetViewer from "@/components/file/SheetViewer";

export type FileSystemEntryPreviewContentProps = {
  /** Entry to preview. */
  entry: FileSystemEntry;
  /** Optional root uri for path resolution. */
  rootUri?: string;
  /** Project id for file access. */
  projectId?: string;
  /** Whether preview should be read-only. */
  readOnly?: boolean;
};

/** Resolve display label for preview content. */
function resolvePreviewDisplayName(entry: FileSystemEntry): string {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Render preview content for file system entries. */
const FileSystemEntryPreviewContent = memo(function FileSystemEntryPreviewContent({
  entry,
  rootUri,
  projectId,
  readOnly,
}: FileSystemEntryPreviewContentProps) {
  const displayName = resolvePreviewDisplayName(entry);
  const ext = getEntryExt(entry);

  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    const boardFolderUri = entry.uri;
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    return (
      <BoardFileViewer
        boardFolderUri={boardFolderUri}
        boardFileUri={boardFileUri}
        projectId={projectId}
        rootUri={rootUri}
      />
    );
  }

  if (entry.kind === "folder") {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">请选择文件以预览</div>
    );
  }

  // 逻辑：先匹配常见格式，再回退到通用预览。
  if (IMAGE_EXTS.has(ext)) {
    return (
      <ImageViewer
        uri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
      />
    );
  }
  if (MARKDOWN_EXTS.has(ext)) {
    return (
      <MarkdownViewer
        uri={entry.uri}
        openUri={entry.uri}
        name={displayName}
        ext={ext}
        rootUri={rootUri}
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
        rootUri={rootUri}
        projectId={projectId}
      />
    );
  }
  if (PDF_EXTS.has(ext)) {
    if (!projectId || !rootUri) {
      return <div className="h-full w-full p-4 text-destructive">未找到项目路径</div>;
    }
    // 逻辑：PDF 预览需要相对路径以匹配后端读取逻辑。
    const relativePath = getRelativePathFromUri(rootUri, entry.uri);
    if (!relativePath) {
      return <div className="h-full w-full p-4 text-destructive">无法解析PDF路径</div>;
    }
    return (
      <PdfViewer
        uri={relativePath}
        openUri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
      />
    );
  }
  if (DOC_EXTS.has(ext)) {
    return (
      <DocViewer
        uri={entry.uri}
        openUri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
        readOnly={readOnly}
      />
    );
  }
  if (SPREADSHEET_EXTS.has(ext)) {
    return (
      <SheetViewer
        uri={entry.uri}
        openUri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
        readOnly={readOnly}
      />
    );
  }

  return (
    <FileViewer
      uri={entry.uri}
      name={displayName}
      ext={ext}
      projectId={projectId}
    />
  );
});

FileSystemEntryPreviewContent.displayName = "FileSystemEntryPreviewContent";

export { FileSystemEntryPreviewContent };
