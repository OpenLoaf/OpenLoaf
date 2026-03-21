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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation('desktop');
  return (
    <button
      type="button"
      className={cn(
        "desktop-edit-action-button desktop-trash-button flex size-6 items-center justify-center rounded-3xl",
        "bg-transparent text-destructive border border-border shadow-none",
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
      aria-label={t('tile.delete')}
      title={t('tile.delete')}
    >
      <Trash2 className="desktop-edit-action-icon desktop-trash-icon size-4" />
    </button>
  );
}
