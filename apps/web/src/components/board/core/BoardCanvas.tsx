"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import * as Y from "yjs";
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
import { FILE_DRAG_URI_MIME, FILE_DRAG_URIS_MIME } from "@/components/ui/tenas/drag-drop-types";
import ImagePreviewDialog from "@/components/file/ImagePreviewDialog";
import { fetchBlobFromUri, resolveFileName } from "@/lib/image/uri";
import {
  buildChildUri,
  getUniqueName,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_ASSETS_DIR_NAME, BOARD_LOG_FILE_NAME } from "@/lib/file-name";
import type {
  CanvasElement,
  CanvasConnectorTemplateDefinition,
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
  applyBoardDocUpdate,
  createBoardDoc,
  decodeBase64,
  decodeBoardLogEntries,
  encodeBase64,
  encodeBoardDocUpdate,
  encodeBoardLogEntry,
  readBoardDocPayload,
  type BoardDocPayload,
  writeBoardDocPayload,
} from "./boardYjsStore";
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveBoardRelativeUri,
  toBoardRelativePath,
} from "./boardFilePath";
import { useBoardSnapshot } from "./useBoardSnapshot";
import { useBoardViewState } from "./useBoardViewState";
import { useBasicConfig } from "@/hooks/use-basic-config";
const BOARD_SAVE_DELAY = 800;
/** Max bytes allowed in the incremental log before compaction. */
const BOARD_LOG_MAX_BYTES = 512 * 1024;
/** Max update entries allowed in the incremental log before compaction. */
const BOARD_LOG_MAX_UPDATES = 40;
/** Default size for double-click created text nodes. */
const TEXT_NODE_DEFAULT_SIZE: [number, number] = [280, 140];
/** Offset applied when stacking multiple dropped images. */
const IMAGE_DROP_STACK_OFFSET = 24;
const EDITABLE_NODE_TYPES = new Set([
  "text",
  IMAGE_GENERATE_NODE_TYPE,
  IMAGE_PROMPT_GENERATE_NODE_TYPE,
]);

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
  /** Last saved document revision for change detection. */
  const lastSavedRevisionRef = useRef<number | null>(null);
  /** Pending save marker during drag interactions. */
  const pendingSaveRef = useRef(false);
  /** Timeout id for debounced file save. */
  const remoteSaveTimeoutRef = useRef<number | null>(null);
  /** Yjs document used for persistence. */
  const boardDocRef = useRef<Y.Doc | null>(null);
  /** State vector used for incremental updates. */
  const boardStateVectorRef = useRef<Uint8Array | null>(null);
  /** Accumulated log size in bytes. */
  const logSizeRef = useRef(0);
  /** Accumulated log update count. */
  const logUpdateCountRef = useRef(0);
  /** Serial queue for persistence writes. */
  const saveQueueRef = useRef(Promise.resolve());
  /** Image node ids currently upgrading to asset files. */
  const imageAssetUpgradeIdsRef = useRef<Set<string>>(new Set());
  /** Whether grid rendering is suppressed for export. */
  const [exporting, setExporting] = useState(false);
  /** Current cursor state applied to the canvas container. */
  const cursorRef = useRef<"crosshair" | "grabbing" | "grab" | "default">("default");
  /** Image preview payload for the fullscreen viewer. */
  const [imagePreview, setImagePreview] = useState<ImagePreviewPayload | null>(null);
  /** Last pointer location inside the canvas, in world coordinates. */
  const lastPointerWorldRef = useRef<CanvasPoint | null>(null);
  /** Track wheel gesture target to avoid mid-gesture handoff. */
  const wheelGestureRef = useRef<{
    mode: "canvas" | "scroll" | null;
    ts: number;
  }>({ mode: null, ts: 0 });
  /** Latest snapshot ref for save callbacks. */
  const latestSnapshotRef = useRef(snapshot);
  /** Board folder scope used for attachment resolution. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope({ projectId, rootUri, boardFolderUri }),
    [boardFolderUri, projectId, rootUri]
  );
  /** Assets folder uri inside the board folder. */
  const assetsFolderUri = useMemo(() => {
    if (!boardFolderUri) return null;
    return buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME);
  }, [boardFolderUri]);
  /** Log file uri stored inside the board folder. */
  const boardLogUri = useMemo(() => {
    if (boardFolderUri) {
      return buildChildUri(boardFolderUri, BOARD_LOG_FILE_NAME);
    }
    if (boardFileUri) return `${boardFileUri}.log`;
    return null;
  }, [boardFileUri, boardFolderUri]);
  /** File scope used for persistence. */
  const boardFileScope = useMemo(() => {
    if (!boardFileUri) return null;
    return { uri: boardFileUri };
  }, [boardFileUri]);
  /** Log file scope used for persistence. */
  const boardLogScope = useMemo(() => {
    if (!boardLogUri) return null;
    return { uri: boardLogUri };
  }, [boardLogUri]);
  /** Log guard for missing scope. */
  const missingScopeLoggedRef = useRef(false);
  /** File snapshot query for the board. */
  const boardFileQuery = useQuery(
    trpc.fs.readBinary.queryOptions(boardFileScope ?? skipToken)
  );
  /** Log file query for the board. */
  const boardLogQuery = useQuery(
    trpc.fs.readBinary.queryOptions(boardLogScope ?? skipToken)
  );
  /** File snapshot save mutation. */
  const writeBoardSnapshot = useMutation(
    trpc.fs.writeBinary.mutationOptions()
  );
  /** Log append mutation. */
  const appendBoardLog = useMutation(
    trpc.fs.appendBinary.mutationOptions()
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

  /** Build image payloads while persisting assets into the board folder. */
  const buildBoardImagePayloadFromFile = useCallback(
    async (file: File) => {
      const payload = await buildImageNodePayloadFromFile(file);
      if (!assetsFolderUri) return payload;
      try {
        const assetName = await saveBoardAssetFile(file);
        if (!assetName) return payload;
        const relativePath = `${BOARD_ASSETS_DIR_NAME}/${assetName}`;
        return {
          ...payload,
          props: {
            ...payload.props,
            originalSrc: relativePath,
          },
        };
      } catch {
        return payload;
      }
    },
    [assetsFolderUri, saveBoardAssetFile]
  );

  /** Upgrade image nodes with data URLs into asset files. */
  const upgradeImageNodeAssets = useCallback(
    async (nodes: CanvasNodeElement[]) => {
      if (!assetsFolderUri) return false;
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
          engine.doc.updateNodeProps(node.id, { originalSrc: relativePath });
          updated = true;
        } catch {
          // 逻辑：升级失败时阻止落盘，避免保存 base64 到画布文件。
          pending = true;
        } finally {
          imageAssetUpgradeIdsRef.current.delete(node.id);
        }
      }
      return updated || pending;
    },
    [assetsFolderUri, engine, saveBoardAssetFile]
  );

  useEffect(() => {
    engine.setImagePayloadBuilder(buildBoardImagePayloadFromFile);
    return () => {
      engine.setImagePayloadBuilder(null);
    };
  }, [buildBoardImagePayloadFromFile, engine]);

  /** Normalize image sources before saving back to disk. */
  const normalizeNodesForSave = useCallback(
    (nodes: CanvasNodeElement[]) => {
      let changed = false;
      const nextNodes = nodes.map((node) => {
        if (node.type !== "image") return node;
        const props = node.props as Record<string, unknown>;
        const originalSrc = typeof props.originalSrc === "string" ? props.originalSrc : "";
        const previewSrc = typeof props.previewSrc === "string" ? props.previewSrc : "";
        const nextOriginal = toBoardRelativePath(
          originalSrc,
          boardFolderScope,
          boardFolderUri
        );
        let nextPreview = previewSrc;
        if (previewSrc.startsWith("data:") || previewSrc.startsWith("blob:")) {
          // 逻辑：预览数据不落盘，避免文件中出现 base64 或临时 blob。
          nextPreview = "";
        } else if (previewSrc) {
          nextPreview = toBoardRelativePath(
            previewSrc,
            boardFolderScope,
            boardFolderUri
          );
        }
        if (nextOriginal === originalSrc && nextPreview === previewSrc) {
          return node;
        }
        changed = true;
        let nextProps = props;
        if (nextOriginal !== originalSrc) {
          nextProps = { ...nextProps, originalSrc: nextOriginal };
        }
        if (nextPreview !== previewSrc) {
          nextProps = { ...nextProps, previewSrc: nextPreview };
        }
        return {
          ...node,
          props: nextProps,
        };
      });
      return changed ? nextNodes : nodes;
    },
    [boardFolderScope, boardFolderUri]
  );

  /** Enqueue a persistence task to keep file writes in order. */
  const enqueueSave = useCallback((task: () => Promise<void>) => {
    saveQueueRef.current = saveQueueRef.current.then(task).catch(() => undefined);
  }, []);

  /** Persist the latest doc snapshot into base file and log. */
  const persistBoardDoc = useCallback(() => {
    enqueueSave(async () => {
      if (!boardFileScope || !boardLogScope) return;
      const doc = boardDocRef.current;
      if (!doc) return;
      const latest = latestSnapshotRef.current;
      const { nodes, connectors } = splitElements(latest.elements);
      const upgraded = await upgradeImageNodeAssets(nodes);
      if (upgraded) {
        // 逻辑：升级图片会触发快照变更，等待下一轮保存。
        return;
      }
      const normalizedNodes = normalizeNodesForSave(nodes);
      writeBoardDocPayload(doc, { nodes: normalizedNodes, connectors });
      const stateVector = boardStateVectorRef.current ?? new Uint8Array(0);
      const update = Y.encodeStateAsUpdate(doc, stateVector);
      if (update.length === 0) return;
      const logEntry = encodeBoardLogEntry(update);
      const logEntryBase64 = encodeBase64(logEntry);
      const fullUpdate = encodeBoardDocUpdate(doc);
      const fullBase64 = encodeBase64(fullUpdate);
      let logAppended = false;
      try {
        await appendBoardLog.mutateAsync({
          uri: boardLogScope.uri,
          contentBase64: logEntryBase64,
        });
        logAppended = true;
      } catch {
        // 逻辑：日志追加失败时仍尝试落盘基础文件。
      }
      let baseWritten = false;
      try {
        await writeBoardSnapshot.mutateAsync({
          uri: boardFileScope.uri,
          contentBase64: fullBase64,
        });
        baseWritten = true;
      } catch {
        // 逻辑：基础文件失败时保留日志，确保仍可恢复。
      }
      if (!logAppended && !baseWritten) return;
      boardStateVectorRef.current = Y.encodeStateVector(doc);
      if (!logAppended) return;
      logSizeRef.current += logEntry.length;
      logUpdateCountRef.current += 1;
      if (
        logSizeRef.current >= BOARD_LOG_MAX_BYTES ||
        logUpdateCountRef.current >= BOARD_LOG_MAX_UPDATES
      ) {
        // 逻辑：日志过大时直接清空，避免重放成本过高。
        try {
          await writeBoardSnapshot.mutateAsync({
            uri: boardLogScope.uri,
            contentBase64: "",
          });
          logSizeRef.current = 0;
          logUpdateCountRef.current = 0;
        } catch {
          // 逻辑：清理失败时保留统计，避免误判。
        }
      }
    });
  }, [
    appendBoardLog,
    boardFileScope,
    boardLogScope,
    encodeBoardDocUpdate,
    enqueueSave,
    normalizeNodesForSave,
    upgradeImageNodeAssets,
    writeBoardSnapshot,
  ]);
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
      void (async () => {
        const center =
          lastPointerWorldRef.current ?? engine.getViewportCenterWorld();
        for (const [index, payload] of imagePayloads.entries()) {
          const imagePayload = await engine.buildImagePayloadFromFile(payload.file);
          const [width, height] = imagePayload.size;
          const offset = IMAGE_DROP_STACK_OFFSET * index;
          // 逻辑：多张图片按偏移堆叠，避免重叠在同一点。
          engine.addNodeElement("image", imagePayload.props, [
            center[0] - width / 2 + offset,
            center[1] - height / 2 + offset,
            width,
            height,
          ]);
        }
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
      const resolvedOriginal = resolveBoardRelativeUri(originalSrc, boardFolderUri);
      const previewSrc = props.previewSrc || "";
      const isRelative = isBoardRelativePath(resolvedOriginal);
      const canUseOriginal =
        !isRelative &&
        (resolvedOriginal.startsWith("data:") ||
          resolvedOriginal.startsWith("blob:") ||
          resolvedOriginal.startsWith("file://"));
      const finalOriginal = canUseOriginal ? resolvedOriginal : "";
      if (!finalOriginal && !previewSrc) return;
      openImagePreview({
        originalSrc: finalOriginal,
        previewSrc,
        fileName: props.fileName || "Image",
        mimeType: props.mimeType,
      });
    },
    [boardFolderUri, openImagePreview]
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
  /** Apply a board payload into the engine state. */
  const applyBoardPayload = useCallback(
    (payload: BoardDocPayload) => {
      const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      const connectors = Array.isArray(payload.connectors)
        ? payload.connectors
        : [];
      const elements = mergeElements(nodes, connectors);
      hydratedRef.current = false;
      // 逻辑：恢复快照后重置历史，再执行视口自适应。
      engine.doc.setElements(elements);
      lastSavedRevisionRef.current = engine.doc.getRevision();
      engine.resetHistory({ emit: false });
      hydratedRef.current = true;
      window.requestAnimationFrame(() => {
        engine.fitToElements();
      });
    },
    [engine, projectId]
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
    if ((!boardFileScope || !boardLogScope) && !missingScopeLoggedRef.current) {
      // 逻辑：文件路径缺失时记录一次，避免误判无保存请求。
      console.warn("[board] save skipped: missing board file scope", {
        boardFileUri,
        boardLogUri,
      });
      missingScopeLoggedRef.current = true;
    }
    if (!boardFileScope || !boardLogScope) return;
    missingScopeLoggedRef.current = false;
    hydratedRef.current = false;
    lastSavedRevisionRef.current = null;
    boardDocRef.current = null;
    boardStateVectorRef.current = null;
    logSizeRef.current = 0;
    logUpdateCountRef.current = 0;
    pendingSaveRef.current = false;
    if (remoteSaveTimeoutRef.current) {
      window.clearTimeout(remoteSaveTimeoutRef.current);
      remoteSaveTimeoutRef.current = null;
    }
    if (!boardFileQuery.isFetched || !boardLogQuery.isFetched) return;

    const doc = createBoardDoc();
    const baseBytes = decodeBase64(boardFileQuery.data?.contentBase64 ?? "");
    if (baseBytes.length > 0) {
      try {
        applyBoardDocUpdate(doc, baseBytes);
      } catch {
        // 逻辑：解析失败时回退为空文档，避免阻塞加载。
      }
    }
    const logBytes = decodeBase64(boardLogQuery.data?.contentBase64 ?? "");
    const logUpdates = decodeBoardLogEntries(logBytes);
    for (const update of logUpdates) {
      try {
        applyBoardDocUpdate(doc, update);
      } catch {
        // 逻辑：单条日志异常时跳过，保证后续内容可继续加载。
      }
    }
    boardDocRef.current = doc;
    boardStateVectorRef.current = Y.encodeStateVector(doc);
    logSizeRef.current = logBytes.length;
    logUpdateCountRef.current = logUpdates.length;

    const payload = readBoardDocPayload(doc);
    const hasContent = payload.nodes.length > 0 || payload.connectors.length > 0;
    if (!hasContent && initialElements && initialElements.length > 0) {
      if (!initialElementsRef.current) {
        // 逻辑：无数据时注入初始元素，并等待保存落盘。
        engine.setInitialElements(initialElements);
        initialElementsRef.current = true;
        hydratedRef.current = true;
        pendingSaveRef.current = true;
        window.requestAnimationFrame(() => {
          engine.fitToElements();
        });
      }
      return;
    }
    applyBoardPayload(payload);
  }, [
    applyBoardDocUpdate,
    applyBoardPayload,
    boardFileQuery.data,
    boardFileQuery.isFetched,
    boardFileScope,
    boardFileUri,
    boardLogQuery.data,
    boardLogQuery.isFetched,
    boardLogScope,
    boardLogUri,
    decodeBase64,
    decodeBoardLogEntries,
    engine,
    initialElements,
  ]);

  useEffect(() => {
    if (!boardFileScope || !boardLogScope) return;
    if (!hydratedRef.current) return;
    if (snapshot.draggingId) {
      // 逻辑：拖拽过程中先标记，等放开后再保存。
      pendingSaveRef.current = true;
      return;
    }
    const docRevision = snapshot.docRevision;
    const hasRevisionChange = lastSavedRevisionRef.current !== docRevision;
    if (!hasRevisionChange && !pendingSaveRef.current) return;
    lastSavedRevisionRef.current = docRevision;
    pendingSaveRef.current = false;
    if (remoteSaveTimeoutRef.current) {
      window.clearTimeout(remoteSaveTimeoutRef.current);
    }
    remoteSaveTimeoutRef.current = window.setTimeout(() => {
      persistBoardDoc();
    }, BOARD_SAVE_DELAY);
  }, [
    boardFileScope,
    boardLogScope,
    persistBoardDoc,
    snapshot.docRevision,
    snapshot.draggingId,
  ]);

  useEffect(() => {
    return () => {
      if (remoteSaveTimeoutRef.current) {
        window.clearTimeout(remoteSaveTimeoutRef.current);
      }
    };
  }, []);

  /** Resolve the cursor style for the current tool and view. */
  const resolveCursor = useCallback(() => {
    const viewState = engine.getViewState();
    if (snapshot.pendingInsert) return "crosshair";
    if (snapshot.activeToolId === "hand") {
      return viewState.panning ? "grabbing" : "grab";
    }
    if (snapshot.draggingId) return "grabbing";
    return "default";
  }, [engine, snapshot.activeToolId, snapshot.draggingId, snapshot.pendingInsert]);

  /** Apply the cursor style to the canvas container. */
  const applyCursor = useCallback(() => {
    const nextCursor = resolveCursor();
    if (cursorRef.current === nextCursor) return;
    cursorRef.current = nextCursor;
    const container = containerRef.current;
    if (!container) return;
    // 逻辑：直接更新 DOM 光标，避免视图变化触发全量渲染。
    container.style.cursor = nextCursor;
  }, [resolveCursor]);

  useEffect(() => {
    applyCursor();
  }, [applyCursor]);

  useEffect(() => {
    const unsubscribe = engine.subscribeView(() => {
      applyCursor();
    });
    return () => {
      unsubscribe();
    };
  }, [engine, applyCursor]);

  const connectorDrop = snapshot.connectorDrop;
  const selectedConnector = getSingleSelectedElement(snapshot, "connector");
  const selectedNode = getSingleSelectedElement(snapshot, "node");
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
          // 逻辑：优先读取多选拖拽的 uri 列表，兼容文件管理器批量拖入。
          const dragUris = (() => {
            const payload = dataTransfer.getData(FILE_DRAG_URIS_MIME);
            if (!payload) return [];
            try {
              const parsed = JSON.parse(payload);
              if (Array.isArray(parsed)) {
                return parsed.filter(
                  (item): item is string =>
                    typeof item === "string" && item.length > 0
                );
              }
            } catch {
              return [];
            }
            return [];
          })();
          const uniqueUris =
            dragUris.length > 0
              ? Array.from(new Set(dragUris))
              : [imagePayload.baseUri];
          for (const [index, uri] of uniqueUris.entries()) {
            const blob = await fetchBlobFromUri(uri, { projectId });
            const fileName = resolveFileName(uri);
            const file = new File([blob], fileName, {
              type: blob.type || "application/octet-stream",
            });
            if (!isImageFile(file)) continue;
            const payload = await engine.buildImagePayloadFromFile(file);
            const [width, height] = payload.size;
            const offset = IMAGE_DROP_STACK_OFFSET * index;
            // 逻辑：内部拖拽多图时偏移排列，确保全部可见。
            engine.addNodeElement("image", payload.props, [
              dropPoint[0] - width / 2 + offset,
              dropPoint[1] - height / 2 + offset,
              width,
              height,
            ]);
          }
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
        {showUi ? <MiniMapLayer engine={engine} snapshot={snapshot} /> : null}
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
          <BoardPerfOverlay stats={cullingStats} gpuStats={gpuStats} />
        ) : null}
        {showUi ? <AnchorOverlay snapshot={snapshot} /> : null}
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
            element={inspectorElement}
            onClose={() => setInspectorNodeId(null)}
          />
        ) : null}
        {showUi ? (
          <ConnectorDropPanel
            engine={engine}
            snapshot={snapshot}
            templates={availableTemplates}
            onSelect={handleTemplateSelect}
            panelRef={nodePickerRef}
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

type MiniMapLayerProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot for minimap contents. */
  snapshot: CanvasSnapshot;
};

/** Render the minimap hover zone and overlay. */
function MiniMapLayer({ engine, snapshot }: MiniMapLayerProps) {
  /** Latest view state for minimap visibility rules. */
  const viewState = useBoardViewState(engine);
  /** Whether the minimap should stay visible. */
  const [showMiniMap, setShowMiniMap] = useState(false);
  /** Whether the minimap hover zone is active. */
  const [hoverMiniMap, setHoverMiniMap] = useState(false);
  /** Timeout id for hiding the minimap. */
  const miniMapTimeoutRef = useRef<number | null>(null);
  /** Last viewport snapshot for change detection. */
  const lastViewportRef = useRef(viewState.viewport);
  /** Last panning state for change detection. */
  const lastPanningRef = useRef(viewState.panning);

  useEffect(() => {
    const lastViewport = lastViewportRef.current;
    const viewportChanged =
      lastViewport.zoom !== viewState.viewport.zoom ||
      lastViewport.offset[0] !== viewState.viewport.offset[0] ||
      lastViewport.offset[1] !== viewState.viewport.offset[1] ||
      lastViewport.size[0] !== viewState.viewport.size[0] ||
      lastViewport.size[1] !== viewState.viewport.size[1];
    const wasPanning = lastPanningRef.current;

    lastViewportRef.current = viewState.viewport;
    lastPanningRef.current = viewState.panning;

    // 逻辑：视口变化或拖拽时保持小地图可见。
    if (viewState.panning || viewportChanged) {
      setShowMiniMap(true);
    }

    if (viewState.panning) {
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
      // 逻辑：视图停止后延迟隐藏小地图，避免闪烁。
      miniMapTimeoutRef.current = window.setTimeout(() => {
        setShowMiniMap(false);
      }, MINIMAP_HIDE_DELAY);
    }
  }, [viewState]);

  useEffect(() => {
    return () => {
      if (miniMapTimeoutRef.current) {
        window.clearTimeout(miniMapTimeoutRef.current);
      }
    };
  }, []);

  const shouldShowMiniMap = showMiniMap || hoverMiniMap;

  return (
    <>
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
          if (!viewState.panning) {
            setShowMiniMap(false);
          }
        }}
      />
      <MiniMap
        snapshot={snapshot}
        viewport={viewState.viewport}
        visible={shouldShowMiniMap}
      />
    </>
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
  panelRef: RefObject<HTMLDivElement>;
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
    <NodePicker
      ref={panelRef}
      position={screen}
      templates={templates}
      onSelect={onSelect}
    />
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
