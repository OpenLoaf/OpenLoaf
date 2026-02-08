"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { Button } from "@tenas-ai/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip"
import { motion } from "motion/react"

export interface ChatSessionBarItemProps {
  sessionId: string
  title: string
  onSelect: () => void
  onRemove: () => void
  className?: string
}

export function ChatSessionBarItem({
  sessionId,
  title,
  onSelect,
  onRemove,
  className,
}: ChatSessionBarItemProps) {
  const displayTitle = title.trim() || "新对话"

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
        className
      )}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        {displayTitle}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemove}
            aria-label="移除会话"
          >
            <X size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          移除会话
        </TooltipContent>
      </Tooltip>
    </motion.div>
  )
}
