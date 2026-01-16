import { useCallback, useEffect, useRef, useState } from "react";
import { useBoardEngine } from "./BoardProvider";
import { useBoardViewState } from "./useBoardViewState";
import { Button } from "@/components/ui/button";

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
  /** Trigger a log sync into base/json files. */
  onSyncLog?: () => void;
};

/** Threshold in ms for long frames. */
const LONG_FRAME_MS = 50;

/** Render the board performance overlay. */
export function BoardPerfOverlay({ stats, gpuStats, onSyncLog }: BoardPerfOverlayProps) {
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
  /** Click handler for syncing log data. */
  const handleSyncLog = useCallback(() => {
    if (!onSyncLog) return;
    onSyncLog();
  }, [onSyncLog]);

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
    <div className="pointer-events-none absolute right-3 top-3 z-40 select-none">
      <div className="min-w-[170px] rounded-lg bg-slate-950/75 px-3 py-2 text-[10px] leading-4 text-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-300">FPS</span>
          <span className="font-mono text-slate-50">{fps}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">帧时间</span>
          <span className="font-mono text-slate-50">{frameMs} ms</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">长帧(&gt;50ms)</span>
          <span className="font-mono text-slate-50">{longFrames}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">节点总数</span>
          <span className="font-mono text-slate-50">{stats.totalNodes}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">可见节点</span>
          <span className="font-mono text-slate-50">{stats.visibleNodes}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">裁剪节点</span>
          <span className="font-mono text-emerald-300">{stats.culledNodes}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">可见率</span>
          <span className="font-mono text-slate-50">{visibleRate}%</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">缩放</span>
          <span className="font-mono text-slate-50">{zoom.toFixed(2)}x</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-slate-300">图片纹理</span>
          <span className="font-mono text-slate-50">{gpuStats.imageTextures}</span>
        </div>
        {onSyncLog ? (
          <div className="mt-2 flex justify-end pointer-events-auto">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={handleSyncLog}
            >
              同步日志
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
