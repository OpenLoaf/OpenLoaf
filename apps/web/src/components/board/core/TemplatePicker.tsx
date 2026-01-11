"use client";

import { forwardRef, useMemo, useState } from "react";
import { Search, Sparkles, Type } from "lucide-react";

import type { BoardTemplateDefinition, BoardTemplateId } from "../templates/template-catalog";

type TemplatePickerProps = {
  position: [number, number];
  templates: BoardTemplateDefinition[];
  onSelect: (templateId: BoardTemplateId) => void;
};

function getTemplateIcon(id: BoardTemplateId) {
  if (id === "image_prompt") return <Sparkles size={14} />;
  return <Type size={14} />;
}

export const TemplatePicker = forwardRef<HTMLDivElement, TemplatePickerProps>(
  function TemplatePicker({ position, templates, onSelect }, ref) {
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return templates;
      return templates.filter((item) => {
        return (
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
        );
      });
    }, [query, templates]);

    return (
      <div
        ref={ref}
        data-template-picker
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-3"
        style={{ left: position[0], top: position[1] }}
      >
        <div className="pointer-events-auto min-w-[260px] rounded-2xl border border-slate-200/80 bg-background/95 p-2.5 text-slate-700 shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/80 backdrop-blur dark:border-slate-700/80 dark:text-slate-200 dark:ring-slate-700/60">
          <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-300">
            选择模板
          </div>
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200/80 bg-background px-2 py-1.5 dark:border-slate-700/80">
            <Search size={14} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索…"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex max-h-[280px] flex-col gap-1 overflow-auto pr-1">
            {filtered.length ? (
              filtered.map((item) => (
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
                    {getTemplateIcon(item.id)}
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
                无匹配模板
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

TemplatePicker.displayName = "TemplatePicker";

