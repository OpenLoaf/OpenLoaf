"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface WriteStdinToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render write-stdin tool output. */
export default function WriteStdinTool({ part, className, variant }: WriteStdinToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
