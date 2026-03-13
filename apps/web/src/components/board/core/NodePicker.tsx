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
import { Type } from "lucide-react";

import type { CanvasConnectorTemplateDefinition } from "../engine/types";

type NodePickerProps = {
  position: [number, number];
  templates: CanvasConnectorTemplateDefinition[];
  onSelect: (templateId: string) => void;
};

export const NodePicker = forwardRef<HTMLDivElement, NodePickerProps>(
  /** Render the node picker for connector drops. */
  function NodePicker({ position, templates, onSelect }, ref) {
    const { t } = useTranslation('board');
    return (
      <div
        ref={ref}
        data-node-picker
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-3"
        style={{ left: position[0], top: position[1] }}
      >
        <div className="pointer-events-auto min-w-[260px] rounded-lg border border-ol-divider bg-background/95 p-2.5 text-ol-text-auxiliary shadow-sm ring-1 ring-ol-divider backdrop-blur">
          <div className="mb-2 text-[11px] text-ol-text-auxiliary">{t('nodePicker.title')}</div>
          <div className="flex max-h-[280px] flex-col gap-1 overflow-auto pr-1">
            {templates.length ? (
              templates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={(event) => {
                    // 逻辑：优先响应按下，避免 click 被画布层吞掉。
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                  className="group flex w-full items-start gap-2 rounded-lg border border-ol-divider bg-ol-surface-muted px-2.5 py-2 text-left transition-colors duration-150 hover:bg-ol-divider"
                >
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg bg-ol-surface-muted text-ol-text-auxiliary">
                    {item.icon ?? <Type size={14} />}
                  </span>
                  <span className="min-w-0">
                    <div className="text-[12px] font-medium leading-4 text-ol-text-primary">
                      {item.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ol-text-auxiliary">
                      {item.description}
                    </div>
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-ol-divider px-2.5 py-2 text-[11px] text-ol-text-auxiliary">
                {t('nodePicker.empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

NodePicker.displayName = "NodePicker";
