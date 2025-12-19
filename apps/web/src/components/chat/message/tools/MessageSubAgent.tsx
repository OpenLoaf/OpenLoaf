"use client";

import { type UIMessage } from "@ai-sdk/react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "../renderMessageParts";

const SUB_AGENT_CONTENT_MAX_HEIGHT_CLASSNAME = "max-h-80";

const SUB_AGENT_TEXT_CLASSNAME = cn(
  // 关键：subAgent 内容需要更轻量的排版（更小字号 + 更淡颜色）
  "px-0",
  "text-xs text-muted-foreground leading-relaxed",
  "prose-p:text-muted-foreground prose-strong:text-foreground/80",
  "prose-code:bg-muted/40",
);

function getSubAgentTitle(message: UIMessage) {
  const agent = (message.metadata as any)?.agent as
    | { kind?: string; name?: string; displayName?: string; id?: string }
    | undefined;
  const name = agent?.displayName ?? agent?.name ?? "subAgent";
  const id = typeof agent?.id === "string" ? agent.id : undefined;
  return { name, id };
}

export default function MessageSubAgent({
  message,
  className,
  contentClassName,
}: {
  message: UIMessage;
  className?: string;
  contentClassName?: string;
}) {
  const { name, id } = getSubAgentTitle(message);

  return (
    <div className={cn("flex justify-start min-w-0", className)}>
      <div className="min-w-0 w-full space-y-2">
        <div className="flex items-center gap-2 px-3 font-sans">
          <Bot className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-xs font-medium text-foreground/80">
            <span className="truncate">{name}</span>
            {id ? <span className="ml-1 text-[11px] text-muted-foreground">#{id}</span> : null}
          </div>
        </div>

        <div
          className={cn(
            // 关键：整体是引用块风格，并限制高度，超出后滚动。
            "mx-3 min-w-0 overflow-y-auto rounded-md border-l-2 border-primary/30 bg-muted/30 px-3 py-2",
            SUB_AGENT_CONTENT_MAX_HEIGHT_CLASSNAME,
            contentClassName,
          )}
        >
          {renderMessageParts(message.parts as any[], {
            textClassName: SUB_AGENT_TEXT_CLASSNAME,
            toolClassName: "ml-0",
          })}
        </div>
      </div>
    </div>
  );
}

