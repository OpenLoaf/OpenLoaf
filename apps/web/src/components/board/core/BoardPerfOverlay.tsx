/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useEffect, useRef, useState } from "react";
import { refreshAllCapabilities } from "@/hooks/use-capabilities";
import { useBoardEngine } from "./BoardProvider";

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

/** Stats flushed once per second. */
type PerfSnapshot = {
  fps: number;
  frameMs: number;
  longFrames: number;
  zoom: number;
};

const INITIAL_SNAPSHOT: PerfSnapshot = { fps: 0, frameMs: 0, longFrames: 0, zoom: 1 };

/** Render the board performance overlay. */
export const BoardPerfOverlay = memo(function BoardPerfOverlay({ stats, gpuStats }: BoardPerfOverlayProps) {
  const engine = useBoardEngine();
  /** All perf metrics batched into a single state to avoid multiple re-renders. */
  const [perf, setPerf] = useState<PerfSnapshot>(INITIAL_SNAPSHOT);
  /** Whether the detail panel is expanded. */
  const [expanded, setExpanded] = useState(false);

  // 逻辑：rAF 回调只做极轻量计数（无 setState、无 DOM 读取），
  // 每秒由 setInterval 将累积数据 flush 到 React state，
  // 避免 tick 回调导致主线程阻塞。
  const countersRef = useRef({
    lastFrame: 0,
    frameCount: 0,
    frameTotal: 0,
    longFrameCount: 0,
    windowStart: 0,
  });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const c = countersRef.current;
    c.lastFrame = now;
    c.windowStart = now;
    c.frameCount = 0;
    c.frameTotal = 0;
    c.longFrameCount = 0;

    // 逻辑：rAF 回调极度精简——只做减法和加法，不触发任何 React 更新或 DOM 读取。
    const tick = (time: number) => {
      const delta = time - c.lastFrame;
      c.lastFrame = time;
      c.frameCount += 1;
      c.frameTotal += delta;
      if (delta > LONG_FRAME_MS) {
        c.longFrameCount += 1;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    // 逻辑：用 setInterval 每秒 flush 一次统计数据到 React state，
    // 将 setState 从 rAF 热路径中完全移除。同时从 engine 读取 zoom 值，
    // 避免订阅 viewState 导致的高频重渲染。
    const intervalId = window.setInterval(() => {
      const windowDelta = performance.now() - c.windowStart;
      if (windowDelta < 500) return; // 防护：间隔过短时跳过
      const nextFps = Math.round((c.frameCount * 1000) / windowDelta);
      const nextFrameMs = c.frameTotal / Math.max(c.frameCount, 1);
      const currentZoom = engine.getViewState().viewport.zoom;
      setPerf({
        fps: nextFps,
        frameMs: Math.round(nextFrameMs * 10) / 10,
        longFrames: c.longFrameCount,
        zoom: currentZoom,
      });
      c.frameCount = 0;
      c.frameTotal = 0;
      c.longFrameCount = 0;
      c.windowStart = performance.now();
    }, 1000);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      window.clearInterval(intervalId);
    };
  }, [engine]);

  const visibleRate =
    stats.totalNodes > 0
      ? Math.round((stats.visibleNodes / stats.totalNodes) * 100)
      : 100;

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
          <span className="font-mono">{perf.fps}</span>
        </div>
        {expanded && (
          <>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>帧时间</span>
              <span className="font-mono">{perf.frameMs} ms</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>长帧(&gt;50ms)</span>
              <span className="font-mono">{perf.longFrames}</span>
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
              <span className="font-mono">{perf.zoom.toFixed(2)}x</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <span>图片纹理</span>
              <span className="font-mono">{gpuStats.imageTextures}</span>
            </div>
            <button
              type="button"
              className="mt-1.5 w-full rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white/80 transition-colors duration-150 hover:bg-white/30 active:bg-white/40"
              onClick={() => {
                refreshAllCapabilities()
              }}
            >
              刷新能力接口
            </button>
          </>
        )}
      </div>
    </div>
  );
})
