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
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
import { AudioAiPanel } from "../panels/AudioAiPanel";
import type { AudioGenerateParams } from "../panels/AudioAiPanel";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { submitAudioGenerate } from "../services/audio-generate";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";

/** Inline panel gap from node bottom edge in screen pixels (zoom-independent). */
const PANEL_GAP_PX = 8;

export type AudioNodeProps = {
  /** Board-relative path for the audio file. */
  sourcePath: string;
  /** Display name. */
  fileName?: string;
  /** Duration in seconds. */
  duration?: number;
  /** MIME type. */
  mimeType?: string;
  /** How the audio was created. Defaults to 'upload'. */
  origin?: import("../board-contracts").NodeOrigin;
  /** AI generation config. Present only when origin is 'ai-generate'. */
  aiConfig?: import("../board-contracts").AiGenerateConfig;
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
  expanded,
  onUpdate,
}: CanvasNodeViewProps<AudioNodeProps>) {
  const { fileContext, engine } = useBoardContext();
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();
  const panelRef = useRef<HTMLDivElement>(null);

  // 逻辑：通过 subscribeView 直接操作 DOM 同步面板缩放，避免 React 渲染延迟。
  // 面板通过 Portal 渲染到 panelOverlay 层（笔画上方），用 scale(1/zoom) 保持固定屏幕大小。
  // 间距用 PANEL_GAP_PX / zoom 保证屏幕上恒定像素间距。
  const xywhRef = useRef(element.xywh);
  xywhRef.current = element.xywh;
  useEffect(() => {
    if (!expanded) return;
    const syncPanelScale = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const zoom = engine.viewport.getState().zoom;
      const [, ny, , nh] = xywhRef.current;
      panel.style.transform = `translateX(-50%) scale(${1 / zoom})`;
      panel.style.top = `${ny + nh + PANEL_GAP_PX / zoom}px`;
    };
    syncPanelScale();
    const unsub = engine.subscribeView(syncPanelScale);
    return unsub;
  }, [engine, expanded]);

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

  const handleGenerate = useCallback(
    async (params: AudioGenerateParams) => {
      try {
        const saveDir = fileContext?.boardFolderUri
          ? `${fileContext.boardFolderUri}/${BOARD_ASSETS_DIR_NAME}`
          : undefined
        const result = await submitAudioGenerate(
          {
            prompt: params.prompt,
            modelId: params.modelId === 'auto' ? undefined : params.modelId,
            audioType: params.audioType,
            duration: params.duration,
          },
          {
            projectId: fileContext?.projectId,
            saveDir,
            sourceNodeId: element.id,
          },
        )
        const [x, y, w, h] = element.xywh
        engine.addNodeElement(
          'loading',
          {
            taskId: result.taskId,
            taskType: 'audio_generate',
            sourceNodeId: element.id,
            promptText: params.prompt,
            projectId: fileContext?.projectId ?? '',
            saveDir: saveDir ?? '',
          },
          [x + w + 120, y, 280, 100],
        )
      } catch (err) {
        console.error('[AudioNode] submitAudioGenerate failed:', err)
        onUpdate({
          aiConfig: {
            ...(element.props.aiConfig ?? { modelId: params.modelId, prompt: params.prompt }),
            taskId: undefined,
          },
        })
      }
    },
    [engine, element.id, element.xywh, element.props.aiConfig, fileContext, onUpdate],
  )

  return (
    <NodeFrame>
      <div
        className={[
          "flex h-full w-full flex-col rounded-lg border box-border",
          "border-ol-divider bg-background text-ol-text-primary",
        ].join(" ")}
        onDoubleClick={(event) => {
          event.stopPropagation();
          // 逻辑：展开态不触发预览，因为此时双击可能是编辑面板内的操作。
          if (expanded) return;
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
      {expanded && panelOverlay ? createPortal(
        <div
          ref={panelRef}
          className="pointer-events-auto absolute"
          data-board-editor
          style={{
            left: element.xywh[0] + element.xywh[2] / 2,
            top: element.xywh[1] + element.xywh[3],
            transformOrigin: 'top center',
          }}
          onPointerDown={event => {
            event.stopPropagation();
          }}
        >
          <AudioAiPanel
            element={element}
            onUpdate={onUpdate}
            onGenerate={handleGenerate}
            upstreamText={upstream?.textList.join('\n')}
          />
        </div>,
        panelOverlay,
      ) : null}
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
    origin: z.enum(['user', 'upload', 'ai-generate', 'paste']).optional(),
    aiConfig: z.object({
      modelId: z.string(),
      prompt: z.string(),
      negativePrompt: z.string().optional(),
      style: z.string().optional(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
      inputNodeIds: z.array(z.string()).optional(),
      taskId: z.string().optional(),
      generatedAt: z.number().optional(),
    }).optional(),
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
  inlinePanel: { width: 420, height: 320 },
  toolbar: (ctx) => createAudioToolbarItems(ctx),
};
