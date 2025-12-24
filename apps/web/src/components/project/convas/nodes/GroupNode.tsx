"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Palette, Ungroup } from "lucide-react";
import { NodeToolbar, type NodeProps } from "reactflow";
import { useCanvasState } from "../CanvasProvider";
import { useNodeBase } from "../hooks/use-node-base";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import NodeToolbarPanel from "../toolbar/NodeToolbarPanel";
import NodeToolbarStack from "../toolbar/NodeToolbarStack";
import { IMAGE_HANDLE_IDS } from "../utils/canvas-constants";
import HiddenHandles from "../utils/hidden-handles";
import { adjustGroupBounds, dissolveGroup } from "../utils/group-node";

export interface GroupNodeData {
  label?: string;
  backgroundColor?: string;
  /** Use id-only clipboard format for complex components. */
  copyMode?: "ids";
}

const GROUP_TOOLBAR_ICON_SIZE = 14;
const GROUP_COLOR_SWATCHES = [
  "rgba(255, 247, 214, 0.7)",
  "rgba(240, 253, 244, 0.7)",
  "rgba(239, 246, 255, 0.7)",
  "rgba(254, 242, 242, 0.7)",
  "rgba(250, 245, 255, 0.7)",
  "rgba(248, 250, 252, 0.7)",
];

/** Render a lightweight group container node. */
const GroupNode = memo(function GroupNode({ data, id, selected, xPos, yPos }: NodeProps<GroupNodeData>) {
  const { nodes, setEdges, setNodes, suppressSingleNodeToolbar } = useCanvasState();
  const baseClassName =
    "relative h-full w-full rounded-2xl border border-border/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]";
  const selectedClassName = selected ? " bg-amber-100/70" : "";
  const [isEditing, setIsEditing] = useState(false);
  const { isToolbarVisible, handleShowToolbar, toolbarPosition, toolbarPanelPosition } = useNodeBase({
    selected,
    nodes,
    suppressSingleNodeToolbar,
    xPos,
    yPos,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelValue = data?.label ?? "组";
  const [draftLabel, setDraftLabel] = useState(labelValue);
  const [activePanel, setActivePanel] = useState<"background" | null>(null);
  const backgroundColor = data?.backgroundColor ?? "rgba(255, 247, 214, 0.7)";

  /** Commit the label edit back into node data. */
  const commitLabelChange = useCallback(
    (nextLabel: string) => {
      const trimmed = nextLabel.trim();
      const finalLabel = trimmed.length > 0 ? trimmed : "组";
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? { ...node, data: { ...(node.data as GroupNodeData), label: finalLabel } }
            : node,
        ),
      );
      setDraftLabel(finalLabel);
      setIsEditing(false);
    },
    [id, setNodes],
  );

  /** Cancel the label edit without persisting. */
  const cancelLabelEdit = useCallback(() => {
    setDraftLabel(labelValue);
    setIsEditing(false);
  }, [labelValue]);

  /** Trigger group label edit. */
  const startRename = useCallback(() => {
    setDraftLabel(labelValue);
    setIsEditing(true);
  }, [labelValue]);

  /** Toggle the background color panel. */
  const handleBackgroundPanel = useCallback(() => {
    setActivePanel((current) => (current === "background" ? null : "background"));
  }, []);

  /** Apply a background color to the group node. */
  const applyBackgroundColor = useCallback(
    (color: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as GroupNodeData),
                  backgroundColor: color,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  /** Dissolve the group and keep its children. */
  const handleDissolve = useCallback(() => {
    setNodes((currentNodes) => adjustGroupBounds(dissolveGroup(currentNodes, id)));
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== id && edge.target !== id),
    );
  }, [id, setEdges, setNodes]);

  const toolbarItems = useMemo<NodeToolItem[]>(
    () => [
      {
        id: "background",
        title: "背景色",
        icon: <Palette size={GROUP_TOOLBAR_ICON_SIZE} />,
        onClick: handleBackgroundPanel,
        active: activePanel === "background",
      },
      {
        id: "dissolve",
        title: "解散",
        icon: <Ungroup size={GROUP_TOOLBAR_ICON_SIZE} />,
        onClick: handleDissolve,
        tone: "danger",
      },
    ],
    [activePanel, handleBackgroundPanel, handleDissolve],
  );

  /** Hide the toolbar only when selection is cleared after being selected. */
  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    setDraftLabel(labelValue);
  }, [labelValue]);

  useEffect(() => {
    if (!selected && isEditing) {
      setIsEditing(false);
    }
  }, [isEditing, selected]);

  return (
    <div
      className={`${baseClassName}${selectedClassName}`}
      style={{ backgroundColor }}
      onPointerDown={() => {
        // 逻辑：点击节点时显示工具栏，并收起颜色面板
        setActivePanel(null);
        handleShowToolbar();
      }}
    >
      <HiddenHandles ids={IMAGE_HANDLE_IDS} />
      <NodeToolbar
        position={toolbarPosition}
        offset={8}
        align="center"
        className="nodrag nopan pointer-events-auto"
        isVisible={isToolbarVisible}
      >
        <NodeToolbarStack
          panelPosition={toolbarPanelPosition}
          panel={
            activePanel === "background" ? (
              <NodeToolbarPanel onPointerDown={(event) => event.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  {GROUP_COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label="选择背景色"
                      className="h-5 w-5 rounded-full border border-border/60"
                      style={{ backgroundColor: color }}
                      onClick={() => applyBackgroundColor(color)}
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  ))}
                </div>
              </NodeToolbarPanel>
            ) : null
          }
          toolbar={<NodeToolsToolbar items={toolbarItems} />}
        />
      </NodeToolbar>
      <div className="absolute left-2 top-2 text-xs text-muted-foreground nodrag nopan">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={() => commitLabelChange(draftLabel)}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitLabelChange(draftLabel);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelLabelEdit();
              }
            }}
            className="w-24 rounded-sm border border-border/50 bg-background/80 px-1 py-0.5 text-[10px] text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startRename}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-left"
          >
            {labelValue}
          </button>
        )}
      </div>
    </div>
  );
});

export default GroupNode;
