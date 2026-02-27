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
    return (
      <div
        ref={ref}
        data-node-picker
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-3"
        style={{ left: position[0], top: position[1] }}
      >
        <div className="pointer-events-auto min-w-[260px] rounded-2xl border border-slate-200/80 bg-background/95 p-2.5 text-slate-700 shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/80 backdrop-blur dark:border-slate-700/80 dark:text-slate-200 dark:ring-slate-700/60">
          <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-300">选择节点</div>
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
                  className="group flex w-full items-start gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-2 text-left transition hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                    {item.icon ?? <Type size={14} />}
                  </span>
                  <span className="min-w-0">
                    <div className="text-[12px] font-medium leading-4 text-slate-800 dark:text-slate-100">
                      {item.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                      {item.description}
                    </div>
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200/70 px-2.5 py-2 text-[11px] text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                无可用节点
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

NodePicker.displayName = "NodePicker";
