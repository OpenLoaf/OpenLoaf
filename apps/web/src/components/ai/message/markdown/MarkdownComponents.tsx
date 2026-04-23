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
import type { Components } from "streamdown";
import MessageFile from "../tools/MessageFile";
import MarkdownCodeInline from "./MarkdownCodeInline";
import MarkdownTable from "./MarkdownTable";

/** Heuristic: href looks like a file reference, not a plain web link. */
function looksLikeFileHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  // 已带网络协议 / 伪协议的，都当作普通链接。
  if (/^(https?|mailto|tel|ftp|javascript|about|chrome|ws|wss):/i.test(href)) return false;
  // data:/blob: 直接当资源（含图片）处理。
  if (/^(data|blob):/i.test(href)) return true;
  // 带文件扩展名（1-8 位字母数字）或包含路径分隔符时视为文件。
  return /\.[a-zA-Z0-9]{1,8}(\?|#|$)/.test(href) || href.includes("/");
}

const CODE: Components["code"] = React.memo(function CODE(props: any) {
  return <MarkdownCodeInline {...props} />;
});

const TABLE: Components["table"] = React.memo(function TABLE(props: any) {
  return <MarkdownTable {...(props as React.ComponentProps<"table">)} />;
});

// Override list elements — streamdown generates dynamic classes (e.g. `list-inside`, `[li_&]:pl-6`)
// that Tailwind cannot scan at build time. We replace them with static classes known to Tailwind.
const UL: Components["ul"] = React.memo(function UL({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className="list-disc whitespace-normal pl-4 marker:text-muted-foreground"
      {...props}
    >
      {children}
    </ul>
  );
});

const OL: Components["ol"] = React.memo(function OL({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"ol">) {
  return (
    <ol
      className="list-decimal whitespace-normal pl-4 marker:text-muted-foreground"
      {...props}
    >
      {children}
    </ol>
  );
});

const LI: Components["li"] = React.memo(function LI({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li {...props}>
      {children}
    </li>
  );
});

const A: Components["a"] = React.memo(function A({
  children,
  className: _originalClass,
  href,
  ...props
}: React.ComponentProps<"a"> & { "data-incomplete"?: boolean }) {
  const isIncomplete = (props as any)["data-incomplete"] === true || (props as any)["data-incomplete"] === "true";
  if (!href || isIncomplete) {
    return <span className="font-medium text-primary underline">{children}</span>;
  }
  if (looksLikeFileHref(href)) {
    const title =
      typeof children === "string"
        ? children
        : Array.isArray(children) && typeof children[0] === "string"
          ? (children[0] as string)
          : undefined;
    return <MessageFile url={href} title={title} className="my-2" />;
  }
  return (
    <a
      className="wrap-anywhere break-all font-medium text-primary underline hover:underline"
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
});

const IMG: Components["img"] = React.memo(function IMG({
  src,
  alt,
  className: _originalClass,
  ...props
}: React.ComponentProps<"img"> & { "data-incomplete"?: boolean }) {
  const isIncomplete = (props as any)["data-incomplete"] === true || (props as any)["data-incomplete"] === "true";
  if (!src || isIncomplete) return null;
  const url = typeof src === "string" ? src : "";
  if (!url) return null;
  // ml-0 覆盖 Attachments grid 的 ml-auto，避免图片被推到右边。
  return <MessageFile url={url} title={alt || undefined} mediaType="image/*" className="my-0 ml-0" />;
});

/** 判断节点是否仅空白文本。 */
function isWhitespaceNode(node: React.ReactNode): boolean {
  return typeof node === "string" && node.trim() === "";
}

// markdown 解析会把独立的 ![]() 包进 <p>，而 MessageFile 是块级 div，
// 这种 <p><div/></p> 既触发 React 嵌套警告，又让图像继承段落的 my-2 空白。
// 如果整段仅含块级图片/附件，直接透传子节点；否则保留真正的 <p> 以维持 prose margin 合并。
const P: Components["p"] = React.memo(function P({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"p">) {
  const arr = React.Children.toArray(children).filter((c) => !isWhitespaceNode(c));
  const isBlockChild = (c: React.ReactNode): boolean => {
    if (!React.isValidElement(c)) return false;
    if (c.type === IMG) return true;
    // 文件型 A（渲染为 MessageFile 块级 div），判定 href 看起来像文件。
    if (c.type === A) {
      const href = (c.props as { href?: string } | null)?.href;
      return typeof href === "string" && looksLikeFileHref(href);
    }
    return false;
  };
  const onlyBlock = arr.length > 0 && arr.every(isBlockChild);
  if (onlyBlock) {
    return <>{children}</>;
  }
  return (
    <p {...props}>
      {children}
    </p>
  );
});

export const markdownComponents: Components = {
  code: CODE,
  table: TABLE,
  ul: UL,
  ol: OL,
  li: LI,
  a: A,
  img: IMG,
  p: P,
};
