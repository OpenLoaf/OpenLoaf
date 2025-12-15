"use client";

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
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";

const SUGGESTIONS = [
  {
    label: "如何学习编程？",
    value: "作为初学者，我应该如何开始学习编程？推荐先学习哪种语言？",
  },
  {
    label: "解释量子力学",
    value: "请用通俗易懂的语言解释一下量子力学的基本概念。",
  },
  {
    label: "写一首诗",
    value: "帮我写一首关于秋天的现代诗，意境要优美。",
  },
  {
    label: "React 组件生成",
    value: "帮我写一个 React 计数器组件，使用 TypeScript 和 Tailwind CSS。",
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
  const { setInput, selectSession } = useChatContext();
  const { data: recentSessions } = useQuery(
    trpc.chat.getRecentSessions.queryOptions({
      limit: 3,
    })
  );

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
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {SUGGESTIONS.map((suggestion) => (
                <motion.div key={suggestion.label} variants={item}>
                  <Button
                    variant="outline"
                    className="justify-start h-auto py-3 px-4 text-left whitespace-normal font-normal w-full"
                    onClick={() => setInput(suggestion.value)}
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
      {recentSessions && recentSessions.length > 0 && (
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
