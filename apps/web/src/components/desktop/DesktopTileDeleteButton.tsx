/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
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
        "desktop-edit-action-button desktop-trash-button flex size-6 items-center justify-center rounded-full",
        "bg-transparent text-destructive border border-border shadow-sm",
        className
      )}
      data-wiggle="loop"
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
      <Trash2 className="desktop-edit-action-icon desktop-trash-icon size-4" />
    </button>
  );
}
