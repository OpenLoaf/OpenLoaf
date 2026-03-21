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
import { useBoardEngine } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";

type BoardPerfStats = {
  /** Total renderable node count. */
  totalNodes: number;
  /** Node count inside the viewport. */
  visibleNodes: number;
  /** Node count culled by the viewport. */
  culledNodes: number;
};

type BoardGpuStats = {
  /** GPU image texture count. */
  imageTextures: number;
};

type BoardPerfOverlayProps = {
  /** Stats collected from the DOM culling pass. */
  stats: BoardPerfStats;
  /** GPU-side stats from the renderer. */
  gpuStats: BoardGpuStats;
};

/** Threshold in ms for long frames. */
const LONG_FRAME_MS = 50;

/** Render the board performance overlay. */
export function BoardPerfOverlay({ stats, gpuStats }: BoardPerfOverlayProps) {
  // 逻辑：视图状态独立订阅，避免缩放时触发全量快照渲染。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const zoom = viewState.viewport.zoom;
  /** FPS sampled per second. */
  const [fps, setFps] = useState(0);
  /** Average frame time sampled per second. */
  const [frameMs, setFrameMs] = useState(0);
  /** Long frame count in the sampling window. */
  const [longFrames, setLongFrames] = useState(0);
  /** Whether the detail panel is expanded. */
  const [expanded, setExpanded] = useState(false);
  /** Last rAF timestamp. */
  const lastFrameRef = useRef<number>(0);
  /** Sampling window start time. */
  const windowStartRef = useRef<number>(0);
  /** Frame count within the sampling window. */
  const frameCountRef = useRef(0);
  /** Total frame time within the sampling window. */
  const frameTotalRef = useRef(0);
  /** Long frame count within the sampling window. */
  const longFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const visibleRate =
    stats.totalNodes > 0
      ? Math.round((stats.visibleNodes / stats.totalNodes) * 100)
      : 100;
  useEffect(() => {
    const now = performance.now();
    lastFrameRef.current = now;
    windowStartRef.current = now;
    const tick = (time: number) => {
      const delta = time - lastFrameRef.current;
      lastFrameRef.current = time;
      frameCountRef.current += 1;
      frameTotalRef.current += delta;
      if (delta > LONG_FRAME_MS) {
        longFrameRef.current += 1;
      }
      const windowDelta = time - windowStartRef.current;
      if (windowDelta >= 1000) {
        // 逻辑：按 1 秒窗口统计 FPS 与平均帧时间。
        const nextFps = Math.round((frameCountRef.current * 1000) / windowDelta);
        const nextFrameMs = frameTotalRef.current / Math.max(frameCountRef.current, 1);
        setFps(nextFps);
        setFrameMs(Math.round(nextFrameMs * 10) / 10);
        setLongFrames(longFrameRef.current);
        frameCountRef.current = 0;
        frameTotalRef.current = 0;
        longFrameRef.current = 0;
        windowStartRef.current = time;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div
      data-board-controls
      className="absolute right-3 top-3 z-40 select-none"
    >
      <div className={`rounded-3xl px-2 py-1 text-[10px] leading-4 ol-glass-float ${expanded ? 'bg-black/50 text-white/70' : 'bg-black/30 text-white/50'}`}>
        <div
          className="flex cursor-pointer items-center justify-between gap-3"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex items-center gap-1">
            <svg
              className={`h-2.5 w-2.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6 4l4 4-4 4z" />
            </svg>
            FPS
          </span>
          <span className="font-mono">{fps}</span>
        </div>
        {expanded && (
          <>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>帧时间</span>
              <span className="font-mono">{frameMs} ms</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>长帧(&gt;50ms)</span>
              <span className="font-mono">{longFrames}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>节点总数</span>
              <span className="font-mono">{stats.totalNodes}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>可见节点</span>
              <span className="font-mono">{stats.visibleNodes}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>裁剪节点</span>
              <span className="font-mono text-ol-green/60">{stats.culledNodes}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>可见率</span>
              <span className="font-mono">{visibleRate}%</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>缩放</span>
              <span className="font-mono">{zoom.toFixed(2)}x</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>图片纹理</span>
              <span className="font-mono">{gpuStats.imageTextures}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
