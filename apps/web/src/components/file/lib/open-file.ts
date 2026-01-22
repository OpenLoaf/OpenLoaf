"use client";

import { toast } from "sonner";
import { useTabs } from "@/hooks/use-tabs";
import {
  buildChildUri,
  getEntryExt,
  getRelativePathFromUri,
  resolveBoardFolderEntryFromIndexFile,
  resolveFileUriFromRoot,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  isTextFallbackExt,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import {
  BOARD_INDEX_FILE_NAME,
  getBoardDisplayName,
  isBoardFolderName,
} from "@/lib/file-name";
import { openFilePreview } from "./file-preview-store";
import type { FilePreviewItem, FilePreviewPayload, FilePreviewViewer } from "./file-preview-types";

export type FileOpenMode = "stack" | "modal";

export type FileOpenInput = {
  /** Target entry to open. */
  entry: FileSystemEntry;
  /** Current tab id for stack open. */
  tabId?: string | null;
  /** Project id for file previews. */
  projectId?: string;
  /** Workspace root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for image preview. */
  thumbnailSrc?: string;
  /** Open mode (stack by default). */
  mode?: FileOpenMode;
  /** Optional confirm override for unsupported types. */
  confirmOpen?: (message: string) => boolean;
  /** Optional folder navigation handler. */
  onNavigate?: (nextUri: string) => void;
  /** Optional board open options. */
  board?: {
    /** Whether to mark board for pending rename. */
    pendingRename?: boolean;
  };
  /** Optional modal config. */
  modal?: {
    /** Whether to show save button. */
    showSave?: boolean;
    /** Whether to enable edit mode. */
    enableEdit?: boolean;
    /** Default dir for save dialog. */
    saveDefaultDir?: string;
  };
};

export type FileViewerTarget = {
  /** Viewer type resolved from entry. */
  viewer: FilePreviewViewer;
  /** Normalized extension. */
  ext: string;
};

/** Document extensions handled by the built-in viewer. */
const INTERNAL_DOC_EXTS = new Set<string>();
/** Spreadsheet extensions handled by the built-in viewer. */
const INTERNAL_SHEET_EXTS = new Set(["csv"]);

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
  return { viewer: "file", ext };
}

/** Normalize a filename from a uri or fallback. */
function resolveEntryName(uri: string, fallback?: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return fallback ?? "file";
  const base = trimmed.split("/").pop() ?? "";
  const clean = base.split("?")[0]?.split("#")[0] ?? base;
  const decoded = clean ? decodeURIComponent(clean) : "";
  return decoded || fallback || "file";
}

/** Resolve extension from a media type value. */
function resolveExtFromMediaType(mediaType?: string): string {
  if (!mediaType) return "";
  const normalized = mediaType.toLowerCase();
  if (!normalized.includes("/")) return "";
  const ext = normalized.split("/")[1]?.split(";")[0] ?? "";
  if (ext === "jpeg") return "jpg";
  if (ext === "svg+xml") return "svg";
  return ext;
}

/** Resolve extension from a uri or name. */
function resolveExtFromValue(value?: string): string {
  if (!value) return "";
  const clean = value.split("?")[0]?.split("#")[0] ?? value;
  const base = clean.split("/").pop() ?? clean;
  const match = base.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

/** Create a file entry from a uri and optional hints. */
export function createFileEntryFromUri(input: {
  /** Source uri for the file. */
  uri: string;
  /** Optional display name. */
  name?: string;
  /** Optional media type. */
  mediaType?: string;
}): FileSystemEntry | null {
  const trimmedUri = input.uri.trim();
  if (!trimmedUri) return null;
  const name = (input.name ?? "").trim() || resolveEntryName(trimmedUri);
  const ext =
    resolveExtFromValue(name) ||
    resolveExtFromValue(trimmedUri) ||
    resolveExtFromMediaType(input.mediaType);
  return {
    uri: trimmedUri,
    name,
    kind: "file",
    ext: ext || undefined,
  };
}

/** Resolve preview uri for stack or modal viewers. */
function resolvePreviewUri(entry: FileSystemEntry, rootUri?: string, viewer?: FilePreviewViewer) {
  if (viewer !== "pdf") return entry.uri;
  if (!rootUri) return entry.uri;
  const relativePath = getRelativePathFromUri(rootUri, entry.uri);
  return relativePath || entry.uri;
}

/** Build preview payload for modal usage. */
function buildPreviewPayload(input: {
  /** Viewer target. */
  viewer: FilePreviewViewer;
  /** Entry to preview. */
  entry: FileSystemEntry;
  /** Project id for file queries. */
  projectId?: string;
  /** Root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for images. */
  thumbnailSrc?: string;
  /** Optional modal overrides. */
  modal?: FileOpenInput["modal"];
}): FilePreviewPayload {
  const previewUri = resolvePreviewUri(input.entry, input.rootUri, input.viewer);
  const item: FilePreviewItem = {
    uri: previewUri,
    openUri: input.entry.uri,
    name: input.entry.name,
    title: input.entry.name,
    saveName: input.entry.name,
    ext: input.entry.ext,
    projectId: input.projectId,
    rootUri: input.rootUri,
    thumbnailSrc: input.thumbnailSrc,
  };
  return {
    viewer: input.viewer,
    items: [item],
    activeIndex: 0,
    showSave: input.modal?.showSave,
    enableEdit: input.modal?.enableEdit,
    saveDefaultDir: input.modal?.saveDefaultDir,
  };
}

/** Build stack item params for a viewer. */
export function buildStackItemForEntry(input: {
  /** Entry to open. */
  entry: FileSystemEntry;
  /** Project id for previews. */
  projectId?: string;
  /** Root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for images. */
  thumbnailSrc?: string;
}): { id: string; component: string; title: string; params: Record<string, unknown> } | null {
  const target = resolveFileViewerTarget(input.entry);
  if (!target) return null;
  const previewUri = resolvePreviewUri(input.entry, input.rootUri, target.viewer);
  const baseParams: Record<string, unknown> = {
    uri: previewUri,
    openUri: input.entry.uri,
    name: input.entry.name,
    ext: input.entry.ext,
  };
  // 逻辑：不同 viewer 需要不同的额外参数。
  switch (target.viewer) {
    case "image":
      return {
        id: input.entry.uri,
        component: "image-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          projectId: input.projectId,
          thumbnailSrc: input.thumbnailSrc,
          rootUri: input.rootUri,
        },
      };
    case "markdown":
      return {
        id: input.entry.uri,
        component: "markdown-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          __customHeader: true,
          rootUri: input.rootUri,
          projectId: input.projectId,
        },
      };
    case "code":
      return {
        id: input.entry.uri,
        component: "code-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          rootUri: input.rootUri,
          projectId: input.projectId,
        },
      };
    case "pdf":
      if (!input.projectId || !input.rootUri) {
        toast.error("未找到项目路径");
        return null;
      }
      return {
        id: input.entry.uri,
        component: "pdf-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          uri: previewUri,
          projectId: input.projectId,
          rootUri: input.rootUri,
          __customHeader: true,
        },
      };
    case "doc":
      return {
        id: input.entry.uri,
        component: "doc-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          rootUri: input.rootUri,
          __customHeader: true,
        },
      };
    case "sheet":
      return {
        id: input.entry.uri,
        component: "sheet-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          rootUri: input.rootUri,
          __customHeader: true,
        },
      };
    case "file":
      return {
        id: input.entry.uri,
        component: "file-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          projectId: input.projectId,
        },
      };
    default:
      return null;
  }
}

/** Open a file entry using stack or modal behavior. */
export function openFile(input: FileOpenInput): boolean {
  const mode = input.mode ?? "stack";
  const boardEntry = resolveBoardFolderEntryFromIndexFile(input.entry);
  if (boardEntry) {
    if (!input.tabId) {
      toast.error("未找到当前标签页");
      return true;
    }
    const boardFolderUri = boardEntry.uri;
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    const displayName = getBoardDisplayName(boardEntry.name);
    useTabs.getState().pushStackItem(input.tabId, {
      id: boardFolderUri,
      component: "board-viewer",
      title: displayName,
      params: {
        uri: boardFolderUri,
        boardFolderUri,
        boardFileUri,
        name: boardEntry.name,
        projectId: input.projectId,
        rootUri: input.rootUri,
        __opaque: true,
        ...(input.board?.pendingRename ? { __pendingRename: true } : {}),
      },
    });
    return true;
  }

  if (input.entry.kind === "folder") {
    if (isBoardFolderName(input.entry.name)) {
      if (!input.tabId) {
        toast.error("未找到当前标签页");
        return true;
      }
      const boardFolderUri = input.entry.uri;
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      const displayName = getBoardDisplayName(input.entry.name);
      useTabs.getState().pushStackItem(input.tabId, {
        id: boardFolderUri,
        component: "board-viewer",
        title: displayName,
        params: {
          uri: boardFolderUri,
          boardFolderUri,
          boardFileUri,
          name: input.entry.name,
          projectId: input.projectId,
          rootUri: input.rootUri,
          __opaque: true,
          ...(input.board?.pendingRename ? { __pendingRename: true } : {}),
        },
      });
      return true;
    }
    if (input.onNavigate) {
      input.onNavigate(input.entry.uri);
      return true;
    }
    return false;
  }

  if (input.entry.kind !== "file") return false;

  const target = resolveFileViewerTarget(input.entry);
  if (!target) return false;

  if (shouldOpenOfficeWithSystem(target.ext)) {
    const shouldOpen =
      input.confirmOpen?.("此文件类型暂不支持预览，是否使用系统默认程序打开？") ??
      window.confirm("此文件类型暂不支持预览，是否使用系统默认程序打开？");
    if (!shouldOpen) return true;
    openWithDefaultApp(input.entry, input.rootUri);
    return true;
  }

  if (mode === "modal") {
    const payload = buildPreviewPayload({
      viewer: target.viewer,
      entry: input.entry,
      projectId: input.projectId,
      rootUri: input.rootUri,
      thumbnailSrc: input.thumbnailSrc,
      modal: input.modal,
    });
    openFilePreview(payload);
    return true;
  }

  if (!input.tabId) {
    toast.error("未找到当前标签页");
    return true;
  }

  const stackItem = buildStackItemForEntry({
    entry: input.entry,
    projectId: input.projectId,
    rootUri: input.rootUri,
    thumbnailSrc: input.thumbnailSrc,
  });
  if (!stackItem) return true;
  useTabs.getState().pushStackItem(input.tabId, stackItem);
  return true;
}
