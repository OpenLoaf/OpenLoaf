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
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useMemo } from "react";
import { z } from "zod";
import { Info, Play, Sparkles } from "lucide-react";
import i18next from "i18next";
import { BOARD_TOOLBAR_ITEM_BLUE, BOARD_TOOLBAR_ITEM_GREEN } from "../ui/board-style-system";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "./imagePromptGenerate";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import {
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { NodeFrame } from "./NodeFrame";

export type VideoNodeProps = {
  /** Project-relative path for the video. */
  sourcePath: string;
  /** Display name for the video. */
  fileName?: string;
  /** Optional poster path for preview. */
  posterPath?: string;
  /** Optional duration in seconds. */
  duration?: number;
  /** Optional video width in pixels. */
  naturalWidth?: number;
  /** Optional video height in pixels. */
  naturalHeight?: number;
};

/** Resolve a board-scoped path into a project-relative path. */
function resolveProjectRelativePath(path: string, fileContext?: BoardFileContext) {
  const scope = resolveBoardFolderScope(fileContext);
  return resolveProjectPathFromBoardUri({
    uri: path,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
}

/** Open video in the file preview dialog (same as double-click). */
async function openVideoPreview(props: VideoNodeProps, fileContext?: BoardFileContext) {
  const workspaceId = fileContext?.workspaceId ?? "";
  const boardId = fileContext?.boardId ?? "";
  const projectRelativePath = resolveProjectRelativePath(props.sourcePath, fileContext);
  const resolvedPath = projectRelativePath || props.sourcePath;
  const displayName = props.fileName || resolvedPath.split("/").pop() || "Video";

  const metadata = await fetchVideoMetadata({
    workspaceId,
    projectId: fileContext?.projectId,
    uri: projectRelativePath || props.sourcePath,
  });
  openFilePreview({
    viewer: "video",
    items: [
      {
        uri: props.sourcePath,
        openUri: resolvedPath,
        name: displayName,
        title: displayName,
        width: metadata?.width ?? props.naturalWidth,
        height: metadata?.height ?? props.naturalHeight,
        projectId: fileContext?.projectId,
        workspaceId,
        rootUri: fileContext?.rootUri,
        boardId,
      },
    ],
    activeIndex: 0,
    showSave: false,
    enableEdit: false,
  });
}

/** Build toolbar items for video nodes. */
function createVideoToolbarItems(ctx: CanvasToolbarContext<VideoNodeProps>) {
  return [
    {
      id: 'play',
      label: i18next.t('board:videoNode.toolbar.play'),
      icon: <Play size={14} />,
      className: BOARD_TOOLBAR_ITEM_GREEN,
      onSelect: () => void openVideoPreview(ctx.element.props, ctx.fileContext),
    },
    {
      id: 'inspect',
      label: i18next.t('board:videoNode.toolbar.detail'),
      icon: <Info size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Render a video node card. */
export function VideoNodeView({
  element,
}: CanvasNodeViewProps<VideoNodeProps>) {
  const { fileContext } = useBoardContext();

  const resolvedPath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext) || element.props.sourcePath,
    [element.props.sourcePath, fileContext]
  );
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || "Video";
  // 逻辑：优先使用文件选择器缓存的缩略图，避免画布内加载播放器。
  const posterSrc = element.props.posterPath?.trim() || "";

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full items-center justify-center rounded-xl border box-border",
          "border-neutral-200/80 bg-white text-neutral-800",
          "dark:border-neutral-700/60 dark:bg-neutral-900 dark:text-neutral-100",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          void openVideoPreview(element.props, fileContext);
        }}
      >
        {posterSrc ? (
          <div className="relative h-full w-full overflow-hidden rounded-xl">
            <img
              src={posterSrc}
              alt={displayName}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/50 via-neutral-900/10 to-transparent" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-[24%] min-h-8 aspect-square items-center justify-center rounded-full border border-white/40 bg-black/40 text-white">
                <Play className="h-[55%] w-[55%] min-h-4 min-w-4 translate-x-[0.5px]" />
              </span>
            </div>
            <div className="absolute bottom-2 left-2 right-2 line-clamp-2 text-[11px] text-white/90 drop-shadow">
              {displayName}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
              <Play className="h-5 w-5" />
            </div>
            <div className="line-clamp-2 text-[11px] text-neutral-600 dark:text-neutral-400">
              {displayName}
            </div>
          </div>
        )}
      </div>

    </NodeFrame>
  );
}

/** Connector templates offered by the video node – resolved at render time. */
const getVideoNodeConnectorTemplates = (): CanvasConnectorTemplateDefinition[] => [
  {
    id: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    label: i18next.t('board:connector.imagePromptGenerate'),
    description: i18next.t('board:connector.imagePromptGenerateDesc'),
    size: [320, 220],
    icon: <Sparkles size={14} />,
    createNode: () => ({
      type: IMAGE_PROMPT_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

/** Definition for the video node. */
export const VideoNodeDefinition: CanvasNodeDefinition<VideoNodeProps> = {
  type: "video",
  schema: z.object({
    sourcePath: z.string(),
    fileName: z.string().optional(),
    posterPath: z.string().optional(),
    duration: z.number().optional(),
    naturalWidth: z.number().optional(),
    naturalHeight: z.number().optional(),
  }),
  defaultProps: {
    sourcePath: "",
    fileName: "",
  },
  view: VideoNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 200, h: 140 },
    maxSize: { w: 720, h: 480 },
  },
  connectorTemplates: () => getVideoNodeConnectorTemplates(),
  toolbar: (ctx) => createVideoToolbarItems(ctx),
};
