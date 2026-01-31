import type {
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { z } from "zod";
import { Columns2, Layers, Maximize2, Rows2 } from "lucide-react";
import { cn } from "@udecode/cn";
import { GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE } from "../engine/grouping";
import { NodeFrame } from "./NodeFrame";

export type GroupNodeProps = {
  /** Child node ids stored for grouping semantics. */
  childIds: string[];
};

/** Render a transparent group container. */
function GroupNodeView({ selected }: CanvasNodeViewProps<GroupNodeProps>) {
  return (
    <NodeFrame>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-sm border-[4px] border-dashed",
          selected
            ? "border-slate-600/90 dark:border-slate-200/90"
            : "border-slate-500/70 dark:border-slate-300/70"
        )}
      />
    </NodeFrame>
  );
}

const groupSchema = z.object({
  childIds: z.array(z.string()),
});

const groupCapabilities = {
  resizable: false,
  rotatable: false,
  connectable: "anchors" as const,
};

function createGroupToolbarItems(ctx: CanvasToolbarContext<GroupNodeProps>) {
  const groupId = ctx.element.id;
  const layoutAxis = ctx.getGroupLayoutAxis(groupId);
  const layoutItems = [];
  if (layoutAxis === "row") {
    layoutItems.push({
      id: "layout-column",
      label: "纵向布局",
      icon: <Rows2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "column"),
    });
  } else if (layoutAxis === "column") {
    layoutItems.push({
      id: "layout-row",
      label: "横向布局",
      icon: <Columns2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "row"),
    });
  } else {
    layoutItems.push({
      id: "layout-row",
      label: "横向布局",
      icon: <Columns2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "row"),
    });
  }

  return [
    {
      id: "ungroup",
      label: "解散",
      icon: <Layers size={14} />,
      onSelect: () => ctx.ungroupSelection(),
    },
    {
      id: "uniform-size",
      label: "统一大小",
      icon: <Maximize2 size={14} />,
      onSelect: () => ctx.uniformGroupSize(groupId),
    },
    ...layoutItems,
  ];
}

/** Definition for a generic group node. */
export const GroupNodeDefinition: CanvasNodeDefinition<GroupNodeProps> = {
  type: GROUP_NODE_TYPE,
  schema: groupSchema,
  defaultProps: {
    childIds: [],
  },
  view: GroupNodeView,
  capabilities: groupCapabilities,
  toolbar: ctx => createGroupToolbarItems(ctx),
};

/** Definition for an image group node. */
export const ImageGroupNodeDefinition: CanvasNodeDefinition<GroupNodeProps> = {
  type: IMAGE_GROUP_NODE_TYPE,
  schema: groupSchema,
  defaultProps: {
    childIds: [],
  },
  view: GroupNodeView,
  capabilities: groupCapabilities,
  toolbar: ctx => createGroupToolbarItems(ctx),
};
