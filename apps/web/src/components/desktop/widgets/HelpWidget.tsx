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
import {
  Sparkles,
  MessageSquareText,
  PanelBottom,
  Search,
  CalendarDays,
  Mail,
  KanbanSquare,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { toast } from "sonner"
import { useTabs } from "@/hooks/use-tabs"
import { useTabRuntime } from "@/hooks/use-tab-runtime"
import { useGlobalOverlay } from "@/lib/globalShortcuts"
import { cn } from "@/lib/utils"

type HelpAction =
  | "open-ai-chat"
  | "open-search"
  | "open-calendar"
  | "open-email"
  | "open-tasks"

interface HelpPage {
  title: string
  description: string
  icon: React.ElementType
  /** Tailwind classes for icon background and text color (light + dark). */
  iconColorClass: string
  /** Double-click action to trigger. */
  action?: HelpAction
}

const HELP_PAGES: HelpPage[] = [
  {
    title: "欢迎使用 OpenLoaf",
    description: "AI 生产力工作台，助你高效工作",
    icon: Sparkles,
    iconColorClass:
      "bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-900/50 dark:text-sky-200",
  },
  {
    title: "AI 智能对话",
    description:
      "按空格键快速唤起 AI，也可用 Cmd+B 打开对话面板或 Cmd+T 打开独立工作台",
    icon: MessageSquareText,
    iconColorClass:
      "bg-[#f3e8fd] text-[#9334e6] dark:bg-violet-900/40 dark:text-violet-300",
    action: "open-ai-chat",
  },
  {
    title: "底部导航栏",
    description:
      "底部 Dock 可快速切换工作台、日历、邮箱、任务四大功能，按 Alt+1~4 快捷切换",
    icon: PanelBottom,
    iconColorClass:
      "bg-[#e0f2fe] text-[#0284c7] dark:bg-cyan-900/40 dark:text-cyan-300",
  },
  {
    title: "全局搜索",
    description: "Cmd+F 搜索文件、邮件、任务等所有内容",
    icon: Search,
    iconColorClass:
      "bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-900/50 dark:text-sky-200",
    action: "open-search",
  },
  {
    title: "日历管理",
    description: "日/周/月/年多视图，Cmd+L 快速打开",
    icon: CalendarDays,
    iconColorClass:
      "bg-[#e6f4ea] text-[#188038] dark:bg-emerald-900/40 dark:text-emerald-300",
    action: "open-calendar",
  },
  {
    title: "邮件收发",
    description: "添加邮箱帐号，在 OpenLoaf 中收发邮件",
    icon: Mail,
    iconColorClass:
      "bg-[#fef7e0] text-[#e37400] dark:bg-amber-900/40 dark:text-amber-300",
    action: "open-email",
  },
  {
    title: "任务看板",
    description: "看板视图管理任务，支持状态追踪和定时任务",
    icon: KanbanSquare,
    iconColorClass:
      "bg-[#fef7e0] text-[#e37400] dark:bg-amber-900/40 dark:text-amber-300",
    action: "open-tasks",
  },
  {
    title: "个性化桌面",
    description:
      "右键进入编辑模式，拖拽调整组件布局，打造你的专属工作台",
    icon: LayoutGrid,
    iconColorClass:
      "bg-[#f3e8fd] text-[#9334e6] dark:bg-violet-900/40 dark:text-violet-300",
  },
]

/** Execute a help action by dispatching to the appropriate store or overlay. */
function executeHelpAction(action: HelpAction, activeTabId: string | null) {
  if (action === "open-search") {
    useGlobalOverlay.getState().setSearchOpen(true)
    return
  }

  if (action === "open-ai-chat") {
    if (!activeTabId) {
      toast.error("未找到当前标签页")
      return
    }
    const runtime = useTabRuntime.getState().runtimeByTabId[activeTabId]
    if (!runtime) {
      toast.error("当前标签页无运行时上下文")
      return
    }
    if (runtime.rightChatCollapsed) {
      useTabRuntime.getState().setTabRightChatCollapsed(activeTabId, false)
    }
    const requestFocus = () => {
      window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"))
    }
    if (runtime.rightChatCollapsed) {
      setTimeout(requestFocus, 180)
      setTimeout(requestFocus, 360)
      return
    }
    requestFocus()
    return
  }

  if (!activeTabId) {
    toast.error("未找到当前标签页")
    return
  }

  const componentMap: Record<string, { component: string; title: string }> = {
    "open-calendar": { component: "calendar", title: "日历" },
    "open-email": { component: "email", title: "邮箱" },
    "open-tasks": { component: "task-board", title: "任务" },
  }
  const target = componentMap[action]
  if (target) {
    useTabRuntime.getState().pushStackItem(activeTabId, {
      id: target.component,
      sourceKey: target.component,
      component: target.component,
      title: target.title,
    })
  }
}

const AUTOPLAY_INTERVAL = 8000
const AUTOPLAY_RESUME_DELAY = 15000

/** Help carousel widget for onboarding new users. */
export default function HelpWidget() {
  const [current, setCurrent] = React.useState(0)
  const [isHovered, setIsHovered] = React.useState(false)
  const pausedUntilRef = React.useRef(0)
  const activeTabId = useTabs((state) => state.activeTabId)
  const total = HELP_PAGES.length

  // Autoplay: advance every 8s, pause on hover or after manual interaction.
  React.useEffect(() => {
    if (isHovered) return

    const timer = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return
      setCurrent((prev) => (prev + 1) % total)
    }, AUTOPLAY_INTERVAL)

    return () => clearInterval(timer)
  }, [isHovered, total])

  const pauseAutoplay = React.useCallback(() => {
    pausedUntilRef.current = Date.now() + AUTOPLAY_RESUME_DELAY
  }, [])

  const goTo = React.useCallback(
    (index: number) => {
      setCurrent(index)
      pauseAutoplay()
    },
    [pauseAutoplay],
  )

  const goPrev = React.useCallback(() => {
    setCurrent((prev) => (prev - 1 + total) % total)
    pauseAutoplay()
  }, [total, pauseAutoplay])

  const goNext = React.useCallback(() => {
    setCurrent((prev) => (prev + 1) % total)
    pauseAutoplay()
  }, [total, pauseAutoplay])

  const handleAction = React.useCallback(
    (action: HelpAction) => {
      executeHelpAction(action, activeTabId)
    },
    [activeTabId],
  )

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Carousel track */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {HELP_PAGES.map((page, index) => (
            <HelpSlide
              key={page.title}
              page={page}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        type="button"
        className="absolute top-1/2 left-1.5 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
        onClick={goPrev}
        aria-label="上一页"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className="absolute top-1/2 right-1.5 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
        onClick={goNext}
        aria-label="下一页"
      >
        <ChevronRight className="size-3.5" />
      </button>

      {/* Dot navigation */}
      <div className="flex shrink-0 items-center justify-center gap-1 pb-2 pt-1">
        {HELP_PAGES.map((page, index) => (
          <button
            key={page.title}
            type="button"
            className={cn(
              "size-1.5 rounded-full transition-all duration-200",
              index === current
                ? "w-4 bg-foreground/70"
                : "bg-foreground/20 hover:bg-foreground/40",
            )}
            onClick={() => goTo(index)}
            aria-label={`第 ${index + 1} 页`}
          />
        ))}
      </div>
    </div>
  )
}

/** Single carousel slide. Click on the content area to trigger the action (if any). */
function HelpSlide({
  page,
  onAction,
}: {
  page: HelpPage
  onAction: (action: HelpAction) => void
}) {
  const Icon = page.icon
  const handleClick = page.action
    ? () => onAction(page.action!)
    : undefined
  return (
    <div className="flex h-full w-full shrink-0 items-center justify-center px-6">
      <div
        className={cn(
          "flex flex-col items-center gap-2",
          page.action &&
            "cursor-pointer rounded-xl px-5 py-3 transition-colors duration-150 hover:bg-accent/60",
        )}
        onClick={handleClick}
      >
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            page.iconColorClass,
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="text-center text-sm font-medium">{page.title}</div>
        <div className="max-w-[380px] text-center text-xs leading-relaxed text-muted-foreground">
          {page.description}
        </div>
      </div>
    </div>
  )
}
