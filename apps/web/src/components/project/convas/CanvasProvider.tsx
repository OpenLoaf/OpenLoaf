"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

type CanvasSnapshot = {
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
  isSelecting: boolean;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
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
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  isNodeDragging: boolean;
  beginNodeDrag: () => void;
  endNodeDrag: () => void;
  isNodeResizing: boolean;
  beginNodeResize: () => void;
  endNodeResize: () => void;
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
  const [isSelecting, setIsSelecting] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [suppressSingleNodeToolbar, setSuppressSingleNodeToolbar] = useState(false);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [isNodeResizing, setIsNodeResizing] = useState(false);
  const storageKey = useMemo(() => buildCanvasStorageKey(pageId), [pageId]);
  const hasHydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const historyRef = useRef<{ past: CanvasSnapshot[]; future: CanvasSnapshot[] }>({
    past: [],
    future: [],
  });
  const lastSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const pendingSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const isRestoringRef = useRef(false);
  const wasMovingRef = useRef(false);
  const moveStartSnapshotRef = useRef<CanvasSnapshot | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /** Sync undo/redo availability from the history stacks. */
  const updateHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(historyRef.current.future.length > 0);
  }, []);

  useEffect(() => {
    hasHydratedRef.current = false;
    const stored = readCanvasStorage(storageKey);
    // 流程：读取本地缓存 -> 初始化节点/连线 -> 标记完成
    if (stored) {
      setNodes(stored.nodes);
      setEdges(stored.edges);
      pendingSnapshotRef.current = { nodes: stored.nodes, edges: stored.edges };
    } else {
      setNodes([]);
      setEdges([]);
      pendingSnapshotRef.current = { nodes: [], edges: [] };
    }
    hasHydratedRef.current = true;
  }, [setEdges, setNodes, storageKey]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (pendingSnapshotRef.current) {
      // 逻辑：初始化快照 -> 清空历史栈
      lastSnapshotRef.current = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;
      historyRef.current = { past: [], future: [] };
      updateHistoryFlags();
      return;
    }
    if (isRestoringRef.current) {
      // 逻辑：撤销/重做完成后刷新基准快照
      isRestoringRef.current = false;
      lastSnapshotRef.current = { nodes, edges };
      updateHistoryFlags();
      return;
    }
    const isInMove = isMoving || isNodeDragging || isNodeResizing;
    if (isInMove) {
      if (!wasMovingRef.current) {
        // 逻辑：开始拖动时记录起始快照
        moveStartSnapshotRef.current = lastSnapshotRef.current ?? { nodes, edges };
      }
      wasMovingRef.current = true;
      lastSnapshotRef.current = { nodes, edges };
      return;
    }
    if (wasMovingRef.current) {
      // 逻辑：结束拖动时仅记录一次历史
      wasMovingRef.current = false;
      const startSnapshot = moveStartSnapshotRef.current;
      moveStartSnapshotRef.current = null;
      if (startSnapshot && (startSnapshot.nodes !== nodes || startSnapshot.edges !== edges)) {
        historyRef.current.past.push(startSnapshot);
        historyRef.current.future = [];
        updateHistoryFlags();
      }
      lastSnapshotRef.current = { nodes, edges };
      return;
    }
    const last = lastSnapshotRef.current;
    if (last && last.nodes === nodes && last.edges === edges) {
      return;
    }
    if (last) {
      // 逻辑：提交旧快照 -> 清空 redo 栈
      historyRef.current.past.push(last);
      historyRef.current.future = [];
      updateHistoryFlags();
    }
    lastSnapshotRef.current = { nodes, edges };
  }, [edges, isMoving, isNodeDragging, isNodeResizing, nodes, updateHistoryFlags]);

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

  /** Undo the latest canvas change. */
  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.past.length === 0) return;
    const current = lastSnapshotRef.current ?? { nodes, edges };
    const previous = history.past.pop();
    if (!previous) return;
    // 流程：当前快照入 redo -> 应用上一快照
    history.future.push(current);
    isRestoringRef.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    updateHistoryFlags();
  }, [edges, nodes, setEdges, setNodes, updateHistoryFlags]);

  /** Redo the latest undone canvas change. */
  const redo = useCallback(() => {
    const history = historyRef.current;
    if (history.future.length === 0) return;
    const current = lastSnapshotRef.current ?? { nodes, edges };
    const next = history.future.pop();
    if (!next) return;
    // 流程：当前快照入 undo -> 应用下一快照
    history.past.push(current);
    isRestoringRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    updateHistoryFlags();
  }, [edges, nodes, setEdges, setNodes, updateHistoryFlags]);

  /** Mark node dragging as started. */
  const beginNodeDrag = useCallback(() => {
    setIsNodeDragging(true);
  }, []);

  /** Mark node dragging as ended. */
  const endNodeDrag = useCallback(() => {
    setIsNodeDragging(false);
  }, []);

  /** Mark node resizing as started. */
  const beginNodeResize = useCallback(() => {
    setIsNodeResizing(true);
  }, []);

  /** Mark node resizing as ended. */
  const endNodeResize = useCallback(() => {
    setIsNodeResizing(false);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      pendingEdgeSource,
      setPendingEdgeSource,
      isSelecting,
      setIsSelecting,
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
      canUndo,
      canRedo,
      undo,
      redo,
      isNodeDragging,
      beginNodeDrag,
      endNodeDrag,
      isNodeResizing,
      beginNodeResize,
      endNodeResize,
    }),
    [
      canRedo,
      canUndo,
      edges,
      isMoving,
      mode,
      nodes,
      onEdgesChange,
      pendingEdgeSource,
      isSelecting,
      setEdges,
      setIsMoving,
      setMode,
      setNodes,
      setPendingEdgeSource,
      setIsSelecting,
      setShowMiniMap,
      showMiniMap,
      isLocked,
      setIsLocked,
      suppressSingleNodeToolbar,
      setSuppressSingleNodeToolbar,
      isNodeDragging,
      beginNodeDrag,
      endNodeDrag,
      isNodeResizing,
      beginNodeResize,
      endNodeResize,
      undo,
      redo,
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
