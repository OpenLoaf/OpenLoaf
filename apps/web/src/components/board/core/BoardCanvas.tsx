"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@udecode/cn";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { BoardProvider, type ImagePreviewPayload } from "./BoardProvider";
import { CanvasEngine } from "../engine/CanvasEngine";
import { MINIMAP_HIDE_DELAY } from "../engine/constants";
import BoardControls from "../controls/BoardControls";
import BoardToolbar from "../toolbar/BoardToolbar";
import { isBoardUiTarget } from "../utils/dom";
import { toScreenPoint } from "../utils/coordinates";
import { buildImageNodePayloadFromFile, dataUrlToBlob } from "../utils/image";
import { openLinkInStack as openLinkInStackAction, resolveLinkTitle } from "../nodes/lib/link-actions";
import type { ImageNodeProps } from "../nodes/ImageNode";
import type { LinkNodeProps } from "../nodes/LinkNode";
import { IMAGE_GENERATE_NODE_TYPE } from "../nodes/ImageGenerateNode";
import { IMAGE_PROMPT_GENERATE_NODE_TYPE } from "../nodes/ImagePromptGenerateNode";
import { readImageDragPayload } from "@/lib/image/drag";
import { FILE_DRAG_URI_MIME } from "@/components/ui/tenas/drag-drop-types";
import ImagePreviewDialog from "@/components/file/ImagePreviewDialog";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import {
  buildChildUri,
  buildTenasFileUrl,
  getRelativePathFromUri,
  getUniqueName,
  parseTenasFileUrl,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import type {
  CanvasElement,
  CanvasConnectorElement,
  CanvasNodeDefinition,
  CanvasNodeElement,
  CanvasSnapshot,
  CanvasPoint,
} from "../engine/types";
import { ConnectorActionPanel, NodeInspectorPanel } from "../ui/CanvasPanels";
import { CanvasSurface } from "../render/CanvasSurface";
import { CanvasDomLayer } from "./CanvasDomLayer";
import { BoardPerfOverlay } from "./BoardPerfOverlay";
import { AnchorOverlay } from "./AnchorOverlay";
import { MiniMap } from "./MiniMap";
import { getClipboardInsertPayload } from "../engine/clipboard";
import {
  MultiSelectionOutline,
  MultiSelectionToolbar,
  SingleSelectionResizeHandle,
  SingleSelectionToolbar,
} from "./SelectionOverlay";
import { NodePicker } from "./NodePicker";
import {
  BOARD_SCHEMA_VERSION,
  createEmptyBoardSnapshot,
  getWorkspaceIdFromCookie,
  type BoardSnapshotState,
} from "./boardStorage";
import {
  readBoardSnapshotCache,
  writeBoardSnapshotCache,
  type BoardSnapshotCacheRecord,
} from "./boardSnapshotCache";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { useBasicConfig } from "@/hooks/use-basic-config";
const VIEWPORT_SAVE_DELAY = 800;
/** Default size for double-click created text nodes. */
const TEXT_NODE_DEFAULT_SIZE: [number, number] = [280, 140];
/** Offset applied when stacking multiple dropped images. */
const IMAGE_DROP_STACK_OFFSET = 24;
/** Prefix used for board-relative tenas-file paths. */
const BOARD_RELATIVE_URI_PREFIX = "tenas-file://./";
const EDITABLE_NODE_TYPES = new Set([
  "text",
  IMAGE_GENERATE_NODE_TYPE,
  IMAGE_PROMPT_GENERATE_NODE_TYPE,
]);

/** Normalize a relative path string. */
function normalizeRelativePath(value: string) {
  return value.replace(/^\/+/, "");
}

/** Return true when the relative path attempts to traverse parents. */
function hasParentTraversal(value: string) {
  return value.split("/").some((segment) => segment === "..");
}

/** Map image node sources through a transform function. */
function mapSnapshotImageSources(
  snapshot: BoardSnapshotState,
  transform: (source: string) => string
): BoardSnapshotState {
  let changed = false;
  const nextNodes = snapshot.nodes.map((node) => {
    if (node.type !== "image") return node;
    const props = node.props as Record<string, unknown>;
    const originalSrc = typeof props.originalSrc === "string" ? props.originalSrc : "";
    if (!originalSrc) return node;
    const nextSrc = transform(originalSrc);
    if (!nextSrc || nextSrc === originalSrc) return node;
    changed = true;
    return {
      ...node,
      props: {
        ...props,
        originalSrc: nextSrc,
      },
    };
  });
  if (!changed) return snapshot;
  return {
    ...snapshot,
    nodes: nextNodes,
  };
}

/** Strip preview sources from image nodes for file persistence. */
function stripSnapshotImagePreviews(snapshot: BoardSnapshotState): BoardSnapshotState {
  let changed = false;
  const nextNodes = snapshot.nodes.map((node) => {
    if (node.type !== "image") return node;
    const props = node.props as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(props, "previewSrc")) return node;
    changed = true;
    const { previewSrc: _previewSrc, ...rest } = props;
    return {
      ...node,
      props: rest,
    };
  });
  if (!changed) return snapshot;
  return {
    ...snapshot,
    nodes: nextNodes,
  };
}

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

/** Check whether a drag event carries image payloads. */
const isImageDragEvent = (event: DragEvent<HTMLElement>) => {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  const typeList = Array.from(types);
  if (typeList.includes("Files")) return true;
  if (typeList.includes(FILE_DRAG_URI_MIME)) return true;
  return Boolean(readImageDragPayload(event.dataTransfer));
};

/** Check whether a file is a supported image. */
const isImageFile = (file: File) => file.type.startsWith("image/");

/** Parse a board snapshot from file content. */
function parseBoardSnapshot(content?: string | null): BoardSnapshotState | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as BoardSnapshotState;
  } catch {
    // 中文注释：解析失败时回退为空画布，保证后续编辑可以覆盖保存。
    return createEmptyBoardSnapshot();
  }
}

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
  /** Root container element for canvas interactions. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Engine instance used for rendering and interaction. */
  const engine = useMemo(
    () => externalEngine ?? new CanvasEngine(),
    [externalEngine]
  );
  /** Query client for ad-hoc file listing. */
  const queryClient = useQueryClient();
  /** Latest snapshot from the engine. */
  const snapshot = useBoardSnapshot(engine);
  const showUi = !uiHidden;
  /** Basic settings for UI toggles. */
  const { basic } = useBasicConfig();
  /** Whether the performance overlay is visible. */
  const showPerfOverlay = Boolean(basic.boardDebugEnabled);
  /** Guard for first-time node registration. */
  const nodesRegisteredRef = useRef(false);
  /** Guard for first-time initial element insertion. */
  const initialElementsRef = useRef(false);
  /** Panel ref used for outside-click detection. */
  const nodePickerRef = useRef<HTMLDivElement | null>(null);
  /** Node inspector target id. */
  const [inspectorNodeId, setInspectorNodeId] = useState<string | null>(null);
  /** Culling stats for the performance overlay. */
  const [cullingStats, setCullingStats] = useState({
    totalNodes: 0,
    visibleNodes: 0,
    culledNodes: 0,
  });
  /** GPU stats for the performance overlay. */
  const [gpuStats, setGpuStats] = useState({
    imageTextures: 0,
  });
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
  /** Timeout id for debounced file snapshot save. */
  const remoteSaveTimeoutRef = useRef<number | null>(null);
  /** Latest payload queued for file save. */
  const pendingFileSnapshotRef = useRef<BoardSnapshotState | null>(null);
  /** Image node ids currently upgrading to asset files. */
  const imageAssetUpgradeIdsRef = useRef<Set<string>>(new Set());
  /** Whether the minimap should stay visible. */
  const [showMiniMap, setShowMiniMap] = useState(false);
  /** Whether grid rendering is suppressed for export. */
  const [exporting, setExporting] = useState(false);
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
  /** Last pointer location inside the canvas, in world coordinates. */
  const lastPointerWorldRef = useRef<CanvasPoint | null>(null);
  /** Track wheel gesture target to avoid mid-gesture handoff. */
  const wheelGestureRef = useRef<{
    mode: "canvas" | "scroll" | null;
    ts: number;
  }>({ mode: null, ts: 0 });
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
  /** Board scope used for local cache. */
  const boardScope = useMemo(() => {
    if (!resolvedWorkspaceId || !boardId) return null;
    return { workspaceId: resolvedWorkspaceId, boardId };
  }, [boardId, resolvedWorkspaceId]);
  /** Board folder scope used for attachment resolution. */
  const boardFolderScope = useMemo(() => {
    if (!boardFolderUri) return null;
    const parsed = parseTenasFileUrl(boardFolderUri);
    if (parsed) {
      return {
        projectId: parsed.projectId,
        relativeFolderPath: parsed.relativePath,
        boardFolderUri,
      };
    }
    if (!projectId || !rootUri) return null;
    const relativeFolderPath = getRelativePathFromUri(rootUri, boardFolderUri);
    if (!relativeFolderPath) return null;
    return { projectId, relativeFolderPath, boardFolderUri };
  }, [boardFolderUri, projectId, rootUri]);
  /** Assets folder uri inside the board folder. */
  const assetsFolderUri = useMemo(() => {
    if (!boardFolderUri) return null;
    return buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);
  }, [boardFolderUri]);
  /** File scope used for persistence. */
  const fileScope = useMemo(() => {
    if (!boardFileUri) return null;
    return { uri: boardFileUri };
  }, [boardFileUri]);
  /** Log guard for missing scope. */
  const missingScopeLoggedRef = useRef(false);
  /** File snapshot query for the board. */
  const boardFileQuery = useQuery(
    trpc.fs.readFile.queryOptions(fileScope ?? skipToken)
  );
  /** File snapshot save mutation. */
  const saveBoardSnapshot = useMutation(
    trpc.fs.writeFile.mutationOptions()
  );
  /** Asset file write mutation. */
  const writeAssetMutation = useMutation(
    trpc.fs.writeBinary.mutationOptions()
  );
  /** Asset folder creation mutation. */
  const mkdirAssetMutation = useMutation(
    trpc.fs.mkdir.mutationOptions()
  );

  /** Read a local file as base64 for asset uploads. */
  const readFileAsBase64 = useCallback(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const base64 = result.split(",")[1] ?? "";
          resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }),
    []
  );

  /** Sanitize file names before writing to the assets folder. */
  const sanitizeAssetFileName = useCallback((value: string) => {
    const trimmed = value.trim();
    const rawName = trimmed || "image.png";
    // 中文注释：替换路径分隔符，防止文件名被当成目录。
    return rawName.replace(/[\\/]/g, "-") || "image.png";
  }, []);

  /** Resolve a unique asset file name under the board assets folder. */
  const resolveUniqueAssetName = useCallback(
    async (fileName: string) => {
      const safeName = sanitizeAssetFileName(fileName);
      if (!assetsFolderUri) return safeName;
      try {
        const result = await queryClient.fetchQuery(
          trpc.fs.list.queryOptions({ uri: assetsFolderUri })
        );
        const existing = new Set((result.entries ?? []).map((entry) => entry.name));
        return getUniqueName(safeName, existing);
      } catch {
        return safeName;
      }
    },
    [assetsFolderUri, queryClient, sanitizeAssetFileName]
  );

  /** Ensure the assets folder exists and return its uri. */
  const ensureAssetsFolder = useCallback(async () => {
    if (!assetsFolderUri) return null;
    await mkdirAssetMutation.mutateAsync({ uri: assetsFolderUri, recursive: true });
    return assetsFolderUri;
  }, [assetsFolderUri, mkdirAssetMutation]);

  /** Save an image asset to the board assets folder. */
  const saveBoardAssetFile = useCallback(
    async (file: File) => {
      if (!assetsFolderUri) return null;
      await ensureAssetsFolder();
      const uniqueName = await resolveUniqueAssetName(file.name || "image.png");
      const targetUri = buildChildUri(assetsFolderUri, uniqueName);
      const base64 = await readFileAsBase64(file);
      await writeAssetMutation.mutateAsync({ uri: targetUri, contentBase64: base64 });
      return uniqueName;
    },
    [
      assetsFolderUri,
      ensureAssetsFolder,
      readFileAsBase64,
      resolveUniqueAssetName,
      writeAssetMutation,
    ]
  );

  /** Resolve board-relative tenas-file urls into absolute paths. */
  const resolveBoardRelativeUri = useCallback(
    (uri: string) => {
      if (!boardFolderScope) return uri;
      if (!uri.startsWith(BOARD_RELATIVE_URI_PREFIX)) return uri;
      const relativePath = normalizeRelativePath(
        uri.slice(BOARD_RELATIVE_URI_PREFIX.length)
      );
      if (!relativePath || hasParentTraversal(relativePath)) return uri;
      if (!relativePath.startsWith(`${BOARD_ASSETS_DIR_NAME}/`)) return uri;
      const combined = `${boardFolderScope.relativeFolderPath}/${relativePath}`;
      return buildTenasFileUrl(boardFolderScope.projectId, combined);
    },
    [boardFolderScope]
  );

  /** Convert absolute tenas-file urls into board-relative paths. */
  const toBoardRelativeUri = useCallback(
    (uri: string) => {
      if (!boardFolderScope) return uri;
      const parsed = parseTenasFileUrl(uri);
      if (!parsed) return uri;
      if (parsed.projectId !== boardFolderScope.projectId) return uri;
      const basePath = `${boardFolderScope.relativeFolderPath}/`;
      if (!parsed.relativePath.startsWith(basePath)) return uri;
      const relativePath = normalizeRelativePath(
        parsed.relativePath.slice(basePath.length)
      );
      if (!relativePath || hasParentTraversal(relativePath)) return uri;
      if (!relativePath.startsWith(`${BOARD_ASSETS_DIR_NAME}/`)) return uri;
      return `${BOARD_RELATIVE_URI_PREFIX}${relativePath}`;
    },
    [boardFolderScope]
  );


  /** Build image payloads while persisting assets into the board folder. */
  const buildBoardImagePayloadFromFile = useCallback(
    async (file: File) => {
      const payload = await buildImageNodePayloadFromFile(file);
      if (!boardFolderScope || !assetsFolderUri) return payload;
      try {
        const assetName = await saveBoardAssetFile(file);
        if (!assetName) return payload;
        const relativePath = `${BOARD_ASSETS_DIR_NAME}/${assetName}`;
        const absolute = buildTenasFileUrl(
          boardFolderScope.projectId,
          `${boardFolderScope.relativeFolderPath}/${relativePath}`
        );
        return {
          ...payload,
          props: {
            ...payload.props,
            originalSrc: absolute,
          },
        };
      } catch {
        return payload;
      }
    },
    [assetsFolderUri, boardFolderScope, saveBoardAssetFile]
  );

  /** Upgrade image nodes with data URLs into asset files. */
  const upgradeImageNodeAssets = useCallback(
    async (nodes: CanvasNodeElement[]) => {
      if (!boardFolderScope || !assetsFolderUri) return false;
      let updated = false;
      let pending = false;
      for (const node of nodes) {
        if (node.type !== "image") continue;
        const props = node.props as Record<string, unknown>;
        const originalSrc = typeof props.originalSrc === "string" ? props.originalSrc : "";
        if (!originalSrc.startsWith("data:")) continue;
        if (imageAssetUpgradeIdsRef.current.has(node.id)) {
          pending = true;
          continue;
        }
        imageAssetUpgradeIdsRef.current.add(node.id);
        try {
          const rawName = typeof props.fileName === "string" ? props.fileName : "";
          const mimeType = typeof props.mimeType === "string" ? props.mimeType : "";
          const fallbackName = resolveFileName(originalSrc, mimeType || undefined);
          const fileName = rawName.trim() || fallbackName || "image.png";
          // 逻辑：将 data url 转成文件后写入 assets，替换为绝对路径。
          const blob = await dataUrlToBlob(originalSrc);
          const file = new File([blob], fileName, {
            type: blob.type || mimeType || "application/octet-stream",
          });
          const assetName = await saveBoardAssetFile(file);
          if (!assetName) continue;
          const relativePath = `${BOARD_ASSETS_DIR_NAME}/${assetName}`;
          const absolute = buildTenasFileUrl(
            boardFolderScope.projectId,
            `${boardFolderScope.relativeFolderPath}/${relativePath}`
          );
          engine.doc.updateNodeProps(node.id, { originalSrc: absolute });
          updated = true;
        } catch {
          // 逻辑：升级失败时保留 base64，避免阻塞保存流程。
        } finally {
          imageAssetUpgradeIdsRef.current.delete(node.id);
        }
      }
      return updated || pending;
    },
    [assetsFolderUri, boardFolderScope, engine, saveBoardAssetFile]
  );

  useEffect(() => {
    engine.setImagePayloadBuilder(buildBoardImagePayloadFromFile);
    return () => {
      engine.setImagePayloadBuilder(null);
    };
  }, [buildBoardImagePayloadFromFile, engine]);

  /** Normalize file-loaded snapshots for in-canvas rendering. */
  const normalizeSnapshotForCanvas = useCallback(
    (snapshotData: BoardSnapshotState) =>
      mapSnapshotImageSources(snapshotData, resolveBoardRelativeUri),
    [resolveBoardRelativeUri]
  );

  /** Normalize canvas snapshots before saving back to file. */
  const normalizeSnapshotForFile = useCallback(
    (snapshotData: BoardSnapshotState) => {
      const normalized = mapSnapshotImageSources(snapshotData, toBoardRelativeUri);
      // 逻辑：落盘时移除预览图，避免 .tnboard 体积膨胀。
      return stripSnapshotImagePreviews(normalized);
    },
    [toBoardRelativeUri]
  );

  /** Persist the latest file snapshot with asset upgrades applied. */
  const savePendingSnapshotToFile = useCallback(async () => {
    if (!fileScope) return;
    const pending = pendingFileSnapshotRef.current;
    if (!pending) return;
    const upgraded = await upgradeImageNodeAssets(pending.nodes);
    if (upgraded) {
      // 逻辑：升级图片会触发快照变更，等待下一轮保存。
      return;
    }
    const normalized = normalizeSnapshotForFile(pending);
    saveBoardSnapshot.mutate({
      uri: fileScope.uri,
      content: JSON.stringify(normalized, null, 2),
    });
  }, [fileScope, normalizeSnapshotForFile, saveBoardSnapshot, upgradeImageNodeAssets]);
  useEffect(() => {
    if (!containerRef.current) return;
    engine.attach(containerRef.current);
    return () => {
      engine.detach();
    };
  }, [engine]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!showUi) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      lastPointerWorldRef.current = engine.screenToWorld([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
    },
    [engine, showUi]
  );

  useEffect(() => {
    if (!showUi) return;
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      if (engine.isLocked()) return;
      const container = containerRef.current;
      if (!container) return;
      const activeElement = document.activeElement;
      if (!activeElement || !container.contains(activeElement)) return;
      const payload = getClipboardInsertPayload(event);
      if (!payload || payload.kind !== "image") return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const imagePayload = await engine.buildImagePayloadFromFile(payload.file);
        const [width, height] = imagePayload.size;
        const center =
          lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
        engine.addNodeElement("image", imagePayload.props, [
          center[0] - width / 2,
          center[1] - height / 2,
          width,
          height,
        ]);
      })();
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
    const target = containerRef.current;
    if (!target) return;
    const handleExportEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ exporting?: boolean }>).detail;
      if (typeof detail?.exporting !== "boolean") return;
      // 逻辑：导出时临时关闭网格渲染，避免截图包含网格。
      setExporting(detail.exporting);
    };
    target.addEventListener("tenas:board-export", handleExportEvent);
    return () => {
      target.removeEventListener("tenas:board-export", handleExportEvent);
    };
  }, []);

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
    () => ({
      openImagePreview,
      closeImagePreview,
    }),
    [closeImagePreview, openImagePreview]
  );

  /** Open image preview for an image node. */
  const openImagePreviewFromNode = useCallback(
    (element: CanvasNodeElement) => {
      if (element.type !== "image") return;
      const props = element.props as ImageNodeProps;
      const originalSrc = props.originalSrc || "";
      const previewSrc = props.previewSrc || "";
      const isRelativeTenas = originalSrc.startsWith("tenas-file://./");
      const canUseOriginal =
        !isRelativeTenas &&
        (originalSrc.startsWith("tenas-file://") ||
          originalSrc.startsWith("data:") ||
          originalSrc.startsWith("blob:") ||
          originalSrc.startsWith("file://"));
      const resolvedOriginal = canUseOriginal ? originalSrc : "";
      if (!resolvedOriginal && !previewSrc) return;
      openImagePreview({
        originalSrc: resolvedOriginal,
        previewSrc,
        fileName: props.fileName || "Image",
        mimeType: props.mimeType,
      });
    },
    [openImagePreview]
  );

  /** Handle node double click actions. */
  const handleNodeDoubleClick = useCallback(
    (element: CanvasNodeElement) => {
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
    },
    [engine, openImagePreviewFromNode]
  );
  /** Apply a snapshot into the engine state. */
  const applySnapshot = useCallback(
    (snapshotData: BoardSnapshotState) => {
      const normalized = normalizeSnapshotForCanvas(snapshotData);
      const nodes = Array.isArray(normalized.nodes) ? normalized.nodes : [];
      const connectors = Array.isArray(normalized.connectors)
        ? normalized.connectors
        : [];
      const elements = mergeElements(nodes, connectors);
      hydratedRef.current = false;
      // 逻辑：恢复快照时先写入文档，再同步视口。
      engine.doc.setElements(elements);
      if (normalized.viewport) {
        engine.viewport.setViewport(
          normalized.viewport.zoom,
          normalized.viewport.offset
        );
      }
      engine.commitHistory();
      lastSavedElementsRef.current = JSON.stringify(elements);
      if (normalized.viewport) {
        lastSavedViewportRef.current = JSON.stringify({
          zoom: normalized.viewport.zoom,
          offset: normalized.viewport.offset,
        });
      }
      currentVersionRef.current = normalized.version ?? 0;
      hydratedRef.current = true;
    },
    [engine, normalizeSnapshotForCanvas]
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
        boardId: boardScope.boardId,
        schemaVersion: BOARD_SCHEMA_VERSION,
        nodes: payload.nodes,
        connectors: payload.connectors,
        viewport: payload.viewport,
        version: nextVersion,
      };
      currentVersionRef.current = nextVersion;
      setLocalSnapshot(localSnapshotPayload);
      void writeBoardSnapshotCache(localSnapshotPayload);

      if (fileScope) {
        // 逻辑：合并短时间内的文件保存，避免频繁写文件。
        pendingFileSnapshotRef.current = normalizeSnapshotForFile({
          schemaVersion: BOARD_SCHEMA_VERSION,
          nodes: payload.nodes,
          connectors: payload.connectors,
          viewport: payload.viewport,
          version: nextVersion,
        });
        if (remoteSaveTimeoutRef.current) {
          window.clearTimeout(remoteSaveTimeoutRef.current);
        }
        remoteSaveTimeoutRef.current = window.setTimeout(() => {
          void savePendingSnapshotToFile();
        }, VIEWPORT_SAVE_DELAY);
      }
    },
    [boardScope, fileScope, normalizeSnapshotForFile, savePendingSnapshotToFile]
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
      // 逻辑：workspaceId/boardId 缺失时记录一次，避免误判无保存请求。
      console.warn("[board] save skipped: missing workspaceId/boardId", {
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
        boardScope.boardId
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
    if (!fileScope) return;
    if (!boardFileQuery.isFetched) return;
    if (!localLoaded) return;

    const remote = parseBoardSnapshot(boardFileQuery.data?.content);
    const resolvedRemote = remote ? normalizeSnapshotForCanvas(remote) : null;
    const local = localSnapshot;

    if (!local && !resolvedRemote) {
      if (initialElementsRef.current) return;
      if (!initialElements || initialElements.length === 0) return;
      // 逻辑：无本地/远端快照时写入初始元素。
      engine.setInitialElements(initialElements);
      initialElementsRef.current = true;
      hydratedRef.current = true;
      return;
    }

    if (!local && resolvedRemote) {
      applySnapshot(resolvedRemote);
      const snapshot: BoardSnapshotCacheRecord = {
        workspaceId: boardScope.workspaceId,
        boardId: boardScope.boardId,
        schemaVersion: resolvedRemote.schemaVersion ?? BOARD_SCHEMA_VERSION,
        nodes: resolvedRemote.nodes,
        connectors: resolvedRemote.connectors,
        viewport: resolvedRemote.viewport,
        version: resolvedRemote.version ?? 0,
      };
      setLocalSnapshot(snapshot);
      void writeBoardSnapshotCache(snapshot);
      return;
    }

    if (local && !resolvedRemote) {
      if (local.nodes.length === 0 && local.connectors.length === 0) return;
      // 逻辑：仅保留本地快照，不再回写远端。
      return;
    }

    if (!local || !resolvedRemote) return;
    if (resolvedRemote.version > local.version) {
      applySnapshot(resolvedRemote);
      const snapshot: BoardSnapshotCacheRecord = {
        workspaceId: boardScope.workspaceId,
        boardId: boardScope.boardId,
        schemaVersion: resolvedRemote.schemaVersion ?? BOARD_SCHEMA_VERSION,
        nodes: resolvedRemote.nodes,
        connectors: resolvedRemote.connectors,
        viewport: resolvedRemote.viewport,
        version: resolvedRemote.version ?? 0,
      };
      setLocalSnapshot(snapshot);
      void writeBoardSnapshotCache(snapshot);
      return;
    }
    if (local.version > resolvedRemote.version) {
      // 逻辑：本地版本更高时保持本地数据，不触发远端更新。
      return;
    }
  }, [
    applySnapshot,
    boardScope,
    boardFileQuery.data,
    boardFileQuery.isFetched,
    fileScope,
    engine,
    initialElements,
    localLoaded,
    localSnapshot,
    normalizeSnapshotForCanvas,
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

  useEffect(() => {
    return () => {
      if (remoteSaveTimeoutRef.current) {
        window.clearTimeout(remoteSaveTimeoutRef.current);
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
  // 逻辑：预览优先使用原图地址，缺失时回退到压缩预览。
  const imagePreviewUri =
    imagePreview?.originalSrc || imagePreview?.previewSrc || "";

  useEffect(() => {
    if (!connectorDrop) return;
    const handlePointerDown = (event: PointerEvent) => {
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
  }, [connectorDrop, engine]);

  useEffect(() => {
    if (!inspectorNodeId) return;
    // 逻辑：节点被删除或取消选择时收起详情面板。
    if (!snapshot.selectedIds.includes(inspectorNodeId) || !inspectorElement) {
      setInspectorNodeId(null);
    }
  }, [inspectorElement, inspectorNodeId, snapshot.selectedIds]);

  /** Connector templates available for the current drop source. */
  const availableTemplates = useMemo(() => {
    if (!connectorDrop) return [];
    const sourceElementId =
      "elementId" in connectorDrop.source ? connectorDrop.source.elementId : "";
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (!source || source.kind !== "node") return [];
    // 逻辑：可用节点由源节点定义提供，避免全局模板硬编码。
    const definition = engine.nodes.getDefinition(source.type);
    if (!definition?.connectorTemplates) return [];
    return definition.connectorTemplates(source as CanvasNodeElement);
  }, [connectorDrop, engine]);

  /** Create a node and connector from a connector picker selection. */
  const handleTemplateSelect = (templateId: string) => {
    if (!connectorDrop) return;
    const template = availableTemplates.find((item) => item.id === templateId);
    if (!template) return;

    const sourceElementId =
      "elementId" in connectorDrop.source ? connectorDrop.source.elementId : "";
    const { type, props } = template.createNode({ sourceElementId });
    const [width, height] = template.size;
    const xywh: [number, number, number, number] = [
      connectorDrop.point[0] - width / 2,
      connectorDrop.point[1] - height / 2,
      width,
      height,
    ];
    const id = engine.addNodeElement(type, props, xywh);
    if (id) {
      engine.addConnectorElement({
        source: connectorDrop.source,
        target: { elementId: id },
        style: engine.getConnectorStyle(),
      });
    }
    engine.setConnectorDrop(null);
    engine.setConnectorDraft(null);
    engine.setConnectorHover(null);
  };

  /** Open the node inspector. */
  const openInspector = (elementId: string) => {
    setInspectorNodeId(elementId);
  };

  /** Allow dropping external files onto the canvas. */
  const handleCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isImageDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  /** Handle dropping images onto the canvas surface. */
  const handleCanvasDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!isImageDragEvent(event)) return;
      event.preventDefault();
      if (engine.isLocked()) return;

      const { clientX, clientY, dataTransfer } = event;
      const imagePayload = readImageDragPayload(dataTransfer);
      const droppedFiles = Array.from(dataTransfer.files);
      const imageFiles = imagePayload
        ? []
        : // 逻辑：只挑出图片类型，避免其他文件触发节点创建。
          droppedFiles.filter(isImageFile);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // 逻辑：将拖拽点转换为画布坐标，作为插入基准。
      const dropPoint = engine.screenToWorld([
        clientX - rect.left,
        clientY - rect.top,
      ]);

      if (imagePayload) {
        try {
          const blob = await fetchBlobFromUri(imagePayload.baseUri);
          const fileName = imagePayload.fileName || resolveFileName(imagePayload.baseUri);
          const file = new File([blob], fileName, {
            type: blob.type || "application/octet-stream",
          });
          if (!isImageFile(file)) return;
          const payload = await engine.buildImagePayloadFromFile(file);
          const [width, height] = payload.size;
          engine.addNodeElement("image", payload.props, [
            dropPoint[0] - width / 2,
            dropPoint[1] - height / 2,
            width,
            height,
          ]);
          return;
        } catch {
          return;
        }
      }
      if (imageFiles.length === 0) return;

      for (const [index, file] of imageFiles.entries()) {
        const payload = await engine.buildImagePayloadFromFile(file);
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
    <BoardProvider
      engine={engine}
      actions={boardActions}
      fileContext={{ projectId, rootUri, boardId, boardFolderUri }}
    >
      <div
        ref={containerRef}
        data-board-canvas
        data-board-panel={panelKey}
        className={cn(
          "relative h-full w-full overflow-hidden outline-none",
          cursor === "crosshair" && "cursor-crosshair",
          cursor === "grabbing" && "cursor-grabbing",
          cursor === "grab" && "cursor-grab",
          cursor === "default" && "cursor-default",
          className
        )}
        tabIndex={showUi ? 0 : -1}
        aria-hidden={showUi ? undefined : true}
        onPointerMove={handlePointerMove}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        onPointerDown={event => {
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
              ? engine.screenToWorld([
                  event.clientX - rect.left,
                  event.clientY - rect.top,
                ])
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
              hitElement?.kind === "node" &&
              hitElement.id === snapshot.editingNodeId;
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
        onDoubleClick={event => {
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
            [
              worldPoint[0] - width / 2,
              worldPoint[1] - height / 2,
              width,
              height,
            ]
          );
          if (newNodeId) {
            engine.setEditingNodeId(newNodeId);
          }
        }}
      >
        <div
          className="absolute left-0 top-0 z-20 h-24 w-24"
          onPointerEnter={() => {
            if (!showUi) return;
            if (miniMapTimeoutRef.current) {
              window.clearTimeout(miniMapTimeoutRef.current);
              miniMapTimeoutRef.current = null;
            }
            setHoverMiniMap(true);
            setShowMiniMap(true);
          }}
          onPointerLeave={() => {
            if (!showUi) return;
            setHoverMiniMap(false);
            if (!snapshot.panning) {
              setShowMiniMap(false);
            }
          }}
        />
        <CanvasSurface
          snapshot={snapshot}
          hideGrid={exporting}
          onStats={showPerfOverlay ? setGpuStats : undefined}
        />
        {showUi ? (
          <CanvasDomLayer
            engine={engine}
            snapshot={snapshot}
            onCullingStatsChange={showPerfOverlay ? setCullingStats : undefined}
          />
        ) : null}
        {showPerfOverlay ? (
          <BoardPerfOverlay
            stats={cullingStats}
            zoom={snapshot.viewport.zoom}
            gpuStats={gpuStats}
          />
        ) : null}
        {showUi ? <AnchorOverlay snapshot={snapshot} /> : null}
        {showUi ? <MiniMap snapshot={snapshot} visible={shouldShowMiniMap} /> : null}
        {showUi ? <BoardControls engine={engine} snapshot={snapshot} /> : null}
        {showUi ? <BoardToolbar engine={engine} snapshot={snapshot} /> : null}
        {showUi && selectedConnector ? (
          <ConnectorActionPanel
            snapshot={snapshot}
            connector={selectedConnector}
            onStyleChange={style => engine.setConnectorStyle(style)}
            onDelete={() => engine.deleteSelection()}
          />
        ) : null}
        {showUi ? <MultiSelectionOutline snapshot={snapshot} engine={engine} /> : null}
        {showUi && selectedNode ? (
          <SingleSelectionResizeHandle
            snapshot={snapshot}
            engine={engine}
            element={selectedNode}
          />
        ) : null}
        {showUi && selectedNode ? (
          <SingleSelectionToolbar
            snapshot={snapshot}
            engine={engine}
            element={selectedNode}
            onInspect={openInspector}
          />
        ) : null}
        {showUi ? (
          <MultiSelectionToolbar
            snapshot={snapshot}
            engine={engine}
            onInspect={openInspector}
          />
        ) : null}
        {showUi && inspectorElement ? (
          <NodeInspectorPanel
            snapshot={snapshot}
            element={inspectorElement}
            onClose={() => setInspectorNodeId(null)}
          />
        ) : null}
        {showUi && connectorDrop && connectorDropScreen ? (
          <NodePicker
            ref={nodePickerRef}
            position={connectorDropScreen}
            templates={availableTemplates}
            onSelect={handleTemplateSelect}
          />
        ) : null}
      </div>
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
