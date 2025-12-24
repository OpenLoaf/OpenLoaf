"use client";

import { memo, useCallback } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, Group, Trash2 } from "lucide-react";
import { type ReactFlowState, useStore } from "reactflow";
import { shallow } from "zustand/shallow";
import { useCanvasState } from "../CanvasProvider";
import { adjustGroupBounds, getSelectionBounds, groupSelectedNodes } from "../nodes/GroupNode";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import { MULTI_SELECTION_ICON_SIZE, MULTI_SELECTION_PANEL_OFFSET } from "../utils/canvas-constants";
import { alignSelectedNodes, collectDeleteIds } from "../utils/canvas-selection";

/** Render a floating panel for multi-selection actions. */
const CanvasMultiSelectionToolbar = memo(function CanvasMultiSelectionToolbar() {
  const { nodes, setNodes, setEdges } = useCanvasState();
  const transform = useStore((state: ReactFlowState) => state.transform, shallow);
  const selection = getSelectionBounds(nodes, { useAbsolute: true });

  /** Group selected nodes into a parent node. */
  const handleGroup = useCallback(() => {
    setNodes((currentNodes) => adjustGroupBounds(groupSelectedNodes(currentNodes)));
  }, [setNodes]);

  /** Align selected nodes horizontally. */
  const handleAlignHorizontal = useCallback(() => {
    setNodes((currentNodes) =>
      adjustGroupBounds(alignSelectedNodes(currentNodes, "horizontal")),
    );
  }, [setNodes]);

  /** Align selected nodes vertically. */
  const handleAlignVertical = useCallback(() => {
    setNodes((currentNodes) => adjustGroupBounds(alignSelectedNodes(currentNodes, "vertical")));
  }, [setNodes]);

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

  const toolbarItems: NodeToolItem[] = [
    {
      id: "group",
      title: "编组",
      icon: <Group size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleGroup,
    },
    {
      id: "align-horizontal",
      title: "水平对齐",
      icon: <AlignCenterHorizontal size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleAlignHorizontal,
    },
    {
      id: "align-vertical",
      title: "垂直对齐",
      icon: <AlignCenterVertical size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleAlignVertical,
    },
    {
      id: "delete",
      title: "删除",
      icon: <Trash2 size={MULTI_SELECTION_ICON_SIZE} />,
      onClick: handleDelete,
    },
  ];

  if (!selection) return null;

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
        <NodeToolsToolbar items={toolbarItems} />
      </div>
    </div>
  );
});

export default CanvasMultiSelectionToolbar;
