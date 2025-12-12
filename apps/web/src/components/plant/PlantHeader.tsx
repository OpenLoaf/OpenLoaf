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

interface PlantHeaderProps {
  pageTitle: string;
  className?: string;
}

export default function PlantHeader({
  pageTitle,
  className,
}: PlantHeaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => {
      const width = el.getBoundingClientRect().width;
      setIsCompact(width < 800);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 添加当前页面到面包屑
  const breadcrumbItems = [
    {
      label: pageTitle,
      isCurrent: true,
    },
  ];

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
      <div className="flex justify-end flex-1">
        <Tabs defaultValue="intro">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
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
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
