"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, DragEvent, PointerEvent, RefObject, SetStateAction } from "react";
import type { Node as RFNode, ReactFlowInstance } from "reactflow";
import type { ImageNodeData } from "../nodes/ImageNode";

interface UseCanvasImagesOptions {
  isCanvasActive: boolean;
  isLocked: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
  flowRef: RefObject<ReactFlowInstance | null>;
  setNodes: Dispatch<SetStateAction<RFNode[]>>;
}

interface UseCanvasImagesResult {
  handleCanvasPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  handleCanvasDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleCanvasDrop: (event: DragEvent<HTMLDivElement>) => void;
}

/** Manage image paste/drag-drop behavior on the canvas. */
export function useCanvasImages({
  isCanvasActive,
  isLocked,
  canvasRef,
  flowRef,
  setNodes,
}: UseCanvasImagesOptions): UseCanvasImagesResult {
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pasteOffsetRef = useRef(0);

  /** Track pointer position for paste placement. */
  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  /** Resolve flow coordinates from a client point. */
  const getFlowPositionFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const inst = flowRef.current;
      if (!inst) {
        return { x: 0, y: 0 };
      }
      return inst.screenToFlowPosition({ x: clientX, y: clientY });
    },
    [flowRef],
  );

  /** Resolve the flow position for pasted content. */
  const getPastePosition = useCallback(() => {
    const el = canvasRef.current;
    if (!el) {
      return { x: 0, y: 0 };
    }
    const rect = el.getBoundingClientRect();
    const pointer = lastPointerRef.current;
    const clientX = pointer?.x ?? rect.left + rect.width / 2;
    const clientY = pointer?.y ?? rect.top + rect.height / 2;
    return getFlowPositionFromClient(clientX, clientY);
  }, [canvasRef, getFlowPositionFromClient]);

  /** Insert an image node from a file. */
  const insertImageNode = useCallback(
    async (
      file: File,
      options?: {
        position?: { x: number; y: number };
        offset?: number;
        alt?: string;
      },
    ) => {
      // 流程：读取图片文件 -> 获取尺寸 -> 计算缩放 -> 生成节点
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read image file."));
        reader.readAsDataURL(file);
      });

      const imageSize = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.width, height: image.height });
        image.src = dataUrl;
      });

      const maxWidth = 320;
      const maxHeight = 240;
      const scale = Math.min(1, maxWidth / imageSize.width, maxHeight / imageSize.height);
      const width = Math.max(80, Math.round(imageSize.width * scale));
      const height = Math.max(60, Math.round(imageSize.height * scale));
      const basePosition = options?.position ?? getPastePosition();
      // 连续粘贴时做轻微偏移，避免节点完全重叠
      const offset =
        typeof options?.offset === "number" ? options.offset : pasteOffsetRef.current;
      if (typeof options?.offset !== "number") {
        pasteOffsetRef.current = (offset + 24) % 120;
      }
      const altText = options?.alt ?? (file.name ? file.name : "图片");
      // 流程：计算最终位置 -> 写入节点
      const rawPosition = { x: basePosition.x + offset, y: basePosition.y + offset };

      setNodes((nds) =>
        nds.concat({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          position: rawPosition,
          data: { src: dataUrl, alt: altText } satisfies ImageNodeData,
          width,
          height,
          style: {
            width,
            height,
            padding: 0,
            borderWidth: 0,
          },
          type: "image",
        }),
      );
    },
    [getPastePosition, setNodes],
  );

  /** Check whether a data transfer payload has image files. */
  const hasImageFilesInTransfer = useCallback((dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return false;
    const items = Array.from(dataTransfer.items ?? []);
    if (items.length > 0) {
      // 优先读取 items，避免 files 为空导致误判
      return items.some((item) => item.kind === "file" && item.type.startsWith("image/"));
    }
    const files = Array.from(dataTransfer.files ?? []);
    return files.some((file) => file.type.startsWith("image/"));
  }, []);

  /** Extract image files from a data transfer payload. */
  const getImageFilesFromTransfer = useCallback((dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return [];
    const items = Array.from(dataTransfer.items ?? []);
    // 流程：先从 items 提取真实文件 -> 无结果时回退 files -> 仅保留图片
    const filesFromItems = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (filesFromItems.length > 0) {
      return filesFromItems;
    }
    return Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"));
  }, []);

  /** Handle drag-over to allow image drop on the canvas. */
  const handleCanvasDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isCanvasActive || isLocked) return;
      if (!hasImageFilesInTransfer(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [hasImageFilesInTransfer, isCanvasActive, isLocked],
  );

  /** Handle dropping image files onto the canvas. */
  const handleCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isCanvasActive || isLocked) return;
      const imageFiles = getImageFilesFromTransfer(event.dataTransfer);
      if (imageFiles.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      // 流程：校验拖入 -> 计算落点坐标 -> 顺序插入并轻微错开
      const basePosition = getFlowPositionFromClient(event.clientX, event.clientY);
      imageFiles.forEach((file, index) => {
        const offset = index * 24;
        void insertImageNode(file, {
          position: basePosition,
          offset,
          alt: file.name || "拖入图片",
        });
      });
    },
    [getFlowPositionFromClient, getImageFilesFromTransfer, insertImageNode, isCanvasActive, isLocked],
  );

  /** Handle clipboard paste for images on the canvas. */
  const handlePasteImage = useCallback(
    (event: ClipboardEvent) => {
      if (!isCanvasActive || isLocked) return;
      const target = event.target as Node | null;
      const canvasEl = canvasRef.current;
      // 仅在画布区域或无输入焦点时处理，避免影响表单粘贴
      if (canvasEl && target && !canvasEl.contains(target) && document.activeElement !== document.body) {
        return;
      }
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;
      const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      event.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          void insertImageNode(file, { alt: "剪贴板图片" });
        }
      });
    },
    [canvasRef, insertImageNode, isCanvasActive, isLocked],
  );

  useEffect(() => {
    if (!isCanvasActive) return;
    const handler = (event: ClipboardEvent) => handlePasteImage(event);
    window.addEventListener("paste", handler);
    return () => {
      window.removeEventListener("paste", handler);
    };
  }, [handlePasteImage, isCanvasActive]);

  return {
    handleCanvasPointerMove,
    handleCanvasDragOver,
    handleCanvasDrop,
  };
}
