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

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";
import { getFileLabel } from "./chat-input-utils";

// ─── Constants ──────────────────────────────────────────────────────
const CHIP_CLASS = "ol-mention-chip";
const FILE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'style="flex-shrink:0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
  '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

const CHIP_STYLES = `
.${CHIP_CLASS}{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;margin:0 1px;border-radius:4px;background:rgb(219 234 254/.8);color:rgb(29 78 216);font-size:12px;font-weight:500;line-height:18px;vertical-align:baseline;cursor:pointer;user-select:none;white-space:nowrap;max-width:200px;transition:background-color .15s}
.${CHIP_CLASS}:hover{background:rgb(191 219 254)}
.${CHIP_CLASS}>span{overflow:hidden;text-overflow:ellipsis}
.dark .${CHIP_CLASS}{background:rgb(30 58 138/.4);color:rgb(147 197 253)}
.dark .${CHIP_CLASS}:hover{background:rgb(30 58 138/.6)}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = CHIP_STYLES;
  document.head.appendChild(style);
}

// ─── HTML helpers ───────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert a value string to innerHTML with inline mention chip elements. */
function valueToHtml(value: string): string {
  if (!value) return "";
  let html = "";
  let lastIndex = 0;
  const re = /@\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional loop pattern
  while ((match = re.exec(value)) !== null) {
    html += escapeHtml(value.slice(lastIndex, match.index));
    const token = match[0];
    const ref = match[1];
    const label = getFileLabel(ref);
    html +=
      `<span class="${CHIP_CLASS}" data-token="${escapeAttr(token)}" contenteditable="false">` +
      `${FILE_ICON_SVG}<span>${escapeHtml(label)}</span>` +
      "</span>";
    lastIndex = match.index + token.length;
  }
  html += escapeHtml(value.slice(lastIndex));
  return html;
}

/** Walk DOM tree and reconstruct the value string. */
function domToValue(node: Node): string {
  let result = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.classList.contains(CHIP_CLASS)) {
        result += el.dataset.token ?? "";
      } else if (el.tagName === "BR") {
        result += "\n";
      } else if (el.tagName === "DIV" || el.tagName === "P") {
        const inner = domToValue(el);
        if (inner) {
          if (result && !result.endsWith("\n")) result += "\n";
          result += inner;
        }
      } else {
        result += domToValue(el);
      }
    }
  }
  return result;
}

/** Create a chip DOM element from a mention token. */
function createChipElement(token: string): HTMLSpanElement {
  const ref = token.slice(2, -1);
  const label = getFileLabel(ref);
  const span = document.createElement("span");
  span.className = CHIP_CLASS;
  span.dataset.token = token;
  span.contentEditable = "false";
  span.innerHTML = `${FILE_ICON_SVG}<span>${escapeHtml(label)}</span>`;
  return span;
}

/** Get the character immediately before the current caret position. */
function getCharBefore(range: Range): string {
  const clone = range.cloneRange();
  clone.collapse(true);
  if (clone.startOffset > 0 && clone.startContainer.nodeType === Node.TEXT_NODE) {
    return (clone.startContainer.textContent ?? "")[clone.startOffset - 1] ?? "";
  }
  const prev =
    clone.startContainer.nodeType === Node.TEXT_NODE
      ? clone.startContainer.previousSibling
      : clone.startOffset > 0
        ? clone.startContainer.childNodes[clone.startOffset - 1]
        : null;
  if (!prev) return "";
  if (prev.nodeType === Node.TEXT_NODE) return (prev.textContent ?? "").slice(-1);
  return "";
}

// ─── Public types ───────────────────────────────────────────────────
export interface ChatInputEditorHandle {
  /** Focus the editor. "end" moves caret to end; "keep" preserves current position. */
  focus: (position?: "keep" | "end") => void;
  /** Insert plain text at the current caret position. */
  insertText: (
    text: string,
    options?: { ensureLeadingSpace?: boolean; ensureTrailingSpace?: boolean },
  ) => void;
  /** Insert a mention chip at the current caret position. Token format: @[path]. */
  insertMention: (
    token: string,
    options?: { ensureLeadingSpace?: boolean; ensureTrailingSpace?: boolean },
  ) => void;
  /** Get the underlying DOM element. */
  getElement: () => HTMLDivElement | null;
  /** Read current value from the DOM. */
  getValue: () => string;
  /** Whether the editor has no visible content. */
  isEmpty: () => boolean;
}

interface ChatInputEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onChipClick?: (ref: string) => void;
  onPasteFiles?: (files: File[]) => void;
  placeholder?: string;
  className?: string;
  ref?: RefObject<ChatInputEditorHandle | null>;
}

// ─── Component ──────────────────────────────────────────────────────
export function ChatInputEditor({
  value,
  onChange,
  onKeyDown,
  onChipClick,
  onPasteFiles,
  placeholder,
  className,
  ref,
}: ChatInputEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const composingRef = useRef(false);
  const suppressSyncRef = useRef(false);

  useEffect(() => {
    ensureStyles();
  }, []);

  const triggerChange = useCallback(
    (el: HTMLDivElement) => {
      const newValue = domToValue(el);
      valueRef.current = newValue;
      suppressSyncRef.current = true;
      onChange(newValue);
    },
    [onChange],
  );

  // ── Imperative handle ──
  useImperativeHandle(ref, () => ({
    focus(position = "keep") {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (position === "end") {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },

    insertText(text, options) {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);

      let insert = text;
      if (options?.ensureLeadingSpace) {
        const before = getCharBefore(range);
        if (before && !/\s/.test(before)) insert = ` ${insert}`;
      }
      if (options?.ensureTrailingSpace && !insert.endsWith(" ")) {
        insert = `${insert} `;
      }

      range.deleteContents();
      const textNode = document.createTextNode(insert);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      triggerChange(el);
    },

    insertMention(token, options) {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (options?.ensureLeadingSpace) {
        const before = getCharBefore(range);
        if (before && !/\s/.test(before)) {
          const sp = document.createTextNode(" ");
          range.insertNode(sp);
          range.setStartAfter(sp);
          range.collapse(true);
        }
      }

      range.deleteContents();
      const chip = createChipElement(token);
      range.insertNode(chip);

      const trailing = document.createTextNode(options?.ensureTrailingSpace ? " " : "\u200B");
      range.setStartAfter(chip);
      range.insertNode(trailing);
      range.setStartAfter(trailing);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      triggerChange(el);
    },

    getElement() {
      return editorRef.current;
    },

    getValue() {
      const el = editorRef.current;
      return el ? domToValue(el) : valueRef.current;
    },

    isEmpty() {
      const el = editorRef.current;
      if (!el) return !value;
      return !el.textContent?.trim() && !el.querySelector(`.${CHIP_CLASS}`);
    },
  }));

  // ── Value → DOM sync (only for external value changes) ──
  useEffect(() => {
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el || composingRef.current) return;
    const currentDom = domToValue(el);
    if (currentDom !== value) {
      el.innerHTML = valueToHtml(value);
      valueRef.current = value;
    }
  }, [value]);

  // ── Input handler ──
  const handleInput = useCallback(() => {
    if (composingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    triggerChange(el);
  }, [triggerChange]);

  // ── Click handler (chip clicks) ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const chip = target.closest(`.${CHIP_CLASS}`) as HTMLElement | null;
      if (chip?.dataset.token && onChipClick) {
        e.preventDefault();
        const tokenRef = chip.dataset.token.slice(2, -1);
        onChipClick(tokenRef);
      }
    },
    [onChipClick],
  );

  // ── Key handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      if (e.key === "Enter" && !e.shiftKey) {
        if (composingRef.current || e.nativeEvent.isComposing) return;
        e.preventDefault();
        const form = editorRef.current?.closest("form");
        if (form) {
          const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
          if (!btn?.disabled) form.requestSubmit();
        }
      }
    },
    [onKeyDown],
  );

  // ── Paste handler ──
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (onPasteFiles) {
        const items = e.clipboardData?.items;
        if (items) {
          const files: File[] = [];
          for (const item of items) {
            if (item.kind === "file") {
              const file = item.getAsFile();
              if (file) files.push(file);
            }
          }
          if (files.length > 0) {
            e.preventDefault();
            onPasteFiles(files);
            return;
          }
        }
      }
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      const el = editorRef.current;
      if (el) triggerChange(el);
    },
    [onPasteFiles, triggerChange],
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    handleInput();
  }, [handleInput]);

  const isEmpty = !value;

  return (
    <div className="relative">
      {isEmpty && placeholder && (
        <div
          className="absolute inset-0 pointer-events-none text-[13px] leading-5 px-3 py-2.5 text-muted-foreground truncate"
          aria-hidden="true"
        >
          {placeholder}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-slot="input-group-control"
        data-openloaf-chat-input="true"
        className={cn(
          "outline-none whitespace-pre-wrap break-words",
          "flex-1 rounded-none border-0 bg-transparent shadow-none",
          "min-h-16 max-h-48 overflow-y-auto",
          "text-[13px] leading-5 px-3 py-2.5",
          className,
        )}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    </div>
  );
}
