import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  Info,
  Sparkles,
  CheckSquare,
  Database,
  Zap,
  FlaskConical,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, skipToken } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/app/page";
import { Skeleton } from "@/components/ui/skeleton";
import PlantIntro from "./PlantIntro";
import PlantCanvas from "./PlantCanvas";
import PlantTasks from "./PlantTasks";
import PlantMaterials from "./PlantMaterials";
import PlantSkills from "./PlantSkills";
import PlantTest from "./PlantTest";

interface PlantPageProps {
  pageId?: string;
  [key: string]: any;
}

function PlantTitleSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-5 rounded-sm" />
      <Skeleton className="h-6 w-[35vw] max-w-[180px]" />
    </div>
  );
}

export default function PlantPage({ pageId }: PlantPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();

  // 使用tRPC获取页面数据
  const { data: pageData, isLoading } = useQuery(
    trpc.page.findUniquePage.queryOptions(
      activeWorkspace && pageId ? { where: { id: pageId } } : skipToken
    )
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeEndTimeoutRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState("intro");
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateCompact = () => {
      const width = el.getBoundingClientRect().width;
      setIsCompact(width < 800);
    };

    updateCompact();
    const ro = new ResizeObserver(() => {
      updateCompact();
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

  const tabs = [
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
  ];

  const pageTitle = pageData?.title || "Plant Page";
  const titleIcon = pageData?.icon ?? undefined;

  const activeIndex = tabs.findIndex((tab) => tab.value === activeTab);

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div
        ref={containerRef}
        className="flex items-center justify-between py-0 w-full min-w-0"
      >
        <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
          {isLoading ? (
            <PlantTitleSkeleton />
          ) : (
            <>
              {titleIcon ? (
                <span className="flex items-center text-xl leading-none">
                  {titleIcon}
                </span>
              ) : null}
              <span className="truncate">{pageTitle}</span>
            </>
          )}
        </h1>

        <div className="flex justify-end flex-1">
          <motion.div
            className="relative"
            role="tablist"
            aria-label="Plant Tabs"
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut", delay: 0.5 }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const current = activeIndex === -1 ? 0 : activeIndex;
              const next = (current + direction + tabs.length) % tabs.length;
              const nextValue = tabs[next]?.value;
              if (!nextValue) return;
              setActiveTab(nextValue);
              tabButtonRefs.current[next]?.focus();
            }}
          >
            <div className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
              {tabs.map((tab, index) => {
                const isActive = tab.value === activeTab;
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
                    onClick={() => setActiveTab(tab.value)}
                    className={[
                      "relative text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                      "flex items-center px-3 transition-all duration-300 ease-in-out",
                      isCompact ? "gap-0" : "gap-1",
                      isActive ? "text-foreground" : "",
                    ].join(" ")}
                  >
                    {isActive ? (
                      isResizing ? (
                        <div className="absolute inset-0 z-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm" />
                      ) : (
                        <motion.div
                          layoutId="plant-tabs-indicator"
                          className="absolute inset-0 z-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm"
                          transition={{
                            type: "spring",
                            stiffness: 200,
                            damping: 25,
                          }}
                        />
                      )
                    ) : null}

                    <span className="relative z-10 flex items-center justify-center w-5 h-5">
                      {tab.icon}
                    </span>
                    <span
                      className={[
                        "relative z-10 whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
                        isCompact
                          ? "max-w-0 opacity-0 -translate-x-1"
                          : "max-w-[200px] opacity-100 translate-x-0",
                      ].join(" ")}
                      aria-hidden={isCompact}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 w-full">
            <div
              id={`plant-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`plant-tab-${activeTab}`}
              className="w-full h-full min-h-0"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  {activeTab === "intro" ? (
                    <PlantIntro isLoading={isLoading} pageTitle={pageTitle} />
                  ) : null}
                  {activeTab === "canvas" ? (
                    <PlantCanvas
                      isLoading={isLoading}
                      pageId={pageId}
                      pageTitle={pageTitle}
                    />
                  ) : null}
                  {activeTab === "tasks" ? (
                    <PlantTasks isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "materials" ? (
                    <PlantMaterials isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "skills" ? (
                    <PlantSkills isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "test" ? <PlantTest pageId={pageId} /> : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}
