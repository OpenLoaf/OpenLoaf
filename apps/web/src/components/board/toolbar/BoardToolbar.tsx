"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../engine/CanvasEngine";
import type { CanvasInsertRequest, CanvasSnapshot } from "../engine/types";
import { HoverPanel, IconBtn, PanelItem } from "../ui/ToolbarParts";

export interface BoardToolbarProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for tool state. */
  snapshot: CanvasSnapshot;
}

type ToolMode = "select" | "hand" | "pen" | "highlighter" | "eraser";

type IconProps = {
  size?: number;
  className?: string;
};

const PEN_SIZES = [3, 6, 10, 14];
const PEN_COLORS = ["#111827", "#1d4ed8", "#f59e0b", "#ef4444", "#16a34a"];

type InsertItem = {
  id: string;
  title: string;
  description: string;
  icon: (props: IconProps) => ReactElement;
  /** Node type inserted by this item. */
  nodeType?: string;
  /** Optional custom props for the inserted node. */
  props?: Record<string, unknown>;
  size: [number, number];
  opensPicker?: boolean;
};

/** Label mapping for toolbar tooltips. */
const TOOL_LABELS = {
  select: "选择",
  hand: "拖拽",
  pen: "画笔",
  highlighter: "荧光笔",
  eraser: "橡皮",
  note: "便签",
  image: "图片",
  calendar: "日历",
} as const;

/** Shortcut mapping for tooltips. */
const TOOL_SHORTCUTS = {
  select: "A",
  hand: "W",
  pen: "P",
  highlighter: "K",
  eraser: "E",
} as const;

/** Label mapping for insert tool tooltips. */
const INSERT_TOOL_LABELS: Record<string, string> = {
  note: TOOL_LABELS.note,
  image: TOOL_LABELS.image,
  calendar: TOOL_LABELS.calendar,
};

/** Build a tooltip label with optional shortcut suffix. */
function buildToolTitle(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

const BRUSH_SVG_SRC = "/board/brush.svg";
const CALENDAR_SVG_SRC = "/board/calendar-svgrepo-com.svg";
const HIGHLIGHTER_SVG_SRC = "/board/highlighter.svg";
const ERASER_SVG_SRC = "/board/eraser.svg";
const SELECT_SVG_SRC = "/board/select-cursor-svgrepo-com.svg";
const DRAG_SVG_SRC = "/board/drag-svgrepo-com.svg";
const NOTE_SVG_SRC = "/board/notes-note-svgrepo-com.svg";
const PICTURE_SVG_SRC = "/board/picture-photo-svgrepo-com.svg";
/** Offset applied when inserting multiple images from picker. */
const IMAGE_PICK_STACK_OFFSET = 24;

const prefixSvgIds = (svg: string, prefix: string) => {
  const safePrefix = prefix.replace(/:/g, "");
  return svg
    .replace(/id="([^"]+)"/g, `id="${safePrefix}-$1"`)
    .replace(/url\\(#([^)]+)\\)/g, `url(#${safePrefix}-$1)`)
    .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${safePrefix}-$1"`)
    .replace(/href="#([^"]+)"/g, `href="#${safePrefix}-$1"`);
};

const normalizeSvgRootSize = (svg: string) => {
  const withWidth = svg.replace(/<svg([^>]*?)width="[^"]*"/, '<svg$1width="100%"');
  return withWidth.replace(/<svg([^>]*?)height="[^"]*"/, '<svg$1height="100%"');
};

/** Cache for loaded public svg markup. */
const svgCache = new Map<string, string>();

function InlineSvg(props: {
  svg: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { svg, className, style } = props;
  const id = useId();
  const html = useMemo(() => {
    const withIds = prefixSvgIds(svg, id);
    return normalizeSvgRootSize(withIds);
  }, [id, svg]);
  return (
    <span
      className={cn("inline-flex", className)}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Load svg markup from public assets with a small client cache. */
function usePublicSvg(src: string) {
  const [svg, setSvg] = useState<string | null>(() => svgCache.get(src) ?? null);

  useEffect(() => {
    if (svgCache.has(src)) {
      setSvg(svgCache.get(src) ?? null);
      return;
    }
    let active = true;
    // 逻辑：首次加载时从 public 拉取 svg 文本并缓存，避免重复请求。
    fetch(src)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!active || !text) return;
        svgCache.set(src, text);
        setSvg(text);
      })
      .catch(() => {
        // 逻辑：加载失败时保持静默，避免影响工具栏交互。
      });
    return () => {
      active = false;
    };
  }, [src]);

  return svg;
}

/** Render inline svg loaded from public path. */
function InlineSvgFile({
  src,
  className,
  style,
}: {
  src: string;
  className?: string;
  style?: CSSProperties;
}) {
  const svg = usePublicSvg(src);
  if (!svg) {
    return (
      <span
        className={cn("inline-flex", className)}
        style={style}
        aria-hidden="true"
      />
    );
  }
  return <InlineSvg svg={svg} className={className} style={style} />;
}

function SelectIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={SELECT_SVG_SRC}
      className={cn("[&>svg]:fill-current", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function HandIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={DRAG_SVG_SRC}
      className={cn("[&>svg]:fill-current", className)}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

/** Render the calendar icon with shared sizing props. */
function CalendarIcon(props: IconProps) {
  const { size = 20, className } = props;
  return (
    <InlineSvgFile
      src={CALENDAR_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function ImageIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={PICTURE_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function PageIcon({ size = 20, className }: IconProps) {
  return (
    <InlineSvgFile
      src={NOTE_SVG_SRC}
      className={className}
      style={{ width: size, height: size, userSelect: "none", flexShrink: 0 }}
    />
  );
}

function BrushToolIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <InlineSvgFile src={BRUSH_SVG_SRC} className={className} style={style} />;
}

function HighlighterToolIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <InlineSvgFile src={HIGHLIGHTER_SVG_SRC} className={className} style={style} />;
}

function EraserToolIcon({ className }: { className?: string }) {
  return <InlineSvgFile src={ERASER_SVG_SRC} className={className} />;
}

const INSERT_ITEMS: InsertItem[] = [
  {
    id: "note",
    title: "Note",
    description: "Quick note card.",
    icon: PageIcon,
    nodeType: "text",
    props: { autoFocus: true },
    size: [200, 100],
  },
  {
    id: "image",
    title: "Image",
    description: "Image block.",
    icon: ImageIcon,
    size: [320, 220],
    opensPicker: true,
  },
  {
    id: "calendar",
    title: "Calendar",
    description: "Calendar panel block.",
    icon: CalendarIcon,
    nodeType: "calendar",
    props: {},
    size: [360, 320],
  },
];

/** Render the bottom toolbar for the board canvas. */
const BoardToolbar = memo(function BoardToolbar({ engine, snapshot }: BoardToolbarProps) {
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const isSelectTool = snapshot.activeToolId === "select";
  const isHandTool = snapshot.activeToolId === "hand";
  const isPenTool = snapshot.activeToolId === "pen" || snapshot.activeToolId === "highlighter";
  const isEraserTool = snapshot.activeToolId === "eraser";
  const isLocked = snapshot.locked;
  const pendingInsert = snapshot.pendingInsert;
  const penPanelOpen = !isLocked && (hoverGroup === "pen" || isPenTool);

  const [penVariant, setPenVariant] = useState<"pen" | "highlighter">("pen");
  const [penSize, setPenSize] = useState<number>(6);
  const [penColor, setPenColor] = useState<string>("#f59e0b");
  const selectTitle = buildToolTitle(TOOL_LABELS.select, TOOL_SHORTCUTS.select);
  const handTitle = buildToolTitle(TOOL_LABELS.hand, TOOL_SHORTCUTS.hand);
  const penTitle = buildToolTitle(TOOL_LABELS.pen, TOOL_SHORTCUTS.pen);
  const highlighterTitle = buildToolTitle(
    TOOL_LABELS.highlighter,
    TOOL_SHORTCUTS.highlighter
  );
  const eraserTitle = buildToolTitle(TOOL_LABELS.eraser, TOOL_SHORTCUTS.eraser);
  const toolbarDragRef = useRef<{
    request: CanvasInsertRequest;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [toolbarDragging, setToolbarDragging] = useState(false);

  useEffect(() => {
    // 逻辑：同步画笔配置到画布引擎，保持绘制体验一致。
    engine.setPenSettings({ size: penSize, color: penColor, opacity: 1 });
    engine.setHighlighterSettings({ size: penSize, color: penColor, opacity: 0.35 });
  }, [engine, penColor, penSize]);

  useEffect(() => {
    if (snapshot.activeToolId === "pen") {
      setPenVariant("pen");
    } else if (snapshot.activeToolId === "highlighter") {
      setPenVariant("highlighter");
    }
  }, [snapshot.activeToolId]);

  useEffect(() => {
    if (!isLocked) return;
    // 逻辑：锁定画布时关闭悬浮面板，避免残留交互入口。
    setHoverGroup(null);
  }, [isLocked]);

  useEffect(() => {
    if (!hoverGroup) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const container = toolbarRef.current;
      if (!container || !target) return;
      // 逻辑：点击工具条外部时关闭子面板。
      if (container.contains(target)) return;
      if (hoverGroup === "pen" && isPenTool) return;
      setHoverGroup(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [hoverGroup, isPenTool]);

  const handleToolChange = useCallback(
    (tool: ToolMode, options?: { keepPanel?: boolean }) => {
      if (isLocked && (tool === "pen" || tool === "highlighter" || tool === "eraser")) {
        return;
      }
      engine.setActiveTool(tool);
      if (tool === "pen" || tool === "highlighter") {
        setPenVariant(tool);
      }
      if (!options?.keepPanel) {
        setHoverGroup(null);
      }
    },
    [engine, isLocked]
  );

  /** Update pending insert requests for one-shot placement. */
  const handleInsertRequest = useCallback(
    (request: CanvasInsertRequest) => {
      if (isLocked) return;
      engine.getContainer()?.focus();
      if (pendingInsert?.id === request.id) {
        engine.setPendingInsert(null);
        return;
      }
      engine.setPendingInsert(request);
      setHoverGroup(null);
    },
    [engine, isLocked, pendingInsert?.id]
  );


  const getWorldPointFromEvent = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLButtonElement>) => {
      const container = engine.getContainer();
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      return engine.screenToWorld([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
    },
    [engine]
  );

  const placeInsertAtPoint = useCallback(
    (request: CanvasInsertRequest, point: [number, number]) => {
      const [width, height] = request.size ?? [320, 180];
      engine.addNodeElement(request.type, request.props, [
        point[0] - width / 2,
        point[1] - height / 2,
        width,
        height,
      ]);
      engine.setPendingInsert(null);
    },
    [engine]
  );

  useEffect(() => {
    if (!toolbarDragging) return;
    const handlePointerMove = (event: PointerEvent) => {
      const drag = toolbarDragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const worldPoint = getWorldPointFromEvent(event);
      if (worldPoint) {
        engine.setPendingInsertPoint(worldPoint);
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      const drag = toolbarDragRef.current;
      toolbarDragRef.current = null;
      setToolbarDragging(false);
      engine.setToolbarDragging(false);
      if (!drag || !drag.moved) {
        if (drag && drag.request.id === "note" && !engine.isLocked()) {
          engine.setPendingInsert(drag.request);
        }
        return;
      }
      const worldPoint = getWorldPointFromEvent(event);
      if (!worldPoint || engine.isLocked()) {
        engine.setPendingInsert(null);
        return;
      }
      const hit = engine.pickElementAt(worldPoint);
      if (hit?.kind === "node") {
        engine.setPendingInsert(null);
        return;
      }
      placeInsertAtPoint(drag.request, worldPoint);
    };
    document.addEventListener("pointermove", handlePointerMove, { capture: true });
    document.addEventListener("pointerup", handlePointerUp, { capture: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, { capture: true });
      document.removeEventListener("pointerup", handlePointerUp, { capture: true });
    };
  }, [engine, getWorldPointFromEvent, placeInsertAtPoint, toolbarDragging]);

  /** Trigger the native image picker. */
  const handlePickImage = useCallback(() => {
    if (isLocked) return;
    imageInputRef.current?.click();
  }, [isLocked]);

  /** Handle inserting selected image files. */
  const handleImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      try {
        const files = Array.from(event.target.files ?? []);
        const imageFiles = files.filter((file) => file.type.startsWith("image/"));
        if (imageFiles.length === 0) return;
        if (imageFiles.length === 1) {
          const payload = await engine.buildImagePayloadFromFile(imageFiles[0]);
          handleInsertRequest({
            id: "image",
            type: "image",
            props: payload.props,
            size: payload.size,
          });
          return;
        }
        const center = engine.getViewportCenterWorld();
        for (const [index, file] of imageFiles.entries()) {
          const payload = await engine.buildImagePayloadFromFile(file);
          const [width, height] = payload.size;
          const offset = IMAGE_PICK_STACK_OFFSET * index;
          // 逻辑：批量插入图片时错位堆叠，避免完全重叠。
          engine.addNodeElement("image", payload.props, [
            center[0] - width / 2 + offset,
            center[1] - height / 2 + offset,
            width,
            height,
          ]);
        }
      } finally {
        // 逻辑：清空输入，保证再次选择同一文件可触发 change
        event.target.value = "";
      }
    },
    [engine, handleInsertRequest]
  );

  // 统一按钮尺寸（“宽松”密度）
  const iconSize = 20;
  /** 底部工具栏图标尺寸。 */
  const toolbarIconSize = 22;
  /** 底部工具栏图标 hover 放大样式。 */
  const toolbarIconClassName =
    "origin-center transition-transform duration-150 ease-out group-hover:scale-[1.2]";

  return (
    <div
      ref={toolbarRef}
      data-canvas-toolbar
      onPointerDown={event => {
        // 逻辑：阻止工具条交互触发画布选择。
        event.stopPropagation();
      }}
      className={cn(
        "pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2",
        "h-12 rounded-[14px] bg-background/80 px-2 ring-1 ring-border/80 backdrop-blur-md"
      )}
    >
      <div className="relative flex h-full items-center gap-2">
        {/* 左侧：持久工具 */}
        <div className="flex items-center gap-2">
          <IconBtn
            title={selectTitle}
            active={isSelectTool}
            onPointerDown={() => handleToolChange("select")}
            className="group h-8 w-8"
          >
            <SelectIcon
              size={toolbarIconSize}
              className={cn(toolbarIconClassName, isSelectTool && "dark:text-foreground")}
            />
          </IconBtn>
          <IconBtn
            title={handTitle}
            active={isHandTool}
            onPointerDown={() => handleToolChange("hand")}
            className="group h-8 w-8"
          >
            <HandIcon
              size={toolbarIconSize}
              className={cn(toolbarIconClassName, isHandTool && "dark:text-foreground")}
            />
          </IconBtn>
          <span className="h-8 w-px bg-border/80" />
          <div className="relative">
            <IconBtn
              title={penVariant === "highlighter" ? highlighterTitle : penTitle}
              active={isPenTool || hoverGroup === "pen"}
              onPointerDown={() => {
                if (isLocked) return;
                setHoverGroup("pen");
                handleToolChange(penVariant, { keepPanel: true });
              }}
              className="group h-10 w-9 overflow-hidden"
              disabled={isLocked}
            >
              <span className="relative">
                {penVariant === "highlighter" ? (
                  <HighlighterToolIcon
                    className={cn(
                      "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                      isPenTool ? "translate-y-0" : "translate-y-2"
                    )}
                    style={{ color: penColor }}
                  />
                ) : (
                  <BrushToolIcon
                    className={cn(
                      "h-10 w-5 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                      isPenTool ? "translate-y-0" : "translate-y-2"
                    )}
                    style={{ color: penColor }}
                  />
                )}
              </span>
            </IconBtn>
            <HoverPanel open={penPanelOpen} className="w-max">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <PanelItem
                    title={penTitle}
                    active={snapshot.activeToolId === "pen"}
                    onPointerDown={() => handleToolChange("pen")}
                    size="sm"
                    showLabel={false}
                  >
                    <BrushToolIcon className="h-8 w-4" style={{ color: penColor }} />
                  </PanelItem>
                  <PanelItem
                    title={highlighterTitle}
                    active={snapshot.activeToolId === "highlighter"}
                    onPointerDown={() => handleToolChange("highlighter")}
                    size="sm"
                    showLabel={false}
                  >
                    <HighlighterToolIcon className="h-8 w-4" style={{ color: penColor }} />
                  </PanelItem>
                </div>
                <span className="h-6 w-px bg-border/70" />
                <div className="flex items-center gap-2">
                  {PEN_SIZES.map(size => (
                    <button
                      key={`pen-size-${size}`}
                      type="button"
                      onPointerDown={event => {
                        event.stopPropagation();
                        if (isLocked) return;
                        setPenSize(size);
                      }}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full",
                          penSize === size
                            ? "bg-foreground/12 text-foreground dark:bg-foreground/18 dark:text-background"
                            : "hover:bg-accent/60"
                        )}
                      aria-label={`Pen size ${size}`}
                    >
                      <span className="rounded-full bg-current" style={{ width: size, height: size }} />
                    </button>
                  ))}
                </div>
                <span className="h-6 w-px bg-border/70" />
                <div className="flex items-center gap-1.5">
                  {PEN_COLORS.map(color => (
                    <button
                      key={`pen-color-${color}`}
                      type="button"
                      onPointerDown={event => {
                        event.stopPropagation();
                        if (isLocked) return;
                        setPenColor(color);
                      }}
                      className={cn(
                        "h-6 w-6 rounded-full ring-1 ring-border",
                        penColor === color &&
                          "ring-2 ring-foreground ring-offset-2 ring-offset-background shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={`Pen color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </HoverPanel>
          </div>
          <IconBtn
            title={eraserTitle}
            active={isEraserTool}
            onPointerDown={() => {
              if (isLocked) return;
              handleToolChange("eraser");
            }}
            className="group h-10 w-9 overflow-hidden"
            disabled={isLocked}
          >
            <EraserToolIcon
              className={cn(
                "h-10 w-8 transition-transform duration-300 ease-in-out group-hover:translate-y-0",
                isEraserTool ? "translate-y-0" : "translate-y-2"
              )}
            />
          </IconBtn>
        </div>

        <span className="h-8 w-px bg-border/80" />

        {/* 右侧：一次性插入 */}
        <div className="flex items-center gap-2">
          {INSERT_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pendingInsert?.id === item.id;
            const request: CanvasInsertRequest = {
              id: item.id,
              type: item.nodeType ?? "text",
              props: item.props ?? {},
              size: item.size,
            };
            return (
              <IconBtn
                key={item.id}
                title={INSERT_TOOL_LABELS[item.id] ?? item.title}
                active={isActive}
                onPointerDown={event => {
                  if (isLocked) return;
                  if (item.id === "note") {
                    engine.getContainer()?.focus();
                    if (pendingInsert?.id === item.id) {
                      engine.setPendingInsert(null);
                      engine.setToolbarDragging(false);
                      return;
                    }
                    engine.setSelectionBox(null);
                    engine.setAlignmentGuides([]);
                    engine.setPendingInsert(request);
                    const worldPoint = getWorldPointFromEvent(event);
                    if (worldPoint) {
                      engine.setPendingInsertPoint(worldPoint);
                    }
                    toolbarDragRef.current = {
                      request,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    setToolbarDragging(true);
                    engine.setToolbarDragging(true);
                    return;
                  }
                  if (item.opensPicker) {
                    handlePickImage();
                    return;
                  }
                  handleInsertRequest(request);
                }}
                disabled={isLocked}
                className="group h-8 w-8"
              >
                <Icon size={toolbarIconSize} className={toolbarIconClassName} />
              </IconBtn>
            );
          })}
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageChange}
        />
      </div>
    </div>
  );
});

export default BoardToolbar;
