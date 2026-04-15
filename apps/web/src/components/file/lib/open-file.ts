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

import { type ReactNode } from "react";
import { toast } from "sonner";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { useLayoutState } from "@/hooks/use-layout-state";
import {
  buildChildUri,
  getRelativePathFromUri,
  resolveBoardFolderEntryFromIndexFile,
  resolveDocFolderEntryFromIndexFile,
  resolveFileUriFromRoot,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";
import { DOC_EXTS, SPREADSHEET_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { resolveServerUrl } from "@/utils/server-url";
import {
  BOARD_INDEX_FILE_NAME,
  DOC_INDEX_FILE_NAME,
  getBoardDisplayName,
  getDocDisplayName,
  isBoardFolderName,
  isDocFolderName,
} from "@/lib/file-name";
import { openFilePreview as openFilePreviewDialog } from "./file-preview-store";
import type { FilePreviewItem, FilePreviewPayload, FilePreviewViewer } from "./file-preview-types";
import { resolveFileViewerTarget } from "./file-viewer-target";
export { resolveFileViewerTarget } from "./file-viewer-target";
import { renderFilePreviewContent } from "./open-file-preview";
import { recordRecentOpen } from "./recent-open";

export type FileOpenMode = "stack" | "modal" | "embed";

export type FileOpenInput = {
  /** Target entry to open. */
  entry: FileSystemEntry;
  /** @deprecated No longer used in single-view mode. */
  tabId?: string | null;
  /** Project id for file previews. */
  projectId?: string;
  /**
   * Chat session id — required when entry.uri uses ${CURRENT_CHAT_DIR} template.
   * 必须显式 props 穿透：FilePreviewDialog 在 Providers 根层级、stack viewer 通过 layout state
   * 渲染，都不在 ChatSessionProvider 树内，useOptionalChatSession() 会静默返回 null。
   */
  sessionId?: string;
  /** Project storage or project root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for image preview. */
  thumbnailSrc?: string;
  /** Open mode (stack by default). */
  mode?: FileOpenMode;
  /** Optional confirm override for unsupported types. */
  confirmOpen?: (message: string) => boolean;
  /** Optional folder navigation handler. */
  onNavigate?: (nextUri: string) => void;
  /** Optional read only flag for embedded preview. */
  readOnly?: boolean;
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

/** Document extensions handled by the built-in viewer. */
const INTERNAL_DOC_EXTS = new Set(["doc", "docx"]);
/** Spreadsheet extensions handled by the built-in viewer. */
const INTERNAL_SHEET_EXTS = new Set(SPREADSHEET_EXTS);

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
  if (!window.openloafElectron?.openPath) {
    toast.error("网页版不支持打开本地文件");
    return;
  }
  const fileUri = resolveFileUriFromRoot(rootUri, entry.uri);
  void window.openloafElectron.openPath({ uri: fileUri }).then((res) => {
    if (!res?.ok) {
      toast.error(res?.reason ?? "无法打开文件");
    }
  });
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
  /** Chat session id for ${CURRENT_CHAT_DIR} template resolution. */
  sessionId?: string;
  /** Root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for images. */
  thumbnailSrc?: string;
  /** Whether the preview should be read-only. */
  readOnly?: boolean;
  /** Optional modal overrides. */
  modal?: FileOpenInput["modal"];
}): FilePreviewPayload {
  const previewUri = resolvePreviewUri(input.entry, input.rootUri, input.viewer);
  const displayName = input.entry.name || resolveEntryName(input.entry.uri);
  const item: FilePreviewItem = {
    uri: previewUri,
    openUri: input.entry.uri,
    name: displayName,
    title: displayName,
    saveName: displayName,
    ext: input.entry.ext,
    projectId: input.projectId,
    sessionId: input.sessionId,
    rootUri: input.rootUri,
    thumbnailSrc: input.thumbnailSrc,
  };
  return {
    viewer: input.viewer,
    readOnly: input.readOnly,
    items:
      input.viewer === "video"
        ? [
            {
              ...item,
              name: displayName,
              title: displayName,
            },
          ]
        : [
            {
              ...item,
              name: "",
              title: "",
            },
          ],
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
  /** Chat session id for ${CURRENT_CHAT_DIR} template resolution. */
  sessionId?: string;
  /** Root uri for system open. */
  rootUri?: string;
  /** Optional thumbnail for images. */
  thumbnailSrc?: string;
  /** Whether the preview should be read-only. */
  readOnly?: boolean;
}): { id: string; component: string; title: string; params: Record<string, unknown> } | null {
  const target = resolveFileViewerTarget(input.entry);
  if (!target) return null;
  const previewUri = resolvePreviewUri(input.entry, input.rootUri, target.viewer);
  const baseParams: Record<string, unknown> = {
    uri: previewUri,
    openUri: input.entry.uri,
    name: input.entry.name,
    ext: input.entry.ext,
    sessionId: input.sessionId,
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
          readOnly: input.readOnly,
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
          readOnly: input.readOnly,
        },
      };
    case "pdf":
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
          projectId: input.projectId,
          __customHeader: true,
          readOnly: input.readOnly,
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
          projectId: input.projectId,
          __customHeader: true,
          readOnly: input.readOnly,
        },
      };
    case "video":
      return {
        id: input.entry.uri,
        component: "video-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          rootUri: input.rootUri,
          projectId: input.projectId,
          thumbnailSrc: input.thumbnailSrc,
          __customHeader: true,
        },
      };
    case "audio":
      return {
        id: input.entry.uri,
        component: "audio-viewer",
        title: input.entry.name,
        params: {
          ...baseParams,
          projectId: input.projectId,
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
          rootUri: input.rootUri,
        },
      };
    default:
      return null;
  }
}

/** Open a file entry with stack, modal, or embed behavior. */
export function openFilePreview(input: FileOpenInput): boolean | ReactNode | null {
  const mode = input.mode ?? "stack";
  /** Record a file open for recent list updates. */
  const recordFileOpen = () => {
    recordRecentOpen({
      tabId: input.tabId,
      projectId: input.projectId,
      entry: input.entry,
    });
  };
  const boardEntry = resolveBoardFolderEntryFromIndexFile(input.entry);
  if (boardEntry && mode !== "embed") {
    const boardFolderUri = boardEntry.uri;
    const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
    const boardId = boardFolderUri.split("/").filter(Boolean).pop() ?? "";
    const displayName = getBoardDisplayName(boardEntry.name);
    useLayoutState.getState().pushStackItem({
      id: boardFolderUri,
      component: "board-viewer",
      title: displayName,
      params: {
        uri: boardFolderUri,
        boardFolderUri,
        boardFileUri,
        boardId,
        name: boardEntry.name,
        projectId: input.projectId,
        rootUri: input.rootUri,
        __opaque: true,
        ...(input.board?.pendingRename ? { __pendingRename: true } : {}),
      },
    });
    return true;
  }
  // 逻辑：检测 index.mdx 文件，自动打开所属文稿文件夹。
  const docEntry = resolveDocFolderEntryFromIndexFile(input.entry);
  if (docEntry && mode !== "embed") {
    const docFolderUri = docEntry.uri;
    const docFileUri = buildChildUri(docFolderUri, DOC_INDEX_FILE_NAME);
    const displayName = getDocDisplayName(docEntry.name);
    useLayoutState.getState().pushStackItem({
      id: docFolderUri,
      component: "plate-doc-viewer",
      title: displayName,
      params: {
        uri: docFolderUri,
        docFileUri,
        name: docEntry.name,
        projectId: input.projectId,
        rootUri: input.rootUri,
        __customHeader: true,
      },
    });
    return true;
  }

  if (input.entry.kind === "folder") {
    if (mode === "embed") {
      return renderFilePreviewContent({
        entry: input.entry,
        rootUri: input.rootUri,
        projectId: input.projectId,
        readOnly: input.readOnly,
      });
    }
    if (isBoardFolderName(input.entry.name)) {
      const boardFolderUri = input.entry.uri;
      const boardFileUri = buildChildUri(boardFolderUri, BOARD_INDEX_FILE_NAME);
      const boardId = boardFolderUri.split("/").filter(Boolean).pop() ?? "";
      const displayName = getBoardDisplayName(input.entry.name);
      useLayoutState.getState().pushStackItem({
        id: boardFolderUri,
        component: "board-viewer",
        title: displayName,
        params: {
          uri: boardFolderUri,
          boardFolderUri,
          boardFileUri,
          boardId,
          name: input.entry.name,
          projectId: input.projectId,
          rootUri: input.rootUri,
          __opaque: true,
          ...(input.board?.pendingRename ? { __pendingRename: true } : {}),
        },
      });
      return true;
    }
    // 逻辑：检测文稿文件夹，打开 PlateDocViewer。
    if (isDocFolderName(input.entry.name)) {
      const docFolderUri = input.entry.uri;
      const docFileUri = buildChildUri(docFolderUri, DOC_INDEX_FILE_NAME);
      const displayName = getDocDisplayName(input.entry.name);
      useLayoutState.getState().pushStackItem({
        id: docFolderUri,
        component: "plate-doc-viewer",
        title: displayName,
        params: {
          uri: docFolderUri,
          docFileUri,
          name: input.entry.name,
          projectId: input.projectId,
          rootUri: input.rootUri,
          __customHeader: true,
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

  if (mode === "embed") {
    recordFileOpen();
    return renderFilePreviewContent({
      entry: input.entry,
      rootUri: input.rootUri,
      projectId: input.projectId,
      readOnly: input.readOnly,
    });
  }

  const target = resolveFileViewerTarget(input.entry);
  if (!target) return false;

  if (shouldOpenOfficeWithSystem(target.ext)) {
    const shouldOpen =
      input.confirmOpen?.("此文件类型暂不支持预览，是否使用系统默认程序打开？") ??
      window.confirm("此文件类型暂不支持预览，是否使用系统默认程序打开？");
    if (!shouldOpen) return true;
    recordFileOpen();
    openWithDefaultApp(input.entry, input.rootUri);
    return true;
  }

  // HTML 文件默认用浏览器组件打开（通过 server 代理提供 HTTP URL）
  if ((target.ext === "html" || target.ext === "htm") && mode === "stack" && input.projectId) {
    const relativePath = input.entry.uri.startsWith("file://") && input.rootUri
      ? getRelativePathFromUri(input.rootUri, input.entry.uri) || input.entry.uri
      : input.entry.uri;
    const serverUrl = resolveServerUrl();
    const serveUrl = `${serverUrl}/fs/serve/${encodeURIComponent(input.projectId)}/${relativePath}`;
    recordFileOpen();
    useLayoutState.getState().pushStackItem(
      {
        id: BROWSER_WINDOW_PANEL_ID,
        sourceKey: BROWSER_WINDOW_PANEL_ID,
        component: BROWSER_WINDOW_COMPONENT,
        title: input.entry.name,
        params: {
          __customHeader: true,
          __open: { url: serveUrl, title: input.entry.name, viewKey: `html:${input.entry.uri}` },
        },
      } as any,
      70,
    );
    return true;
  }

  if (mode === "modal") {
    recordFileOpen();
    const payload = buildPreviewPayload({
      viewer: target.viewer,
      entry: input.entry,
      projectId: input.projectId,
      sessionId: input.sessionId,
      rootUri: input.rootUri,
      thumbnailSrc: input.thumbnailSrc,
      readOnly: input.readOnly,
      modal: input.modal,
    });
    openFilePreviewDialog(payload);
    return true;
  }

  const stackItem = buildStackItemForEntry({
    entry: input.entry,
    projectId: input.projectId,
    sessionId: input.sessionId,
    rootUri: input.rootUri,
    thumbnailSrc: input.thumbnailSrc,
    readOnly: input.readOnly,
  });
  if (!stackItem) return true;
  recordFileOpen();
  useLayoutState.getState().pushStackItem(stackItem);
  return true;
}

/** Open a file entry using stack or modal behavior (legacy wrapper). */
export function openFile(input: FileOpenInput): boolean {
  const result = openFilePreview(input);
  return typeof result === "boolean" ? result : true;
}
