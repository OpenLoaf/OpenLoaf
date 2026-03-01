/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { AnimatePresence, motion } from "motion/react"
import { Bot, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip"

export type ChatMode = "agent" | "cli"

interface ChatModeSelectorProps {
  value: ChatMode
  onChange: (value: ChatMode) => void
  disabled?: boolean
  /** Show only icons without text labels. */
  compact?: boolean
  className?: string
}

/** Segmented control for switching between Agent and CLI chat modes. */
export default function ChatModeSelector({
  value,
  onChange,
  disabled,
  compact = false,
  className,
}: ChatModeSelectorProps) {
  const isAgent = value === "agent"

  const control = (
    <motion.div
      className={cn(
        "relative flex h-8 cursor-pointer items-center rounded-full border border-border/60 bg-muted/60 p-0.5",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      animate={{ width: compact ? 68 : 160 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      role="radiogroup"
      aria-label="聊天模式"
    >
      {/* Sliding indicator pill */}
      <motion.span
        className="absolute top-[3px] bottom-[3px] rounded-full"
        animate={{
          left: isAgent ? 3 : "50%",
          width: "calc(50% - 3px)",
        }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        style={{
          backgroundColor: isAgent
            ? "rgba(139, 92, 246, 0.15)"
            : "rgba(245, 158, 11, 0.15)",
        }}
      />

      {/* Agent segment */}
      <button
        type="button"
        role="radio"
        aria-checked={isAgent}
        className={cn(
          "relative z-10 flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors duration-200",
          isAgent
            ? "text-violet-600 dark:text-violet-300"
            : "text-muted-foreground",
        )}
        onClick={() => {
          if (!disabled) onChange("agent")
        }}
        tabIndex={isAgent ? 0 : -1}
      >
        <motion.span
          className="flex shrink-0"
          animate={{ scale: isAgent ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Bot className="h-3.5 w-3.5" />
        </motion.span>
        <AnimatePresence mode="popLayout">
          {!compact && (
            <motion.span
              key="agent-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              Agent
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* CLI segment */}
      <button
        type="button"
        role="radio"
        aria-checked={!isAgent}
        className={cn(
          "relative z-10 flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors duration-200",
          !isAgent
            ? "text-amber-600 dark:text-amber-300"
            : "text-muted-foreground",
        )}
        onClick={() => {
          if (!disabled) onChange("cli")
        }}
        tabIndex={!isAgent ? 0 : -1}
      >
        <motion.span
          className="flex shrink-0"
          animate={{ scale: !isAgent ? 1.1 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Terminal className="h-3.5 w-3.5" />
        </motion.span>
        <AnimatePresence mode="popLayout">
          {!compact && (
            <motion.span
              key="cli-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              CLI
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  )

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {control}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isAgent ? "Agent 模式" : "CLI 模式"}
        </TooltipContent>
      </Tooltip>
    )
  }

  return control
}
