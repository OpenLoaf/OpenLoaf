"use client";

import { memo } from "react";
import { cn } from "@udecode/cn";

export interface NodeToolbarStackProps {
  toolbar: React.ReactNode;
  panel?: React.ReactNode;
  panelPosition?: "above" | "below";
  className?: string;
}

/**
 * Render a stacked toolbar layout with an optional panel above or below.
 * This standardizes toolbar composition across node types while staying minimal.
 */
const NodeToolbarStack = memo(function NodeToolbarStack({
  toolbar,
  panel,
  panelPosition = "below",
  className,
}: NodeToolbarStackProps) {
  const panelNode = panel ?? null;
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      {panelPosition === "above" ? panelNode : null}
      {toolbar}
      {panelPosition === "below" ? panelNode : null}
    </div>
  );
});

export default NodeToolbarStack;
