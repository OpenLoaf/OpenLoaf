"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { markdownComponents } from "./markdown/MarkdownComponents";
import MessageTool from "./tools/MessageTool";
import { ManualStopTool } from "./tools/ManualStopTool";
import { isToolPart } from "@/lib/chat/message-parts";

type AnyMessagePart = {
  type?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
};

// 修复 CJK 环境下 markdown 自动链接识别错误的问题（例如 "https://example.com）。" 会被误识别）
// 在 URL 和全角符号/CJK字符之间插入空格
function preprocessText(text: string) {
  if (!text) return text;
  return text.replace(
    /(https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef])/g,
    "$1 $2",
  );
}

export const MESSAGE_TEXT_CLASSNAME = cn(
  // Avoid `w-full` + horizontal margins causing width overflow.
  "min-w-0 w-full max-w-full px-3 font-sans prose prose-neutral dark:prose-invert break-words [overflow-wrap:anywhere]",
  // Base text settings
  "text-sm leading-relaxed",
  // Element spacing adjustments
  "prose-p:my-2 prose-p:leading-relaxed prose-p:first:mt-0 prose-p:last:mb-0",
  "prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:first:mt-0",
  "prose-h1:text-base prose-h2:text-[15px] prose-h3:text-sm prose-h4:text-sm",
  "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-li:marker:text-muted-foreground",
  // Code block styling (handled by components but resetting some defaults)
  "prose-pre:p-0 prose-pre:bg-transparent prose-pre:m-0",
  // Inline code styling
  "prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:font-normal prose-code:bg-muted/50 prose-code:rounded-sm prose-code:before:content-none prose-code:after:content-none",
  // Other elements
  "prose-blockquote:not-italic prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground",
  "prose-a:break-all prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
  "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto",
  // Ensure media never overflows the chat width.
  "prose-img:max-w-full prose-img:h-auto",
);

/** Styling for reasoning parts. */
export const MESSAGE_REASONING_CLASSNAME = cn(
  "min-w-0 w-full max-w-full px-3 font-sans text-xs leading-relaxed text-muted-foreground",
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere] italic",
  "rounded-md border border-dashed border-muted-foreground/30 bg-muted/30",
);

export function renderMessageParts(
  parts: AnyMessagePart[],
  options?: {
    textClassName?: string;
    toolClassName?: string;
    /** Tool rendering variant. */
    toolVariant?: "default" | "nested";
    /** 是否渲染工具卡片 */
    renderTools?: boolean;
    /** 是否渲染文本（当 output 已有时，可隐藏 message 段的文本避免重复） */
    renderText?: boolean;
    /** Whether to animate streaming text output. */
    isAnimating?: boolean;
  },
) {
  const renderTools = options?.renderTools !== false;
  const renderText = options?.renderText !== false;
  const isAnimating = Boolean(options?.isAnimating);
  return (parts ?? []).map((part: any, index: number) => {
    if (part?.type === "text") {
      if (!renderText) return null;
      return (
        <div key={index} className={cn(MESSAGE_TEXT_CLASSNAME, options?.textClassName)}>
          <Streamdown
            components={markdownComponents}
            parseIncompleteMarkdown
            isAnimating={isAnimating}
          >
            {preprocessText(String(part.text ?? ""))}
          </Streamdown>
        </div>
      );
    }

    if (part?.type === "reasoning") {
      if (!renderText) return null;
      return (
        <div key={index} className={cn(MESSAGE_REASONING_CLASSNAME, options?.textClassName)}>
          <Streamdown components={markdownComponents} parseIncompleteMarkdown isAnimating={isAnimating}>
            {preprocessText(String(part.text ?? ""))}
          </Streamdown>
        </div>
      );
    }

    if (part?.type === "data-manual-stop") {
      return <ManualStopTool key={part.data?.toolCallId ?? `${part.type}-${index}`} part={part} />;
    }

    // 关键：tool part 也属于消息内容的一部分，需要保持与 MessageList 一致的渲染规则（支持嵌套）。
    if (isToolPart(part)) {
      if (!renderTools) return null;
      return (
        <MessageTool
          key={part.toolCallId ?? `${part.type}-${index}`}
          part={part}
          className={options?.toolClassName}
          variant={options?.toolVariant}
        />
      );
    }

    return null;
  });
}
