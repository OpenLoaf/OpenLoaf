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

import * as React from "react";
import { ImageIcon, Play, VideoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatTools, useChatSession } from "../../context";
import type { AnyToolPart } from "./shared/tool-utils";
import { getToolOutputState } from "./shared/tool-utils";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { getPreviewEndpoint, resolveFileName } from "@/lib/image/uri";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import {
  Attachment,
  Attachments,
  AttachmentPreview,
} from "@/components/ai-elements/attachments";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

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

type GeneratedMediaKind = "image" | "video";

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
  const kind =
    mg?.kind ??
    (resolvedPart.output as any)?.kind ??
    (resolvedPart.toolName === "video-generate" ? "video" : "image");
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
      <MediaGenerateLoading
        kind={kind}
        progress={progress}
        kindLabel={kindLabel}
        KindIcon={KindIcon}
      />
    );
  }

  // 逻辑：生成完成状态。
  if (mg?.status === "done" && mg.urls && mg.urls.length > 0) {
    return (
      <MediaAttachmentList
        urls={mg.urls}
        kind={kind}
        kindLabel={kindLabel}
        previewCtx={previewCtx}
      />
    );
  }

  // 逻辑：从 tool output 中提取 URL（兜底）。
  const output = resolvedPart.output as Record<string, unknown> | undefined;
  if (output?.success && Array.isArray(output.urls) && output.urls.length > 0) {
    return (
      <MediaAttachmentList
        urls={output.urls as string[]}
        kind={kind}
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

type MediaAttachmentRecord = {
  /** Attachment id for React rendering. */
  id: string;
  /** Original source url. */
  sourceUrl: string;
  /** Resolved preview url. */
  previewUrl: string;
  /** Attachment filename shown in list mode. */
  filename: string;
  /** MIME type for ai-elements attachment renderer. */
  mediaType: string;
};

/** Build attachment records for ai-elements. */
function buildMediaAttachments(input: {
  urls: string[];
  kind: GeneratedMediaKind;
  previewCtx?: { workspaceId?: string; projectId?: string };
}): MediaAttachmentRecord[] {
  const { urls, kind, previewCtx } = input;
  return urls.map((url, index) => {
    const mediaType = kind === "video" ? "video/mp4" : "image/png";
    return {
      id: `${kind}:${index}:${url}`,
      sourceUrl: url,
      previewUrl: resolveMediaUrl(url, previewCtx),
      filename: resolveFileName(url, mediaType),
      mediaType,
    };
  });
}

// 逻辑：媒体附件列表，图片/视频点击后在左侧 stack 打开对应 viewer。
function MediaAttachmentList({
  urls,
  kind,
  kindLabel,
  previewCtx,
}: {
  urls: string[];
  kind: GeneratedMediaKind;
  kindLabel: string;
  previewCtx?: { workspaceId?: string; projectId?: string };
}) {
  const { tabId } = useChatSession();
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const attachments = React.useMemo(
    () => buildMediaAttachments({ urls, kind, previewCtx }),
    [urls, kind, previewCtx],
  );

  const openMediaViewer = (record: MediaAttachmentRecord) => {
    if (!tabId) return;
    if (kind === "image") {
      pushStackItem(tabId, {
        id: `generated-image:${record.previewUrl}`,
        component: "image-viewer",
        title: `生成的${kindLabel}`,
        params: {
          uri: record.previewUrl,
          name: `生成的${kindLabel}`,
        },
      });
    } else {
      pushStackItem(tabId, {
        id: `generated-video:${record.sourceUrl}`,
        component: "video-viewer",
        title: `生成的${kindLabel}`,
        params: {
          uri: record.sourceUrl,
          name: `生成的${kindLabel}`,
          workspaceId: previewCtx?.workspaceId,
          __customHeader: true,
        },
      });
    }
  };

  // 视频：全宽视频预览卡片
  if (kind === "video") {
    return (
      <div className="w-full max-w-lg min-w-0 pl-1">
        {attachments.map((record) => (
          <button
            key={record.id}
            type="button"
            onClick={() => openMediaViewer(record)}
            className="group relative w-full overflow-hidden rounded-lg"
          >
            <video
              src={record.previewUrl}
              className="aspect-video w-full object-cover"
              muted
              preload="metadata"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-white/30">
                <Play className="size-5 fill-white text-white" />
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // 图片：网格布局，每行最多 2 张
  return (
    <div className="w-full max-w-lg min-w-0 pl-1">
      <Attachments variant="grid" className="ml-0 w-full">
        {attachments.map((record) => (
          <Attachment
            key={record.id}
            data={
              {
                id: record.id,
                type: "file",
                url: record.previewUrl,
                filename: record.filename,
                mediaType: record.mediaType,
              } as any
            }
            onClick={() => openMediaViewer(record)}
            className="cursor-pointer !size-auto !w-[calc(50%-4px)] aspect-square"
            title={record.sourceUrl}
          >
            <AttachmentPreview />
          </Attachment>
        ))}
      </Attachments>
    </div>
  );
}

// 逻辑：生成中占位卡片，使用 ai-elements shimmer 表达流式生成状态。
function MediaGenerateLoading({
  kind,
  progress,
  kindLabel,
  KindIcon,
}: {
  kind: string;
  progress?: number;
  kindLabel: string;
  KindIcon: React.ElementType;
}) {
  const hasProgress = typeof progress === "number";
  const statusText = hasProgress
    ? `正在生成${kindLabel} ${Math.round(progress)}%`
    : `正在生成${kindLabel}...`;
  const ratioClass = kind === "video" ? "aspect-video" : "aspect-[4/3]";

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          "relative max-w-xs overflow-hidden rounded-lg border border-border/50 bg-muted/40",
          ratioClass,
        )}
      >
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <KindIcon className="size-8 text-muted-foreground/50" />
          <Shimmer className="text-xs text-muted-foreground">{statusText}</Shimmer>
        </div>
      </div>
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
        <div className="flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {errorText || `需要登录才能生成${kindLabel}`}
          </span>
          <PromptInputButton
            size="sm"
            variant="outline"
            onClick={() => setLoginOpen(true)}
          >
            登录
          </PromptInputButton>
        </div>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  if (errorCode === "insufficient_credits") {
    return (
      <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
        <span className="text-xs text-destructive">{errorText || "积分不足"}</span>
      </div>
    );
  }

  if (errorCode === "no_model") {
    return (
      <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <span className="text-xs text-amber-700 dark:text-amber-300">
          {errorText || `未选择${kindLabel}生成模型`}
        </span>
      </div>
    );
  }

  return (
    <div className="ml-2 w-full max-w-[90%] rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
      <span className="text-xs text-destructive">
        {errorText || `${kindLabel}生成失败`}
      </span>
    </div>
  );
}
