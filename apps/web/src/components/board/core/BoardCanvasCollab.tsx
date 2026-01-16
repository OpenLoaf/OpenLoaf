"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";
import { buildImageNodePayloadFromFile } from "../utils/image";
import { fileToBase64 } from "../utils/base64";
import { readBoardDocPayload, writeBoardDocPayload } from "./boardYjsStore";
import { resolveBoardFolderScope, toBoardRelativePath } from "./boardFilePath";
import {
  BOARD_ASSETS_DIR_NAME,
  BOARD_META_FILE_NAME,
} from "@/lib/file-name";
import { buildChildUri, getUniqueName } from "@/components/project/filesystem/utils/file-system-utils";
import { resolveServerUrl } from "@/utils/server-url";
import { trpc } from "@/utils/trpc";
import { BOARD_COLLAB_WS_PATH } from "@tenas-ai/api/types/boardCollab";

type BoardCanvasCollabProps = {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Initial elements injected when the board is empty. */
  initialElements?: CanvasElement[];
  /** Workspace id for storage isolation. */
  workspaceId: string;
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
};

const BOARD_DOC_ORIGIN = "board-engine";
const BOARD_META_DOC_ID_KEY = "docId";
const BOARD_SYNC_SIGNAL = "flush";

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
  workspaceId: string;
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
  params.set("workspaceId", input.workspaceId);
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
  const nextOriginal = toBoardRelativePath(originalSrc, boardFolderScope, boardFolderUri);
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
  workspaceId,
  projectId,
  rootUri,
  boardFolderUri,
  boardFileUri,
  onSyncLogChange,
}: BoardCanvasCollabProps) {
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
  const boardFolderScope = useMemo(
    () =>
      resolveBoardFolderScope({
        projectId,
        rootUri,
        boardFolderUri,
      }),
    [boardFolderUri, projectId, rootUri]
  );
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

  /** Load or create the board doc id persisted in meta file. */
  const readOrCreateDocId = useCallback(async (): Promise<string> => {
    if (!metaFileUri) return createBoardDocId();
    try {
      const result = await queryClient.fetchQuery(
        trpc.fs.readFile.queryOptions({
          workspaceId,
          projectId,
          uri: metaFileUri,
        })
      );
      const parsed = parseBoardMeta(result.content ?? "");
      if (parsed?.docId) return parsed.docId;
    } catch {
      // 逻辑：缺少 meta 文件时直接生成新的 docId。
    }
    const docId = createBoardDocId();
    try {
      await writeMetaRef.current({
        workspaceId,
        projectId,
        uri: metaFileUri,
        content: JSON.stringify({ [BOARD_META_DOC_ID_KEY]: docId }, null, 2),
      });
    } catch {
      // 逻辑：写入失败时仍使用内存 docId，避免阻断协作。
    }
    return docId;
  }, [metaFileUri, projectId, queryClient, workspaceId]);

  /** Resolve a unique asset file name inside the board folder. */
  const resolveUniqueAssetName = useCallback(async (fileName: string) => {
    const trimmed = fileName.trim();
    // 逻辑：替换路径分隔符，避免文件名被当成目录。
    const safeName = (trimmed || "image.png").replace(/[\\/]/g, "-") || "image.png";
    if (!assetsFolderUri) return safeName;
    try {
      const result = await queryClient.fetchQuery(
        trpc.fs.list.queryOptions({
          workspaceId,
          projectId,
          uri: assetsFolderUri,
        })
      );
      const existing = new Set((result.entries ?? []).map((entry) => entry.name));
      return getUniqueName(safeName, existing);
    } catch {
      return safeName;
    }
  }, [assetsFolderUri, projectId, queryClient, workspaceId]);

  /** Persist an image file into the board assets folder. */
  const saveBoardAssetFile = useCallback(async (file: File) => {
    if (!assetsFolderUri) return "";
    await mkdirRef.current({
      workspaceId,
      projectId,
      uri: assetsFolderUri,
      recursive: true,
    });
    const uniqueName = await resolveUniqueAssetName(file.name || "image.png");
    const targetUri = buildChildUri(assetsFolderUri, uniqueName);
    const contentBase64 = await fileToBase64(file);
    await writeAssetRef.current({
      workspaceId,
      projectId,
      uri: targetUri,
      contentBase64,
    });
    return `${BOARD_ASSETS_DIR_NAME}/${uniqueName}`;
  }, [assetsFolderUri, projectId, resolveUniqueAssetName, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !boardFolderUri) {
      engine.setImagePayloadBuilder(null);
      return;
    }
    const buildImagePayload = async (file: File) => {
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
  }, [boardFolderUri, engine, saveBoardAssetFile, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    if (!boardFolderUri && !boardFileUri) return;
    let disposed = false;
    let doc: Y.Doc | null = null;
    let provider: HocuspocusProvider | null = null;
    let webrtc: null = null;
    let awareness: Awareness | null = null;

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
      }
      applyingRemoteRef.current = false;
    };

    /** Schedule a doc write for the latest engine state. */
    const scheduleDocSync = () => {
      if (applyingRemoteRef.current) return;
      if (!doc) return;
      const revision = engine.doc.getRevision();
      if (revision === lastRevisionRef.current) return;
      lastRevisionRef.current = revision;
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
      if (disposed) return;
      doc = new Y.Doc();
      awareness = new Awareness(doc);
      const wsUrl = resolveBoardCollabUrl({
        workspaceId,
        projectId,
        boardFileUri,
        boardFolderUri,
        docId,
      });
      provider = new HocuspocusProvider({
        url: wsUrl,
        name: docId,
        document: doc,
        awareness,
      });
      webrtc = null;

      doc.on("update", (_update, origin) => {
        if (origin === BOARD_DOC_ORIGIN) return;
        applyDocToEngine(doc!);
      });
      provider.on("synced", () => {
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
    void start().then((dispose) => {
      cleanup = dispose ?? null;
    });

    return () => {
      disposed = true;
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
    workspaceId,
  ]);

  return null;
}
