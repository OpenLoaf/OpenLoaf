"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ExecCommandToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render exec-command tool output. */
export default function ExecCommandTool({ part, className, variant }: ExecCommandToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
