import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Play } from "lucide-react";
import { openFilePreview } from "@/components/file/lib/file-preview-store";
import { useBoardContext, type BoardFileContext } from "../core/BoardProvider";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from "../core/boardFilePath";
import { VideoNodeDetail } from "./VideoNodeDetail";

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
  const { engine, fileContext } = useBoardContext();
  const [showDetail, setShowDetail] = useState(false);
  const isLocked = engine.isLocked() || element.locked === true;

  const projectRelativePath = useMemo(
    () => resolveProjectRelativePath(element.props.sourcePath, fileContext),
    [element.props.sourcePath, fileContext]
  );
  const resolvedPath = projectRelativePath || element.props.sourcePath;
  const displayName = element.props.fileName || resolvedPath.split("/").pop() || "Video";
  // 逻辑：优先使用文件选择器缓存的缩略图，避免画布内加载播放器。
  const posterSrc = element.props.posterPath?.trim() || "";

  const handleOpenPreview = useCallback(() => {
    if (!resolvedPath) return;
    openFilePreview({
      viewer: "video",
      items: [
        {
          uri: resolvedPath,
          openUri: resolvedPath,
          name: displayName,
          title: displayName,
          projectId: fileContext?.projectId,
          rootUri: fileContext?.rootUri,
        },
      ],
      activeIndex: 0,
      showSave: false,
      enableEdit: false,
    });
  }, [displayName, fileContext?.projectId, fileContext?.rootUri, resolvedPath]);

  useEffect(() => {
    if (!selected || isLocked) {
      // 逻辑：未选中或锁定时收起详情卡。
      setShowDetail(false);
    }
  }, [isLocked, selected]);

  return (
    <div className="relative h-full w-full">
      <div
        className={[
          "flex h-full w-full items-center justify-center rounded-sm border box-border",
          "border-slate-200 bg-white text-slate-900",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
          selected ? "shadow-[0_8px_18px_rgba(15,23,42,0.18)]" : "shadow-none",
        ].join(" ")}
        onPointerDownCapture={(event) => {
          if (isLocked) return;
          if (event.button !== 0) return;
          // 逻辑：按下时展示详情卡，避免选中切换时丢失。
          setShowDetail(true);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          handleOpenPreview();
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

      {showDetail ? (
        <div
          className="absolute left-1/2 top-full mt-3 -translate-x-1/2"
          data-board-editor
          onPointerDown={(event) => {
            // 逻辑：阻止画布接管输入区域的拖拽与选择。
            event.stopPropagation();
          }}
        >
          <VideoNodeDetail
            name={element.props.fileName || displayName}
            path={
              projectRelativePath ||
              (!isBoardRelativePath(element.props.sourcePath)
                ? element.props.sourcePath
                : undefined)
            }
            duration={element.props.duration}
            naturalWidth={element.props.naturalWidth}
            naturalHeight={element.props.naturalHeight}
          />
        </div>
      ) : null}
    </div>
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
