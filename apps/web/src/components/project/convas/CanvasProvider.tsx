"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeChange,
  type Node as RFNode,
} from "reactflow";

export type CanvasMode =
  | "select"
  | "hand"
  | "marked"
  | "frame"
  | "group"
  | "arrow-straight"
  | "arrow-curve"
  | "resource";

type CanvasStoragePayload = {
  version: number;
  nodes: RFNode[];
  edges: Edge[];
};

const CANVAS_STORAGE_VERSION = 1;
const CANVAS_STORAGE_PREFIX = "teatime:canvas";

interface CanvasState {
  mode: CanvasMode;
  setMode: Dispatch<SetStateAction<CanvasMode>>;
  pendingEdgeSource: string | null;
  setPendingEdgeSource: Dispatch<SetStateAction<string | null>>;
  pendingGroupDuplicateId: string | null;
  setPendingGroupDuplicateId: Dispatch<SetStateAction<string | null>>;
  nodes: RFNode[];
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
  edges: Edge[];
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  onEdgesChange: (changes: EdgeChange[]) => void;
  showMiniMap: boolean;
  setShowMiniMap: Dispatch<SetStateAction<boolean>>;
  isMoving: boolean;
  setIsMoving: Dispatch<SetStateAction<boolean>>;
  isLocked: boolean;
  setIsLocked: Dispatch<SetStateAction<boolean>>;
  suppressSingleNodeToolbar: boolean;
  setSuppressSingleNodeToolbar: Dispatch<SetStateAction<boolean>>;
}

interface CanvasProviderProps {
  children: ReactNode;
  pageId?: string;
}

const CanvasContext = createContext<CanvasState | null>(null);

/** Build a stable storage key for a canvas page. */
function buildCanvasStorageKey(pageId?: string): string {
  const normalized = (pageId ?? "").trim();
  const suffix = normalized.length > 0 ? normalized : "default";
  return `${CANVAS_STORAGE_PREFIX}:${encodeURIComponent(suffix)}`;
}

/** Read canvas data from localStorage safely. */
function readCanvasStorage(key: string): CanvasStoragePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasStoragePayload;
    // 流程：解析结果 -> 校验版本/结构 -> 只在合法时返回
    if (!parsed || parsed.version !== CANVAS_STORAGE_VERSION) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Write canvas data into localStorage safely. */
function writeCanvasStorage(key: string, payload: CanvasStoragePayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Provide shared canvas state for project canvas internals. */
export function CanvasProvider({ children, pageId }: CanvasProviderProps) {
  const [mode, setMode] = useState<CanvasMode>("select");
  const [pendingEdgeSource, setPendingEdgeSource] = useState<string | null>(null);
  const [pendingGroupDuplicateId, setPendingGroupDuplicateId] = useState<string | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [suppressSingleNodeToolbar, setSuppressSingleNodeToolbar] = useState(false);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const storageKey = useMemo(() => buildCanvasStorageKey(pageId), [pageId]);
  const hasHydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    hasHydratedRef.current = false;
    const stored = readCanvasStorage(storageKey);
    // 流程：读取本地缓存 -> 初始化节点/连线 -> 标记完成
    if (stored) {
      setNodes(stored.nodes);
      setEdges(stored.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
    hasHydratedRef.current = true;
  }, [setEdges, setNodes, storageKey]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    // 流程：清理旧定时 -> 延迟写入 -> 卸载/依赖变更时清理
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      writeCanvasStorage(storageKey, {
        version: CANVAS_STORAGE_VERSION,
        nodes,
        edges,
      });
    }, 300);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [edges, nodes, storageKey]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      pendingEdgeSource,
      setPendingEdgeSource,
      pendingGroupDuplicateId,
      setPendingGroupDuplicateId,
      nodes,
      setNodes,
      edges,
      setEdges,
      onEdgesChange,
      showMiniMap,
      setShowMiniMap,
      isMoving,
      setIsMoving,
      isLocked,
      setIsLocked,
      suppressSingleNodeToolbar,
      setSuppressSingleNodeToolbar,
    }),
    [
      edges,
      isMoving,
      mode,
      nodes,
      onEdgesChange,
      pendingEdgeSource,
      pendingGroupDuplicateId,
      setEdges,
      setIsMoving,
      setMode,
      setNodes,
      setPendingEdgeSource,
      setPendingGroupDuplicateId,
      setShowMiniMap,
      showMiniMap,
      isLocked,
      setIsLocked,
      suppressSingleNodeToolbar,
      setSuppressSingleNodeToolbar,
    ],
  );

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

/** Access canvas state from the nearest CanvasProvider. */
export function useCanvasState() {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvasState must be used within CanvasProvider.");
  }
  return context;
}
