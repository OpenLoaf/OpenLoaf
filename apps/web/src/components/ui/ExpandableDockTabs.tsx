"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { File, Globe, Layers, Send, Sparkles } from "lucide-react";
import { useOnClickOutside } from "usehooks-ts";

import { BROWSER_WINDOW_COMPONENT, type DockItem } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { getStackMinimizeSignal } from "@/lib/stack-dock-animation";
import { cn } from "@/lib/utils";
import { getPanelTitle } from "@/utils/panel-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";
import { getEntryVisual } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import type { FileSystemEntry } from "@/components/project/filesystem/utils/file-system-utils";

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
    sparklesWidth: 28,
    activeWidth: 104,
    inactiveWidth: 35,
    icon: 15,
    text: "text-[11px]",
  },
  md: {
    container: "gap-1.5 p-[7px]",
    height: 37,
    sparklesWidth: 30,
    activeWidth: 116,
    inactiveWidth: 39,
    icon: 17,
    text: "text-[13px]",
  },
  lg: {
    container: "gap-1.5 p-[9px]",
    height: 40,
    sparklesWidth: 34,
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

// 保持空数组引用稳定，避免 useSyncExternalStore 报错。
const EMPTY_STACK: DockItem[] = [];

const STACK_LIMIT_BY_SIZE = {
  sm: 3,
  md: 4,
  lg: 5,
} as const;

const FILE_VIEWER_COMPONENTS = new Set([
  "file-viewer",
  "image-viewer",
  "code-viewer",
  "markdown-viewer",
  "pdf-viewer",
  "doc-viewer",
  "sheet-viewer",
  "video-viewer",
]);
const BOARD_VIEWER_COMPONENT = "board-viewer";

/** Resolve stack item title. */
function getStackItemTitle(item: DockItem): string {
  return item.title ?? getPanelTitle(item.component);
}

/** Resolve stack item icon. */
function getStackItemIcon(item: DockItem): LucideIcon {
  if (item.component === BROWSER_WINDOW_COMPONENT) return Globe;
  if (FILE_VIEWER_COMPONENTS.has(item.component)) return File;
  return Layers;
}

/** Resolve a file-system entry from a stack item. */
function resolveStackFileEntry(item: DockItem): FileSystemEntry | null {
  if (
    !FILE_VIEWER_COMPONENTS.has(item.component) &&
    item.component !== BOARD_VIEWER_COMPONENT
  ) {
    return null;
  }
  const params = (item.params ?? {}) as Record<string, unknown>;
  const name =
    (typeof params.name === "string" && params.name.trim()) ||
    (typeof item.title === "string" && item.title.trim()) ||
    String(item.id);
  if (!name) return null;
  const ext = typeof params.ext === "string" ? params.ext : undefined;
  const uri =
    (typeof params.uri === "string" && params.uri.trim()) || String(item.id);
  const kind: FileSystemEntry["kind"] =
    item.component === BOARD_VIEWER_COMPONENT ? "folder" : "file";
  return {
    uri,
    name,
    ext,
    kind,
  };
}

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
  const [uncontrolledSelected, setUncontrolledSelected] = useState<
    number | null
  >(defaultSelectedIndex);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const baseMeasureRef = useRef<HTMLDivElement>(null);
  const countMeasureRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState<number | null>(null);
  const [fullWidth, setFullWidth] = useState<number | null>(null);
  const [countWidth, setCountWidth] = useState<number | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [stackTrayOpen, setStackTrayOpen] = useState(false);
  const activeTabId = useTabs((s) => s.activeTabId);
  const stack = useTabRuntime((s) =>
    activeTabId ? s.runtimeByTabId[activeTabId]?.stack ?? EMPTY_STACK : EMPTY_STACK,
  );
  const activeStackItemId = useTabRuntime((s) =>
    activeTabId ? s.runtimeByTabId[activeTabId]?.activeStackItemId ?? "" : "",
  );
  const stackHidden = useTabRuntime((s) =>
    activeTabId ? Boolean(s.runtimeByTabId[activeTabId]?.stackHidden) : false,
  );
  const lastSignalRef = useRef(0);
  const stackNudgeRefs = useRef(new Map<string, HTMLSpanElement>());
  const isControlled = selectedIndex !== undefined;
  const selected = isControlled ? selectedIndex : uncontrolledSelected;
  const sizeToken = sizeConfig[size];
  const fileIconSizeClass =
    size === "sm" ? "h-5 w-5" : size === "md" ? "h-6 w-6" : "h-7 w-7";
  const fileIconClassName = "h-full w-full p-0 text-muted-foreground";
  const stackIconSize = sizeToken.icon + 3;
  const stackLimit = STACK_LIMIT_BY_SIZE[size] ?? 4;
  const activeStackItem = useMemo(
    () =>
      stack.find((item) => item.id === activeStackItemId) ??
      stack.at(-1) ??
      null,
    [activeStackItemId, stack],
  );
  const visibleStack = useMemo(() => {
    if (stack.length <= stackLimit) return stack;
    const tail = stack.slice(-stackLimit);
    if (!activeStackItem) return tail;
    if (tail.some((item) => item.id === activeStackItem.id)) return tail;
    return [...stack.slice(-stackLimit + 1), activeStackItem];
  }, [activeStackItem, stack, stackLimit]);
  const visibleStackIds = useMemo(
    () => new Set(visibleStack.map((item) => item.id)),
    [visibleStack],
  );
  const hiddenStackCount = useMemo(
    () => stack.filter((item) => !visibleStackIds.has(item.id)).length,
    [stack, visibleStackIds],
  );
  const hiddenStackTitles = useMemo(
    () =>
      stack
        .filter((item) => !visibleStackIds.has(item.id))
        .map((item) => getStackItemTitle(item)),
    [stack, visibleStackIds],
  );
  const topStackId = activeStackItem?.id ?? "";
  const showStack = !isExpanded && stack.length > 0;
  const canShowStack = showStack
    ? !availableWidth || !fullWidth || fullWidth <= availableWidth - 24
    : false;
  const showStackResolved = showStack && canShowStack;
  const showStackCount = showStack && !showStackResolved;
  const stackTrayItems = showStackCount
    ? stack
    : hiddenStackCount > 0
      ? stack.filter((item) => !visibleStackIds.has(item.id))
      : [];

  useEffect(() => {
    if (isExpanded) {
      setStackTrayOpen(false);
      return;
    }
    if (!showStackResolved && !showStackCount) {
      setStackTrayOpen(false);
      return;
    }
    if (stackTrayItems.length === 0) {
      setStackTrayOpen(false);
    }
  }, [isExpanded, showStackResolved, showStackCount, stackTrayItems.length]);

  // 中文注释：使用隐藏容器测量折叠态真实宽度，避免宽度回弹。
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const width = measureRef.current.offsetWidth;
    if (width > 0 && width !== fullWidth) {
      setFullWidth(width);
    }
  }, [fullWidth, hiddenStackCount, selected, size, stack.length, tabs, visibleStack.length]);

  // 中文注释：测量不含 stack 的基础宽度，用于窄屏折叠。
  useLayoutEffect(() => {
    if (!baseMeasureRef.current) return;
    const width = baseMeasureRef.current.offsetWidth;
    if (width > 0 && width !== baseWidth) {
      setBaseWidth(width);
    }
  }, [baseWidth, selected, size, tabs]);

  // 中文注释：测量“数量显示”的折叠宽度。
  useLayoutEffect(() => {
    if (!countMeasureRef.current) return;
    const width = countMeasureRef.current.offsetWidth;
    if (width > 0 && width !== countWidth) {
      setCountWidth(width);
    }
  }, [countWidth, selected, size, tabs]);

  // 中文注释：监听父容器宽度，判断 stack 是否需要折叠。
  useEffect(() => {
    const parent = dockRef.current?.parentElement;
    if (!parent) return;
    const updateWidth = () => {
      setAvailableWidth(parent.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    if (!activeTabId) return;
    if (!stackHidden) return;
    if (stack.length === 0) return;
    const signal = getStackMinimizeSignal(activeTabId);
    if (!signal || signal === lastSignalRef.current) return;
    lastSignalRef.current = signal;
    const targetId = topStackId || stack.at(-1)?.id || "";
    if (!targetId) return;
    const node = stackNudgeRefs.current.get(targetId);
    if (!node) return;
    node.animate(
      [
        { transform: "translateX(0px) rotate(0deg)" },
        { transform: "translateX(-2px) rotate(-10deg)" },
        { transform: "translateX(2px) rotate(10deg)" },
        { transform: "translateX(-1.5px) rotate(-8deg)" },
        { transform: "translateX(1.5px) rotate(8deg)" },
        { transform: "translateX(0px) rotate(0deg)" },
      ],
      { duration: 480, easing: "ease-in-out" },
    );
  }, [activeTabId, stack.length, stackHidden, topStackId]);

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

  /** Open a stack item. */
  const openStackItem = (item: DockItem) => {
    if (!activeTabId) return;
    useTabRuntime.getState().pushStackItem(activeTabId, item);
  };

  /** Send the current input value. */
  const handleSend = () => {
    const value = inputValue.trim();
    if (!value) return;
    onSend?.(value);
    setInputValue("");
  };

  const effectiveCollapsedWidth = showStackResolved
    ? fullWidth
    : showStackCount
      ? countWidth
      : baseWidth;
  const widthAnimation =
    effectiveCollapsedWidth !== null
      ? { width: isExpanded ? expandedWidth : effectiveCollapsedWidth }
      : {};
  const containerTransition: Transition = {
    opacity: { duration: 0.22, ease: "easeOut" },
    y: { duration: 0.22, ease: "easeOut" },
    width: { duration: 0.18, ease: "easeOut" },
  };
  const tabWidthTransition: Transition = { duration: 0.18, ease: "easeOut" };
  const renderStackCountBadge = (
    count: number,
    tooltip: ReactNode,
    label?: string,
    onClick?: () => void,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex items-center justify-center rounded-full bg-muted/70 text-muted-foreground"
          style={{
            height: sizeToken.height,
            width: sizeToken.height,
          }}
          aria-label={`共 ${count} 个`}
        >
          <span className="text-[11px] font-medium">{label ?? `+${count}`}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <div
        ref={measureRef}
        className={cn(
          "pointer-events-none invisible absolute -z-10 flex items-center rounded-3xl border border-transparent",
          sizeToken.container,
          "gap-1",
        )}
      >
        <div style={{ height: sizeToken.height, width: sizeToken.sparklesWidth }} />
        <div className="mx-0.5 h-4 w-px bg-transparent" />
        {tabs.map((tab, index) => {
          const isActive = selected === index;
          const width = isActive
            ? sizeToken.activeWidth
            : sizeToken.inactiveWidth;
          return (
            <div
              key={tab.id}
              style={{ height: sizeToken.height, width }}
              className="rounded-full"
            />
          );
        })}
        {stack.length > 0 ? (
          <>
            <div className="mx-0.5 h-4 w-px bg-transparent" />
            <div className="flex items-center gap-0.5">
              {visibleStack.map((item) => (
                <div
                  key={item.id}
                  style={{ height: sizeToken.height, width: sizeToken.height }}
                  className="rounded-full"
                />
              ))}
              {hiddenStackCount > 0 ? (
                <div
                  style={{ height: sizeToken.height, width: sizeToken.height }}
                  className="rounded-full"
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <div
        ref={baseMeasureRef}
        className={cn(
          "pointer-events-none invisible absolute -z-10 flex items-center rounded-3xl border border-transparent",
          sizeToken.container,
          "gap-1",
        )}
      >
        <div style={{ height: sizeToken.height, width: sizeToken.sparklesWidth }} />
        <div className="mx-0.5 h-4 w-px bg-transparent" />
        {tabs.map((tab, index) => {
          const isActive = selected === index;
          const width = isActive
            ? sizeToken.activeWidth
            : sizeToken.inactiveWidth;
          return (
            <div
              key={`${tab.id}-base`}
              style={{ height: sizeToken.height, width }}
              className="rounded-full"
            />
          );
        })}
      </div>
      <div
        ref={countMeasureRef}
        className={cn(
          "pointer-events-none invisible absolute -z-10 flex items-center rounded-3xl border border-transparent",
          sizeToken.container,
          "gap-1",
        )}
      >
        <div style={{ height: sizeToken.height, width: sizeToken.sparklesWidth }} />
        <div className="mx-0.5 h-4 w-px bg-transparent" />
        {tabs.map((tab, index) => {
          const isActive = selected === index;
          const width = isActive
            ? sizeToken.activeWidth
            : sizeToken.inactiveWidth;
          return (
            <div
              key={`${tab.id}-count`}
              style={{ height: sizeToken.height, width }}
              className="rounded-full"
            />
          );
        })}
        <div className="mx-0.5 h-4 w-px bg-transparent" />
        <div
          style={{ height: sizeToken.height, width: sizeToken.height }}
          className="rounded-full"
        />
      </div>
      <motion.div
        ref={dockRef}
        className={cn(
          "absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center overflow-visible rounded-3xl border border-white/45 bg-white/40 text-secondary-foreground shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl backdrop-saturate-200 dark:border-white/12 dark:bg-slate-950/40 dark:shadow-[0_18px_40px_rgba(0,0,0,0.7)]",
          sizeToken.container,
          "gap-1",
          className,
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, ...widthAnimation }}
        transition={containerTransition}
      >
        <AnimatePresence initial={false}>
          {stackTrayOpen && stackTrayItems.length > 0 ? (
            <motion.div
              key="stack-tray"
              className={cn(
                "absolute bottom-full right-1 mb-2 flex flex-col items-stretch rounded-3xl border border-white/45 bg-white/40 text-secondary-foreground shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl backdrop-saturate-200 dark:border-white/12 dark:bg-slate-950/40 dark:shadow-[0_18px_40px_rgba(0,0,0,0.7)]",
                sizeToken.container,
                "gap-1",
              )}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {stackTrayItems.map((item, index) => {
                const fileEntry = resolveStackFileEntry(item);
                const iconNode = fileEntry
                  ? getEntryVisual({
                      kind: fileEntry.kind,
                      name: fileEntry.name,
                      ext: fileEntry.ext,
                      thumbnailSrc:
                        typeof (item.params as any)?.thumbnailSrc === "string"
                          ? ((item.params as any)?.thumbnailSrc as string)
                          : undefined,
                      sizeClassName: fileIconSizeClass,
                      thumbnailIconClassName: fileIconClassName,
                      forceSquare: true,
                    })
                  : null;
                const FallbackIcon = getStackItemIcon(item);
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      openStackItem(item);
                      setStackTrayOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1 text-left text-muted-foreground"
                    style={{
                      minHeight: sizeToken.height + 2,
                    }}
                    initial={{ opacity: 0, y: 12, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: Math.min(index * 0.04, 0.2),
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                    }}
                    aria-label={getStackItemTitle(item)}
                  >
                    <span className="flex items-center justify-center">
                      {iconNode ?? (
                        <FallbackIcon size={stackIconSize} className="text-muted-foreground" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap text-foreground",
                        sizeToken.text,
                      )}
                    >
                      {getStackItemTitle(item)}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <span
          aria-hidden="true"
          data-stack-dock-button="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-0"
          style={{ height: sizeToken.height, width: sizeToken.height }}
        />
        <motion.button
          type="button"
          className="flex items-center justify-end rounded-full shrink-0 pr-1"
          style={{ height: sizeToken.height, width: sizeToken.sparklesWidth }}
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
        <div
          className="relative flex-1 min-w-0"
          style={{ height: sizeToken.height }}
        >
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
                    "text-foreground placeholder:text-muted-foreground/70",
                  )}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: 16,
                    transition: { duration: 0.16, ease: "easeOut" },
                  }}
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
                  initial={{ opacity: 0, scale: 0, rotate: -90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0, rotate: 90 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 24,
                    delay: 0.12,
                  }}
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
                  const inactiveText =
                    tone?.inactiveText ?? "text-muted-foreground";
                  const colorClass = isActive ? activeBg : "bg-muted/70";
                  const textClass = isActive ? activeText : inactiveText;
                  const iconScale = isHovered
                    ? isActive
                      ? 1.05
                      : 1
                    : isActive
                      ? 1
                      : 0.96;
                  const iconRotate = isHovered ? (isActive ? 4 : 8) : 0;

                  const button = (
                    <motion.button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "relative flex items-center justify-center rounded-full",
                        colorClass,
                      )}
                      style={{ height: sizeToken.height }}
                      onClick={() => handleSelect(index)}
                      onHoverStart={() => setHoveredIndex(index)}
                      onHoverEnd={() => setHoveredIndex(null)}
                      initial={false}
                      animate={{
                        width: isActive
                          ? sizeToken.activeWidth
                          : sizeToken.inactiveWidth,
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
                          transition={{
                            type: "spring",
                            stiffness: 360,
                            damping: 24,
                          }}
                        >
                          <Icon size={sizeToken.icon} className={textClass} />
                        </motion.span>
                        <AnimatePresence initial={false}>
                          {isActive && (
                            <motion.span
                              className={cn(
                                "overflow-hidden whitespace-nowrap font-medium max-sm:hidden",
                                sizeToken.text,
                                textClass,
                              )}
                              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                              animate={{
                                opacity: 1,
                                width: "auto",
                                marginLeft: 8,
                              }}
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
        {stack.length > 0 ? (
          <motion.div
            className="mx-0.5 h-4 w-px bg-border/70"
            aria-hidden="true"
            initial={false}
            animate={{
              opacity: showStackResolved || showStackCount ? 1 : 0,
              scaleY: showStackResolved || showStackCount ? 1 : 0,
              y: showStackResolved || showStackCount ? 0 : 10,
            }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ transformOrigin: "center" }}
          />
        ) : null}
        {stack.length > 0 ? (
          <AnimatePresence initial={false}>
            {showStackResolved ? (
              <motion.div
                key="stack-icons"
                className="flex items-center gap-0.5 shrink-0"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <div className="flex items-center gap-0.5">
                  {visibleStack.map((item) => {
                    const fileEntry = resolveStackFileEntry(item);
                    const iconNode = fileEntry
                      ? getEntryVisual({
                          kind: fileEntry.kind,
                          name: fileEntry.name,
                          ext: fileEntry.ext,
                          thumbnailSrc:
                            typeof (item.params as any)?.thumbnailSrc === "string"
                              ? ((item.params as any)?.thumbnailSrc as string)
                              : undefined,
                          sizeClassName: fileIconSizeClass,
                          thumbnailIconClassName: fileIconClassName,
                          forceSquare: true,
                        })
                      : null;
                    const FallbackIcon = getStackItemIcon(item);
                    const title = getStackItemTitle(item);
                    const colorClass = "bg-transparent";
                    const textClass = "text-muted-foreground";
                    const tooltipKey = item.id;
                    const button = (
                      <motion.button
                        type="button"
                        className={cn("flex items-center justify-center", colorClass)}
                        style={{
                          height: sizeToken.height,
                          width: sizeToken.height,
                        }}
                        onClick={() => openStackItem(item)}
                        whileHover={{ scale: 1.06, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        aria-label={title}
                      >
                        <span
                          ref={(node) => {
                            if (node) {
                              stackNudgeRefs.current.set(item.id, node);
                            } else {
                              stackNudgeRefs.current.delete(item.id);
                            }
                          }}
                          className="flex items-center justify-center"
                        >
                          {iconNode ?? (
                            <FallbackIcon size={stackIconSize} className={textClass} />
                          )}
                        </span>
                      </motion.button>
                    );

                    return (
                      <Tooltip key={tooltipKey}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={6}>
                          {title}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {hiddenStackCount > 0
                    ? renderStackCountBadge(
                        hiddenStackCount,
                        <div className="text-xs text-muted-foreground">
                          还有 {hiddenStackCount} 个
                          {hiddenStackTitles.length > 0
                            ? `：${hiddenStackTitles.join("、")}`
                            : ""}
                        </div>,
                        `+${hiddenStackCount}`,
                        () => setStackTrayOpen((prev) => !prev),
                      )
                    : null}
                </div>
              </motion.div>
            ) : showStackCount ? (
              <motion.div
                key="stack-count"
                className="flex items-center gap-0.5 shrink-0"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {renderStackCountBadge(
                  stack.length,
                  <div className="text-xs text-muted-foreground">
                    {stack.map((item) => getStackItemTitle(item)).join("、")}
                  </div>,
                  `+${stack.length}`,
                  () => setStackTrayOpen((prev) => !prev),
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </motion.div>
    </>
  );
}
