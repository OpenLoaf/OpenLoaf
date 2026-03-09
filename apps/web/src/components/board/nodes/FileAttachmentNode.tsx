/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { FileText } from "lucide-react";
import { FileIcon, defaultStyles } from "react-file-icon";
import i18next from "i18next";
import { BOARD_TOOLBAR_ITEM_BLUE } from "../ui/board-style-system";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { FilePreviewViewer } from "@/components/file/lib/file-preview-types";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";
import { NodeFrame } from "./NodeFrame";
import { resolveViewerType } from "../utils/board-asset";

export type FileAttachmentNodeProps = {
  /** Board-relative path. */
  sourcePath: string;
  /** Display name. */
  fileName?: string;
  /** Lowercase extension. */
  extension?: string;
  /** Viewer type for double-click preview. */
  viewerType?: FilePreviewViewer;
  /** File size in bytes. */
  fileSize?: number;
};

/** Resolve a board-scoped path into a project-relative path. */
function resolveProjectRelativePath(
  path: string,
  fileContext?: BoardFileContext,
) {
  const scope = resolveBoardFolderScope(fileContext);
  return resolveProjectPathFromBoardUri({
    uri: path,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
}

/** Resolve file icon styles for react-file-icon. */
function resolveFileIconStyle(extension?: string) {
  const normalized = (extension ?? "").toLowerCase();
  const fallbackStyle = defaultStyles.txt ?? {};
  if (!normalized) return fallbackStyle;
  if (defaultStyles[normalized]) return defaultStyles[normalized];
  return fallbackStyle;
}

/** Format bytes to human readable string. */
function formatFileSize(bytes?: number): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extension badge color mapping. */
function getExtBadgeColor(ext?: string): string {
  const normalized = (ext ?? "").toLowerCase();
  if (normalized === "pdf") return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  if (normalized === "docx" || normalized === "doc")
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (
    normalized === "xlsx" ||
    normalized === "xls" ||
    normalized === "csv"
  )
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (normalized === "md" || normalized === "txt")
    return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
}

/** Build toolbar items for file attachment nodes. */
function createFileAttachmentToolbarItems(
  ctx: CanvasToolbarContext<FileAttachmentNodeProps>,
) {
  return [
    {
      id: "inspect",
      label: i18next.t("board:fileAttachmentNode.toolbar.detail"),
      icon: <FileText size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Render a file attachment node card. */
export function FileAttachmentNodeView({
  element,
}: CanvasNodeViewProps<FileAttachmentNodeProps>) {
  const { fileContext } = useBoardContext();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext],
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName =
    element.props.fileName || resolvedPath.split("/").pop() || "File";
  const ext = element.props.extension || displayName.split(".").pop()?.toLowerCase() || "";
  const viewerType = element.props.viewerType || resolveViewerType(ext);
  const iconStyle = resolveFileIconStyle(ext);
  const badgeColor = getExtBadgeColor(ext);
  const sizeText = formatFileSize(element.props.fileSize);
  const boardId = fileContext?.boardId ?? "";

  // 逻辑：从 @{[proj_xxx]/path} 格式中提取 projectId 作为 fallback。
  const effectiveProjectId = useMemo(() => {
    if (fileContext?.projectId) return fileContext.projectId;
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    return parsed?.projectId;
  }, [element.props.sourcePath, fileContext?.projectId]);

  const handleOpenPreview = useCallback(() => {
    if (!resolvedPath) return;
    openFilePreview({
      viewer: viewerType,
      items: [
        {
          uri: element.props.sourcePath,
          openUri: resolvedPath,
          name: displayName,
          title: displayName,
          ext,
          projectId: effectiveProjectId,
          workspaceId,
          rootUri: fileContext?.rootUri,
          boardId,
        },
      ],
      activeIndex: 0,
      showSave: false,
      enableEdit: false,
    });
  }, [
    boardId,
    displayName,
    effectiveProjectId,
    element.props.sourcePath,
    ext,
    fileContext?.rootUri,
    resolvedPath,
    viewerType,
    workspaceId,
  ]);

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full items-center gap-3 rounded-xl border box-border px-3",
          "border-neutral-200/80 bg-white text-neutral-800",
          "dark:border-neutral-700/60 dark:bg-neutral-900 dark:text-neutral-100",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          handleOpenPreview();
        }}
      >
        {/* File icon */}
        <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full">
          <FileIcon extension={ext || undefined} {...iconStyle} />
        </div>

        {/* File info */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12px] font-medium leading-tight">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5">
            {ext ? (
              <span
                className={`inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none ${badgeColor}`}
              >
                {ext}
              </span>
            ) : null}
            {sizeText ? (
              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                {sizeText}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </NodeFrame>
  );
}

/** Definition for the file attachment node. */
export const FileAttachmentNodeDefinition: CanvasNodeDefinition<FileAttachmentNodeProps> =
  {
    type: "file-attachment",
    schema: z.object({
      sourcePath: z.string(),
      fileName: z.string().optional(),
      extension: z.string().optional(),
      viewerType: z
        .enum(["image", "markdown", "code", "pdf", "doc", "sheet", "video", "file"])
        .optional(),
      fileSize: z.number().optional(),
    }),
    defaultProps: {
      sourcePath: "",
      fileName: "",
    },
    view: FileAttachmentNodeView,
    capabilities: {
      resizable: true,
      rotatable: false,
      connectable: "anchors",
      minSize: { w: 200, h: 80 },
      maxSize: { w: 480, h: 120 },
    },
    toolbar: (ctx) => createFileAttachmentToolbarItems(ctx),
  };
