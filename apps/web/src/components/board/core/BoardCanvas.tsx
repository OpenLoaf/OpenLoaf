"use client";

import { useEffect, useRef, useState } from "react";
import { BoardProvider, type ImagePreviewPayload } from "./BoardProvider";
import { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasElement, CanvasNodeDefinition } from "../engine/types";
import { BoardCanvasInteraction } from "./BoardCanvasInteraction";
import { BoardCanvasCollab } from "./BoardCanvasCollab";
import { BoardCanvasRender } from "./BoardCanvasRender";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import ImagePreviewDialog from "@/components/file/ImagePreviewDialog";

export type BoardCanvasProps = {
  /** External engine instance, optional for integration scenarios. */
  engine?: CanvasEngine;
  /** Node definitions to register on first mount. */
  nodes?: CanvasNodeDefinition<any>[];
  /** Initial elements inserted once when mounted. */
  initialElements?: CanvasElement[];
  /** Workspace id for storage isolation. */
  workspaceId?: string;
  /** Project id used for file resolution. */
  projectId?: string;
  /** Project root uri for attachment resolution. */
  rootUri?: string;
  /** Optional board identifier used for storage scoping. */
  boardId?: string;
  /** Board folder uri for attachment storage. */
  boardFolderUri?: string;
  /** Board file URI used for file persistence. */
  boardFileUri?: string;
  /** Panel key for identifying board instances. */
  panelKey?: string;
  /** Hide interactive overlays when the panel is minimized. */
  uiHidden?: boolean;
  /** Optional container class name. */
  className?: string;
};

/** Render the new board canvas surface and DOM layers. */
export function BoardCanvas({
  engine: externalEngine,
  nodes,
  initialElements,
  workspaceId,
  projectId,
  rootUri,
  boardId,
  boardFolderUri,
  boardFileUri,
  panelKey,
  uiHidden,
  className,
}: BoardCanvasProps) {
  const { workspace } = useWorkspace();
  const resolvedWorkspaceId = workspaceId ?? workspace?.id ?? "";
  /** Root container element for canvas interactions. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Engine instance used for rendering and interaction. */
  const engineRef = useRef<CanvasEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = externalEngine ?? new CanvasEngine();
  }
  const engine = externalEngine ?? engineRef.current;
  /** Latest snapshot from the engine. */
  const snapshot = useBoardSnapshot(engine);
  const showUi = !uiHidden;
  /** Basic settings for UI toggles. */
  const { basic } = useBasicConfig();
  /** Whether the performance overlay is visible. */
  const showPerfOverlay = Boolean(basic.boardDebugEnabled);
  /** Guard for first-time node registration. */
  const nodesRegisteredRef = useRef(false);
  /** Image preview payload for the fullscreen viewer. */
  const [imagePreview, setImagePreview] = useState<ImagePreviewPayload | null>(null);
  /** Sync callback provided by collaboration layer. */
  const [syncLogState, setSyncLogState] = useState<{
    canSyncLog: boolean;
    onSyncLog?: () => void;
  }>({ canSyncLog: false });

  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  useEffect(() => {
    if (nodesRegisteredRef.current) return;
    if (!nodes || nodes.length === 0) return;
    // 只在首次挂载时注册节点定义，避免重复注册报错。
    engine.registerNodes(nodes);
    nodesRegisteredRef.current = true;
  }, [engine, nodes]);

  const openImagePreview = (payload: ImagePreviewPayload) => {
    // 逻辑：节点请求预览时直接替换当前预览数据。
    setImagePreview(payload);
  };

  const closeImagePreview = () => {
    // 逻辑：关闭预览时清空当前预览数据。
    setImagePreview(null);
  };

  // 逻辑：预览优先使用原图地址，缺失时回退到压缩预览。
  const imagePreviewUri = imagePreview?.originalSrc || imagePreview?.previewSrc || "";

  return (
    <BoardProvider
      engine={engine}
      actions={{
        openImagePreview,
        closeImagePreview,
      }}
      fileContext={{
        workspaceId: resolvedWorkspaceId || undefined,
        projectId,
        rootUri,
        boardId,
        boardFolderUri,
      }}
    >
      <BoardCanvasCollab
        engine={engine}
        initialElements={initialElements}
        workspaceId={resolvedWorkspaceId}
        projectId={projectId}
        rootUri={rootUri}
        boardFolderUri={boardFolderUri}
        boardFileUri={boardFileUri}
        onSyncLogChange={setSyncLogState}
      />
      <BoardCanvasInteraction
        engine={engine}
        snapshot={snapshot}
        containerRef={containerRef}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        uiHidden={uiHidden}
        className={className}
        boardFolderUri={boardFolderUri}
        onOpenImagePreview={openImagePreview}
      >
        <BoardCanvasRender
          engine={engine}
          snapshot={snapshot}
          showUi={showUi}
          showPerfOverlay={showPerfOverlay}
          containerRef={containerRef}
          onSyncLog={syncLogState.canSyncLog ? syncLogState.onSyncLog : undefined}
        />
      </BoardCanvasInteraction>
      <ImagePreviewDialog
        open={Boolean(imagePreview)}
        onOpenChange={(open) => {
          if (!open) closeImagePreview();
        }}
        items={
          imagePreview
            ? [
                {
                  uri: imagePreviewUri,
                  title: imagePreview.fileName || "图片预览",
                  saveName: imagePreview.fileName,
                  mediaType: imagePreview.mimeType,
                },
              ]
            : []
        }
        activeIndex={0}
        showSave={false}
        enableEdit={false}
      />
    </BoardProvider>
  );
}
