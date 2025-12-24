"use client";

import "@reactflow/node-resizer/dist/style.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { NodeResizer } from "@reactflow/node-resizer";
import { Check, Crop, ImagePlus, RotateCw, Trash2, X } from "lucide-react";
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "reactflow";
import { useCanvasState } from "../CanvasProvider";
import { IconBtn } from "../toolbar/ToolbarParts";
import NodeToolsToolbar, { type NodeToolItem } from "../toolbar/NodeToolsToolbar";
import { getAutoHandleIds } from "../utils/canvas-auto-handle";
import { IMAGE_HANDLE_IDS } from "../utils/canvas-constants";
import ImageCropOverlay, { type CropRect } from "./ImageCropOverlay";

export interface ImageNodeData {
  src: string;
  alt?: string;
  rotation?: number;
}

interface ImageSize {
  width: number;
  height: number;
}

type ImageTool = "crop" | "rotate" | null;

const MIN_NODE_WIDTH = 80;
const MIN_NODE_HEIGHT = 60;
const DEFAULT_CROP_RECT: CropRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const ROTATE_SNAP_STEP = 10;
const ROTATE_SNAP_THRESHOLD = 2;

/** Read a file into a data URL string. */
function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

/** Load an image element from a source string. */
function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

/** Convert a possible dimension value into a number. */
function parseDimension(value: number | string | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Resolve the node size from the React Flow node. */
function getNodeSize(node: Node | null) {
  if (!node) return null;
  const width = parseDimension(node.width) ?? parseDimension(node.style?.width);
  const height = parseDimension(node.height) ?? parseDimension(node.style?.height);
  if (typeof width !== "number" || typeof height !== "number") return null;
  return { width, height };
}

/** Compute the node display scale based on the current image size. */
function getNodeScale(node: Node | null, imageSize: ImageSize | null) {
  if (!imageSize) return 1;
  const nodeSize = getNodeSize(node);
  if (!nodeSize) return 1;
  const widthScale = nodeSize.width / imageSize.width;
  const heightScale = nodeSize.height / imageSize.height;
  const scale = Math.min(widthScale, heightScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Compute the next node dimensions from image size and scale. */
function getScaledNodeSize(imageSize: ImageSize, scale: number) {
  return {
    width: Math.max(MIN_NODE_WIDTH, Math.round(imageSize.width * scale)),
    height: Math.max(MIN_NODE_HEIGHT, Math.round(imageSize.height * scale)),
  };
}

/** Snap the rotation angle to detent steps when close enough. */
function getSnappedAngle(value: number) {
  const snapped = Math.round(value / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP;
  return Math.abs(snapped - value) <= ROTATE_SNAP_THRESHOLD ? snapped : value;
}


/** Render a resizable image node. */
const ImageNode = memo(function ImageNode({ id, data, selected }: NodeProps<ImageNodeData>) {
  const iconSize = 16;
  const { nodes, setEdges, setNodes, suppressSingleNodeToolbar } = useCanvasState();
  const selectedNodesCount = useMemo(() => nodes.filter((node) => node.selected).length, [nodes]);
  const currentNode = useMemo(() => nodes.find((node) => node.id === id) ?? null, [id, nodes]);
  const isSingleSelection = selected && selectedNodesCount === 1 && !suppressSingleNodeToolbar;
  const [activeTool, setActiveTool] = useState<ImageTool>(null);
  const [cropRect, setCropRect] = useState<CropRect>(DEFAULT_CROP_RECT);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const storedRotation = typeof data.rotation === "number" ? data.rotation : 0;

  useEffect(() => {
    if (!isSingleSelection) {
      setActiveTool(null);
    }
  }, [isSingleSelection]);

  useEffect(() => {
    if (activeTool === "crop") {
      setCropRect(DEFAULT_CROP_RECT);
    }
    if (activeTool === "rotate") {
      setRotationAngle(storedRotation);
    }
  }, [activeTool, storedRotation]);

  useEffect(() => {
    setCropRect(DEFAULT_CROP_RECT);
  }, [data.src]);

  /** Update the node data and dimensions after image edits. */
  const updateNodeImage = useCallback(
    (nextSrc: string, nextSize: ImageSize, nextAlt?: string) => {
      // 流程：读取节点尺寸 -> 计算缩放比例 -> 更新节点数据 + 尺寸
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const scale = getNodeScale(node, imageSize ?? nextSize);
          const nextDimensions = getScaledNodeSize(nextSize, scale);
          return {
            ...node,
            data: {
              ...node.data,
              src: nextSrc,
              alt: nextAlt ?? node.data?.alt,
            },
            width: nextDimensions.width,
            height: nextDimensions.height,
            style: {
              ...node.style,
              width: nextDimensions.width,
              height: nextDimensions.height,
            },
          };
        }),
      );
    },
    [id, imageSize, setNodes],
  );

  /** Apply cropping and create a new image node copy. */
  const handleApplyCrop = useCallback(async () => {
    if (!currentNode) return;
    setIsProcessing(true);
    try {
      // 流程：加载图片 -> 计算像素裁剪区域 -> 绘制新图片 -> 创建新节点 + 连线
      const image = await loadImageElement(data.src);
      const baseImageSize = imageSize ?? { width: image.width, height: image.height };
      const cropX = Math.max(0, Math.round(cropRect.x * image.width));
      const cropY = Math.max(0, Math.round(cropRect.y * image.height));
      const rawWidth = Math.max(1, Math.round(cropRect.width * image.width));
      const rawHeight = Math.max(1, Math.round(cropRect.height * image.height));
      const cropWidth = Math.max(1, Math.min(rawWidth, image.width - cropX));
      const cropHeight = Math.max(1, Math.min(rawHeight, image.height - cropY));
      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const dataUrl = canvas.toDataURL("image/png");
      const scale = getNodeScale(currentNode, baseImageSize);
      const nextDimensions = getScaledNodeSize({ width: cropWidth, height: cropHeight }, scale);
      const sourceSize = getNodeSize(currentNode) ?? nextDimensions;
      const nextNodeId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // 逻辑：新裁剪节点默认放在原节点下方
      const nextPosition = {
        x: currentNode.position.x + 24,
        y: currentNode.position.y + sourceSize.height + 48,
      };
      const sourceCenter = {
        x: currentNode.position.x + sourceSize.width / 2,
        y: currentNode.position.y + sourceSize.height / 2,
      };
      const targetCenter = {
        x: nextPosition.x + nextDimensions.width / 2,
        y: nextPosition.y + nextDimensions.height / 2,
      };
      const { sourceHandle, targetHandle } = getAutoHandleIds(sourceCenter, targetCenter);
      const nextNode = {
        id: nextNodeId,
        position: nextPosition,
        data: {
          src: dataUrl,
          alt: data.alt,
          rotation: data.rotation,
        } satisfies ImageNodeData,
        width: nextDimensions.width,
        height: nextDimensions.height,
        style: {
          width: nextDimensions.width,
          height: nextDimensions.height,
          padding: 0,
          borderWidth: 0,
        },
        type: "image",
      };
      setNodes((nodes) => nodes.concat(nextNode));
      setEdges((edges) =>
        edges.concat({
          id: `e-${id}-${nextNodeId}-${Date.now()}`,
          source: id,
          target: nextNodeId,
          label: "裁切",
          sourceHandle,
          targetHandle,
          data: {
            autoHandle: true,
          },
        }),
      );
      setActiveTool(null);
    } finally {
      setIsProcessing(false);
    }
  }, [cropRect, currentNode, data.alt, data.src, id, imageSize, setEdges, setNodes]);

  /** Apply rotation to the current node component. */
  const handleApplyRotation = useCallback(() => {
    // 流程：写入旋转角度 -> 保留节点尺寸 -> 关闭旋转模式
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                rotation: rotationAngle,
              },
            }
          : node,
      ),
    );
    setActiveTool(null);
  }, [id, rotationAngle, setNodes]);

  /** Start replacing the current image. */
  const handleReplaceClick = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  /** Handle replacing the current image with a file. */
  const handleReplaceFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setIsProcessing(true);
      try {
        // 流程：读取文件 -> 获取尺寸 -> 更新节点数据 + 尺寸
        const dataUrl = await readFileAsDataUrl(file);
        const image = await loadImageElement(dataUrl);
        updateNodeImage(dataUrl, { width: image.width, height: image.height }, file.name);
        setActiveTool(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [updateNodeImage],
  );

  /** Remove the current node from the canvas. */
  const handleDelete = useCallback(() => {
    // 流程：过滤节点 -> 同步清理关联连线
    setNodes((nodes) => nodes.filter((node) => node.id !== id));
    setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setEdges, setNodes]);

  /** Handle selecting a toolbar tool. */
  const handleToolClick = useCallback(
    (toolId: string) => {
      if (toolId === "replace") {
        handleReplaceClick();
        return;
      }
      if (toolId === "delete") {
        handleDelete();
        return;
      }
      if (toolId === "crop") {
        setActiveTool((prev) => (prev === "crop" ? null : "crop"));
        return;
      }
      if (toolId === "rotate") {
        setActiveTool((prev) => (prev === "rotate" ? null : "rotate"));
      }
    },
    [activeTool, handleDelete, handleReplaceClick, id],
  );

  /** Handle rotation slider updates with detents. */
  const handleRotationChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    setRotationAngle(getSnappedAngle(nextValue));
  }, []);

  /** Capture image natural dimensions on load. */
  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    setImageSize({ width: target.naturalWidth, height: target.naturalHeight });
  }, []);

  const toolbarItems = useMemo<NodeToolItem[]>(
    () => [
      { id: "replace", title: "替换", icon: <ImagePlus size={iconSize} />, onClick: () => handleToolClick("replace") },
      {
        id: "crop",
        title: "裁剪",
        icon: <Crop size={iconSize} />,
        onClick: () => handleToolClick("crop"),
        active: activeTool === "crop",
      },
      {
        id: "rotate",
        title: "旋转",
        icon: <RotateCw size={iconSize} />,
        onClick: () => handleToolClick("rotate"),
        active: activeTool === "rotate",
      },
      { id: "delete", title: "删除", icon: <Trash2 size={iconSize} />, onClick: () => handleToolClick("delete") },
    ],
    [activeTool, handleToolClick, iconSize],
  );

  /** Stop toolbar events from bubbling into the canvas. */
  const handleToolbarEvent = useCallback((event: SyntheticEvent) => {
    // 逻辑：在冒泡阶段拦截，避免阻断按钮自身处理
    event.stopPropagation();
  }, []);

  const showResizer = selected && activeTool === null;

  const displayRotation = activeTool === "rotate" ? rotationAngle : storedRotation;
  const rotationStyle =
    Math.abs(displayRotation) > 0.01
      ? { transform: `rotate(${displayRotation}deg)`, transformOrigin: "center" }
      : undefined;

  const selectedClassName = selected ? " ring-1 ring-foreground/70" : "";

  return (
    <div className={`relative h-full w-full border-0${selectedClassName}`}>
      {/* 连线锚点：用于自动生成的连线，不展示 UI */}
      <Handle
        id={IMAGE_HANDLE_IDS.target.top}
        type="target"
        position={Position.Top}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.right}
        type="target"
        position={Position.Right}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.bottom}
        type="target"
        position={Position.Bottom}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.target.left}
        type="target"
        position={Position.Left}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.top}
        type="source"
        position={Position.Top}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.right}
        type="source"
        position={Position.Right}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.bottom}
        type="source"
        position={Position.Bottom}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id={IMAGE_HANDLE_IDS.source.left}
        type="source"
        position={Position.Left}
        className="pointer-events-none opacity-0"
      />
      {/* 选中图片时显示上方工具栏 */}
      <NodeToolbar
        position={Position.Top}
        offset={8}
        className="nodrag nopan pointer-events-auto"
        isVisible={isSingleSelection}
        onPointerDown={handleToolbarEvent}
        onClick={handleToolbarEvent}
      >
        <div className="flex flex-col items-center gap-1.5">
          <NodeToolsToolbar items={toolbarItems} size="md" />
          {activeTool === "crop" ? (
            <div className="rounded-md bg-background p-1.5 ring-1 ring-border">
              <div className="flex items-center gap-1">
                <IconBtn
                  title="应用裁剪"
                  className="h-6 w-6"
                  disabled={isProcessing}
                  onClick={handleApplyCrop}
                >
                  <Check size={14} />
                </IconBtn>
                <IconBtn
                  title="取消裁剪"
                  className="h-6 w-6"
                  disabled={isProcessing}
                  onClick={() => setActiveTool(null)}
                >
                  <X size={14} />
                </IconBtn>
              </div>
            </div>
          ) : null}
          {activeTool === "rotate" ? (
            <div className="rounded-md bg-background p-2 ring-1 ring-border">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-muted-foreground">旋转 {rotationAngle}°</div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotationAngle}
                  onChange={handleRotationChange}
                  className="h-1 w-40 accent-foreground"
                />
                <div className="flex items-center gap-1">
                  <IconBtn
                    title="应用旋转"
                    className="h-6 w-6"
                    disabled={isProcessing}
                    onClick={handleApplyRotation}
                  >
                    <Check size={14} />
                  </IconBtn>
                  <IconBtn
                    title="取消旋转"
                    className="h-6 w-6"
                    disabled={isProcessing}
                    onClick={() => setActiveTool(null)}
                  >
                    <X size={14} />
                  </IconBtn>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </NodeToolbar>
      <div className="absolute inset-0" style={rotationStyle}>
        <NodeResizer
          isVisible={showResizer}
          minWidth={MIN_NODE_WIDTH}
          minHeight={MIN_NODE_HEIGHT}
          keepAspectRatio
          lineClassName="opacity-0"
          lineStyle={{ borderWidth: 0 }}
          handleClassName="border border-muted-foreground/70 bg-background"
        />
        <div ref={imageContainerRef} className="relative h-full w-full overflow-hidden">
          <img
            src={data.src}
            alt={data.alt ?? "图片"}
            className="block h-full w-full object-contain"
            draggable={false}
            onLoad={handleImageLoad}
          />
          {activeTool === "crop" ? (
            <ImageCropOverlay
              containerRef={imageContainerRef}
              imageSize={imageSize}
              cropRect={cropRect}
              onCropRectChange={setCropRect}
              rotation={displayRotation}
            />
          ) : null}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReplaceFile}
      />
    </div>
  );
});

export default ImageNode;
