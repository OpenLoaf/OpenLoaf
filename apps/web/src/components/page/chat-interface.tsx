"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { ChevronUp, Pause } from "lucide-react";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

export function ChatInterface() {
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`,
    }),
  }); 

  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 回车发送，Shift+回车换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-full w-full flex-col p-4">
      {/* 消息列表 */}
      <SimpleBar className="flex-1 mb-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {message.parts.map((part, index) => (
                <div key={index} className="whitespace-pre-wrap text-sm">
                  {part.type === "text" && part.text}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* 加载状态 */}
        {(status === "submitted" || status === "streaming") && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-3 rounded-lg bg-secondary text-secondary-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-150"></div>
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse delay-300"></div>
                <span className="text-xs text-muted-foreground">
                  正在思考...
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 错误状态 */}





        
        {error && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-3 rounded-lg bg-destructive/10 text-destructive">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">出错了</span>
              </div>
              <p className="text-xs mt-1">{error.message}</p>
            </div>
          </div>
        )}
      </SimpleBar>

      {/* 输入框 */}
      <div className="rounded-2xl bg-background border border-border overflow-hidden">
        {/* 输入表单 */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-3 pb-0">
            <SimpleBar className="max-h-[192px]">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // 自动调整高度
                  const textarea = e.target as HTMLTextAreaElement;
                  textarea.style.height = "auto";
                  textarea.style.height = textarea.scrollHeight + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask, search, or make anything…"
                className="w-full border-none resize-none focus:outline-none focus:ring-0 bg-transparent text-foreground text-sm leading-5 min-h-[44px] overflow-visible"
                style={{ fontSize: "14px", lineHeight: "20px", height: "auto" }}
              />
            </SimpleBar>
          </div>

          {/* 底部按钮 */}
          <div className="flex justify-end p-2 pr-3 pt-0">
            <Button
              type={
                status === "submitted" || status === "streaming"
                  ? "button"
                  : "submit"
              }
              onClick={
                status === "submitted" || status === "streaming"
                  ? stop
                  : undefined
              }
              disabled={
                !input.trim() &&
                !(status === "submitted" || status === "streaming")
              }
              className={`rounded-full w-8 h-8 p-0 flex items-center justify-center ${
                status === "submitted" || status === "streaming"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-primary hover:bg-primary/90"
              }`}
            >
              {status === "submitted" || status === "streaming" ? (
                <Pause className="w-4 h-4 text-destructive-foreground" />
              ) : (
                <ChevronUp className="w-4 h-4 text-primary-foreground" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
