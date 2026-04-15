/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { type ReactNode, lazy, Suspense } from "react";
import {
  buildChildUri,
  getEntryExt,
  getRelativePathFromUri,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  BOARD_INDEX_FILE_NAME,
  getBoardDisplayName,
  getDisplayFileName,
  isBoardFolderName,
} from "@/lib/file-name";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import { resolveFileViewerTarget } from "./file-viewer-target";

// Heavy viewers are lazy-loaded to avoid pulling in large dependencies at startup:
// CodeViewer → highlight.js (359KB),
// PdfViewer → pdfjs-dist (165KB), DocViewer → xmlbuilder2 (168KB),
// ExcelViewer → xlsx (222KB), VideoViewer → vidstack + media-chrome
const BoardFileViewer = lazy(() => import("@/components/board/BoardFileViewer"));
const CodeViewer = lazy(() => import("@/components/file/CodeViewer"));
const DocViewer = lazy(() => import("@/components/file/DocViewer"));
const MarkdownViewer = lazy(() => import("@/components/file/MarkdownViewer"));
const PdfViewer = lazy(() => import("@/components/file/PdfViewer"));
const ExcelViewer = lazy(() => import("@/components/file/ExcelViewer"));
const PptxViewer = lazy(() => import("@/components/file/PptxViewer"));
const VideoViewer = lazy(() => import("@/components/file/VideoViewer"));
const AudioViewer = lazy(() => import("@/components/file/AudioViewer"));

function ViewerFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      加载中...
    </div>
  );
}

/** Resolve preview display label for an entry. */
function resolvePreviewDisplayName(entry: FileSystemEntry): string {
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    return getBoardDisplayName(entry.name);
  }
  if (entry.kind === "file") {
    return getDisplayFileName(entry.name, getEntryExt(entry));
  }
  return entry.name;
}

/** Render preview content for embedded viewers. */
export function renderFilePreviewContent(input: {
  /** Entry to preview. */
  entry: FileSystemEntry;
  /** Optional root uri for path resolution. */
  rootUri?: string;
  /** Project id for file access. */
  projectId?: string;
  /** Whether preview should be read-only. */
  readOnly?: boolean;
}): ReactNode {
  const { entry, rootUri, projectId, readOnly } = input;
  const displayName = resolvePreviewDisplayName(entry);
  const ext = getEntryExt(entry);

  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    const boardFolderUri = entry.uri;
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    const boardId = boardFolderUri.split("/").filter(Boolean).pop() ?? "";
    return (
      <Suspense fallback={<ViewerFallback />}>
        <BoardFileViewer
          boardId={boardId}
          boardFolderUri={boardFolderUri}
          boardFileUri={boardFileUri}
          projectId={projectId}
          rootUri={rootUri}
        />
      </Suspense>
    );
  }

  if (entry.kind === "folder") {
    return <div className="h-full w-full p-4 text-muted-foreground">请选择文件以预览</div>;
  }

  const target = resolveFileViewerTarget(entry);
  if (!target) {
    return (
      <FileViewer
        uri={entry.uri}
        name={displayName}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
      />
    );
  }
  // 逻辑：和 stack 预览使用相同的 viewer 解析规则。
  switch (target.viewer) {
    case "image":
      return <ImageViewer uri={entry.uri} name={displayName} ext={ext} projectId={projectId} />;
    case "markdown":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <MarkdownViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            rootUri={rootUri}
            projectId={projectId}
            readOnly={readOnly}
          />
        </Suspense>
      );
    case "code":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <CodeViewer
            uri={entry.uri}
            name={displayName}
            ext={ext}
            rootUri={rootUri}
            projectId={projectId}
            readOnly={readOnly}
          />
        </Suspense>
      );
    case "pdf": {
      if (!projectId || !rootUri) {
        return <div className="h-full w-full p-4 text-destructive">未找到项目路径</div>;
      }
      // 逻辑：PDF 预览需要相对路径以匹配后端读取逻辑。
      const relativePath = getRelativePathFromUri(rootUri, entry.uri);
      if (!relativePath) {
        return <div className="h-full w-full p-4 text-destructive">无法解析PDF路径</div>;
      }
      return (
        <Suspense fallback={<ViewerFallback />}>
          <PdfViewer
            uri={relativePath}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            projectId={projectId}
            rootUri={rootUri}
          />
        </Suspense>
      );
    }
    case "doc":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <DocViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            projectId={projectId}
            rootUri={rootUri}
            readOnly={readOnly}
          />
        </Suspense>
      );
    case "sheet":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <ExcelViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            projectId={projectId}
            rootUri={rootUri}
            readOnly={readOnly}
          />
        </Suspense>
      );
    case "pptx":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <PptxViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            projectId={projectId}
            rootUri={rootUri}
          />
        </Suspense>
      );
    case "video":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <VideoViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            projectId={projectId}
            rootUri={rootUri}
          />
        </Suspense>
      );
    case "audio":
      return (
        <Suspense fallback={<ViewerFallback />}>
          <AudioViewer
            uri={entry.uri}
            openUri={entry.uri}
            name={displayName}
            ext={ext}
            projectId={projectId}
            rootUri={rootUri}
          />
        </Suspense>
      );
    default:
      return (
        <FileViewer
          uri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
          rootUri={rootUri}
        />
      );
  }
}
