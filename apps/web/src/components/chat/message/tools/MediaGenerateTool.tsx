"use client";

import * as React from "react";
import { ImageIcon, VideoIcon, Loader2 } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import { useChatTools, useChatSession } from "../../context";
import type { AnyToolPart } from "./shared/tool-utils";
import { getToolOutputState } from "./shared/tool-utils";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { getPreviewEndpoint } from "@/lib/image/uri";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

// 逻辑：相对路径通过预览端点加载，绝对 URL 保持不变。
function resolveMediaUrl(
  url: string,
  ctx?: { workspaceId?: string; projectId?: string },
): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url
  return getPreviewEndpoint(url, ctx)
}

type MediaGenerateToolProps = {
  part: AnyToolPart;
  messageId?: string;
};

export default function MediaGenerateTool({ part }: MediaGenerateToolProps) {
  const { toolParts } = useChatTools();
  const { workspaceId, projectId } = useChatSession();
  const previewCtx = React.useMemo(
    () => ({ workspaceId, projectId }),
    [workspaceId, projectId],
  );
  const toolCallId = part.toolCallId ?? "";
  const toolSnapshot = toolCallId ? toolParts[toolCallId] : undefined;
  const resolvedPart = toolSnapshot ? { ...part, ...toolSnapshot } : part;
  const mg = resolvedPart.mediaGenerate;
  const { hasErrorText } = getToolOutputState(resolvedPart);
  const errorText = resolvedPart.errorText ?? "";
  const kind = mg?.kind ?? (resolvedPart.output as any)?.kind ?? (resolvedPart.toolName === "video-generate" ? "video" : "image");
  const KindIcon = kind === "video" ? VideoIcon : ImageIcon;
  const kindLabel = kind === "video" ? "视频" : "图片";

  // 逻辑：错误状态优先渲染（hasErrorText 独立判断，避免 toolSnapshot 中残留的 mg 遮盖错误）。
  if (mg?.status === "error" || hasErrorText) {
    return (
      <MediaGenerateError
        errorCode={mg?.errorCode ?? "generation_failed"}
        errorText={errorText || `${kindLabel}生成失败`}
        kindLabel={kindLabel}
      />
    );
  }

  // 逻辑：生成中状态。
  if (mg?.status === "generating" || (!mg && !hasErrorText && !resolvedPart.output)) {
    const progress = mg?.progress;
    return (
      <MediaGenerateLoading kind={kind} progress={progress} kindLabel={kindLabel} KindIcon={KindIcon} />
    );
  }

  // 逻辑：生成完成状态。
  if (mg?.status === "done" && mg.urls && mg.urls.length > 0) {
    if (kind === "video") {
      return (
        <div className="space-y-2">
          {mg.urls.map((url, i) => (
            <video
              key={`${url}-${i}`}
              src={resolveMediaUrl(url, previewCtx)}
              controls
              className="max-w-md rounded-lg"
              preload="metadata"
            />
          ))}
        </div>
      );
    }
    return (
      <ImageGrid
        urls={mg.urls}
        kindLabel={kindLabel}
        previewCtx={previewCtx}
      />
    );
  }

  // 逻辑：从 tool output 中提取 URL（兜底）。
  const output = resolvedPart.output as Record<string, unknown> | undefined;
  if (output?.success && Array.isArray(output.urls) && output.urls.length > 0) {
    const urls = output.urls as string[];
    if (kind === "video") {
      return (
        <div className="space-y-2">
          {urls.map((url, i) => (
            <video
              key={`${url}-${i}`}
              src={resolveMediaUrl(url, previewCtx)}
              controls
              className="max-w-md rounded-lg"
              preload="metadata"
            />
          ))}
        </div>
      );
    }
    return (
      <ImageGrid
        urls={urls}
        kindLabel={kindLabel}
        previewCtx={previewCtx}
      />
    );
  }

  // 逻辑：默认状态（等待中）。
  return (
    <MediaGenerateLoading kind={kind} kindLabel={kindLabel} KindIcon={KindIcon} />
  );
}

// 逻辑：图片网格组件，点击后在左侧 stack 中打开 ImageViewer。
function ImageGrid({
  urls,
  kindLabel,
  previewCtx,
}: {
  urls: string[]
  kindLabel: string
  previewCtx?: { workspaceId?: string; projectId?: string }
}) {
  const { tabId } = useChatSession()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

  const handleClick = (index: number) => {
    if (!tabId) return
    const url = urls[index]
    const resolvedUri = resolveMediaUrl(url, previewCtx)
    pushStackItem(tabId, {
      id: `generated-image:${resolvedUri}`,
      component: 'image-viewer',
      title: `生成的${kindLabel}`,
      params: {
        uri: resolvedUri,
        name: `生成的${kindLabel}`,
      },
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <button
          key={`${url}-${i}`}
          type="button"
          onClick={() => handleClick(i)}
          className="block overflow-hidden rounded-lg border border-border/50 transition-shadow hover:shadow-md cursor-pointer"
        >
          <img
            src={resolveMediaUrl(url, previewCtx)}
            alt={`生成的${kindLabel} ${i + 1}`}
            className="max-h-64 max-w-xs object-contain"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}

// 逻辑：生成中占位卡片，模拟最终媒体尺寸并叠加 loading overlay。
function MediaGenerateLoading({
  kind,
  progress,
  kindLabel,
  KindIcon,
}: {
  kind: string
  progress?: number
  kindLabel: string
  KindIcon: React.ElementType
}) {
  const hasProgress = typeof progress === 'number'
  const aspectClass = kind === 'video' ? 'aspect-video' : 'aspect-[4/3]'
  return (
    <div
      className={`relative max-w-xs overflow-hidden rounded-lg border border-border/50 bg-muted/40 ${aspectClass}`}
    >
      {/* 逻辑：脉冲动画模拟骨架屏效果。 */}
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60" />
      {/* 逻辑：居中 overlay 显示图标、spinner 和进度。 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <KindIcon className="size-8 text-muted-foreground/40" />
          <Loader2 className="absolute -inset-2 size-12 animate-spin text-muted-foreground/60" />
        </div>
        <span className="text-xs text-muted-foreground/80">
          {hasProgress ? `${Math.round(progress)}%` : `正在生成${kindLabel}...`}
        </span>
      </div>
    </div>
  )
}

function MediaGenerateError({
  errorCode,
  errorText,
  kindLabel,
}: {
  errorCode: string;
  errorText: string;
  kindLabel: string;
}) {
  const [loginOpen, setLoginOpen] = React.useState(false);

  if (errorCode === "login_required") {
    return (
      <>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {errorText || `需要登录才能生成${kindLabel}`}
          </span>
          <Button size="sm" variant="outline" onClick={() => setLoginOpen(true)}>
            登录
          </Button>
        </div>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  if (errorCode === "insufficient_credits") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
        <span className="text-xs text-destructive">
          {errorText || "积分不足"}
        </span>
      </div>
    );
  }

  if (errorCode === "no_model") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <span className="text-xs text-amber-700 dark:text-amber-300">
          {errorText || `未选择${kindLabel}生成模型`}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
      <span className="text-xs text-destructive">
        {errorText || `${kindLabel}生成失败`}
      </span>
    </div>
  );
}
