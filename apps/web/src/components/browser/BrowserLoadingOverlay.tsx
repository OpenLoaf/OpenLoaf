"use client";

import { AnimatePresence, motion } from "motion/react";

export function BrowserLoadingOverlay({
  visible,
  text = "Loading…",
}: {
  visible: boolean;
  text?: string;
}) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-10 grid place-items-center bg-background/70"
        >
          <div className="flex flex-col items-center gap-5">
            <motion.div
              // 中文注释：动画参考 apps/electron/src/renderer/loading.html
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              className="h-10 w-10 rounded-full border-[3px] border-foreground/10 border-t-foreground"
            />
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: [0.4, 0, 0.6, 1],
              }}
              className="text-sm font-medium tracking-[0.5px] text-muted-foreground"
            >
              {text}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

