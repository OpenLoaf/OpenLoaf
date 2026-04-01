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
import type { CanvasViewState } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";

/** Subscribe to view-only updates and return the latest view state (rAF throttled). */
export function useBoardViewState(engine: CanvasEngine): CanvasViewState {
  const [viewState, setViewState] = useState(() => engine.getViewState());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // 逻辑：只监听视图变化，通过 rAF 节流避免高频 setState。
    const unsubscribe = engine.subscribeView(() => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setViewState(engine.getViewState());
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

  return viewState;
}
