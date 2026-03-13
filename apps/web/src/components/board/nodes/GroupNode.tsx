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
  CanvasToolbarContext,
  CanvasNodeViewProps,
} from "../engine/types";
import { z } from "zod";
import { Layers, Maximize2 } from "lucide-react";
import { cn } from "@udecode/cn";
import i18next from "i18next";
import {
  BOARD_TOOLBAR_ITEM_AMBER,
  BOARD_TOOLBAR_ITEM_BLUE,
} from "../ui/board-style-system";
import { GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE, getGroupMemberIds } from "../engine/grouping";
import { NodeFrame } from "./NodeFrame";
import {
  getBoardChatMessageMeta,
} from "../utils/board-chat-message";
import { createBoardChatMessageToolbarItems } from "../utils/board-chat-toolbar";

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
          "pointer-events-none absolute inset-0 rounded-lg",
          "bg-foreground/10 dark:bg-foreground/8"
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

/** Node types eligible for uniform-size inside a group. */
const UNIFORM_SIZE_TYPES = new Set(["image", "video"]);
function createGroupToolbarItems(ctx: CanvasToolbarContext<GroupNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const groupId = ctx.element.id;
  const boardChatMeta = getBoardChatMessageMeta(ctx.element);
  if (boardChatMeta) {
    const chatItems = createBoardChatMessageToolbarItems(ctx, boardChatMeta);
    if ((boardChatMeta.status ?? "streaming") !== "complete") {
      return chatItems;
    }
    return [
      ...chatItems,
      {
        id: "ungroup",
        label: t("board:groupNode.dissolve"),
        icon: <Layers size={14} />,
        className: BOARD_TOOLBAR_ITEM_AMBER,
        onSelect: () => ctx.ungroupSelection(),
      },
    ];
  }

  const elements = ctx.engine.doc.getElements();
  const memberIds = getGroupMemberIds(elements, groupId);
  const memberTypes = memberIds.map(id => {
    const el = elements.find((e: { id: string }) => e.id === id);
    return el?.kind === "node" ? el.type : null;
  });
  const allSameMediaType =
    memberTypes.length > 0 &&
    memberTypes.every(t => t !== null && UNIFORM_SIZE_TYPES.has(t)) &&
    new Set(memberTypes).size === 1;

  const items = [
    {
      id: 'ungroup',
      label: t('board:groupNode.dissolve'),
      icon: <Layers size={14} />,
      className: BOARD_TOOLBAR_ITEM_AMBER,
      onSelect: () => ctx.ungroupSelection(),
    },
  ];

  if (allSameMediaType) {
    items.push({
      id: 'uniform-size',
      label: t('board:groupNode.uniformSize'),
      icon: <Maximize2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.uniformGroupSize(groupId),
    });
  }

  return items;
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
