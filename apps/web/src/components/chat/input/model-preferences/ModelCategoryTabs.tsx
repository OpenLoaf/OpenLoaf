'use client'

import { Tabs, TabsList, TabsTrigger } from '@tenas-ai/ui/tabs'
import { Image, MessageSquare, Video } from 'lucide-react'

interface ModelCategoryTabsProps {
  value: string
  onValueChange: (value: string) => void
}

export function ModelCategoryTabs({
  value,
  onValueChange,
}: ModelCategoryTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className="grid h-7 w-full grid-cols-3 items-center rounded-lg border-0 p-0">
        <TabsTrigger value="chat" className="h-7 text-xs leading-none">
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            对话
          </span>
        </TabsTrigger>
        <TabsTrigger value="image" className="h-7 text-xs leading-none">
          <span className="inline-flex items-center gap-1">
            <Image className="h-3 w-3" />
            图像
          </span>
        </TabsTrigger>
        <TabsTrigger value="video" className="h-7 text-xs leading-none">
          <span className="inline-flex items-center gap-1">
            <Video className="h-3 w-3" />
            视频
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
