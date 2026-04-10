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
import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { Value } from 'platejs';
import type { PlateEditor } from 'platejs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import i18next from "i18next";
import { z } from "zod";
import {
  CheckSquare,
  List,
  ListOrdered,
  Palette,
  PaintBucket,
} from "lucide-react";
import { cn } from "@udecode/cn";
import { KEYS } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import { PlateContent } from 'platejs/react';
import { toggleList } from '@platejs/list';
import {
  MessageStreamMarkdown,
  MESSAGE_STREAM_MARKDOWN_CLASSNAME,
} from "@/components/ai/message/markdown/MessageStreamMarkdown";
import {
  BOARD_TOOLBAR_ITEM_DEFAULT,
} from "../ui/board-style-system";
import { useBoardContext } from "../core/BoardProvider";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { HueSlider, buildColorSwatches, DEFAULT_COLOR_PRESETS } from "../ui/HueSlider";
import { EditableBoardTextEditorKit, ReadOnlyBoardTextEditorKit } from "./text-editor-kit";
import { useUpstreamData } from "../hooks/useUpstreamData";
import { usePanelOverlay } from "../render/pixi/PixiApplication";
import { TextAiPanel, type TextGenerateParams } from "../panels/TextAiPanel";
import { InlinePanelPortal } from "./shared/InlinePanelPortal";
import { useInlinePanelSync } from "./shared/useInlinePanelSync";
import { deriveNode } from "../utils/derive-node";
import { useTextV3Stream } from "../panels/hooks/useTextV3Stream";
import { resolveAllMediaInputs } from "@/lib/media-upload";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { NodeFrame } from "./NodeFrame";
import { VersionStackOverlay } from "./VersionStackOverlay";
import { FailureOverlay } from "./shared/FailureOverlay";
import {
  createInputSnapshot,
  createGeneratingEntry,
  pushVersion,
  markVersionReady,
  removeFailedEntry,
  switchPrimary,
  getPrimaryEntry,
} from "../engine/version-stack";
import {
  resolveErrorMessage,
  useVersionStackState,
  useVersionStackEditingOverride,
} from "../hooks/useVersionStack";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export types from leaf file so existing imports continue to work
export type {
  TextNodeValue,
  TextNodeTextAlign,
  TextNodeStyle,
  StickyColor,
  ShapeType,
  TextNodeProps,
} from "./text-node-types";
import type {
  TextNodeValue,
  TextNodeTextAlign,
  TextNodeStyle,
  StickyColor,
  ShapeType,
  TextNodeProps,
} from "./text-node-types";

/** Sticky note color definitions (light + dark background/text). */
export const STICKY_COLORS: Record<StickyColor, { bg: string; darkBg: string }> = {
  yellow:  { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
  blue:    { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
  green:   { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
  pink:    { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
  purple:  { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
  orange:  { bg: "bg-neutral-100",  darkBg: "dark:bg-neutral-800" },
};

/** CSS clip-path for each shape. "none" means use border-radius instead. */
const SHAPE_CLIP_PATHS: Record<ShapeType, string | null> = {
  rectangle: null,
  rounded_rectangle: null,
  ellipse: "ellipse(50% 50% at 50% 50%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
};

/** Compute contrast text color for a hex fill. */
function getShapeTextColor(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length < 6) return "#ffffff";
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default text content for new text nodes. */
const DEFAULT_TEXT_VALUE: Value = [{ type: 'p', children: [{ text: '' }] }];
/** Placeholder copy for empty text nodes – resolved at render time. */
const getTextNodePlaceholder = () => i18next.t('board:textNode.placeholder');
import {
  TEXT_NODE_DEFAULT_FONT_SIZE,
  TEXT_NODE_DEFAULT_HEIGHT,
  TEXT_NODE_LINE_HEIGHT,
} from "./text-node-constants";

// Re-export for backward compatibility (prefer importing from text-node-constants directly)
export { TEXT_NODE_DEFAULT_HEIGHT } from "./text-node-constants";

/** Default font weight for board text nodes. */
const TEXT_NODE_DEFAULT_FONT_WEIGHT = 430;
/** Subtle tracking tweak so board copy feels less loose. */
const TEXT_NODE_DEFAULT_LETTER_SPACING = "-0.012em";
/** Maximum font size for text nodes. */
const TEXT_NODE_MAX_FONT_SIZE = 52;
/** Minimum size for text nodes. */
const TEXT_NODE_MIN_SIZE = { w: 200, h: TEXT_NODE_DEFAULT_HEIGHT };
/** Maximum size for text nodes. */
const TEXT_NODE_MAX_SIZE = { w: 800, h: 10000 };

/** Default text alignment for text nodes. */
const TEXT_NODE_DEFAULT_TEXT_ALIGN: TextNodeTextAlign = "left";
/** Auto text color when background is light. */
const TEXT_NODE_AUTO_TEXT_LIGHT = "#171717";
/** Auto text color when background is dark. */
const TEXT_NODE_AUTO_TEXT_DARK = "#fafafa";
/** Preset font size options (H1-H5) for text toolbar. */
const TEXT_NODE_FONT_SIZES = [
  { label: "H1", value: 52 },
  { label: "H2", value: 40 },
  { label: "H3", value: 32 },
  { label: "H4", value: 24 },
  { label: "H5", value: 18 },
] as const;
/** Raw size values used for heading font sizing. */
const TEXT_NODE_FONT_SIZE_VALUES = TEXT_NODE_FONT_SIZES.map(option => option.value);
/** The "reset" entry always shown first in color panels. */
const COLOR_RESET_ENTRY: { label: string; value?: string } = { label: 'Default', value: undefined };
const BG_RESET_ENTRY: { label: string; value?: string } = { label: 'Transparent', value: undefined };
/** Markdown shortcut matcher used for backward-compatible heading migration. */
const TEXT_NODE_HEADING_SHORTCUT_RE = /^(#{1,6})\s+/;

// ---------------------------------------------------------------------------
// Module-level editor ref map (shared between TextNodeView and toolbar)
// ---------------------------------------------------------------------------

const textEditorRefs = new Map<string, PlateEditor>();

// ---------------------------------------------------------------------------
// Connector templates
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the props patch for switching the TextNode version stack primary.
 * 逻辑：切换主版本时，从 `entry.output.textValue` 恢复到 `props.value`。
 */
function buildSwitchPrimaryPatch(
  stack: import("../engine/types").VersionStack,
  entryId: string,
): Partial<TextNodeProps> {
  const newStack = switchPrimary(stack, entryId)
  const newPrimary = newStack.entries.find((e) => e.id === entryId)
  const patch: Partial<TextNodeProps> = { versionStack: newStack }
  if (newPrimary?.output?.textValue !== undefined) {
    patch.value = newPrimary.output.textValue
  }
  return patch
}

/** Convert legacy string value or rich-text Value to Slate Value. */
function normalizeTextValue(
  value: TextNodeValue | undefined,
  legacyProps?: {
    fontWeight?: number;
    fontStyle?: "normal" | "italic";
    textDecoration?: "none" | "underline" | "line-through";
  },
): Value {
  // Already a Slate Value array
  if (Array.isArray(value) && value.length > 0) return value;

  // Legacy string → convert to paragraphs
  const text = typeof value === 'string' ? value : '';
  if (text.length === 0) return DEFAULT_TEXT_VALUE;

  const lines = text.split('\n');

  // Build marks from legacy node-level style props
  const marks: Record<string, boolean> = {};
  if (legacyProps?.fontWeight && legacyProps.fontWeight >= 600) marks.bold = true;
  if (legacyProps?.fontStyle === 'italic') marks.italic = true;
  if (legacyProps?.textDecoration === 'underline') marks.underline = true;
  if (legacyProps?.textDecoration === 'line-through') marks.strikethrough = true;

  return lines.map(line => ({
    type: 'p' as const,
    children: [{ text: line, ...marks }],
  }));
}

/** Detect whether a Slate Value is effectively empty. */
function isSlateValueEmpty(value: Value): boolean {
  if (value.length === 0) return true;
  return value.every(node => {
    const children = (node as Record<string, unknown>).children as Array<{ text?: string }> | undefined;
    if (!children) return true;
    return children.every(child => !child.text || child.text.trim().length === 0);
  });
}

/** Upgrade legacy paragraph nodes that still keep raw Markdown heading shortcuts. */
function upgradeMarkdownHeadingShortcuts(value: Value): Value {
  const headingTypes = [
    KEYS.h1,
    KEYS.h2,
    KEYS.h3,
    KEYS.h4,
    KEYS.h5,
    KEYS.h6,
  ] as const;
  let changed = false;

  const nextValue = value.map(node => {
    if (!node || typeof node !== "object") return node;
    const element = node as Record<string, unknown>;
    if (element.type !== KEYS.p || !Array.isArray(element.children) || element.children.length === 0) {
      return node;
    }

    const firstChild = element.children[0];
    if (!firstChild || typeof firstChild !== "object" || typeof (firstChild as { text?: unknown }).text !== "string") {
      return node;
    }

    const text = String((firstChild as { text: string }).text);
    const match = text.match(TEXT_NODE_HEADING_SHORTCUT_RE);
    if (!match) return node;

    const level = Math.max(1, Math.min(headingTypes.length, match[1]?.length ?? 1));
    const nextChildren = [...element.children];
    nextChildren[0] = {
      ...(firstChild as Record<string, unknown>),
      text: text.slice(match[0].length),
    };
    changed = true;
    return {
      ...element,
      type: headingTypes[level - 1],
      children: nextChildren,
    };
  });

  return changed ? (nextValue as Value) : value;
}

/** Resolve font size to the closest heading size. */
function resolveHeadingFontSize(fontSize?: number): number {
  const fallback = TEXT_NODE_DEFAULT_FONT_SIZE;
  const candidate =
    typeof fontSize === "number" && Number.isFinite(fontSize) ? fontSize : fallback;
  const clamped = Math.min(TEXT_NODE_MAX_FONT_SIZE, candidate);
  let closest = TEXT_NODE_FONT_SIZE_VALUES[0];
  let minDelta = Math.abs(clamped - closest);
  for (const size of TEXT_NODE_FONT_SIZE_VALUES.slice(1)) {
    const delta = Math.abs(clamped - size);
    if (delta < minDelta) {
      closest = size;
      minDelta = delta;
    }
  }
  return closest;
}

/** Parse hex color to RGB if possible. */
function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("#")) return null;
  const hex = trimmed.slice(1);
  if (hex.length !== 3 && hex.length !== 6) return null;
  const normalized =
    hex.length === 3 ? hex.split("").map(char => char + char).join("") : hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

/** Resolve auto text color based on background brightness. */
function getAutoTextColor(backgroundColor?: string): string | undefined {
  if (!backgroundColor) return undefined;
  const rgb = parseHexColor(backgroundColor);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.5 ? TEXT_NODE_AUTO_TEXT_DARK : TEXT_NODE_AUTO_TEXT_LIGHT;
}

/** Render a read-only markdown projection for board chat text parts. */
function ReadOnlyMarkdownProjection(props: {
  /** Current text node element id. */
  elementId: string;
  /** Markdown source text. */
  markdownText: string;
  /** Resolved font size from node props. */
  fontSize: number;
  /** Resolved text color from node props/background. */
  color?: string;
  /** Node background color. */
  backgroundColor?: string;
}) {
  const { engine } = useBoardContext();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isAnimating = false;

  return (
    <div
      className={cn(
        "relative w-full box-border rounded-3xl p-2.5",
        props.backgroundColor ? "" : "bg-ol-surface-muted",
        "text-ol-text-primary",
      )}
      style={props.backgroundColor ? { backgroundColor: props.backgroundColor } : undefined}
    >
      <MessageStreamMarkdown
        ref={contentRef}
        markdown={props.markdownText}
        className={MESSAGE_STREAM_MARKDOWN_CLASSNAME}
        isAnimating={isAnimating}
        style={{
          fontSize: props.fontSize,
          lineHeight: TEXT_NODE_LINE_HEIGHT,
          color: props.color,
          fontWeight: TEXT_NODE_DEFAULT_FONT_WEIGHT,
          letterSpacing: TEXT_NODE_DEFAULT_LETTER_SPACING,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar panel button (reused)
// ---------------------------------------------------------------------------

type TextToolbarPanelButtonProps = {
  title: string;
  active?: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
};

function TextToolbarPanelButton({
  title,
  active,
  onSelect,
  children,
  className,
}: TextToolbarPanelButtonProps) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "inline-flex h-8 min-w-[32px] items-center justify-center rounded-3xl px-2 text-[11px] font-medium",
        "transition-colors",
        active
          ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-background"
          : "hover:bg-accent/70",
        className
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar builder
// ---------------------------------------------------------------------------

/** Build color and background color toolbar items (shared by single and multi-select). */
function buildColorToolbarItems(
  t: (k: string) => string,
  ctx: CanvasToolbarContext<TextNodeProps>,
  opts: {
    textColor: string | undefined;
    backgroundColor: string | undefined;
    autoTextColor: string | undefined;
    colorPresets: { label: string; value?: string }[];
    backgroundPresets: { label: string; value?: string }[];
    addColorHistory: (color: string) => void;
  },
) {
  const { textColor, backgroundColor, autoTextColor, colorPresets, backgroundPresets, addColorHistory } = opts;
  return [
    {
      id: 'text-color',
      label: t('board:textNode.toolbar.textColor'),
      showLabel: true,
      icon: <Palette size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onPanelClose: () => {
        if (textColor) addColorHistory(textColor);
      },
      panel: (
        <div>
          <div className="grid grid-cols-4 gap-1">
            {colorPresets.map(color => {
              const isActive = (color.value ?? undefined) === (textColor ?? undefined);
              return (
                <TextToolbarPanelButton
                  key={color.label}
                  title={color.label}
                  active={isActive}
                  onSelect={() => ctx.updateNodeProps({ color: color.value })}
                  className="h-8 w-8 p-0"
                >
                  {color.value ? (
                    <span
                      className={cn(
                        "h-5 w-5 rounded-full ring-1 ring-border",
                        isActive
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                          : ""
                      )}
                      style={{ backgroundColor: color.value }}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-border text-[10px]",
                        autoTextColor ? "" : "text-ol-text-primary",
                        isActive
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                          : ""
                      )}
                      style={autoTextColor ? { color: autoTextColor } : undefined}
                    >
                      A
                    </span>
                  )}
                </TextToolbarPanelButton>
              );
            })}
          </div>
          <HueSlider value={textColor} onChange={(c) => ctx.updateNodeProps({ color: c })} />
        </div>
      ),
    },
    {
      id: 'text-background',
      label: t('board:textNode.toolbar.backgroundColor'),
      showLabel: true,
      icon: <PaintBucket size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      onPanelClose: () => {
        if (backgroundColor) addColorHistory(backgroundColor);
      },
      panel: (
        <div>
          <div className="grid grid-cols-4 gap-1">
            {backgroundPresets.map(color => {
              const isActive =
                (color.value ?? undefined) === (backgroundColor ?? undefined);
              return (
                <TextToolbarPanelButton
                  key={color.label}
                  title={color.label}
                  active={isActive}
                  onSelect={() => ctx.updateNodeProps({ backgroundColor: color.value })}
                  className="h-8 w-8 p-0"
                >
                  {color.value ? (
                    <span
                      className={cn(
                        "h-5 w-5 rounded-3xl ring-1 ring-border",
                        isActive
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                          : ""
                      )}
                      style={{ backgroundColor: color.value }}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-3xl ring-1 ring-border text-[10px] text-ol-text-auxiliary",
                        isActive
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                          : ""
                      )}
                    >
                      {color.label.slice(0, 1)}
                    </span>
                  )}
                </TextToolbarPanelButton>
              );
            })}
          </div>
          <HueSlider value={backgroundColor} onChange={(c) => ctx.updateNodeProps({ backgroundColor: c })} />
        </div>
      ),
    },
  ];
}

/** Build toolbar items for text nodes. */
function createTextToolbarItems(ctx: CanvasToolbarContext<TextNodeProps>) {
  const t = (k: string) => i18next.t(k);
  const textColor = ctx.element.props.color;
  const backgroundColor = ctx.element.props.backgroundColor;
  const autoTextColor = getAutoTextColor(backgroundColor);
  const { colorHistory, addColorHistory } = ctx;
  const swatches = buildColorSwatches(DEFAULT_COLOR_PRESETS, colorHistory);
  const colorPresets = [COLOR_RESET_ENTRY, ...swatches.map(c => ({ label: c, value: c }))];
  const backgroundPresets = [BG_RESET_ENTRY, ...swatches.map(c => ({ label: c, value: c }))];

  // Multi-select: only show color and background color items
  if (ctx.multiSelect) {
    return buildColorToolbarItems(t, ctx, { textColor, backgroundColor, autoTextColor, colorPresets, backgroundPresets, addColorHistory });
  }

  // Get the Plate editor instance for inline formatting
  const editor = textEditorRefs.get(ctx.element.id);

  const items: import("../engine/types").CanvasToolbarItem[] = [];

  // 逻辑：版本堆叠 > 1 时在工具栏头部添加上一版本/下一版本导航按钮。
  const stack = ctx.element.props.versionStack;
  const count = stack?.entries.length ?? 0;
  if (stack && count > 1) {
    const primary = getPrimaryEntry(stack);
    const currentIdx = primary
      ? stack.entries.findIndex((e) => e.id === primary.id)
      : 0;
    items.push(
      {
        id: 'version-prev',
        label: t('board:versionStack.prev'),
        showLabel: true,
        icon: <ChevronLeft size={14} />,
        className: [BOARD_TOOLBAR_ITEM_DEFAULT, currentIdx <= 0 ? 'opacity-30' : ''].join(' '),
        onSelect: () => {
          if (currentIdx <= 0) return;
          ctx.updateNodeProps(
            buildSwitchPrimaryPatch(stack, stack.entries[currentIdx - 1].id),
          );
        },
      },
      {
        id: 'version-next',
        label: t('board:versionStack.next'),
        showLabel: true,
        icon: <ChevronRight size={14} />,
        className: [BOARD_TOOLBAR_ITEM_DEFAULT, currentIdx >= count - 1 ? 'opacity-30' : ''].join(' '),
        onSelect: () => {
          if (currentIdx >= count - 1) return;
          ctx.updateNodeProps(
            buildSwitchPrimaryPatch(stack, stack.entries[currentIdx + 1].id),
          );
        },
      },
    );
  }

  items.push(...[
    // ---- Inline: Lists (ul / ol / todo) ----
    {
      id: 'text-list',
      label: t('board:textNode.toolbar.list'),
      showLabel: true,
      icon: <List size={14} />,
      className: BOARD_TOOLBAR_ITEM_DEFAULT,
      panel: (() => {
        // 逻辑：直接读取编辑器 value 检测列表类型，不依赖 editor.selection。
        const blocks = (editor?.children ?? []) as Record<string, unknown>[];
        const isUlActive = blocks.some(n => n[KEYS.listType] === KEYS.ul);
        const isOlActive = blocks.some(n => n[KEYS.listType] === KEYS.ol);
        const isTodoActive = blocks.some(n => Object.hasOwn(n, KEYS.listChecked));

        const switchListType = (targetType: string) => {
          if (!editor) return;
          const nodes = editor.children as Record<string, unknown>[];
          // 逻辑：查找已有列表类型的块。
          const listIndices: number[] = [];
          let allTarget = true;
          nodes.forEach((n, i) => {
            const isList = n[KEYS.listType] || Object.hasOwn(n, KEYS.listChecked);
            if (!isList) return;
            listIndices.push(i);
            const isTarget = targetType === KEYS.listTodo
              ? Object.hasOwn(n, KEYS.listChecked)
              : n[KEYS.listType] === targetType;
            if (!isTarget) allTarget = false;
          });
          if (listIndices.length === 0) {
            // 无列表 → 应用新列表（需要 selection，先确保选区存在）。
            if (!editor.selection) {
              editor.tf.select(editor.api.start([]));
            }
            toggleList(editor, { listStyleType: targetType });
            return;
          }
          if (allTarget) {
            // 同类型 → 移除列表。
            if (!editor.selection) {
              editor.tf.select(editor.api.start([]));
            }
            toggleList(editor, { listStyleType: targetType });
            return;
          }
          // 不同类型 → 直接替换，不依赖 selection。
          editor.tf.withoutNormalizing(() => {
            listIndices.forEach(i => {
              const n = nodes[i];
              const path = [i];
              const indent = (n[KEYS.indent] as number) || 1;
              if (targetType === KEYS.listTodo) {
                editor.tf.setNodes({
                  [KEYS.indent]: indent,
                  [KEYS.listChecked]: false,
                  [KEYS.listType]: targetType,
                }, { at: path });
              } else {
                editor.tf.unsetNodes(KEYS.listChecked, { at: path });
                editor.tf.setNodes({
                  [KEYS.indent]: indent,
                  [KEYS.listType]: targetType,
                }, { at: path });
              }
            });
          });
        };

        return (
          <div className="flex items-center gap-1">
            <TextToolbarPanelButton
              title={t('board:textNode.format.unorderedList')}
              active={isUlActive}
              onSelect={() => switchListType(KEYS.ul)}
            >
              <List size={14} />
            </TextToolbarPanelButton>
            <TextToolbarPanelButton
              title={t('board:textNode.format.orderedList')}
              active={isOlActive}
              onSelect={() => switchListType(KEYS.ol)}
            >
              <ListOrdered size={14} />
            </TextToolbarPanelButton>
            <TextToolbarPanelButton
              title={t('board:textNode.format.todoList')}
              active={isTodoActive}
              onSelect={() => switchListType(KEYS.listTodo)}
            >
              <CheckSquare size={14} />
            </TextToolbarPanelButton>
          </div>
        );
      })(),
    },
    // ---- Node-level: Text color & Background color ----
    ...buildColorToolbarItems(t, ctx, { textColor, backgroundColor, autoTextColor, colorPresets, backgroundPresets, addColorHistory }),
  ]);

  return items;
}

// ---------------------------------------------------------------------------
// TextNodeView — main component
// ---------------------------------------------------------------------------

/** Render the editable text node with Plate rich-text editing. */
function EditableTextNodeView({
  element,
  selected,
  editing,
  expanded,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<TextNodeProps>) {
  const meta = element.meta as Record<string, unknown> | undefined;
  const branchColor =
    typeof meta?.[MINDMAP_META.branchColor] === "string"
      ? (meta?.[MINDMAP_META.branchColor] as string)
      : undefined;
  const isGhost = Boolean(meta?.[MINDMAP_META.ghost]);
  const ghostParentId =
    typeof meta?.[MINDMAP_META.ghostParentId] === "string"
      ? (meta?.[MINDMAP_META.ghostParentId] as string)
      : undefined;
  const ghostCount =
    typeof meta?.[MINDMAP_META.ghostCount] === "number"
      ? (meta?.[MINDMAP_META.ghostCount] as number)
      : 0;

  const { engine, fileContext } = useBoardContext();
  const isLocked = engine.isLocked() || element.locked;

  // Upstream data for AI panel (only resolve when expanded)
  const upstream = useUpstreamData(engine, expanded ? element.id : null);
  const panelOverlay = usePanelOverlay();

  // 逻辑：面板通过 useInlinePanelSync 同步缩放和位置。
  const { panelRef } = useInlinePanelSync({ engine, xywh: element.xywh, expanded });

  // ---- Edit mode state (declared before AI handlers so they can force-exit editing) ----
  const [isEditing, setIsEditing] = useState(Boolean(editing) && !isGhost);
  const [shouldFocus, setShouldFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoFocusConsumedRef = useRef(false);
  const isEditingRef = useRef(false);

  // ── AI text generation (streaming + versionStack) ──
  const stream = useTextV3Stream()
  /** Pending generation tracking — nodeId is where to write the result. */
  const pendingEntryRef = useRef<{ entryId: string; nodeId: string } | null>(null)
  /** Failed generation state used by FailureOverlay + retry. */
  const [lastFailure, setLastFailure] = useState<{
    message: string
    isCancelled: boolean
    params: TextGenerateParams
    mode: 'current' | 'new-node'
  } | null>(null)
  /** Saved last-attempted params so the failure handler can populate lastFailure for retry. */
  const lastAttemptRef = useRef<{ params: TextGenerateParams; mode: 'current' | 'new-node' } | null>(null)

  // ── Version stack state + editing override (post-generation lock pattern) ──
  // 逻辑：和 Image/Video/Audio 一致——节点有 ready/generating 版本时进入 readonly，
  // 禁止切换 feature；用户点击 Unlock 才进入 editing 可改参数。
  const {
    primaryEntry: versionPrimaryEntry,
    isGenerating: isGeneratingVersion,
  } = useVersionStackState(element.props.versionStack)
  const isReadyVersion = versionPrimaryEntry?.status === 'ready'
  const { editingOverride, setEditingOverride } = useVersionStackEditingOverride(
    element.id,
    expanded,
    isGeneratingVersion,
  )
  const panelReadonly = (isReadyVersion || isGeneratingVersion) && !editingOverride

  /**
   * Centralized failure handler.
   * 逻辑：从堆栈移掉 generating entry；若 new-node 场景下 target 节点因此变空则删除
   * 派生出来的 orphan 节点；非 orphan 场景回退到上一个 ready 版本的内容；最后把失败
   * 信息写入 `lastFailure` 供 FailureOverlay 显示 + retry。
   */
  const handleGenerationFailure = useCallback(
    (err: unknown, opts: { isCancelled?: boolean } = {}) => {
      const pending = pendingEntryRef.current
      const attempt = lastAttemptRef.current

      if (pending) {
        const targetEl = engine.doc.getElementById(pending.nodeId)
        if (targetEl && targetEl.kind === 'node') {
          const stack = (targetEl.props as TextNodeProps).versionStack
          if (stack) {
            const { stack: cleaned } = removeFailedEntry(stack, pending.entryId)
            if (cleaned.entries.length === 0 && pending.nodeId !== element.id) {
              // 逻辑：new-node 场景下首次生成失败，删除派生出来的空壳节点。
              engine.doc.deleteElement(pending.nodeId)
            } else {
              const patch: Partial<TextNodeProps> = { versionStack: cleaned }
              const newPrimary = getPrimaryEntry(cleaned)
              if (newPrimary?.output?.textValue !== undefined) {
                patch.value = newPrimary.output.textValue
              }
              engine.doc.updateNodeProps(pending.nodeId, patch)
            }
          }
        }
        pendingEntryRef.current = null
      }

      if (attempt) {
        setLastFailure({
          message: resolveErrorMessage(err),
          isCancelled: opts.isCancelled === true,
          params: attempt.params,
          mode: attempt.mode,
        })
      }
    },
    [engine, element.id],
  )

  /**
   * Common pre-generation setup. Returns the created entry id + target node id.
   * 逻辑：推入 generating entry **必须在 `await` 之前**，以防止上传期间的二次点击用陈旧
   * versionStack 闭包覆盖第一个 pending entry。
   */
  const beginGeneration = useCallback(
    (
      params: TextGenerateParams,
      mode: 'current' | 'new-node',
    ): { entry: ReturnType<typeof createGeneratingEntry>; nodeId: string } | null => {
      if (pendingEntryRef.current) return null // 已有进行中任务，拒绝二次触发

      // 逻辑：parameters 里必须带 feature/variant/inputs/params，这样切换版本或重开
      // 面板时 TextAiPanel 才能从 primaryEntry 里恢复原生成参数。
      const snapshot = createInputSnapshot({
        prompt: (params.inputs?.prompt as string) ?? '',
        parameters: {
          feature: params.feature,
          variant: params.variant,
          inputs: params.inputs,
          params: params.params,
        },
        upstreamRefs: upstream?.entries ?? [],
      })
      const entry = createGeneratingEntry(snapshot, '')
      lastAttemptRef.current = { params, mode }
      setLastFailure(null) // 清掉上次失败状态

      if (mode === 'current') {
        // 逻辑：从 engine 读最新 stack，避免协作/快速重试下的闭包陈旧。
        const latestEl = engine.doc.getElementById(element.id)
        const latestStack = latestEl?.kind === 'node'
          ? (latestEl.props as TextNodeProps).versionStack
          : undefined
        const nextStack = pushVersion(latestStack, entry)
        onUpdate({ versionStack: nextStack, origin: 'ai-generate' })
        pendingEntryRef.current = { entryId: entry.id, nodeId: element.id }
        return { entry, nodeId: element.id }
      }

      // mode === 'new-node'
      const initialStack = pushVersion(undefined, entry)
      const newNodeId = deriveNode({
        engine,
        sourceNodeId: element.id,
        targetType: 'text',
        targetProps: {
          value: '',
          origin: 'ai-generate' as const,
          versionStack: initialStack,
        },
      })
      if (!newNodeId) return null
      pendingEntryRef.current = { entryId: entry.id, nodeId: newNodeId }
      return { entry, nodeId: newNodeId }
    },
    [engine, element.id, onUpdate, upstream?.entries],
  )

  const handleTextGenerate = useCallback(async (params: TextGenerateParams) => {
    // 逻辑：先 push entry + set pending，然后才 await 上传，防止 double-click race。
    const ctx = beginGeneration(params, 'current')
    if (!ctx) return

    // 逻辑：生成开始时强制退出编辑模式，防止用户正在编辑的缓冲被流式输出覆盖丢失。
    isEditingRef.current = false
    setIsEditing(false)
    engine.setEditingNodeId(null)

    try {
      const resolvedInputs = await resolveAllMediaInputs(
        params.inputs ?? {},
        fileContext?.boardId,
      )
      stream.startStream({
        feature: params.feature,
        variant: params.variant,
        inputs: resolvedInputs,
        params: params.params,
      })
    } catch (err) {
      handleGenerationFailure(err)
    }
  }, [beginGeneration, engine, fileContext?.boardId, stream, handleGenerationFailure])

  const handleTextGenerateNewNode = useCallback(async (params: TextGenerateParams) => {
    const ctx = beginGeneration(params, 'new-node')
    if (!ctx) return
    try {
      const resolvedInputs = await resolveAllMediaInputs(
        params.inputs ?? {},
        fileContext?.boardId,
      )
      stream.startStream({
        feature: params.feature,
        variant: params.variant,
        inputs: resolvedInputs,
        params: params.params,
      })
    } catch (err) {
      handleGenerationFailure(err)
    }
  }, [beginGeneration, fileContext?.boardId, stream, handleGenerationFailure])

  /** Retry the last failed generation using the saved params. */
  const handleRetryGeneration = useCallback(() => {
    const failure = lastFailure
    if (!failure) return
    setLastFailure(null)
    if (failure.mode === 'current') {
      void handleTextGenerate(failure.params)
    } else {
      void handleTextGenerateNewNode(failure.params)
    }
  }, [lastFailure, handleTextGenerate, handleTextGenerateNewNode])

  /**
   * Unified stream completion / failure effect.
   * 逻辑：单一 effect 处理三态（streaming / success / error），避免两个 effect 互相干扰。
   */
  useEffect(() => {
    if (stream.isStreaming) return
    const pending = pendingEntryRef.current
    if (!pending) return

    // 流式失败（含 abort） — 清 pending 并上报错误。
    if (stream.error) {
      const isCancelled = stream.error === 'aborted'
      handleGenerationFailure(new Error(stream.error), { isCancelled })
      stream.clear()
      return
    }

    // 流式成功 — 把累积文本写入目标节点，mark version ready。
    if (!stream.text) return

    const targetEl = engine.doc.getElementById(pending.nodeId)
    if (!targetEl || targetEl.kind !== 'node') {
      pendingEntryRef.current = null
      stream.clear()
      return
    }
    const stack = (targetEl.props as TextNodeProps).versionStack
    if (!stack) {
      pendingEntryRef.current = null
      stream.clear()
      return
    }

    // 逻辑：统一把 markdown 文本标准化为 Plate Value，避免 props.value 后续被编辑成
    // Value[] 而 entry.output.textValue 还停留在 string 的漂移问题。
    const normalizedValue = normalizeTextValue(stream.text)
    const readyStack = markVersionReady(stack, pending.entryId, {
      urls: [],
      textValue: normalizedValue,
    })
    // 逻辑：同步 aiConfig.lastUsed，让下次打开面板能恢复到对应的 feature/variant。
    const entryParams = stack.entries.find((e) => e.id === pending.entryId)?.input?.parameters as
      | { feature?: string; variant?: string }
      | undefined
    const targetAiConfig = (targetEl.props as TextNodeProps).aiConfig
    const nextAiConfig: TextNodeProps['aiConfig'] = {
      ...(targetAiConfig ?? {}),
      ...(entryParams?.feature && entryParams?.variant
        ? { lastUsed: { feature: entryParams.feature, variant: entryParams.variant } }
        : {}),
    }
    engine.doc.updateNodeProps(pending.nodeId, {
      versionStack: readyStack,
      value: normalizedValue,
      aiConfig: nextAiConfig,
    })

    pendingEntryRef.current = null
    stream.clear()
  }, [stream.isStreaming, stream.text, stream.error, engine, stream, handleGenerationFailure])

  // Normalize stored value to Slate Value (handles legacy string migration)
  const incomingSlateValue = useMemo(
    () => normalizeTextValue(element.props.value, {
      fontWeight: element.props.fontWeight,
      fontStyle: element.props.fontStyle,
      textDecoration: element.props.textDecoration,
    }),
    [element.props.value, element.props.fontWeight, element.props.fontStyle, element.props.textDecoration]
  );
  const slateValue = useMemo(
    () => upgradeMarkdownHeadingShortcuts(incomingSlateValue),
    [incomingSlateValue],
  );
  const incomingSlateValueJson = useMemo(
    () => JSON.stringify(incomingSlateValue),
    [incomingSlateValue],
  );
  const slateValueJson = useMemo(
    () => JSON.stringify(slateValue),
    [slateValue],
  );
  const needsHeadingShortcutUpgrade = useMemo(
    () => incomingSlateValueJson !== slateValueJson,
    [incomingSlateValueJson, slateValueJson],
  );

  const textAlign = element.props.textAlign ?? TEXT_NODE_DEFAULT_TEXT_ALIGN;
  const backgroundColor = element.props.backgroundColor;
  const autoTextColor = useMemo(
    () => getAutoTextColor(backgroundColor),
    [backgroundColor]
  );

  const resolvedFontSize = resolveHeadingFontSize(element.props.fontSize);
  const resolvedColor = element.props.color ?? autoTextColor;

  /** Style applied to the Plate content container. */
  const textStyle = useMemo(() => ({
    fontSize: resolvedFontSize,
    textAlign,
    lineHeight: TEXT_NODE_LINE_HEIGHT,
    fontWeight: TEXT_NODE_DEFAULT_FONT_WEIGHT,
    letterSpacing: TEXT_NODE_DEFAULT_LETTER_SPACING,
    color: resolvedColor || undefined,
  }), [resolvedFontSize, textAlign, resolvedColor]);

  const isEmpty = useMemo(() => isSlateValueEmpty(slateValue), [slateValue]);

  // ---- Plate editor instance ----
  // 非编辑节点使用轻量只读插件集（无 autoformat/exitBreak），减少初始化开销。
  const editor = usePlateEditor({
    plugins: isEditing ? EditableBoardTextEditorKit : ReadOnlyBoardTextEditorKit,
    value: slateValue,
  });

  // Register/unregister editor ref for toolbar access
  useEffect(() => {
    textEditorRefs.set(element.id, editor);
    return () => { textEditorRefs.delete(element.id); };
  }, [element.id, editor]);

  // Sync external value changes when NOT editing
  const lastValueJsonRef = useRef('');
  const reportedHeadingUpgradeRef = useRef<string>('');
  useEffect(() => {
    if (isGhost || isEditing) return;
    if (slateValueJson === lastValueJsonRef.current) return;
    lastValueJsonRef.current = slateValueJson;
    editor.tf.setValue(slateValue);
  }, [editor, isEditing, isGhost, slateValue, slateValueJson]);

  useEffect(() => {
    if (isGhost || isEditing || !needsHeadingShortcutUpgrade) return;
    const reportKey = `${element.id}:${incomingSlateValueJson}`;
    if (reportKey === reportedHeadingUpgradeRef.current) return;
    // 逻辑：已有节点如果仍保存着 `## title` 这类纯文本段落，首次加载时自动升级为标题块。
    reportedHeadingUpgradeRef.current = reportKey;
    lastValueJsonRef.current = slateValueJson;
    onUpdate({ value: slateValue, autoFocus: false });
  }, [
    element.id,
    incomingSlateValueJson,
    isEditing,
    isGhost,
    needsHeadingShortcutUpgrade,
    onUpdate,
    slateValue,
    slateValueJson,
  ]);

  // ---- Edit mode lifecycle ----

  useEffect(() => {
    if (isGhost) return;
    autoFocusConsumedRef.current = false;
  }, [element.id, isGhost]);

  useEffect(() => {
    if (isGhost) return;
    if (!editing) {
      if (isEditing) setIsEditing(false);
      return;
    }
    if (!isEditing) {
      setIsEditing(true);
      setShouldFocus(true);
    }
  }, [editing, isEditing, isGhost]);

  useEffect(() => {
    if (isGhost) return;
    if (!element.props.autoFocus || autoFocusConsumedRef.current) return;
    autoFocusConsumedRef.current = true;
    onSelect();
    setIsEditing(true);
    setShouldFocus(true);
    onUpdate({ autoFocus: false });
  }, [element.props.autoFocus, isGhost, onSelect, onUpdate]);

  useEffect(() => {
    if (isGhost) return;
    if (!selected && isEditing && !editing) {
      setIsEditing(false);
    }
  }, [editing, isEditing, isGhost, selected]);

  // Focus the Plate editor when entering edit mode
  useEffect(() => {
    if (isGhost || !shouldFocus || !isEditing) return;
    const timeout = window.setTimeout(() => {
      try {
        editor.tf.focus({ edge: 'end' });
      } catch {
        // editor may not be mounted yet
      }
      setShouldFocus(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [editor, isEditing, isGhost, shouldFocus]);

  useEffect(() => {
    if (isGhost) return;
    isEditingRef.current = isEditing;
  }, [isEditing, isGhost]);

  // ---- Event handlers ----

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (isLocked || isGhost) return;
      onSelect();
      setIsEditing(true);
      setShouldFocus(true);
      engine.setEditingNodeId(element.id);
    },
    [element.id, engine, isGhost, isLocked, onSelect]
  );

  const handleEditorBlur = useCallback(
    (event: ReactFocusEvent) => {
      if (isGhost) return;
      const related = event.relatedTarget as HTMLElement | null;
      // 逻辑：焦点仍在编辑器容器内（如 checkbox 按钮）、节点工具栏或画布控件时不退出编辑。
      if (
        related?.closest("[data-node-toolbar]") ||
        related?.closest("[data-board-controls]") ||
        containerRef.current?.contains(related)
      ) {
        return;
      }
      isEditingRef.current = false;
      setIsEditing(false);
      engine.setEditingNodeId(null);
    },
    [engine, isGhost],
  );

  /** Stop pointer events from reaching the canvas tool system while editing. */
  const stopEditorPointerPropagation = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isGhost) return;
      event.stopPropagation();
    },
    [isGhost]
  );

  /** Called by Plate on every editor change. */
  const handleEditorChange = useCallback(
    ({ value: nextValue }: { value: Value }) => {
      if (isGhost) return;
      const json = JSON.stringify(nextValue);
      if (json === lastValueJsonRef.current) return;
      lastValueJsonRef.current = json;
      onUpdate({ value: nextValue, autoFocus: false });
    },
    [isGhost, onUpdate]
  );

/** Toggle todo checkbox in view mode (readOnly blocks Plate's onCheckedChange). */
  const handleCheckboxPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isEditing || isGhost) return;

      const target = event.target as HTMLElement;
      const checkboxEl = target.closest('[data-slot="checkbox"]');
      if (!checkboxEl) return;

      // 逻辑：阻止事件冒泡到 SelectTool，避免触发节点选择。
      event.stopPropagation();
      event.preventDefault();

      // Match the clicked checkbox to its index among all checkboxes in this node.
      const allCheckboxes = containerRef.current?.querySelectorAll('[data-slot="checkbox"]');
      if (!allCheckboxes) return;
      const idx = Array.from(allCheckboxes).indexOf(checkboxEl as Element);
      if (idx < 0) return;

      // Toggle the matching todo element's `checked` property in the value.
      const currentValue = slateValue;
      let todoIdx = 0;
      const newValue = currentValue.map(node => {
        const n = node as Record<string, unknown>;
        if (n.listStyleType === 'todo') {
          if (todoIdx === idx) {
            todoIdx++;
            return { ...n, checked: !n.checked };
          }
          todoIdx++;
        }
        return node;
      }) as Value;

      editor.tf.setValue(newValue);
      lastValueJsonRef.current = JSON.stringify(newValue);
      onUpdate({ value: newValue });
    },
    [isEditing, isGhost, slateValue, editor, onUpdate],
  );

  // ---- Render ----

  const nodeStyle = element.props.style ?? "plain";
  const isSticky = nodeStyle === "sticky";
  const isShape = nodeStyle === "shape";
  const stickyColorDef = isSticky
    ? STICKY_COLORS[element.props.stickyColor ?? "yellow"]
    : null;

  // Shape styling
  const shapeType = element.props.shapeType ?? "rectangle";
  const shapeFill = element.props.shapeFill ?? "#3b82f6";
  const shapeStroke = element.props.shapeStroke ?? "#2563eb";
  const shapeStrokeWidth = element.props.shapeStrokeWidth ?? 2;
  const shapeClipPath = isShape ? SHAPE_CLIP_PATHS[shapeType] : null;
  const hasClipPath = Boolean(shapeClipPath);

  const containerStyle: React.CSSProperties | undefined = isShape
    ? {
        backgroundColor: shapeFill,
        border: `${shapeStrokeWidth}px solid ${shapeStroke}`,
        clipPath: shapeClipPath ?? undefined,
        borderRadius: shapeType === "rounded_rectangle" ? 12 : shapeType === "rectangle" ? 4 : 0,
        color: getShapeTextColor(shapeFill),
      }
    : backgroundColor
      ? { backgroundColor, clipPath: 'inset(0 round var(--radius-3xl))' }
      : { clipPath: 'inset(0 round var(--radius-3xl))' };

  const defaultBg = isSticky || isShape
    ? ""
    : backgroundColor
      ? ""
      : "bg-ol-surface-muted";
  const stickyBg = stickyColorDef
    ? `${stickyColorDef.bg} ${stickyColorDef.darkBg}`
    : "";
  const containerClasses = [
    "relative h-full w-full box-border",
    isShape ? (hasClipPath ? "p-[15%]" : "p-2.5") : "p-2.5",
    isSticky ? "rounded-3xl shadow-sm" : isShape ? "" : "rounded-3xl",
    isSticky
      ? (backgroundColor ? "" : stickyBg)
      : isShape
        ? ""
        : defaultBg,
    isShape ? "" : "text-ol-text-secondary",
    "overflow-y-auto board-text-scrollbar",
    isEditing ? "cursor-text" : "cursor-default",
  ].join(" ");

  if (isGhost) {
    return (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center rounded-3xl border border-ol-divider bg-background text-[11px] font-medium text-ol-text-auxiliary shadow-none transition hover:bg-ol-surface-muted"
        style={branchColor ? { borderColor: branchColor, color: branchColor } : undefined}
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!ghostParentId) return;
          engine.toggleMindmapCollapse(ghostParentId, { expand: true });
        }}
      >
        +{ghostCount}
      </button>
    );
  }

  const isStreamingForThisNode =
    pendingEntryRef.current?.nodeId === element.id && (stream.isStreaming || stream.text.length > 0)

  return (
    <NodeFrame className="group">
      {/*
        Version stack indicator — placed at NodeFrame level so badge/shadow/nav
        stay fixed against the node bounding box and don't scroll with text content.
      */}
      <VersionStackOverlay
        stack={element.props.versionStack}
        semanticColor="purple"
        engine={engine}
        selected={selected}
      />
      <div
        ref={containerRef}
        className={containerClasses}
        style={containerStyle}
        data-board-editor={isEditing ? "true" : undefined}
        data-board-scroll
        onDoubleClick={handleDoubleClick}
        onPointerDown={isEditing ? stopEditorPointerPropagation : handleCheckboxPointerDown}
        onPointerMove={isEditing ? stopEditorPointerPropagation : undefined}
      >
        {/*
          逻辑：流式 UI 仅在"生成结果写回本节点"时显示。"new-node" 模式下结果写到派生节点，
          源节点应继续显示 Plate 编辑器不被遮挡。
        */}
        {isStreamingForThisNode && !stream.text ? (
          <GeneratingOverlay
            estimatedSeconds={10}
            color="blue"
            onCancel={stream.abort}
            compact
          />
        ) : null}
        {isStreamingForThisNode && stream.text ? (
          <div
            className={cn(
              "w-full",
              MESSAGE_STREAM_MARKDOWN_CLASSNAME,
              "text-ol-text-secondary text-sm leading-relaxed",
            )}
            style={textStyle}
          >
            <MessageStreamMarkdown markdown={stream.text} />
          </div>
        ) : (
          <>
            <Plate editor={editor} onChange={handleEditorChange}>
              <PlateContent
                ref={contentRef}
                readOnly={!isEditing}
                className={cn(
                  "w-full bg-transparent outline-none p-0",
                  "text-ol-text-secondary",
                  "[&>[data-slate-node=element]+[data-slate-node=element]]:mt-1",
                  // 逻辑：view 模式下整体禁止指针交互，但 checkbox 保留可点击。
                  !isEditing && "pointer-events-none [&_[data-slot=checkbox]]:!pointer-events-auto",
                )}
                style={textStyle}
                onBlur={isEditing ? handleEditorBlur : undefined}
                data-allow-context-menu
              />
            </Plate>
            {isEmpty && !isEditing ? (
              <div
                className="pointer-events-none absolute inset-0 flex items-start px-4 pt-2.5 text-muted-foreground"
                style={{
                  textAlign,
                  fontSize: textStyle.fontSize,
                  lineHeight: textStyle.lineHeight,
                  fontWeight: TEXT_NODE_DEFAULT_FONT_WEIGHT,
                  letterSpacing: TEXT_NODE_DEFAULT_LETTER_SPACING,
                }}
              >
                {getTextNodePlaceholder()}
              </div>
            ) : null}
          </>
        )}
      </div>
      {/* Failed / Cancelled overlay — also at NodeFrame level so it covers the whole node. */}
      <FailureOverlay
        visible={lastFailure !== null}
        isCancelled={lastFailure?.isCancelled === true}
        message={lastFailure?.message}
        cancelledKey="board:textNode.cancelled"
        retryKey="board:textNode.retry"
        resendKey="board:textNode.resend"
        onRetry={handleRetryGeneration}
        canDismiss={true}
        onDismiss={() => setLastFailure(null)}
      />
      <InlinePanelPortal
        expanded={expanded}
        panelOverlay={panelOverlay}
        panelRef={panelRef}
        xywh={element.xywh}
        engine={engine}
      >
        <TextAiPanel
          element={element}
          upstream={upstream}
          fileContext={fileContext}
          onUpdate={onUpdate}
          onGenerate={handleTextGenerate}
          onGenerateNewNode={handleTextGenerateNewNode}
          generating={stream.isStreaming}
          onStop={stream.abort}
          readonly={panelReadonly}
          editing={editingOverride}
          onUnlock={() => setEditingOverride(true)}
          onCancelEdit={() => setEditingOverride(false)}
        />
      </InlinePanelPortal>
    </NodeFrame>
  );
}

/** Render a text node, switching to markdown projection mode when needed. */
export function TextNodeView(props: CanvasNodeViewProps<TextNodeProps>) {
  if (props.element.props.readOnlyProjection === true) {
    const resolvedFontSize = resolveHeadingFontSize(props.element.props.fontSize);
    const resolvedColor = props.element.props.color ?? getAutoTextColor(props.element.props.backgroundColor);
    return (
      <ReadOnlyMarkdownProjection
        elementId={props.element.id}
        markdownText={props.element.props.markdownText ?? ""}
        fontSize={resolvedFontSize}
        color={resolvedColor}
        backgroundColor={props.element.props.backgroundColor}
      />
    );
  }

  return <EditableTextNodeView {...props} />;
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

/** Definition for the text node. */
export const TextNodeDefinition: CanvasNodeDefinition<TextNodeProps> = {
  type: "text",
  schema: z.object({
    value: z.any(),
    autoFocus: z.boolean().optional(),
    collapsedHeight: z.number().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.number().optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
    readOnlyProjection: z.boolean().optional(),
    markdownText: z.string().optional(),
    style: z.enum(["plain", "sticky", "shape"]).optional(),
    stickyColor: z.enum(["yellow", "blue", "green", "pink", "purple", "orange"]).optional(),
    shapeType: z.enum(["rectangle", "rounded_rectangle", "ellipse", "diamond", "triangle"]).optional(),
    shapeFill: z.string().optional(),
    shapeStroke: z.string().optional(),
    shapeStrokeWidth: z.number().optional(),
    origin: z.enum(['user', 'upload', 'ai-generate', 'paste']).optional(),
    aiConfig: z.any().optional(),
    versionStack: z.any().optional(),
  }) as z.ZodType<TextNodeProps>,
  defaultProps: {
    value: DEFAULT_TEXT_VALUE,
    autoFocus: false,
    collapsedHeight: undefined,
    fontSize: TEXT_NODE_DEFAULT_FONT_SIZE,
    fontWeight: undefined,
    fontStyle: undefined,
    textDecoration: undefined,
    textAlign: TEXT_NODE_DEFAULT_TEXT_ALIGN,
    color: undefined,
    backgroundColor: undefined,
    readOnlyProjection: false,
    markdownText: "",
  },
  view: TextNodeView,
  toolbar: (ctx) => {
    if (ctx.element.props.readOnlyProjection) {
      return [];
    }
    return createTextToolbarItems(ctx);
  },
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: TEXT_NODE_MIN_SIZE,
    maxSize: TEXT_NODE_MAX_SIZE,
  },
  inlinePanel: { width: 420, height: 360 },
  outputTypes: ['text'],
};
