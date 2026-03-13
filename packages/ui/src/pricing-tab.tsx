"use client"

import * as React from "react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const TAB_COLORS = {
  sky: {
    text: "text-ol-blue",
    bg: "bg-ol-blue-bg",
  },
  amber: {
    text: "text-ol-amber",
    bg: "bg-ol-amber-bg",
  },
  violet: {
    text: "text-ol-purple",
    bg: "bg-ol-purple-bg",
  },
  emerald: {
    text: "text-ol-green",
    bg: "bg-ol-green-bg",
  },
  rose: {
    text: "text-ol-red",
    bg: "bg-ol-red-bg",
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
          className={cn("absolute inset-0.5 z-0 rounded-full", palette.bg)}
        />
      )}
    </button>
  )
}
