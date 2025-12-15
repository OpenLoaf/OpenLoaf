"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronUp, Pause, Mic, AtSign, Hash, Image } from "lucide-react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useChatContext } from "./ChatProvider";
import { cn } from "@/lib/utils";
import SelectMode from "./input/SelectMode";

interface ChatInputProps {
  className?: string;
}

const MAX_CHARS = 2000;

export default function ChatInput({ className }: ChatInputProps) {
  const { sendMessage, status, stop, clearError, input, setInput } =
    useChatContext();

  const isOverLimit = input.length > MAX_CHARS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const canSubmit = status === "ready" || status === "error";
    if (!canSubmit) return;
    if (isOverLimit) return;
    
    if (input.trim()) {
      if (status === "error") {
        clearError();
      }
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 检查是否正在使用输入法进行输入，如果是则不发送消息
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const isLoading = status === "submitted" || status === "streaming";

  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      className={cn(
        "relative mt-4 shrink-0 rounded-xl bg-background border transition-all duration-200 shadow-sm flex flex-col max-h-[30%]",
        isFocused ? "border-primary ring-1 ring-primary/20" : "border-border",
        isOverLimit && "border-destructive ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
        className
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-[52px] overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex-1 min-h-0">
          <ScrollArea.Root className="w-full h-full">
            <ScrollArea.Viewport className="w-full h-full min-h-0">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const textarea = e.target as HTMLTextAreaElement;
                  textarea.style.height = "auto";
                  textarea.style.height = textarea.scrollHeight + "px";
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask, search, or make anything…"
                className={cn(
                  "w-full border-none resize-none focus:outline-none focus:ring-0 bg-transparent text-foreground text-sm leading-6 min-h-[48px] overflow-visible placeholder:text-muted-foreground/70",
                  isOverLimit && "text-destructive"
                )}
                style={{ fontSize: "15px", height: "auto" }}
              />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        <div className="flex justify-between items-end gap-2 px-3 pb-3 shrink-0">
          <div className="flex gap-1.5 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <AtSign className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Hash className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Image className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {input.length > 0 && (
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors mr-2",
                  isOverLimit ? "text-destructive" : "text-muted-foreground/60"
                )}
              >
                {input.length} / {MAX_CHARS}
              </span>
            )}
            
            <SelectMode />
            
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full w-8 h-8 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Mic className="w-4 h-4" />
            </Button>
            
            <Button
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? stop : undefined}
              disabled={(!input.trim() && !isLoading) || isOverLimit}
              size="icon"
              className={cn(
                "rounded-full w-8 h-8 transition-all duration-200 shadow-none",
                isLoading
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  : isOverLimit
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {isLoading ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        
        {isOverLimit && (
           <div className="px-4 pb-2 text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1">
             Content exceeds the {MAX_CHARS} character limit. Please shorten your message.
           </div>
        )}
      </form>
    </div>
  );
}
