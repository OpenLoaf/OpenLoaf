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
  CanvasNodeDefinition,
  CanvasNodeViewProps,
  CanvasToolbarContext,
} from "../engine/types";
import { z } from "zod";
import { Columns2, Layers, Maximize2, Rows2 } from "lucide-react";
import { cn } from "@udecode/cn";
import i18next from "i18next";
import { GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE } from "../engine/grouping";
import { NodeFrame } from "./NodeFrame";

export type GroupNodeProps = {
  /** Child node ids stored for grouping semantics. */
  childIds: string[];
};

/** Render a transparent group container. */
function GroupNodeView(_props: CanvasNodeViewProps<GroupNodeProps>) {
  return (
    <NodeFrame>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-sm border-[4px] border-dashed",
          "border-slate-500/70 dark:border-slate-300/70"
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
  const t = (k: string) => i18next.t(k);
  const groupId = ctx.element.id;
  const layoutAxis = ctx.getGroupLayoutAxis(groupId);
  const layoutItems = [];
  if (layoutAxis === "row") {
    layoutItems.push({
      id: 'layout-column',
      label: t('board:groupNode.layoutVertical'),
      icon: <Rows2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "column"),
    });
  } else if (layoutAxis === "column") {
    layoutItems.push({
      id: 'layout-row',
      label: t('board:groupNode.layoutHorizontal'),
      icon: <Columns2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "row"),
    });
  } else {
    layoutItems.push({
      id: 'layout-row',
      label: t('board:groupNode.layoutHorizontal'),
      icon: <Columns2 size={14} />,
      onSelect: () => ctx.layoutGroup(groupId, "row"),
    });
  }

  return [
    {
      id: 'ungroup',
      label: t('board:groupNode.dissolve'),
      icon: <Layers size={14} />,
      onSelect: () => ctx.ungroupSelection(),
    },
    {
      id: 'uniform-size',
      label: t('board:groupNode.uniformSize'),
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
