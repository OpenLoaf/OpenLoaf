"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  MousePointer2,
  Hand,
  Highlighter,
  Square,
  ArrowRight,
  Route,
  Image as ImageIcon,
  Video,
  StickyNote,
  Type as TypeIcon,
  Shapes,
} from "lucide-react";
import { cn } from "@udecode/cn";
import { HoverPanel, IconBtn, PanelItem } from "./ToolbarParts";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ToolKind =
  | "select"
  | "hand"
  | "marked"
  | "frame"
  | "group"
  | "arrow-straight"
  | "arrow-curve"
  | "text"
  | "resource";

export interface CanvasToolbarProps {
  onToolChange?: (tool: ToolKind) => void;
  onInsertNote?: () => void;
  onInsertText?: () => void;
  onInsertImageFiles?: (files: File[]) => void;
  onInsertVideoUrl?: (url: string) => void;
}

/** 画布底部工具栏（仅 UI） */
const CanvasToolbar = memo(function CanvasToolbar({
  onToolChange,
  onInsertNote,
  onInsertText,
  onInsertImageFiles,
  onInsertVideoUrl,
}: CanvasToolbarProps) {
  // 面板关闭的延迟时间（毫秒）
  const CLOSE_DELAY_MS = 600;
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // 每个分组当前选中项（底部显示该图标）
  const [modeSel, setModeSel] = useState<"pointer" | "hand" | "marked">("pointer");
  const [frameSel, setFrameSel] = useState<"frame" | "group">("frame");
  const [arrowSel, setArrowSel] = useState<"arrow-straight" | "arrow-curve">("arrow-straight");
  // 当前激活的分组（全局唯一选中态）
  const [activeGroup, setActiveGroup] = useState<"mode" | "frame" | "arrows">("mode");
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoInput, setVideoInput] = useState("");

  // 事件：切换工具
  const setTool = useCallback(
    (tool: ToolKind) => {
      onToolChange?.(tool);
    },
    [onToolChange]
  );

  /** Extract the src URL from an iframe snippet or a raw URL input. */
  const extractEmbedUrl = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.includes("<iframe")) {
      const doc = new DOMParser().parseFromString(trimmed, "text/html");
      const iframe = doc.querySelector("iframe");
      const src = iframe?.getAttribute("src")?.trim() ?? "";
      if (src) return src;
      const match = trimmed.match(/src\\s*=\\s*["']([^"']+)["']/i);
      if (!match?.[1]) return "";
      const decoded = new DOMParser().parseFromString(match[1], "text/html");
      return decoded.documentElement.textContent?.trim() ?? match[1];
    }
    return trimmed;
  }, []);

  /** Trigger the native image picker. */
  const handlePickImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  /** Handle inserting selected image files. */
  const handleImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      onInsertImageFiles?.(files);
      // 逻辑：清空输入，保证再次选择同一文件可触发 change
      event.target.value = "";
    },
    [onInsertImageFiles],
  );

  /** Open the video input dialog. */
  const handleOpenVideoDialog = useCallback(() => {
    setVideoInput("");
    setVideoDialogOpen(true);
  }, []);

  /** Confirm and insert a video URL. */
  const handleConfirmVideo = useCallback(() => {
    const url = extractEmbedUrl(videoInput);
    if (!url) return;
    onInsertVideoUrl?.(url);
    setVideoDialogOpen(false);
  }, [extractEmbedUrl, onInsertVideoUrl, videoInput]);

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
      data-canvas-toolbar
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

        <span className="mx-1 text-muted-foreground">|</span>

        {/* 右侧组件区：点击即触发插入 */}
        <div className="flex items-center gap-1.5">
          <IconBtn title="图片" onClick={handlePickImage}>
            <ImageIcon size={iconSize} />
          </IconBtn>
          <IconBtn title="视频" onClick={handleOpenVideoDialog}>
            <Video size={iconSize} />
          </IconBtn>
          <IconBtn title="便签" onClick={onInsertNote}>
            <StickyNote size={iconSize} />
          </IconBtn>
          <IconBtn title="文字" onClick={onInsertText}>
            <TypeIcon size={iconSize} />
          </IconBtn>
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
      <Dialog
        open={videoDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setVideoDialogOpen(false);
            return;
          }
          setVideoDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>插入视频</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              支持输入链接，或粘贴 iframe 代码自动提取 src。
            </div>
            <input
              type="text"
              value={videoInput}
              placeholder="粘贴链接或 iframe 代码"
              className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
              onChange={(event) => setVideoInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleConfirmVideo();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setVideoDialogOpen(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
              onClick={() => setVideoDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-sm hover:bg-accent"
              onClick={handleConfirmVideo}
            >
              确定
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default CanvasToolbar;
