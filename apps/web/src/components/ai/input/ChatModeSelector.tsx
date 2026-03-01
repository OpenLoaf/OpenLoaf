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
    <div
      className={cn(
        "relative flex h-8 cursor-pointer items-center rounded-full border border-border/60 bg-muted/60 p-0.5",
        compact ? "w-[68px]" : "w-[160px]",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      role="radiogroup"
      aria-label="聊天模式"
    >
      {/* Sliding indicator pill */}
      <span
        className={cn(
          "absolute top-[3px] bottom-[3px] w-[calc(50%-3px)] rounded-full transition-all duration-200",
          isAgent
            ? "left-[3px] bg-violet-500/15 dark:bg-violet-500/20"
            : "left-[50%] bg-amber-500/15 dark:bg-amber-500/20",
        )}
      />

      {/* Agent segment */}
      <button
        type="button"
        role="radio"
        aria-checked={isAgent}
        className={cn(
          "relative z-10 flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
          isAgent
            ? "text-violet-600 dark:text-violet-300"
            : "text-muted-foreground",
        )}
        onClick={() => {
          if (!disabled) onChange("agent")
        }}
        tabIndex={isAgent ? 0 : -1}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span>Agent</span>}
      </button>

      {/* CLI segment */}
      <button
        type="button"
        role="radio"
        aria-checked={!isAgent}
        className={cn(
          "relative z-10 flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors",
          !isAgent
            ? "text-amber-600 dark:text-amber-300"
            : "text-muted-foreground",
        )}
        onClick={() => {
          if (!disabled) onChange("cli")
        }}
        tabIndex={!isAgent ? 0 : -1}
      >
        <Terminal className="h-3.5 w-3.5 shrink-0" />
        {!compact && <span>CLI</span>}
      </button>
    </div>
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
