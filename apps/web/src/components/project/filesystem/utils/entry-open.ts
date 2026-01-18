"use client";

import { toast } from "sonner";
import { isBoardFolderName } from "@/lib/file-name";
import {
  type FileSystemEntry,
  getEntryExt,
  resolveBoardFolderEntryFromIndexFile,
  resolveFileUriFromRoot,
} from "./file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "../components/FileSystemEntryVisual";

/** Document extensions handled by the built-in viewer. */
const INTERNAL_DOC_EXTS = new Set<string>();
/** Spreadsheet extensions handled by the built-in viewer. */
const INTERNAL_SHEET_EXTS = new Set(["csv"]);

/** Handlers for opening filesystem entries. */
export type FileSystemEntryOpenHandlers = {
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

/** Return true when the office file should open with the system default app. */
export function shouldOpenOfficeWithSystem(ext: string): boolean {
  // 逻辑：仅对内置未覆盖的 Office 扩展使用系统默认程序。
  if (DOC_EXTS.has(ext)) return !INTERNAL_DOC_EXTS.has(ext);
  if (SPREADSHEET_EXTS.has(ext)) return !INTERNAL_SHEET_EXTS.has(ext);
  return false;
}

/** Open a file via the system default handler. */
export function openWithDefaultApp(entry: FileSystemEntry, rootUri?: string): void {
  // 逻辑：桌面端通过 openPath 调起系统默认应用。
  if (!window.tenasElectron?.openPath) {
    toast.error("网页版不支持打开本地文件");
    return;
  }
  const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
  void window.tenasElectron.openPath({ uri: fileUri }).then((res) => {
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  });
}

/** Handle a filesystem entry open action based on type. */
export function handleFileSystemEntryOpen({
  entry,
  rootUri,
  thumbnailSrc,
  handlers,
  confirmOpen,
}: FileSystemEntryOpenOptions): boolean {
  const entryExt = getEntryExt(entry);
  if (entry.kind === "file" && IMAGE_EXTS.has(entryExt)) {
    handlers.onOpenImage?.(entry, thumbnailSrc);
    return true;
  }
  if (entry.kind === "file" && MARKDOWN_EXTS.has(entryExt)) {
    handlers.onOpenMarkdown?.(entry);
    return true;
  }
  if (entry.kind === "file" && CODE_EXTS.has(entryExt)) {
    handlers.onOpenCode?.(entry);
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
  if (entry.kind === "file" && isTextFallbackExt(entryExt)) {
    handlers.onOpenCode?.(entry);
    return true;
  }
  if (entry.kind === "file" && PDF_EXTS.has(entryExt)) {
    handlers.onOpenPdf?.(entry);
    return true;
  }
  if (entry.kind === "file" && DOC_EXTS.has(entryExt)) {
    if (shouldOpenOfficeWithSystem(entryExt)) {
      openWithDefaultApp(entry, rootUri);
      return true;
    }
    handlers.onOpenDoc?.(entry);
    return true;
  }
  if (entry.kind === "file" && SPREADSHEET_EXTS.has(entryExt)) {
    if (shouldOpenOfficeWithSystem(entryExt)) {
      openWithDefaultApp(entry, rootUri);
      return true;
    }
    handlers.onOpenSpreadsheet?.(entry);
    return true;
  }
  if (entry.kind === "file") {
    // 逻辑：非预览类型统一提示是否使用系统默认程序打开。
    const shouldOpen =
      confirmOpen?.("此文件类型暂不支持预览，是否使用系统默认程序打开？") ??
      window.confirm("此文件类型暂不支持预览，是否使用系统默认程序打开？");
    if (!shouldOpen) return true;
    openWithDefaultApp(entry, rootUri);
    return true;
  }
  if (entry.kind === "folder") {
    handlers.onNavigate?.(entry.uri);
    return true;
  }
  return false;
}
