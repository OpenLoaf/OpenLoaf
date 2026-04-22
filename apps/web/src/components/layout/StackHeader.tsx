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
import { AppWindow, ClipboardCopy, Download, Minus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { resolveFileUriFromRoot } from "@/components/project/filesystem/utils/file-system-utils";
import { isElectronEnv } from "@/utils/is-electron-env";
import { useSaveAs } from "@/hooks/use-save-as";

/**
 * StackHeader：左侧 stack 面板的统一顶部栏（MVP）
 * - children 用于自定义标题区（例如 browser tabs）；未提供时回退到 title
 * - onRefresh/onClose 由调用方注入（不同面板可能有不同刷新/关闭语义）
 */
export function StackHeader({
  title,
  children,
  rightSlot,
  rightSlotAfter,
  rightSlotBeforeClose,
  openUri,
  openRootUri,
  onRefresh,
  onClose,
  showMinimize = false,
  onMinimize,
  canClose = true,
  className,
  saveAsOptions,
}: {
  title?: string;
  children?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Optional slot rendered after the refresh button. */
  rightSlotAfter?: React.ReactNode;
  /** Optional slot rendered before the close button. */
  rightSlotBeforeClose?: React.ReactNode;
  openUri?: string;
  /** Optional root uri for resolving relative file paths. */
  openRootUri?: string;
  onRefresh?: () => void;
  onClose?: () => void;
  showMinimize?: boolean;
  onMinimize?: () => void;
  canClose?: boolean;
  className?: string;
  /** Options for the "Save As" button. */
  saveAsOptions?: {
    uri: string;
    name: string;
    projectId?: string;
    sessionId?: string;
    defaultDir?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  };
}) {
  const { t } = useTranslation('common');
  const { handleSaveAs } = useSaveAs();
  /** Open the current file in the system default program. */
  const handleOpenExternal = React.useCallback(async () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!openRootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[\[[^\]]+\]\/?(.*?)\]$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(openRootUri, relativePath);
    })();
    const api = window.openloafElectron;
    if (!api?.openPath) {
      toast.error(t('webOnlyNoLocalFile'));
      return;
    }
    if (!resolvedUri) {
      toast.error(t('filePathNotFound'));
      return;
    }
    const res = await api.openPath({ uri: resolvedUri });
    if (!res?.ok) {
      toast.error(res?.reason ?? t('cannotOpenFile'));
    }
  }, [openRootUri, openUri, t]);

  /** Copy the resolved file path to clipboard. */
  const handleCopyPath = React.useCallback(async () => {
    if (!openUri) return;
    const trimmedUri = openUri.trim();
    if (!trimmedUri) return;
    const resolvedUri = (() => {
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedUri);
      if (hasScheme) return trimmedUri;
      if (!openRootUri) return "";
      const scopedMatch = trimmedUri.match(/^@\[\[[^\]]+\]\/?(.*?)\]$/);
      const relativePath = scopedMatch ? scopedMatch[1] ?? "" : trimmedUri;
      return resolveFileUriFromRoot(openRootUri, relativePath);
    })();
    if (!resolvedUri) return;
    try {
      const url = new URL(resolvedUri);
      const filePath = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, "$1");
      await navigator.clipboard.writeText(filePath);
      toast.success(t('pathCopied'));
    } catch {
      await navigator.clipboard.writeText(resolvedUri);
      toast.success(t('pathCopied'));
    }
  }, [openRootUri, openUri, t]);

  /** Handle "Save As" action. */
  const handleSaveAsClick = React.useCallback(async () => {
    if (!saveAsOptions) return;
    await handleSaveAs(saveAsOptions);
  }, [saveAsOptions, handleSaveAs]);

  return (
    <div className={cn("shrink-0 border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <div className="min-w-0 flex-1 text-sm font-medium pl-2">
          {children ? children : <span className="truncate">{title}</span>}
        </div>
        <div className="flex items-center gap-1">
          {rightSlot}
          {saveAsOptions ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('saveAs')}
                  onClick={handleSaveAsClick}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('saveAs')}</TooltipContent>
            </Tooltip>
          ) : null}
          {openUri && isElectronEnv() ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('openInSystem')}
                  onClick={handleOpenExternal}
                >
                  <AppWindow className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('openInSystem')}</TooltipContent>
            </Tooltip>
          ) : null}
          {openUri ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('copyPath')}
                  onClick={handleCopyPath}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('copyPath')}</TooltipContent>
            </Tooltip>
          ) : null}
          {onRefresh ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={onRefresh} aria-label={t('refresh')}>
                  <RotateCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('refresh')}</TooltipContent>
            </Tooltip>
          ) : null}
          {rightSlotAfter}
          {rightSlotBeforeClose}
          {showMinimize ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Minimize"
              onClick={onMinimize}
              disabled={!onMinimize}
            >
              <Minus className="h-4 w-4" />
            </Button>
          ) : null}
          {canClose && onClose ? (
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
