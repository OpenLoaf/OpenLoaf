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

export default function ChatInput({ className }: ChatInputProps) {
  const { sendMessage, status, stop } = useChatContext();
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    if (status !== "ready") {
      return;
    }
    e.preventDefault();
    if (input.trim()) {
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

  const isLoading = status !== "ready";

  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl bg-background border border-border overflow-hidden transition-all duration-200",
        isFocused && "border-primary",
        className
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="p-3 pb-0">
          <ScrollArea.Root className="max-h-[192px]">
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
                className="w-full border-none resize-none focus:outline-none focus:ring-0 bg-transparent text-foreground text-sm leading-5 min-h-[68px] overflow-visible"
                style={{ fontSize: "14px", lineHeight: "20px", height: "auto" }}
              />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical">
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        <div className="flex justify-between items-center gap-2 p-2 pr-3 pt-0">
          <div className="flex gap-2">
            <Button
              type="button"
              className="rounded-full w-7 h-7 p-0 flex items-center justify-center bg-background hover:bg-muted/90"
            >
              <AtSign className="w-3 h-3 text-muted-foreground" />
            </Button>
            <Button
              type="button"
              className="rounded-full w-7 h-7 p-0 flex items-center justify-center bg-background hover:bg-muted/90"
            >
              <Hash className="w-3 h-3 text-muted-foreground" />
            </Button>
            <Button
              type="button"
              className="rounded-full w-7 h-7 p-0 flex items-center justify-center bg-background hover:bg-muted/90"
            >
              <Image className="w-3 h-3 text-muted-foreground" />
            </Button>
          </div>
          <div className="flex gap-2">
            <SelectMode />
            <Button
              type="button"
              className="rounded-full w-7 h-7 p-0 flex items-center justify-center bg-background hover:bg-muted/90"
            >
              <Mic className="w-3 h-3 text-muted-foreground" />
            </Button>
            <Button
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? stop : undefined}
              disabled={!input.trim() && !isLoading}
              className={cn(
                "rounded-full w-7 h-7 p-0 flex items-center justify-center",
                isLoading
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-primary hover:bg-primary/90"
              )}
            >
              {isLoading ? (
                <Pause className="w-3 h-3 text-destructive-foreground" />
              ) : (
                <ChevronUp className="w-3 h-3 text-primary-foreground" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
