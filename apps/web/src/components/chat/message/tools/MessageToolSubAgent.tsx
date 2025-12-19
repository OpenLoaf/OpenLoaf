"use client";

import type { UIMessage } from "@ai-sdk/react";
import * as React from "react";
import { Bot, ChevronRight, LoaderCircle } from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { renderMessageParts } from "../renderMessageParts";

type AnyToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const SUB_AGENT_MAX_HEIGHT_CLASSNAME = "max-h-80";
const SUB_AGENT_INPUT_MAX_HEIGHT_CLASSNAME = "max-h-40";

const SUB_AGENT_TEXT_CLASSNAME = cn(
  // 关键：subAgent 内容需要更轻量的排版（更小字号 + 更淡颜色）
  "px-0",
  "text-xs text-muted-foreground leading-relaxed",
  "prose-p:text-muted-foreground prose-strong:text-foreground/80",
  "prose-code:bg-muted/40",
);

const QUOTE_BLOCK_CLASSNAME = cn(
  // 关键：引用块风格（不要 rounded），并限制高度，超出滚动
  "min-w-0 overflow-y-auto border-l-2 border-primary/30 bg-muted/30 px-3 py-2",
);

const SECTION_TITLE_CLASSNAME = "text-[11px] text-muted-foreground";

const SUB_AGENT_SHIMMER_STYLE = `
@keyframes subagent-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.subagent-shimmer {
  background-image: linear-gradient(90deg, hsl(var(--muted-foreground)), hsl(var(--foreground)), hsl(var(--muted-foreground)));
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: subagent-shimmer 1.4s linear infinite;
}
`;

function safeParseJson(value: unknown): any {
  if (value == null) return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extractSubAgentInput(part: AnyToolPart) {
  const input = safeParseJson(part.input) ?? {};
  const name = typeof (input as any)?.name === "string" ? String((input as any).name) : "subAgent";
  const task = typeof (input as any)?.task === "string" ? String((input as any).task) : "";
  return { name, task };
}

function extractOutputMarkdown(part: AnyToolPart) {
  const output = safeParseJson(part.output) ?? part.output;
  const markdown =
    typeof (output as any)?.data?.outputMarkdown === "string"
      ? String((output as any).data.outputMarkdown)
      : "";
  return markdown.trim();
}

function isToolRunning(part: AnyToolPart) {
  if (part.errorText) return false;
  if (part.state && part.state !== "output-available") return true;
  return part.output == null;
}

function getActiveSectionKey({
  hasOutput,
  hasMessages,
}: {
  hasOutput: boolean;
  hasMessages: boolean;
}): "input" | "messages" | "output" {
  if (hasOutput) return "output";
  if (hasMessages) return "messages";
  return "input";
}

export default function MessageToolSubAgent({
  part,
  subMessages,
  className,
}: {
  part: AnyToolPart;
  subMessages: UIMessage[];
  className?: string;
}) {
  const { name, task } = extractSubAgentInput(part);
  const outputMarkdown = extractOutputMarkdown(part);
  const running = isToolRunning(part);

  // 关键：messages 段用于展示 subAgent 的“工作过程”（工具调用等），output 段展示最终 markdown 总结。
  const hasMessages = (subMessages?.length ?? 0) > 0;
  const hasOutput = outputMarkdown.length > 0;
  const activeKey = getActiveSectionKey({ hasOutput, hasMessages });

  const [open, setOpen] = React.useState(true);
  const [openSection, setOpenSection] = React.useState<"input" | "messages" | "output">(activeKey);

  React.useEffect(() => {
    if (!open) return;
    setOpenSection(activeKey);
  }, [activeKey, open]);

  return (
    <div className={cn("flex ml-2 w-full min-w-0 max-w-full justify-start", className)}>
      <style>{SUB_AGENT_SHIMMER_STYLE}</style>

      <CollapsiblePrimitive.Root
        open={open}
        onOpenChange={setOpen}
        className="group/subagent-tool w-full min-w-0"
      >
        <div className="flex items-center justify-between gap-2">
          <CollapsiblePrimitive.Trigger asChild>
            <button
              type="button"
              className="group/subagent-tool-header min-w-0 flex flex-1 items-center gap-2 select-none text-left text-xs"
            >
              <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/subagent-tool:rotate-90" />
              <Bot className="size-4 shrink-0 text-muted-foreground" />
              <span className={cn("min-w-0 truncate font-medium", running ? "subagent-shimmer" : "text-foreground/80")}>
                {name}
              </span>
              {running ? <LoaderCircle className="ml-1 size-3 shrink-0 animate-spin text-muted-foreground" /> : null}
            </button>
          </CollapsiblePrimitive.Trigger>
        </div>

        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="mt-2 space-y-2">
            <CollapsiblePrimitive.Root
              open={openSection === "input"}
              onOpenChange={(next) => {
                if (next) setOpenSection("input");
              }}
            >
              <CollapsiblePrimitive.Trigger asChild>
                <button type="button" className="mx-3 w-[calc(100%-1.5rem)] text-left">
                  <div className={SECTION_TITLE_CLASSNAME}>Input</div>
                </button>
              </CollapsiblePrimitive.Trigger>
              <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className={cn("mx-3", QUOTE_BLOCK_CLASSNAME, SUB_AGENT_INPUT_MAX_HEIGHT_CLASSNAME)}>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {task || "（无 task）"}
                  </div>
                </div>
              </CollapsiblePrimitive.Content>
            </CollapsiblePrimitive.Root>

            <CollapsiblePrimitive.Root
              open={openSection === "messages"}
              onOpenChange={(next) => {
                if (next) setOpenSection("messages");
              }}
            >
              <CollapsiblePrimitive.Trigger asChild>
                <button type="button" className="mx-3 w-[calc(100%-1.5rem)] text-left">
                  <div className={SECTION_TITLE_CLASSNAME}>Messages</div>
                </button>
              </CollapsiblePrimitive.Trigger>
              <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className={cn("mx-3", QUOTE_BLOCK_CLASSNAME, SUB_AGENT_MAX_HEIGHT_CLASSNAME)}>
                  <div className="space-y-2">
                    {(subMessages ?? []).map((m, idx) => (
                      <div key={m.id ?? idx} className="min-w-0">
                        {renderMessageParts((m as any).parts ?? [], {
                          textClassName: SUB_AGENT_TEXT_CLASSNAME,
                          renderTools: true,
                        })}
                      </div>
                    ))}
                    {!hasMessages ? (
                      <div className="text-xs text-muted-foreground">（暂无 messages）</div>
                    ) : null}
                  </div>
                </div>
              </CollapsiblePrimitive.Content>
            </CollapsiblePrimitive.Root>

            <CollapsiblePrimitive.Root
              open={openSection === "output"}
              onOpenChange={(next) => {
                if (next) setOpenSection("output");
              }}
            >
              <CollapsiblePrimitive.Trigger asChild>
                <button type="button" className="mx-3 w-[calc(100%-1.5rem)] text-left">
                  <div className={SECTION_TITLE_CLASSNAME}>Output</div>
                </button>
              </CollapsiblePrimitive.Trigger>
              <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className={cn("mx-3", QUOTE_BLOCK_CLASSNAME, SUB_AGENT_MAX_HEIGHT_CLASSNAME)}>
                  {outputMarkdown ? (
                    renderMessageParts([{ type: "text", text: outputMarkdown }], {
                      textClassName: SUB_AGENT_TEXT_CLASSNAME,
                      renderTools: true,
                    })
                  ) : (
                    <div className="text-xs text-muted-foreground">（暂无 output）</div>
                  )}
                </div>
              </CollapsiblePrimitive.Content>
            </CollapsiblePrimitive.Root>
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    </div>
  );
}
