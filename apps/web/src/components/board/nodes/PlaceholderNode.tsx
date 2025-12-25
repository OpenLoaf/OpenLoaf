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
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        padding: 16,
        boxSizing: "border-box",
        border: selected ? "2px solid #0f172a" : "1px solid #cbd5f5",
        background: selected ? "#f8fafc" : "#ffffff",
        boxShadow: selected
          ? "0 12px 30px rgba(15, 23, 42, 0.15)"
          : "0 8px 20px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
        {element.props.title}
      </div>
      <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
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
    },
  };
