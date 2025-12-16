import {
  CheckSquare,
  Database,
  FlaskConical,
  Info,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

export const PLANT_TABS = [
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
  {
    value: "test",
    icon: <FlaskConical className="size-4 shrink-0" />,
    label: "测试",
  },
] as const;

export type PlantTabValue = (typeof PLANT_TABS)[number]["value"];

type PlantTabsProps = {
  value: PlantTabValue;
  onValueChange: (value: PlantTabValue) => void;
};

const MIN_PX_PER_TAB_TO_SHOW_LABEL = 156;
const LABEL_HYSTERESIS_PX = 8;

export default function PlantTabs({ value, onValueChange }: PlantTabsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [showLabels, setShowLabels] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeEndTimeoutRef = useRef<number | null>(null);

  const activeIndex = useMemo(
    () => PLANT_TABS.findIndex((tab) => tab.value === value),
    [value]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateShowLabels = () => {
      const width = el.getBoundingClientRect().width;
      const pxPerTab = width / PLANT_TABS.length;
      console.log("[PlantTabs] pxPerTab:", pxPerTab.toFixed(2));
      setShowLabels((prev) => {
        if (prev) {
          return pxPerTab >= MIN_PX_PER_TAB_TO_SHOW_LABEL - LABEL_HYSTERESIS_PX;
        }
        return pxPerTab >= MIN_PX_PER_TAB_TO_SHOW_LABEL + LABEL_HYSTERESIS_PX;
      });
    };

    updateShowLabels();
    const ro = new ResizeObserver(() => {
      updateShowLabels();
      setIsResizing(true);
      if (resizeEndTimeoutRef.current !== null) {
        window.clearTimeout(resizeEndTimeoutRef.current);
      }
      resizeEndTimeoutRef.current = window.setTimeout(() => {
        setIsResizing(false);
      }, 150);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeEndTimeoutRef.current !== null) {
        window.clearTimeout(resizeEndTimeoutRef.current);
        resizeEndTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="flex justify-end flex-1 min-w-0">
      <motion.div
        className="relative"
        role="tablist"
        aria-label="Plant Tabs"
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut", delay: 0.5 }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const current = activeIndex === -1 ? 0 : activeIndex;
          const next = (current + direction + PLANT_TABS.length) % PLANT_TABS.length;
          const nextValue = PLANT_TABS[next]?.value;
          if (!nextValue) return;
          onValueChange(nextValue);
          tabButtonRefs.current[next]?.focus();
        }}
      >
        <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
          {PLANT_TABS.map((tab, index) => {
            const isActive = tab.value === value;
            const tabId = `plant-tab-${tab.value}`;
            const panelId = `plant-panel-${tab.value}`;

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
                  "flex items-center px-3 transition-all duration-300 ease-in-out",
                  showLabels ? "gap-1" : "gap-0",
                  isActive ? "text-foreground" : "",
                ].join(" ")}
              >
                {isActive ? (
                  <motion.div
                    layoutId="plant-tabs-indicator"
                    className="absolute inset-0 z-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm"
                    transition={
                      isResizing
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: 200,
                            damping: 25,
                          }
                    }
                  />
                ) : null}

                <span className="relative z-10 flex items-center justify-center w-5 h-5">
                  {tab.icon}
                </span>
                <span
                  className={[
                    "relative z-10 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
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
    </div>
  );
}
