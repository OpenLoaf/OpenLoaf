/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import { openFilePreview } from "@/components/file/lib/file-preview-store";

export interface VideoWidgetProps {
  /** Optional display title. */
  title?: string;
  /** Project-scoped file ref. */
  fileRef?: string;
}

/** Render a lightweight video widget with a play action. */
export default function VideoWidget({ title, fileRef }: VideoWidgetProps) {
  const { t } = useTranslation('desktop');
  const handlePlay = () => {
    if (!fileRef) return;
    // 逻辑：使用统一预览弹窗播放视频，保持桌面区轻量。
    const videoTitle = title ?? t('catalog.video');
    openFilePreview({
      viewer: "video",
      items: [
        {
          uri: fileRef,
          title: videoTitle,
          name: videoTitle,
        },
      ],
      activeIndex: 0,
    });
  };

  if (!fileRef) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border/70 bg-muted/30 p-4 text-xs text-muted-foreground">
        <div>{t('videoWidget.noFile')}</div>
        <div className="text-[10px]">{t('videoWidget.bindHint')}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border/70 bg-background/80 p-4">
      <div className="text-xs text-muted-foreground">{t('videoWidget.clickToPlay')}</div>
      <Button type="button" size="sm" onClick={handlePlay} className="gap-2">
        <Play className="h-4 w-4" />
        {t('videoWidget.play')}
      </Button>
    </div>
  );
}
