"use client";

import { motion, useReducedMotion } from "motion/react";

export default function MessageThinking() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key="message-thinking"
      layout
      className="flex justify-start overflow-hidden"
      initial={reduceMotion ? false : { opacity: 0, y: 6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={reduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, y: -6, height: 0 }}
      transition={{
        duration: 0.18,
        ease: "easeOut",
      }}
    >
      <div className="max-w-[80%] px-3 py-2 rounded-lg bg-secondary text-secondary-foreground">
        <div className="flex items-center gap-2 leading-4">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse delay-150" />
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse delay-300" />
          <span className="text-xs text-muted-foreground">正在思考…</span>
        </div>
      </div>
    </motion.div>
  );
}
