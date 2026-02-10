"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Send, Sparkles } from "lucide-react";
import { useOnClickOutside } from "usehooks-ts";

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
  /** Expanded width in pixels. */
  expandedWidth?: number;
  /** Input placeholder text. */
  inputPlaceholder?: string;
  /** Send action callback. */
  onSend?: (value: string) => void;
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
  expandedWidth = 360,
  inputPlaceholder = "输入内容",
  onSend,
  onChange,
  selectedIndex,
  defaultSelectedIndex = 0,
  getTooltip,
}: ExpandableDockTabsProps) {
  const [uncontrolledSelected, setUncontrolledSelected] = useState<number | null>(
    defaultSelectedIndex
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [collapsedWidth, setCollapsedWidth] = useState<number | null>(null);
  const isControlled = selectedIndex !== undefined;
  const selected = isControlled ? selectedIndex : uncontrolledSelected;
  const sizeToken = sizeConfig[size];

  // 中文注释：使用隐藏容器测量折叠态真实宽度，避免宽度回弹。
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const width = measureRef.current.offsetWidth;
    if (width > 0 && width !== collapsedWidth) {
      setCollapsedWidth(width);
    }
  }, [collapsedWidth, selected, size, tabs]);

  // 中文注释：展开态点击外部，自动收起并恢复 tabs。
  useOnClickOutside(dockRef as RefObject<HTMLElement>, () => {
    if (!isExpanded) return;
    setIsExpanded(false);
    setInputValue("");
  });

  // 中文注释：展开后自动聚焦输入框，确保可直接输入。
  useEffect(() => {
    if (!isExpanded) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isExpanded]);

  /** Handle tab selection. */
  const handleSelect = (index: number) => {
    if (!isControlled) {
      setUncontrolledSelected(index);
    }
    onChange?.(index);
  };

  /** Toggle expanded input state. */
  const handleToggleExpand = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (!next) {
        setInputValue("");
      }
      return next;
    });
    setHoveredIndex(null);
  };

  /** Send the current input value. */
  const handleSend = () => {
    const value = inputValue.trim();
    if (!value) return;
    onSend?.(value);
    setInputValue("");
  };

  const widthAnimation =
    collapsedWidth !== null ? { width: isExpanded ? expandedWidth : collapsedWidth } : {};
  const containerTransition: Transition = {
    opacity: { duration: 0.22, ease: "easeOut" },
    y: { duration: 0.22, ease: "easeOut" },
    width: { duration: 0.18, ease: "easeOut" },
  };
  const tabWidthTransition: Transition = { duration: 0.18, ease: "easeOut" };

  return (
    <>
      <div
        ref={measureRef}
        className={cn(
          "pointer-events-none invisible absolute -z-10 flex items-center rounded-3xl border border-transparent",
          sizeToken.container,
          "gap-1"
        )}
      >
        <div style={{ height: sizeToken.height, width: sizeToken.height }} />
        <div className="mx-0.5 h-4 w-px bg-transparent" />
        {tabs.map((tab, index) => {
          const isActive = selected === index;
          const width = isActive ? sizeToken.activeWidth : sizeToken.inactiveWidth;
          return (
            <div
              key={tab.id}
              style={{ height: sizeToken.height, width }}
              className="rounded-full"
            />
          );
        })}
      </div>
      <motion.div
      ref={dockRef}
      className={cn(
        "absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center overflow-visible rounded-3xl border border-border/60 bg-background/90 text-secondary-foreground shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur",
        sizeToken.container,
        "gap-1",
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, ...widthAnimation }}
      transition={containerTransition}
    >
      <motion.button
        type="button"
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ height: sizeToken.height, width: sizeToken.height }}
        whileHover={{ scale: 1.05, rotate: 8 }}
        transition={{ type: "spring", stiffness: 360, damping: 24 }}
        onClick={handleToggleExpand}
        aria-label="Sparkles"
      >
        <Sparkles
          size={sizeToken.icon}
          className="text-amber-500"
          fill="currentColor"
        />
      </motion.button>
      <motion.div
        className="mx-0.5 h-4 w-px bg-border/70"
        aria-hidden="true"
        initial={false}
        animate={{
          opacity: isExpanded ? 0 : 1,
          scaleY: isExpanded ? 0 : 1,
          y: isExpanded ? 10 : 0,
        }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{ transformOrigin: "center" }}
      />
      <div className="relative flex-1 min-w-0" style={{ height: sizeToken.height }}>
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key="dock-input"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <motion.input
                ref={inputRef}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSend();
                  }
                  if (event.key === "Escape") {
                    handleToggleExpand();
                  }
                }}
                placeholder={inputPlaceholder}
                className={cn(
                  "h-full w-full bg-transparent outline-none",
                  sizeToken.text,
                  "text-foreground placeholder:text-muted-foreground/70"
                )}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.16, ease: "easeOut" } }}
                transition={{ duration: 0.22, ease: "easeOut", delay: 0.1 }}
                style={{
                  height: sizeToken.height,
                  paddingRight: sizeToken.height + 8,
                  paddingLeft: 0,
                }}
              />
              <motion.button
                type="button"
                className="absolute right-0 top-1/2 flex items-center justify-center rounded-full bg-muted/70 text-foreground -translate-y-1/2"
                style={{ height: sizeToken.height, width: sizeToken.height }}
                onClick={handleSend}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 360, damping: 24 }}
                aria-label="Send"
                disabled={!inputValue.trim()}
              >
                <Send size={sizeToken.icon} />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="dock-tabs"
              className="absolute inset-0 flex items-center gap-0.5"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {tabs.map((tab, index) => {
                const isActive = selected === index;
                const isHovered = hoveredIndex === index;
                const Icon = tab.icon;
                const tone = tab.tone ? toneConfig[tab.tone] : null;
                const activeBg = tone?.activeBg ?? "bg-primary/10";
                const activeText = tone?.activeText ?? "text-foreground";
                const inactiveText = tone?.inactiveText ?? "text-muted-foreground";
                const colorClass = isActive ? activeBg : "bg-muted/70";
                const textClass = isActive ? activeText : inactiveText;
                const iconScale = isHovered ? (isActive ? 1.05 : 1) : isActive ? 1 : 0.96;
                const iconRotate = isHovered ? (isActive ? 4 : 8) : 0;

                const button = (
                  <motion.button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "relative flex items-center justify-center rounded-full",
                      colorClass
                    )}
                    style={{ height: sizeToken.height }}
                    onClick={() => handleSelect(index)}
                    onHoverStart={() => setHoveredIndex(index)}
                    onHoverEnd={() => setHoveredIndex(null)}
                    initial={false}
                    animate={{
                      width: isActive ? sizeToken.activeWidth : sizeToken.inactiveWidth,
                    }}
                    transition={tabWidthTransition}
                  >
                    <motion.div
                      className="relative z-10 flex items-center justify-center h-full"
                      initial={false}
                    >
                      <motion.span
                        className="flex items-center justify-center"
                        initial={false}
                        animate={{ scale: iconScale, rotate: iconRotate }}
                        transition={{ type: "spring", stiffness: 360, damping: 24 }}
                      >
                        <Icon size={sizeToken.icon} className={textClass} />
                      </motion.span>
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.span
                            className={cn(
                              "overflow-hidden whitespace-nowrap font-medium max-sm:hidden",
                              sizeToken.text,
                              textClass
                            )}
                            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                            animate={{ opacity: 1, width: "auto", marginLeft: 8 }}
                            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
}
