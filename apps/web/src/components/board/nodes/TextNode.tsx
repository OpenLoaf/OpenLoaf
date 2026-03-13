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
  CanvasConnectorTemplateDefinition,
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
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Italic,
  List,
  ListOrdered,
  Palette,
  PaintBucket,
  Play,
  Strikethrough,
  Type,
  Underline,
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
  BOARD_TOOLBAR_ITEM_BLUE,
  BOARD_TOOLBAR_ITEM_PURPLE,
} from "../ui/board-style-system";
import { useBoardContext } from "../core/BoardProvider";
import { VIDEO_GENERATE_NODE_TYPE } from "./videoGenerate";
import { MINDMAP_META } from "../engine/mindmap-layout";
import { HueSlider, buildColorSwatches, DEFAULT_COLOR_PRESETS } from "../ui/HueSlider";
import { BoardTextEditorKit } from "./text-editor-kit";
import {
  getBoardChatMessageMeta,
  getBoardChatPartMeta,
  layoutBoardChatMessageGroup,
} from "../utils/board-chat-message";
import { createBoardChatMessageToolbarItems } from "../utils/board-chat-toolbar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Text value stored on the text node (rich text Value or legacy string). */
export type TextNodeValue = string | Value;

/** Supported text alignment for text nodes. */
export type TextNodeTextAlign = "left" | "center" | "right";

export type TextNodeProps = {
  /** Text content stored on the node. */
  value: TextNodeValue;
  /** Whether the node should auto-enter edit mode on mount. */
  autoFocus?: boolean;
  /** Collapsed height stored as view baseline size. */
  collapsedHeight?: number;
  /** Font size for the text node. */
  fontSize?: number;
  /** Font weight for the text node (legacy — kept for backward compat). */
  fontWeight?: number;
  /** Font style for the text node (legacy — kept for backward compat). */
  fontStyle?: "normal" | "italic";
  /** Text decoration for the text node (legacy — kept for backward compat). */
  textDecoration?: "none" | "underline" | "line-through";
  /** Text alignment for the text node. */
  textAlign?: TextNodeTextAlign;
  /** Custom text color for the text node. */
  color?: string;
  /** Custom background color for the text node. */
  backgroundColor?: string;
  /** Render the node as a read-only chat projection. */
  readOnlyProjection?: boolean;
  /** Markdown text shown in read-only chat projection mode. */
  markdownText?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default text content for new text nodes. */
const DEFAULT_TEXT_VALUE: Value = [{ type: 'p', children: [{ text: '' }] }];
/** Placeholder copy for empty text nodes – resolved at render time. */
const getTextNodePlaceholder = () => i18next.t('board:textNode.placeholder');
/** Vertical padding used by the text node container (matches p-2.5 = 10px * 2). */
const TEXT_NODE_VERTICAL_PADDING = 20;
/** Ignore tiny resize deltas to avoid jitter. */
const TEXT_NODE_RESIZE_EPSILON = 2;
/** Default font size for text nodes. */
const TEXT_NODE_DEFAULT_FONT_SIZE = 18;
/** Default line height multiplier for text nodes. */
const TEXT_NODE_LINE_HEIGHT = 1.4;
/** Default font weight for board text nodes. */
const TEXT_NODE_DEFAULT_FONT_WEIGHT = 430;
/** Subtle tracking tweak so board copy feels less loose. */
const TEXT_NODE_DEFAULT_LETTER_SPACING = "-0.012em";
/** Maximum font size for text nodes. */
const TEXT_NODE_MAX_FONT_SIZE = 52;
/** Default height for a single-line text node. */
export const TEXT_NODE_DEFAULT_HEIGHT = Math.ceil(
  TEXT_NODE_DEFAULT_FONT_SIZE * TEXT_NODE_LINE_HEIGHT + TEXT_NODE_VERTICAL_PADDING
);
/** Minimum size for text nodes. */
const TEXT_NODE_MIN_SIZE = { w: 200, h: TEXT_NODE_DEFAULT_HEIGHT };
/** Maximum size for text nodes. */
const TEXT_NODE_MAX_SIZE = { w: 720, h: 420 };
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

/** Connector templates offered by the text node – resolved at render time. */
const getTextNodeConnectorTemplates = (): CanvasConnectorTemplateDefinition[] => [
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    label: i18next.t('board:connector.videoGenerate'),
    description: i18next.t('board:connector.videoGenerateDesc'),
    size: [360, 280],
    icon: <Play size={14} />,
    createNode: () => ({
      type: VIDEO_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  const element = engine.doc.getElementById(props.elementId);
  const partMeta = getBoardChatPartMeta(element);
  const messageGroupMeta =
    getBoardChatMessageMeta(element)
    ?? (partMeta
      ? getBoardChatMessageMeta(engine.doc.getElementById(partMeta.messageGroupId))
      : null);
  const isAnimating = messageGroupMeta?.status === "streaming";

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const node = engine.doc.getElementById(props.elementId);
      if (!node || node.kind !== "node") return;
      const nextHeight = Math.max(
        TEXT_NODE_DEFAULT_HEIGHT,
        Math.ceil(content.scrollHeight + 24),
      );
      const [, , width, currentHeight] = node.xywh;
      if (Math.abs(currentHeight - nextHeight) <= TEXT_NODE_RESIZE_EPSILON) return;
      const partMeta = getBoardChatPartMeta(node);
      // 逻辑：只读聊天文本高度变化时，同时同步消息组内垂直布局，避免后续节点重叠。
      engine.batch(() => {
        engine.doc.transact(() => {
          engine.doc.updateElement(props.elementId, {
            xywh: [node.xywh[0], node.xywh[1], width, nextHeight],
          });
        });
      });
      if (partMeta?.messageGroupId) {
        layoutBoardChatMessageGroup(engine, partMeta.messageGroupId);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [engine, props.elementId]);

  return (
    <div
      className={cn(
        "relative w-full box-border p-3",
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
        "inline-flex h-8 min-w-[32px] items-center justify-center rounded-md px-2 text-[11px] font-medium",
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
      className: BOARD_TOOLBAR_ITEM_PURPLE,
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
      className: BOARD_TOOLBAR_ITEM_PURPLE,
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
                        "h-5 w-5 rounded-sm ring-1 ring-border",
                        isActive
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                          : ""
                      )}
                      style={{ backgroundColor: color.value }}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-sm ring-1 ring-border text-[10px] text-ol-text-auxiliary",
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

  const fontSize = resolveHeadingFontSize(ctx.element.props.fontSize);
  const textAlign = ctx.element.props.textAlign ?? TEXT_NODE_DEFAULT_TEXT_ALIGN;

  // Get the Plate editor instance for inline formatting
  const editor = textEditorRefs.get(ctx.element.id);

  // Helper: check if a mark is active on current selection
  const isMarkActive = (key: string) => {
    if (!editor) return false;
    try {
      const marks = editor.api.marks();
      return Boolean(marks?.[key as keyof typeof marks]);
    } catch {
      return false;
    }
  };

  // Helper: toggle an inline mark
  const toggleMark = (key: string) => {
    if (!editor) return;
    editor.tf.toggleMark(key);
  };

  return [
    // ---- Node-level: Font size ----
    {
      id: 'text-size',
      label: t('board:textNode.toolbar.fontSize'),
      showLabel: true,
      icon: <Type size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      panel: (
        <div className="flex items-center gap-1">
          {TEXT_NODE_FONT_SIZES.map(size => (
            <TextToolbarPanelButton
              key={size.label}
              title={size.label}
              active={fontSize === size.value}
              onSelect={() => ctx.updateNodeProps({ fontSize: size.value })}
            >
              {size.label}
            </TextToolbarPanelButton>
          ))}
        </div>
      ),
    },
    // ---- Inline: Bold / Italic / Underline / Strikethrough ----
    {
      id: 'text-inline-style',
      label: t('board:textNode.toolbar.style'),
      showLabel: true,
      icon: <Bold size={14} />,
      className: BOARD_TOOLBAR_ITEM_PURPLE,
      panel: (
        <div className="flex items-center gap-1">
          <TextToolbarPanelButton
            title={t('board:textNode.format.bold')}
            active={isMarkActive('bold')}
            onSelect={() => toggleMark('bold')}
          >
            <Bold size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title={t('board:textNode.format.italic')}
            active={isMarkActive('italic')}
            onSelect={() => toggleMark('italic')}
          >
            <Italic size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title={t('board:textNode.format.underline')}
            active={isMarkActive('underline')}
            onSelect={() => toggleMark('underline')}
          >
            <Underline size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title={t('board:textNode.format.strikethrough')}
            active={isMarkActive('strikethrough')}
            onSelect={() => toggleMark('strikethrough')}
          >
            <Strikethrough size={14} />
          </TextToolbarPanelButton>
        </div>
      ),
    },
    // ---- Inline: Lists (ul / ol / todo) ----
    {
      id: 'text-list',
      label: t('board:textNode.toolbar.list'),
      showLabel: true,
      icon: <List size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
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
    // ---- Node-level: Text align ----
    {
      id: 'text-align',
      label: t('board:textNode.toolbar.align'),
      showLabel: true,
      icon: <AlignLeft size={14} />,
      className: BOARD_TOOLBAR_ITEM_BLUE,
      panel: (
        <div className="flex items-center gap-1">
          <TextToolbarPanelButton
            title={t('board:textNode.format.alignLeft')}
            active={textAlign === "left"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "left" })}
          >
            <AlignLeft size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title={t('board:textNode.format.alignCenter')}
            active={textAlign === "center"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "center" })}
          >
            <AlignCenter size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title={t('board:textNode.format.alignRight')}
            active={textAlign === "right"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "right" })}
          >
            <AlignRight size={14} />
          </TextToolbarPanelButton>
        </div>
      ),
    },
    // ---- Node-level: Text color & Background color ----
    ...buildColorToolbarItems(t, ctx, { textColor, backgroundColor, autoTextColor, colorPresets, backgroundPresets, addColorHistory }),
  ];
}

// ---------------------------------------------------------------------------
// TextNodeView — main component
// ---------------------------------------------------------------------------

/** Render the editable text node with Plate rich-text editing. */
function EditableTextNodeView({
  element,
  selected,
  editing,
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

  const { engine } = useBoardContext();
  const isLocked = engine.isLocked() || element.locked;

  const [isEditing, setIsEditing] = useState(Boolean(editing) && !isGhost);
  const [shouldFocus, setShouldFocus] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoFocusConsumedRef = useRef(false);
  const isEditingRef = useRef(false);

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
  const editor = usePlateEditor({
    plugins: BoardTextEditorKit,
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

  const handleEditorPointerDown = useCallback(
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

  const containerStyle = backgroundColor ? { backgroundColor } : undefined;
  const defaultBg = backgroundColor ? "" : "bg-ol-surface-muted";
  const containerClasses = [
    "relative h-full w-full box-border p-2.5",
    isEditing && !backgroundColor
      ? "bg-background"
      : defaultBg,
    "text-ol-text-primary",
    "overflow-y-auto board-text-scrollbar",
    isEditing ? "cursor-text" : "cursor-default",
  ].join(" ");

  if (isGhost) {
    return (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center rounded-full border border-ol-divider bg-background text-[11px] font-medium text-ol-text-auxiliary shadow-sm transition hover:bg-ol-surface-muted"
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

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={containerStyle}
      data-board-editor={isEditing ? "true" : undefined}
      data-board-scroll
      onDoubleClick={handleDoubleClick}
      onPointerDown={isEditing ? handleEditorPointerDown : handleCheckboxPointerDown}
    >
      <Plate editor={editor} onChange={handleEditorChange}>
        <PlateContent
          ref={contentRef}
          readOnly={!isEditing}
          className={cn(
            "w-full bg-transparent outline-none p-0",
            "text-ol-text-primary",
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
    </div>
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
  getMinSize: (element) => ({
    w: TEXT_NODE_MIN_SIZE.w,
    h: Math.ceil(
      resolveHeadingFontSize(element.props.fontSize) * TEXT_NODE_LINE_HEIGHT
        + TEXT_NODE_VERTICAL_PADDING,
    ),
  }),
  connectorTemplates: () => getTextNodeConnectorTemplates(),
  toolbar: (ctx) => {
    if (ctx.element.props.readOnlyProjection) {
      const messageMeta = getBoardChatMessageMeta(ctx.element);
      return messageMeta ? createBoardChatMessageToolbarItems(ctx, messageMeta) : [];
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
};
