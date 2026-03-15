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

import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@udecode/cn";
import { Type } from "lucide-react";

import type { CanvasConnectorTemplateDefinition } from "../engine/types";

type NodePickerProps = {
  position: [number, number];
  /** Horizontal alignment relative to the drop point. */
  align?: "left" | "right" | "center";
  templates: CanvasConnectorTemplateDefinition[];
  onSelect: (templateId: string) => void;
};

/**
 * Resolve the CSS translate class for the picker alignment.
 *
 * - `left`:   panel sits to the right of the drop point (line enters from left)
 * - `right`:  panel sits to the left (line enters from right)
 * - `center`: centered on the drop point
 */
function resolveAlignClass(align: NodePickerProps["align"]) {
  switch (align) {
    case "left":
      return "translate-x-0";
    case "right":
      return "-translate-x-full";
    default:
      return "-translate-x-1/2";
  }
}

export const NodePicker = forwardRef<HTMLDivElement, NodePickerProps>(
  /** Render the node picker for connector drops. */
  function NodePicker({ position, align = "center", templates, onSelect }, ref) {
    const { t } = useTranslation('board');
    return (
      <div
        ref={ref}
        data-node-picker
        className={cn(
          "pointer-events-none absolute z-30 -translate-y-1/2",
          resolveAlignClass(align),
        )}
        style={{ left: position[0], top: position[1] }}
      >
        <div
          data-connector-drop-panel
          className="pointer-events-auto ol-glass-toolbar rounded-xl p-1 ring-1 ring-border/70"
        >
          {templates.length ? (
            <div className="flex items-center gap-0.5">
              {templates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-1 rounded-lg px-3 py-2",
                    "text-ol-text-auxiliary transition-colors duration-100",
                    "hover:bg-foreground/8 hover:text-ol-text-primary",
                    "dark:hover:bg-foreground/10",
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ol-surface-muted text-ol-text-auxiliary transition-colors group-hover:bg-ol-blue-bg group-hover:text-ol-blue">
                    {item.icon ?? <Type size={16} />}
                  </span>
                  <span className="whitespace-nowrap text-[11px] font-medium leading-3">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-[11px] text-ol-text-auxiliary">
              {t('nodePicker.empty')}
            </div>
          )}
        </div>
      </div>
    );
  },
);

NodePicker.displayName = "NodePicker";
