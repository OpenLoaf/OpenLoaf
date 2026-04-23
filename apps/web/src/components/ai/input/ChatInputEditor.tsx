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
  useState,
  type RefObject,
} from "react";
import { unescapeAttachmentPath } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { getFileLabel } from "./chat-input-utils";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|heif)$/i;
const HTTP_URL_RE = /^https?:\/\//i;

// ─── Constants ──────────────────────────────────────────────────────
const CHIP_CLASS = "ol-mention-chip";
const SKILL_CHIP_CLASS = "ol-skill-chip";
const AGENT_CHIP_CLASS = "ol-agent-chip";
const FILE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'style="flex-shrink:0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
  '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
const SKILL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'style="flex-shrink:0"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';
const AGENT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
  'style="flex-shrink:0;display:inline-block"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

// 高度锁定 18px（总高 = padding 1+1 + line-height 16 = 18），略小于编辑器 leading-5 (20px)，
// 避免 chip 比行盒高，导致 caret 在 chip 左右侧高度不一致。
// vertical-align:middle 让 chip 在 CJK 文本中视觉居中，取代默认 baseline。
// vertical-align 不用 middle —— 实测 middle 会让 chip 比 CJK 字符下沉约 1.1px。
// 用负 em 手动把 chip 上移，使其视觉中线对齐 13px CJK 文本的几何中线。
const CHIP_BASE_STYLES = "display:inline-flex;align-items:center;gap:3px;padding:1px 6px;margin:0 1px;border-radius:4px;font-size:12px;font-weight:500;line-height:16px;vertical-align:-0.2em;cursor:pointer;user-select:none;white-space:nowrap;max-width:320px;transition:background-color .15s;border:0";

const CHIP_STYLES = `
.${CHIP_CLASS}{${CHIP_BASE_STYLES};background:var(--ol-blue-bg);color:var(--ol-blue)}
.${CHIP_CLASS}:hover{background:var(--ol-blue-bg-hover)}
.${CHIP_CLASS}>span{overflow:hidden;text-overflow:ellipsis}
.${SKILL_CHIP_CLASS}{${CHIP_BASE_STYLES};background:var(--ol-skill-chip-bg);color:var(--ol-skill-chip-text)}
.${SKILL_CHIP_CLASS}:hover{background:var(--ol-skill-chip-bg-hover)}
.${SKILL_CHIP_CLASS}[data-builtin="true"]{cursor:default}
.${SKILL_CHIP_CLASS}[data-builtin="true"]:hover{background:var(--ol-skill-chip-bg)}
.${SKILL_CHIP_CLASS}>span{overflow:hidden;text-overflow:ellipsis}
.${AGENT_CHIP_CLASS}{${CHIP_BASE_STYLES};background:var(--ol-amber-bg);color:var(--ol-amber)}
.${AGENT_CHIP_CLASS}:hover{background:var(--ol-amber-bg-hover)}
.${AGENT_CHIP_CLASS}>span{overflow:hidden;text-overflow:ellipsis}
`;

const STYLE_TAG_ID = "ol-chip-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  // Remove legacy style tags (injected without id by older code / prior HMR cycles).
  for (const s of document.querySelectorAll("style")) {
    if (!s.id && s.textContent?.includes("ol-mention-chip")) s.remove();
  }
  let el = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_TAG_ID;
    document.head.appendChild(el);
  }
  // Always overwrite to keep in sync after HMR.
  el.textContent = CHIP_STYLES;
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

/** Convert a value string to innerHTML with inline mention/skill chip elements. */
function valueToHtml(value: string, builtinSkillNames?: ReadonlySet<string>): string {
  if (!value) return "";
  let html = "";
  let lastIndex = 0;
  // Match <system-tag type="attachment" path="..." /> file mentions,
  // /skill/[xxx|yyy] or /skill/[xxx] skill commands (new format), legacy /skill/xxx
  // skill commands, and @agents/.../pm agent mentions.
  const re = /<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>|\/skill\/\[([\w-]+)(?:\|([^\]]*))?\]|\/skill\/([\w-]+)(?=\s|[^\x00-\x7F])|@agents\/([^/\s]+)\/pm(?=\s|$)/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: intentional loop pattern
  while ((match = re.exec(value)) !== null) {
    html += escapeHtml(value.slice(lastIndex, match.index));
    const token = match[0];
    if (match[1] !== undefined) {
      // File mention: <system-tag type="attachment" path="..." [name="..."] ... />
      const parsed = parseAttachmentToken(token);
      const label = parsed?.name || getFileLabel(parsed?.path ?? "");
      html +=
        `<span class="${CHIP_CLASS}" data-token="${escapeAttr(token)}" contenteditable="false">` +
        `${FILE_ICON_SVG}<span>${escapeHtml(label)}</span>` +
        "</span>";
    } else if (match[5] !== undefined) {
      // Agent mention: @agents/项目名/pm
      const projectName = match[5];
      const afterTokenIdx = match.index + token.length;
      const hasTrailingSpace = value[afterTokenIdx] === " ";
      const dataToken = hasTrailingSpace ? `${token} ` : token;
      html +=
        `<span class="${AGENT_CHIP_CLASS}" data-token="${escapeAttr(dataToken)}" contenteditable="false">` +
        `${AGENT_ICON_SVG}<span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(projectName)}/管理员</span>` +
        "</span>";
      lastIndex = afterTokenIdx + (hasTrailingSpace ? 1 : 0);
      continue;
    } else if (match[2] !== undefined) {
      // New format skill command: /skill/[originalName|displayName] or /skill/[originalName]
      const originalName = match[2];
      const displayName = match[3] || originalName;
      const afterTokenIdx = match.index + token.length;
      const hasTrailingSpace = value[afterTokenIdx] === " ";
      const dataToken = hasTrailingSpace ? `${token} ` : token;
      const builtinAttr = builtinSkillNames?.has(originalName) ? ' data-builtin="true"' : "";
      html +=
        `<span class="${SKILL_CHIP_CLASS}" data-token="${escapeAttr(dataToken)}"${builtinAttr} contenteditable="false">` +
        `${SKILL_ICON_SVG}<span>${escapeHtml(displayName)}</span>` +
        "</span>";
      lastIndex = afterTokenIdx + (hasTrailingSpace ? 1 : 0);
      continue;
    } else {
      // Legacy skill command: /skill/xxx
      const skillName = match[4];
      const afterTokenIdx = match.index + token.length;
      const hasTrailingSpace = value[afterTokenIdx] === " ";
      const dataToken = hasTrailingSpace ? `${token} ` : token;
      const builtinAttr = builtinSkillNames?.has(skillName) ? ' data-builtin="true"' : "";
      html +=
        `<span class="${SKILL_CHIP_CLASS}" data-token="${escapeAttr(dataToken)}"${builtinAttr} contenteditable="false">` +
        `${SKILL_ICON_SVG}<span>${escapeHtml(skillName)}</span>` +
        "</span>";
      lastIndex = afterTokenIdx + (hasTrailingSpace ? 1 : 0);
      continue;
    }
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
      if (el.classList.contains(CHIP_CLASS) || el.classList.contains(SKILL_CHIP_CLASS) || el.classList.contains(AGENT_CHIP_CLASS)) {
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

/** Parse a full attachment tag; return path + optional name (friendly label). */
function parseAttachmentToken(token: string): { path: string; name?: string } | null {
  const m = token.match(/^<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>$/);
  if (!m) return null;
  const attrs = m[1] ?? "";
  const attrRe = /(\w+)="([^"]*)"/g;
  let path = "";
  let name: string | undefined;
  let it: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration idiom
  while ((it = attrRe.exec(attrs)) !== null) {
    if (it[1] === "path") path = unescapeAttachmentPath(it[2] ?? "");
    else if (it[1] === "name") name = unescapeAttachmentPath(it[2] ?? "");
  }
  if (!path) return null;
  return name ? { path, name } : { path };
}

/** Create a chip DOM element from a mention token. */
function createChipElement(token: string): HTMLSpanElement {
  const parsed = parseAttachmentToken(token);
  const label = parsed?.name || getFileLabel(parsed?.path ?? token);
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
  onSkillChipClick?: (skillName: string) => void;
  builtinSkillNames?: ReadonlySet<string>;
  onPasteFiles?: (files: File[]) => void;
  placeholder?: string;
  className?: string;
  /** Use larger text and height (for full-page centered layout). */
  large?: boolean;
  /** Project id for attachment preview resolution. */
  projectId?: string;
  /** Session id for ${CURRENT_CHAT_DIR} template resolution in attachment previews. */
  sessionId?: string;
  ref?: RefObject<ChatInputEditorHandle | null>;
}

// ─── Component ──────────────────────────────────────────────────────
export function ChatInputEditor({
  value,
  onChange,
  onKeyDown,
  onChipClick,
  onSkillChipClick,
  builtinSkillNames,
  onPasteFiles,
  placeholder,
  className,
  large,
  projectId,
  sessionId,
  ref,
}: ChatInputEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const composingRef = useRef(false);
  const suppressSyncRef = useRef(false);
  const [preview, setPreview] = useState<{ src: string; left: number; top: number } | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

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

      // 只用 ZWSP 作为 caret 锚点，不再根据 ensureTrailingSpace 附加可见空格（历史代码债）。
      const trailing = document.createTextNode("\u200B");
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
      return !el.textContent?.trim() && !el.querySelector(`.${CHIP_CLASS},.${SKILL_CHIP_CLASS},.${AGENT_CHIP_CLASS}`);
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
      el.innerHTML = valueToHtml(value, builtinSkillNames);
      valueRef.current = value;
      // Place caret at end after external value change (e.g. skill selection).
      const sel = window.getSelection();
      if (sel && el.ownerDocument.activeElement === el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else if (builtinSkillNames) {
      // Re-render chips when builtinSkillNames becomes available (initial async load).
      el.innerHTML = valueToHtml(value, builtinSkillNames);
      valueRef.current = value;
    }
  }, [value, builtinSkillNames]);

  const [domEmpty, setDomEmpty] = useState(true);

  const updateDomEmpty = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const hasText = !!(el.textContent?.length);
    const hasChip = !!el.querySelector(`.${CHIP_CLASS},.${SKILL_CHIP_CLASS},.${AGENT_CHIP_CLASS}`);
    setDomEmpty(!hasText && !hasChip);
  }, []);

  // ── Input handler ──
  const handleInput = useCallback(() => {
    if (composingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    triggerChange(el);
    updateDomEmpty();
  }, [triggerChange, updateDomEmpty]);

  // ── Hover handler (image attachment preview) ──
  const handleMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const chip = target.closest(`.${CHIP_CLASS}`) as HTMLElement | null;
      if (!chip?.dataset.token) {
        setPreview(null);
        return;
      }
      const parsed = parseAttachmentToken(chip.dataset.token);
      if (!parsed) {
        setPreview(null);
        return;
      }
      const pathOnly = parsed.path.split("?")[0] ?? "";
      if (!IMAGE_EXT_RE.test(pathOnly)) {
        setPreview(null);
        return;
      }
      const src = HTTP_URL_RE.test(parsed.path)
        ? parsed.path
        : getPreviewEndpoint(parsed.path, { projectId, sessionId });
      const rect = chip.getBoundingClientRect();
      setPreview((prev) => {
        if (prev?.src !== src) setPreviewLoaded(false);
        return { src, left: rect.left, top: rect.top };
      });
    },
    [projectId, sessionId],
  );
  const handleMouseOut = useCallback((e: React.MouseEvent) => {
    const related = e.relatedTarget as Node | null;
    const chip = (e.target as HTMLElement).closest(`.${CHIP_CLASS}`);
    if (chip && related && chip.contains(related)) return;
    setPreview(null);
  }, []);

  // ── Click handler (chip clicks) ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const chip = target.closest(`.${CHIP_CLASS}`) as HTMLElement | null;
      if (chip?.dataset.token && onChipClick) {
        e.preventDefault();
        const token = chip.dataset.token;
        // 新格式 system-tag：用 path 属性；兼容旧 @[...] 格式走 slice 回退。
        const parsed = parseAttachmentToken(token);
        const tokenRef = parsed ? parsed.path : token.slice(2, -1);
        onChipClick(tokenRef);
        return;
      }
      const skillChip = target.closest(`.${SKILL_CHIP_CLASS}`) as HTMLElement | null;
      if (skillChip?.dataset.token && onSkillChipClick) {
        if (skillChip.dataset.builtin === "true") {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const raw = skillChip.dataset.token.trim();
        // Extract originalName from /skill/[originalName|...] or /skill/[originalName] or legacy /skill/name
        const bracketMatch = /^\/skill\/\[([\w-]+)/.exec(raw);
        const skillName = bracketMatch ? bracketMatch[1] : raw.replace(/^\/skill\//, "");
        onSkillChipClick(skillName);
      }
    },
    [onChipClick, onSkillChipClick],
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
      const el = editorRef.current;
      if (!el) return;

      // Check if pasted text contains tokens that need chip rendering
      const hasTokens = /@\[(?:\[[^\]]*\]|[^\]])+\]|\/skill\/[\[a-zA-Z]|@agents\//.test(text);
      if (hasTokens) {
        // Merge pasted text into the value string and let valueToHtml render chips
        const currentValue = domToValue(el);
        const sel = window.getSelection();
        // Estimate caret offset in the plain-text value
        let caretOffset = currentValue.length;
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0);
          const preRange = document.createRange();
          preRange.selectNodeContents(el);
          preRange.setEnd(range.startContainer, range.startOffset);
          caretOffset = preRange.toString().length;
        }
        const before = currentValue.slice(0, caretOffset);
        const after = currentValue.slice(caretOffset);
        const newValue = before + text + after;
        valueRef.current = newValue;
        // Do NOT suppress sync — let useEffect re-render via valueToHtml
        onChange(newValue);
        return;
      }

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
      triggerChange(el);
      updateDomEmpty();
    },
    [onPasteFiles, triggerChange, updateDomEmpty],
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    // 输入法激活时立即隐藏 placeholder，避免拼音与提示文字重叠
    setDomEmpty(false);
  }, []);
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    handleInput();
    // compositionend 后重新从 DOM 读取真实状态
    updateDomEmpty();
  }, [handleInput, updateDomEmpty]);

  // 同步外部 value 变化（如清空输入框）
  useEffect(() => {
    if (!composingRef.current) {
      updateDomEmpty();
    }
  }, [value, updateDomEmpty]);

  const isEmpty = domEmpty;

  return (
    <div className="relative">
      {isEmpty && placeholder && (
        <div
          className={cn(
            "absolute inset-0 pointer-events-none pl-4 pr-3 py-2.5 text-muted-foreground truncate",
            large ? "text-base leading-6" : "text-sm leading-5",
          )}
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
          large
            ? "min-h-28 max-h-64 overflow-y-auto text-[15px] leading-6 px-3.5 py-3"
            : "min-h-16 max-h-48 overflow-y-auto text-[13px] leading-5 px-3 py-2.5",
          className,
        )}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      {preview && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-md border border-border bg-popover shadow-lg p-1 -translate-y-full"
          style={{ left: preview.left, top: preview.top - 6 }}
        >
          <div className="relative min-w-[80px] min-h-[80px] flex items-center justify-center">
            {!previewLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
              </div>
            )}
            {/** biome-ignore lint/performance/noImgElement: hover preview */}
            <img
              src={preview.src}
              alt=""
              className={cn(
                "block max-w-[160px] max-h-[160px] object-contain rounded-sm transition-opacity duration-150",
                previewLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={() => setPreviewLoaded(true)}
              onError={() => setPreview(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
