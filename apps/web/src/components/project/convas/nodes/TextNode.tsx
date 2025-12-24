"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Italic, Palette, Plus, Minus, Trash2, Type } from "lucide-react";
import { NodeToolbar, type NodeProps } from "reactflow";
import { useCanvasState } from "../CanvasProvider";
import { useNodeBase } from "../hooks/use-node-base";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import NodeToolbarPanel from "../toolbar/NodeToolbarPanel";
import NodeToolbarStack from "../toolbar/NodeToolbarStack";

export interface TextNodeData {
  text?: string;
  autoEdit?: boolean;
  editing?: boolean;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  color?: string;
}

const DEFAULT_FONT_SIZE = 24;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 64;
const FONT_STEP = 2;
const FONT_REPEAT_DELAY = 350;
const FONT_REPEAT_INTERVAL = 120;
const FONT_OPTIONS = [
  { id: "inherit", label: "System", family: "inherit" },
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
  { id: "times", label: "Times New Roman", family: "'Times New Roman', Georgia, serif" },
  { id: "courier", label: "Courier New", family: "'Courier New', Menlo, monospace" },
  { id: "marker", label: "Marker Felt", family: "'Marker Felt', 'Bradley Hand', 'Comic Sans MS', cursive" },
  { id: "papyrus", label: "Papyrus", family: "'Papyrus', fantasy" },
];
const COLOR_SWATCHES = [
  "#111827",
  "#1F2937",
  "#374151",
  "#6B7280",
  "#1E3A8A",
  "#0F766E",
  "#B45309",
  "#9F1239",
];

/** Render a text node with inline editing and styling tools. */
const TextNode = memo(function TextNode({ data, id, selected, xPos, yPos }: NodeProps<TextNodeData>) {
  const { nodes, setEdges, setNodes, suppressSingleNodeToolbar } = useCanvasState();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLSpanElement | null>(null);
  const fontRepeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fontRepeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isComposingRef = useRef(false);
  const { isToolbarVisible, handleShowToolbar, toolbarPosition, toolbarPanelPosition } = useNodeBase({
    selected,
    nodes,
    suppressSingleNodeToolbar,
    xPos,
    yPos,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [activePanel, setActivePanel] = useState<"color" | "font" | null>(null);
  const savedText = data?.text ?? "";
  const displayText = useMemo(() => (savedText.length > 0 ? savedText : ""), [savedText]);
  const fontSize = data?.fontSize ?? DEFAULT_FONT_SIZE;
  const fontWeight = data?.fontWeight ?? "normal";
  const fontStyle = data?.fontStyle ?? "normal";
  const textAlign = data?.textAlign ?? "left";
  const fontFamily = data?.fontFamily ?? "inherit";
  const textColor = data?.color ?? "currentColor";
  const inputMinWidth = Math.max(12, Math.ceil(fontSize * 0.6));
  const inputMinHeight = Math.max(Math.ceil(fontSize * 1.4), 20);

  /** Update the text node data with a partial patch. */
  const updateNodeData = useCallback(
    (patch: Partial<TextNodeData>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as TextNodeData),
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  /** Remove the node from canvas state. */
  const removeNode = useCallback(() => {
    // 流程：过滤节点 -> 同步清理关联连线
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== id));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setEdges, setNodes]);

  /** Apply the updated text back into the node data. */
  const commitTextChange = useCallback(
    (nextValue: string) => {
      const trimmed = nextValue.trim();
      if (trimmed.length === 0) {
        // 逻辑：空文本直接移除节点，避免创建空组件
        removeNode();
        return;
      }
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as TextNodeData),
                  text: nextValue,
                  autoEdit: false,
                  editing: false,
                },
              }
            : node,
        ),
      );
      setIsEditing(false);
    },
    [id, removeNode, setNodes],
  );

  /** Cancel the edit and restore the stored text. */
  const cancelEdit = useCallback(() => {
    if (savedText.trim().length === 0) {
      // 逻辑：未输入内容时取消编辑，移除空节点
      removeNode();
      return;
    }
    setDraftText(savedText);
    setIsEditing(false);
    updateNodeData({ editing: false });
  }, [removeNode, savedText, updateNodeData]);

  /** Start editing in-place. */
  const startEdit = useCallback(() => {
    setIsEditing(true);
    setActivePanel(null);
    updateNodeData({ editing: true });
  }, [savedText, updateNodeData]);

  /** Toggle the color panel. */
  const handleColorPanel = useCallback(() => {
    setActivePanel((current) => (current === "color" ? null : "color"));
  }, []);

  /** Toggle the font family panel. */
  const handleFontPanel = useCallback(() => {
    setActivePanel((current) => (current === "font" ? null : "font"));
  }, []);

  /** Toggle the bold text style. */
  const toggleBold = useCallback(() => {
    updateNodeData({ fontWeight: fontWeight === "bold" ? "normal" : "bold" });
  }, [fontWeight, updateNodeData]);

  /** Toggle the italic text style. */
  const toggleItalic = useCallback(() => {
    updateNodeData({ fontStyle: fontStyle === "italic" ? "normal" : "italic" });
  }, [fontStyle, updateNodeData]);

  /** Adjust the font size by a delta. */
  const adjustFontSize = useCallback(
    (delta: number) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== id) return node;
          const currentSize =
            typeof (node.data as TextNodeData | undefined)?.fontSize === "number"
              ? (node.data as TextNodeData).fontSize!
              : DEFAULT_FONT_SIZE;
          const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, currentSize + delta));
          if (next === currentSize) return node;
          return {
            ...node,
            data: {
              ...(node.data as TextNodeData),
              fontSize: next,
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  /** Apply a text color. */
  const applyTextColor = useCallback(
    (color: string) => {
      updateNodeData({ color });
    },
    [updateNodeData],
  );

  /** Apply a font family. */
  const applyFontFamily = useCallback(
    (family: string) => {
      updateNodeData({ fontFamily: family });
    },
    [updateNodeData],
  );

  /** Start repeating font size adjustment on press. */
  const startFontAdjust = useCallback(
    (delta: number) => {
      adjustFontSize(delta);
      if (fontRepeatTimeoutRef.current) {
        clearTimeout(fontRepeatTimeoutRef.current);
      }
      if (fontRepeatIntervalRef.current) {
        clearInterval(fontRepeatIntervalRef.current);
      }
      fontRepeatTimeoutRef.current = setTimeout(() => {
        // 逻辑：长按后持续触发字号调整
        fontRepeatIntervalRef.current = setInterval(() => adjustFontSize(delta), FONT_REPEAT_INTERVAL);
      }, FONT_REPEAT_DELAY);
    },
    [adjustFontSize],
  );

  /** Stop repeating font size adjustment. */
  const stopFontAdjust = useCallback(() => {
    if (fontRepeatTimeoutRef.current) {
      clearTimeout(fontRepeatTimeoutRef.current);
      fontRepeatTimeoutRef.current = null;
    }
    if (fontRepeatIntervalRef.current) {
      clearInterval(fontRepeatIntervalRef.current);
      fontRepeatIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const target = editorRef.current;
    if (!target) return;
    target.focus();
    // 逻辑：进入编辑态时写入初始文本，避免光标跳动
    target.textContent = savedText;
  }, [isEditing]);

  useEffect(() => {
    if (!data?.autoEdit) return;
    // 逻辑：新建文本节点时自动进入编辑态，并清理 autoEdit 标记
    setIsEditing(true);
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...(node.data as TextNodeData),
                autoEdit: false,
                editing: true,
              },
            }
          : node,
      ),
    );
  }, [data?.autoEdit, id, setNodes]);

  useEffect(() => stopFontAdjust, [stopFontAdjust]);

  const toolbarItems = useMemo<NodeToolItem[]>(
    () => [
      {
        id: "font-decrease",
        title: "减小",
        icon: <Minus size={14} />,
        onPointerDown: () => startFontAdjust(-FONT_STEP),
        onPointerUp: stopFontAdjust,
        onPointerLeave: stopFontAdjust,
        onPointerCancel: stopFontAdjust,
      },
      {
        id: "font-increase",
        title: "增大",
        icon: <Plus size={14} />,
        onPointerDown: () => startFontAdjust(FONT_STEP),
        onPointerUp: stopFontAdjust,
        onPointerLeave: stopFontAdjust,
        onPointerCancel: stopFontAdjust,
      },
      {
        id: "bold",
        title: "加粗",
        icon: <Bold size={14} />,
        onClick: toggleBold,
        active: fontWeight === "bold",
      },
      {
        id: "italic",
        title: "斜体",
        icon: <Italic size={14} />,
        onClick: toggleItalic,
        active: fontStyle === "italic",
      },
      {
        id: "font-family",
        title: "字体",
        icon: <Type size={14} />,
        onClick: handleFontPanel,
        active: activePanel === "font",
      },
      {
        id: "color",
        title: "颜色",
        icon: <Palette size={14} />,
        onClick: handleColorPanel,
        active: activePanel === "color",
      },
      {
        id: "delete",
        title: "删除",
        icon: <Trash2 size={14} />,
        onClick: removeNode,
        tone: "danger",
      },
    ],
    [
      activePanel,
      fontStyle,
      fontWeight,
      handleColorPanel,
      handleFontPanel,
      removeNode,
      startFontAdjust,
      stopFontAdjust,
      toggleBold,
      toggleItalic,
    ],
  );

  const toolbarPanel =
    activePanel === "color" ? (
      <NodeToolbarPanel onPointerDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label="选择文本颜色"
              className="h-5 w-5 rounded-full border border-border/60"
              style={{ backgroundColor: color }}
              onClick={() => applyTextColor(color)}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ))}
        </div>
      </NodeToolbarPanel>
    ) : activePanel === "font" ? (
      <NodeToolbarPanel onPointerDown={(event) => event.stopPropagation()}>
        <div className="flex flex-col gap-1">
          {FONT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="flex items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
              style={{ fontFamily: option.family }}
              onClick={() => applyFontFamily(option.family)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span>{option.label}</span>
              {fontFamily === option.family ? <span>✓</span> : null}
            </button>
          ))}
        </div>
      </NodeToolbarPanel>
    ) : null;

  return (
    <div
      ref={containerRef}
      className="relative inline-block text-foreground"
      style={{
        fontSize,
        fontWeight,
        fontStyle,
        textAlign,
        color: textColor,
      }}
      onPointerDown={(event) => {
        // 逻辑：点击节点主体时展示工具栏并关闭颜色面板
        setActivePanel(null);
        handleShowToolbar();
      }}
      onClick={() => {
        setActivePanel(null);
        handleShowToolbar();
      }}
      onDoubleClick={startEdit}
    >
      <NodeToolbar
        position={toolbarPosition}
        offset={8}
        align="center"
        className="nodrag nopan pointer-events-auto"
        isVisible={isToolbarVisible}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <NodeToolbarStack
          panel={toolbarPanel}
          panelPosition={toolbarPanelPosition}
          toolbar={<NodeToolsToolbar items={toolbarItems} />}
        />
      </NodeToolbar>
      <span
        ref={editorRef}
        role="textbox"
        aria-label="文本内容"
        contentEditable={isEditing}
        suppressContentEditableWarning={true}
        className={
          isEditing
            ? "nodrag nopan inline-block whitespace-pre outline outline-1 outline-border/70"
            : "inline-block whitespace-pre"
        }
        style={{
        fontSize,
        fontWeight,
        fontStyle,
        textAlign,
        color: textColor,
        fontFamily,
        width: isEditing ? "fit-content" : undefined,
        maxWidth: "none",
        minWidth: isEditing ? inputMinWidth : undefined,
        minHeight: isEditing ? inputMinHeight : undefined,
        }}
        onInput={() => {
          if (isComposingRef.current) return;
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
        }}
        onBlur={(event) => commitTextChange(event.currentTarget.textContent ?? "")}
        onKeyDown={(event) => {
          if (isComposingRef.current) return;
          if (event.key === "Enter") {
            event.preventDefault();
            commitTextChange(event.currentTarget.textContent ?? "");
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
        }}
        onPointerDown={(event) => {
          if (isEditing) {
            event.stopPropagation();
          }
        }}
      >
        {displayText}
      </span>
    </div>
  );
});

export default TextNode;
