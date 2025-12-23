import { CheckSquare, Database, Info, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export const PROJECT_TABS = [
  {
    value: "intro",
    icon: <Info className="size-4 shrink-0" />,
    label: "简介",
  },
  {
    value: "canvas",
    icon: <Sparkles className="size-4 shrink-0" />,
    label: "画布",
  },
  {
    value: "tasks",
    icon: <CheckSquare className="size-4 shrink-0" />,
    label: "任务",
  },
  {
    value: "materials",
    icon: <Database className="size-4 shrink-0" />,
    label: "资料",
  },
  {
    value: "skills",
    icon: <Zap className="size-4 shrink-0" />,
    label: "技能",
  },
] as const;

export type ProjectTabValue = (typeof PROJECT_TABS)[number]["value"];

type ProjectTabsProps = {
  value: ProjectTabValue;
  onValueChange: (value: ProjectTabValue) => void;
  isActive?: boolean;
  revealDelayMs?: number;
};

const LABEL_HYSTERESIS_PX = 8;
const REVEAL_LABEL_DELAY_MS = 600;

export default function ProjectTabs({
  value,
  onValueChange,
  isActive = true,
  revealDelayMs = 300,
}: ProjectTabsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelMeasureRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [isReady, setIsReady] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeEndTimeoutRef = useRef<number | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const canRevealLabelsRef = useRef(false);
  const updateShowLabelsRef = useRef<(() => void) | null>(null);

  const activeIndex = useMemo(
    () => PROJECT_TABS.findIndex((tab) => tab.value === value),
    [value]
  );

  useEffect(() => {
    // 延迟展示 tab 组件，等容器就绪后再执行动画
    if (!isActive) {
      setIsReady(false);
      return;
    }
    setIsReady(false);
    const timer = window.setTimeout(() => {
      setIsReady(true);
    }, revealDelayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isActive, revealDelayMs]);

  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    const measureEl = labelMeasureRef.current;
    if (!containerEl || !measureEl || typeof ResizeObserver === "undefined")
      return;

    /**
     * 根据“容器可用宽度”与“完整标签所需宽度”决定是否展示 label。
     * - 默认隐藏：`showLabels=false`
     * - 只有当完整标签宽度能放下（考虑滞回）才显示，避免一进页面就挤/溢出
     */
    const updateShowLabels = () => {
      if (!canRevealLabelsRef.current) {
        setShowLabels(false);
        return;
      }
      const containerWidth = containerEl.getBoundingClientRect().width;
      const labelWidth = measureEl.getBoundingClientRect().width;
      setShowLabels((prev) => {
        if (prev) return labelWidth <= containerWidth + LABEL_HYSTERESIS_PX;
        return labelWidth <= containerWidth - LABEL_HYSTERESIS_PX;
      });
    };
    updateShowLabelsRef.current = updateShowLabels;

    // Schedule resize-driven state updates on the next frame.
    const scheduleResizeUpdate = () => {
      if (resizeRafRef.current !== null) return;
      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = null;
        updateShowLabels();
        setIsResizing((prev) => (prev ? prev : true));
        if (resizeEndTimeoutRef.current !== null) {
          window.clearTimeout(resizeEndTimeoutRef.current);
        }
        resizeEndTimeoutRef.current = window.setTimeout(() => {
          setIsResizing(false);
        }, 150);
      });
    };

    const ro = new ResizeObserver(() => {
      // 避免 ResizeObserver 回调内直接触发多次 setState，改为下一帧统一处理。
      scheduleResizeUpdate();
    });
    ro.observe(containerEl);
    ro.observe(measureEl);
    return () => {
      ro.disconnect();
      updateShowLabelsRef.current = null;
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      if (resizeEndTimeoutRef.current !== null) {
        window.clearTimeout(resizeEndTimeoutRef.current);
        resizeEndTimeoutRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    /**
     * 核心：该组件可能不会被卸载（只是被外层 Tab 隐藏）。
     * 因此当外层 Tab 再次激活时，需要先强制“最小样式”（仅图标），延迟后再按宽度决定是否展开 label。
     */
    if (!isActive) {
      canRevealLabelsRef.current = false;
      setShowLabels(false);
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      return;
    }

    canRevealLabelsRef.current = false;
    setShowLabels(false);

    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      canRevealLabelsRef.current = true;
      updateShowLabelsRef.current?.();
    }, REVEAL_LABEL_DELAY_MS);

    return () => {
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
  }, [isActive]);

  return (
    <div ref={containerRef} className="flex justify-end flex-1 min-w-0">
      {/* 用于测量“展示 label 时”整个 tab 组的宽度；放在屏幕外，不影响布局 */}
      <div
        ref={labelMeasureRef}
        className="pointer-events-none fixed left-[-10000px] top-[-10000px] opacity-0"
        aria-hidden
      >
        <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
          {PROJECT_TABS.map((tab) => (
            <div
              key={tab.value}
              className={[
                "relative text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap",
                "flex items-center px-3",
                "gap-1",
              ].join(" ")}
            >
              <span className="flex items-center justify-center w-5 h-5">
                {tab.icon}
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
            </div>
          ))}
        </div>
      </div>

      {isReady ? (
        <motion.div
          className="relative"
          role="tablist"
          aria-label="Project Tabs"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const current = activeIndex === -1 ? 0 : activeIndex;
            const next = (current + direction + PROJECT_TABS.length) % PROJECT_TABS.length;
            const nextValue = PROJECT_TABS[next]?.value;
            if (!nextValue) return;
            onValueChange(nextValue);
            tabButtonRefs.current[next]?.focus();
          }}
        >
          <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
            {PROJECT_TABS.map((tab, index) => {
              const isActive = tab.value === value;
              const tabId = `project-tab-${tab.value}`;
              const panelId = `project-panel-${tab.value}`;

              return (
                <button
                  key={tab.value}
                  ref={(el) => {
                    tabButtonRefs.current[index] = el;
                  }}
                  id={tabId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={panelId}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onValueChange(tab.value)}
                  className={[
                    "relative text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                    "flex items-center px-3 transition-all duration-700 ease-in-out",
                    showLabels ? "gap-1" : "gap-0",
                    isActive ? "text-foreground" : "",
                  ].join(" ")}
                >
                  {isActive ? (
                    <motion.div
                      layoutId="project-tabs-indicator"
                      className="absolute inset-0 z-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm"
                      transition={
                        isResizing
                          ? { duration: 0 }
                            : {
                              type: "spring",
                              stiffness: 110,
                              damping: 24,
                            }
                      }
                    />
                  ) : null}

                  <span className="relative z-10 flex items-center justify-center w-5 h-5">
                    {tab.icon}
                  </span>
                  <span
                    className={[
                      "relative z-10 whitespace-nowrap overflow-hidden transition-all duration-700 ease-in-out",
                      showLabels
                        ? "max-w-[200px] opacity-100 translate-x-0"
                        : "max-w-0 opacity-0 -translate-x-1",
                    ].join(" ")}
                    aria-hidden={!showLabels}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : (
        // 延迟期间保留高度，避免布局跳动
        <div className="bg-muted/0 text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px] opacity-0">
          {PROJECT_TABS.map((tab) => (
            <div
              key={tab.value}
              className="relative inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md px-3 py-1 text-sm font-medium"
            >
              <span className="flex items-center justify-center w-5 h-5">
                {tab.icon}
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
