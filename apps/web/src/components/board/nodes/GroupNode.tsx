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
import { Film, Layers, LayoutGrid, LogIn, Maximize2, PaintBucket } from "lucide-react";
import { cn } from "@udecode/cn";
import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import {
  BOARD_TOOLBAR_ITEM_AMBER,
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_GREEN,
  BOARD_TOOLBAR_ITEM_PURPLE,
  BOARD_TOOLBAR_ITEM_RED,
} from "../ui/board-style-system";
import { GROUP_NODE_TYPE, IMAGE_GROUP_NODE_TYPE } from "../engine/grouping";
import { NodeFrame } from "./NodeFrame";
import { HueSlider, buildColorSwatches } from "../ui/HueSlider";

/** Group role determines display and behavior semantics. */
export type GroupRole = 'manual' | 'storyboard';

export type GroupNodeProps = {
  /** Child node ids stored for grouping semantics. */
  childIds: string[];
  /** Group role: 'manual' for user-created groups, 'storyboard' for AI-generated storyboard sequences. */
  groupRole?: GroupRole;
  /** Optional display title for the group. */
  title?: string;
  /** Custom background color (hex or hsl string). */
  bgColor?: string;
};

/** Render a transparent group container with optional title bar. */
function GroupNodeView({ element, onUpdate }: CanvasNodeViewProps<GroupNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const { title, groupRole, bgColor: customBgColor } = element.props;
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
  const defaultBgClass = isStoryboard
    ? 'bg-ol-purple/20'
    : 'bg-muted/40';
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
          'pointer-events-none absolute inset-0 rounded-3xl border',
          borderColor,
          !customBgColor && defaultBgClass,
        )}
        style={customBgColor ? { backgroundColor: customBgColor, opacity: 0.35 } : undefined}
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
  bgColor: z.string().optional(),
});

const groupCapabilities = {
  resizable: false,
  rotatable: false,
  connectable: "anchors" as const,
};

/** Background color presets for group nodes. */
const GROUP_BG_PRESETS = [
  { label: 'default', value: undefined },
  { label: '#3b82f6', value: '#3b82f6' },
  { label: '#a855f7', value: '#a855f7' },
  { label: '#22c55e', value: '#22c55e' },
  { label: '#f59e0b', value: '#f59e0b' },
  { label: '#ef4444', value: '#ef4444' },
  { label: '#06b6d4', value: '#06b6d4' },
  { label: '#ec4899', value: '#ec4899' },
] as const;

/** Node types eligible for uniform-size inside a group. */
const UNIFORM_SIZE_TYPES = new Set(["image", "video"]);
function createGroupToolbarItems(ctx: CanvasToolbarContext<GroupNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const groupId = ctx.element.id;
  const currentBgColor = ctx.element.props.bgColor;

  const memberIds = ctx.engine.getGroupMemberIds(groupId);
  const memberTypes = memberIds.map((id: string) => {
    const el = ctx.engine.doc.getElementById(id);
    return el?.kind === "node" ? el.type : null;
  });
  const allSameMediaType =
    memberTypes.length > 0 &&
    memberTypes.every((type: string | null) => type !== null && UNIFORM_SIZE_TYPES.has(type)) &&
    new Set(memberTypes).size === 1;

  const swatches = buildColorSwatches(
    GROUP_BG_PRESETS.filter(p => p.value).map(p => p.value!),
    ctx.colorHistory,
  );
  const bgPresets = [
    GROUP_BG_PRESETS[0],
    ...swatches.map(c => ({ label: c, value: c })),
  ];

  const items = [
    {
      id: 'group-bg-color',
      label: t('board:groupNode.bgColor'),
      icon: <PaintBucket size={14} />,
      className: BOARD_TOOLBAR_ITEM_AMBER,
      onPanelClose: () => {
        if (currentBgColor) ctx.addColorHistory(currentBgColor);
      },
      panel: (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-4 gap-1">
            {bgPresets.map(preset => {
              const isActive = (preset.value ?? undefined) === (currentBgColor ?? undefined);
              return (
                <button
                  type="button"
                  key={preset.label}
                  title={preset.value ? preset.label : t('board:common.default')}
                  onPointerDown={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.updateNodeProps({ bgColor: preset.value } as Partial<GroupNodeProps>);
                  }}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-3xl transition-colors',
                    isActive
                      ? 'bg-foreground/12 dark:bg-foreground/18'
                      : 'hover:bg-accent/70',
                  )}
                >
                  {preset.value ? (
                    <span
                      className={cn(
                        'h-5 w-5 rounded-3xl ring-1 ring-border',
                        isActive && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                      style={{ backgroundColor: preset.value }}
                    />
                  ) : (
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-3xl ring-1 ring-border text-[10px] text-muted-foreground',
                        isActive && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                      )}
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <HueSlider
            value={currentBgColor}
            onChange={c => ctx.updateNodeProps({ bgColor: c } as Partial<GroupNodeProps>)}
          />
        </div>
      ),
    },
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
