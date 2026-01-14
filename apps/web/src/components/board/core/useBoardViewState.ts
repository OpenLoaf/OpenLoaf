import { useEffect, useState } from "react";
import type { CanvasViewState } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";

/** Subscribe to view-only updates and return the latest view state. */
export function useBoardViewState(engine: CanvasEngine): CanvasViewState {
  const [viewState, setViewState] = useState(() => engine.getViewState());

  useEffect(() => {
    // 逻辑：只监听视图变化，避免触发全量快照渲染。
    const unsubscribe = engine.subscribeView(() => {
      setViewState(engine.getViewState());
    });
    return () => {
      unsubscribe();
    };
  }, [engine]);

  return viewState;
}
