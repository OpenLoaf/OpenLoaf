"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";

export type DockTabItem = {
  /** Tab id. */
  id: string;
  /** Tab icon. */
  icon: LucideIcon;
  /** Tab label. */
  label: string;
  /** Tab color tone. */
  tone?: "sky" | "emerald" | "amber" | "violet" | "slate";
};

type ExpandableDockTabsProps = {
  /** Tabs data. */
  tabs: DockTabItem[];
  /** Extra container classes. */
  className?: string;
  /** Tabs size. */
  size?: "sm" | "md" | "lg";
  /** Selection change callback. */
  onChange?: (index: number | null) => void;
  /** Controlled selected index. */
  selectedIndex?: number | null;
  /** Default selected index for uncontrolled mode. */
  defaultSelectedIndex?: number | null;
  /** Tooltip content renderer for tabs. */
  getTooltip?: (tab: DockTabItem, index: number) => ReactNode;
};

const sizeConfig = {
  sm: {
    container: "gap-1.5 p-[5px]",
    height: 34,
    activeWidth: 104,
    inactiveWidth: 35,
    icon: 15,
    text: "text-[11px]",
  },
  md: {
    container: "gap-1.5 p-[7px]",
    height: 37,
    activeWidth: 116,
    inactiveWidth: 39,
    icon: 17,
    text: "text-[13px]",
  },
  lg: {
    container: "gap-1.5 p-[9px]",
    height: 40,
    activeWidth: 129,
    inactiveWidth: 42,
    icon: 19,
    text: "text-[14px]",
  },
} as const;

const toneConfig = {
  sky: {
    activeBg: "bg-sky-500/15 dark:bg-sky-400/20",
    activeText: "text-sky-700 dark:text-sky-200",
    inactiveText: "text-sky-700/70 dark:text-sky-200/70",
  },
  emerald: {
    activeBg: "bg-emerald-500/15 dark:bg-emerald-400/20",
    activeText: "text-emerald-700 dark:text-emerald-200",
    inactiveText: "text-emerald-700/70 dark:text-emerald-200/70",
  },
  amber: {
    activeBg: "bg-amber-500/15 dark:bg-amber-400/20",
    activeText: "text-amber-700 dark:text-amber-200",
    inactiveText: "text-amber-700/70 dark:text-amber-200/70",
  },
  violet: {
    activeBg: "bg-violet-500/15 dark:bg-violet-400/20",
    activeText: "text-violet-700 dark:text-violet-200",
    inactiveText: "text-violet-700/70 dark:text-violet-200/70",
  },
  slate: {
    activeBg: "bg-slate-500/15 dark:bg-slate-400/20",
    activeText: "text-slate-700 dark:text-slate-200",
    inactiveText: "text-slate-600/70 dark:text-slate-300/70",
  },
} as const;

export function ExpandableDockTabs({
  tabs,
  className,
  size = "sm",
  onChange,
  selectedIndex,
  defaultSelectedIndex = 0,
  getTooltip,
}: ExpandableDockTabsProps) {
  const [uncontrolledSelected, setUncontrolledSelected] = useState<number | null>(
    defaultSelectedIndex
  );
  const isControlled = selectedIndex !== undefined;
  const selected = isControlled ? selectedIndex : uncontrolledSelected;
  const sizeToken = sizeConfig[size];

  /** Handle tab selection. */
  const handleSelect = (index: number) => {
    if (!isControlled) {
      setUncontrolledSelected(index);
    }
    onChange?.(index);
  };

  return (
    <div
      className={cn(
        "flex items-center rounded-2xl border border-border/60 bg-background/90 text-secondary-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur",
        sizeToken.container,
        className
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = selected === index;
        const Icon = tab.icon;
        const tone = tab.tone ? toneConfig[tab.tone] : null;
        const activeBg = tone?.activeBg ?? "bg-primary/10";
        const activeText = tone?.activeText ?? "text-foreground";
        const inactiveText = tone?.inactiveText ?? "text-muted-foreground";
        const colorClass = isActive ? activeBg : "bg-muted/70";
        const textClass = isActive ? activeText : inactiveText;

        const button = (
          <motion.button
            key={tab.id}
            layout
            type="button"
            className={cn(
              "flex items-center justify-center rounded-full overflow-hidden",
              colorClass
            )}
            style={{ height: sizeToken.height }}
            onClick={() => handleSelect(index)}
            initial={false}
            animate={{
              width: isActive ? sizeToken.activeWidth : sizeToken.inactiveWidth,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
          >
            <motion.div
              className="flex items-center justify-center h-full"
              initial={{ filter: "blur(10px)" }}
              animate={{ filter: "blur(0px)" }}
              exit={{ filter: "blur(10px)" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Icon size={sizeToken.icon} className={textClass} />
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    className={cn(
                      "ml-2 font-medium max-sm:hidden",
                      sizeToken.text,
                      textClass
                    )}
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0.8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    style={{ originX: 0 }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.button>
        );

        const tooltipContent = getTooltip?.(tab, index);
        if (!tooltipContent) {
          return button;
        }

        return (
          <Tooltip key={tab.id}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
