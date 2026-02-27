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
  ChangeEvent as ReactChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Palette,
  PaintBucket,
  Play,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import { cn } from "@udecode/cn";
import { useBoardContext } from "../core/BoardProvider";
import { VIDEO_GENERATE_NODE_TYPE } from "./videoGenerate";
import { MINDMAP_META } from "../engine/mindmap-layout";

/** Text value stored on the text node. */
export type TextNodeValue = string;

/** Supported font style for text nodes. */
export type TextNodeFontStyle = "normal" | "italic";
/** Supported text decoration for text nodes. */
export type TextNodeDecoration = "none" | "underline" | "line-through";
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
  /** Font weight for the text node. */
  fontWeight?: number;
  /** Font style for the text node. */
  fontStyle?: TextNodeFontStyle;
  /** Text decoration for the text node. */
  textDecoration?: TextNodeDecoration;
  /** Text alignment for the text node. */
  textAlign?: TextNodeTextAlign;
  /** Custom text color for the text node. */
  color?: string;
  /** Custom background color for the text node. */
  backgroundColor?: string;
};

/** Default text content for new text nodes. */
const DEFAULT_TEXT_VALUE = "";
/** Placeholder copy for empty text nodes. */
const TEXT_NODE_PLACEHOLDER = "输入文字内容";
/** Shared text styling for text node content. */
const TEXT_CONTENT_CLASSNAME =
  "text-[11px] leading-4 text-slate-900 dark:text-slate-100 md:text-[11px]";
/** Text styling for view mode. */
const TEXT_VIEW_CLASSNAME = `${TEXT_CONTENT_CLASSNAME} whitespace-pre-wrap break-words`;
/** Text styling for edit mode. */
const TEXT_EDIT_CLASSNAME =
  `${TEXT_CONTENT_CLASSNAME} h-full w-full resize-none bg-transparent outline-none`;
/** Vertical padding used by the text node container. */
const TEXT_NODE_VERTICAL_PADDING = 32;
/** Ignore tiny resize deltas to avoid jitter. */
const TEXT_NODE_RESIZE_EPSILON = 2;
/** Default font size for text nodes. */
const TEXT_NODE_DEFAULT_FONT_SIZE = 18;
/** Default line height multiplier for text nodes. */
const TEXT_NODE_LINE_HEIGHT = 1.4;
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
/** Default font weight for text nodes. */
const TEXT_NODE_DEFAULT_FONT_WEIGHT = 400;
/** Default font style for text nodes. */
const TEXT_NODE_DEFAULT_FONT_STYLE: TextNodeFontStyle = "normal";
/** Default text decoration for text nodes. */
const TEXT_NODE_DEFAULT_TEXT_DECORATION: TextNodeDecoration = "none";
/** Default text alignment for text nodes. */
const TEXT_NODE_DEFAULT_TEXT_ALIGN: TextNodeTextAlign = "left";
/** Auto text color when background is light. */
const TEXT_NODE_AUTO_TEXT_LIGHT = "#111827";
/** Auto text color when background is dark. */
const TEXT_NODE_AUTO_TEXT_DARK = "#ffffff";
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
/** Preset font weight options for text toolbar. */
const TEXT_NODE_FONT_WEIGHTS = [
  { label: "常规", value: 400 },
  { label: "中等", value: 500 },
  { label: "半粗", value: 600 },
  { label: "加粗", value: 700 },
] as const;
/** Preset color options for text toolbar. */
const TEXT_NODE_COLOR_PRESETS: Array<{ label: string; value?: string }> = [
  { label: "默认", value: undefined },
  { label: "黑", value: "#111827" },
  { label: "蓝", value: "#1d4ed8" },
  { label: "橙", value: "#f59e0b" },
  { label: "红", value: "#ef4444" },
  { label: "绿", value: "#16a34a" },
  { label: "紫", value: "#7c3aed" },
  { label: "灰", value: "#6b7280" },
] as const;
/** Preset background color options for text toolbar. */
const TEXT_NODE_BACKGROUND_PRESETS: Array<{ label: string; value?: string }> = [
  { label: "透明", value: undefined },
  { label: "黑", value: "#111827" },
  { label: "蓝", value: "#1d4ed8" },
  { label: "橙", value: "#f59e0b" },
  { label: "红", value: "#ef4444" },
  { label: "绿", value: "#16a34a" },
  { label: "紫", value: "#7c3aed" },
  { label: "灰", value: "#6b7280" },
] as const;
/** Connector templates offered by the text node. */
const TEXT_NODE_CONNECTOR_TEMPLATES: CanvasConnectorTemplateDefinition[] = [
  {
    id: VIDEO_GENERATE_NODE_TYPE,
    label: "生成视频",
    description: "基于文本生成视频",
    size: [360, 280],
    icon: <Play size={14} />,
    createNode: () => ({
      type: VIDEO_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: TextNodeValue): string {
  return typeof value === "string" ? value : DEFAULT_TEXT_VALUE;
}

/** Detect whether the text value is effectively empty. */
function isTextValueEmpty(value: string): boolean {
  return value.trim().length === 0;
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
      // 逻辑：选择最接近的 H1-H5 字号作为实际渲染值。
      closest = size;
      minDelta = delta;
    }
  }
  return closest;
}

/** Read element padding sizes in pixels. */
function getElementPadding(element: HTMLElement): { x: number; y: number } {
  const style = window.getComputedStyle(element);
  const toNumber = (value: string) => Number.parseFloat(value) || 0;
  return {
    x: toNumber(style.paddingLeft) + toNumber(style.paddingRight),
    y: toNumber(style.paddingTop) + toNumber(style.paddingBottom),
  };
}

/** Create a hidden element for text measurement. */
function createMeasureElement(reference: HTMLElement): HTMLDivElement {
  const style = window.getComputedStyle(reference);
  const element = document.createElement("div");
  element.style.position = "absolute";
  element.style.visibility = "hidden";
  element.style.pointerEvents = "none";
  element.style.whiteSpace = "pre";
  element.style.fontFamily = style.fontFamily;
  element.style.fontSize = style.fontSize;
  element.style.fontWeight = style.fontWeight;
  element.style.fontStyle = style.fontStyle;
  element.style.letterSpacing = style.letterSpacing;
  element.style.lineHeight = style.lineHeight;
  element.style.overflowWrap = "break-word";
  element.style.wordBreak = "break-word";
  return element;
}

/** Measure text width using the reference styles. */
function measureTextWidth(text: string, reference: HTMLElement): number {
  const element = createMeasureElement(reference);
  element.textContent = text;
  document.body.appendChild(element);
  const width = element.scrollWidth;
  document.body.removeChild(element);
  return width;
}

/** Measure text height when wrapped to a specific width. */
function measureTextHeight(
  text: string,
  reference: HTMLElement,
  width: number
): number {
  const element = createMeasureElement(reference);
  element.style.whiteSpace = "pre-wrap";
  element.style.width = `${width}px`;
  element.textContent = text;
  document.body.appendChild(element);
  const height = element.scrollHeight;
  document.body.removeChild(element);
  return height;
}

/** Measure content height without being affected by textarea sizing. */
function getContentScrollHeight(content: HTMLElement): number {
  if (!(content instanceof HTMLTextAreaElement)) {
    return content.scrollHeight;
  }
  const prevHeight = content.style.height;
  const prevOverflow = content.style.overflowY;
  content.style.height = "auto";
  content.style.overflowY = "hidden";
  const measured = content.scrollHeight;
  content.style.height = prevHeight;
  content.style.overflowY = prevOverflow;
  return measured;
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
  // 逻辑：背景偏暗则使用白字，偏亮则使用黑字。
  return luminance < 0.5 ? TEXT_NODE_AUTO_TEXT_DARK : TEXT_NODE_AUTO_TEXT_LIGHT;
}

type TextToolbarPanelButtonProps = {
  /** Accessible label for the button. */
  title: string;
  /** Active state for button styling. */
  active?: boolean;
  /** Click handler for the button. */
  onSelect: () => void;
  /** Button contents. */
  children: ReactNode;
  /** Extra class names for styling. */
  className?: string;
};

/** Render a compact button for text toolbar panels. */
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
        // 逻辑：使用 pointerdown 触发，避免 click 被画布层吞掉。
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

/** Build toolbar items for text nodes. */
function createTextToolbarItems(ctx: CanvasToolbarContext<TextNodeProps>) {
  const fontSize = resolveHeadingFontSize(ctx.element.props.fontSize);
  const fontWeight = ctx.element.props.fontWeight ?? TEXT_NODE_DEFAULT_FONT_WEIGHT;
  const fontStyle = ctx.element.props.fontStyle ?? TEXT_NODE_DEFAULT_FONT_STYLE;
  const textDecoration =
    ctx.element.props.textDecoration ?? TEXT_NODE_DEFAULT_TEXT_DECORATION;
  const textAlign = ctx.element.props.textAlign ?? TEXT_NODE_DEFAULT_TEXT_ALIGN;
  const textColor = ctx.element.props.color;
  const backgroundColor = ctx.element.props.backgroundColor;
  const autoTextColor = getAutoTextColor(backgroundColor);

  return [
    {
      id: "text-size",
      label: "字号",
      showLabel: true,
      icon: <Type size={14} />,
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
    {
      id: "text-weight",
      label: "字重",
      showLabel: true,
      icon: <Bold size={14} />,
      panel: (
        <div className="flex items-center gap-1">
          {TEXT_NODE_FONT_WEIGHTS.map(weight => (
            <TextToolbarPanelButton
              key={weight.value}
              title={weight.label}
              active={fontWeight === weight.value}
              onSelect={() => ctx.updateNodeProps({ fontWeight: weight.value })}
            >
              {weight.label}
            </TextToolbarPanelButton>
          ))}
        </div>
      ),
    },
    {
      id: "text-style",
      label: "样式",
      showLabel: true,
      icon: <Italic size={14} />,
      panel: (
        <div className="flex items-center gap-1">
          <TextToolbarPanelButton
            title="斜体"
            active={fontStyle === "italic"}
            onSelect={() =>
              ctx.updateNodeProps({
                fontStyle: fontStyle === "italic" ? "normal" : "italic",
              })
            }
          >
            <Italic size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title="下划线"
            active={textDecoration === "underline"}
            onSelect={() => {
              const nextDecoration =
                textDecoration === "underline" ? "none" : "underline";
              // 逻辑：下划线与删除线互斥，点击切换当前状态。
              ctx.updateNodeProps({ textDecoration: nextDecoration });
            }}
          >
            <Underline size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title="删除线"
            active={textDecoration === "line-through"}
            onSelect={() => {
              const nextDecoration =
                textDecoration === "line-through" ? "none" : "line-through";
              // 逻辑：删除线与下划线互斥，点击切换当前状态。
              ctx.updateNodeProps({ textDecoration: nextDecoration });
            }}
          >
            <Strikethrough size={14} />
          </TextToolbarPanelButton>
        </div>
      ),
    },
    {
      id: "text-align",
      label: "对齐",
      showLabel: true,
      icon: <AlignLeft size={14} />,
      panel: (
        <div className="flex items-center gap-1">
          <TextToolbarPanelButton
            title="左对齐"
            active={textAlign === "left"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "left" })}
          >
            <AlignLeft size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title="居中"
            active={textAlign === "center"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "center" })}
          >
            <AlignCenter size={14} />
          </TextToolbarPanelButton>
          <TextToolbarPanelButton
            title="右对齐"
            active={textAlign === "right"}
            onSelect={() => ctx.updateNodeProps({ textAlign: "right" })}
          >
            <AlignRight size={14} />
          </TextToolbarPanelButton>
        </div>
      ),
    },
    {
      id: "text-color",
      label: "文字颜色",
      showLabel: true,
      icon: <Palette size={14} />,
      panel: (
        <div className="grid grid-cols-4 gap-1">
          {TEXT_NODE_COLOR_PRESETS.map(color => {
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
                      autoTextColor ? "" : "text-slate-900 dark:text-slate-100",
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
      ),
    },
    {
      id: "text-background",
      label: "背景色",
      showLabel: true,
      icon: <PaintBucket size={14} />,
      panel: (
        <div className="grid grid-cols-4 gap-1">
          {TEXT_NODE_BACKGROUND_PRESETS.map(color => {
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
                      "inline-flex h-5 w-5 items-center justify-center rounded-sm ring-1 ring-border text-[10px] text-slate-500",
                      isActive
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                        : ""
                    )}
                  >
                    透
                  </span>
                )}
              </TextToolbarPanelButton>
            );
          })}
        </div>
      ),
    },
  ];
}

/** Render a text node with plain textarea editing. */
export function TextNodeView({
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
  /** Engine instance used for lock checks. */
  const { engine } = useBoardContext();
  /** Whether the node is locked for edits. */
  const isLocked = engine.isLocked() || element.locked;
  /** Local edit mode state. */
  const [isEditing, setIsEditing] = useState(Boolean(editing) && !isGhost);
  /** One-shot focus flag for entering edit mode. */
  const [shouldFocus, setShouldFocus] = useState(false);
  /** Container ref for focus boundary checks. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Editor content ref for auto-resize measurements. */
  const contentRef = useRef<HTMLDivElement | HTMLTextAreaElement | null>(null);
  /** Textarea ref for focus control. */
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Guard to consume autoFocus only once per node id. */
  const autoFocusConsumedRef = useRef(false);
  /** Cached text snapshot for change detection. */
  const lastValueRef = useRef("");
  /** Track the collapsed height baseline for edit expansion. */
  const collapsedHeightRef = useRef<number | null>(null);
  /** Track the last edit mode state for height transitions. */
  const wasEditingRef = useRef(false);
  /** Track the latest edit mode flag for async callbacks. */
  const isEditingRef = useRef(false);
  /** Pending auto-resize animation frame id. */
  const resizeRafRef = useRef<number | null>(null);

  const normalizedValue = useMemo(
    () => normalizeTextValue(element.props.value),
    [element.props.value]
  );
  /** Resolved text alignment for view/edit modes. */
  const textAlign = element.props.textAlign ?? TEXT_NODE_DEFAULT_TEXT_ALIGN;
  const backgroundColor = element.props.backgroundColor;
  const autoTextColor = useMemo(
    () => getAutoTextColor(backgroundColor),
    [backgroundColor]
  );
  /** Resolved text style for view/edit modes. */
  const textStyle = useMemo(() => {
    const resolvedColor = element.props.color ?? autoTextColor;
    const resolvedFontSize = resolveHeadingFontSize(element.props.fontSize);
    return {
      fontSize: resolvedFontSize,
      fontWeight: element.props.fontWeight ?? TEXT_NODE_DEFAULT_FONT_WEIGHT,
      fontStyle: element.props.fontStyle ?? TEXT_NODE_DEFAULT_FONT_STYLE,
      textDecoration: element.props.textDecoration ?? TEXT_NODE_DEFAULT_TEXT_DECORATION,
      textAlign,
      lineHeight: TEXT_NODE_LINE_HEIGHT,
      color: resolvedColor || undefined,
    } as const;
  }, [
    autoTextColor,
    element.props.color,
    element.props.fontSize,
    element.props.fontStyle,
    element.props.fontWeight,
    element.props.textAlign,
    element.props.textDecoration,
    textAlign,
  ]);
  /** Local draft text for editing. */
  const [draftText, setDraftText] = useState(normalizedValue);
  /** Whether the text node has any real content. */
  const isEmpty = useMemo(() => isTextValueEmpty(draftText), [draftText]);

  useEffect(() => {
    if (isGhost) return;
    if (normalizedValue === lastValueRef.current) return;
    if (!isEditing) {
      // 逻辑：非编辑状态同步外部文本，避免覆盖输入。
      lastValueRef.current = normalizedValue;
      setDraftText(normalizedValue);
      return;
    }
    // 逻辑：编辑中仅更新缓存，避免覆盖当前输入。
    lastValueRef.current = normalizedValue;
  }, [isEditing, isGhost, normalizedValue]);

  useEffect(() => {
    if (isGhost) return;
    autoFocusConsumedRef.current = false;
  }, [element.id, isGhost]);

  useEffect(() => {
    if (isGhost) return;
    if (!editing) {
      if (isEditing) {
        // 逻辑：外部结束编辑时同步退出状态。
        setIsEditing(false);
      }
      return;
    }
    if (!isEditing) {
      // 逻辑：外部进入编辑时触发聚焦流程。
      setIsEditing(true);
      setShouldFocus(true);
    }
  }, [editing, isEditing, isGhost]);

  useEffect(() => {
    if (isGhost) return;
    if (!element.props.autoFocus || autoFocusConsumedRef.current) return;
    autoFocusConsumedRef.current = true;
    // 逻辑：自动创建的文本节点需要直接进入编辑并清除标记。
    onSelect();
    setIsEditing(true);
    setShouldFocus(true);
    onUpdate({ autoFocus: false });
  }, [element.props.autoFocus, isGhost, onSelect, onUpdate]);

  useEffect(() => {
    if (isGhost) return;
    if (!selected && isEditing && !editing) {
      // 逻辑：选中失效且未处于外部编辑时结束本地编辑。
      setIsEditing(false);
    }
  }, [editing, isEditing, isGhost, selected]);

  useEffect(() => {
    if (isGhost) return;
    if (!shouldFocus || !isEditing) return;
    const timeout = window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      setShouldFocus(false);
    }, 0);
    // 逻辑：编辑器挂载后立即清理聚焦标记，避免重复触发。
    return () => window.clearTimeout(timeout);
  }, [isEditing, isGhost, shouldFocus]);

  useEffect(() => {
    if (isGhost) return;
    isEditingRef.current = isEditing;
  }, [isEditing, isGhost]);

  /** Assign textarea ref and sync measurement target. */
  const setTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    contentRef.current = node;
  }, []);
  /** Assign view-mode content ref for measurement target. */
  const setContentDivRef = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
  }, []);

  /** Resize the node to fit content when exiting edit mode. */
  const fitToContentIfNeeded = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    if (engine.isLocked() || element.locked) return;
    const { x: paddingX, y: paddingY } = getElementPadding(container);
    const [x, y, currentWidth, currentHeight] = element.xywh;
    const intrinsicWidth = measureTextWidth(draftText, content);
    const requiredWidth = intrinsicWidth + paddingX;
    const clampedWidth = Math.min(
      TEXT_NODE_MAX_SIZE.w,
      Math.max(TEXT_NODE_MIN_SIZE.w, requiredWidth)
    );
    const nextWidth =
      Math.abs(clampedWidth - currentWidth) > TEXT_NODE_RESIZE_EPSILON
        ? clampedWidth
        : currentWidth;
    const contentWidth = Math.max(0, nextWidth - paddingX);
    const measuredHeight = measureTextHeight(draftText, content, contentWidth);
    const requiredHeight = measuredHeight + paddingY;
    const clampedHeight = Math.min(
      TEXT_NODE_MAX_SIZE.h,
      Math.max(TEXT_NODE_MIN_SIZE.h, requiredHeight)
    );
    const nextHeight =
      Math.abs(clampedHeight - currentHeight) > TEXT_NODE_RESIZE_EPSILON
        ? clampedHeight
        : currentHeight;
    if (nextWidth === currentWidth && nextHeight === currentHeight) return;
    // 逻辑：结束编辑时按内容收缩或扩展，保证尺寸匹配文本。
    engine.doc.updateElement(element.id, { xywh: [x, y, nextWidth, nextHeight] });
  }, [
    draftText,
    element.id,
    element.locked,
    element.xywh,
    engine,
  ]);

  /** Expand the node height to fit the full text content. */
  const expandToContent = useCallback(() => {
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;
      if (!isEditingRef.current) return;
      const content = contentRef.current;
      if (!content) return;
      if (engine.isLocked() || element.locked) return;
      const snapshot = engine.getSnapshot();
      if (snapshot.draggingId === element.id || snapshot.toolbarDragging) return;
      const contentHeight = Math.ceil(getContentScrollHeight(content));
      const [x, y, w, h] = element.xywh;
      const baseHeight =
        collapsedHeightRef.current ??
        element.props.collapsedHeight ??
        element.xywh[3];
      const targetHeight = Math.max(
        baseHeight,
        contentHeight + TEXT_NODE_VERTICAL_PADDING
      );
      if (Math.abs(targetHeight - h) <= TEXT_NODE_RESIZE_EPSILON) return;
      // 逻辑：编辑时根据内容自动调整高度，确保完整可见。
      engine.doc.updateElement(element.id, { xywh: [x, y, w, targetHeight] });
    });
  }, [
    engine,
    element.id,
    element.locked,
    element.props.collapsedHeight,
    element.xywh,
  ]);

  useEffect(() => {
    if (isGhost) return;
    if (isEditing) {
      if (!wasEditingRef.current) {
        const collapsedHeight =
          element.props.collapsedHeight ?? element.xywh[3];
        collapsedHeightRef.current = collapsedHeight;
        wasEditingRef.current = true;
        if (element.props.collapsedHeight !== collapsedHeight) {
          // 逻辑：首次进入编辑时缓存折叠高度，避免编辑基准丢失。
          onUpdate({ collapsedHeight });
        }
      }
      expandToContent();
      return;
    }

    if (wasEditingRef.current) {
      wasEditingRef.current = false;
      fitToContentIfNeeded();
      collapsedHeightRef.current = null;
    }
  }, [
    element.id,
    element.props.collapsedHeight,
    element.xywh,
    expandToContent,
    fitToContentIfNeeded,
    isEditing,
    isGhost,
    onUpdate,
  ]);

  useEffect(() => {
    if (isGhost) return;
    if (isEditing) return;
    const currentHeight = element.xywh[3];
    if (
      element.props.collapsedHeight === undefined ||
      Math.abs((element.props.collapsedHeight ?? 0) - currentHeight) >
        TEXT_NODE_RESIZE_EPSILON
    ) {
      // 逻辑：非编辑态更新折叠高度，保持与手动调整一致。
      onUpdate({ collapsedHeight: currentHeight });
    }
  }, [element.props.collapsedHeight, element.xywh, isEditing, isGhost, onUpdate]);

  useEffect(() => {
    if (isGhost) return;
    if (!isEditing && resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
  }, [isEditing, isGhost]);

  useEffect(() => {
    if (isGhost) return;
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, [isGhost]);

  /** Enter edit mode on node double click. */
  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (isLocked || isGhost) return;
      // 逻辑：双击进入编辑时保持节点选中状态。
      onSelect();
      setIsEditing(true);
      setShouldFocus(true);
      engine.setEditingNodeId(element.id);
    },
    [element.id, engine, isGhost, isLocked, onSelect]
  );

  /** Exit edit mode when text input loses focus. */
  const handleEditorBlur = useCallback(() => {
    if (isGhost) return;
    // 逻辑：焦点移出文本输入后结束编辑。
    isEditingRef.current = false;
    setIsEditing(false);
    engine.setEditingNodeId(null);
  }, [engine, isGhost]);

  /** Stop pointer events from bubbling to the canvas while editing. */
  const handleEditorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLTextAreaElement>) => {
      if (isGhost) return;
      // 逻辑：编辑状态下阻止画布工具接管指针事件。
      event.stopPropagation();
    },
    [isGhost]
  );

  /** Sync text changes into node props. */
  const handleTextChange = useCallback(
    (event: ReactChangeEvent<HTMLTextAreaElement>) => {
      if (isGhost) return;
      const nextValue = event.target.value;
      setDraftText(nextValue);
      if (nextValue === lastValueRef.current) return;
      lastValueRef.current = nextValue;
      // 逻辑：每次编辑同步节点数据，保证刷新后内容一致。
      onUpdate({ value: nextValue, autoFocus: false });
      if (isEditing) {
        expandToContent();
      }
    },
    [expandToContent, isEditing, isGhost, onUpdate]
  );

  const containerStyle = backgroundColor ? { backgroundColor } : undefined;
  const containerClasses = [
    "relative h-full w-full rounded-lg box-border p-2.5",
    isEditing && !backgroundColor
      ? "bg-white/90 dark:bg-slate-900/80"
      : "bg-transparent",
    "text-slate-900 dark:text-slate-100",
    isEditing ? "cursor-text overflow-visible" : "cursor-default overflow-hidden",
  ].join(" ");
  if (isGhost) {
    return (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
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

  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        style={containerStyle}
        data-board-editor="true"
        onDoubleClick={handleDoubleClick}
      >
        <textarea
          ref={setTextareaRef}
          className={TEXT_EDIT_CLASSNAME}
          style={textStyle}
          value={draftText}
          onChange={handleTextChange}
          onBlur={handleEditorBlur}
          onPointerDown={handleEditorPointerDown}
          data-allow-context-menu
        />
        {isEmpty ? (
          <div
            className="pointer-events-none absolute left-4 right-4 top-3 text-[11px] leading-4 text-slate-400 dark:text-slate-500"
            style={{ textAlign }}
          >
            {TEXT_NODE_PLACEHOLDER}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={containerStyle}
      onDoubleClick={handleDoubleClick}
    >
      <div ref={setContentDivRef} className={TEXT_VIEW_CLASSNAME} style={textStyle}>
        {draftText}
      </div>
      {isEmpty ? (
        <div
          className="pointer-events-none absolute left-4 right-4 top-3 text-[11px] leading-4 text-slate-400 dark:text-slate-500"
          style={{ textAlign }}
        >
          {TEXT_NODE_PLACEHOLDER}
        </div>
      ) : null}
    </div>
  );
}

/** Definition for the text node. */
export const TextNodeDefinition: CanvasNodeDefinition<TextNodeProps> = {
  type: "text",
  schema: z.object({
    value: z.string(),
    autoFocus: z.boolean().optional(),
    collapsedHeight: z.number().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.number().optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),
    backgroundColor: z.string().optional(),
  }),
  defaultProps: {
    value: DEFAULT_TEXT_VALUE,
    autoFocus: false,
    collapsedHeight: undefined,
    fontSize: TEXT_NODE_DEFAULT_FONT_SIZE,
    fontWeight: TEXT_NODE_DEFAULT_FONT_WEIGHT,
    fontStyle: TEXT_NODE_DEFAULT_FONT_STYLE,
    textDecoration: TEXT_NODE_DEFAULT_TEXT_DECORATION,
    textAlign: TEXT_NODE_DEFAULT_TEXT_ALIGN,
    color: undefined,
    backgroundColor: undefined,
  },
  view: TextNodeView,
  connectorTemplates: () => TEXT_NODE_CONNECTOR_TEMPLATES,
  toolbar: ctx => createTextToolbarItems(ctx),
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: TEXT_NODE_MIN_SIZE,
    maxSize: TEXT_NODE_MAX_SIZE,
  },
};
