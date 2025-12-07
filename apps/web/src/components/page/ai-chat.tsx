"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AiChat() {
  const [messages, setMessages] = useState<
    {
      id: string;
      content: string;
      isUser: boolean;
    }[]
  >([]);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage = {
      id: Date.now().toString(),
      content: input,
      isUser: true,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");

    // 模拟AI回复
    setTimeout(() => {
      const aiReply = {
        id: (Date.now() + 1).toString(),
        content: `AI reply to: ${input}`,
        isUser: false,
      };
      setMessages((prev) => [...prev, aiReply]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex max-w-[85%] p-3 rounded-lg",
              message.isUser
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto bg-muted"
            )}
          >
            {message.content}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1"
        />
        <Button onClick={handleSend}>Send</Button>
      </div>
    </div>
  );
}
