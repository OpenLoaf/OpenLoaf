"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface GrepFilesToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render grep-files tool output. */
export default function GrepFilesTool({ part, className, variant }: GrepFilesToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
