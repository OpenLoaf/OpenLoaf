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

export function LoadingScreen() {
  return (
    <div className="relative h-svh w-full flex items-center justify-center pb-40 overflow-hidden bg-white dark:bg-neutral-950">
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
