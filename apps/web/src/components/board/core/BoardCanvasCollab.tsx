/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "../engine/types";
import type { ImageNodeProps } from "../board-contracts";
import type { CanvasEngine } from "../engine/CanvasEngine";
import {
  buildImageNodePayloadFromFile,
  convertImageFileToPngIfNeeded,
  shouldConvertImageToPng,
} from "../utils/image";
import { buildLinkNodePayloadFromUrl } from "../utils/link";
import { fetchWebMeta } from "@/lib/web-meta";
import { fileToBase64 } from "../utils/base64";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { readBoardDocPayload, writeBoardDocPayload } from "./boardYjsStore";
import { setBoardElementCount, clearBoardTracking } from "./boardContentTracker";
import {
  normalizeRelativePath,
  resolveBoardFolderScope,
  toBoardRelativePath,
} from "./boardFilePath";
import {
  BOARD_ASSETS_DIR_NAME,
  BOARD_META_FILE_NAME,
} from "@/lib/file-name";
import { DEFAULT_NODE_SIZE } from "../engine/constants";
import {
  buildChildUri,
  formatScopedProjectPath,
  getRelativePathFromUri,
  getUniqueName,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
} from "@/components/project/filesystem/utils/file-system-utils";
import { resolveServerUrl } from "@/utils/server-url";
import { trpc } from "@/utils/trpc";
import { BOARD_COLLAB_WS_PATH } from "@openloaf/api/types/boardCollab";
import { computeElementsBounds } from "../engine/geometry";
import {
  consumePendingBoardElements,
  onPendingBoardElements,
  type PendingBoardElementBatch,
} from "../engine/pending-elements-store";

type BoardCanvasCollabProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Initial elements injected when the board is empty. */
  initialElements?: CanvasElement[];
  /** Project id used for file resolution. */
  projectId?: string;
  /** Project root uri for attachment resolution. */
  rootUri?: string;
  /** Board folder uri for attachment storage. */
  boardFolderUri?: string;
  /** Board file uri for persistence. */
  boardFileUri?: string;
  /** Callback exposing sync capability. */
  onSyncLogChange?: (payload: { canSyncLog: boolean; onSyncLog?: () => void }) => void;
  /** Callback fired once the board has been hydrated from collaboration data. */
  onHydrated?: () => void;
};

const BOARD_DOC_ORIGIN = "board-engine";
const BOARD_META_DOC_ID_KEY = "docId";
const BOARD_SYNC_SIGNAL = "flush";
/** Scheme matcher for absolute URIs. */
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PENDING_IMPORT_GAP = 240;

/** Resolve a project-scoped reference from an input value. */
function resolveProjectScopedRef(input: {
  /** Input path or uri. */
  value?: string;
  /** Project root uri for file:// fallback. */
  rootUri?: string;
  /** Current project id for scope downgrade. */
  currentProjectId?: string;
}): string {
  const raw = input.value?.trim() ?? "";
  if (!raw) return "";
  if (SCHEME_REGEX.test(raw)) {
    if (input.rootUri) {
      const relativePath = getRelativePathFromUri(input.rootUri, raw);
      return relativePath ? normalizeProjectRelativePath(relativePath) : "";
    }
    return raw;
  }
  const parsed = parseScopedProjectPath(raw);
  if (!parsed) return "";
  return formatScopedProjectPath({
    projectId: parsed.projectId,
    currentProjectId: input.currentProjectId,
    relativePath: parsed.relativePath,
    includeAt: true,
  });
}

/** Resolve a board-relative reference from a board file uri when possible. */
function resolveBoardFileRef(input: {
  /** Board file uri. */
  boardFileUri?: string;
  /** Board folder uri. */
  boardFolderUri?: string;
  /** Board folder reference in project scope. */
  boardFolderRef?: string;
}): string {
  const raw = input.boardFileUri?.trim() ?? "";
  if (!raw) return "";
  if (input.boardFolderUri && SCHEME_REGEX.test(input.boardFolderUri) && SCHEME_REGEX.test(raw)) {
    const relativePath = getRelativePathFromUri(input.boardFolderUri, raw);
    return relativePath ? normalizeRelativePath(relativePath) : "";
  }
  if (input.boardFolderRef) {
    const normalizedFile = normalizeRelativePath(raw);
    const normalizedFolder = normalizeRelativePath(input.boardFolderRef);
    if (normalizedFile.startsWith(`${normalizedFolder}/`)) {
      return normalizeRelativePath(normalizedFile.slice(normalizedFolder.length + 1));
    }
  }
  return normalizeRelativePath(raw);
}

/** Split elements into nodes and connectors. */
function splitElements(elements: CanvasElement[]) {
  const nodes: CanvasNodeElement[] = [];
  const connectors: CanvasConnectorElement[] = [];
  elements.forEach((element) => {
    if (element.kind === "connector") {
      connectors.push(element as CanvasConnectorElement);
      return;
    }
    nodes.push(element as CanvasNodeElement);
  });
  return { nodes, connectors };
}

/** Offset imported elements so appended batches appear beside the current board content. */
function translatePendingElements(
  elements: CanvasElement[],
  existingElements: CanvasElement[],
): CanvasElement[] {
  if (elements.length === 0 || existingElements.length === 0) return elements;

  const existingBounds = computeElementsBounds(existingElements);
  const importedBounds = computeElementsBounds(elements);
  const deltaX = existingBounds.x + existingBounds.w + PENDING_IMPORT_GAP - importedBounds.x;
  const deltaY = existingBounds.y - importedBounds.y;

  return elements.map((element) => ({
    ...element,
    xywh: [
      element.xywh[0] + deltaX,
      element.xywh[1] + deltaY,
      element.xywh[2],
      element.xywh[3],
    ],
  }));
}

/** Apply one queued import batch into the active board document. */
function applyPendingBoardElementBatch(
  engine: CanvasEngine,
  batch: PendingBoardElementBatch,
): void {
  if (batch.elements.length === 0) return;

  const currentElements = engine.doc.getElements();
  const shouldKeepOriginalPlacement =
    batch.mode === "replace-if-empty" && currentElements.length === 0;
  const nextElements = shouldKeepOriginalPlacement
    ? batch.elements
    : translatePendingElements(batch.elements, currentElements);

  engine.batch(() => {
    engine.doc.transact(() => {
      nextElements.forEach((element) => {
        engine.doc.addElement(element);
      });
    });
  });
  engine.commitHistory();

  if (batch.fitView !== false) {
    engine.fitToElements();
  }
}

/** Create a time-prefixed random doc id. */
function createBoardDocId(): string {
  const prefix = Date.now().toString();
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  // 逻辑：docId 前缀使用时间戳，便于追踪创建时间。
  return `${prefix}_${suffix}`;
}

/** Build the collaboration websocket URL for the board. */
function resolveBoardCollabUrl(input: {
  projectId?: string;
  boardFileUri?: string;
  boardFolderUri?: string;
  docId: string;
}): string {
  const baseUrl =
    resolveServerUrl() ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const wsBase = baseUrl.replace(/^http/, "ws");
  const params = new URLSearchParams();
  if (input.projectId) params.set("projectId", input.projectId);
  if (input.boardFileUri) params.set("boardFileUri", input.boardFileUri);
  if (input.boardFolderUri) params.set("boardFolderUri", input.boardFolderUri);
  params.set("docId", input.docId);
  return `${wsBase}${BOARD_COLLAB_WS_PATH}?${params.toString()}`;
}

/** Parse a stored board meta payload. */
function parseBoardMeta(raw: string): { docId?: string } | null {
  try {
    const parsed = JSON.parse(raw) as { docId?: string };
    return typeof parsed.docId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Normalize image props for doc storage. */
function normalizeImageProps(
  node: CanvasNodeElement,
  boardFolderScope: ReturnType<typeof resolveBoardFolderScope>,
  boardFolderUri?: string
): CanvasNodeElement {
  if (node.type !== "image") return node;
  const props = node.props as Record<string, unknown>;
  const originalSrc = typeof props.originalSrc === "string" ? props.originalSrc : "";
  const previewSrc = typeof props.previewSrc === "string" ? props.previewSrc : "";
  let nextOriginal = toBoardRelativePath(originalSrc, boardFolderScope, boardFolderUri);
  if (nextOriginal.startsWith("data:") || nextOriginal.startsWith("blob:")) {
    // 逻辑：data/blob URL 不写入协作文档，避免 base64 膨胀导致画布卡顿。
    nextOriginal = "";
  }
  let nextPreview = previewSrc;
  if (previewSrc.startsWith("data:") || previewSrc.startsWith("blob:")) {
    // 逻辑：预览数据不写入协作文档，避免 base64 膨胀。
    nextPreview = "";
  } else if (previewSrc) {
    nextPreview = toBoardRelativePath(previewSrc, boardFolderScope, boardFolderUri);
  }
  if (nextOriginal === originalSrc && nextPreview === previewSrc) return node;
  return {
    ...node,
    props: {
      ...props,
      ...(nextOriginal !== originalSrc ? { originalSrc: nextOriginal } : null),
      ...(nextPreview !== previewSrc ? { previewSrc: nextPreview } : null),
    },
  };
}

/** Build the payload written into the Yjs document. */
function buildBoardDocPayload(
  elements: CanvasElement[],
  boardFolderScope: ReturnType<typeof resolveBoardFolderScope>,
  boardFolderUri?: string
) {
  const { nodes, connectors } = splitElements(elements);
  const normalizedNodes = nodes.map((node) =>
    normalizeImageProps(node, boardFolderScope, boardFolderUri)
  );
  return { nodes: normalizedNodes, connectors };
}

/** Install Yjs collaboration for the board canvas. */
export function BoardCanvasCollab({
  engine,
  initialElements,
  projectId,
  rootUri,
  boardFolderUri,
  boardFileUri,
  onSyncLogChange,
  onHydrated,
}: BoardCanvasCollabProps) {
  const { t } = useTranslation('board');
  const queryClient = useQueryClient();
  /** Hydration flag for initial fit logic. */
  const hydratedRef = useRef(false);
  /** Guard to skip local echo when applying remote updates. */
  const applyingRemoteRef = useRef(false);
  /** Last synced document revision. */
  const lastRevisionRef = useRef(engine.doc.getRevision());
  /** Pending rAF id for document sync. */
  const syncRafRef = useRef<number | null>(null);
  /** Pending timer id for manual flush. */
  const syncTimerRef = useRef<number | null>(null);
  /** Transcoding tasks keyed by task id. */
  const transcodeTasksRef = useRef(
    new Map<string, { file: File; started: boolean }>()
  );
  const boardFolderScope = useMemo(
    () =>
      resolveBoardFolderScope({
        projectId,
        rootUri,
        boardFolderUri,
      }),
    [boardFolderUri, projectId, rootUri]
  );
  const boardFolderRef = useMemo(
    () =>
      resolveProjectScopedRef({
        value: boardFolderUri,
        rootUri,
        currentProjectId: projectId,
      }),
    [boardFolderUri, projectId, rootUri]
  );
  const boardFileRef = useMemo(() => {
    if (boardFolderRef) {
      return resolveBoardFileRef({
        boardFileUri,
        boardFolderUri,
        boardFolderRef,
      });
    }
    return resolveProjectScopedRef({
      value: boardFileUri,
      rootUri,
      currentProjectId: projectId,
    });
  }, [boardFileUri, boardFolderRef, boardFolderUri, projectId, rootUri]);
  const assetsFolderUri = useMemo(
    () => (boardFolderUri ? buildChildUri(boardFolderUri, BOARD_ASSETS_DIR_NAME) : ""),
    [boardFolderUri]
  );
  const metaFileUri = useMemo(
    () => (boardFolderUri ? buildChildUri(boardFolderUri, BOARD_META_FILE_NAME) : ""),
    [boardFolderUri]
  );

  const writeMetaMutation = useMutation(trpc.fs.writeFile.mutationOptions());
  const writeAssetMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const mkdirMutation = useMutation(trpc.fs.mkdir.mutationOptions());
  const writeMetaRef = useRef(writeMetaMutation.mutateAsync);
  const writeAssetRef = useRef(writeAssetMutation.mutateAsync);
  const mkdirRef = useRef(mkdirMutation.mutateAsync);

  useEffect(() => {
    writeMetaRef.current = writeMetaMutation.mutateAsync;
  }, [writeMetaMutation.mutateAsync]);

  useEffect(() => {
    writeAssetRef.current = writeAssetMutation.mutateAsync;
  }, [writeAssetMutation.mutateAsync]);

  useEffect(() => {
    mkdirRef.current = mkdirMutation.mutateAsync;
  }, [mkdirMutation.mutateAsync]);

  const onHydratedRef = useRef(onHydrated);
  useEffect(() => {
    onHydratedRef.current = onHydrated;
  }, [onHydrated]);

  /** Whether the meta file has been persisted. */
  const metaPersistedRef = useRef(false);

  /** Persist meta file on first content change. */
  const persistMetaIfNeeded = useCallback(async (docId: string) => {
    if (metaPersistedRef.current || !metaFileUri) return;
    metaPersistedRef.current = true;
    try {
      await writeMetaRef.current({
        projectId,
        uri: metaFileUri,
        content: JSON.stringify({ [BOARD_META_DOC_ID_KEY]: docId }, null, 2),
      });
    } catch {
      // 逻辑：写入失败时仍使用内存 docId，避免阻断协作。
    }
  }, [metaFileUri, projectId]);

  /** Load or create the board doc id persisted in meta file. */
  const readOrCreateDocId = useCallback(async (): Promise<string> => {
    if (!metaFileUri) return createBoardDocId();
    try {
      const result = await queryClient.fetchQuery(
        trpc.fs.readFile.queryOptions({
          projectId,
          uri: metaFileUri,
        })
      );
      const parsed = parseBoardMeta(result.content ?? "");
      if (parsed?.docId) {
        metaPersistedRef.current = true;
        return parsed.docId;
      }
    } catch {
      // 逻辑：缺少 meta 文件时生成内存 docId，延迟到首次修改时写入。
    }
    return createBoardDocId();
  }, [metaFileUri, projectId, queryClient]);

  /** Resolve a unique asset file name inside the board folder. */
  const resolveUniqueAssetName = useCallback(async (fileName: string) => {
    const trimmed = fileName.trim();
    // 逻辑：替换路径分隔符，避免文件名被当成目录。
    const safeName = (trimmed || "image.png").replace(/[\\/]/g, "-") || "image.png";
    if (!assetsFolderUri) return safeName;
    try {
      const result = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({
          projectId,
          uri: assetsFolderUri,
        })
      );
      const existing = new Set((result.entries ?? []).map((entry) => entry.name));
      return getUniqueName(safeName, existing);
    } catch {
      return safeName;
    }
  }, [assetsFolderUri, projectId, queryClient]);

  /** Persist an image file into the board assets folder. */
  const saveBoardAssetFile = useCallback(async (file: File) => {
    if (!assetsFolderUri) return "";
    await mkdirRef.current({
      projectId,
      uri: assetsFolderUri,
      recursive: true,
    });
    const uniqueName = await resolveUniqueAssetName(file.name || "image.png");
    const targetUri = buildChildUri(assetsFolderUri, uniqueName);
    const contentBase64 = await fileToBase64(file);
    await writeAssetRef.current({
      projectId,
      uri: targetUri,
      contentBase64,
    });
    return `${BOARD_ASSETS_DIR_NAME}/${uniqueName}`;
  }, [assetsFolderUri, projectId, resolveUniqueAssetName]);

  /** Register a new transcoding task and return its id. */
  const registerTranscodeTask = useCallback(
    (file: File) => {
      const taskId = engine.generateId("transcode");
      transcodeTasksRef.current.set(taskId, { file, started: false });
      return taskId;
    },
    [engine]
  );

  /** Run a single transcoding task and update its node when done. */
  const runTranscodeTask = useCallback(
    async (nodeId: string, taskId: string, file: File) => {
      let targetFile = file;
      try {
        // 逻辑：后台转码失败时回退原文件插入，并提示用户。
        targetFile = (await convertImageFileToPngIfNeeded(file)).file;
      } catch {
        toast.error(t('collab.imageTranscodeFailed'));
        targetFile = file;
      }

      let payload = {
        props: {
          previewSrc: "",
          originalSrc: "",
          mimeType: targetFile.type || "image/png",
          fileName: targetFile.name || "Image",
          naturalWidth: 1,
          naturalHeight: 1,
        },
        size: DEFAULT_NODE_SIZE as [number, number],
      };
      try {
        payload = await buildImageNodePayloadFromFile(targetFile);
      } catch {
        // 逻辑：解码失败时保留占位图，避免阻断 UI。
      }

      let relativePath = "";
      try {
        relativePath = await saveBoardAssetFile(targetFile);
      } catch {
        // 逻辑：写入失败时继续使用 data url 预览。
      }

      const current = engine.doc.getElementById(nodeId);
      if (!current || current.kind !== "node") {
        transcodeTasksRef.current.delete(taskId);
        return;
      }
      const currentProps = current.props as ImageNodeProps;
      if (currentProps.transcodingId !== taskId) {
        transcodeTasksRef.current.delete(taskId);
        return;
      }

      const [x, y, w, h] = current.xywh;
      const [nextW, nextH] = payload.size;
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const nextRect: [number, number, number, number] = [
        centerX - nextW / 2,
        centerY - nextH / 2,
        nextW,
        nextH,
      ];

      engine.doc.updateElement(nodeId, {
        xywh: nextRect,
        props: {
          ...payload.props,
          originalSrc: relativePath || payload.props.originalSrc,
          isTranscoding: false,
          transcodingLabel: "",
          transcodingId: "",
        },
      });
      transcodeTasksRef.current.delete(taskId);
    },
    [engine, saveBoardAssetFile]
  );

  useEffect(() => {
    const scanTranscodingNodes = () => {
      const elements = engine.doc.getElements();
      elements.forEach((element) => {
        if (element.kind !== "node" || element.type !== "image") return;
        const props = element.props as ImageNodeProps;
        if (!props.isTranscoding) return;
        const taskId = props.transcodingId?.trim();
        if (!taskId) return;
        const task = transcodeTasksRef.current.get(taskId);
        if (!task || task.started) return;
        task.started = true;
        void runTranscodeTask(element.id, taskId, task.file);
      });
    };

    const unsubscribe = engine.subscribe(() => {
      // 逻辑：节点入库后扫描一次，触发转码。拖拽期间跳过。
      if (engine.isDragging()) return;
      scanTranscodingNodes();
    });
    scanTranscodingNodes();
    return () => {
      unsubscribe();
    };
  }, [engine, runTranscodeTask]);

  // 逻辑：追踪画布元素数量，供关闭时判断是否为空画布。
  useEffect(() => {
    if (!boardFolderUri) return;
    const sync = () => {
      // 逻辑：拖拽期间跳过计数同步，减少不必要的开销。
      if (engine.isDragging()) return;
      setBoardElementCount(boardFolderUri, engine.doc.getElements().length);
    };
    const unsubscribe = engine.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      clearBoardTracking(boardFolderUri);
    };
  }, [engine, boardFolderUri]);

  useEffect(() => {
    if (!boardFolderUri) {
      engine.setImagePayloadBuilder(null);
      return;
    }
    const buildImagePayload = async (file: File) => {
      if (shouldConvertImageToPng(file)) {
        const taskId = registerTranscodeTask(file);
        return {
          props: {
            previewSrc: "",
            originalSrc: "",
            mimeType: "image/png",
            fileName: file.name || "Image",
            naturalWidth: 1,
            naturalHeight: 1,
            isTranscoding: true,
            transcodingLabel: i18next.t('board:loading.transcoding'),
            transcodingId: taskId,
          },
          size: DEFAULT_NODE_SIZE,
        };
      }
      const payload = await buildImageNodePayloadFromFile(file);
      try {
        const relativePath = await saveBoardAssetFile(file);
        if (!relativePath) return payload;
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
    };
    engine.setImagePayloadBuilder(buildImagePayload);
    return () => {
      engine.setImagePayloadBuilder(null);
    };
  }, [boardFolderUri, engine, saveBoardAssetFile]);

  useEffect(() => {
    if (!rootUri) {
      engine.setLinkPayloadBuilder(null);
      return;
    }
    const buildLinkPayload = async (url: string) => {
      const payload = buildLinkNodePayloadFromUrl(url);
      try {
        const result = await fetchWebMeta({ url, rootUri });
        if (!result.ok) return payload;
        return {
          ...payload,
          props: {
            ...payload.props,
            title: result.title || payload.props.title,
            description: result.description || payload.props.description,
            logoSrc: result.logoPath ?? "",
            imageSrc: result.previewPath ?? "",
            refreshToken: payload.props.refreshToken + 1,
          },
        };
      } catch {
        return payload;
      }
    };
    engine.setLinkPayloadBuilder(buildLinkPayload);
    return () => {
      engine.setLinkPayloadBuilder(null);
    };
  }, [engine, rootUri]);

  useEffect(() => {
    if (!boardFolderUri && !boardFileUri) return;
    let disposed = false;
    let doc: Y.Doc | null = null;
    let provider: HocuspocusProvider | null = null;
    let webrtc: null = null;
    let awareness: Awareness | null = null;
    const removePendingImportListener = onPendingBoardElements(({ boardFolderUri: targetBoardFolderUri }) => {
      if (!boardFolderUri || targetBoardFolderUri !== boardFolderUri) return;
      if (!hydratedRef.current) return;
      const batches = consumePendingBoardElements(boardFolderUri);
      if (batches.length === 0) return;
      batches.forEach((batch) => {
        applyPendingBoardElementBatch(engine, batch);
      });
    });

    /** Pull and apply queued import batches for the current board. */
    const flushPendingImports = () => {
      if (!boardFolderUri || !hydratedRef.current) return;
      const batches = consumePendingBoardElements(boardFolderUri);
      if (batches.length === 0) return;
      batches.forEach((batch) => {
        applyPendingBoardElementBatch(engine, batch);
      });
    };

    /** Apply Yjs document payload into the canvas engine. */
    const applyDocToEngine = (docToApply: Y.Doc) => {
      const payload = readBoardDocPayload(docToApply);
      if (
        !hydratedRef.current &&
        initialElements &&
        initialElements.length > 0 &&
        payload.nodes.length === 0 &&
        payload.connectors.length === 0
      ) {
        // 逻辑：协作文档为空时注入初始元素并同步回文档。
        engine.setInitialElements(initialElements);
        const nextPayload = buildBoardDocPayload(
          engine.doc.getElements(),
          boardFolderScope,
          boardFolderUri
        );
        writeBoardDocPayload(docToApply, nextPayload, BOARD_DOC_ORIGIN);
        hydratedRef.current = true;
        engine.fitToElements();
        flushPendingImports();
        onHydratedRef.current?.();
        return;
      }
      applyingRemoteRef.current = true;
      const elements = [...payload.nodes, ...payload.connectors];
      engine.doc.setElements(elements);
      engine.resetHistory({ emit: false });
      lastRevisionRef.current = engine.doc.getRevision();
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        engine.fitToElements();
        onHydratedRef.current?.();
      }
      applyingRemoteRef.current = false;
      flushPendingImports();
    };

    let resolvedDocId = "";

    /** Schedule a doc write for the latest engine state. */
    const scheduleDocSync = () => {
      if (applyingRemoteRef.current) return;
      if (!doc) return;
      // 逻辑：拖拽期间跳过 Yjs 同步，避免每帧序列化大型元素数据。
      if (engine.isDragging()) return;
      const revision = engine.doc.getRevision();
      if (revision === lastRevisionRef.current) return;
      lastRevisionRef.current = revision;
      // 逻辑：首次内容变更时才持久化 meta 文件，避免空画布创建文件。
      if (resolvedDocId) {
        void persistMetaIfNeeded(resolvedDocId);
      }
      if (syncRafRef.current !== null) return;
      syncRafRef.current = window.requestAnimationFrame(() => {
        syncRafRef.current = null;
        if (!doc) return;
        const payload = buildBoardDocPayload(
          engine.doc.getElements(),
          boardFolderScope,
          boardFolderUri
        );
        writeBoardDocPayload(doc, payload, BOARD_DOC_ORIGIN);
      });
    };

    const start = async () => {
      const docId = await readOrCreateDocId();
      resolvedDocId = docId;
      if (disposed) return;
      doc = new Y.Doc();
      awareness = new Awareness(doc);
      const wsUrl = resolveBoardCollabUrl({
        projectId,
        boardFileUri: boardFileRef || undefined,
        boardFolderUri: boardFolderRef || undefined,
        docId,
      });
      console.log("[board] collab connecting", { wsUrl, docId });
      provider = new HocuspocusProvider({
        url: wsUrl,
        name: docId,
        document: doc,
        awareness,
        onOpen: () => {
          console.log("[board] collab websocket opened");
        },
        onClose: ({ event }) => {
          console.warn("[board] collab websocket closed", event.code, event.reason);
        },
        onDisconnect: ({ event }) => {
          console.warn("[board] collab disconnected", event);
        },
      });
      webrtc = null;

      doc.on("update", (_update, origin) => {
        if (origin === BOARD_DOC_ORIGIN) return;
        applyDocToEngine(doc!);
      });
      provider.on("synced", () => {
        console.log("[board] collab synced");
        if (!doc) return;
        applyDocToEngine(doc);
      });

      onSyncLogChange?.({
        canSyncLog: true,
        onSyncLog: () => {
          if (!provider) return;
          // 逻辑：先强制同步，再请求服务端立即落盘。
          provider.forceSync();
          if (syncTimerRef.current) {
            window.clearTimeout(syncTimerRef.current);
          }
          syncTimerRef.current = window.setTimeout(() => {
            provider?.sendStateless(BOARD_SYNC_SIGNAL);
          }, 200);
        },
      });

      const unsubscribe = engine.subscribe(() => {
        scheduleDocSync();
      });

      return () => {
        unsubscribe();
      };
    };

    let cleanup: (() => void) | null = null;
    void start()
      .then((dispose) => {
        cleanup = dispose ?? null;
      })
      .catch((err) => {
        console.error("[board] collab start failed", err);
      });

    return () => {
      disposed = true;
      removePendingImportListener();
      cleanup?.();
      onSyncLogChange?.({ canSyncLog: false });
      if (syncRafRef.current !== null) {
        window.cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      provider?.destroy();
      webrtc = null;
      if (doc) doc.destroy();
      provider = null;
      webrtc = null;
      awareness = null;
      doc = null;
    };
  }, [
    boardFileUri,
    boardFolderScope,
    boardFolderUri,
    engine,
    initialElements,
    onSyncLogChange,
    projectId,
    readOrCreateDocId,
  ]);

  return null;
}
