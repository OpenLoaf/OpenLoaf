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

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
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
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
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
