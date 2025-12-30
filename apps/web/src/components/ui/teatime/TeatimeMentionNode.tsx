"use client";

import * as React from "react";

import type { TMentionElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { KEYS } from "platejs";
import { X } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useFocused,
  useReadOnly,
  useSelected,
} from "platejs/react";

import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";

/** Render a mention chip with file reference styling. */
export function TeatimeMentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const element = props.element;
  const editor = useEditorRef();
  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();
  const match = element.value.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? element.value;
  const lineStart = match?.[2];
  const lineEnd = match?.[3];
  const label = baseValue.split("/").pop() || baseValue;
  const labelWithLines =
    lineStart && lineEnd ? `${label} ${lineStart}:${lineEnd}` : label;
  const isFileReference = baseValue.includes("/");

  /** Remove the mention element. */
  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) return;
    if (!isFileReference) return;
    const path = editor.api.findPath(element);
    if (!path) return;
    // 中文注释：只对文件引用显示删除按钮，点击后移除节点。
    editor.tf.removeNodes({ at: path });
    editor.tf.focus();
  };

  return (
    <PlateElement
      {...props}
      className={cn(
        "mx-0.5 inline-flex items-center justify-center gap-1 rounded-md bg-muted px-1 py-0.5 align-baseline text-[10px] font-medium",
        !readOnly && "cursor-pointer",
        selected && focused && "ring-1 ring-ring",
        element.children[0][KEYS.bold] === true && "font-bold",
        element.children[0][KEYS.italic] === true && "italic",
        element.children[0][KEYS.underline] === true && "underline"
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        "data-slate-value": element.value,
        "data-teatime-mention": "true",
        "data-mention-value": element.value,
        draggable: true,
      }}
    >
      {mounted ? (
        <>
          {props.prefix}
          {labelWithLines}
          {props.children}
        </>
      ) : (
        <>
          {props.children}
          {props.prefix}
          {labelWithLines}
        </>
      )}
      {!readOnly && isFileReference ? (
        <button
          type="button"
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleRemove}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </PlateElement>
  );
}
