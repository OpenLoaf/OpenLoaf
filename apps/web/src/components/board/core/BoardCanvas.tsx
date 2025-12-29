"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@udecode/cn";
import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { BoardProvider, type ImagePreviewPayload } from "./BoardProvider";
import { CanvasEngine } from "../engine/CanvasEngine";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardControls from "../controls/BoardControls";
import BoardToolbar from "../toolbar/BoardToolbar";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import { buildImageNodePayloadFromFile } from "../utils/image";
import type {
  CanvasElement,
  CanvasConnectorElement,
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
import {
  BOARD_SCHEMA_VERSION,
  getWorkspaceIdFromCookie,
  type BoardSnapshotState,
} from "./boardStorage";
import {
  readBoardSnapshotCache,
  writeBoardSnapshotCache,
  type BoardSnapshotCacheRecord,
} from "./boardSnapshotCache";
import { useBoardSnapshot } from "./useBoardSnapshot";
const VIEWPORT_SAVE_DELAY = 800;
/** Default size for auto-created text nodes. */
const TEXT_NODE_DEFAULT_SIZE: [number, number] = [280, 140];
/** Offset applied when stacking multiple dropped images. */
const IMAGE_DROP_STACK_OFFSET = 24;

/** Split elements into nodes and connectors. */
const splitElements = (elements: CanvasElement[]) => {
  const nodes: CanvasNodeElement[] = [];
  const connectors: CanvasConnectorElement[] = [];
  elements.forEach((element) => {
    if (element.kind === "connector") {
      connectors.push(element);
      return;
    }
    nodes.push(element as CanvasNodeElement);
  });
  return { nodes, connectors };
};

/** Merge nodes and connectors into a single element list. */
const mergeElements = (
  nodes: CanvasNodeElement[],
  connectors: CanvasConnectorElement[]
): CanvasElement[] => [...nodes, ...connectors];

/** Check whether a drag event carries file payloads. */
const isFileDragEvent = (event: DragEvent<HTMLElement>) => {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
};

/** Check whether a file is a supported image. */
const isImageFile = (file: File) => file.type.startsWith("image/");

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
  /** Whether the server snapshot has been hydrated. */
  const hydratedRef = useRef(false);
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
  /** Cached local snapshot for comparisons. */
  const [localSnapshot, setLocalSnapshot] = useState<BoardSnapshotCacheRecord | null>(null);
  /** Whether local snapshot has been loaded. */
  const [localLoaded, setLocalLoaded] = useState(false);
  /** Last viewport snapshot to detect changes. */
  const lastViewportRef = useRef(snapshot.viewport);
  /** Last panning state to detect transitions. */
  const lastPanningRef = useRef(snapshot.panning);
  /** Latest snapshot ref for save callbacks. */
  const latestSnapshotRef = useRef(snapshot);
  /** Latest snapshot version for sync decisions. */
  const currentVersionRef = useRef(0);
  /** Workspace id resolved from props or cookie. */
  const resolvedWorkspaceId = workspaceId ?? getWorkspaceIdFromCookie();
  /** Board scope used for remote persistence. */
  const boardScope = useMemo(() => {
    if (!resolvedWorkspaceId || !boardId) return null;
    return { workspaceId: resolvedWorkspaceId, pageId: boardId };
  }, [boardId, resolvedWorkspaceId]);
  /** Log guard for missing scope. */
  const missingScopeLoggedRef = useRef(false);
  /** Remote snapshot query for the board. */
  const boardQuery = useQuery(
    trpc.boardCustom.get.queryOptions(boardScope ?? skipToken)
  );
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
  /** Apply a snapshot into the engine state. */
  const applySnapshot = useCallback(
    (snapshotData: BoardSnapshotState) => {
      const nodes = Array.isArray(snapshotData.nodes) ? snapshotData.nodes : [];
      const connectors = Array.isArray(snapshotData.connectors)
        ? snapshotData.connectors
        : [];
      const elements = mergeElements(nodes, connectors);
      hydratedRef.current = false;
      // 逻辑：恢复快照时先写入文档，再同步视口。
      engine.doc.setElements(elements);
      if (snapshotData.viewport) {
        engine.viewport.setViewport(
          snapshotData.viewport.zoom,
          snapshotData.viewport.offset
        );
      }
      engine.commitHistory();
      lastSavedElementsRef.current = JSON.stringify(elements);
      if (snapshotData.viewport) {
        lastSavedViewportRef.current = JSON.stringify({
          zoom: snapshotData.viewport.zoom,
          offset: snapshotData.viewport.offset,
        });
      }
      currentVersionRef.current = snapshotData.version ?? 0;
      hydratedRef.current = true;
    },
    [engine]
  );
  /** Persist the current snapshot to local cache. */
  const persistSnapshot = useCallback(
    (
      nodes: CanvasNodeElement[],
      connectors: CanvasConnectorElement[],
      viewport: BoardSnapshotState["viewport"],
      options?: { bumpVersion?: boolean }
    ) => {
      if (!boardScope) return;
      const bumpVersion = options?.bumpVersion ?? true;
      const nextVersion = bumpVersion
        ? currentVersionRef.current + 1
        : currentVersionRef.current;
      // 逻辑：转成 JSON 安全对象，避免 undefined 写库失败。
      const payload = JSON.parse(
        JSON.stringify({ nodes, connectors, viewport })
      ) as Pick<BoardSnapshotState, "nodes" | "connectors" | "viewport">;
      // 逻辑：统一在此处拼装存储数据，避免多处重复。
      const localSnapshotPayload: BoardSnapshotCacheRecord = {
        workspaceId: boardScope.workspaceId,
        pageId: boardScope.pageId,
        schemaVersion: BOARD_SCHEMA_VERSION,
        nodes: payload.nodes,
        connectors: payload.connectors,
        viewport: payload.viewport,
        version: nextVersion,
      };
      currentVersionRef.current = nextVersion;
      setLocalSnapshot(localSnapshotPayload);
      void writeBoardSnapshotCache(localSnapshotPayload);
    },
    [boardScope]
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
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (nodesRegisteredRef.current) return;
    if (!nodes || nodes.length === 0) return;
    // 只在首次挂载时注册节点定义，避免重复注册报错。
    engine.registerNodes(nodes);
    nodesRegisteredRef.current = true;
  }, [engine, nodes]);

  useEffect(() => {
    if (!boardScope && !missingScopeLoggedRef.current) {
      // 逻辑：workspaceId/pageId 缺失时记录一次，避免误判无保存请求。
      console.warn("[board] save skipped: missing workspaceId/pageId", {
        workspaceId: resolvedWorkspaceId,
        boardId,
      });
      missingScopeLoggedRef.current = true;
    }
    if (!boardScope) return;
    missingScopeLoggedRef.current = false;
    hydratedRef.current = false;
    setLocalLoaded(false);
    setLocalSnapshot(null);

    let cancelled = false;
    const loadLocalSnapshot = async () => {
      const local = await readBoardSnapshotCache(
        boardScope.workspaceId,
        boardScope.pageId
      );
      if (cancelled) return;
      setLocalSnapshot(local);
      setLocalLoaded(true);
      if (local) {
        // 逻辑：优先恢复本地快照，保证首屏加载速度。
        applySnapshot(local);
      }
    };
    void loadLocalSnapshot();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, boardId, boardScope, resolvedWorkspaceId]);

  useEffect(() => {
    if (!boardScope) return;
    if (!boardQuery.isFetched) return;
    if (!localLoaded) return;

    const remote = boardQuery.data?.board as BoardSnapshotState | null;
    const local = localSnapshot;

    if (!local && !remote) {
      if (initialElementsRef.current) return;
      if (!initialElements || initialElements.length === 0) return;
      // 逻辑：无本地/远端快照时写入初始元素。
      engine.setInitialElements(initialElements);
      initialElementsRef.current = true;
      hydratedRef.current = true;
      return;
    }

    if (!local && remote) {
      applySnapshot(remote);
      const snapshot: BoardSnapshotCacheRecord = {
        workspaceId: boardScope.workspaceId,
        pageId: boardScope.pageId,
        schemaVersion: remote.schemaVersion ?? BOARD_SCHEMA_VERSION,
        nodes: remote.nodes,
        connectors: remote.connectors,
        viewport: remote.viewport,
        version: remote.version ?? 0,
      };
      setLocalSnapshot(snapshot);
      void writeBoardSnapshotCache(snapshot);
      return;
    }

    if (local && !remote) {
      if (local.nodes.length === 0 && local.connectors.length === 0) return;
      // 逻辑：仅保留本地快照，不再回写远端。
      return;
    }

    if (!local || !remote) return;
    if (remote.version > local.version) {
      applySnapshot(remote);
      const snapshot: BoardSnapshotCacheRecord = {
        workspaceId: boardScope.workspaceId,
        pageId: boardScope.pageId,
        schemaVersion: remote.schemaVersion ?? BOARD_SCHEMA_VERSION,
        nodes: remote.nodes,
        connectors: remote.connectors,
        viewport: remote.viewport,
        version: remote.version ?? 0,
      };
      setLocalSnapshot(snapshot);
      void writeBoardSnapshotCache(snapshot);
      return;
    }
    if (local.version > remote.version) {
      // 逻辑：本地版本更高时保持本地数据，不触发远端更新。
      return;
    }
  }, [
    applySnapshot,
    boardQuery.data,
    boardQuery.isFetched,
    boardScope,
    engine,
    initialElements,
    localLoaded,
    localSnapshot,
    persistSnapshot,
  ]);

  useEffect(() => {
    if (!boardScope) return;
    if (!hydratedRef.current) return;
    if (snapshot.draggingId) {
      // 逻辑：拖拽过程中先标记，等放开后再保存。
      pendingSaveRef.current = true;
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
    const viewportPayload = {
      zoom: viewportState.zoom,
      offset: viewportState.offset,
    };
    lastSavedViewportRef.current = JSON.stringify(viewportPayload);
    const { nodes, connectors } = splitElements(snapshot.elements);
    persistSnapshot(nodes, connectors, viewportPayload);
  }, [boardScope, engine, snapshot.draggingId, snapshot.elements, persistSnapshot]);

  useEffect(() => {
    if (!boardScope) return;
    if (!hydratedRef.current) return;
    const viewportState = engine.viewport.getState();
    const viewportPayload = {
      zoom: viewportState.zoom,
      offset: viewportState.offset,
    };
    const viewportKey = JSON.stringify(viewportPayload);
    const viewportChanged = viewportKey !== lastSavedViewportRef.current;
    if (!viewportChanged) return;
    if (viewportSaveTimeoutRef.current) {
      window.clearTimeout(viewportSaveTimeoutRef.current);
    }
    viewportSaveTimeoutRef.current = window.setTimeout(() => {
      if (!boardScope || !hydratedRef.current) return;
      lastSavedViewportRef.current = viewportKey;
      const { nodes, connectors } = splitElements(snapshot.elements);
      persistSnapshot(nodes, connectors, viewportPayload);
    }, VIEWPORT_SAVE_DELAY);
    return () => {
      if (viewportSaveTimeoutRef.current) {
        window.clearTimeout(viewportSaveTimeoutRef.current);
      }
    };
  }, [boardScope, engine, snapshot.elements, snapshot.panning, snapshot.viewport, persistSnapshot]);

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

  /** Allow dropping external files onto the canvas. */
  const handleCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  /** Handle dropping images onto the canvas surface. */
  const handleCanvasDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDragEvent(event)) return;
      event.preventDefault();
      if (engine.isLocked()) return;

      const { clientX, clientY, dataTransfer } = event;
      const droppedFiles = Array.from(dataTransfer.files);
      // 逻辑：只挑出图片类型，避免其他文件触发节点创建。
      const imageFiles = droppedFiles.filter(isImageFile);
      if (imageFiles.length === 0) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // 逻辑：将拖拽点转换为画布坐标，作为插入基准。
      const dropPoint = engine.screenToWorld([
        clientX - rect.left,
        clientY - rect.top,
      ]);

      for (const [index, file] of imageFiles.entries()) {
        const payload = await buildImageNodePayloadFromFile(file);
        const [width, height] = payload.size;
        const offset = IMAGE_DROP_STACK_OFFSET * index;
        // 逻辑：以鼠标位置为中心放置节点，多文件时稍微错开。
        engine.addNodeElement("image", payload.props, [
          dropPoint[0] - width / 2 + offset,
          dropPoint[1] - height / 2 + offset,
          width,
          height,
        ]);
      }
    },
    [engine]
  );

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
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
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
