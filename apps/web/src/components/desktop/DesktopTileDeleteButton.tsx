"use client";

import * as React from "react";
import { Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DesktopTileDeleteButtonProps {
  onDelete: () => void;
  className?: string;
}

/** Render an iOS-style "remove" button for a tile. */
export default function DesktopTileDeleteButton({
  onDelete,
  className,
}: DesktopTileDeleteButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-6 items-center justify-center rounded-full",
        "bg-background text-foreground shadow-sm border border-border",
        className
      )}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
      aria-label="Delete"
      title="Delete"
    >
      <Minus className="size-4" />
    </button>
  );
}
