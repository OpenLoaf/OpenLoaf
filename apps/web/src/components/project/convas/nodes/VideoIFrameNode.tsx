"use client";

import "@reactflow/node-resizer/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link2, MousePointer2, Trash2 } from "lucide-react";
import { NodeResizer } from "@reactflow/node-resizer";
import { NodeToolbar, type NodeProps } from "reactflow";
import { useCanvasState } from "../CanvasProvider";
import { useNodeBase } from "../hooks/use-node-base";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import NodeToolbarStack from "../toolbar/NodeToolbarStack";
import { IMAGE_HANDLE_IDS } from "../utils/canvas-constants";
import HiddenHandles from "../utils/hidden-handles";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface VideoIFrameNodeData {
  src?: string;
  title?: string;
  autoEdit?: boolean;
}

const MIN_NODE_WIDTH = 240;
const MIN_NODE_HEIGHT = 140;

/** Render an iframe-based video node. */
const VideoIFrameNode = memo(function VideoIFrameNode({
  id,
  data,
  selected,
  xPos,
  yPos,
}: NodeProps<VideoIFrameNodeData>) {
  const { nodes, setEdges, setNodes, suppressSingleNodeToolbar, beginNodeResize, endNodeResize } =
    useCanvasState();
  const {
    isSingleSelection,
    isToolbarVisible,
    handleShowToolbar,
    setShowToolbar,
    toolbarPosition,
    toolbarPanelPosition,
  } = useNodeBase({
    selected,
    nodes,
    suppressSingleNodeToolbar,
    xPos,
    yPos,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [draftUrl, setDraftUrl] = useState(data?.src ?? "");
  const displayUrl = data?.src?.trim() ?? "";
  const title = data?.title ?? "嵌入视频";

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

  /** Apply a partial patch to the node data. */
  const updateNodeData = useCallback(
    (patch: Partial<VideoIFrameNodeData>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...(node.data as VideoIFrameNodeData),
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [id, setNodes],
  );

  /** Remove the node from the canvas state. */
  const handleDelete = useCallback(() => {
    // 流程：过滤节点 -> 同步清理关联连线
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== id));
    setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setEdges, setNodes]);

  /** Save the current draft URL into the node data. */
  const handleApplyUrl = useCallback(() => {
    const parsed = extractEmbedUrl(draftUrl);
    if (!parsed) {
      // 逻辑：未输入链接时直接移除空节点
      handleDelete();
      return;
    }
    updateNodeData({ src: parsed, autoEdit: false });
    setDialogOpen(false);
    setShowToolbar(true);
  }, [draftUrl, extractEmbedUrl, handleDelete, setShowToolbar, updateNodeData]);

  /** Cancel editing and restore the last saved URL. */
  const handleCancelEdit = useCallback(() => {
    setDraftUrl(displayUrl);
    setDialogOpen(false);
  }, [displayUrl]);

  /** Open the URL input dialog. */
  const openDialog = useCallback(() => {
    setDraftUrl(displayUrl);
    setDialogOpen(true);
  }, [displayUrl]);

  useEffect(() => {
    setDraftUrl(displayUrl);
  }, [displayUrl]);

  useEffect(() => {
    if (!data?.autoEdit) return;
    // 逻辑：自动进入链接输入弹窗，并展开工具栏
    setDialogOpen(true);
    setShowToolbar(true);
    updateNodeData({ autoEdit: false });
  }, [data?.autoEdit, setShowToolbar, updateNodeData]);

  useEffect(() => {
    if (!isSingleSelection) {
      setDialogOpen(false);
      setIsInteractive(false);
    }
  }, [isSingleSelection]);

  /** Toggle iframe interaction so drag/resize stays usable by default. */
  const toggleInteraction = useCallback(() => {
    setIsInteractive((prev) => !prev);
  }, []);

  const toolbarItems = useMemo<NodeToolItem[]>(
    () => [
      {
        id: "interact",
        title: "交互",
        icon: <MousePointer2 size={14} />,
        onClick: toggleInteraction,
        active: isInteractive,
      },
      {
        id: "edit-link",
        title: "编辑",
        icon: <Link2 size={14} />,
        onClick: openDialog,
        active: dialogOpen,
      },
      {
        id: "delete",
        title: "删除",
        icon: <Trash2 size={14} />,
        onClick: handleDelete,
        tone: "danger",
      },
    ],
    [dialogOpen, handleDelete, isInteractive, openDialog, toggleInteraction],
  );

  return (
    <div
      className="relative h-full w-full overflow-visible"
      onPointerDown={handleShowToolbar}
      onClick={handleShowToolbar}
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
          panelPosition={toolbarPanelPosition}
          toolbar={<NodeToolsToolbar items={toolbarItems} />}
        />
      </NodeToolbar>
      <HiddenHandles ids={IMAGE_HANDLE_IDS} />
      <div className="group h-full w-full overflow-hidden rounded-lg border border-border/60 bg-muted/20">
        <div className="h-full w-full overflow-auto">
          {displayUrl ? (
            <iframe
              title={title}
              src={displayUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="no-referrer"
              style={{ pointerEvents: isInteractive ? "auto" : "none" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              需要输入嵌入视频链接
            </div>
          )}
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>插入嵌入视频</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              支持直接输入链接，或粘贴 iframe 代码自动提取 src。
            </div>
            <input
              type="text"
              value={draftUrl}
              placeholder="粘贴链接或 iframe 代码"
              className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
              onChange={(event) => setDraftUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleApplyUrl();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  handleCancelEdit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
              onClick={handleCancelEdit}
            >
              取消
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-sm hover:bg-accent"
              onClick={handleApplyUrl}
            >
              确定
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NodeResizer
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        isVisible={selected}
        onResizeStart={beginNodeResize}
        onResizeEnd={endNodeResize}
      />
    </div>
  );
});

export default VideoIFrameNode;
