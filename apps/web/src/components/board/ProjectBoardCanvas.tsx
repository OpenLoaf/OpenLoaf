"use client";

import { memo, useMemo } from "react";

import { BoardCanvas } from "./BoardCanvas";
import type { CanvasElement } from "./CanvasTypes";
import { PlaceholderNodeDefinition } from "./nodes/PlaceholderNode";

export interface ProjectBoardCanvasProps {
  /** Loading state for the project page. */
  isLoading: boolean;
  /** Active state for the project tab. */
  isActive: boolean;
  /** Current project page id. */
  pageId?: string;
  /** Current project page title. */
  pageTitle: string;
}

/** Render the new board canvas inside the project page. */
const ProjectBoardCanvas = memo(function ProjectBoardCanvas({
  isLoading,
  isActive,
  pageId,
  pageTitle,
}: ProjectBoardCanvasProps) {
  const initialElements = useMemo<CanvasElement[]>(() => {
    if (!pageId) return [];
    // 逻辑：用页面 id 生成稳定节点 id，避免切换 tab 时重复创建。
    return [
      {
        id: `${pageId}-placeholder-1`,
        kind: "node",
        type: "placeholder",
        xywh: [120, 140, 320, 160],
        zIndex: 1,
        props: {
          title: "New board engine",
          description: "Any React component can live here.",
        },
      },
      {
        id: `${pageId}-placeholder-2`,
        kind: "node",
        type: "placeholder",
        xywh: [520, 320, 320, 160],
        zIndex: 2,
        props: {
          title: pageTitle || "Project board",
          description: "Next: player, image, AI-generated nodes, and more.",
        },
      },
    ];
  }, [pageId, pageTitle]);

  if (isLoading) return null;

  return (
    <div data-board-active={isActive ? "true" : "false"} className="h-full w-full">
      <BoardCanvas
        key={pageId ?? "board"}
        className="h-full w-full"
        nodes={[PlaceholderNodeDefinition]}
        initialElements={initialElements}
      />
    </div>
  );
});

export default ProjectBoardCanvas;
