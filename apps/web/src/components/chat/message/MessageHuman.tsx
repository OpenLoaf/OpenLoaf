"use client";

import * as React from "react";
import { type UIMessage } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Copy, PencilLine } from "lucide-react";

interface MessageHumanProps {
  message: UIMessage;
  className?: string;
  isLast?: boolean;
  isLastHumanMessage?: boolean;
}

export default function MessageHuman({
  message,
  className,
  isLastHumanMessage,
}: MessageHumanProps) {
  const [isCopied, setIsCopied] = React.useState(false);

  const copyMessage = async () => {
    const text = message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("");

    await navigator.clipboard.writeText(text);
    setIsCopied(true);

    // Reset copied state after 2 seconds
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <div className={cn("my-0.5 group mr-4", className)}>
      <div className="flex justify-end">
        <div className="max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground">
          {message.parts.map((part: any, index: number) => (
            <div key={index} className="whitespace-pre-wrap text-sm">
              {part.type === "text" && part.text}
            </div>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "flex justify-end mt-1 transition-opacity duration-200",
          !isLastHumanMessage && "opacity-0 group-hover:opacity-100"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label={isCopied ? "已复制" : "复制"}
          title={isCopied ? "已复制" : "复制"}
          onClick={copyMessage}
        >
          <div className="relative flex items-center justify-center">
            {/* Copy Icon */}
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isCopied
                  ? "opacity-0 scale-90 rotate-12"
                  : "opacity-100 scale-100 rotate-0"
              )}
            >
              <Copy className="size-3" />
            </div>
            {/* Check Icon */}
            <div
              className={cn(
                "absolute transition-all duration-300 ease-in-out",
                isCopied
                  ? "opacity-100 scale-100 rotate-0"
                  : "opacity-0 scale-90 -rotate-12"
              )}
            >
              <Check className="size-3" />
            </div>
          </div>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label="编辑"
          title="编辑"
        >
          <PencilLine className="size-3" />
        </Button>
      </div>
    </div>
  );
}
