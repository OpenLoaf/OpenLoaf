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

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { motion } from "motion/react"
import { MessageAction } from "@/components/ai-elements/message"

export interface ChatSessionBarItemProps {
  sessionId: string
  title: string
  index?: number
  showIndex?: boolean
  onSelect: () => void
  onRemove: () => void
  isStreaming?: boolean
  hasUnread?: boolean
  className?: string
}

export function ChatSessionBarItem({
  sessionId,
  title,
  index,
  showIndex,
  onSelect,
  onRemove,
  isStreaming,
  hasUnread,
  className,
}: ChatSessionBarItemProps) {
  const displayTitle = title.trim() || "新对话"
  const displayIndex = typeof index === "number" ? index + 1 : null

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove()
  }

  return (
    <motion.div
      layout
      layoutId={`session-bar-${sessionId}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.15 },
        y: { duration: 0.15 },
      }}
      className={cn(
        "group flex shrink-0 w-full min-w-0 items-center justify-between",
        "h-8 px-2 cursor-pointer",
        "bg-muted/50 hover:bg-muted transition-colors",
        isStreaming && "openloaf-thinking-border openloaf-thinking-border-on",
        className
      )}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1 flex items-center gap-1">
        {showIndex && displayIndex !== null ? (
          <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
            #{displayIndex}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          {displayTitle}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <MessageAction
          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleRemove}
          aria-label="移除会话"
          tooltip="移除会话"
          label="移除会话"
        >
          <X size={14} />
        </MessageAction>
        {hasUnread && (
          <span
            className={cn(
              "relative block h-2.5 w-2.5 rounded-full",
              "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]"
            )}
            aria-hidden="true"
          >
            <span className="absolute inset-[1px] rounded-full bg-amber-400/70" />
          </span>
        )}
      </div>
    </motion.div>
  )
}
