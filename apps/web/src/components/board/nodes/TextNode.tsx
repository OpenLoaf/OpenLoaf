import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import type {
  ChangeEvent as ReactChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useBoardContext } from "../core/BoardProvider";

/** Legacy Plate node shape used by older text nodes. */
type LegacyPlateNode = {
  /** Plain text stored on the legacy node. */
  text?: string;
  /** Children nodes for nested structure. */
  children?: LegacyPlateNode[];
};

/** Legacy Plate document value stored on older text nodes. */
type LegacyPlateValue = LegacyPlateNode[];

/** Text value stored on the text node. */
export type TextNodeValue = string | LegacyPlateValue;

export type TextNodeProps = {
  /** Text content stored on the node. */
  value: TextNodeValue;
  /** Whether the node should auto-enter edit mode on mount. */
  autoFocus?: boolean;
  /** Collapsed height stored as view baseline size. */
  collapsedHeight?: number;
};

/** Default text content for new text nodes. */
const DEFAULT_TEXT_VALUE = "";
/** Placeholder copy for empty text nodes. */
const TEXT_NODE_PLACEHOLDER = "输入文字内容";
/** Shared text styling for text node content. */
const TEXT_CONTENT_CLASSNAME =
  "text-[14px] leading-6 text-slate-900 dark:text-slate-100";
/** Text styling for view mode. */
const TEXT_VIEW_CLASSNAME = `${TEXT_CONTENT_CLASSNAME} whitespace-pre-wrap break-words`;
/** Text styling for edit mode. */
const TEXT_EDIT_CLASSNAME =
  `${TEXT_CONTENT_CLASSNAME} h-full w-full resize-none bg-transparent outline-none`;
/** Vertical padding used by the text node container. */
const TEXT_NODE_VERTICAL_PADDING = 32;
/** Ignore tiny resize deltas to avoid jitter. */
const TEXT_NODE_RESIZE_EPSILON = 2;
/** Minimum size for text nodes. */
const TEXT_NODE_MIN_SIZE = { w: 200, h: 100 };
/** Maximum size for text nodes. */
const TEXT_NODE_MAX_SIZE = { w: 720, h: 420 };

/** Extract plain text from a legacy Plate node. */
function extractLegacyText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof node.text === "string") return node.text;
  if ("children" in node && Array.isArray(node.children)) {
    // 逻辑：递归拼接子节点文本，保留段落结构。
    return node.children.map(extractLegacyText).join("");
  }
  return "";
}

/** Normalize the stored value to a plain text string. */
function normalizeTextValue(value?: TextNodeValue): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    // 逻辑：兼容旧版 Plate 数据，按顶层节点换行合并。
    return value.map(extractLegacyText).join("\n");
  }
  return DEFAULT_TEXT_VALUE;
}

/** Detect whether the text value is effectively empty. */
function isTextValueEmpty(value: string): boolean {
  return value.trim().length === 0;
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

/** Render a text node with plain textarea editing. */
export function TextNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<TextNodeProps>) {
  /** Engine instance used for lock checks. */
  const { engine, runtime, actions } = useBoardContext();
  /** Whether the node is currently generating streamed content. */
  const isGenerating = Boolean(runtime?.generatingNodeIds.has(element.id));
  /** Whether the node is currently showing a prompt error state. */
  const isPromptError = Boolean(runtime?.promptErrorNodeIds.has(element.id));
  /** Whether the node is locked for edits. */
  const isLocked = engine.isLocked() || element.locked;
  /** Local edit mode state. */
  const [isEditing, setIsEditing] = useState(false);
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
  /** Track the latest generating flag for async callbacks. */
  const isGeneratingRef = useRef(false);
  /** Pending auto-fit animation frame id for streaming updates. */
  const fitRafRef = useRef<number | null>(null);

  const normalizedValue = useMemo(
    () => normalizeTextValue(element.props.value),
    [element.props.value]
  );
  /** Local draft text for editing. */
  const [draftText, setDraftText] = useState(normalizedValue);
  /** Whether the text node has any real content. */
  const isEmpty = useMemo(() => isTextValueEmpty(draftText), [draftText]);
  /** Whether the current content overflows the collapsed height. */
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (normalizedValue === lastValueRef.current) return;
    if (!isEditing) {
      // 逻辑：非编辑状态同步外部文本，避免覆盖输入。
      lastValueRef.current = normalizedValue;
      setDraftText(normalizedValue);
      return;
    }
    // 逻辑：编辑中仅更新缓存，避免覆盖当前输入。
    lastValueRef.current = normalizedValue;
  }, [isEditing, normalizedValue]);

  useEffect(() => {
    autoFocusConsumedRef.current = false;
  }, [element.id]);

  useEffect(() => {
    if (!element.props.autoFocus || autoFocusConsumedRef.current) return;
    if (isGenerating || isPromptError) return;
    autoFocusConsumedRef.current = true;
    // 逻辑：自动创建的文本节点需要直接进入编辑并清除标记。
    onSelect();
    setIsEditing(true);
    setShouldFocus(true);
    onUpdate({ autoFocus: false });
  }, [element.props.autoFocus, isGenerating, isPromptError, onSelect, onUpdate]);

  useEffect(() => {
    if (!selected && isEditing) {
      // 逻辑：失去选中时退出编辑，避免输入状态悬挂。
      setIsEditing(false);
    }
  }, [isEditing, selected]);

  useEffect(() => {
    if (!isGenerating || !isEditing) return;
    // 逻辑：生成中强制退出编辑，避免用户修改流式内容。
    setIsEditing(false);
    setShouldFocus(false);
  }, [isEditing, isGenerating]);

  useEffect(() => {
    if (!isPromptError || !isEditing) return;
    // 逻辑：错误状态强制退出编辑，避免继续修改。
    setIsEditing(false);
    setShouldFocus(false);
  }, [isEditing, isPromptError]);

  useEffect(() => {
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
  }, [isEditing, shouldFocus]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    // 逻辑：同步生成状态到 ref，避免异步回调读取旧值。
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

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

  /** Schedule fit-to-content sizing for streaming updates. */
  const scheduleFitToContent = useCallback(() => {
    if (fitRafRef.current !== null) return;
    fitRafRef.current = window.requestAnimationFrame(() => {
      fitRafRef.current = null;
      if (!isGeneratingRef.current || isEditingRef.current) return;
      // 逻辑：生成中按最新文本重新计算尺寸，避免频繁同步抖动。
      fitToContentIfNeeded();
    });
  }, [fitToContentIfNeeded]);

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

  /** Recalculate whether the content overflows the collapsed height. */
  const updateOverflowState = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    if (isEditing) {
      setIsOverflowing(false);
      return;
    }
    const availableHeight = element.xywh[3] - TEXT_NODE_VERTICAL_PADDING;
    const isOverflow =
      content.scrollHeight > availableHeight + TEXT_NODE_RESIZE_EPSILON;
    setIsOverflowing(isOverflow);
  }, [element.xywh, isEditing]);

  useEffect(() => {
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
    onUpdate,
  ]);

  useEffect(() => {
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
  }, [element.props.collapsedHeight, element.xywh, isEditing, onUpdate]);

  useEffect(() => {
    updateOverflowState();
  }, [draftText, element.xywh, isEditing, updateOverflowState]);

  useEffect(() => {
    if (!isGenerating || isEditing) return;
    // 逻辑：流式生成中跟随文本变化自动调整尺寸。
    scheduleFitToContent();
  }, [draftText, isEditing, isGenerating, scheduleFitToContent]);

  useEffect(() => {
    if (!isEditing && resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
  }, [isEditing]);

  useEffect(() => {
    if (isGenerating && fitRafRef.current !== null) return;
    if (!isGenerating && fitRafRef.current !== null) {
      window.cancelAnimationFrame(fitRafRef.current);
      fitRafRef.current = null;
    }
  }, [isGenerating]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => updateOverflowState());
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateOverflowState]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
      if (fitRafRef.current !== null) {
        window.cancelAnimationFrame(fitRafRef.current);
      }
    };
  }, []);

  /** Enter edit mode on node double click. */
  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (isLocked) return;
      if (isGenerating || isPromptError) return;
      // 逻辑：双击进入编辑时保持节点选中状态。
      onSelect();
      setIsEditing(true);
      setShouldFocus(true);
    },
    [isGenerating, isLocked, isPromptError, onSelect]
  );

  /** Exit edit mode when text input loses focus. */
  const handleEditorBlur = useCallback(() => {
    // 逻辑：焦点移出文本输入后结束编辑。
    isEditingRef.current = false;
    setIsEditing(false);
  }, []);

  /** Stop pointer events from bubbling to the canvas while editing. */
  const handleEditorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLTextAreaElement>) => {
      // 逻辑：编辑状态下阻止画布工具接管指针事件。
      event.stopPropagation();
    },
    []
  );

  /** Sync text changes into node props. */
  const handleTextChange = useCallback(
    (event: ReactChangeEvent<HTMLTextAreaElement>) => {
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
    [expandToContent, isEditing, onUpdate]
  );

  /** Retry prompt generation for the text node. */
  const handleRetryClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (isLocked || isGenerating) return;
      // 逻辑：点击重试时保持节点选中。
      onSelect();
      actions.retryPromptGeneration(element.id);
    },
    [actions, element.id, isGenerating, isLocked, onSelect]
  );

  const containerClasses = [
    "relative h-full w-full rounded-sm border box-border p-2.5",
    "border-slate-300 bg-white",
    "dark:border-slate-700 dark:bg-slate-900",
    "text-slate-900 dark:text-slate-100",
    isEditing ? "cursor-text overflow-visible" : "cursor-default overflow-hidden",
    selected
      ? "dark:border-sky-400 dark:shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
      : "",
    isPromptError
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
    isGenerating && !isPromptError
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
  ].join(" ");

  if (isPromptError) {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
          <div className="text-sm font-semibold text-rose-500 dark:text-rose-400">
            生成失败
          </div>
          <button
            type="button"
            className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-100/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/50 dark:text-rose-300 dark:hover:bg-rose-900/40"
            onPointerDown={(event) => {
              // 逻辑：按钮点击时阻止画布接管拖拽。
              event.stopPropagation();
            }}
            onClick={handleRetryClick}
            disabled={isLocked || isGenerating}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        data-board-editor="true"
        onDoubleClick={handleDoubleClick}
      >
        <textarea
          ref={setTextareaRef}
          className={TEXT_EDIT_CLASSNAME}
          value={draftText}
          onChange={handleTextChange}
          onBlur={handleEditorBlur}
          onPointerDown={handleEditorPointerDown}
          data-allow-context-menu
        />
        {isEmpty ? (
          <div className="pointer-events-none absolute left-4 top-4 text-[13px] text-slate-400/70">
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
      onDoubleClick={handleDoubleClick}
    >
      <div ref={setContentDivRef} className={TEXT_VIEW_CLASSNAME}>
        {draftText}
      </div>
      {isEmpty ? (
        <div className="pointer-events-none absolute left-4 top-4 text-[13px] text-slate-400/70">
          {TEXT_NODE_PLACEHOLDER}
        </div>
      ) : null}
      {!isEditing && isOverflowing ? (
        <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-full rounded-b-sm bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
      ) : null}
    </div>
  );
}

/** Definition for the text node. */
export const TextNodeDefinition: CanvasNodeDefinition<TextNodeProps> = {
  type: "text",
  schema: z.object({
    value: z.union([z.string(), z.array(z.any())]),
    autoFocus: z.boolean().optional(),
    collapsedHeight: z.number().optional(),
  }),
  defaultProps: {
    value: DEFAULT_TEXT_VALUE,
    autoFocus: false,
    collapsedHeight: undefined,
  },
  view: TextNodeView,
  capabilities: {
    resizable: true,
    rotatable: false,
    connectable: "anchors",
    minSize: TEXT_NODE_MIN_SIZE,
    maxSize: TEXT_NODE_MAX_SIZE,
  },
};
