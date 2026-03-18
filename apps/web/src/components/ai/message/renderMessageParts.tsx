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
import {
  MessageStreamMarkdown,
  MESSAGE_STREAM_MARKDOWN_CLASSNAME,
} from "./markdown/MessageStreamMarkdown";
import { markdownComponents } from "./markdown/MarkdownComponents";
import MessageTool from "./tools/MessageTool";
import MessageFile from "./tools/MessageFile";
import { isToolPart } from "@/lib/chat/message-parts";
import { shouldShowToolPart } from "@/lib/chat/tool-visibility";
import type React from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { preprocessChatText } from "./text-tokenizer";
import i18next from "i18next";

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
        <Shimmer className="text-xs">{i18next.t("tool.processing", { ns: "ai", defaultValue: "处理中..." })}</Shimmer>
      </div>
    </motion.div>
  );
}

export const MESSAGE_TEXT_CLASSNAME = cn(
  MESSAGE_STREAM_MARKDOWN_CLASSNAME,
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

/** Wrap content in motion.div. Always use motion.div to prevent element-type
 *  switching (div ↔ motion.div) which causes React to unmount/remount the
 *  subtree and replay the entrance animation — visible as content "disappearing"
 *  then fading back in when isAnimating toggles on a historical message. */
function wrapPart(
  key: string,
  className: string | undefined,
  children: React.ReactNode,
  motionProps?: React.ComponentProps<typeof motion.div>,
): React.ReactNode {
  return (
    <motion.div key={key} className={className || undefined} {...(motionProps ?? {})}>
      {children}
    </motion.div>
  );
}

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
    /** When true, show all tool results including normally hidden ones. */
    showAllToolResults?: boolean;
  },
) {
  const renderTools = options?.renderTools !== false;
  const renderText = options?.renderText !== false;
  const isAnimating = Boolean(options?.isAnimating);
  const motionProps = options?.motionProps;
  const showAllToolResults = Boolean(options?.showAllToolResults);
  // 统一可见性判断：tool part 通过 shouldShowToolPart 决定是否显示
  const isPartVisible = (part: AnyMessagePart) => {
    if (isToolPart(part)) return shouldShowToolPart(part, { showAllToolResults });
    return true;
  };
  const list = Array.isArray(parts) ? parts : [];
  const transientParts = list.filter(
    (part) => isTransientPart(part) && isPartVisible(part),
  );
  const transientToolCallIds = new Set(
    transientParts
      .map((part) => (typeof part.toolCallId === "string" ? part.toolCallId : ""))
      .filter(Boolean),
  );
  const visibleList = list.filter(
    (part) =>
      isPartVisible(part) &&
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
          wrapPart(
            `text:${index}:${nextIndex}`,
            undefined,
            <MessageStreamMarkdown
              markdown={normalizedText}
              className={cn(MESSAGE_TEXT_CLASSNAME, options?.textClassName)}
              isAnimating={isAnimating}
            />,
            motionProps,
          ),
        );
      }
      index = nextIndex - 1;
      continue;
    }

    if (part?.type === "reasoning") {
      // Reasoning 由 MessageThinking 组件统一渲染，此处跳过所有 reasoning parts。
      let nextIndex = index;
      while (nextIndex < visibleList.length && visibleList[nextIndex]?.type === "reasoning") {
        nextIndex += 1;
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
          wrapPart(
            `source:${index}:${nextIndex}`,
            undefined,
            <Sources>
              <SourcesTrigger count={sources.length}>
                <span className="font-medium">{i18next.t("tool.sourcesTitle", { ns: "ai", defaultValue: "引用来源" })} {sources.length}</span>
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
            </Sources>,
            motionProps,
          ),
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
        wrapPart(
          `revised-prompt:${index}`,
          cn(MESSAGE_REVISED_PROMPT_CLASSNAME, options?.textClassName),
          <>
            <div className="text-[11px] font-medium text-muted-foreground/80">{i18next.t("tool.revisedPrompt", { ns: "ai", defaultValue: "改写提示词" })}</div>
            <MessageResponse
              components={markdownComponents}
              parseIncompleteMarkdown
              isAnimating={isAnimating}
            >
              {preprocessChatText(String(revisedText))}
            </MessageResponse>
          </>,
          motionProps,
        ),
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
        wrapPart(
          `file:${index}`,
          undefined,
          <MessageFile
            key={index}
            url={url}
            mediaType={mediaType}
            title={title}
            className={MESSAGE_FILE_CLASSNAME}
          />,
          motionProps,
        ),
      );
      continue;
    }

    // 工具渲染：可见性已在 visibleList 阶段由 shouldShowToolPart 统一处理
    if (isToolPart(part)) {
      if (!renderTools) continue;
      const toolPart = part as any;
      nodes.push(
        wrapPart(
          toolPart.toolCallId ?? `${toolPart.type}-${index}`,
          undefined,
          <MessageTool
            part={toolPart}
            className={options?.toolClassName}
            variant={options?.toolVariant}
            messageId={options?.messageId}
          />,
          motionProps,
        ),
      );
    }
  }

  if (renderTools && transientParts.length > 0) {
    nodes.push(renderTransientStatusBar(motionProps));
  }

  return nodes;
}
