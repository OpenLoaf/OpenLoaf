"use client";

import { useMemo, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@udecode/cn";

/** 日历组件：渲染 DayPicker 视图。 */
export default function CalendarPanel(props: {
  className?: string;
  /** 节点尺寸，用于动态计算单元格大小。 */
  size?: { width: number; height: number };
}) {
  const { className, size } = props;
  /** 逻辑：根据节点尺寸估算单元格大小，保持随容器缩放。 */
  const cellSize = useMemo(() => {
    if (!size) return 28;
    const availableWidth = Math.max(size.width - 16, 120);
    const availableHeight = Math.max(size.height - 72, 120);
    return Math.floor(
      Math.max(20, Math.min(48, Math.min(availableWidth / 7, availableHeight / 6)))
    );
  }, [size]);
  /** 逻辑：今日圆圈大小随单元格收缩。 */
  const todaySize = Math.max(14, Math.floor(cellSize * 0.75));
  /** 日历主题变量，用于规避默认蓝色强调。 */
  const themeStyle = useMemo(
    () =>
      ({
        // @ts-expect-error: DayPicker 支持 CSS 变量自定义
        "--rdp-accent-color": "#0f172a",
        // @ts-expect-error: DayPicker 支持 CSS 变量自定义
        "--rdp-accent-background-color": "#e2e8f0",
        // @ts-expect-error: DayPicker 支持 CSS 变量自定义
        "--rdp-range-middle-background-color": "#f1f5f9",
        // @ts-expect-error: DayPicker 支持 CSS 变量自定义
        "--rdp-outline": "2px solid #0f172a",
        // @ts-expect-error: DayPicker 支持 CSS 变量自定义
        "--rdp-cell-size": `${cellSize}px`,
      }) as CSSProperties,
    [cellSize]
  );

  return (
    <div
      className={cn(
        "calendar-panel h-full w-full rounded-2xl border border-border/80 bg-background/95 p-3 shadow-sm",
        className
      )}
    >
      <DayPicker
        style={themeStyle}
        showOutsideDays
        numberOfMonths={1}
        styles={{
          months: { width: "100%" },
          month: { width: "100%" },
          table: { width: "100%" },
          head_row: { width: "100%" },
          row: { width: "100%" },
          head_cell: { width: cellSize, height: cellSize },
          day: { width: cellSize, height: cellSize },
        }}
        modifiersStyles={{
          today: {
            backgroundColor: "transparent",
            color: "inherit",
            borderRadius: "9999px",
            width: `${todaySize}px`,
            height: `${todaySize}px`,
            lineHeight: `${todaySize}px`,
            padding: "0",
            boxShadow: "inset 0 0 0 2px currentColor",
          },
        }}
      />
    </div>
  );
}
