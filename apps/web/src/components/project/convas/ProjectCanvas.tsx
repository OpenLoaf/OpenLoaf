"use client";

import "@excalidraw/excalidraw/index.css";
import { lazy, memo, Suspense } from "react";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";

const LazyExcalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((module) => ({
    default: module.Excalidraw,
  }))
);

interface ProjectCanvasProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
}

interface ProjectCanvasHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Fallback content while the canvas bundle loads. */
function ProjectCanvasFallback() {
  return <Skeleton className="h-full w-full min-h-[480px]" />;
}

/** Project canvas header. */
const ProjectCanvasHeader = memo(function ProjectCanvasHeader({
  isLoading,
  pageTitle,
}: ProjectCanvasHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">画布</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

/** Render the project drawing canvas. */
const ProjectCanvas = memo(function ProjectCanvas({
  isLoading,
  pageId,
  pageTitle,
}: ProjectCanvasProps) {
  const { resolvedTheme } = useTheme();
  // 根据当前系统主题切换 Excalidraw 主题
  const excalidrawTheme = resolvedTheme === "dark" ? "dark" : "light";

  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full">
      <div className="relative h-full min-h-[480px]">
        <Suspense fallback={<ProjectCanvasFallback />}>
          <LazyExcalidraw theme={excalidrawTheme} />
        </Suspense>
        <div className="sr-only">
          {pageTitle} {pageId ?? "-"}
        </div>
      </div>
    </div>
  );
});

export { ProjectCanvasHeader };
export default ProjectCanvas;
