"use client";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function MessageHelper() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia>
          <div className="text-muted-foreground text-4xl">💬</div>
        </EmptyMedia>
        <EmptyTitle>
          开始对话
        </EmptyTitle>
        <EmptyDescription>
          输入你的问题或想法，我会尽力为你提供帮助
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="text-sm text-muted-foreground">
          你可以问我任何问题，例如：
          <ul className="mt-2 space-y-1 text-left">
            <li>• 如何学习编程？</li>
            <li>• 解释量子力学的基本概念</li>
            <li>• 帮我写一首诗</li>
          </ul>
        </div>
      </EmptyContent>
    </Empty>
  );
}
