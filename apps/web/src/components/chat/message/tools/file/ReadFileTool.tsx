"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ReadFileToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render read-file tool output. */
export default function ReadFileTool({ part, className, variant }: ReadFileToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
