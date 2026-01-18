"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ShellCommandToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render shell-command tool output. */
export default function ShellCommandTool({ part, className, variant }: ShellCommandToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
