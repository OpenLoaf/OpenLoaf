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
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { useLayoutState } from "@/hooks/use-layout-state"
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

/** Build help pages array from translation function. */
function getHelpPages(t: TFunction): HelpPage[] {
  return [
    {
      title: t('desktop:help.pages.welcome.title'),
      description: t('desktop:help.pages.welcome.description'),
      icon: Sparkles,
      iconColorClass: "bg-ol-blue-bg text-ol-blue",
    },
    {
      title: t('desktop:help.pages.aiChat.title'),
      description: t('desktop:help.pages.aiChat.description'),
      icon: MessageSquareText,
      iconColorClass: "bg-ol-purple-bg text-ol-purple",
      action: "open-ai-chat",
    },
    {
      title: t('desktop:help.pages.dock.title'),
      description: t('desktop:help.pages.dock.description'),
      icon: PanelBottom,
      iconColorClass: "bg-ol-blue-bg text-ol-blue",
    },
    {
      title: t('desktop:help.pages.search.title'),
      description: t('desktop:help.pages.search.description'),
      icon: Search,
      iconColorClass: "bg-ol-blue-bg text-ol-blue",
      action: "open-search",
    },
    {
      title: t('desktop:help.pages.calendar.title'),
      description: t('desktop:help.pages.calendar.description'),
      icon: CalendarDays,
      iconColorClass: "bg-ol-green-bg text-ol-green",
      action: "open-calendar",
    },
    {
      title: t('desktop:help.pages.email.title'),
      description: t('desktop:help.pages.email.description'),
      icon: Mail,
      iconColorClass: "bg-ol-amber-bg text-ol-amber",
      action: "open-email",
    },
    {
      title: t('desktop:help.pages.tasks.title'),
      description: t('desktop:help.pages.tasks.description'),
      icon: KanbanSquare,
      iconColorClass: "bg-ol-amber-bg text-ol-amber",
      action: "open-tasks",
    },
    {
      title: t('desktop:help.pages.desktop.title'),
      description: t('desktop:help.pages.desktop.description'),
      icon: LayoutGrid,
      iconColorClass: "bg-ol-purple-bg text-ol-purple",
    },
  ]
}

/** Execute a help action by dispatching to the appropriate store or overlay. */
function executeHelpAction(action: HelpAction, t: TFunction) {
  if (action === "open-search") {
    useGlobalOverlay.getState().setSearchOpen(true)
    return
  }

  if (action === "open-ai-chat") {
    const layoutState = useLayoutState.getState()
    if (layoutState.rightChatCollapsed) {
      useLayoutState.getState().setRightChatCollapsed(false)
    }
    const requestFocus = () => {
      window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input"))
    }
    if (layoutState.rightChatCollapsed) {
      setTimeout(requestFocus, 180)
      setTimeout(requestFocus, 360)
      return
    }
    requestFocus()
    return
  }

  const componentMap: Record<string, { id: string; component: string; title: string }> = {
    "open-calendar": { id: "calendar-page", component: "calendar-page", title: t('desktop:help.actions.calendar') },
    "open-email": { id: "email-page", component: "email-page", title: t('desktop:help.actions.email') },
    "open-tasks": { id: "scheduled-tasks-page", component: "scheduled-tasks-page", title: t('desktop:help.actions.tasks') },
  }
  const target = componentMap[action]
  if (target) {
    useLayoutState.getState().pushStackItem({
      id: target.id,
      sourceKey: target.id,
      component: target.component,
      title: target.title,
    })
  }
}

const AUTOPLAY_INTERVAL = 8000
const AUTOPLAY_RESUME_DELAY = 15000

/** Help carousel widget for onboarding new users. */
export default function HelpWidget() {
  const { t } = useTranslation('desktop')
  const [current, setCurrent] = React.useState(0)
  const [isHovered, setIsHovered] = React.useState(false)
  const pausedUntilRef = React.useRef(0)
  const helpPages = React.useMemo(() => getHelpPages(t), [t])
  const total = helpPages.length

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
      executeHelpAction(action, t)
    },
    [t],
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
          {helpPages.map((page, index) => (
            <HelpSlide
              key={index}
              page={page}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        type="button"
        className="absolute top-1/2 left-1.5 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
        onClick={goPrev}
        aria-label={t('help.prevPage')}
      >
        <ChevronLeft className="size-4.5" />
      </button>
      <button
        type="button"
        className="absolute top-1/2 right-1.5 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-foreground group-hover:opacity-100 [div:hover>&]:opacity-100"
        onClick={goNext}
        aria-label={t('help.nextPage')}
      >
        <ChevronRight className="size-4.5" />
      </button>

      {/* Dot navigation */}
      <div className="flex shrink-0 items-center justify-center gap-1 pb-2 pt-1">
        {helpPages.map((page, index) => (
          <button
            key={index}
            type="button"
            className={cn(
              "size-1.5 rounded-full transition-all duration-200",
              index === current
                ? "w-4 bg-foreground/70"
                : "bg-foreground/20 hover:bg-foreground/40",
            )}
            onClick={() => goTo(index)}
            aria-label={t('help.pageN', { n: index + 1 })}
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
