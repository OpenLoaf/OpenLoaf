"use client";

import { memo } from "react";
import { CanvasProvider } from "./CanvasProvider";
import ProjectCanvasBody, { type ProjectCanvasProps } from "./ProjectCanvasBody";
import ProjectCanvasHeader from "./ProjectCanvasHeader";

/** Provide canvas data context for the project canvas. */
const ProjectCanvas = memo(function ProjectCanvas(props: ProjectCanvasProps) {
  return (
    <CanvasProvider pageId={props.pageId}>
      <ProjectCanvasBody {...props} />
    </CanvasProvider>
  );
});

export { ProjectCanvasHeader };
export default ProjectCanvas;
