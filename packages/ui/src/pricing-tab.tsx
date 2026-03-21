"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const TAB_COLORS = {
  sky: {
    text: "text-foreground",
    bg: "bg-secondary",
  },
  amber: {
    text: "text-foreground",
    bg: "bg-secondary",
  },
  violet: {
    text: "text-foreground",
    bg: "bg-secondary",
  },
  emerald: {
    text: "text-foreground",
    bg: "bg-secondary",
  },
  rose: {
    text: "text-destructive",
    bg: "bg-destructive/10",
  },
} as const

type TabColor = keyof typeof TAB_COLORS

interface TabProps {
  text: string
  selected: boolean
  setSelected: (text: string) => void
  color?: TabColor
  layoutId?: string
  className?: string
  children?: React.ReactNode
}

export function Tab({
  text,
  selected,
  setSelected,
  color = "sky",
  layoutId = "tab",
  className,
  children,
}: TabProps) {
  const palette = TAB_COLORS[color]

  return (
    <button
      type="button"
      onClick={() => setSelected(text)}
      className={cn(
        "relative flex-1 px-3 py-2 text-xs font-medium transition-colors duration-150 cursor-pointer",
        selected
          ? palette.text
          : "text-sidebar-foreground/50 hover:text-sidebar-foreground/70",
        className,
      )}
    >
      <span className="relative z-10 flex items-center justify-center gap-1.5">{children ?? text}</span>
      {selected && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
          className={cn("absolute inset-0.5 z-0 rounded-3xl", palette.bg)}
        />
      )}
    </button>
  )
}
