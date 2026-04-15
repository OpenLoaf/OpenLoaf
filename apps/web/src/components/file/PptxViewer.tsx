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

import { useMemo } from "react";
import { Presentation } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { StackHeader } from "@/components/layout/StackHeader";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";

interface PptxViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  /** Chat session id — accepted for future parity; not consumed today. */
  sessionId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
}

/** Render a PPTX preview placeholder with system open option. */
export default function PptxViewer({
  uri,
  openUri,
  name,
  rootUri,
  panelKey,
  tabId,
}: PptxViewerProps) {
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
  const displayTitle = useMemo(() => name ?? uri ?? "PPTX", [name, uri]);

  /** Open PPTX with system default application. */
  const handleOpenWithSystem = () => {
    const target = openUri ?? uri;
    if (!target) return;
    const trimmedUri = target.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!rootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[\[[^\]]+\]\/?(.*?)\]$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(rootUri, relativePath);
    })();
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error("网页版不支持打开本地文件");
      return;
    }
    if (!resolvedUri) {
      toast.error("未找到文件路径");
      return;
    }
    void api.openPath({ uri: resolvedUri }).then((res) => {
      if (!res?.ok) {
        toast.error(res?.reason ?? "无法打开文件");
      }
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        showMinimize={canMinimize}
        onMinimize={
          canMinimize
            ? () => {
                requestStackMinimize(tabId!);
              }
            : undefined
        }
        onClose={
          canClose
            ? () => {
                removeStackItem(panelKey!);
              }
            : undefined
        }
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <Presentation className="h-16 w-16 text-muted-foreground/50" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{displayTitle}</p>
          <p className="mt-1 text-xs">PowerPoint 演示文稿暂不支持内置预览</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenWithSystem}>
          使用系统应用打开
        </Button>
      </div>
    </div>
  );
}
