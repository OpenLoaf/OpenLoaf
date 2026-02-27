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

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Configure FLIP transition behavior for a layout container. */
type UseFlipLayoutOptions = {
  /** Target element that owns the FLIP items. */
  containerRef: RefObject<HTMLElement | null>;
  /** Dependency list to trigger FLIP recalculation. */
  deps?: readonly unknown[];
  /** Enable or disable FLIP transitions. */
  enabled?: boolean;
  /** Transition duration in milliseconds. */
  durationMs?: number;
  /** Transition timing function. */
  easing?: string;
  /** Selector for items participating in FLIP. */
  selector?: string;
  /** Whether to trigger FLIP on container resize. */
  observeResize?: boolean;
};

/** Apply FLIP transitions for layout changes inside a container. */
export function useFlipLayout({
  containerRef,
  deps = [],
  enabled = true,
  durationMs = 180,
  easing = "cubic-bezier(0.2, 0.8, 0.2, 1)",
  selector = "[data-flip-id]",
  observeResize = true,
}: UseFlipLayoutOptions) {
  const previousRectsRef = useRef<Map<string, DOMRectReadOnly>>(new Map());
  const rafRef = useRef<number | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const containerEl = containerRef.current;

  useEffect(() => {
    if (typeof window === "undefined") return;
    reduceMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    if (!enabled || !containerEl || !observeResize) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setLayoutTick((tick) => tick + 1);
      });
    });
    observer.observe(containerEl);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerEl, enabled, observeResize]);

  useLayoutEffect(() => {
    if (!enabled || !containerEl) return;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (cleanupTimerRef.current) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    const nodes = Array.from(
      containerEl.querySelectorAll<HTMLElement>(selector)
    );
    const nextRects = new Map<string, DOMRectReadOnly>();
    const nodeById = new Map<string, HTMLElement>();
    for (const node of nodes) {
      const id = node.dataset.flipId;
      if (!id) continue;
      nodeById.set(id, node);
      nextRects.set(id, node.getBoundingClientRect());
    }

    const prevRects = previousRectsRef.current;
    if (!reduceMotionRef.current && prevRects.size > 0) {
      const animatedNodes: HTMLElement[] = [];
      nextRects.forEach((nextRect, id) => {
        const prevRect = prevRects.get(id);
        if (!prevRect) return;
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        const node = nodeById.get(id);
        if (!node) return;
        // 先把元素挪回旧位置，再触发过渡。
        node.style.transition = "transform 0s";
        node.style.transform = `translate(${dx}px, ${dy}px)`;
        node.style.willChange = "transform";
        animatedNodes.push(node);
      });

      if (animatedNodes.length > 0) {
        rafRef.current = requestAnimationFrame(() => {
          for (const node of animatedNodes) {
            node.style.transition = `transform ${durationMs}ms ${easing}`;
            node.style.transform = "translate(0px, 0px)";
          }
          cleanupTimerRef.current = window.setTimeout(() => {
            for (const node of animatedNodes) {
              node.style.transition = "";
              node.style.transform = "";
              node.style.willChange = "";
            }
          }, durationMs + 20);
        });
      }
    }

    // 记录本次布局供下次对比。
    previousRectsRef.current = nextRects;
  }, [containerEl, enabled, selector, durationMs, easing, layoutTick, ...deps]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (cleanupTimerRef.current) {
        window.clearTimeout(cleanupTimerRef.current);
      }
    };
  }, []);
}
