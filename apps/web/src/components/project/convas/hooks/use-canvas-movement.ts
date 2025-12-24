"use client";

import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UseCanvasMovementOptions {
  setIsMoving: Dispatch<SetStateAction<boolean>>;
}

interface UseCanvasMovementResult {
  onMoveStart: () => void;
  onMoveEnd: () => void;
}

/** Build move handlers for minimap visibility. */
export function useCanvasMovement({
  setIsMoving,
}: UseCanvasMovementOptions): UseCanvasMovementResult {
  const moveHideTimerRef = useRef<number | null>(null);

  /** Show moving state immediately. */
  const onMoveStart = useCallback(() => {
    if (moveHideTimerRef.current) {
      clearTimeout(moveHideTimerRef.current);
      moveHideTimerRef.current = null;
    }
    setIsMoving(true);
  }, [setIsMoving]);

  /** Hide moving state with a small delay. */
  const onMoveEnd = useCallback(() => {
    // 逻辑：延时隐藏，避免频繁抖动
    moveHideTimerRef.current = window.setTimeout(() => {
      setIsMoving(false);
    }, 240);
  }, [setIsMoving]);

  return { onMoveEnd, onMoveStart };
}
