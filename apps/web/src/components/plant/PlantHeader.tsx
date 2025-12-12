import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, Sparkles, CheckSquare, Database, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsHighlight,
  TabsList,
  TabsHighlightItem,
  TabsTrigger,
} from "@/components/animate-ui/primitives/radix/tabs";

interface PlantHeaderProps {
  pageTitle: string;
  titleIcon?: ReactNode;
  className?: string;
}

export default function PlantHeader({
  pageTitle,
  titleIcon,
  className,
}: PlantHeaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeEndTimeoutRef = useRef<number | null>(null);

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

  // tab配置列表
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
  ];

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex items-center justify-between  py-0 w-full",
        className
      )}
    >
      <h1 className="text-xl font-semibold flex items-center gap-2 flex-1 min-w-0">
        {titleIcon ? (
          <span className="flex items-center text-xl leading-none shrink-0">
            {titleIcon}
          </span>
        ) : null}
        <span className="truncate">{pageTitle}</span>
      </h1>
      <div className="flex justify-end flex-1 shrink-0">
        <Tabs defaultValue="intro">
          <TabsHighlight
            className={cn(
              "absolute z-0 inset-0 border border-transparent rounded-md bg-background dark:border-input dark:bg-input/30 shadow-sm transition-[filter] duration-150 ease-out",
              isResizing ? "filter-[opacity(0)]" : "filter-[opacity(1)]"
            )}
          >
            <TabsList className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]">
              {tabs.map((tab) => (
                <TabsHighlightItem
                  key={tab.value}
                  value={tab.value}
                  className="flex-1"
                >
                  <TabsTrigger
                    value={tab.value}
                    className={cn(
                      "data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md w-full px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-500 ease-in-out focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                      "flex items-center px-3 transition-all duration-300 ease-in-out",
                      isCompact ? "gap-0" : "gap-1"
                    )}
                  >
                    <span className="flex items-center justify-center w-5 h-5">
                      {tab.icon}
                    </span>
                    <span
                      className={cn(
                        "whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out",
                        isCompact
                          ? "max-w-0 opacity-0 -translate-x-1"
                          : "max-w-[200px] opacity-100 translate-x-0"
                      )}
                      aria-hidden={isCompact}
                    >
                      {tab.label}
                    </span>
                  </TabsTrigger>
                </TabsHighlightItem>
              ))}
            </TabsList>
          </TabsHighlight>
        </Tabs>
      </div>
    </div>
  );
}
