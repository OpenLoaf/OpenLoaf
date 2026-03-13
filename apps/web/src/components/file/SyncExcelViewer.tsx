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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { SpreadsheetComponent } from "@syncfusion/ej2-react-spreadsheet";
import ExcelViewer from "@/components/file/ExcelViewer";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@openloaf/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { hasSyncfusionPublicLicense } from "@/lib/syncfusion-license";
import { trpc } from "@/utils/trpc";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

interface SyncExcelViewerProps {
  uri?: string;
  openUri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  rootUri?: string;
  panelKey?: string;
  tabId?: string;
  readOnly?: boolean;
}

/** Convert base64 payload into Blob. */
function base64ToBlob(payload: string, mimeType: string): Blob {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/** Render an Excel viewer/editor panel using Syncfusion Spreadsheet. */
export default function SyncExcelViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: SyncExcelViewerProps) {
  if (!hasSyncfusionPublicLicense) {
    return (
      <ExcelViewer
        uri={uri}
        openUri={openUri}
        name={name}
        ext={ext}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        tabId={tabId}
        readOnly={readOnly}
      />
    );
  }

  return (
    <LicensedSyncExcelViewer
      uri={uri}
      openUri={openUri}
      name={name}
      ext={ext}
      projectId={projectId}
      rootUri={rootUri}
      panelKey={panelKey}
      tabId={tabId}
      readOnly={readOnly}
    />
  );
}

/** Render the Syncfusion spreadsheet viewer when a public web license is available. */
function LicensedSyncExcelViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: SyncExcelViewerProps) {
  const { t } = useTranslation("common");
  const canMinimize = Boolean(tabId);
  const canClose = Boolean(tabId && panelKey);
  const canEdit = !readOnly;
  const [isEditing, setIsEditing] = useState(false);
  const isReadOnly = !canEdit || !isEditing;
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const spreadsheetRef = useRef<SpreadsheetComponent | null>(null);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const pendingFileRef = useRef<File | null>(null);
  const editorReadyRef = useRef(false);

  const shouldUseFs =
    typeof uri === "string" &&
    uri.trim().length > 0 &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith("file://"));

  const fileQuery = useQuery({
    ...trpc.fs.readBinary.queryOptions({
      projectId,
      uri: uri ?? "",
    }),
    enabled: shouldUseFs && Boolean(uri),
  });

  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const displayTitle = useMemo(() => name ?? uri ?? "Excel", [name, uri]);

  useEffect(() => {
    setStatus("idle");
    setIsDirty(false);
    setIsEditing(false);
    pendingFileRef.current = null;
    editorReadyRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (!canEdit) setIsEditing(false);
  }, [canEdit]);

  /** 尝试在 spreadsheet 上打开文件 */
  const tryOpenFile = useCallback((file: File) => {
    if (spreadsheetRef.current && editorReadyRef.current) {
      spreadsheetRef.current.open({ file });
      setStatus("ready");
      setIsDirty(false);
      pendingFileRef.current = null;
    } else {
      pendingFileRef.current = file;
    }
  }, []);

  useEffect(() => {
    if (!shouldUseFs) return;
    if (fileQuery.isLoading) {
      setStatus("loading");
      return;
    }
    if (fileQuery.isError) {
      setStatus("error");
      return;
    }
    if (!fileQuery.isSuccess) return;
    const payload = fileQuery.data?.contentBase64;
    if (!payload) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    const mimeType =
      ext?.toLowerCase() === "xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = base64ToBlob(payload, mimeType);
    const file = new File([blob], name ?? "file.xlsx", { type: mimeType });
    tryOpenFile(file);
  }, [
    fileQuery.data?.contentBase64,
    fileQuery.isError,
    fileQuery.isLoading,
    fileQuery.isSuccess,
    shouldUseFs,
    ext,
    name,
    tryOpenFile,
  ]);

  /** Syncfusion created 事件 */
  const handleCreated = useCallback(() => {
    editorReadyRef.current = true;
    if (pendingFileRef.current && spreadsheetRef.current) {
      const file = pendingFileRef.current;
      pendingFileRef.current = null;
      spreadsheetRef.current.open({ file });
      setStatus("ready");
      setIsDirty(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!uri || !shouldUseFs || !spreadsheetRef.current) {
      toast.error(t("file.noSaveTarget"));
      return;
    }
    try {
      const saveType = ext?.toLowerCase() === "xls" ? "Xls" : "Xlsx";
      spreadsheetRef.current.save({
        url: "",
        fileName: name ?? "file.xlsx",
        saveType: saveType as any,
      });
      setIsDirty(false);
      toast.success(t("saved"));
    } catch (error) {
      console.error("[SyncExcelViewer] save failed", error);
      toast.error(t("saveFailed"));
    }
  }, [ext, name, shouldUseFs, t, uri]);

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择表格</div>;
  }

  const showGuard = !shouldUseFs || status === "error" || fileQuery.isError;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <StackHeader
        title={displayTitle}
        openUri={openUri}
        openRootUri={rootUri}
        rightSlot={
          canEdit ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing((prev) => !prev)}
                aria-pressed={isEditing}
              >
                {isEditing ? "只读" : "编辑"}
              </Button>
              {!isReadOnly ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("save")}
                      onClick={() => void handleSave()}
                      disabled={!shouldUseFs || status !== "ready" || writeBinaryMutation.isPending}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("save")}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          ) : null
        }
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
                if (isDirty) {
                  const ok = window.confirm(t("file.unsavedSheet"));
                  if (!ok) return;
                }
                removeStackItem(panelKey!);
              }
            : undefined
        }
      />
      {showGuard ? (
        <ViewerGuard
          uri={uri}
          name={name}
          projectId={projectId}
          rootUri={rootUri}
          notSupported={!shouldUseFs}
          error={status === "error" || fileQuery.isError}
          errorDetail={fileQuery.error ?? undefined}
          errorMessage={t("file.sheetLoadFailed")}
          errorDescription={t("file.checkFormatOrRetry")}
        >
          <div />
        </ViewerGuard>
      ) : (
        <div className={`relative flex-1 overflow-hidden ${isDark ? "e-dark" : ""}`}>
          {status === "loading" || fileQuery.isLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
              {t("loading")}
            </div>
          ) : null}
          <SpreadsheetComponent
            ref={(el: SpreadsheetComponent | null) => {
              spreadsheetRef.current = el;
            }}
            allowEditing={!isReadOnly}
            showRibbon={!isReadOnly}
            showSheetTabs
            allowOpen
            allowSave={!isReadOnly}
            openUrl=""
            saveUrl=""
            style={{ height: "100%", width: "100%" }}
            cellEdit={() => setIsDirty(true)}
            created={handleCreated}
          />
        </div>
      )}
    </div>
  );
}
