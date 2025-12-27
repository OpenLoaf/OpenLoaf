"use client";

import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { z } from "zod";
import CalendarPanel from "../ui/CalendarPanel";

export type CalendarNodeProps = Record<string, never>;

/** Render a calendar node with internal size toolbar. */
export function CalendarNodeView({
  selected,
  element,
}: CanvasNodeViewProps<CalendarNodeProps>) {
  /** 当前节点尺寸，用于驱动日历自适应。 */
  const [, , width, height] = element.xywh;
  return (
    <div
      className={[
        "h-full w-full rounded-2xl border box-border",
        selected ? "border-slate-900" : "border-slate-300",
        "bg-white/95 dark:border-slate-700 dark:bg-slate-900/90",
      ].join(" ")}
    >
      <CalendarPanel className="h-full w-full" size={{ width, height }} />
    </div>
  );
}

/** Definition for the calendar node. */
export const CalendarNodeDefinition: CanvasNodeDefinition<CalendarNodeProps> = {
  type: "calendar",
  schema: z.object({}),
  defaultProps: {},
  view: CalendarNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 280, h: 240 },
    maxSize: { w: 720, h: 560 },
  },
  // 逻辑：日历节点沿用通用工具条。
  toolbar: () => [],
};
