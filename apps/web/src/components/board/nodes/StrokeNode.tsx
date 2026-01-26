import { STROKE_NODE_TYPE } from "../engine/types";
import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
  StrokeNodeProps,
} from "../engine/types";
import { z } from "zod";
import { buildStrokeOutline } from "../utils/stroke-path";
import { cn } from "@udecode/cn";

/** 笔迹工具条颜色预设。 */
const STROKE_COLORS = [
  { label: "黑", value: "#111827" },
  { label: "蓝", value: "#1d4ed8" },
  { label: "橙", value: "#f59e0b" },
  { label: "红", value: "#ef4444" },
  { label: "绿", value: "#16a34a" },
] as const;

/** 选中高亮的外扩距离（世界坐标）。 */
const STROKE_HIGHLIGHT_GROW = 6;

/** Build a smooth SVG path from stroke outline points. */
function buildPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (!first) return "";
  if (points.length < 2) {
    return `M ${first[0]} ${first[1]} Z`;
  }
  const segments: string[] = [];
  // 逻辑：用二次贝塞尔连接轮廓点，避免急转弯出现直角折线。
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    segments.push(`Q ${current[0]} ${current[1]} ${midX} ${midY}`);
  }
  return `M ${first[0]} ${first[1]} ${segments.join(" ")} Z`;
}

/** 构建笔迹节点的工具条条目。 */
function createStrokeToolbarItems(ctx: CanvasToolbarContext<StrokeNodeProps>) {
  return STROKE_COLORS.map(color => {
    const isActive = ctx.element.props.color === color.value;
    return {
      id: `stroke-color-${color.value}`,
      label: color.label,
      showLabel: false,
      icon: (
        <span
          className={cn(
            "h-6 w-6 rounded-full ring-1 ring-border",
            isActive &&
              "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
          )}
          style={{ backgroundColor: color.value }}
        />
      ),
      onSelect: () => ctx.updateNodeProps({ color: color.value }),
    };
  });
}

/** 使用 SVG 路径渲染笔迹节点。 */
export function StrokeNodeView({ element, selected }: CanvasNodeViewProps<StrokeNodeProps>) {
  const { points, color, size, opacity, tool } = element.props;
  const width = element.xywh[2];
  const height = element.xywh[3];
  const highlightAlpha = Math.min(0.35, opacity + 0.2);

  if (points.length === 0) return null;

  if (points.length === 1) {
    const [px, py] = points[0];
    return (
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
      >
        {selected ? (
          <circle
            cx={px}
            cy={py}
            r={size / 2 + STROKE_HIGHLIGHT_GROW}
            fill={color}
            fillOpacity={highlightAlpha}
          />
        ) : null}
        <circle cx={px} cy={py} r={size / 2} fill={color} fillOpacity={opacity} />
      </svg>
    );
  }

  // 逻辑：笔迹路径使用轮廓填充，保证和 Canvas 渲染一致。
  const outline = buildStrokeOutline(points, { size, tool });
  const path = buildPath(outline);
  const highlightOutline = selected
    ? buildStrokeOutline(points, { size: size + STROKE_HIGHLIGHT_GROW, tool })
    : [];
  const highlightPath = selected ? buildPath(highlightOutline) : "";

  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {selected && highlightPath ? (
        <path d={highlightPath} fill={color} fillOpacity={highlightAlpha} />
      ) : null}
      {path ? <path d={path} fill={color} fillOpacity={opacity} /> : null}
    </svg>
  );
}

export const StrokeNodeDefinition: CanvasNodeDefinition<StrokeNodeProps> = {
  type: STROKE_NODE_TYPE,
  schema: z.object({
    tool: z.enum(["pen", "highlighter"]),
    points: z.array(
      z.union([
        z.tuple([z.number(), z.number()]),
        z.tuple([z.number(), z.number(), z.number()]),
      ])
    ),
    color: z.string(),
    size: z.number(),
    opacity: z.number(),
  }),
  defaultProps: {
    tool: "pen",
    points: [],
    color: "#f59e0b",
    size: 6,
    opacity: 1,
  },
  view: StrokeNodeView,
  capabilities: {
    resizable: false,
    rotatable: false,
    connectable: "none",
  },
  toolbar: ctx => createStrokeToolbarItems(ctx),
};
