"use client";

import React, { useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const makeId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [pendingInput, setPendingInput] = useState<
    typeof skipToken | { messages: ChatMessage[] }
  >(skipToken);

  const subscriptionOpts = useMemo(() => {
    const enabled = pendingInput !== skipToken;
    return trpc.chat.stream.subscriptionOptions(
      pendingInput === skipToken
        ? skipToken
        : {
            messages: pendingInput.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          },
      {
        enabled,
        onStarted: () => {
          // Prepare to collect streamed tokens
        },
        onData: (token) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamingMessageId
                ? { ...message, content: message.content + token }
                : message
            )
          );
        },
        onError: () => {
          setStreamingMessageId(null);
          setPendingInput(skipToken);
        },
        onConnectionStateChange: (state) => {
          if (state.state === "idle") {
            setStreamingMessageId(null);
            setPendingInput(skipToken);
          }
        },
      }
    );
  }, [pendingInput, streamingMessageId]);

  useSubscription(subscriptionOpts);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: input,
    };

    const assistantMessage: ChatMessage = {
      id: makeId(),
      role: "assistant",
      content: "",
    };

    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setInput("");
    setStreamingMessageId(assistantMessage.id);
    setPendingInput({
      messages: nextMessages.filter((m) => m.role === "user" || m.role === "assistant"),
    });
  };

  return (
    <div className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex-1 space-y-4 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex max-w-[85%] p-3 rounded-lg text-sm leading-relaxed",
              message.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto bg-muted"
            )}
          >
            {message.content || (
              <span className="text-muted-foreground">Thinking...</span>
            )}
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
        <Button onClick={handleSend} disabled={pendingInput !== skipToken}>
          Send
        </Button>
      </div>
    </div>
  );
}
