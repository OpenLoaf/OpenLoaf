"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import { useTheme } from "next-themes";
import { AlertTriangleIcon } from "lucide-react";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { TrafficLights } from "@tenas-ai/ui/traffic-lights";
import {
  asPlainObject,
  isToolStreaming,
  parseJsonValue,
  type AnyToolPart,
} from "./shared/tool-utils";

/** Tool output payload for chart rendering. */
type ChartToolOutput =
  | {
      ok: true;
    }
  | {
      ok: false;
      error?: string;
      hints?: string[];
      rawOption?: string;
    };

/** Palette values used for chart theming. */
type ChartPalette = {
  foreground: string;
  mutedForeground: string;
  border: string;
};

/** Read a CSS variable value from document root. */
function readCssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolve palette values from current theme. */
function useChartPalette(): ChartPalette {
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = React.useState<ChartPalette>(() => ({
    foreground: "#111827",
    mutedForeground: "#6b7280",
    border: "#e5e7eb",
  }));

  React.useEffect(() => {
    const next = {
      foreground: readCssVar("--color-foreground", palette.foreground),
      mutedForeground: readCssVar("--color-muted-foreground", palette.mutedForeground),
      border: readCssVar("--color-border", palette.border),
    };
    setPalette(next);
  }, [resolvedTheme, palette.border, palette.foreground, palette.mutedForeground]);

  return palette;
}

/** Parse chart option payload. */
function parseChartOption(value: unknown): { option?: Record<string, unknown>; error?: string } {
  const objectValue = asPlainObject(value);
  if (objectValue) return { option: objectValue };

  if (typeof value === "string") {
    const parsed = parseJsonValue(value);
    const parsedObject = asPlainObject(parsed);
    if (parsedObject) return { option: parsedObject };
    return { error: "option 解析失败（非合法 JSON）。" };
  }

  return { error: "option 类型无效。" };
}

/** Apply theme defaults to chart option. */
function applyThemeDefaults(
  option: Record<string, unknown>,
  palette: ChartPalette,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...option };

  // 逻辑：标题已在消息右上角展示，图表内不再显示 title。
  if ("title" in next) {
    delete (next as Record<string, unknown>).title;
  }

  // 逻辑：缺省时注入统一色板。
  if (!Array.isArray(next.color)) {
    next.color = [
      "#5B8FF9",
      "#5AD8A6",
      "#F6BD16",
      "#E8684A",
      "#6DC8EC",
      "#9270CA",
      "#FF9D4D",
      "#269A99",
      "#FF99C3",
    ];
  }

  // 逻辑：补齐基础文本颜色，确保深浅色主题可读。
  const textStyle = asPlainObject(next.textStyle) ?? {};
  if (textStyle.color == null) {
    textStyle.color = palette.foreground;
  }
  next.textStyle = textStyle;

  // 逻辑：收紧默认 grid 留白，避免图表上方空白过大。
  const gridValue = asPlainObject(next.grid);
  const hasCustomGridBottom = gridValue?.bottom != null;
  if (!gridValue) {
    next.grid = { top: 12, left: 12, right: 12, bottom: 12, containLabel: true };
  } else {
    next.grid = {
      ...gridValue,
      top: gridValue.top ?? 8,
      left: gridValue.left ?? 12,
      right: gridValue.right ?? 12,
      bottom: gridValue.bottom ?? 8,
      containLabel: gridValue.containLabel ?? true,
    };
  }

  const legendValue = next.legend;
  const resolveLegendShown = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.some((item) => {
        const legendItem = asPlainObject(item);
        return legendItem?.show !== false;
      });
    }
    const legendItem = asPlainObject(value);
    return legendItem?.show !== false;
  };
  const resolveLegendAtBottom = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.some((item) => {
        const legendItem = asPlainObject(item);
        if (!legendItem) return false;
        if (legendItem.bottom != null) return true;
        if (legendItem.top == null && legendItem.left == null && legendItem.right == null) {
          return true;
        }
        return false;
      });
    }
    const legendItem = asPlainObject(value);
    if (!legendItem) return false;
    if (legendItem.bottom != null) return true;
    if (legendItem.top == null && legendItem.left == null && legendItem.right == null) return true;
    return false;
  };
  const extractLegendData = (value: unknown): string[] | null => {
    const legendObject = asPlainObject(value);
    const data = Array.isArray(legendObject?.data) ? legendObject?.data : null;
    if (data && data.every((item) => typeof item === "string")) {
      return data as string[];
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemObj = asPlainObject(item);
        const itemData = Array.isArray(itemObj?.data) ? itemObj?.data : null;
        if (itemData && itemData.every((entry) => typeof entry === "string")) {
          return itemData as string[];
        }
      }
    }
    return null;
  };
  const legendData = extractLegendData(legendValue);
  const applyLegendPosition = (legendItem: Record<string, unknown>) => {
    if (
      legendItem.top != null ||
      legendItem.bottom != null ||
      legendItem.left != null ||
      legendItem.right != null
    ) {
      return legendItem;
    }
    return { ...legendItem, bottom: 4, left: "center" };
  };
  const applyLegendShow = (legendItem: Record<string, unknown>) => {
    if (legendItem.show != null) return legendItem;
    return legendItem;
  };
  if (Array.isArray(legendValue)) {
    next.legend = legendValue.map((item) => {
      const legendItem = asPlainObject(item) ?? {};
      const legendText = asPlainObject(legendItem.textStyle) ?? {};
      if (legendText.color == null) {
        legendText.color = palette.mutedForeground;
      }
      return applyLegendShow(
        applyLegendPosition({ ...legendItem, textStyle: legendText }),
      );
    });
  } else if (asPlainObject(legendValue)) {
    const legendText = asPlainObject((legendValue as Record<string, unknown>).textStyle) ?? {};
    if (legendText.color == null) {
      legendText.color = palette.mutedForeground;
    }
    next.legend = applyLegendShow(
      applyLegendPosition({
      ...(legendValue as Record<string, unknown>),
      textStyle: legendText,
      }),
    );
  }

  const applyAxis = (
    axisValue: unknown,
    defaultType?: "category" | "value",
  ): unknown => {
    if (Array.isArray(axisValue)) {
      return axisValue.map((item) => applyAxis(item, defaultType));
    }
    const axisObject = asPlainObject(axisValue);
    if (!axisObject) return axisValue;
    if (defaultType && axisObject.type == null) {
      axisObject.type = defaultType;
    }
    const axisLabel = asPlainObject(axisObject.axisLabel) ?? {};
    if (axisLabel.color == null) {
      axisLabel.color = palette.mutedForeground;
    }
    const axisLine = asPlainObject(axisObject.axisLine) ?? {};
    const axisLineStyle = asPlainObject(axisLine.lineStyle) ?? {};
    if (axisLineStyle.color == null) {
      axisLineStyle.color = palette.border;
    }
    const splitLine = asPlainObject(axisObject.splitLine) ?? {};
    const splitLineStyle = asPlainObject(splitLine.lineStyle) ?? {};
    if (splitLineStyle.color == null) {
      splitLineStyle.color = palette.border;
    }
    if (splitLineStyle.type == null) {
      splitLineStyle.type = "dashed";
    }
    return {
      ...axisObject,
      axisLabel,
      axisLine: { ...axisLine, lineStyle: axisLineStyle },
      splitLine: { ...splitLine, lineStyle: splitLineStyle },
    };
  };

  const rawSeries = Array.isArray(next.series) ? next.series : [];
  const normalizedSeries: Record<string, unknown>[] = [];
  for (const item of rawSeries) {
    const seriesObject = asPlainObject(item);
    if (!seriesObject) continue;
    let seriesType =
      typeof seriesObject.type === "string" ? seriesObject.type.trim() : "";
    if (!seriesType) {
      const data = Array.isArray(seriesObject.data) ? seriesObject.data : null;
      const looksLikePie =
        data?.some((entry) => {
          const entryObj = asPlainObject(entry);
          return Boolean(entryObj && ("value" in entryObj || "name" in entryObj));
        }) ?? false;
      if (looksLikePie || seriesObject.radius != null || seriesObject.center != null) {
        seriesType = "pie";
      } else {
        seriesType = "bar";
      }
    }
    normalizedSeries.push({ ...seriesObject, type: seriesType });
  }
  if (normalizedSeries.length > 0) {
    next.series = normalizedSeries;
  }
  const seriesValue = normalizedSeries.length > 0 ? normalizedSeries : rawSeries;
  const nonCartesian = new Set([
    "pie",
    "radar",
    "gauge",
    "funnel",
    "treemap",
    "sunburst",
    "sankey",
    "graph",
    "map",
    "themeRiver",
    "tree",
    "wordCloud",
  ]);
  const hasCartesianSeries = seriesValue.some((item) => {
    const seriesObject = asPlainObject(item);
    const seriesType =
      typeof seriesObject?.type === "string" ? seriesObject.type : "";
    if (!seriesType) return true;
    return !nonCartesian.has(seriesType);
  });

  const hasAxisData = (axisValue: unknown): boolean => {
    if (Array.isArray(axisValue)) {
      return axisValue.some((axisItem) => {
        const axisObj = asPlainObject(axisItem);
        const data = Array.isArray(axisObj?.data) ? axisObj?.data : null;
        return Boolean(data && data.length > 0);
      });
    }
    const axisObj = asPlainObject(axisValue);
    const data = Array.isArray(axisObj?.data) ? axisObj?.data : null;
    return Boolean(data && data.length > 0);
  };

  const firstSeriesDataLength = (() => {
    if (seriesValue.length !== 1) return null;
    const seriesObj = asPlainObject(seriesValue[0]);
    const data = Array.isArray(seriesObj?.data) ? seriesObj?.data : null;
    return data ? data.length : null;
  })();
  const canPromoteLegendToAxis = Boolean(
    hasCartesianSeries &&
      legendData &&
      legendData.length > 0 &&
      !hasAxisData(next.xAxis) &&
      seriesValue.length === 1 &&
      firstSeriesDataLength != null &&
      firstSeriesDataLength === legendData.length,
  );
  if (canPromoteLegendToAxis) {
    if (Array.isArray(next.xAxis)) {
      const axis0 = asPlainObject(next.xAxis[0]) ?? {};
      const rest = next.xAxis.slice(1);
      next.xAxis = [
        { ...axis0, type: axis0.type ?? "category", data: legendData },
        ...rest,
      ];
    } else {
      const axisObj = asPlainObject(next.xAxis) ?? {};
      next.xAxis = {
        ...axisObj,
        type: axisObj.type ?? "category",
        data: legendData,
      };
    }
    // 逻辑：当 legend 仅用于类别时默认隐藏，避免与 xAxis 重复。
    if (asPlainObject(next.legend)) {
      const legendObj = next.legend as Record<string, unknown>;
      if (legendObj.show == null) {
        next.legend = { ...legendObj, show: false };
      }
    } else if (Array.isArray(next.legend)) {
      next.legend = next.legend.map((item) => {
        const legendItem = asPlainObject(item) ?? {};
        if (legendItem.show != null) return legendItem;
        return { ...legendItem, show: false };
      });
    }
  }

  if (hasCartesianSeries) {
    if (next.xAxis == null || (Array.isArray(next.xAxis) && next.xAxis.length === 0)) {
      next.xAxis = { type: "category" };
    }
    if (next.yAxis == null || (Array.isArray(next.yAxis) && next.yAxis.length === 0)) {
      next.yAxis = { type: "value" };
    }
  }

  const legendShown = resolveLegendShown(next.legend);
  const legendAtBottom = resolveLegendAtBottom(next.legend);
  if (legendShown && legendAtBottom && !hasCustomGridBottom) {
    const legendCount = legendData?.length ?? 0;
    const nextBottom = legendCount > 4 ? 52 : 40;
    const gridObject = asPlainObject(next.grid) ?? {};
    if (gridObject.bottom == null || gridObject.bottom <= 12) {
      next.grid = { ...gridObject, bottom: nextBottom };
    }
  }

  next.xAxis = applyAxis(next.xAxis, "category");
  next.yAxis = applyAxis(next.yAxis, "value");

  const tooltipValue = asPlainObject(next.tooltip);
  if (!tooltipValue) {
    next.tooltip = { trigger: "axis" };
  } else if (!("trigger" in tooltipValue)) {
    next.tooltip = { ...tooltipValue, trigger: "axis" };
  }

  const tooltipObject = asPlainObject(next.tooltip);
  if (tooltipObject) {
    const axisPointer = asPlainObject(tooltipObject.axisPointer);
    if (!axisPointer) {
      next.tooltip = {
        ...tooltipObject,
        axisPointer: {
          type: "line",
          lineStyle: {
            color: palette.border,
            width: 1,
            opacity: 0.6,
          },
        },
      };
    }
  }

  if (seriesValue.length > 0) {
    next.series = seriesValue.map((item) => {
      const seriesObject = asPlainObject(item);
      if (!seriesObject) return item;
      const seriesType = typeof seriesObject.type === "string" ? seriesObject.type : "";
      const nextSeries: Record<string, unknown> = { ...seriesObject };

      if (seriesType === "bar") {
        if (nextSeries.barMaxWidth == null) {
          nextSeries.barMaxWidth = 24;
        }
        const itemStyle = asPlainObject(nextSeries.itemStyle) ?? {};
        if (itemStyle.borderRadius == null) {
          itemStyle.borderRadius = 4;
        }
        nextSeries.itemStyle = itemStyle;
      }

      if (seriesType === "line") {
        if (nextSeries.symbol == null) {
          nextSeries.symbol = "circle";
        }
        if (nextSeries.symbolSize == null) {
          nextSeries.symbolSize = 6;
        }
        const lineStyle = asPlainObject(nextSeries.lineStyle) ?? {};
        if (lineStyle.width == null) {
          lineStyle.width = 2;
        }
        nextSeries.lineStyle = lineStyle;

        // 逻辑：仅当 areaStyle 已存在时补充默认透明度。
        if ("areaStyle" in nextSeries) {
          const areaStyle = asPlainObject(nextSeries.areaStyle) ?? {};
          if (areaStyle.opacity == null) {
            areaStyle.opacity = 0.18;
          }
          nextSeries.areaStyle = areaStyle;
        }
      }

      if (seriesType === "pie") {
        // 逻辑：默认把饼图上移，避免与底部 legend/label 冲突。
        if (nextSeries.center == null) {
          nextSeries.center = ["50%", "45%"];
        }
        if (nextSeries.radius == null) {
          nextSeries.radius = ["30%", "62%"];
        }
        const label = asPlainObject(nextSeries.label) ?? {};
        if (label.color == null) {
          label.color = palette.mutedForeground;
        }
        nextSeries.label = label;
      }

      return nextSeries;
    });
  }

  if (next.backgroundColor == null) {
    next.backgroundColor = "transparent";
  }

  return next;
}

/** Resolve auto height from chart option. */
function resolveAutoHeight(option?: Record<string, unknown>): number | null {
  if (!option) return null;

  const axisCandidates: unknown[] = [];
  if (option.xAxis != null) axisCandidates.push(option.xAxis);
  if (option.yAxis != null) axisCandidates.push(option.yAxis);

  let categoryCount = 0;
  for (const axis of axisCandidates) {
    const axisList = Array.isArray(axis) ? axis : [axis];
    for (const axisItem of axisList) {
      const axisObject = asPlainObject(axisItem);
      const data = Array.isArray(axisObject?.data) ? axisObject?.data : null;
      if (data && data.length > categoryCount) {
        categoryCount = data.length;
      }
    }
  }

  if (categoryCount <= 0) {
    const series = Array.isArray(option.series) ? option.series : [];
    for (const item of series) {
      const seriesObject = asPlainObject(item);
      const data = Array.isArray(seriesObject?.data) ? seriesObject?.data : null;
      if (data && data.length > categoryCount) {
        categoryCount = data.length;
      }
    }
  }

  if (categoryCount <= 0) return null;

  const base = 120;
  const perRow = 18;
  const min = 180;
  const max = 420;
  return Math.max(min, Math.min(max, base + categoryCount * perRow));
}

/** Render chart tool card. */
export default function ChartTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
}) {
  const output = asPlainObject(part.output) as ChartToolOutput | null;
  const input = asPlainObject(part.input);
  const palette = useChartPalette();

  const title =
    typeof input?.title === "string"
      ? input.title
      : undefined;
  const height =
    typeof input?.height === "number"
      ? input.height
      : undefined;

  const optionPayload = input?.option;
  const parsed = parseChartOption(optionPayload);
  const outputError = output && output.ok === false ? output : null;
  const errorText =
    typeof outputError?.error === "string" && outputError.error.trim()
      ? outputError.error
      : typeof part.errorText === "string" && part.errorText.trim()
        ? part.errorText
        : parsed.error;
  const hints = Array.isArray(outputError?.hints) ? outputError?.hints : [];
  const rawOption =
    typeof outputError?.rawOption === "string"
      ? outputError.rawOption
      : typeof optionPayload === "string"
        ? optionPayload
        : undefined;

  const resolvedOption = parsed.option
    ? applyThemeDefaults(parsed.option, palette)
    : undefined;

  const isStreaming = isToolStreaming(part);
  const hasError = Boolean(errorText && errorText.trim().length > 0);
  const headerHeight = 32;
  const autoHeight = resolveAutoHeight(resolvedOption);
  const cardHeight = Number.isFinite(height)
    ? Math.max(180, height as number)
    : autoHeight ?? 220;

  // 逻辑：窗口状态映射
  const windowState = hasError
    ? ("error" as const)
    : isStreaming
      ? ("running" as const)
      : resolvedOption
        ? ("success" as const)
        : ("idle" as const);

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div
        className="overflow-hidden rounded-lg border bg-card text-card-foreground"
        style={errorText ? undefined : { height: cardHeight }}
      >
        <div className="flex h-8 items-center gap-2 border-b bg-muted/50 px-3">
          <TrafficLights state={windowState} />
          {title ? (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {title}
            </span>
          ) : null}
        </div>
        {isStreaming ? (
          <div className="flex h-full items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
            <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            解析中...
          </div>
        ) : hasError ? (
          <div className="space-y-3 px-4 py-4 text-destructive">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangleIcon className="mt-0.5 size-4" />
              <div>
                <div className="font-medium">图表参数解析失败</div>
                <div className="text-xs text-destructive/80">{errorText}</div>
              </div>
            </div>
            {hints.length ? (
              <div className="text-xs text-muted-foreground">
                建议：
                <div className="mt-1 space-y-1">
                  {hints.map((hint, index) => (
                    <div key={`chart-hint-${index}`}>• {hint}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {rawOption ? (
              <div className="space-y-2 text-foreground">
                <div className="text-xs font-medium text-muted-foreground">
                  原始 option
                </div>
                <div className="rounded-md bg-muted/50">
                  <CodeBlock code={rawOption} language="json" />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ height: `calc(${cardHeight}px - ${headerHeight}px)` }}>
            {resolvedOption ? (
              <ReactECharts
                option={resolvedOption as any}
                style={{ height: "100%", width: "100%" }}
                notMerge
                lazyUpdate
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                暂无可渲染的图表配置。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
