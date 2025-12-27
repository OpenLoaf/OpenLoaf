"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@udecode/cn";
import { BoardProvider, type ImagePreviewPayload } from "./BoardProvider";
import { CanvasEngine } from "../engine/CanvasEngine";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardControls from "../controls/BoardControls";
import BoardToolbar from "../toolbar/BoardToolbar";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import type {
  CanvasElement,
  CanvasNodeDefinition,
  CanvasNodeElement,
  CanvasSnapshot,
} from "../engine/types";
import { ConnectorActionPanel, NodeInspectorPanel } from "../ui/CanvasPanels";
import { CanvasSurface } from "../render/CanvasSurface";
import { CanvasDomLayer } from "./CanvasDomLayer";
import { AnchorOverlay } from "./AnchorOverlay";
import { MiniMap } from "./MiniMap";
import {
  MultiSelectionOutline,
  MultiSelectionToolbar,
  SingleSelectionToolbar,
} from "./SelectionOverlay";
import { ConnectorDropPanel, type ConnectorDropItem } from "./ConnectorDropPanel";
import { getWorkspaceIdFromCookie } from "./boardStorage";
import type { BoardStorageState } from "./boardStorage";
import { useBoardSnapshot } from "./useBoardSnapshot";
const VIEWPORT_SAVE_DELAY = 800;
/** Default size for auto-created text nodes. */
const TEXT_NODE_DEFAULT_SIZE: [number, number] = [280, 140];

export type BoardCanvasProps = {
  /** External engine instance, optional for integration scenarios. */
  engine?: CanvasEngine;
  /** Node definitions to register on first mount. */
  nodes?: CanvasNodeDefinition<any>[];
  /** Initial elements inserted once when mounted. */
  initialElements?: CanvasElement[];
  /** Workspace id for storage isolation. */
  workspaceId?: string;
  /** Optional board identifier used for storage scoping. */
  boardId?: string;
  /** Optional container class name. */
  className?: string;
};

/** Render the new board canvas surface and DOM layers. */
export function BoardCanvas({
  engine: externalEngine,
  nodes,
  initialElements,
  workspaceId,
  boardId,
  className,
}: BoardCanvasProps) {
  /** Root container element for canvas interactions. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Engine instance used for rendering and interaction. */
  const engine = useMemo(
    () => externalEngine ?? new CanvasEngine(),
    [externalEngine]
  );
  /** Latest snapshot from the engine. */
  const snapshot = useBoardSnapshot(engine);
  /** Guard for first-time node registration. */
  const nodesRegisteredRef = useRef(false);
  /** Guard for first-time initial element insertion. */
  const initialElementsRef = useRef(false);
  /** Panel ref used for outside-click detection. */
  const connectorDropRef = useRef<HTMLDivElement | null>(null);
  /** Node inspector target id. */
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null);
  /** Last restored storage key. */
  const restoredKeyRef = useRef<string | null>(null);
  /** Whether the current storage key has been hydrated. */
  const hydratedRef = useRef(false);
  /** Skip the next save until a non-empty snapshot arrives. */
  const skipSaveOnceRef = useRef(false);
  /** Whether storage already has non-empty elements. */
  const hasStoredElementsRef = useRef(false);
  /** Last saved elements snapshot for change detection. */
  const lastSavedElementsRef = useRef<string>("");
  /** Last saved viewport snapshot for change detection. */
  const lastSavedViewportRef = useRef<string>("");
  /** Pending save marker during drag interactions. */
  const pendingSaveRef = useRef(false);
  /** Timeout id for debounced viewport save. */
  const viewportSaveTimeoutRef = useRef<number | null>(null);
  /** Whether the minimap should stay visible. */
  const [showMiniMap, setShowMiniMap] = useState(false);
  /** Whether the minimap hover zone is active. */
  const [hoverMiniMap, setHoverMiniMap] = useState(false);
  /** Timeout id for hiding the minimap. */
  const miniMapTimeoutRef = useRef<number | null>(null);
  /** Image preview payload for the fullscreen viewer. */
  const [imagePreview, setImagePreview] = useState<ImagePreviewPayload | null>(null);
  /** Last viewport snapshot to detect changes. */
  const lastViewportRef = useRef(snapshot.viewport);
  /** Last panning state to detect transitions. */
  const lastPanningRef = useRef(snapshot.panning);
  /** Local storage key for this board. */
  const storageKey = useMemo(() => {
    // 逻辑：workspaceId 未就绪时尝试从 cookie 兜底，避免无法持久化。
    const scope = workspaceId ?? getWorkspaceIdFromCookie() ?? "default";
    return `teatime-board:${scope}:${boardId ?? "default"}`;
  }, [boardId, workspaceId]);

  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  /** Open the fullscreen image preview overlay. */
  const openImagePreview = useCallback((payload: ImagePreviewPayload) => {
    // 逻辑：节点请求预览时直接替换当前预览数据。
    setImagePreview(payload);
  }, []);
  /** Close the fullscreen image preview overlay. */
  const closeImagePreview = useCallback(() => {
    // 逻辑：关闭预览时清空当前预览数据。
    setImagePreview(null);
  }, []);
  /** Shared board actions exposed to node components. */
  const boardActions = useMemo(
    () => ({ openImagePreview, closeImagePreview }),
    [openImagePreview, closeImagePreview]
  );

  useEffect(() => {
    // 逻辑：主题切换时强制刷新画布渲染，确保连线颜色同步更新。
    const root = document.documentElement;
    const refresh = () => engine.refreshView();
    const observer = new MutationObserver(() => refresh());
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (media) {
      const handler = () => refresh();
      media.addEventListener?.("change", handler);
      return () => {
        observer.disconnect();
        media.removeEventListener?.("change", handler);
      };
    }
    return () => {
      observer.disconnect();
    };
  }, [engine]);

  useEffect(() => {
    if (nodesRegisteredRef.current) return;
    if (!nodes || nodes.length === 0) return;
    // 只在首次挂载时注册节点定义，避免重复注册报错。
    engine.registerNodes(nodes);
    nodesRegisteredRef.current = true;
  }, [engine, nodes]);

  useEffect(() => {
    if (initialElementsRef.current) return;
    if (!initialElements || initialElements.length === 0) return;
    // 初始化元素一次性写入文档，保证首屏内容可复现。
    engine.setInitialElements(initialElements);
    initialElementsRef.current = true;
  }, [engine, initialElements]);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredKeyRef.current === storageKey) return;
    // 逻辑：切换存储 key 时先重置标记，再恢复缓存与视口，最后更新同步标志。
    hydratedRef.current = false;
    lastSavedElementsRef.current = "";
    skipSaveOnceRef.current = true;
    restoredKeyRef.current = storageKey;

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      // 逻辑：无缓存时避免首次渲染就写入空数组覆盖历史数据。
      lastSavedElementsRef.current = JSON.stringify(engine.doc.getElements());
      const viewportState = engine.viewport.getState();
      lastSavedViewportRef.current = JSON.stringify({
        zoom: viewportState.zoom,
        offset: viewportState.offset,
      });
      hydratedRef.current = true;
      return;
    }
    try {
      const stored = JSON.parse(raw) as BoardStorageState;
      if (Array.isArray(stored.elements) && stored.elements.length > 0) {
        // 逻辑：本地有缓存时优先恢复，避免初始节点覆盖。
        engine.doc.setElements(stored.elements);
        if (stored.viewport) {
          engine.viewport.setViewport(stored.viewport.zoom, stored.viewport.offset);
        }
        engine.commitHistory();
        initialElementsRef.current = true;
        hasStoredElementsRef.current = true;
      }
      // 逻辑：读取缓存后同步最后保存快照，避免覆盖现有数据。
      if (Array.isArray(stored.elements)) {
        lastSavedElementsRef.current = JSON.stringify(stored.elements);
        if (stored.elements.length > 0) {
          hasStoredElementsRef.current = true;
        }
      }
      if (stored.viewport) {
        lastSavedViewportRef.current = JSON.stringify(stored.viewport);
      }
    } catch {
      // 逻辑：本地缓存异常时忽略，避免阻塞渲染。
    }
    hydratedRef.current = true;
  }, [engine, storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (!hydratedRef.current) return;
    // 逻辑：保存流程先过滤空数组与拖拽中间态，再做差异化写入。
    if (skipSaveOnceRef.current) {
      if (snapshot.elements.length === 0) {
        return;
      }
      skipSaveOnceRef.current = false;
    }
    if (snapshot.elements.length === 0 && hasStoredElementsRef.current) {
      // 逻辑：热更新期间不写入空数组，避免覆盖已有缓存。
      return;
    }
    if (snapshot.draggingId) {
      // 逻辑：拖拽过程中暂存，等放开后再保存。
      pendingSaveRef.current = true;
      return;
    }
    if (snapshot.elements.length === 0 && lastSavedElementsRef.current === "") {
      // 逻辑：首次空数组不写入，避免热更新时清空已有缓存。
      return;
    }
    const elementsPayload = JSON.stringify(snapshot.elements);
    const elementsChanged = elementsPayload !== lastSavedElementsRef.current;
    if (!elementsChanged && !pendingSaveRef.current) return;
    lastSavedElementsRef.current = elementsPayload;
    pendingSaveRef.current = false;
    if (viewportSaveTimeoutRef.current) {
      window.clearTimeout(viewportSaveTimeoutRef.current);
      viewportSaveTimeoutRef.current = null;
    }
    const viewportState = engine.viewport.getState();
    lastSavedViewportRef.current = JSON.stringify({
      zoom: viewportState.zoom,
      offset: viewportState.offset,
    });
    const payload: BoardStorageState = {
      version: 1,
      elements: snapshot.elements,
      viewport: {
        zoom: viewportState.zoom,
        offset: viewportState.offset,
      },
    };
    // 逻辑：仅在组件数据变化时保存，避免频繁写入。
    console.log("[board] save", storageKey, payload);
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    engine,
    snapshot.draggingId,
    snapshot.elements,
    storageKey,
  ]);

  useEffect(() => {
    if (!storageKey) return;
    if (!hydratedRef.current) return;
    const viewportState = engine.viewport.getState();
    const viewportPayload = JSON.stringify({
      zoom: viewportState.zoom,
      offset: viewportState.offset,
    });
    const viewportChanged = viewportPayload !== lastSavedViewportRef.current;
    if (!viewportChanged) return;
    if (viewportSaveTimeoutRef.current) {
      window.clearTimeout(viewportSaveTimeoutRef.current);
    }
    viewportSaveTimeoutRef.current = window.setTimeout(() => {
      if (!storageKey || !hydratedRef.current) return;
      if (snapshot.elements.length === 0 && hasStoredElementsRef.current) return;
      if (snapshot.elements.length === 0 && lastSavedElementsRef.current === "") return;
      lastSavedViewportRef.current = viewportPayload;
      const payload: BoardStorageState = {
        version: 1,
        elements: snapshot.elements,
        viewport: {
          zoom: viewportState.zoom,
          offset: viewportState.offset,
        },
      };
      console.log("[board] save", storageKey, payload);
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    }, VIEWPORT_SAVE_DELAY);
    return () => {
      if (viewportSaveTimeoutRef.current) {
        window.clearTimeout(viewportSaveTimeoutRef.current);
      }
    };
  }, [engine, snapshot.elements, snapshot.panning, snapshot.viewport, storageKey]);

  useEffect(() => {
    const lastViewport = lastViewportRef.current;
    const viewportChanged =
      lastViewport.zoom !== snapshot.viewport.zoom ||
      lastViewport.offset[0] !== snapshot.viewport.offset[0] ||
      lastViewport.offset[1] !== snapshot.viewport.offset[1] ||
      lastViewport.size[0] !== snapshot.viewport.size[0] ||
      lastViewport.size[1] !== snapshot.viewport.size[1];
    const wasPanning = lastPanningRef.current;

    lastViewportRef.current = snapshot.viewport;
    lastPanningRef.current = snapshot.panning;

    if (snapshot.panning || viewportChanged) {
      setShowMiniMap(true);
    }

    if (snapshot.panning) {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
        miniMapTimeoutRef.current = null;
      }
      return;
    }

    if (viewportChanged || wasPanning) {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
      }
      miniMapTimeoutRef.current = window.setTimeout(() => {
        setShowMiniMap(false);
      }, MINIMAP_HIDE_DELAY);
    }
  }, [snapshot.panning, snapshot.viewport]);

  useEffect(() => {
    return () => {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
      }
    };
  }, []);

  const cursor =
    snapshot.pendingInsert
      ? "crosshair"
      : snapshot.activeToolId === "hand"
        ? snapshot.panning
          ? "grabbing"
          : "grab"
        : snapshot.draggingId
          ? "grabbing"
        : "default";

  const connectorDrop = snapshot.connectorDrop;
  const connectorDropScreen = connectorDrop
    ? toScreenPoint(connectorDrop.point, snapshot)
    : null;
  const selectedConnector = getSingleSelectedElement(snapshot, "connector");
  const selectedNode = getSingleSelectedElement(snapshot, "node");
  const shouldShowMiniMap = showMiniMap || hoverMiniMap;
  const inspectorElement = inspectorNodeId
    ? snapshot.elements.find(
        (element): element is CanvasNodeElement =>
          element.kind === "node" && element.id === inspectorNodeId
      ) ?? null
    : null;

  useEffect(() => {
    if (!connectorDrop) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const panel = connectorDropRef.current;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      // 逻辑：点击面板外部时关闭，不创建节点。
      engine.setConnectorDrop(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
    };
  }, [connectorDrop, engine]);

  useEffect(() => {
    if (!inspectorNodeId) return;
    // 逻辑：节点被删除或取消选择时收起详情面板。
    if (!snapshot.selectedIds.includes(inspectorNodeId) || !inspectorElement) {
      setInspectorNodeId(null);
    }
  }, [inspectorElement, inspectorNodeId, snapshot.selectedIds]);

  /** Create a node and connector from a drop panel selection. */
  const handleConnectorDropSelect = (item: ConnectorDropItem) => {
    if (!connectorDrop) return;
    const [width, height] = item.size;
    const xywh: [number, number, number, number] = [
      connectorDrop.point[0] - width / 2,
      connectorDrop.point[1] - height / 2,
      width,
      height,
    ];
    const id = engine.addNodeElement(item.type, item.props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: connectorDrop.source,
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
    engine.setConnectorDrop(null);
  };

  /** Open the node inspector. */
  const openInspector = (elementId: string) => {
    setInspectorNodeId(elementId);
  };

  return (
    <BoardProvider engine={engine} actions={boardActions}>
      <div
        ref={containerRef}
        className={cn(
          "relative h-full w-full overflow-hidden outline-none",
          cursor === "crosshair" && "cursor-crosshair",
          cursor === "grabbing" && "cursor-grabbing",
          cursor === "grab" && "cursor-grab",
          cursor === "default" && "cursor-default",
          className
        )}
        tabIndex={0}
        onPointerDown={event => {
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
              ? engine.screenToWorld([
                  event.clientX - rect.left,
                  event.clientY - rect.top,
                ])
              : null;
          const hitElement = worldPoint ? engine.pickElementAt(worldPoint) : null;
          const shouldClear =
            snapshot.activeToolId === "select" &&
            !snapshot.pendingInsert &&
            !snapshot.toolbarDragging &&
            !event.shiftKey &&
            target &&
            hitElement?.kind !== "connector" &&
            !isBoardUiTarget(target, [
              "[data-board-node]",
              "[data-connector-drop-panel]",
            ]);
          if (shouldClear) {
            // 逻辑：空白点击时清空选区，避免残留高亮。
            engine.selection.clear();
          }
        }}
        onDoubleClick={event => {
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
          if (
            isBoardUiTarget(target, [
              "[data-board-node]",
              "[data-connector-drop-panel]",
            ])
          ) {
            return;
          }
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const worldPoint = engine.screenToWorld([
            event.clientX - rect.left,
            event.clientY - rect.top,
          ]);
          const hitElement = engine.pickElementAt(worldPoint);
          if (hitElement) return;
          const [width, height] = TEXT_NODE_DEFAULT_SIZE;
          // 逻辑：双击空白处创建文本节点并立即进入编辑。
          engine.addNodeElement(
            "text",
            {
              autoFocus: true,
              value: [{ type: "p", children: [{ text: "" }] }],
            },
            [
              worldPoint[0] - width / 2,
              worldPoint[1] - height / 2,
              width,
              height,
            ]
          );
        }}
      >
        <div
          className="absolute left-0 top-0 z-20 h-24 w-24"
          onPointerEnter={() => {
            if (miniMapTimeoutRef.current) {
              window.clearTimeout(miniMapTimeoutRef.current);
              miniMapTimeoutRef.current = null;
            }
            setHoverMiniMap(true);
            setShowMiniMap(true);
          }}
          onPointerLeave={() => {
            setHoverMiniMap(false);
            if (!snapshot.panning) {
              setShowMiniMap(false);
            }
          }}
        />
        <CanvasSurface snapshot={snapshot} />
        <CanvasDomLayer engine={engine} snapshot={snapshot} />
        <AnchorOverlay snapshot={snapshot} />
        <MiniMap snapshot={snapshot} visible={shouldShowMiniMap} />
        <BoardControls engine={engine} snapshot={snapshot} />
        <BoardToolbar engine={engine} snapshot={snapshot} />
        {selectedConnector ? (
          <ConnectorActionPanel
            snapshot={snapshot}
            connector={selectedConnector}
            onStyleChange={style => engine.setConnectorStyle(style)}
            onDelete={() => engine.deleteSelection()}
          />
        ) : null}
        <MultiSelectionOutline snapshot={snapshot} engine={engine} />
        {selectedNode ? (
          <SingleSelectionToolbar
            snapshot={snapshot}
            engine={engine}
            element={selectedNode}
            onInspect={openInspector}
          />
        ) : null}
        <MultiSelectionToolbar
          snapshot={snapshot}
          engine={engine}
          onInspect={openInspector}
        />
        {inspectorElement ? (
          <NodeInspectorPanel
            snapshot={snapshot}
            element={inspectorElement}
            onClose={() => setInspectorNodeId(null)}
          />
        ) : null}
        {connectorDrop && connectorDropScreen ? (
          <ConnectorDropPanel
            ref={connectorDropRef}
            position={connectorDropScreen}
            onSelect={handleConnectorDropSelect}
          />
        ) : null}
      </div>
      {imagePreview
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
              onClick={closeImagePreview}
              role="dialog"
              aria-label="Image preview"
            >
              <div
                className="max-h-full max-w-full"
                onClick={event => {
                  // 逻辑：阻止点击图片时关闭预览，允许继续放大观看。
                  event.stopPropagation();
                }}
              >
                <img
                  src={imagePreview.originalSrc || imagePreview.previewSrc}
                  alt={imagePreview.fileName || "Image"}
                  className="max-h-[90vh] max-w-[90vw] object-contain"
                  draggable={false}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </BoardProvider>
  );
}

/** Resolve a single selected element by kind. */
function getSingleSelectedElement<TKind extends CanvasElement["kind"]>(
  snapshot: CanvasSnapshot,
  kind: TKind
): Extract<CanvasElement, { kind: TKind }> | null {
  const selectedIds = snapshot.selectedIds;
  if (selectedIds.length !== 1) return null;
  const selectedId = selectedIds[0];
  const element = snapshot.elements.find(item => item.id === selectedId);
  if (!element || element.kind !== kind) return null;
  return element as Extract<CanvasElement, { kind: TKind }>;
}
