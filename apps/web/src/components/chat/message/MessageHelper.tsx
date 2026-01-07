"use client";

import React from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { useChatContext } from "../ChatProvider";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";

const SUGGESTIONS = [
  {
    label: "测试审批",
    value: "测试审批：请调用 test-approval 工具（用于测试 needsApproval 的审批流程），然后等待我在工具卡片里点击允许/拒绝。",
  },
  {
    label: "打开B站播放视频",
    value: "帮我打开B站，在输入框中输入 陈奕迅 后查询。查询成功后滚动到页面最底部，点击第二页后点击该页面的最后一个视频进行播放。",
  },
  {
    label: "写一首诗",
    value: "帮我写一首关于秋天的现代诗，意境要优美。",
  },
  {
    label: "随机创建一个项目",
    value: "帮我随机创建一个测试项目",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.5,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function MessageHelper() {
  const { setInput, selectSession, tabId } = useChatContext();
  const { recentSessions } = useChatSessions({ tabId });

  const focusChatInput = React.useCallback(() => {
    // 点击建议后需要立刻聚焦到输入框，方便用户直接按 Enter 发送或继续编辑
    // 注意：输入框在 ChatInput.tsx 内部；这里通过 data attribute 定位，避免引入跨组件 ref 依赖
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-teatime-chat-input="true"]'
      );
      if (!el) return;
      el.focus();
      // 将光标移动到末尾，便于继续补充内容
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia>
            <div className="text-muted-foreground text-4xl">💬</div>
          </EmptyMedia>
          <EmptyTitle>开始对话</EmptyTitle>
          <EmptyDescription>
            输入你的问题或想法，我会尽力为你提供帮助
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-col gap-2 max-w-md mx-auto mt-4">
            <p className="text-sm text-muted-foreground mb-2 text-center">
              你可以试着问我：
            </p>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-stretch"
            >
              {SUGGESTIONS.map((suggestion) => (
                <motion.div key={suggestion.label} variants={item} className="h-full">
                  <Button
                    variant="outline"
                    className="justify-start items-start h-full py-3 px-4 text-left whitespace-normal font-normal w-full"
                    onClick={() => {
                      setInput(suggestion.value);
                      focusChatInput();
                    }}
                  >
                    {suggestion.label}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </EmptyContent>
      </Empty>

      {/* 最近的对话固定显示在底部 */}
      {recentSessions.length > 0 && (
        <div className="mt-auto pt-6  border-border/30">
          <div className="grid grid-cols-1 gap-1 max-w-md mx-auto">
            {recentSessions.map((session) => {
              const date = new Date(session.updatedAt);
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <Button
                  key={session.id}
                  variant="ghost"
                  className="justify-start h-auto py-2 px-3 text-left font-normal text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                  onClick={() => selectSession(session.id)}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                  <div className="flex-1 truncate text-xs">{session.title}</div>
                  <span className="text-[10px] opacity-40 ml-2 shrink-0">
                    {isToday
                      ? date.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })
                      : date.toLocaleDateString()}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
