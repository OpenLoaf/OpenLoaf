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

export default function MessageHelper() {
  const { setInput } = useChatContext();

  return (
    <Empty className="h-full">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion.label}
                variant="outline"
                className="justify-start h-auto py-3 px-4 text-left whitespace-normal font-normal"
                onClick={() => setInput(suggestion.value)}
              >
                {suggestion.label}
              </Button>
            ))}
          </div>
        </div>
      </EmptyContent>
    </Empty>
  );
}