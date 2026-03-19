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
import { Film, Layers, LayoutGrid, LogIn, Maximize2 } from "lucide-react";
import { cn } from "@udecode/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import {
  BOARD_GENERATE_NODE_BASE_IMAGE,
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_GREEN,
  BOARD_TOOLBAR_ITEM_PURPLE,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE } from "../engine/grouping";
import { NodeFrame } from "./NodeFrame";

/** Group role determines display and behavior semantics. */
export type GroupRole = 'manual' | 'storyboard';

export type GroupNodeProps = {
  /** Child node ids stored for grouping semantics. */
  childIds: string[];
  /** Group role: 'manual' for user-created groups, 'storyboard' for AI-generated storyboard sequences. */
  groupRole?: GroupRole;
  /** Optional display title for the group. */
  title?: string;
};

/** Render a transparent group container with optional title bar. */
function GroupNodeView({ element, onUpdate }: CanvasNodeViewProps<GroupNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const { title, groupRole } = element.props;
  const isStoryboard = groupRole === 'storyboard';
  const showTitleBar = title != null || isStoryboard;

  /* ── Title editing state ── */
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState(title ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync draft when external title changes while not editing
  useEffect(() => {
    if (!editingTitle) {
      setDraft(title ?? '');
    }
  }, [title, editingTitle]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTitle]);

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = draft.trim();
    if (trimmed !== (title ?? '')) {
      onUpdate({ title: trimmed || undefined } as Partial<GroupNodeProps>);
    }
  }, [draft, title, onUpdate]);

  const handleDoubleClick = useCallback(() => {
    setEditingTitle(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTitle();
      } else if (e.key === 'Escape') {
        setEditingTitle(false);
        setDraft(title ?? '');
      }
    },
    [commitTitle, title],
  );

  const borderColor = isStoryboard
    ? 'border-ol-purple/40'
    : 'border-border/60';
  const titleBg = isStoryboard
    ? 'bg-ol-purple/5'
    : 'bg-muted/30';
  const titleText = isStoryboard
    ? 'text-ol-purple'
    : 'text-muted-foreground';

  return (
    <NodeFrame>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg border',
          borderColor,
        )}
      />

      {showTitleBar && (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 top-0 flex h-8 items-center gap-1.5 rounded-t-lg border-b px-2',
            borderColor,
            titleBg,
          )}
          onDoubleClick={handleDoubleClick}
        >
          {isStoryboard && (
            <Film size={12} className={cn('shrink-0', titleText)} />
          )}

          {editingTitle ? (
            <input
              ref={inputRef}
              className={cn(
                'h-5 flex-1 rounded border-none bg-transparent px-0.5 text-xs outline-none focus:ring-1 focus:ring-ol-purple/40',
                titleText,
              )}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleKeyDown}
              placeholder={
                isStoryboard
                  ? t('board:groupNode.storyboard')
                  : t('board:groupNode.untitled')
              }
            />
          ) : (
            <span
              className={cn(
                'truncate text-xs select-none',
                titleText,
                !title && 'opacity-50',
              )}
              title={t('board:groupNode.editTitle')}
            >
              {title ||
                (isStoryboard
                  ? t('board:groupNode.storyboard')
                  : t('board:groupNode.untitled'))}
            </span>
          )}
        </div>
      )}
    </NodeFrame>
  );
}

const groupSchema = z.object({
  childIds: z.array(z.string()),
  groupRole: z.enum(['manual', 'storyboard']).optional(),
  title: z.string().optional(),
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

  const memberIds = ctx.engine.getGroupMemberIds(groupId);
  const memberTypes = memberIds.map((id: string) => {
    const el = ctx.engine.doc.getElementById(id);
    return el?.kind === "node" ? el.type : null;
  });
  const allSameMediaType =
    memberTypes.length > 0 &&
    memberTypes.every((type: string | null) => type !== null && UNIFORM_SIZE_TYPES.has(type)) &&
    new Set(memberTypes).size === 1;

  const items = [
    {
      id: 'enter-group',
      label: t('board:groupNode.enter'),
      icon: <LogIn size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      onSelect: () => ctx.enterGroup?.(groupId),
    },
    {
      id: 'ungroup',
      label: t('board:groupNode.dissolve'),
      icon: <Layers size={14} />,
      className: BOARD_TOOLBAR_ITEM_RED,
      onSelect: () => ctx.ungroupSelection(),
    },
  ];

  if (allSameMediaType) {
    items.push({
      id: 'uniform-size',
      label: t('board:groupNode.uniformSize'),
      icon: <Maximize2 size={14} />,
      className: BOARD_TOOLBAR_ITEM_PURPLE,
      onSelect: () => ctx.uniformGroupSize(groupId),
    });
  }

  // 逻辑：自动布局按钮，根据当前布局轴检测方向后排列组内成员。
  const axis = ctx.getGroupLayoutAxis(groupId);
  const layoutDirection = axis === 'column' ? 'column' : 'row';
  items.push({
    id: 'auto-layout',
    label: t('board:selection.toolbar.autoLayout'),
    icon: <LayoutGrid size={14} />,
    className: BOARD_TOOLBAR_ITEM_GREEN,
    onSelect: () => ctx.layoutGroup(groupId, layoutDirection),
  });

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
