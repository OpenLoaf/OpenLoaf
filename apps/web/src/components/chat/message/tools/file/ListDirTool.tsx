"use client";

import GenericTool from "../shared/GenericTool";
import type { AnyToolPart, ToolVariant } from "../shared/tool-utils";

interface ListDirToolProps {
  /** Tool part payload. */
  part: AnyToolPart;
  /** Extra class names for the container. */
  className?: string;
  /** Rendering variant for nested tool output. */
  variant?: ToolVariant;
}

/** Render list-dir tool output. */
export default function ListDirTool({ part, className, variant }: ListDirToolProps) {
  return <GenericTool part={part} className={className} variant={variant} />;
}
