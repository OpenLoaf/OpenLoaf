"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ArrowRight,
  ChartSpline,
  CornerRightDown,
  Hand,
  Image as ImageIcon,
  Link2,
  MousePointer2,
  PencilLine,
  Sparkles,
  StickyNote,
  Type as TypeIcon,
} from "lucide-react";
import { cn } from "@udecode/cn";

import type { CanvasEngine } from "../CanvasEngine";
import type { CanvasConnectorStyle, CanvasSnapshot } from "../CanvasTypes";
import { HoverPanel, IconBtn, PanelItem } from "../../project/convas/toolbar/ToolbarParts";

export interface BoardToolbarProps {
  /** Canvas engine instance. */
  engine: CanvasEngine;
  /** Snapshot used for tool state. */
  snapshot: CanvasSnapshot;
}

type ToolMode = "select" | "hand";

/** Render the bottom toolbar for the board canvas. */
const BoardToolbar = memo(function BoardToolbar({ engine, snapshot }: BoardToolbarProps) {
  // 悬停展开的组 id（用字符串常量标识）
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const isSelectTool = snapshot.activeToolId === "select";
  const isHandTool = snapshot.activeToolId === "hand";
  const connectorStyle = snapshot.connectorStyle;

  useEffect(() => {
    if (!hoverGroup) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const container = toolbarRef.current;
      if (!container || !target) return;
      // 逻辑：点击工具条外部时关闭子面板。
      if (container.contains(target)) return;
      setHoverGroup(null);
    };
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [hoverGroup]);

  const handleToolChange = useCallback(
    (tool: ToolMode) => {
      engine.setActiveTool(tool);
    },
    [engine]
  );

  const handleConnectorStyleChange = useCallback(
    (style: CanvasConnectorStyle) => {
      engine.setConnectorStyle(style);
    },
    [engine]
  );

  /** Add a placeholder node at the viewport center. */
  const addPlaceholder = useCallback(
    (title: string, description: string) => {
      if (snapshot.locked) return;
      engine.addNodeElement("placeholder", { title, description });
    },
    [engine, snapshot.locked]
  );

  /** Trigger the native image picker. */
  const handlePickImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  /** Handle inserting selected image files. */
  const handleImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      files.forEach((file, index) => {
        addPlaceholder(
          file.name || "Image",
          `Image placeholder ${index + 1}`
        );
      });
      // 逻辑：清空输入，保证再次选择同一文件可触发 change
      event.target.value = "";
    },
    [addPlaceholder]
  );

  // 统一按钮尺寸（“宽松”密度）
  const iconSize = 18;

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
        "rounded-2xl bg-background/70 px-2 py-1.5 ring-1 ring-border backdrop-blur-md"
      )}
    >
      <div className="relative flex items-center gap-1.5">
        {/* 模式：选择 / 手型 */}
        <div className="relative">
          <IconBtn
            title="选择/拖拽"
            active={hoverGroup === "mode" || isSelectTool || isHandTool}
            onPointerDown={() => {
              setHoverGroup(current => (current === "mode" ? null : "mode"));
            }}
          >
            {isHandTool ? (
              <Hand size={iconSize} />
            ) : (
              <MousePointer2 size={iconSize} />
            )}
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "mode"}
          >
            <PanelItem
              title="指针"
              active={isSelectTool}
              onPointerDown={() => {
                handleToolChange("select");
              }}
            >
              <MousePointer2 size={iconSize} />
            </PanelItem>
            <PanelItem
              title="拖拽"
              active={isHandTool}
              onPointerDown={() => {
                handleToolChange("hand");
              }}
            >
              <Hand size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        <span className="mx-1 text-muted-foreground">|</span>

        {/* 连线工具与样式 */}
        <div className="relative">
          <IconBtn
            title="连线"
            active={hoverGroup === "connector"}
            onPointerDown={() => {
              setHoverGroup(current =>
                current === "connector" ? null : "connector"
              );
            }}
          >
            <Link2 size={iconSize} />
          </IconBtn>
          <HoverPanel
            open={hoverGroup === "connector"}
          >
            <PanelItem
              title="直线"
              active={connectorStyle === "straight"}
              onPointerDown={() => {
                handleConnectorStyleChange("straight");
              }}
            >
              <ArrowRight size={iconSize} />
            </PanelItem>
            <PanelItem
              title="折线"
              active={connectorStyle === "elbow"}
              onPointerDown={() => {
                handleConnectorStyleChange("elbow");
              }}
            >
              <CornerRightDown size={iconSize} />
            </PanelItem>
            <PanelItem
              title="曲线"
              active={connectorStyle === "curve"}
              onPointerDown={() => {
                handleConnectorStyleChange("curve");
              }}
            >
              <ChartSpline size={iconSize} />
            </PanelItem>
            <PanelItem
              title="手绘"
              active={connectorStyle === "hand"}
              onPointerDown={() => {
                handleConnectorStyleChange("hand");
              }}
            >
              <PencilLine size={iconSize} />
            </PanelItem>
            <PanelItem
              title="飞行"
              active={connectorStyle === "fly"}
              onPointerDown={() => {
                handleConnectorStyleChange("fly");
              }}
            >
              <Sparkles size={iconSize} />
            </PanelItem>
          </HoverPanel>
        </div>

        <span className="mx-1 text-muted-foreground">|</span>

        {/* 右侧组件区：点击即触发插入 */}
        <div className="flex items-center gap-1.5">
          <IconBtn title="图片" onPointerDown={handlePickImage} disabled={snapshot.locked}>
            <ImageIcon size={iconSize} />
          </IconBtn>
          <IconBtn
            title="便签"
            onPointerDown={() =>
              addPlaceholder("Note", "Quick note placeholder card.")
            }
            disabled={snapshot.locked}
          >
            <StickyNote size={iconSize} />
          </IconBtn>
          <IconBtn
            title="文字"
            onPointerDown={() =>
              addPlaceholder("Text", "Simple text placeholder node.")
            }
            disabled={snapshot.locked}
          >
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
    </div>
  );
});

export default BoardToolbar;
