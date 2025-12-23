"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Hand,
  Highlighter,
  Square,
  ArrowRight,
  Route,
  Link2,
  Image as ImageIcon,
  Video,
  FileText,
  Pencil,
  Eraser,
  StickyNote,
  Type as TypeIcon,
  Shapes,
} from "lucide-react";
import { cn } from "@udecode/cn";

type ToolKind =
  | "select"
  | "hand"
  | "marked"
  | "frame"
  | "group"
  | "arrow-straight"
  | "arrow-curve"
  | "resource"
  | "pen"
  | "eraser"
  | "note"
  | "text"
  | "flow"
  | "emoji"
  | "sticker";

export interface CanvasToolbarProps {
  activeTool?: ToolKind;
  onToolChange?: (tool: ToolKind) => void;
  onInsert?: (type: "note" | "text") => void;
  // 画笔样式控制（颜色/粗细）
  penColor?: string;
  penSize?: number; // 像素
  onPenColorChange?: (color: string) => void;
  onPenSizeChange?: (size: number) => void;
}

/** 仅图标的按钮组件（玻璃风格工具条中的按钮） */
function IconBtn(props: {
  title: string;
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const { title, active, children, onClick, className } = props;
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg",
        "transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        className
      )}
    >
      {children}
    </button>
  );
}

/** 悬停展开的小面板（用于同类操作），hover 显示、离开隐藏 */
function HoverPanel(props: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { open, children, className, onMouseEnter, onMouseLeave } = props;
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "pointer-events-auto absolute -top-3 left-1/2 z-10 -translate-y-full -translate-x-1/2",
        // 悬浮面板不透明，去除毛玻璃
        "rounded-xl bg-background p-2.5 ring-1 ring-border",
        "transition-all duration-150 ease-out",
        open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95",
        className
      )}
    >
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

/** 悬浮面板中的条目：图标 + 文案说明 */
function PanelItem(props: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const { title, children, onClick, active } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // 面板条目：上下排列（图标在上、文字在下）
        "inline-flex flex-col items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px]",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent"
      )}
    >
      {children}
      <span className="whitespace-nowrap leading-none">{title}</span>
    </button>
  );
}

/** 画布底部工具栏（仅 UI） */
const CanvasToolbar = memo(function CanvasToolbar({
  activeTool,
  onToolChange,
  onInsert,
  penColor,
  penSize,
  onPenColorChange,
  onPenSizeChange,
}: CanvasToolbarProps) {
  // 面板关闭的延迟时间（毫秒）
  const CLOSE_DELAY_MS = 600;
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 每个分组当前选中项（底部显示该图标）
  const [modeSel, setModeSel] = useState<"pointer" | "hand" | "marked">("pointer");
  const [frameSel, setFrameSel] = useState<"frame" | "group">("frame");
  const [arrowSel, setArrowSel] = useState<"arrow-straight" | "arrow-curve">("arrow-straight");
  const [resSel, setResSel] = useState<"page" | "image" | "video" | "text">("page");
  const [penSel, setPenSel] = useState<"pen" | "eraser">("pen");
  const [widgetSel, setWidgetSel] = useState<"note" | "text">("note");
  // 当前激活的分组（全局唯一选中态）
  const [activeGroup, setActiveGroup] = useState<"mode" | "frame" | "arrows" | "resource" | "pen" | "widgets">("mode");

  // 事件：切换工具
  const setTool = useCallback(
    (tool: ToolKind) => {
      onToolChange?.(tool);
    },
    [onToolChange]
  );

  // 事件：插入节点（先只支持便签/文本）
  const insert = useCallback(
    (type: "note" | "text") => onInsert?.(type),
    [onInsert]
  );

  // 分组 hover 处理：仅打开，不在移出时关闭（点击空白才关闭）
  const openGroup = useCallback((id: string) => {
    // 进入新分组时立即取消任何关闭计时
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverGroup(id);
  }, []);

  // 点击空白处关闭（延时 600ms）
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      // 点击空白：延迟关闭
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = window.setTimeout(() => {
        setHoverGroup(null);
      }, CLOSE_DELAY_MS);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [CLOSE_DELAY_MS]);

  // 统一按钮尺寸（“宽松”密度）
  const iconSize = 18;

  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2",
        "rounded-2xl bg-background/70 px-2 py-1.5 ring-1 ring-border backdrop-blur-md"
      )}
    >
      <div className="relative flex items-center gap-1.5">
        {/* 1) 模式：选择 / 手型 / 标记 */}
        <div className="relative" onMouseEnter={() => openGroup("mode")}>
          <IconBtn
            title="选择"
            active={activeGroup === "mode"}
            // 点击底部分组：打开面板并应用当前项
            onClick={() => {
              setActiveGroup("mode");
              openGroup("mode");
              // 应用当前项到工具状态
              if (modeSel === "pointer") setTool("select");
              else if (modeSel === "hand") setTool("hand");
              else setTool("marked");
            }}
          >
            {modeSel === "pointer" ? (
              <MousePointer2 size={iconSize} />
            ) : modeSel === "hand" ? (
              <Hand size={iconSize} />
            ) : (
              <Highlighter size={iconSize} />
            )}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "mode"}
            onMouseEnter={() => openGroup("mode")}
          >
            <PanelItem
              title="指针"
              active={modeSel === "pointer"}
              onClick={() => {
                setModeSel("pointer");
                setTool("select");
                setActiveGroup("mode");
              }}
            >
              <MousePointer2 size={iconSize} />
            </PanelItem>
            <PanelItem
              title="拖拽"
              active={modeSel === "hand"}
              onClick={() => {
                setModeSel("hand");
                setTool("hand");
                setActiveGroup("mode");
              }}
            >
              <Hand size={iconSize} />
            </PanelItem>
            <PanelItem
              title="标记"
              active={modeSel === "marked"}
              onClick={() => {
                setModeSel("marked");
                setTool("marked");
                setActiveGroup("mode");
              }}
            >
              <Highlighter size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        {/* 2) 框/分组（仅 UI） */}
        <div className="relative" onMouseEnter={() => openGroup("frame")}>
          <IconBtn
            title="框/分组"
            active={activeGroup === "frame"}
            onClick={() => {
              setActiveGroup("frame");
              openGroup("frame");
              setTool(frameSel === "frame" ? "frame" : "group");
            }}
          >
            {frameSel === "frame" ? <Square size={iconSize} /> : <Shapes size={iconSize} />}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "frame"}
            onMouseEnter={() => openGroup("frame")}
          >
            <PanelItem
              title="创建框"
              active={frameSel === "frame"}
              onClick={() => {
                setFrameSel("frame");
                setTool("frame");
                setActiveGroup("frame");
              }}
            >
              <Square size={iconSize} />
            </PanelItem>
            <PanelItem
              title="分组"
              active={frameSel === "group"}
              onClick={() => {
                setFrameSel("group");
                setTool("group");
                setActiveGroup("frame");
              }}
            >
              {/* 使用 Square 代替 group 图标，避免额外依赖 */}
              <Square size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        {/* 3) 箭头（仅 UI） */}
        <div className="relative" onMouseEnter={() => openGroup("arrows")}>
          <IconBtn
            title="连接/箭头"
            active={activeGroup === "arrows"}
            onClick={() => {
              setActiveGroup("arrows");
              openGroup("arrows");
              setTool(arrowSel === "arrow-straight" ? "arrow-straight" : "arrow-curve");
            }}
          >
            {arrowSel === "arrow-straight" ? (
              <ArrowRight size={iconSize} />
            ) : (
              <Route size={iconSize} />
            )}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "arrows"}
            onMouseEnter={() => openGroup("arrows")}
          >
            <PanelItem
              title="直线箭头"
              active={arrowSel === "arrow-straight"}
              onClick={() => {
                setArrowSel("arrow-straight");
                setTool("arrow-straight");
                setActiveGroup("arrows");
              }}
            >
              <ArrowRight size={iconSize} />
            </PanelItem>
            <PanelItem
              title="曲线箭头"
              active={arrowSel === "arrow-curve"}
              onClick={() => {
                setArrowSel("arrow-curve");
                setTool("arrow-curve");
                setActiveGroup("arrows");
              }}
            >
              <Route size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        {/* 4) 资源（仅 UI 占位） */}
        <div className="relative" onMouseEnter={() => openGroup("resource")}>
          <IconBtn
            title="资源/关联"
            active={activeGroup === "resource"}
            onClick={() => {
              setActiveGroup("resource");
              openGroup("resource");
              // 资源组：默认进入资源模式
              setTool("resource");
            }}
          >
            {resSel === "page" ? (
              <Link2 size={iconSize} />
            ) : resSel === "image" ? (
              <ImageIcon size={iconSize} />
            ) : resSel === "video" ? (
              <Video size={iconSize} />
            ) : (
              <FileText size={iconSize} />
            )}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "resource"}
            onMouseEnter={() => openGroup("resource")}
          >
            <PanelItem
              title="关联页面"
              active={resSel === "page"}
              onClick={() => {
                setResSel("page");
                setTool("resource");
                setActiveGroup("resource");
              }}
            >
              <Link2 size={iconSize} />
            </PanelItem>
            <PanelItem
              title="图片"
              active={resSel === "image"}
              onClick={() => {
                setResSel("image");
                setActiveGroup("resource");
              }}
            >
              <ImageIcon size={iconSize} />
            </PanelItem>
            <PanelItem
              title="视频"
              active={resSel === "video"}
              onClick={() => {
                setResSel("video");
                setActiveGroup("resource");
              }}
            >
              <Video size={iconSize} />
            </PanelItem>
            <PanelItem
              title="文本"
              active={resSel === "text"}
              onClick={() => {
                setResSel("text");
                setActiveGroup("resource");
              }}
            >
              <FileText size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        {/* 5) 笔（仅切换） */}
        <div className="relative" onMouseEnter={() => openGroup("pen")}>
          <IconBtn
            title="铅笔"
            active={activeGroup === "pen"}
            onClick={() => {
              setActiveGroup("pen");
              openGroup("pen");
              setTool(penSel === "pen" ? "pen" : "eraser");
            }}
          >
            {penSel === "pen" ? <Pencil size={iconSize} /> : <Eraser size={iconSize} />}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "pen"}
            onMouseEnter={() => openGroup("pen")}
          >
            <PanelItem
              title="铅笔"
              active={penSel === "pen"}
              onClick={() => {
                setPenSel("pen");
                setTool("pen");
                setActiveGroup("pen");
              }}
            >
              <Pencil size={iconSize} />
            </PanelItem>
            <PanelItem
              title="橡皮擦"
              active={penSel === "eraser"}
              onClick={() => {
                setPenSel("eraser");
                setTool("eraser");
                setActiveGroup("pen");
              }}
            >
              <Eraser size={iconSize} />
            </PanelItem>
            <div className="mx-1 my-1 h-px w-full bg-border" />
            <div className="flex items-center gap-1.5">
              <PanelItem
                title="黑色"
                active={penColor === "#111827"}
                onClick={() => onPenColorChange?.("#111827")}
              >
                <span
                  aria-hidden
                  className="block rounded-full"
                  style={{ width: 14, height: 14, backgroundColor: "#111827" }}
                />
              </PanelItem>
              <PanelItem
                title="灰色"
                active={penColor === "#6b7280"}
                onClick={() => onPenColorChange?.("#6b7280")}
              >
                <span
                  aria-hidden
                  className="block rounded-full"
                  style={{ width: 14, height: 14, backgroundColor: "#6b7280" }}
                />
              </PanelItem>
              <PanelItem
                title="蓝色"
                active={penColor === "#2563eb"}
                onClick={() => onPenColorChange?.("#2563eb")}
              >
                <span
                  aria-hidden
                  className="block rounded-full"
                  style={{ width: 14, height: 14, backgroundColor: "#2563eb" }}
                />
              </PanelItem>
            </div>
            <div className="flex items-center gap-1.5">
              <PanelItem
                title="细"
                active={penSize === 4}
                onClick={() => onPenSizeChange?.(4)}
              >
                <span
                  aria-hidden
                  className="block rounded-full bg-foreground/80"
                  style={{ width: 14, height: 4 }}
                />
              </PanelItem>
              <PanelItem
                title="中"
                active={penSize === 6}
                onClick={() => onPenSizeChange?.(6)}
              >
                <span
                  aria-hidden
                  className="block rounded-full bg-foreground/80"
                  style={{ width: 14, height: 6 }}
                />
              </PanelItem>
              <PanelItem
                title="粗"
                active={penSize === 8}
                onClick={() => onPenSizeChange?.(8)}
              >
                <span
                  aria-hidden
                  className="block rounded-full bg-foreground/80"
                  style={{ width: 14, height: 8 }}
                />
              </PanelItem>
            </div>
          </HoverPanel>
        </div>

        {/* 6) 小组件（先实现便签/文字） */}
        <div className="relative" onMouseEnter={() => openGroup("widgets")}>
          <IconBtn
            title="小组件"
            active={activeGroup === "widgets"}
            onClick={() => {
              setActiveGroup("widgets");
              openGroup("widgets");
              // 小组件：点击底部按钮时应用当前项（便签/文字）
              if (widgetSel === "note") insert("note");
              else insert("text");
            }}
          >
            {widgetSel === "note" ? <StickyNote size={iconSize} /> : <TypeIcon size={iconSize} />}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "widgets"}
            onMouseEnter={() => openGroup("widgets")}
          >
            <PanelItem
              title="便签"
              active={widgetSel === "note"}
              onClick={() => {
                setWidgetSel("note");
                insert("note");
                setActiveGroup("widgets");
              }}
            >
              <StickyNote size={iconSize} />
            </PanelItem>
            <PanelItem
              title="文字"
              active={widgetSel === "text"}
              onClick={() => {
                setWidgetSel("text");
                insert("text");
                setActiveGroup("widgets");
              }}
            >
              <TypeIcon size={iconSize} />
            </PanelItem>
            {/* 仅保留已实现的组件：便签 / 文字 */}
          </HoverPanel>
        </div>
      </div>
    </div>
  );
});

export default CanvasToolbar;
