/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useState } from "react";
import type { CanvasSnapshot } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";

/** Subscribe to engine updates and return the latest snapshot. */
export function useBoardSnapshot(engine: CanvasEngine): CanvasSnapshot {
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());

  useEffect(() => {
    // 订阅引擎变更，确保 UI 与模型保持同步。
    const unsubscribe = engine.subscribe(() => {
      setSnapshot(engine.getSnapshot());
    });
    return () => {
      unsubscribe();
    };
  }, [engine]);

  return snapshot;
}
