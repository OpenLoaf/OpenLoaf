/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { markdownComponents } from "./markdown/MarkdownComponents";
import MessageTool from "./tools/MessageTool";
import MessageFile from "./tools/MessageFile";
import { isToolPart } from "@/lib/chat/message-parts";
import type React from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { preprocessChatText } from "./text-tokenizer";

type AnyMessagePart = {
  type?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  url?: string;
  mediaType?: string;
  title?: string;
  name?: string;
  data?: { text?: string };
  isTransient?: boolean;
};

type MessageSource = {
  /** Source URL used by ai-elements source list. */
  url: string;
  /** Display title for the source link. */
  title: string;
};

/** Check whether a message part is a source part. */
function isSourcePart(part: AnyMessagePart) {
  const type = typeof part?.type === "string" ? part.type.toLowerCase() : "";
  return type === "source-url" || type === "source-document";
}

/** Normalize a source part into a url/title tuple. */
function normalizeSourcePart(part: AnyMessagePart): MessageSource | null {
  if (!isSourcePart(part)) return null;
  const sourceObject =
    part && typeof (part as any).source === "object" ? ((part as any).source as Record<string, unknown>) : null;
  const urlCandidate = [
    typeof part?.url === "string" ? part.url : "",
    typeof (part as any)?.sourceUrl === "string" ? String((part as any).sourceUrl) : "",
    typeof sourceObject?.url === "string" ? String(sourceObject.url) : "",
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  const url = typeof urlCandidate === "string" ? urlCandidate.trim() : "";
  if (!url) return null;

  const titleCandidate = [
    typeof part?.title === "string" ? part.title : "",
    typeof part?.name === "string" ? part.name : "",
    typeof (part as any)?.id === "string" ? String((part as any).id) : "",
    typeof sourceObject?.title === "string" ? String(sourceObject.title) : "",
    typeof sourceObject?.name === "string" ? String(sourceObject.name) : "",
    url,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return {
    url,
    title: typeof titleCandidate === "string" ? titleCandidate.trim() : url,
  };
}

/** Check whether a message part is transient. */
function isTransientPart(part: AnyMessagePart) {
  return part?.isTransient === true;
}

/** Render a status bar for transient parts. */
function renderTransientStatusBar(
  motionProps?: React.ComponentProps<typeof motion.div>,
) {
  return (
    <motion.div key="transient-status" {...motionProps}>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
        <div className="h-1 w-8 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/20" />
        </div>
        <Shimmer className="text-xs">处理中...</Shimmer>
      </div>
    </motion.div>
  );
}

export const MESSAGE_TEXT_CLASSNAME = cn(
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

/** 改写提示词的样式。 */
export const MESSAGE_REVISED_PROMPT_CLASSNAME = cn(
  "min-w-0 w-full max-w-full px-1 font-sans text-xs leading-relaxed text-muted-foreground",
  "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
  "rounded-md border border-dashed border-muted-foreground/30 bg-muted/20",
);

/** Styling for file parts. */
export const MESSAGE_FILE_CLASSNAME = cn(
  "min-w-0 w-full max-w-full px-1",
  "flex flex-wrap gap-2",
);

/** Render message parts into motion-wrapped elements. */
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
    /** Message id for tool expansion fetch. */
    messageId?: string;
    /** Motion props for entrance animation. */
    motionProps?: React.ComponentProps<typeof motion.div>;
  },
) {
  const renderTools = options?.renderTools !== false;
  const renderText = options?.renderText !== false;
  const isAnimating = Boolean(options?.isAnimating);
  const motionProps = options?.motionProps;
  const list = Array.isArray(parts) ? parts : [];
  const transientParts = list.filter((part) => isTransientPart(part));
  const transientToolCallIds = new Set(
    transientParts
      .map((part) => (typeof part.toolCallId === "string" ? part.toolCallId : ""))
      .filter(Boolean),
  );
  const visibleList = list.filter(
    (part) =>
      !isTransientPart(part) &&
      !(part?.toolCallId && transientToolCallIds.has(String(part.toolCallId))),
  );
  const nodes: React.ReactNode[] = [];

  for (let index = 0; index < visibleList.length; index += 1) {
    const part = visibleList[index] as AnyMessagePart;

    if (part?.type === "text") {
      if (!renderText) continue;
      // 中文注释：合并连续文本片段，避免流式阶段渲染成多段碎片。
      let nextIndex = index;
      let mergedText = "";
      while (nextIndex < visibleList.length && visibleList[nextIndex]?.type === "text") {
        mergedText += String((visibleList[nextIndex] as AnyMessagePart)?.text ?? "");
        nextIndex += 1;
      }
      const normalizedText = preprocessChatText(mergedText);
      if (normalizedText.trim().length > 0) {
        nodes.push(
          <motion.div
            key={`text:${index}:${nextIndex}`}
            className={cn(MESSAGE_TEXT_CLASSNAME, options?.textClassName)}
            {...motionProps}
          >
            <MessageResponse
              components={markdownComponents}
              parseIncompleteMarkdown
              isAnimating={isAnimating}
            >
              {normalizedText}
            </MessageResponse>
          </motion.div>,
        );
      }
      index = nextIndex - 1;
      continue;
    }

    if (part?.type === "reasoning") {
      if (!renderText) continue;
      // 中文注释：按 ai-elements 建议将连续 reasoning 合并为单个可折叠区域。
      let nextIndex = index;
      const reasoningChunks: string[] = [];
      while (nextIndex < visibleList.length && visibleList[nextIndex]?.type === "reasoning") {
        const chunk = String((visibleList[nextIndex] as AnyMessagePart)?.text ?? "").trim();
        if (chunk) reasoningChunks.push(chunk);
        nextIndex += 1;
      }
      const reasoningText = preprocessChatText(reasoningChunks.join("\n\n"));
      if (reasoningText) {
        nodes.push(
          <motion.div key={`reasoning:${index}:${nextIndex}`} {...motionProps}>
            <Reasoning isStreaming={isAnimating} defaultOpen={isAnimating}>
              <ReasoningTrigger
                getThinkingMessage={(isStreaming, duration) => {
                  if (isStreaming) return "深度思考中...";
                  if (typeof duration === "number") return `深度思考耗时 ${duration}s`;
                  return "深度思考";
                }}
              />
              <ReasoningContent className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs text-muted-foreground">
                {reasoningText}
              </ReasoningContent>
            </Reasoning>
          </motion.div>,
        );
      }
      index = nextIndex - 1;
      continue;
    }

    if (isSourcePart(part)) {
      if (!renderText) continue;
      let nextIndex = index;
      const sources: MessageSource[] = [];
      while (nextIndex < visibleList.length && isSourcePart(visibleList[nextIndex] as AnyMessagePart)) {
        const normalizedSource = normalizeSourcePart(visibleList[nextIndex] as AnyMessagePart);
        if (normalizedSource) sources.push(normalizedSource);
        nextIndex += 1;
      }
      if (sources.length > 0) {
        nodes.push(
          <motion.div key={`source:${index}:${nextIndex}`} {...motionProps}>
            <Sources>
              <SourcesTrigger count={sources.length}>
                <span className="font-medium">引用来源 {sources.length}</span>
              </SourcesTrigger>
              <SourcesContent>
                {sources.map((sourceItem, sourceIndex) => (
                  <Source
                    key={`${sourceItem.url}:${sourceIndex}`}
                    href={sourceItem.url}
                    title={sourceItem.title}
                  />
                ))}
              </SourcesContent>
            </Sources>
          </motion.div>,
        );
      }
      index = nextIndex - 1;
      continue;
    }

    if (part?.type === "data-revised-prompt") {
      if (!renderText) continue;
      const revisedText = part?.data?.text;
      if (!revisedText) continue;
      nodes.push(
        <motion.div
          key={`revised-prompt:${index}`}
          className={cn(MESSAGE_REVISED_PROMPT_CLASSNAME, options?.textClassName)}
          {...motionProps}
        >
          <div className="text-[11px] font-medium text-muted-foreground/80">改写提示词</div>
          <MessageResponse
            components={markdownComponents}
            parseIncompleteMarkdown
            isAnimating={isAnimating}
          >
            {preprocessChatText(String(revisedText))}
          </MessageResponse>
        </motion.div>,
      );
      continue;
    }

    if (part?.type === "file") {
      const url = typeof part.url === "string" ? part.url : "";
      const mediaType = typeof part.mediaType === "string" ? part.mediaType : "";
      const title =
        typeof part.title === "string"
          ? part.title
          : typeof part.name === "string"
            ? part.name
            : undefined;
      if (!url) continue;
      nodes.push(
        <motion.div key={`file:${index}`} {...motionProps}>
          <MessageFile
            key={index}
            url={url}
            mediaType={mediaType}
            title={title}
            className={MESSAGE_FILE_CLASSNAME}
          />
        </motion.div>,
      );
      continue;
    }

    // 关键：tool part 也属于消息内容的一部分，需要保持与 MessageList 一致的渲染规则（支持嵌套）。
    if (isToolPart(part)) {
      if (!renderTools) continue;
      const toolPart = part as any;
      nodes.push(
        <motion.div key={toolPart.toolCallId ?? `${toolPart.type}-${index}`} {...motionProps}>
          <MessageTool
            part={toolPart}
            className={options?.toolClassName}
            variant={options?.toolVariant}
            messageId={options?.messageId}
          />
        </motion.div>,
      );
    }
  }

  if (renderTools && transientParts.length > 0) {
    nodes.push(renderTransientStatusBar(motionProps));
  }

  return nodes;
}
