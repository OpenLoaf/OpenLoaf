"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ShellToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render shell tool output. */
export default function ShellTool({ part, className, variant }: ShellToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
