/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasAnchorDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasRect,
  CanvasToolbarContext,
} from "../engine/types";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import i18next from "i18next";
import { Palette } from "lucide-react";
import { cn } from "@udecode/cn";
import { BOARD_TOOLBAR_ITEM_BLUE } from "../ui/board-style-system";
import { NodeFrame } from "./NodeFrame";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShapeType =
  | "rectangle"
  | "rounded_rectangle"
  | "ellipse"
  | "diamond"
  | "triangle";

export type ShapeNodeProps = {
  shape: ShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
  opacity?: number;
  borderRadius?: number;
};

// ---------------------------------------------------------------------------
// Shape clip-path definitions
// ---------------------------------------------------------------------------

const CLIP_PATHS: Record<ShapeType, string> = {
  rectangle: "none",
  rounded_rectangle: "none",
  ellipse: "ellipse(50% 50% at 50% 50%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
};

function getShapeStyle(props: ShapeNodeProps): React.CSSProperties {
  const clipPath = CLIP_PATHS[props.shape];
  const isRounded = props.shape === "rounded_rectangle";
  return {
    backgroundColor: props.fill,
    border: `${props.strokeWidth}px solid ${props.stroke}`,
    clipPath: clipPath !== "none" ? clipPath : undefined,
    borderRadius: isRounded ? (props.borderRadius ?? 12) : props.shape === "rectangle" ? 2 : 0,
    opacity: props.opacity ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Anchor definitions per shape type
// ---------------------------------------------------------------------------

function getShapeAnchors(
  _props: ShapeNodeProps,
  bounds: CanvasRect,
): CanvasAnchorDefinition[] {
  const { x, y, w, h } = bounds;
  return [
    { id: "top", point: [x + w / 2, y] },
    { id: "right", point: [x + w, y + h / 2] },
    { id: "bottom", point: [x + w / 2, y + h] },
    { id: "left", point: [x, y + h / 2] },
  ];
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function createShapeToolbarItems(ctx: CanvasToolbarContext<ShapeNodeProps>) {
  return [
    {
      id: "color",
      label: i18next.t("board:shapeNode.toolbar.color"),
      icon: <Palette size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.openInspector(ctx.element.id),
    },
  ];
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function ShapeNodeView({
  element,
  selected,
}: CanvasNodeViewProps<ShapeNodeProps>) {
  const { props } = element;
  const [isEditing, setIsEditing] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);

  const shapeStyle = getShapeStyle(props);
  const needsClip = CLIP_PATHS[props.shape] !== "none";

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    requestAnimationFrame(() => {
      textRef.current?.focus();
    });
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <NodeFrame>
      <div
        className="relative h-full w-full"
        style={shapeStyle}
        onDoubleClick={handleDoubleClick}
      >
        <div
          ref={textRef}
          className={cn(
            "absolute inset-0 flex items-center justify-center text-center text-sm font-medium",
            "outline-none select-text",
            needsClip ? "px-[20%] py-[10%]" : "px-2 py-1",
          )}
          style={{
            color: getContrastColor(props.fill),
            fontSize: Math.max(10, Math.min(16, element.xywh[2] / 12)),
          }}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={handleBlur}
          data-board-editor={isEditing ? "true" : undefined}
        >
          {props.text || (isEditing ? "" : null)}
        </div>
      </div>
    </NodeFrame>
  );
}

/** Simple contrast color helper. */
function getContrastColor(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length < 6) return "#000000";
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const ShapeNodeDefinition: CanvasNodeDefinition<ShapeNodeProps> = {
  type: "shape",
  schema: z.object({
    shape: z.enum(["rectangle", "rounded_rectangle", "ellipse", "diamond", "triangle"]),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: z.number(),
    text: z.string(),
    opacity: z.number().optional(),
    borderRadius: z.number().optional(),
  }),
  defaultProps: {
    shape: "rectangle",
    fill: "#3b82f6",
    stroke: "#2563eb",
    strokeWidth: 2,
    text: "",
  },
  view: ShapeNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: { w: 40, h: 40 },
    maxSize: { w: 800, h: 800 },
  },
  anchors: getShapeAnchors,
  toolbar: (ctx) => createShapeToolbarItems(ctx),
};
