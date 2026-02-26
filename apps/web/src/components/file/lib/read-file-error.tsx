"use client";

import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { createFileEntryFromUri, openWithDefaultApp } from "./open-file";
import { isElectronEnv } from "@/utils/is-electron-env";

type ReadFileErrorFallbackProps = {
  uri?: string;
  name?: string;
  projectId?: string;
  rootUri?: string;
  error?: unknown;
  tooLarge?: boolean;
  /** Optional override message shown in the fallback UI. */
  message?: string;
  /** Optional helper text shown below the message. */
  description?: string;
  /** Force showing the system-open/download actions. */
  forceAction?: boolean;
  className?: string;
};

/** Normalize a friendly error message from unknown error input. */
function resolveErrorMessage(error?: unknown): string {
  if (!error) return "读取失败";
  if (error instanceof Error) return error.message || "读取失败";
  return String(error);
}

/** Check whether an error indicates the file is too large to preview. */
export function isFileTooLargeError(error?: unknown): boolean {
  const message = resolveErrorMessage(error).toLowerCase();
  return message.includes("文件过大") || message.includes("too large") || message.includes("file too large");
}

/** Detect whether the error is caused by oversized file preview. */
/** Decode base64 payload into Uint8Array. */
function decodeBase64ToUint8Array(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Resolve a download filename from name or uri. */
function resolveDownloadName(name?: string, uri?: string): string {
  const raw = (name ?? uri ?? "file").trim();
  const base = raw.split("/").pop() ?? raw;
  return base || "file";
}

/** Render a fallback UI when fs.readFile fails. */
export function ReadFileErrorFallback({
  uri,
  name,
  projectId,
  rootUri,
  error,
  tooLarge,
  message,
  description,
  forceAction,
  className,
}: ReadFileErrorFallbackProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const queryClient = useQueryClient();
  const [isWorking, setIsWorking] = useState(false);
  const entry = useMemo(
    () => (uri ? createFileEntryFromUri({ uri, name }) : null),
    [name, uri]
  );
  const isElectron = useMemo(() => isElectronEnv(), []);
  // 逻辑：显式需要动作或超大文件时，显示系统打开/下载入口。
  const showFallbackAction =
    Boolean(forceAction) ||
    Boolean(tooLarge) ||
    Boolean(error && resolveErrorMessage(error).includes("文件过大"));
  const messageText = message ?? (showFallbackAction ? "文件过大，无法在线预览" : resolveErrorMessage(error));
  const descriptionText =
    description ??
    (showFallbackAction ? "文件较大，建议使用系统程序或下载后查看。" : "请稍后重试或检查文件权限。");

  /** Open file via system handler in Electron. */
  const handleSystemOpen = () => {
    if (!entry) {
      toast.error("未找到文件信息");
      return;
    }
    openWithDefaultApp(entry, rootUri);
  };

  /** Download file via readBinary for web fallback. */
  const handleDownload = async () => {
    if (!uri || !workspaceId || !projectId) {
      toast.error("无法下载文件");
      return;
    }
    if (isWorking) return;
    setIsWorking(true);
    try {
      const result = await queryClient.fetchQuery(
        trpc.fs.readBinary.queryOptions({ workspaceId, projectId, uri })
      );
      if (!result?.contentBase64) {
        toast.error("下载失败");
        return;
      }
      // 逻辑：转成 blob 后触发浏览器下载，避免内联预览超大文本。
      const bytes = decodeBase64ToUint8Array(result.contentBase64);
      const blobData = new Uint8Array(bytes.byteLength);
      blobData.set(bytes);
      const blob = new Blob([blobData], {
        type: result.mime || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resolveDownloadName(name, uri);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error)?.message ?? "下载失败");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div
      className={
        className ??
        "flex h-full w-full items-center justify-center p-6"
      }
    >
      <div className="w-full max-w-md">
        <div className="rounded-lg p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="mt-4 text-sm font-semibold text-foreground">
            {messageText || "读取失败"}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {descriptionText}
          </div>
          {showFallbackAction ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {isElectron ? (
                <Button type="button" variant="outline" size="sm" onClick={handleSystemOpen}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  用系统程序打开
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isWorking}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  下载后打开
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
