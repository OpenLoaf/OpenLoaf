"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Group,
  LayoutGrid,
  Maximize2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { type ReactFlowState, useStore } from "reactflow";
import { shallow } from "zustand/shallow";
import { useCanvasState } from "../CanvasProvider";
import { adjustGroupBounds, getSelectionBounds, groupSelectedNodes } from "../utils/group-node";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import { MULTI_SELECTION_ICON_SIZE, MULTI_SELECTION_PANEL_OFFSET } from "../utils/canvas-constants";
import { alignSelectedNodes, collectDeleteIds, type AlignMode } from "../utils/canvas-selection";

/** Render a floating panel for multi-selection actions. */
const CanvasMultiSelectionToolbar = memo(function CanvasMultiSelectionToolbar() {
  const { nodes, setNodes, setEdges, isSelecting } = useCanvasState();
  const transform = useStore((state: ReactFlowState) => state.transform, shallow);
  const selection = getSelectionBounds(nodes, { useAbsolute: true });
  const [activeTool, setActiveTool] = useState<"align" | null>(null);

  useEffect(() => {
    if (!selection) {
      setActiveTool(null);
    }
  }, [selection]);

  /** Group selected nodes into a parent node. */
  const handleGroup = useCallback(() => {
    setNodes((currentNodes) => adjustGroupBounds(groupSelectedNodes(currentNodes)));
  }, [setNodes]);

  /** Align or distribute selected nodes by mode. */
  const handleAlign = useCallback(
    (mode: AlignMode) => {
      setNodes((currentNodes) => adjustGroupBounds(alignSelectedNodes(currentNodes, mode)));
    },
    [setNodes],
  );

  /** Delete selected nodes and their descendants. */
  const handleDelete = useCallback(() => {
    const deleteIds = collectDeleteIds(nodes);
    if (deleteIds.size === 0) return;
    setNodes((currentNodes) =>
      adjustGroupBounds(currentNodes.filter((node) => !deleteIds.has(node.id))),
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target),
      ),
    );
  }, [nodes, setEdges, setNodes]);

  /** Toggle the align sub toolbar for multi-selection. */
  const handleToggleAlign = useCallback(() => {
    setActiveTool((current) => (current === "align" ? null : "align"));
  }, []);

  const toolbarItems: NodeToolItem[] = [
    {
      id: "group",
      title: "编组",
      icon: <Group size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleGroup,
    },
    {
      id: "align",
      title: "对齐",
      icon: <SlidersHorizontal size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleToggleAlign,
      active: activeTool === "align",
    },
    {
      id: "delete",
      title: "删除",
      icon: <Trash2 size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleDelete,
      tone: "danger",
    },
  ];

  if (!selection || isSelecting) return null;

  const [offsetX, offsetY, zoom] = transform;
  const centerX = (selection.minX + selection.maxX) / 2;
  const topY = selection.minY;
  // 逻辑：画布坐标 -> 屏幕坐标，并让面板位于选区顶部居中
  const left = offsetX + centerX * zoom;
  const top = offsetY + topY * zoom - MULTI_SELECTION_PANEL_OFFSET;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="pointer-events-auto absolute"
        style={{ left, top, transform: "translate(-50%, -100%)" }}
      >
        <div className="flex flex-col items-center gap-1.5">
          {activeTool === "align" ? (
            <div className="flex flex-col items-center gap-1.5">
              <NodeToolsToolbar
                items={[
                  {
                    id: "align-left",
                    title: "左对齐",
                    icon: <AlignStartVertical size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("left"),
                  },
                  {
                    id: "align-center-vertical",
                    title: "水平居中",
                    icon: <AlignCenterVertical size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("center-vertical"),
                  },
                  {
                    id: "align-right",
                    title: "右对齐",
                    icon: <AlignEndVertical size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("right"),
                  },
                  {
                    id: "align-top",
                    title: "上对齐",
                    icon: <AlignStartHorizontal size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("top"),
                  },
                  {
                    id: "align-center-horizontal",
                    title: "垂直居中",
                    icon: <AlignCenterHorizontal size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("center-horizontal"),
                  },
                  {
                    id: "align-bottom",
                    title: "下对齐",
                    icon: <AlignEndHorizontal size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("bottom"),
                  },
                  ...(selection.count >= 3
                    ? [
                        {
                          id: "distribute-horizontal",
                          title: "水平分布",
                          icon: <AlignHorizontalDistributeCenter size={MULTI_SELECTION_ICON_SIZE} />,
                          onClick: () => handleAlign("distribute-horizontal"),
                        },
                        {
                          id: "distribute-vertical",
                          title: "垂直分布",
                          icon: <AlignVerticalDistributeCenter size={MULTI_SELECTION_ICON_SIZE} />,
                          onClick: () => handleAlign("distribute-vertical"),
                        },
                      ]
                    : []),
                ]}
                size="sm"
                containerClassName="p-1"
                className="gap-0.5"
              />
              <NodeToolsToolbar
                items={[
                  {
                    id: "auto-arrange",
                    title: "自动排列",
                    icon: <LayoutGrid size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("auto-arrange"),
                  },
                  {
                    id: "auto-resize",
                    title: "统一高度排列",
                    icon: <Maximize2 size={MULTI_SELECTION_ICON_SIZE} />,
                    onClick: () => handleAlign("auto-resize"),
                  },
                ]}
                size="sm"
                containerClassName="p-1"
                className="gap-0.5"
              />
            </div>
          ) : null}
          <NodeToolsToolbar items={toolbarItems} />
        </div>
      </div>
    </div>
  );
});

export default CanvasMultiSelectionToolbar;
