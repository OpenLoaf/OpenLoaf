/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { type ReactNode } from "react";
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
import BoardFileViewer from "@/components/board/BoardFileViewer";
import CodeViewer from "@/components/file/CodeViewer";
import DocViewer from "@/components/file/DocViewer";
import FileViewer from "@/components/file/FileViewer";
import ImageViewer from "@/components/file/ImageViewer";
import MarkdownViewer from "@/components/file/MarkdownViewer";
import PdfViewer from "@/components/file/PdfViewer";
import ExcelViewer from "@/components/file/ExcelViewer";
import VideoViewer from "@/components/file/VideoViewer";
import { resolveFileViewerTarget } from "./file-viewer-target";

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
        <MarkdownViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={rootUri}
          projectId={projectId}
          readOnly={readOnly}
        />
      );
    case "code":
      return (
        <CodeViewer
          uri={entry.uri}
          name={displayName}
          ext={ext}
          rootUri={rootUri}
          projectId={projectId}
          readOnly={readOnly}
        />
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
    case "doc":
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
    case "sheet":
      return (
        <ExcelViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          ext={ext}
          projectId={projectId}
          rootUri={rootUri}
          readOnly={readOnly}
        />
      );
    case "video":
      return (
        <VideoViewer
          uri={entry.uri}
          openUri={entry.uri}
          name={displayName}
          projectId={projectId}
          rootUri={rootUri}
        />
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
