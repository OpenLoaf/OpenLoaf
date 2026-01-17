"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type RefObject,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@udecode/cn";
import type { CanvasEngine } from "../engine/CanvasEngine";
import type {
  CanvasConnectorTemplateDefinition,
  CanvasElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { getClipboardInsertPayload } from "../engine/clipboard";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import { readImageDragPayload } from "@/lib/image/drag";
import { FILE_DRAG_URI_MIME, FILE_DRAG_URIS_MIME } from "@/components/ui/tenas/drag-drop-types";
import { fetchBlobFromUri, getPreviewEndpoint, resolveFileName } from "@/lib/image/uri";
import { getStackedImageRect } from "../utils/image-insert";
import type { ImagePreviewPayload } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";
import { NodePicker } from "./NodePicker";
import { openLinkInStack as openLinkInStackAction, resolveLinkTitle } from "../nodes/lib/link-actions";
import type { ImageNodeProps } from "../nodes/ImageNode";
import type { LinkNodeProps } from "../nodes/LinkNode";
import { resolveBoardFolderScope, resolveProjectPathFromBoardUri } from "./boardFilePath";

const TEXT_NODE_DEFAULT_SIZE: [number, number] = [280, 140];
const EDITABLE_NODE_TYPES = new Set(["text", "image-generate", "image-prompt-generate"]);

type BoardCanvasInteractionProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot for current scene. */
  snapshot: CanvasSnapshot;
  /** Container ref for pointer calculations. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Project id for file resolution. */
  projectId?: string;
  /** Project root uri for file resolution. */
  rootUri?: string;
  /** Panel key for identifying board instances. */
  panelKey?: string;
  /** Hide interactive overlays when the panel is minimized. */
  uiHidden?: boolean;
  /** Optional container class name. */
  className?: string;
  /** Board folder uri for attachment resolution. */
  boardFolderUri?: string;
  /** Rendered canvas layers. */
  children?: ReactNode;
  /** Handler for image preview. */
  onOpenImagePreview: (payload: ImagePreviewPayload) => void;
};

/** Handle board interactions and pointer events. */
export function BoardCanvasInteraction({
  engine,
  snapshot,
  containerRef,
  projectId,
  rootUri,
  panelKey,
  uiHidden,
  className,
  boardFolderUri,
  children,
  onOpenImagePreview,
}: BoardCanvasInteractionProps) {
  const showUi = !uiHidden;
  /** Last pointer location inside the canvas, in world coordinates. */
  const lastPointerWorldRef = useRef<CanvasPoint | null>(null);
  /** Current cursor state applied to the canvas container. */
  const cursorRef = useRef<"crosshair" | "grabbing" | "grab" | "default">("default");
  /** Track wheel gesture target to avoid mid-gesture handoff. */
  const wheelGestureRef = useRef<{ mode: "canvas" | "scroll" | null; ts: number }>({
    mode: null,
    ts: 0,
  });
  /** Panel ref used for outside-click detection. */
  const nodePickerRef = useRef<HTMLDivElement | null>(null);
  /** Latest snapshot ref for cursor changes. */
  const latestSnapshotRef = useRef(snapshot);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!showUi) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    lastPointerWorldRef.current = engine.screenToWorld([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
  };

  const resolveCursor = () => {
    const currentSnapshot = latestSnapshotRef.current;
    const viewState = engine.getViewState();
    if (currentSnapshot.pendingInsert) return "crosshair";
    if (currentSnapshot.activeToolId === "hand") {
      return viewState.panning ? "grabbing" : "grab";
    }
    if (currentSnapshot.draggingId) return "grabbing";
    return "default";
  };

  const applyCursor = () => {
    const nextCursor = resolveCursor();
    if (cursorRef.current === nextCursor) return;
    cursorRef.current = nextCursor;
    const container = containerRef.current;
    if (!container) return;
    // 逻辑：直接更新 DOM 光标，避免视图变化触发全量渲染。
    container.style.cursor = nextCursor;
  };

  useEffect(() => {
    applyCursor();
  }, [snapshot.activeToolId, snapshot.draggingId, snapshot.pendingInsert]);

  useEffect(() => {
    const unsubscribe = engine.subscribeView(() => {
      applyCursor();
    });
    return () => {
      unsubscribe();
    };
  }, [engine]);

  useEffect(() => {
    if (!showUi) return;
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      if (engine.isLocked()) return;
      const container = containerRef.current;
      if (!container) return;
      const activeElement = document.activeElement;
      if (!activeElement || !container.contains(activeElement)) return;
      const payloads = getClipboardInsertPayload(event);
      if (!payloads || payloads.length === 0) return;
      const imagePayloads = payloads.filter(
        (
          payload
        ): payload is Extract<typeof payloads[number], { kind: "image" }> =>
          payload.kind === "image"
      );
      if (imagePayloads.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const center = lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
      void insertImageFilesAtPoint(
        imagePayloads.map((payload) => payload.file),
        center
      );
    };
    document.addEventListener("paste", handleGlobalPaste, { capture: true });
    return () => {
      document.removeEventListener("paste", handleGlobalPaste, { capture: true });
    };
  }, [engine, showUi]);

  useEffect(() => {
    if (!showUi) return;
    const container = containerRef.current;
    if (!container) return;
    const handleWheelCapture = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const scrollTarget = target.closest("[data-board-scroll]") as HTMLElement | null;
      const now = performance.now();
      if (!scrollTarget) {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        // 逻辑：缩放手势统一交给画布处理。
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      const isScrollable =
        scrollTarget.scrollHeight > scrollTarget.clientHeight ||
        scrollTarget.scrollWidth > scrollTarget.clientWidth;
      if (!isScrollable) {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      const lastGesture = wheelGestureRef.current;
      const withinGesture = now - lastGesture.ts < 160;
      const mode = withinGesture ? lastGesture.mode : "scroll";
      if (mode === "canvas") {
        wheelGestureRef.current = { mode: "canvas", ts: now };
        return;
      }
      wheelGestureRef.current = { mode: "scroll", ts: now };
      // 逻辑：滚动区域内的滚轮不驱动画布。
      event.stopPropagation();
    };
    container.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: true,
    });
    return () => {
      container.removeEventListener("wheel", handleWheelCapture, {
        capture: true,
      });
    };
  }, [showUi]);

  useEffect(() => {
    if (!snapshot.editingNodeId) return;
    const exists = snapshot.elements.some(
      (element) => element.id === snapshot.editingNodeId
    );
    if (!exists) {
      // 逻辑：编辑节点被删除时清理编辑态。
      engine.setEditingNodeId(null);
    }
  }, [engine, snapshot.editingNodeId, snapshot.elements]);

  useEffect(() => {
    if (!snapshot.connectorDrop) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      const panel = nodePickerRef.current;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      // 逻辑：点击面板外部时关闭，不创建节点。
      engine.setConnectorDrop(null);
      // 逻辑：关闭面板时同步清理草稿连线。
      engine.setConnectorDraft(null);
      engine.setConnectorHover(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [engine, snapshot.connectorDrop]);

  const insertImageFilesAtPoint = async (files: File[], center: CanvasPoint) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    for (const [index, file] of imageFiles.entries()) {
      const payload = await engine.buildImagePayloadFromFile(file);
      const rect = getStackedImageRect(center, payload.size, index);
      // 逻辑：批量插入图片时错位堆叠，避免完全重叠。
      engine.addNodeElement("image", payload.props, rect);
    }
  };

  const handleCanvasDragOver = (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = async (event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    const typeList = Array.from(types);
    const hasFiles = typeList.includes("Files");
    const hasUri = typeList.includes(FILE_DRAG_URI_MIME);
    if (!hasFiles && !hasUri && !readImageDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    if (engine.isLocked()) return;

    const { clientX, clientY, dataTransfer } = event;
    const imagePayload = readImageDragPayload(dataTransfer);
    const droppedFiles = Array.from(dataTransfer.files);
    const imageFiles = imagePayload
      ? []
      : droppedFiles.filter((file) => file.type.startsWith("image/"));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 逻辑：将拖拽点转换为画布坐标，作为插入基准。
    const dropPoint = engine.screenToWorld([
      clientX - rect.left,
      clientY - rect.top,
    ]);

    if (imagePayload) {
      try {
        // 逻辑：优先读取多选拖拽的 uri 列表，兼容文件管理器批量拖入。
        const dragUris = (() => {
          const payload = dataTransfer.getData(FILE_DRAG_URIS_MIME);
          if (!payload) return [];
          try {
            const parsed = JSON.parse(payload);
            if (Array.isArray(parsed)) {
              return parsed.filter(
                (item): item is string => typeof item === "string" && item.length > 0
              );
            }
          } catch {
            return [];
          }
          return [];
        })();
        const uniqueUris =
          dragUris.length > 0 ? Array.from(new Set(dragUris)) : [imagePayload.baseUri];
        const fetchedFiles: File[] = [];
        for (const uri of uniqueUris) {
          const blob = await fetchBlobFromUri(uri, { projectId });
          const fileName = resolveFileName(uri);
          const file = new File([blob], fileName, {
            type: blob.type || "application/octet-stream",
          });
          if (!file.type.startsWith("image/")) continue;
          fetchedFiles.push(file);
        }
        await insertImageFilesAtPoint(fetchedFiles, dropPoint);
        return;
      } catch {
        return;
      }
    }
    if (imageFiles.length === 0) return;
    await insertImageFilesAtPoint(imageFiles, dropPoint);
  };

  const resolveProjectRelativePath = (value: string) => {
    const scope = resolveBoardFolderScope({
      projectId,
      rootUri,
      boardFolderUri,
    });
    return resolveProjectPathFromBoardUri({
      uri: value,
      boardFolderScope: scope,
      currentProjectId: projectId,
      rootUri,
    });
  };

  const openImagePreviewFromNode = (element: CanvasNodeElement) => {
    if (element.type !== "image") return;
    const props = element.props as ImageNodeProps;
    const originalSrc = props.originalSrc || "";
    const projectRelativeOriginal = resolveProjectRelativePath(originalSrc);
    const resolvedOriginal = projectRelativeOriginal
      ? getPreviewEndpoint(projectRelativeOriginal, { projectId })
      : originalSrc;
    const previewSrc = props.previewSrc || "";
    const projectRelativePreview = resolveProjectRelativePath(previewSrc);
    const resolvedPreview = projectRelativePreview
      ? getPreviewEndpoint(projectRelativePreview, { projectId })
      : previewSrc;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(originalSrc);
    const canUseOriginal =
      hasScheme &&
      (resolvedOriginal.startsWith("data:") ||
        resolvedOriginal.startsWith("blob:") ||
        resolvedOriginal.startsWith("http://") ||
        resolvedOriginal.startsWith("https://"));
    const finalOriginal = projectRelativeOriginal
      ? resolvedOriginal
      : canUseOriginal
      ? resolvedOriginal
      : "";
    const finalPreview = resolvedPreview || previewSrc;
    if (!finalOriginal && !finalPreview) return;
    onOpenImagePreview({
      originalSrc: finalOriginal,
      previewSrc: finalPreview,
      fileName: props.fileName || "Image",
      mimeType: props.mimeType,
    });
  };

  const handleNodeDoubleClick = (element: CanvasElement) => {
    if (element.kind !== "node") return;
    if (element.type === "link") {
      const props = element.props as LinkNodeProps;
      openLinkInStackAction({
        url: props.url,
        title: resolveLinkTitle(props.url, props.title),
      });
      return;
    }
    if (element.type === "image") {
      engine.setEditingNodeId(element.id);
      openImagePreviewFromNode(element);
      return;
    }
    if (EDITABLE_NODE_TYPES.has(element.type)) {
      engine.selection.setSelection([element.id]);
      engine.setEditingNodeId(element.id);
    }
  };

  const availableTemplates = useMemo(() => {
    if (!snapshot.connectorDrop) return [];
    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (!source || source.kind !== "node") return [];
    // 逻辑：可用节点由源节点定义提供，避免全局模板硬编码。
    const definition = engine.nodes.getDefinition(source.type);
    if (!definition?.connectorTemplates) return [];
    return definition.connectorTemplates(source as CanvasNodeElement);
  }, [engine, snapshot.connectorDrop]);

  const handleTemplateSelect = (templateId: string) => {
    if (!snapshot.connectorDrop) return;
    const template = availableTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const sourceElementId =
      "elementId" in snapshot.connectorDrop.source
        ? snapshot.connectorDrop.source.elementId
        : "";
    const { type, props } = template.createNode({ sourceElementId });
    const [width, height] = template.size;
    const xywh: [number, number, number, number] = [
      snapshot.connectorDrop.point[0] - width / 2,
      snapshot.connectorDrop.point[1] - height / 2,
      width,
      height,
    ];
    const id = engine.addNodeElement(type, props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: snapshot.connectorDrop.source,
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
    engine.setConnectorDrop(null);
    engine.setConnectorDraft(null);
    engine.setConnectorHover(null);
  };

  return (
    <div
      ref={containerRef}
      data-board-canvas
      data-board-panel={panelKey}
      className={cn("relative h-full w-full overflow-hidden outline-none", className)}
      tabIndex={showUi ? 0 : -1}
      aria-hidden={showUi ? undefined : true}
      onPointerMove={handlePointerMove}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      onPointerDown={(event) => {
        if (!showUi) return;
        const rawTarget = event.target as EventTarget | null;
        const target =
          rawTarget instanceof Element
            ? rawTarget
            : rawTarget instanceof Node
              ? rawTarget.parentElement
              : null;
        if (!target?.closest("[data-board-editor]")) {
          // 逻辑：非文本编辑区域点击时才抢占画布焦点，避免打断输入。
          containerRef.current?.focus();
        }
        const rect = containerRef.current?.getBoundingClientRect();
        const worldPoint =
          rect && containerRef.current
            ? engine.screenToWorld([event.clientX - rect.left, event.clientY - rect.top])
            : null;
        if (worldPoint) {
          lastPointerWorldRef.current = worldPoint;
        }
        const hitElement = worldPoint ? engine.pickElementAt(worldPoint) : null;
        const isUiTarget = target
          ? isBoardUiTarget(target, [
              "[data-connector-drop-panel]",
              "[data-resize-handle]",
              "[data-multi-resize-handle]",
            ])
          : false;
        if (snapshot.editingNodeId && !isUiTarget) {
          const isEditingTarget =
            hitElement?.kind === "node" && hitElement.id === snapshot.editingNodeId;
          if (!isEditingTarget) {
            // 逻辑：点击编辑节点外部时退出编辑态。
            engine.setEditingNodeId(null);
          }
        }
        const shouldClear =
          snapshot.activeToolId === "select" &&
          !snapshot.pendingInsert &&
          !snapshot.toolbarDragging &&
          !event.shiftKey &&
          target &&
          hitElement?.kind !== "connector" &&
          hitElement?.kind !== "node" &&
          !isUiTarget;
        if (shouldClear) {
          // 逻辑：空白点击时清空选区，避免残留高亮。
          engine.selection.clear();
        }
      }}
      onDoubleClick={(event) => {
        if (!showUi) return;
        const rawTarget = event.target as EventTarget | null;
        const target =
          rawTarget instanceof Element
            ? rawTarget
            : rawTarget instanceof Node
              ? rawTarget.parentElement
              : null;
        if (!target) return;
        if (snapshot.activeToolId !== "select") return;
        if (snapshot.pendingInsert || snapshot.toolbarDragging) return;
        if (engine.isLocked()) return;
        if (isBoardUiTarget(target, ["[data-connector-drop-panel]"])) {
          return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldPoint = engine.screenToWorld([
          event.clientX - rect.left,
          event.clientY - rect.top,
        ]);
        const hitElement = engine.pickElementAt(worldPoint);
        if (hitElement?.kind === "node") {
          handleNodeDoubleClick(hitElement);
          return;
        }
        if (hitElement) return;
        const [width, height] = TEXT_NODE_DEFAULT_SIZE;
        // 逻辑：双击空白处创建文本节点并立即进入编辑。
        const newNodeId = engine.addNodeElement(
          "text",
          {
            autoFocus: true,
            value: "",
          },
          [worldPoint[0] - width / 2, worldPoint[1] - height / 2, width, height]
        );
        if (newNodeId) {
          engine.setEditingNodeId(newNodeId);
        }
      }}
    >
      {children}
      <ConnectorDropPanel
        engine={engine}
        snapshot={snapshot}
        templates={availableTemplates}
        onSelect={handleTemplateSelect}
        panelRef={nodePickerRef}
      />
    </div>
  );
}

type ConnectorDropPanelProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for drop positioning. */
  snapshot: CanvasSnapshot;
  /** Templates available for the picker. */
  templates: CanvasConnectorTemplateDefinition[];
  /** Selection handler for templates. */
  onSelect: (templateId: string) => void;
  /** Ref for the picker panel element. */
  panelRef: RefObject<HTMLDivElement | null>;
};

/** Render the connector drop picker at the correct viewport position. */
function ConnectorDropPanel({
  engine,
  snapshot,
  templates,
  onSelect,
  panelRef,
}: ConnectorDropPanelProps) {
  /** View state used for converting drop coordinates. */
  const viewState = useBoardViewState(engine);
  const connectorDrop = snapshot.connectorDrop;
  if (!connectorDrop) return null;
  // 逻辑：根据当前视口把世界坐标转换为屏幕位置。
  const screen = toScreenPoint(connectorDrop.point, viewState);
  return (
    <NodePicker ref={panelRef} position={screen} templates={templates} onSelect={onSelect} />
  );
}
