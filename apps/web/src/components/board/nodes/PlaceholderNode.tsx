import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../CanvasTypes";
import { z } from "zod";

export type PlaceholderNodeProps = {
  /** Title text displayed in the card. */
  title: string;
  /** Description text displayed in the card. */
  description: string;
};

/** Render a placeholder node used for early layout testing. */
export function PlaceholderNodeView({
  element,
  selected,
}: CanvasNodeViewProps<PlaceholderNodeProps>) {
  return (
    <div
      className={[
        "h-full w-full rounded-xl border box-border p-4",
        selected
          ? "border-slate-900 bg-slate-50 shadow-[0_12px_30px_rgba(15,23,42,0.15)]"
          : "border-slate-300 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]",
        "dark:border-slate-700 dark:bg-slate-900",
        selected
          ? "dark:border-sky-400 dark:shadow-[0_16px_36px_rgba(0,0,0,0.55)]"
          : "dark:shadow-[0_12px_28px_rgba(0,0,0,0.4)]",
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
  };
