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

/** Subscribe to engine updates and return the latest snapshot. */
export function useBoardSnapshot(engine: CanvasEngine): CanvasSnapshot {
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // 逻辑：effect 运行时同步最新快照，处理 React Strict Mode 下引擎状态
    // 在 cleanup（取消 rAF）和 re-mount 之间发生变更的情况。
    setSnapshot(prev => {
      const current = engine.getSnapshot();
      return prev.docRevision !== current.docRevision ? current : prev;
    });

    // 逻辑：通过 rAF 节流快照刷新，确保每帧最多更新一次，避免拖拽时多次重渲染。
    const unsubscribe = engine.subscribe(() => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setSnapshot(engine.getSnapshot());
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
