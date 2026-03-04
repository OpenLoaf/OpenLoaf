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

import { motion } from "framer-motion";

/**
 * 浮动路径动画组件
 * @param position - 路径位置偏移（1 或 -1），用于创建对称的双向动画效果
 *
 * 动画参数说明：
 * - length: 28 - 路径数量（线条数量）
 * - y 坐标基准值：-239, 166, 293, 420, 825 - 控制路径垂直位置（数值越小越靠上）
 * - width: 0.5 + i * 0.04 - 线条粗细（从 0.5 到 1.58 渐变）
 * - strokeOpacity: 0.15 + path.id * 0.05 - 透明度（从 0.15 到 1.5 渐变）
 * - duration: 5 + Math.random() * 3 - 动画周期（5-8 秒）
 * - pathOffset: [1, 0, 1] - 反向播放（从终点到起点再回到终点）
 */
function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${239 + i * 6}C-${
      380 - i * 5 * position
    } -${239 + i * 6} -${312 - i * 5 * position} ${166 - i * 6} ${
      152 - i * 5 * position
    } ${293 - i * 6}C${616 - i * 5 * position} ${420 - i * 6} ${
      684 - i * 5 * position
    } ${825 - i * 6} ${684 - i * 5 * position} ${825 - i * 6}`,
    width: 0.5 + i * 0.04,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full text-slate-950 dark:text-white"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.15 + path.id * 0.05}
            initial={{ pathLength: 1, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.4, 0.7, 0.4],
              pathOffset: [1, 0, 1],
            }}
            transition={{
              duration: 5 + Math.random() * 3,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="relative h-svh w-full flex items-center justify-center pb-40 overflow-hidden bg-white dark:bg-neutral-950">
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <style>{`
        @keyframes shimmer {
          0%, 100% { background-position: 100% center; }
          50% { background-position: 0% center; }
        }
      `}</style>

      <div className="relative z-10 text-center">
        <h1
          className="text-5xl sm:text-7xl font-bold tracking-widest text-transparent bg-clip-text bg-[length:200%_100%] bg-[linear-gradient(90deg,theme(colors.neutral.800)_40%,theme(colors.neutral.400)_50%,theme(colors.neutral.800)_60%)] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.9)_40%,rgba(255,255,255,0.4)_50%,rgba(255,255,255,0.9)_60%)] [animation:shimmer_6s_ease-in-out_infinite]"
        >
          OpenLoaf
        </h1>
      </div>
    </div>
  );
}
