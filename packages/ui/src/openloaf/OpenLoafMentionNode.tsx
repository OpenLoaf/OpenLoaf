/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
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
import { parseScopedProjectPath } from "@/components/project/filesystem/utils/file-system-utils";

/** Render a mention chip with file reference styling. */
export function OpenLoafMentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const element = props.element;
  const firstChild = element.children[0];
  const editor = useEditorRef();
  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();
  const rawValue = element.value ?? "";
  const normalizedValue =
    rawValue.startsWith("@[") && rawValue.endsWith("]")
      ? rawValue.slice(2, -1)
      : rawValue.startsWith("@") ? rawValue.slice(1) : rawValue;
  const match = normalizedValue.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalizedValue;
  const lineStart = match?.[2];
  const lineEnd = match?.[3];
  const parsed = parseScopedProjectPath(baseValue);
  const labelBase = parsed?.relativePath ?? baseValue;
  const label = labelBase.split("/").pop() || labelBase;
  const labelWithLines =
    lineStart && lineEnd ? `${label} ${lineStart}:${lineEnd}` : label;
  const isFileReference = Boolean(parsed);

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
        "mx-0.5 inline-flex items-center justify-center gap-1 rounded-md bg-muted px-1 py-0.5 align-baseline text-[10px] font-medium text-foreground",
        !readOnly && "cursor-pointer",
        selected && focused && "ring-1 ring-ring",
        firstChild?.[KEYS.bold] === true && "font-bold",
        firstChild?.[KEYS.italic] === true && "italic",
        firstChild?.[KEYS.underline] === true && "underline"
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        "data-slate-value": element.value,
        "data-openloaf-mention": "true",
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
