"use client";

import { motion } from "motion/react";
import type { UIMessage } from "@ai-sdk/react";
import MessageAi from "./MessageAi";
import MessageHuman from "./MessageHuman";
import MessageTool from "./MessageTool";

interface MessageItemProps {
  message: UIMessage;
  reduceMotion: boolean | null;
}

export default function MessageItem({ message, reduceMotion }: MessageItemProps) {
  // AI SDK v6：工具调用 part.type 通常是 `tool-${name}` 或 `dynamic-tool`
  const toolParts = (message.parts ?? []).filter(
    (part: any) =>
      typeof part?.type === "string" &&
      (part.type === "dynamic-tool" || part.type.startsWith("tool-"))
  );

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
      transition={
        reduceMotion
          ? { duration: 0.12 }
          : {
              type: "spring",
              stiffness: 520,
              damping: 38,
              mass: 0.65,
            }
      }
    >
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
    </motion.div>
  );
}