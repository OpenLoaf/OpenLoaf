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

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import FlipClock from "@openloaf/ui/flip-clock";

interface FlipClockWidgetProps {
  /** Active variant key. */
  variant?: 'hm' | 'hms';
  /** Whether to show seconds (backward compat, variant takes priority). */
  showSeconds?: boolean;
}

// 时:分:秒模式最小宽度（6 digit × 40px + 2 colon + gaps ≈ 290px）
const HMS_MIN_WIDTH = 290;

/** Render a flip clock widget for the desktop grid. */
export default function FlipClockWidget({ variant, showSeconds = true }: FlipClockWidgetProps) {
  const wantsSeconds = variant ? variant === 'hms' : showSeconds;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasRoom, setHasRoom] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const prevShowSecondsRef = useRef(wantsSeconds && hasRoom);

  useLayoutEffect(() => {
    if (!wantsSeconds) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setHasRoom(width >= HMS_MIN_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [wantsSeconds]);

  const resolvedShowSeconds = wantsSeconds && hasRoom;

  // 检测模式切换，触发模糊过渡动画
  useEffect(() => {
    if (prevShowSecondsRef.current === resolvedShowSeconds) return;
    prevShowSecondsRef.current = resolvedShowSeconds;
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [resolvedShowSeconds]);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        filter: transitioning ? 'blur(2px)' : 'blur(0px)',
        opacity: transitioning ? 0.85 : 1,
        transition: 'filter 200ms ease-out, opacity 200ms ease-out',
      }}
    >
      <FlipClock showSeconds={resolvedShowSeconds} />
    </div>
  );
}
