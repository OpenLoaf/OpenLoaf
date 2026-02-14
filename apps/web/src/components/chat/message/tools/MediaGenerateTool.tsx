"use client";

import * as React from "react";
import { ImageIcon, VideoIcon, Loader2 } from "lucide-react";
import { Button } from "@tenas-ai/ui/button";
import { useChatTools } from "../../context";
import type { AnyToolPart } from "./shared/tool-utils";
import { getToolOutputState } from "./shared/tool-utils";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";

type MediaGenerateToolProps = {
  part: AnyToolPart;
  messageId?: string;
};

export default function MediaGenerateTool({ part }: MediaGenerateToolProps) {
  const { toolParts } = useChatTools();
  const toolCallId = part.toolCallId ?? "";
  const toolSnapshot = toolCallId ? toolParts[toolCallId] : undefined;
  const resolvedPart = toolSnapshot ? { ...part, ...toolSnapshot } : part;
  const mg = resolvedPart.mediaGenerate;
  const { hasErrorText } = getToolOutputState(resolvedPart);
  const errorText = resolvedPart.errorText ?? "";
  const kind = mg?.kind ?? (resolvedPart.toolName === "video-generate" ? "video" : "image");
  const KindIcon = kind === "video" ? VideoIcon : ImageIcon;
  const kindLabel = kind === "video" ? "视频" : "图片";

  // 逻辑：错误状态优先渲染。
  if (mg?.status === "error" || (hasErrorText && !mg)) {
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
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          正在生成{kindLabel}
          {typeof progress === "number" ? `（${Math.round(progress)}%）` : "..."}
        </span>
      </div>
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
              src={url}
              controls
              className="max-w-md rounded-lg"
              preload="metadata"
            />
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {mg.urls.map((url, i) => (
          <a
            key={`${url}-${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-border/50 transition-shadow hover:shadow-md"
          >
            <img
              src={url}
              alt={`生成的${kindLabel} ${i + 1}`}
              className="max-h-64 max-w-xs object-contain"
              loading="lazy"
            />
          </a>
        ))}
      </div>
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
              src={url}
              controls
              className="max-w-md rounded-lg"
              preload="metadata"
            />
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <a
            key={`${url}-${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-border/50 transition-shadow hover:shadow-md"
          >
            <img
              src={url}
              alt={`生成的${kindLabel} ${i + 1}`}
              className="max-h-64 max-w-xs object-contain"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    );
  }

  // 逻辑：默认状态（等待中）。
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <KindIcon className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{kindLabel}生成</span>
    </div>
  );
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
