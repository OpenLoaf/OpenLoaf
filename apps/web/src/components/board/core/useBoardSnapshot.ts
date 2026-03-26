/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from "react";
import type { CanvasSnapshot } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";

/**
 * 浅比较两个快照是否在语义上相同。
 *
 * 逻辑：getSnapshot() 每次返回新顶层对象，但内部子字段（elements、selectedIds、
 * anchors 等）在引擎无变化时保持引用稳定。通过逐字段比较避免 setState 产生
 * 无意义的 re-render。
 */
function snapshotEqual(a: CanvasSnapshot, b: CanvasSnapshot): boolean {
  if (a === b) return true;
  // 快速路径：docRevision 不同说明文档数据变化，直接更新。
  if (a.docRevision !== b.docRevision) return false;
  // 逐字段浅比较（全部为原始类型或缓存引用）。
  if (a.elements !== b.elements) return false;
  if (a.selectedIds !== b.selectedIds) return false;
  if (a.editingNodeId !== b.editingNodeId) return false;
  if (a.expandedNodeId !== b.expandedNodeId) return false;
  if (a.viewport !== b.viewport) return false;
  if (a.anchors !== b.anchors) return false;
  if (a.alignmentGuides !== b.alignmentGuides) return false;
  if (a.selectionBox !== b.selectionBox) return false;
  if (a.canUndo !== b.canUndo) return false;
  if (a.canRedo !== b.canRedo) return false;
  if (a.activeToolId !== b.activeToolId) return false;
  if (a.draggingId !== b.draggingId) return false;
  if (a.panning !== b.panning) return false;
  if (a.locked !== b.locked) return false;
  if (a.connectorDraft !== b.connectorDraft) return false;
  if (a.connectorHover !== b.connectorHover) return false;
  if (a.nodeHoverId !== b.nodeHoverId) return false;
  if (a.connectorHoverId !== b.connectorHoverId) return false;
  if (a.connectorStyle !== b.connectorStyle) return false;
  if (a.connectorDashed !== b.connectorDashed) return false;
  if (a.connectorDrop !== b.connectorDrop) return false;
  if (a.pendingInsert !== b.pendingInsert) return false;
  if (a.pendingInsertPoint !== b.pendingInsertPoint) return false;
  if (a.toolbarDragging !== b.toolbarDragging) return false;
  if (a.colorHistory !== b.colorHistory) return false;
  if (a.selectionClickPoint !== b.selectionClickPoint) return false;
  if (a.connectorValidation !== b.connectorValidation) return false;
  return true;
}

/** Subscribe to engine updates and return the latest snapshot. */
export function useBoardSnapshot(engine: CanvasEngine): CanvasSnapshot {
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // 逻辑：effect 运行时同步最新快照，处理 React Strict Mode 下引擎状态
    // 在 cleanup（取消 rAF）和 re-mount 之间发生变更的情况。
    setSnapshot(prev => {
      const current = engine.getSnapshot();
      return snapshotEqual(prev, current) ? prev : current;
    });

    // 逻辑：通过 rAF 节流快照刷新，确保每帧最多更新一次，避免拖拽时多次重渲染。
    // 使用 updater function 进行浅比较，只有快照内容真正变化时才触发 re-render。
    const unsubscribe = engine.subscribe(() => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setSnapshot(prev => {
          const current = engine.getSnapshot();
          return snapshotEqual(prev, current) ? prev : current;
        });
      });
    });
    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [engine]);

  return snapshot;
}
