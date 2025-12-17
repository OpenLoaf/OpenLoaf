"use client";

import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./markdown/MarkdownComponents";
import MessageTool from "./tools/MessageTool";

// 修复 CJK 环境下 markdown 自动链接识别错误的问题（例如 "https://example.com）。" 会被误识别）
// 在 URL 和全角符号/CJK字符之间插入空格
function preprocessText(text: string) {
  if (!text) return text;
  // 匹配 URL 后紧跟全角字符或 CJK 字符的情况
  // 排除掉 URL 本身可能包含的字符，然后检测是否紧跟了 CJK 范围的字符
  // \u4e00-\u9fa5: 常见汉字
  // \u3000-\u303f: CJK 标点
  // \uff00-\uffef: 全角字符
  return text.replace(
    /(https?:\/\/[^\s\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef])/g,
    "$1 $2"
  );
}

interface MessageAiProps {
  message: UIMessage;
  className?: string;
}

export default function MessageAi({ message, className }: MessageAiProps) {
  // 关键：subAgent 的消息会带 metadata.agent，前端用它做单独 UI 处理
  const agentMeta = (message.metadata as any)?.agent as
    | { kind?: string; name?: string; displayName?: string }
    | undefined;
  const subAgentLabel =
    agentMeta?.kind === "sub" ? agentMeta.displayName ?? agentMeta.name ?? "subAgent" : null;

  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        {subAgentLabel ? (
          <div className="px-3 text-xs text-muted-foreground font-sans">
            {subAgentLabel}
          </div>
        ) : null}
        {message.parts.map((part: any, index: number) => {
          if (part?.type === "text") {
            return (
              <div
                key={index}
                className={cn(
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
                  "prose-img:max-w-full prose-img:h-auto"
                )}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {preprocessText(part.text)}
                </ReactMarkdown>
              </div>
            );
          }

          if (
            typeof part?.type === "string" &&
            (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
          ) {
            return (
              <MessageTool
                key={part.toolCallId ?? `${part.type}-${index}`}
                part={part}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
