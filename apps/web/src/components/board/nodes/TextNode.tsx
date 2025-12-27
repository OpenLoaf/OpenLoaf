import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TElement, Value } from "platejs";
import { KEYS } from "platejs";
import {
  Plate,
  useEditorReadOnly,
  useEditorRef,
  useEditorSelection,
  useEditorSelector,
  usePlateEditor,
  usePlateViewEditor,
  useSelectionFragmentProp,
} from "platejs/react";
import { z } from "zod";
import {
  BoldIcon,
  CheckIcon,
  EraserIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ItalicIcon,
  PaletteIcon,
  PilcrowIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { EditorStatic } from "@/components/ui/editor-static";
import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { ColorDropdownMenuItems } from "@/components/ui/font-color-toolbar-button";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton, ToolbarGroup, ToolbarMenuGroup } from "@/components/ui/toolbar";
import { BaseEditorKit } from "@/components/editor/editor-base-kit";
import { EditorKit } from "@/components/editor/editor-kit";
import { getBlockType, setBlockType } from "@/components/editor/transforms";
import { useBoardEngine } from "../core/BoardProvider";

export type TextNodeProps = {
  /** Plate document value stored on the node. */
  value: Value;
  /** Whether the node should auto-enter edit mode on mount. */
  autoFocus?: boolean;
  /** Collapsed height stored for restoring after edit mode. */
  collapsedHeight?: number;
};

/** Default document content for new text nodes. */
const DEFAULT_TEXT_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];
/** Placeholder copy for empty text nodes. */
const TEXT_NODE_PLACEHOLDER = "支持 Markdown 语法输入内容";
/** Shared text styling for text node content. */
const TEXT_CONTENT_CLASSNAME =
  "text-[14px] leading-6 text-slate-900 dark:text-slate-100";
/** Vertical padding used by the text node container. */
const TEXT_NODE_VERTICAL_PADDING = 32;
/** Ignore tiny resize deltas to avoid jitter. */
const TEXT_NODE_RESIZE_EPSILON = 2;
/** Available heading levels for quick selection. */
const TEXT_NODE_HEADING_LEVELS = [
  { icon: <PilcrowIcon />, label: "Text", value: KEYS.p },
  { icon: <Heading1Icon />, label: "H1", value: "h1" },
  { icon: <Heading2Icon />, label: "H2", value: "h2" },
  { icon: <Heading3Icon />, label: "H3", value: "h3" },
  { icon: <Heading4Icon />, label: "H4", value: "h4" },
  { icon: <Heading5Icon />, label: "H5", value: "h5" },
  { icon: <Heading6Icon />, label: "H6", value: "h6" },
] as const;
/** Text color choices aligned with the pen palette. */
const TEXT_NODE_COLOR_OPTIONS = [
  { name: "ink", value: "#111827", isBrightColor: false },
  { name: "blue", value: "#1d4ed8", isBrightColor: false },
  { name: "amber", value: "#f59e0b", isBrightColor: false },
  { name: "red", value: "#ef4444", isBrightColor: false },
  { name: "green", value: "#16a34a", isBrightColor: false },
];

/** Normalize the stored Plate value to a usable document structure. */
function normalizeTextValue(value?: Value): Value {
  if (Array.isArray(value) && value.length > 0) return value;
  return DEFAULT_TEXT_VALUE;
}

/** Cache the latest non-null selection for toolbar actions. */
function useStableSelection() {
  const selection = useEditorSelection();
  const selectionRef = useRef(selection);

  useEffect(() => {
    if (!selection) return;
    // 逻辑：仅在存在选区时缓存，避免工具操作时丢失焦点。
    selectionRef.current = selection;
  }, [selection]);

  return selectionRef;
}

/** Detect whether the Plate value is effectively empty. */
function isTextValueEmpty(value: Value): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  const isEmptyNode = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return true;
    if ("text" in node) {
      const text = (node as { text?: string }).text ?? "";
      return text.trim().length === 0;
    }
    if ("children" in node) {
      const children = (node as { children?: unknown[] }).children ?? [];
      if (!Array.isArray(children) || children.length === 0) return true;
      return children.every(isEmptyNode);
    }
    return true;
  };
  return value.every(isEmptyNode);
}

/** Render quick heading level selection for text nodes. */
function HeadingLevelToolbarButton() {
  const editor = useEditorRef();
  /** Cached selection for heading operations. */
  const selectionRef = useStableSelection();
  const [open, setOpen] = useState(false);
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: node => getBlockType(node as TElement),
  });
  const selectedItem =
    TEXT_NODE_HEADING_LEVELS.find(item => item.value === (value ?? KEYS.p)) ??
    TEXT_NODE_HEADING_LEVELS[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="min-w-[64px]"
          pressed={open}
          tooltip="Heading level"
          isDropdown
        >
          {selectedItem.label}
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={event => {
          event.preventDefault();
          editor.tf.focus();
        }}
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={type => {
            const selection = editor.selection ?? selectionRef.current;
            if (selection) {
              editor.tf.select(selection);
            }
            editor.tf.focus();
            setBlockType(editor, type);
          }}
          label="Heading level"
        >
          {TEXT_NODE_HEADING_LEVELS.map(item => (
            <DropdownMenuRadioItem
              key={item.value}
              className="min-w-[140px] pl-2 *:first:[span]:hidden"
              value={item.value}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                <DropdownMenuItemIndicator>
                  <CheckIcon />
                </DropdownMenuItemIndicator>
              </span>
              {item.icon}
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Render the text color picker for the text node toolbar. */
function TextColorToolbarButton() {
  const editor = useEditorRef();
  /** Cached selection for color operations. */
  const selectionRef = useStableSelection();
  const [open, setOpen] = useState(false);
  /** Current color mark applied to selection. */
  const color = useEditorSelector(
    editorInstance => editorInstance.api.mark(KEYS.color) as string,
    [KEYS.color]
  );

  /** Apply the selected text color mark. */
  const applyColor = useCallback(
    (nextColor: string) => {
      const selection = editor.selection ?? selectionRef.current;
      if (!selection) return;
      editor.tf.select(selection);
      editor.tf.focus();
      editor.tf.addMarks({ [KEYS.color]: nextColor });
      setOpen(false);
    },
    [editor, selectionRef]
  );

  /** Clear the current text color mark. */
  const clearColor = useCallback(() => {
    const selection = editor.selection ?? selectionRef.current;
    if (!selection) return;
    editor.tf.select(selection);
    editor.tf.focus();
    editor.tf.removeMarks(KEYS.color);
    setOpen(false);
  }, [editor, selectionRef]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Text color">
          <PaletteIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={event => {
          event.preventDefault();
          editor.tf.focus();
        }}
      >
        <ToolbarMenuGroup label="Colors">
          <ColorDropdownMenuItems
            className="grid-cols-5 gap-x-1 px-2"
            colors={TEXT_NODE_COLOR_OPTIONS}
            color={color}
            updateColor={applyColor}
          />
        </ToolbarMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem className="p-2" onClick={clearColor}>
            <EraserIcon />
            <span>Clear</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Render the inline formatting toolbar for text nodes. */
function TextNodeToolbar() {
  const readOnly = useEditorReadOnly();
  if (readOnly) return null;

  return (
    <FloatingToolbar data-node-toolbar className="pointer-events-auto">
      <ToolbarGroup>
        <HeadingLevelToolbarButton />
      </ToolbarGroup>
      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
          <BoldIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
          <ItalicIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)">
          <UnderlineIcon />
        </MarkToolbarButton>
        <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough (⌘+⇧+M)">
          <StrikethroughIcon />
        </MarkToolbarButton>
        <TextColorToolbarButton />
      </ToolbarGroup>
    </FloatingToolbar>
  );
}

/** Render a text node with editable Plate content. */
export function TextNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<TextNodeProps>) {
  /** Engine instance used for lock checks. */
  const engine = useBoardEngine();
  /** Local edit mode state. */
  const [isEditing, setIsEditing] = useState(false);
  /** One-shot focus flag for entering edit mode. */
  const [shouldFocus, setShouldFocus] = useState(false);
  /** Container ref for focus boundary checks. */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Editor content ref for auto-resize measurements. */
  const contentRef = useRef<HTMLDivElement | null>(null);
  /** Guard to consume autoFocus only once per node id. */
  const autoFocusConsumedRef = useRef(false);
  /** Cached value snapshot for change detection. */
  const lastValueRef = useRef("");
  /** Track the collapsed height used for restoring after edit mode. */
  const collapsedHeightRef = useRef<number | null>(null);
  /** Skip one collapsed height sync after leaving edit mode. */
  const skipCollapsedSyncRef = useRef(false);
  /** Track the last edit mode state for height transitions. */
  const wasEditingRef = useRef(false);
  /** Track the latest edit mode flag for async callbacks. */
  const isEditingRef = useRef(false);
  /** Track the last pointer interaction target to guard blur exits. */
  const pointerDownInsideRef = useRef(false);
  /** Pending blur timeout id. */
  const blurTimeoutRef = useRef<number | null>(null);
  /** Pending auto-resize animation frame id. */
  const resizeRafRef = useRef<number | null>(null);

  const value = useMemo(
    () => normalizeTextValue(element.props.value),
    [element.props.value]
  );
  /** Whether the text node has any real content. */
  const isEmpty = useMemo(() => isTextValueEmpty(value), [value]);
  /** Whether the current content overflows the collapsed height. */
  const [isOverflowing, setIsOverflowing] = useState(false);

  const editor = usePlateEditor(
    {
      id: `${element.id}-edit`,
      enabled: isEditing,
      plugins: EditorKit,
      value,
    },
    [element.id, isEditing]
  );

  const viewEditor = usePlateViewEditor(
    {
      id: `${element.id}-view`,
      enabled: true,
      plugins: BaseEditorKit,
      value,
    },
    [element.id]
  );

  useEffect(() => {
    lastValueRef.current = JSON.stringify(value);
  }, [value]);

  useEffect(() => {
    autoFocusConsumedRef.current = false;
  }, [element.id]);

  useEffect(() => {
    if (!element.props.autoFocus || autoFocusConsumedRef.current) return;
    autoFocusConsumedRef.current = true;
    // 逻辑：自动创建的文本节点需要直接进入编辑并清除标记。
    onSelect();
    setIsEditing(true);
    setShouldFocus(true);
    onUpdate({ autoFocus: false });
  }, [element.props.autoFocus, onSelect, onUpdate]);

  useEffect(() => {
    if (!selected && isEditing) {
      // 逻辑：失去选中时退出编辑，避免输入状态悬挂。
      setIsEditing(false);
    }
  }, [isEditing, selected]);

  useEffect(() => {
    if (!shouldFocus) return;
    // 逻辑：编辑器挂载后立即清理聚焦标记，避免重复触发。
    const timeout = window.setTimeout(() => setShouldFocus(false), 0);
    return () => window.clearTimeout(timeout);
  }, [shouldFocus]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

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
      const contentHeight = Math.ceil(content.scrollHeight);
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

  /** Restore the node height back to the collapsed size. */
  const restoreCollapsedHeight = useCallback(() => {
    const collapsedHeight =
      collapsedHeightRef.current ?? element.props.collapsedHeight;
    if (collapsedHeight === undefined) return;
    const [x, y, w, h] = element.xywh;
    if (Math.abs(h - collapsedHeight) <= TEXT_NODE_RESIZE_EPSILON) return;
    // 逻辑：退出编辑时恢复折叠高度，确保视图尺寸一致。
    engine.doc.updateElement(element.id, { xywh: [x, y, w, collapsedHeight] });
  }, [engine, element.id, element.props.collapsedHeight, element.xywh]);

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

  /** Determine whether a target should keep the editor active. */
  const isEditingUiTarget = useCallback((target: Element | null) => {
    if (!target) return false;
    if (containerRef.current?.contains(target)) return true;
    if (target.closest("[data-node-toolbar]")) return true;
    if (target.closest("[data-slot=dropdown-menu-content]")) return true;
    if (target.closest("[data-slot=dropdown-menu-sub-content]")) return true;
    return false;
  }, []);

  useEffect(() => {
    if (isEditing) {
      if (!wasEditingRef.current) {
        const collapsedHeight =
          element.props.collapsedHeight ?? element.xywh[3];
        collapsedHeightRef.current = collapsedHeight;
        wasEditingRef.current = true;
        if (element.props.collapsedHeight !== collapsedHeight) {
          // 逻辑：首次进入编辑时缓存折叠高度，便于退出时恢复。
          onUpdate({ collapsedHeight });
        }
      }
      expandToContent();
      return;
    }

    if (wasEditingRef.current) {
      wasEditingRef.current = false;
      skipCollapsedSyncRef.current = true;
      restoreCollapsedHeight();
      collapsedHeightRef.current = null;
    }
  }, [
    element.id,
    element.props.collapsedHeight,
    element.xywh,
    engine,
    expandToContent,
    isEditing,
    onUpdate,
    restoreCollapsedHeight,
  ]);

  useEffect(() => {
    if (isEditing) return;
    if (skipCollapsedSyncRef.current) {
      // 逻辑：退出编辑后的首次同步跳过，避免折叠高度被展开值覆盖。
      skipCollapsedSyncRef.current = false;
      return;
    }
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
  }, [element.xywh, isEditing, updateOverflowState, value]);

  useEffect(() => {
    if (!isEditing) return;
    const handlePointerDown = (event: PointerEvent) => {
      pointerDownInsideRef.current = isEditingUiTarget(
        event.target as Element | null
      );
    };
    // 逻辑：记录指针按下目标，避免工具栏交互触发编辑退出。
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      pointerDownInsideRef.current = false;
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isEditing, isEditingUiTarget]);

  useEffect(() => {
    if (isEditing) return;
    if (resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
  }, [isEditing]);

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
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  /** Enter edit mode on node double click. */
  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (engine.isLocked() || element.locked) return;
      // 逻辑：双击进入编辑时保持节点选中状态。
      onSelect();
      setIsEditing(true);
      setShouldFocus(true);
    },
    [engine, element.locked, onSelect]
  );

  /** Exit edit mode when focus leaves the node container. */
  const handleEditorBlur = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget as Element | null;
      if (isEditingUiTarget(nextTarget) || pointerDownInsideRef.current) return;
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      blurTimeoutRef.current = window.setTimeout(() => {
        blurTimeoutRef.current = null;
        const activeElement = document.activeElement as Element | null;
        if (isEditingUiTarget(activeElement) || pointerDownInsideRef.current) {
          return;
        }
        // 逻辑：焦点移出节点后结束编辑，避免工具与输入冲突。
        isEditingRef.current = false;
        restoreCollapsedHeight();
        setIsEditing(false);
      }, 0);
    },
    [isEditingUiTarget, restoreCollapsedHeight]
  );

  /** Sync editor value changes into node props. */
  const handleValueChange = useCallback(
    ({ value: nextValue }: { value: Value }) => {
      const nextPayload = JSON.stringify(nextValue);
      if (nextPayload === lastValueRef.current) return;
      lastValueRef.current = nextPayload;
      // 逻辑：每次编辑同步节点数据，保证刷新后内容一致。
      onUpdate({ value: nextValue, autoFocus: false });
      if (isEditing) {
        expandToContent();
      }
    },
    [expandToContent, isEditing, onUpdate]
  );

  const containerClasses = [
    "relative h-full w-full rounded-xl border box-border p-4",
    "border-slate-300 bg-white",
    "dark:border-slate-700 dark:bg-slate-900",
    "text-slate-900 dark:text-slate-100",
    isEditing ? "cursor-text overflow-visible" : "cursor-default overflow-hidden",
    selected
      ? "dark:border-sky-400 dark:shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
      : "",
  ].join(" ");

  if (isEditing) {
    if (!editor) return null;
    return (
      <div
        ref={containerRef}
        className={containerClasses}
        data-board-editor={isEditing ? "true" : undefined}
        onDoubleClick={handleDoubleClick}
      >
        <Plate editor={editor} onValueChange={handleValueChange}>
          <EditorContainer className="h-full w-full" data-allow-context-menu>
            <Editor
              variant="none"
              className={TEXT_CONTENT_CLASSNAME}
              autoFocus={shouldFocus}
              onBlur={handleEditorBlur}
              ref={contentRef}
            />
          </EditorContainer>
          <TextNodeToolbar />
        </Plate>
        {isEmpty ? (
          <div className="pointer-events-none absolute left-4 top-4 text-[13px] text-slate-400/70">
            {TEXT_NODE_PLACEHOLDER}
          </div>
        ) : null}
      </div>
    );
  }

  if (!viewEditor) return null;
  return (
    <div className={containerClasses} onDoubleClick={handleDoubleClick}>
      <div ref={contentRef}>
        <EditorStatic
          editor={viewEditor}
          value={value}
          className={TEXT_CONTENT_CLASSNAME}
        />
      </div>
      {isEmpty ? (
        <div className="pointer-events-none absolute left-4 top-4 text-[13px] text-slate-400/70">
          {TEXT_NODE_PLACEHOLDER}
        </div>
      ) : null}
      {!isEditing && isOverflowing ? (
        <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-full rounded-b-xl bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
      ) : null}
    </div>
  );
}

/** Definition for the text node. */
export const TextNodeDefinition: CanvasNodeDefinition<TextNodeProps> = {
  type: "text",
  schema: z.object({
    value: z.array(z.any()),
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
    minSize: { w: 200, h: 100 },
    maxSize: { w: 720, h: 420 },
  },
};
