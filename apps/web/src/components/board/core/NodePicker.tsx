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
        <div className="pointer-events-auto min-w-[260px] rounded-2xl border border-[#e3e8ef] bg-background/95 p-2.5 text-[#5f6368] shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-[#e3e8ef] backdrop-blur dark:border-slate-700 dark:text-slate-200 dark:ring-slate-700">
          <div className="mb-2 text-[11px] text-[#5f6368] dark:text-slate-300">选择节点</div>
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
                  className="group flex w-full items-start gap-2 rounded-xl border border-[#e3e8ef] bg-[#f6f8fc] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-[#f1f3f4] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-[hsl(var(--muted)/0.42)]"
                >
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg bg-[#f1f3f4] text-[#5f6368] dark:bg-slate-900 dark:text-slate-300">
                    {item.icon ?? <Type size={14} />}
                  </span>
                  <span className="min-w-0">
                    <div className="text-[12px] font-medium leading-4 text-[#202124] dark:text-slate-100">
                      {item.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#5f6368] dark:text-slate-400">
                      {item.description}
                    </div>
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[#e3e8ef] px-2.5 py-2 text-[11px] text-[#5f6368] dark:border-slate-700 dark:text-slate-400">
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
