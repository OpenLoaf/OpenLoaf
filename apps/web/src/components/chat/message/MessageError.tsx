"use client";

interface MessageErrorProps {
  error: Error;
  canRetry?: boolean;
}

import { motion, useReducedMotion } from "motion/react";
import { useChatContext } from "../ChatProvider";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function MessageError({ error }: MessageErrorProps) {
  const reduceMotion = useReducedMotion();
  const { regenerate, clearError, status } = useChatContext();

  const handleRetry = () => {
    clearError();
    regenerate();
  };

  const isBusy = status !== "ready";

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
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/20"
            onClick={handleRetry}
            disabled={isBusy}
            aria-label="重试"
            title="重试"
          >
            <RotateCcw className="size-3 mr-1" />
            重试
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
