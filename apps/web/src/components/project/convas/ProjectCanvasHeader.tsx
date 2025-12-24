"use client";

import { memo } from "react";

interface ProjectCanvasHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Render the project canvas header. */
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

export default ProjectCanvasHeader;
