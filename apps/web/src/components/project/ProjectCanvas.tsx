"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

interface ProjectCanvasProps {
  isLoading: boolean;
  pageId?: string;
  pageTitle: string;
}

/**
 * Render the project drawing canvas.
 */
export default function ProjectCanvas({
  isLoading,
  pageId,
  pageTitle,
}: ProjectCanvasProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full mt-3">
      <div className="relative h-full min-h-[480px]">
        <Excalidraw />
        <div className="sr-only">
          {pageTitle} {pageId ?? "-"}
        </div>
      </div>
    </div>
  );
}
