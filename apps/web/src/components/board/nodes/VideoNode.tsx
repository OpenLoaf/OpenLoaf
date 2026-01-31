import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { Play } from "lucide-react";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { fetchVideoMetadata } from "@/components/file/lib/video-metadata";
import { useWorkspace } from "@/components/workspace/workspaceContext";
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

/** Build toolbar items for video nodes. */
function createVideoToolbarItems(ctx: CanvasToolbarContext<VideoNodeProps>) {
  return [
    {
      id: "inspect",
      label: "详情",
      icon: <Play size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

/** Render a video node card. */
export function VideoNodeView({
  element,
  selected,
}: CanvasNodeViewProps<VideoNodeProps>) {
  const { fileContext } = useBoardContext();
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext]
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || "Video";
  // 逻辑：优先使用文件选择器缓存的缩略图，避免画布内加载播放器。
  const posterSrc = element.props.posterPath?.trim() || "";

  const handleOpenPreview = useCallback(async () => {
    if (!resolvedPath) return;
    const metadata = await fetchVideoMetadata({
      workspaceId,
      projectId: fileContext?.projectId,
      uri: projectRelativePath || element.props.sourcePath,
    });
    console.info("[VideoNode] preview metadata", {
      resolvedPath,
      sourcePath: element.props.sourcePath,
      projectRelativePath,
      workspaceId,
      projectId: fileContext?.projectId,
      metadata,
    });
    openFilePreview({
      viewer: "video",
      items: [
        {
          uri: resolvedPath,
          openUri: resolvedPath,
          name: displayName,
          title: displayName,
          width: metadata?.width,
          height: metadata?.height,
          projectId: fileContext?.projectId,
          rootUri: fileContext?.rootUri,
        },
      ],
      activeIndex: 0,
      showSave: false,
      enableEdit: false,
    });
  }, [
    displayName,
    element.props.sourcePath,
    fileContext?.projectId,
    fileContext?.rootUri,
    projectRelativePath,
    resolvedPath,
    workspaceId,
  ]);

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full items-center justify-center rounded-sm border box-border",
          "border-slate-200 bg-white text-slate-900",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
          selected ? "shadow-[0_8px_18px_rgba(15,23,42,0.18)]" : "shadow-none",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          void handleOpenPreview();
        }}
      >
        {posterSrc ? (
          <div className="relative h-full w-full overflow-hidden rounded-sm">
            <img
              src={posterSrc}
              alt={displayName}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-slate-900/10 to-transparent" />
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
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <Play className="h-5 w-5" />
            </div>
            <div className="line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">
              {displayName}
            </div>
          </div>
        )}
      </div>

    </NodeFrame>
  );
}

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
  toolbar: (ctx) => createVideoToolbarItems(ctx),
};
