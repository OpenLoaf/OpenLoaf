import React, { useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  FileText,
  Info,
  Sparkles,
  CheckSquare,
  Database,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/radix/tabs";

// 定义重复的className常量
const tabTriggerBaseClass =
  "items-center justify-center gap-0 transition-all duration-400 cubic-bezier(0.4, 0, 0.2, 1)";
const tabIconWrapperClass = "flex items-center justify-center w-5 h-5";
const tabIconClass =
  "size-4 shrink-0 transition-all duration-400 cubic-bezier(0.4, 0, 0.2, 1)";
const tabTextWrapperBaseClass =
  "overflow-hidden inline-flex transition-[max-width] duration-400 cubic-bezier(0.4, 0, 0.2, 1)";
const tabTextWrapperShowClass = "max-w-[100px] h-auto";
const tabTextWrapperHideClass = "max-w-0 h-0";
// Text fades in after width expansion so labels do not pop in immediately when showing.
const tabTextBaseClass = "whitespace-nowrap transition-opacity duration-500";
const tabTextShowClass = "opacity-100 delay-300";
const tabTextHideClass = "opacity-0 delay-0";

interface PlantHeaderProps {
  pageTitle: string;
  className?: string;
}

export default function PlantHeader({
  pageTitle,
  className,
}: PlantHeaderProps) {
  const tabsWrapperRef = useRef<HTMLDivElement | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const tabTextWrapperStyle = { transitionDelay: showLabels ? "0ms" : "150ms" };
  const tabTextStyle = { transitionDelay: showLabels ? "150ms" : "0ms" };

  useEffect(() => {
    const target = tabsWrapperRef.current;
    if (!target || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Show labels only when there is comfortable room for icons + text.
      setShowLabels(width >= 800);
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // 添加当前页面到面包屑
  const breadcrumbItems = [
    {
      label: pageTitle,
      isCurrent: true,
    },
  ];

  // 标签页数据
  const tabs = [
    { value: "intro", label: "简介", icon: <Info className={tabIconClass} /> },
    {
      value: "canvas",
      label: "画布",
      icon: <Sparkles className={tabIconClass} />,
    },
    {
      value: "tasks",
      label: "任务",
      icon: <CheckSquare className={tabIconClass} />,
    },
    {
      value: "materials",
      label: "资料",
      icon: <Database className={tabIconClass} />,
    },
    { value: "skills", label: "技能", icon: <Zap className={tabIconClass} /> },
  ];

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-0 w-full",
        className
      )}
    >
      <Breadcrumb className="mb-0">
        <BreadcrumbList>
          {breadcrumbItems.map((item, index) => (
            <React.Fragment key={index}>
              <BreadcrumbItem className="flex items-center gap-1">
                <FileText className="size-4 text-muted-foreground" />
                {item.isCurrent ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div ref={tabsWrapperRef} className="flex justify-end flex-1">
        <Tabs defaultValue="intro">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  tabTriggerBaseClass,
                  showLabels ? "gap-1 px-3" : "px-2 gap-0"
                )}
              >
                <span className={tabIconWrapperClass}>{tab.icon}</span>
                <span
                  className={cn(
                    tabTextWrapperBaseClass,
                    showLabels
                      ? tabTextWrapperShowClass
                      : tabTextWrapperHideClass
                  )}
                  style={tabTextWrapperStyle}
                >
                  <span
                    className={cn(
                      tabTextBaseClass,
                      showLabels ? tabTextShowClass : tabTextHideClass
                    )}
                    style={tabTextStyle}
                  >
                    {tab.label}
                  </span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
