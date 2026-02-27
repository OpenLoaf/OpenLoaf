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

import { isBoardFolderName } from "@/lib/file-name";
import {
  type FileSystemEntry,
  resolveBoardFolderEntryFromIndexFile,
} from "./file-system-utils";
import {
  openWithDefaultApp,
  resolveFileViewerTarget,
  shouldOpenOfficeWithSystem,
} from "@/components/file/lib/open-file";

/** Handlers for opening filesystem entries. */
export type FileSystemEntryOpenHandlers = {
  /** Open any entry using the unified preview handler. */
  onOpenEntry?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Open image entries. */
  onOpenImage?: (entry: FileSystemEntry, thumbnailSrc?: string) => void;
  /** Open markdown entries. */
  onOpenMarkdown?: (entry: FileSystemEntry) => void;
  /** Open code entries. */
  onOpenCode?: (entry: FileSystemEntry) => void;
  /** Open PDF entries. */
  onOpenPdf?: (entry: FileSystemEntry) => void;
  /** Open DOC entries. */
  onOpenDoc?: (entry: FileSystemEntry) => void;
  /** Open spreadsheet entries. */
  onOpenSpreadsheet?: (entry: FileSystemEntry) => void;
  /** Open video entries. */
  onOpenVideo?: (entry: FileSystemEntry) => void;
  /** Open board entries. */
  onOpenBoard?: (entry: FileSystemEntry) => void;
  /** Navigate into folders. */
  onNavigate?: (nextUri: string) => void;
};

/** Options for handling entry open actions. */
export type FileSystemEntryOpenOptions = {
  /** Entry to open. */
  entry: FileSystemEntry;
  /** Root uri for resolving system open paths. */
  rootUri?: string;
  /** Thumbnail source for images. */
  thumbnailSrc?: string;
  /** Handlers for each entry type. */
  handlers: FileSystemEntryOpenHandlers;
  /** Confirm dialog override for unsupported types. */
  confirmOpen?: (message: string) => boolean;
};

/** Handle a filesystem entry open action based on type. */
export function handleFileSystemEntryOpen({
  entry,
  rootUri,
  thumbnailSrc,
  handlers,
  confirmOpen,
}: FileSystemEntryOpenOptions): boolean {
  if (handlers.onOpenEntry) {
    handlers.onOpenEntry(entry, thumbnailSrc);
    return true;
  }
  // 逻辑：index.tnboard 视为画布目录入口，统一打开画布栈。
  const boardFolderEntry = resolveBoardFolderEntryFromIndexFile(entry);
  if (boardFolderEntry) {
    handlers.onOpenBoard?.(boardFolderEntry);
    return true;
  }
  if (entry.kind === "folder" && isBoardFolderName(entry.name)) {
    handlers.onOpenBoard?.(entry);
    return true;
  }
  if (entry.kind === "folder") {
    handlers.onNavigate?.(entry.uri);
    return true;
  }
  const target = resolveFileViewerTarget(entry);
  if (!target) return false;
  if (shouldOpenOfficeWithSystem(target.ext)) {
    // 逻辑：非预览类型统一提示是否使用系统默认程序打开。
    const shouldOpen =
      confirmOpen?.("此文件类型暂不支持预览，是否使用系统默认程序打开？") ??
      window.confirm("此文件类型暂不支持预览，是否使用系统默认程序打开？");
    if (!shouldOpen) return true;
    openWithDefaultApp(entry, rootUri);
    return true;
  }
  switch (target.viewer) {
    case "image":
      handlers.onOpenImage?.(entry, thumbnailSrc);
      return true;
    case "markdown":
      handlers.onOpenMarkdown?.(entry);
      return true;
    case "code":
      handlers.onOpenCode?.(entry);
      return true;
    case "pdf":
      handlers.onOpenPdf?.(entry);
      return true;
    case "doc":
      handlers.onOpenDoc?.(entry);
      return true;
    case "sheet":
      handlers.onOpenSpreadsheet?.(entry);
      return true;
    case "video":
      handlers.onOpenVideo?.(entry);
      return true;
    case "file":
      // 逻辑：非预览类型统一提示是否使用系统默认程序打开。
      const shouldOpen =
        confirmOpen?.("此文件类型暂不支持预览，是否使用系统默认程序打开？") ??
        window.confirm("此文件类型暂不支持预览，是否使用系统默认程序打开？");
      if (!shouldOpen) return true;
      openWithDefaultApp(entry, rootUri);
      return true;
    default:
      return false;
  }
}
