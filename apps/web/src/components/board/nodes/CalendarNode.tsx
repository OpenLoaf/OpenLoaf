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

import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { z } from "zod";
import { Calendar } from "@openloaf/ui/date-picker";
import { NodeFrame } from "./NodeFrame";

export type CalendarNodeProps = Record<string, never>;

/** Render a calendar node with internal size toolbar. */
export function CalendarNodeView(_props: CanvasNodeViewProps<CalendarNodeProps>) {
  return (
    <NodeFrame>
      <div
        className={[
          "h-full w-full min-h-0 min-w-0 rounded-sm border border-slate-300 box-border",
          "bg-white/95 dark:border-slate-700 dark:bg-slate-900/90",
        ].join(" ")}
      >
        {/* 逻辑：日历直接填充节点容器。 */}
        <Calendar className="h-full w-full rounded-sm border border-border/80 bg-background/95 shadow-sm" />
      </div>
    </NodeFrame>
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
    resizeMode: "ratio-range",
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 240, h: 280 },
    maxSize: { w: 720, h: 580 },
  },
  // 逻辑：日历节点沿用通用工具条。
  toolbar: () => [],
};
