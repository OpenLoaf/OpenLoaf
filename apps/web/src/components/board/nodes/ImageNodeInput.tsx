"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Value } from "platejs";
import { setValue } from "platejs";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Editor as SlateEditor, type BaseEditor } from "slate";
import { ChevronUp } from "lucide-react";
import { useTabs } from "@/hooks/use-tabs";
import { useProjects } from "@/hooks/use-projects";
import { cn } from "@/lib/utils";
import { handleChatMentionPointerDown } from "@/lib/chat/mention-pointer";
import {
  buildMentionNode,
  getPlainTextValue,
  parseChatValue,
  serializeChatValue,
} from "@/components/chat/chat-input-utils";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { Button } from "@/components/ui/button";
import SelectMode from "@/components/chat/input/SelectMode";
import { useBoardContext } from "@/components/board/core/BoardProvider";

/** Target zoom level when focusing the image node input. */
const INPUT_FOCUS_ZOOM = 1;
/** Animation duration for viewport focus (ms). */
const VIEWPORT_FOCUS_DURATION = 500;
/** Fixed input height in world units (px before zoom). */
const IMAGE_NODE_INPUT_HEIGHT = 94;
/** Vertical gap between the image and input (px before zoom). */
const IMAGE_NODE_INPUT_GAP = 12;
/** Vertical gap used by the selection toolbar above nodes (screen px). */
const NODE_TOOLBAR_GAP = 12;
/** Top padding to keep the toolbar off the canvas edge (screen px). */
const VIEWPORT_TOP_PADDING = 8;
/** Bottom padding to keep the input above the board toolbar (screen px). */
const VIEWPORT_BOTTOM_PADDING = 8;

export type ImageNodeInputProps = {
  /** Target image node id for viewport focus. */
  nodeId: string;
  /** Optional wrapper class name. */
  className?: string;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Submit handler for input content. */
  onSubmit?: (value: string) => void;
};

/** Render a chat-style input for image nodes. */
export function ImageNodeInput({
  nodeId,
  className,
  placeholder = "Type a note...",
  onSubmit,
}: ImageNodeInputProps) {
  const editorId = useId();
  /** Current input value. */
  const [inputValue, setInputValue] = useState("");
  /** Plain text value used for button state. */
  const [plainTextValue, setPlainTextValue] = useState(() =>
    getPlainTextValue(parseChatValue(""))
  );
  /** Whether the input editor is focused. */
  const [isInputFocused, setIsInputFocused] = useState(false);
  /** Track the last serialized value to avoid redundant editor updates. */
  const lastSerializedRef = useRef(inputValue);
  /** Active viewport animation frame id. */
  const viewportAnimationRef = useRef<number | null>(null);
  const { data: projects = [] } = useProjects({ enabled: isInputFocused });
  const { engine } = useBoardContext();
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabs((state) => state.pushStackItem);
  const plugins = useMemo(
    () => [ParagraphPlugin.withComponent(ParagraphElement), ...MentionKit, ...ClipboardKit],
    []
  );
  const initialValue = useMemo(() => parseChatValue(inputValue), []);
  const editor = usePlateEditor({
    id: `image-node-input-${editorId}`,
    plugins,
    value: initialValue,
  });
  const canSubmit = plainTextValue.trim().length > 0;

  /** Handle pointer events on mention chips. */
  const handleMentionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, projects, pushStackItem]
  );

  /** Animate the viewport towards a target zoom + offset. */
  const animateViewportTo = useCallback(
    (targetZoom: number, targetOffset: [number, number]) => {
      const { zoom: startZoom, offset: startOffset } = engine.viewport.getState();
      if (viewportAnimationRef.current) {
        window.cancelAnimationFrame(viewportAnimationRef.current);
        viewportAnimationRef.current = null;
      }
      const needsUpdate =
        Math.abs(startZoom - targetZoom) > 0.0001 ||
        Math.abs(startOffset[0] - targetOffset[0]) > 0.5 ||
        Math.abs(startOffset[1] - targetOffset[1]) > 0.5;
      if (!needsUpdate) return;
      const duration = VIEWPORT_FOCUS_DURATION;
      const startTime = window.performance?.now?.() ?? Date.now();
      const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOutCubic(progress);
        const nextZoom = startZoom + (targetZoom - startZoom) * eased;
        const nextOffset: [number, number] = [
          startOffset[0] + (targetOffset[0] - startOffset[0]) * eased,
          startOffset[1] + (targetOffset[1] - startOffset[1]) * eased,
        ];
        // 逻辑：逐帧插值缩放与偏移，保持平滑过渡。
        engine.viewport.setZoom(nextZoom);
        engine.setViewportOffset(nextOffset);
        if (progress >= 1) {
          viewportAnimationRef.current = null;
          return;
        }
        viewportAnimationRef.current = window.requestAnimationFrame(step);
      };
      viewportAnimationRef.current = window.requestAnimationFrame(step);
    },
    [engine]
  );

  /** Center the image node input inside the viewport. */
  const centerInputInViewport = useCallback(() => {
    const element = engine.doc.getElementById(nodeId);
    const canvas = engine.getContainer();
    if (!element || element.kind !== "node" || !canvas) return;
    const [x, y, w, h] = element.xywh;
    const inputCenterWorld: [number, number] = [
      x + w / 2,
      y + h + IMAGE_NODE_INPUT_GAP + IMAGE_NODE_INPUT_HEIGHT / 2,
    ];
    const { size } = engine.viewport.getState();
    if (size[0] <= 0 || size[1] <= 0) return;
    const { min, max } = engine.viewport.getZoomLimits();
    const targetZoom = Math.min(max, Math.max(min, INPUT_FOCUS_ZOOM));
    const desiredCenterY = size[1] / 2;
    const canvasRect = canvas.getBoundingClientRect();
    const toolbarEl = canvas.querySelector<HTMLElement>("[data-node-toolbar]");
    const toolbarHeight = toolbarEl?.getBoundingClientRect().height ?? 0;
    const toolbarGap = toolbarEl ? NODE_TOOLBAR_GAP : 0;
    const minCenterY =
      VIEWPORT_TOP_PADDING +
      toolbarHeight +
      toolbarGap +
      (h + IMAGE_NODE_INPUT_GAP + IMAGE_NODE_INPUT_HEIGHT / 2) * targetZoom;
    const bottomToolbarEl = canvas.querySelector<HTMLElement>("[data-canvas-toolbar]");
    let bottomSafeY = size[1] - VIEWPORT_BOTTOM_PADDING;
    if (bottomToolbarEl) {
      bottomSafeY =
        bottomToolbarEl.getBoundingClientRect().top -
        canvasRect.top -
        VIEWPORT_BOTTOM_PADDING;
    }
    const maxCenterY =
      bottomSafeY - (IMAGE_NODE_INPUT_HEIGHT / 2) * targetZoom;
    let targetCenterY = desiredCenterY;
    // 逻辑：优先让输入框居中，若上方溢出则向下移动，且不允许被底部工具栏遮挡。
    if (targetCenterY < minCenterY) {
      targetCenterY = minCenterY;
    }
    if (targetCenterY > maxCenterY) {
      targetCenterY = maxCenterY;
    }
    const nextOffset: [number, number] = [
      size[0] / 2 - inputCenterWorld[0] * targetZoom,
      targetCenterY - inputCenterWorld[1] * targetZoom,
    ];
    // 逻辑：点击输入区后自动将输入框定位到视口安全区域内。
    animateViewportTo(targetZoom, nextOffset);
  }, [animateViewportTo, engine, nodeId]);

  /** Handle pointer down events on the input area. */
  const handleInputPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleMentionPointerDown(event);
      if (event.defaultPrevented) return;
      if (!event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, [role=\"button\"], a, input, select, textarea, [data-ignore-editor-focus]"
        )
      ) {
        return;
      }
      // 逻辑：下一帧再居中，避免抢占本次聚焦流程。
      window.requestAnimationFrame(() => {
        // 逻辑：仅在点击输入区时进入编辑状态。
        if (!editor.selection) {
          const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
          editor.tf.select(endPoint);
        }
        editor.tf.focus();
        centerInputInViewport();
      });
    },
    [centerInputInViewport, editor, handleMentionPointerDown]
  );

  /** Insert a file reference as a mention node. */
  const insertFileMention = useCallback(
    (fileRef: string) => {
      if (!editor) return;
      if (!editor.selection) {
        const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
        editor.tf.select(endPoint);
      }
      editor.tf.focus();
      editor.tf.insertNodes(buildMentionNode(fileRef), { select: true });
      editor.tf.insertText(" ");
    },
    [editor]
  );

  /** Sync editor value into serialized string state. */
  const handleValueChange = useCallback(
    (nextValue: Value) => {
      const serialized = serializeChatValue(nextValue);
      lastSerializedRef.current = serialized;
      setInputValue(serialized);
      setPlainTextValue(getPlainTextValue(nextValue));
    },
    []
  );

  /** Submit the current input value. */
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      onSubmit?.(trimmed);
      setInputValue("");
      setPlainTextValue("");
    },
    [inputValue, onSubmit]
  );

  /** Submit when pressing Enter without Shift. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit(event as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  useEffect(() => {
    if (!editor) return;
    if (inputValue === lastSerializedRef.current) return;
    const nextValue = parseChatValue(inputValue);
    setValue(editor, nextValue);
    setPlainTextValue(getPlainTextValue(nextValue));
    lastSerializedRef.current = inputValue;
  }, [editor, inputValue]);

  useEffect(() => {
    return () => {
      if (viewportAnimationRef.current) {
        window.cancelAnimationFrame(viewportAnimationRef.current);
        viewportAnimationRef.current = null;
      }
    };
  }, []);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "relative h-[94px] w-[360px] rounded-xl border border-border bg-card shadow-lg transition-colors",
        "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
        className
      )}
      onPointerDownCapture={handleInputPointerDownCapture}
    >
      <form
        className="flex h-full flex-col overflow-hidden"
        onSubmit={handleSubmit}
      >
        <div className="flex-1 px-2 pt-1.5 pb-2">
          <Plate
            editor={editor}
            onValueChange={({ value: nextValue }) => handleValueChange(nextValue)}
          >
            <EditorContainer className="h-full bg-transparent">
              <Editor
                variant="none"
                className="h-full min-h-0 text-[13px] leading-5"
                placeholder={placeholder}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                data-teatime-chat-input="true"
              />
            </EditorContainer>
          </Plate>
        </div>

        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <SelectMode className="max-w-[10rem]" />
            <Button
              type={canSubmit ? "submit" : "button"}
              size="icon"
              disabled={!canSubmit}
              className={cn(
                "h-8 w-8 rounded-full shrink-0 shadow-none transition-colors",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground opacity-50"
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
