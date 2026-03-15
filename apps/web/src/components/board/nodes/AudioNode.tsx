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
import { Music } from "lucide-react";
import i18next from "i18next";
import { BOARD_TOOLBAR_ITEM_BLUE } from "../ui/board-style-system";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import type { BoardFileContext } from "../board-contracts";
import { useBoardContext } from "../core/BoardProvider";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { NodeFrame } from "./NodeFrame";

export type AudioNodeProps = {
  /** Board-relative path for the audio file. */
  sourcePath: string;
  /** Display name. */
  fileName?: string;
  /** Duration in seconds. */
  duration?: number;
  /** MIME type. */
  mimeType?: string;
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

/** Format seconds to mm:ss. */
function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Build toolbar items for audio nodes. */
function createAudioToolbarItems(
  ctx: CanvasToolbarContext<AudioNodeProps>,
) {
  return [
    {
      id: "inspect",
      label: i18next.t("board:audioNode.toolbar.detail"),
      icon: <Music size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Render an audio node card with inline playback. */
export function AudioNodeView({
  element,
}: CanvasNodeViewProps<AudioNodeProps>) {
  const { fileContext } = useBoardContext();

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext],
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName =
    element.props.fileName || resolvedPath.split("/").pop() || "Audio";
  const durationText = formatDuration(element.props.duration);
  const boardId = fileContext?.boardId ?? "";

  // 逻辑：从 @{[proj_xxx]/path} 格式中提取 projectId 作为 fallback。
  const effectiveProjectId = useMemo(() => {
    if (fileContext?.projectId) return fileContext.projectId;
    const parsed = parseScopedProjectPath(element.props.sourcePath);
    return parsed?.projectId;
  }, [element.props.sourcePath, fileContext?.projectId]);

  const audioSrc = useMemo(() => {
    if (!resolvedPath) return "";
    if (
      resolvedPath.startsWith("data:") ||
      resolvedPath.startsWith("blob:") ||
      resolvedPath.startsWith("http://") ||
      resolvedPath.startsWith("https://")
    ) {
      return resolvedPath;
    }
    return getPreviewEndpoint(resolvedPath, {
      projectId: effectiveProjectId,
    });
  }, [effectiveProjectId, resolvedPath]);

  const handleOpenPreview = useCallback(() => {
    if (!resolvedPath) return;
    openFilePreview({
      viewer: "file",
      items: [
        {
          uri: element.props.sourcePath,
          openUri: resolvedPath,
          name: displayName,
          title: displayName,
          projectId: effectiveProjectId,
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
    fileContext?.rootUri,
    resolvedPath,
  ]);

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full flex-col rounded-lg border box-border",
          "border-ol-divider bg-background text-ol-text-primary",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          handleOpenPreview();
        }}
      >
        {/* Header: icon + name + duration */}
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ol-amber-bg text-ol-amber">
            <Music className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] font-medium leading-tight">
              {displayName}
            </span>
            {durationText ? (
              <span className="text-[10px] text-muted-foreground">
                {durationText}
              </span>
            ) : null}
          </div>
        </div>

        {/* Inline audio player */}
        <div
          className="flex flex-1 items-end px-2.5 pb-2"
          data-board-scroll
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          {audioSrc ? (
            <audio
              controls
              controlsList="nodownload"
              preload="metadata"
              className="h-8 w-full [&::-webkit-media-controls-panel]:bg-neutral-50 dark:[&::-webkit-media-controls-panel]:bg-neutral-800"
              src={audioSrc}
            />
          ) : (
            <div className="flex h-8 w-full items-center justify-center text-[10px] text-muted-foreground">
              {i18next.t("board:audioNode.noSource")}
            </div>
          )}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Definition for the audio node. */
export const AudioNodeDefinition: CanvasNodeDefinition<AudioNodeProps> = {
  type: "audio",
  schema: z.object({
    sourcePath: z.string(),
    fileName: z.string().optional(),
    duration: z.number().optional(),
    mimeType: z.string().optional(),
  }),
  defaultProps: {
    sourcePath: "",
    fileName: "",
  },
  view: AudioNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 200, h: 100 },
    maxSize: { w: 480, h: 160 },
  },
  toolbar: (ctx) => createAudioToolbarItems(ctx),
};
