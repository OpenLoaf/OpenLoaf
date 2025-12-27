import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { z } from "zod";
import { Info, MoreHorizontal } from "lucide-react";

export type PlaceholderNodeProps = {
  /** Title text displayed in the card. */
  title: string;
  /** Description text displayed in the card. */
  description: string;
};

/** Build toolbar items for placeholder nodes. */
function createPlaceholderToolbarItems(
  ctx: CanvasToolbarContext<PlaceholderNodeProps>
) {
  /** Placeholder action handler to keep UI responsive. */
  const noop = () => {};
  return [
    {
      id: "inspect",
      label: "详情",
      icon: <Info size={14} />,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
    { id: "more", label: "更多", icon: <MoreHorizontal size={14} />, onSelect: noop },
  ];
}

/** Render a placeholder node used for early layout testing. */
export function PlaceholderNodeView({
  element,
  selected,
}: CanvasNodeViewProps<PlaceholderNodeProps>) {
  return (
    <div
      className={[
        "h-full w-full rounded-xl border box-border p-4",
        "border-slate-300 bg-white ",
        "dark:border-slate-700 dark:bg-slate-900",
        selected
          ? "dark:border-sky-400 dark:shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
          : "",
      ].join(" ")}
    >
      <div className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
        {element.props.title}
      </div>
      <div className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
        {element.props.description}
      </div>
    </div>
  );
}

/** Definition for the placeholder node. */
export const PlaceholderNodeDefinition: CanvasNodeDefinition<PlaceholderNodeProps> =
  {
    type: "placeholder",
    schema: z.object({
      title: z.string(),
      description: z.string(),
    }),
    defaultProps: {
      title: "Placeholder",
      description: "Replace with your own React component.",
    },
    view: PlaceholderNodeView,
    capabilities: {
      resizable: true,
      rotatable: false,
      connectable: "anchors",
      minSize: { w: 220, h: 140 },
      maxSize: { w: 720, h: 420 },
    },
    // 逻辑：占位节点提供基础工具条骨架，后续替换为业务动作。
    toolbar: ctx => createPlaceholderToolbarItems(ctx),
  };
