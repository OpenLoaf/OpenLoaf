"use client";

import { motion } from "motion/react";

interface MessageErrorProps {
  error: Error;
  reduceMotion: boolean | null;
}

export default function MessageError({ error, reduceMotion }: MessageErrorProps) {
  return (
    <motion.div
      key="message-error"
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
      <div className="max-w-[80%] p-3 rounded-lg bg-destructive/10 text-destructive">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">出错了</span>
        </div>
        <p className="text-xs mt-1">{error.message}</p>
      </div>
    </motion.div>
  );
}
