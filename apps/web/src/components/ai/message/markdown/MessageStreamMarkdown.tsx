"use client";

import type { CSSProperties, ForwardedRef } from "react";
import * as React from "react";
import { Streamdown, type StreamdownProps } from "streamdown";
import { cn } from "@/lib/utils";
import { preprocessChatText } from "../text-tokenizer";
import { markdownComponents } from "./MarkdownComponents";

/** Shared typography preset for chat-style streaming markdown content. */
export const MESSAGE_STREAM_MARKDOWN_CLASSNAME = cn(
  // Avoid `w-full` + horizontal margins causing width overflow.
  "min-w-0 w-full max-w-full px-1 font-sans prose prose-neutral dark:prose-invert break-words [overflow-wrap:anywhere]",
  // Base text settings
  "text-sm leading-relaxed",
  // Element spacing adjustments
  "prose-p:my-2 prose-p:leading-relaxed prose-p:first:mt-0 prose-p:last:mb-0",
  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:first:mt-0",
  "prose-h1:text-base prose-h2:text-[15px] prose-h3:text-sm prose-h4:text-sm",
  "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-li:marker:text-muted-foreground",
  // Code block styling (handled by components but resetting some defaults)
  "prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0 prose-pre:overflow-x-auto",
  // Inline code styling
  "prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:font-normal prose-code:bg-muted/50 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none",
  // Other elements
  "prose-blockquote:not-italic prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground",
  "prose-a:break-all prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
  "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto",
  // Ensure media never overflows the chat width.
  "prose-img:max-w-full prose-img:h-auto",
);

type MessageStreamMarkdownProps = Omit<
  StreamdownProps,
  "children" | "components" | "className"
> & {
  /** Raw markdown text coming from chat-like message parts. */
  markdown: string;
  /** Wrapper class names used for typography and layout. */
  className?: string;
  /** Optional inline styles for caller-controlled sizing/colors. */
  style?: CSSProperties;
  /** Extra class names applied to the inner Streamdown root. */
  contentClassName?: string;
};

/**
 * 流式文本逐步释放 hook。
 *
 * 当 isAnimating 时，新增文本以 rAF 逐步追加（每帧释放若干字符），
 * 避免 TCP 合并导致一大段文字瞬间出现。
 * 非 streaming 状态下直接返回完整文本。
 */
function useSmoothText(target: string, isAnimating: boolean): string {
  const [visible, setVisible] = React.useState(target);
  const targetRef = React.useRef(target);
  const visibleLenRef = React.useRef(target.length);
  const rafRef = React.useRef<number | null>(null);

  // 始终跟踪最新目标文本。
  targetRef.current = target;

  React.useEffect(() => {
    if (!isAnimating) {
      // 非流式时直接显示完整内容。
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      visibleLenRef.current = target.length;
      setVisible(target);
      return;
    }

    // 流式模式：启动 rAF 循环逐步追赶目标长度。
    const step = () => {
      const t = targetRef.current;
      const cur = visibleLenRef.current;
      if (cur >= t.length) {
        // 已追上目标，等待下一次目标变化再启动。
        rafRef.current = null;
        return;
      }
      // 每帧释放字符数：基础 3 字符，距离越远释放越快（避免延迟累积）。
      const gap = t.length - cur;
      const increment = Math.max(3, Math.ceil(gap / 8));
      const nextLen = Math.min(cur + increment, t.length);
      visibleLenRef.current = nextLen;
      setVisible(t.slice(0, nextLen));
      rafRef.current = requestAnimationFrame(step);
    };

    // 如果 rAF 循环未运行且有新内容，启动它。
    if (rafRef.current === null && visibleLenRef.current < target.length) {
      rafRef.current = requestAnimationFrame(step);
    }
  }, [target, isAnimating]);

  // 组件卸载时清理。
  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return visible;
}

/** Render chat-style streaming markdown with shared tokenizer and component mapping. */
function MessageStreamMarkdownInner(
  {
    markdown,
    className,
    style,
    contentClassName,
    parseIncompleteMarkdown = true,
    ...streamdownProps
  }: MessageStreamMarkdownProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isAnimating = Boolean(streamdownProps.isAnimating);
  const smoothMarkdown = useSmoothText(markdown, isAnimating);

  const normalizedMarkdown = React.useMemo(
    () => preprocessChatText(smoothMarkdown),
    [smoothMarkdown],
  );

  return (
    <div ref={ref} className={className} style={style}>
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          contentClassName,
        )}
        components={markdownComponents}
        parseIncompleteMarkdown={parseIncompleteMarkdown}
        {...streamdownProps}
      >
        {normalizedMarkdown}
      </Streamdown>
    </div>
  );
}

export const MessageStreamMarkdown = React.forwardRef(MessageStreamMarkdownInner);

MessageStreamMarkdown.displayName = "MessageStreamMarkdown";
