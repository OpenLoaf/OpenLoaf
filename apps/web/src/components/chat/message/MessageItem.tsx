"use client";

import type { UIMessage } from "@ai-sdk/react";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageTool from "./MessageTool";

interface MessageItemProps {
  message: UIMessage;
}

export default function MessageItem({ message }: MessageItemProps) {
  // AI SDK v6：工具调用 part.type 通常是 `tool-${name}` 或 `dynamic-tool`
  const toolParts = (message.parts ?? []).filter(
    (part: any) =>
      typeof part?.type === "string" &&
      (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
  );

  return (
    <div>
      {message.role === "user" ? (
        <MessageHuman message={message} />
      ) : (
        <>
          <MessageAi message={message} />

          {/* 工具调用展示（MVP）：只显示工具名 + 返回结果 */}
          {toolParts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {toolParts.map((part: any, partIndex: number) => (
                <MessageTool
                  key={`${message.id}-tool-${partIndex}`}
                  part={part}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
