/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getBoardDisplayName,
  getDocDisplayName,
  getDisplayFileName,
  isBoardFileExt,
  isBoardFolderName,
  isDocFolderName,
} from "@/lib/file-name";
import { resolveEntryExt } from "./FileSystemEntryVisual";
import { type FileSystemEntry } from "../utils/file-system-utils";

/** Render a file name with suffix-preserving truncation. */
const FileSystemEntryName = memo(function FileSystemEntryName({
  name,
  kind,
  ext,
}: {
  name: string;
  kind: FileSystemEntry["kind"];
  ext?: string;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  // 用于测量文本高度的隐藏节点。
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const nameInfo = useMemo(() => {
    const normalizedExt = resolveEntryExt(kind, name, ext);
    const displayName = (() => {
      if (kind === "folder" && isBoardFolderName(name)) {
        return getBoardDisplayName(name);
      }
      if (kind === "folder" && isDocFolderName(name)) {
        return getDocDisplayName(name);
      }
      if (kind === "file") {
        return getDisplayFileName(name, normalizedExt);
      }
      return name;
    })();
    if (kind !== "file" || !normalizedExt || isBoardFileExt(normalizedExt)) {
      return {
        prefix: displayName,
        suffix: "",
        fullName: displayName,
      };
    }
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex >= name.length - 1) {
      return {
        prefix: displayName,
        suffix: "",
        fullName: displayName,
      };
    }
    return {
      prefix: name.slice(0, dotIndex),
      suffix: name.slice(dotIndex),
      fullName: name,
    };
  }, [ext, kind, name]);
  // 缓存计算后的显示文本，避免频繁触发布局测量。
  const [labelText, setLabelText] = useState(nameInfo.fullName);

  /** Ensure the hidden measurement node exists. */
  const ensureMeasureElement = useCallback((host: HTMLElement) => {
    if (measureRef.current) return measureRef.current;
    const span = document.createElement("span");
    span.setAttribute("data-entry-name-measure", "true");
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";
    span.style.left = "0";
    span.style.top = "0";
    span.style.padding = "0";
    span.style.margin = "0";
    span.style.border = "0";
    span.style.boxSizing = "border-box";
    span.style.whiteSpace = "normal";
    span.style.overflowWrap = "break-word";
    span.style.wordBreak = "break-word";
    span.style.zIndex = "-1";
    const container = host.parentElement ?? document.body;
    container.appendChild(span);
    measureRef.current = span;
    return span;
  }, []);

  /** Recalculate the label text so the suffix stays visible. */
  const recomputeLabel = useCallback(() => {
    const labelEl = labelRef.current;
    if (!labelEl) return;
    if (!nameInfo.suffix) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const width = labelEl.clientWidth;
    if (!width) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const measureEl = ensureMeasureElement(labelEl);
    const computed = window.getComputedStyle(labelEl);
    const fontSize = parseFloat(computed.fontSize || "0");
    const parsedLineHeight = parseFloat(computed.lineHeight || "");
    const lineHeight = Number.isNaN(parsedLineHeight)
      ? Math.ceil(fontSize * 1.4)
      : parsedLineHeight;
    if (!lineHeight) {
      setLabelText(nameInfo.fullName);
      return;
    }
    // 同步文本样式与宽度，确保测量结果准确。
    measureEl.style.width = `${width}px`;
    measureEl.style.font = computed.font;
    measureEl.style.letterSpacing = computed.letterSpacing;
    measureEl.style.textTransform = computed.textTransform;
    measureEl.style.textAlign = computed.textAlign;
    measureEl.style.lineHeight = `${lineHeight}px`;
    const maxHeight = lineHeight * 2 + 0.5;
    const fits = (text: string) => {
      measureEl.textContent = text;
      return measureEl.getBoundingClientRect().height <= maxHeight;
    };
    if (fits(nameInfo.fullName)) {
      setLabelText(nameInfo.fullName);
      return;
    }
    const prefixChars = Array.from(nameInfo.prefix);
    let low = 0;
    let high = prefixChars.length;
    let best = `...${nameInfo.suffix}`;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${prefixChars.slice(0, mid).join("")}...${nameInfo.suffix}`;
      if (fits(candidate)) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    setLabelText(best);
  }, [ensureMeasureElement, nameInfo]);

  useLayoutEffect(() => {
    recomputeLabel();
  }, [recomputeLabel]);

  useEffect(() => {
    if (!nameInfo.suffix) return;
    const labelEl = labelRef.current;
    if (!labelEl) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        recomputeLabel();
      });
    });
    observer.observe(labelEl);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [recomputeLabel]);

  useEffect(() => {
    return () => {
      if (measureRef.current) {
        measureRef.current.remove();
        measureRef.current = null;
      }
    };
  }, []);

  return (
    <span
      ref={labelRef}
      className="line-clamp-2 min-h-[2rem] w-full break-words leading-4"
    >
      {labelText}
    </span>
  );
});
FileSystemEntryName.displayName = "FileSystemEntryName";

export { FileSystemEntryName };
