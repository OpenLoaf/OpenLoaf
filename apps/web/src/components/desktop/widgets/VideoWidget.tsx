"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openFilePreview } from "@/components/file/lib/file-preview-store";

export interface VideoWidgetProps {
  /** Optional display title. */
  title?: string;
  /** Project-scoped file ref. */
  fileRef?: string;
}

/** Render a lightweight video widget with a play action. */
export default function VideoWidget({ title, fileRef }: VideoWidgetProps) {
  const handlePlay = () => {
    if (!fileRef) return;
    // 逻辑：使用统一预览弹窗播放视频，保持桌面区轻量。
    openFilePreview({
      viewer: "video",
      items: [
        {
          uri: fileRef,
          title: title ?? "视频",
          name: title ?? "视频",
        },
      ],
      activeIndex: 0,
    });
  };

  if (!fileRef) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-xs text-muted-foreground">
        <div>未选择视频</div>
        <div className="text-[10px]">请在设置中绑定视频</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="text-xs text-muted-foreground">点击播放视频</div>
      <Button type="button" size="sm" onClick={handlePlay} className="gap-2">
        <Play className="h-4 w-4" />
        播放
      </Button>
    </div>
  );
}
