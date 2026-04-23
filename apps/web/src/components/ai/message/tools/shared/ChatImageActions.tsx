/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Hover overlay actions for chat images — "引用" (insert attachment mention
 * into ChatInput) and "下载" (save image via Electron save dialog or browser
 * download). Consumers position `<ChatImageActions>` as an absolute child of
 * a `relative` image wrapper; the overlay fades in on wrapper hover via the
 * `group-hover:` utility.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { DownloadIcon, QuoteIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { insertChatImageMention } from "@/lib/image/drag";
import { fetchBlobFromUri } from "@/lib/image/uri";
import { useChatSession } from "@/components/ai/context";

type ChatImageActionsProps = {
  /** Image source — relative path, http(s) URL, blob:, or data: URI. */
  url: string;
  /** Friendly display label (goes into attachment tag `name` when inserting). */
  name?: string;
  /**
   * Resolved object URL for same-origin blob (used by download when `url` is
   * a relative path that cannot be fetched directly in the browser).
   */
  objectUrl?: string;
  /** Extra class names for the overlay container. */
  className?: string;
};

/** Derive a safe filename from url + friendly name. */
function deriveDownloadName(url: string, name?: string): string {
  const friendly = name?.trim();
  if (friendly) {
    // If friendly already ends with extension, keep it; else append from url.
    if (/\.[a-zA-Z0-9]{1,8}$/.test(friendly)) return friendly;
  }
  const base = friendly || "image";
  const extMatch = url.match(/\.([a-zA-Z0-9]{1,8})(?:[?#]|$)/);
  const ext = extMatch?.[1]?.toLowerCase() || "png";
  return `${base}.${ext}`;
}

/** Trigger a browser download using an anchor click. */
function triggerBrowserDownload(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ChatImageActions({
  url,
  name,
  objectUrl,
  className,
}: ChatImageActionsProps) {
  const { projectId, sessionId } = useChatSession();
  const [saving, setSaving] = React.useState(false);

  const handleInsert = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      const ok = insertChatImageMention({ url, name });
      if (!ok) toast.error("无法引用该图片");
    },
    [name, url],
  );

  const handleDownload = React.useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const fileName = deriveDownloadName(url, name);
        const isHttp = /^https?:\/\//i.test(url);
        // Electron: use native save dialog so user picks destination.
        const api = (window as any).openloafElectron;
        if (api?.saveFile) {
          // Fetch bytes: http url directly; relative path via preview endpoint.
          const blob = isHttp
            ? await fetch(url, { mode: "cors" }).then((r) => r.blob()).catch(() => null)
            : await fetchBlobFromUri(url, {
                projectId: projectId ?? undefined,
                sessionId: sessionId ?? undefined,
              }).catch(() => null);
          if (!blob) {
            toast.error("下载失败");
            return;
          }
          const buffer = await blob.arrayBuffer();
          // Chunk-encode base64 to avoid call stack overflow on large images.
          const bytes = new Uint8Array(buffer);
          const chunkSize = 0x8000;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const contentBase64 = btoa(binary);
          const ext = fileName.split(".").pop() || "png";
          const result = await api.saveFile({
            contentBase64,
            suggestedName: fileName,
            filters: [{ name: "Image", extensions: [ext] }],
          });
          if (!result?.ok) {
            if (result?.canceled) return;
            toast.error(result?.reason ?? "保存失败");
          }
          return;
        }
        // Web fallback: network URL → anchor download; relative → fetch blob → objectURL.
        if (isHttp) {
          triggerBrowserDownload(url, fileName);
          return;
        }
        const source = objectUrl;
        if (source) {
          triggerBrowserDownload(source, fileName);
          return;
        }
        const blob = await fetchBlobFromUri(url, {
          projectId: projectId ?? undefined,
          sessionId: sessionId ?? undefined,
        });
        const tempUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(tempUrl, fileName);
        setTimeout(() => URL.revokeObjectURL(tempUrl), 5000);
      } catch {
        toast.error("下载失败");
      } finally {
        setSaving(false);
      }
    },
    [name, objectUrl, projectId, saving, sessionId, url],
  );

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-1.5 right-1.5 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/image:pointer-events-auto group-hover/image:opacity-100",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleInsert}
        aria-label="引用到输入框"
        title="引用到输入框"
        className="inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
      >
        <QuoteIcon className="size-3" />
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={saving}
        aria-label="下载"
        title="下载"
        className="inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-50"
      >
        <DownloadIcon className="size-3" />
      </button>
    </div>
  );
}
