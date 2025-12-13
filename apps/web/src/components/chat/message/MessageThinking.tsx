"use client";

import { motion, useReducedMotion } from "motion/react";

export default function MessageThinking() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key="message-thinking"
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{
        duration: 0.16,
        ease: "easeOut",
      }}
      className="flex justify-start"
    >
      <div className="max-w-[80%] p-3 rounded-lg bg-secondary text-secondary-foreground">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-150"></div>
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-300"></div>
          <span className="text-xs text-muted-foreground">正在思考...</span>
        </div>
      </div>
    </motion.div>
  );
}
