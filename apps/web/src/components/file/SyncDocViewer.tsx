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
import { useMutation } from "@tanstack/react-query";
import { Eye, PencilLine, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DocumentEditorContainerComponent,
  Toolbar as DocToolbar,
  Inject,
} from "@syncfusion/ej2-react-documenteditor";
import type { ToolbarItem } from "@syncfusion/ej2-documenteditor";
import DocViewer from "@/components/file/DocViewer";
import { StackHeader } from "@/components/layout/StackHeader";
import { Button } from "@openloaf/ui/button";
import { useLayoutState } from "@/hooks/use-layout-state";
import { requestStackMinimize } from "@/lib/stack-dock-animation";
import { hasSyncfusionPublicLicense } from "@/lib/syncfusion-license";
import { trpc, trpcClient } from "@/utils/trpc";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

interface SyncDocViewerProps {
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

type SyncDocViewerStatus = "idle" | "loading" | "ready" | "error";
type SyncDocViewerMode = "preview" | "edit";

const LOCAL_SYNCFUSION_TOOLBAR_ITEMS: ToolbarItem[] = [
  "Undo",
  "Redo",
  "Separator",
  "Image",
  "Table",
  "Hyperlink",
  "Bookmark",
  "Header",
  "Footer",
  "PageNumber",
  "Break",
  "Find",
  "LocalClipboard",
];

/** Convert ArrayBuffer to base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Render a DOCX viewer/editor panel using server-side DOCX to SFDT conversion. */
export default function SyncDocViewer({
  uri,
  openUri,
  name,
  ext,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: SyncDocViewerProps) {
  if (!hasSyncfusionPublicLicense) {
    return (
      <DocViewer
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
    <LicensedSyncDocViewer
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

/** Render the Syncfusion DOCX viewer when a public web license is available. */
function LicensedSyncDocViewer({
  uri,
  openUri,
  name,
  projectId,
  rootUri,
  panelKey,
  tabId,
  readOnly,
}: SyncDocViewerProps) {
  const { t } = useTranslation("common");
  const canMinimize = Boolean(tabId);
  const canEdit = readOnly !== true;
  const [mode, setMode] = useState<SyncDocViewerMode>(readOnly === false ? "edit" : "preview");
  const isEditMode = canEdit && mode === "edit";
  const [status, setStatus] = useState<SyncDocViewerStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shouldFallbackToPlate, setShouldFallbackToPlate] = useState(false);
  const containerRef = useRef<DocumentEditorContainerComponent | null>(null);
  const pendingSfdtRef = useRef<string | null>(null);
  const editorReadyRef = useRef(false);
  const openingDocumentRef = useRef(false);
  const removeStackItem = useLayoutState((s) => s.removeStackItem);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const shouldRenderStackHeader = Boolean(tabId && panelKey);
  const writeBinaryMutation = useMutation(trpc.fs.writeBinary.mutationOptions());
  const displayTitle = useMemo(() => name ?? uri ?? "DOCX", [name, uri]);

  /** Resolve the best server-readable path for DOCX conversion. */
  const conversionTarget = useMemo(() => {
    const normalizedUri = (uri ?? "").trim();
    if (normalizedUri) return normalizedUri;
    return (openUri ?? "").trim();
  }, [openUri, uri]);

  const canLoadFromFs =
    conversionTarget.length > 0 &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(conversionTarget) ||
      conversionTarget.startsWith("file://"));
  const canSaveToFs =
    typeof uri === "string" &&
    uri.trim().length > 0 &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) || uri.startsWith("file://"));

  useEffect(() => {
    setMode(readOnly === false ? "edit" : "preview");
    setStatus("idle");
    setIsDirty(false);
    setLoadError(null);
    setShouldFallbackToPlate(false);
    pendingSfdtRef.current = null;
    editorReadyRef.current = false;
    openingDocumentRef.current = false;
  }, [conversionTarget, projectId, readOnly]);

  /** Open SFDT payload in the Syncfusion editor. */
  const applySfdt = useCallback((sfdt: string) => {
    const editor = containerRef.current?.documentEditor;
    if (!editor || !editorReadyRef.current) {
      pendingSfdtRef.current = sfdt;
      return;
    }

    try {
      openingDocumentRef.current = true;
      pendingSfdtRef.current = null;
      editor.open(sfdt);
      // 中文注释：延迟清理加载标记，避免初始化阶段的 contentChange 把文档误判为脏。
      window.setTimeout(() => {
        openingDocumentRef.current = false;
        setStatus("ready");
        setIsDirty(false);
      }, 0);
    } catch (error) {
      openingDocumentRef.current = false;
      setLoadError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!canLoadFromFs || !conversionTarget) return;

    let cancelled = false;
    setStatus("loading");
    setLoadError(null);
    setShouldFallbackToPlate(false);

    void trpcClient.fs.convertDocxToSfdt
      .mutate({
        projectId,
        uri: conversionTarget,
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          if (result.code === "unsupported" || result.code === "helper_missing") {
            setShouldFallbackToPlate(true);
            return;
          }
          setLoadError(result.reason);
          setStatus("error");
          return;
        }
        applySfdt(result.data.sfdt);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    applySfdt,
    canLoadFromFs,
    conversionTarget,
    projectId,
  ]);

  /** Syncfusion created event: apply pending SFDT once the editor is ready. */
  const handleCreated = useCallback(() => {
    editorReadyRef.current = true;
    if (pendingSfdtRef.current) {
      applySfdt(pendingSfdtRef.current);
    }
  }, [applySfdt]);

  const toggleMode = () => {
    if (!canEdit) return;
    setMode((prev) => (prev === "preview" ? "edit" : "preview"));
  };

  const handleSave = useCallback(async () => {
    if (!uri || !canSaveToFs) {
      toast.error(t("file.noSaveTarget"));
      return;
    }
    const editor = containerRef.current?.documentEditor;
    if (!editor) return;
    try {
      const blob = await editor.saveAsBlob("Docx");
      const buffer = await blob.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(buffer);
      await writeBinaryMutation.mutateAsync({
        projectId,
        uri,
        contentBase64,
      });
      setIsDirty(false);
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    }
  }, [canSaveToFs, projectId, t, uri, writeBinaryMutation]);

  if (shouldFallbackToPlate) {
    return (
      <DocViewer
        uri={uri}
        openUri={openUri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        panelKey={panelKey}
        tabId={tabId}
        readOnly={readOnly}
      />
    );
  }

  const showGuard = !conversionTarget || !canLoadFromFs || status === "error";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={openUri ?? uri}
          openRootUri={rootUri}
          rightSlot={
            canEdit ? (
              <div className="flex items-center gap-1">
                {isEditMode ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleSave()}
                    disabled={
                      writeBinaryMutation.isPending ||
                      !canSaveToFs ||
                      status !== "ready" ||
                      !isDirty
                    }
                    aria-label={t("save")}
                    title={t("save")}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMode}
                  aria-label={isEditMode ? t("preview") : t("edit")}
                  title={isEditMode ? t("preview") : t("edit")}
                >
                  {isEditMode ? <Eye className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                </Button>
              </div>
            ) : null
          }
          showMinimize={canMinimize}
          onMinimize={
            canMinimize
              ? () => {
                  if (!tabId) return;
                  requestStackMinimize(tabId);
                }
              : undefined
          }
          onClose={() => {
            if (!tabId || !panelKey) return;
            if (isDirty) {
              const ok = window.confirm(t("file.unsavedDoc"));
              if (!ok) return;
            }
            removeStackItem(panelKey);
          }}
        />
      ) : null}

      {showGuard ? (
        <ViewerGuard
          uri={openUri ?? uri}
          name={name}
          projectId={projectId}
          rootUri={rootUri}
          notSupported={!canLoadFromFs}
          error={status === "error"}
          errorDetail={loadError ?? undefined}
          errorMessage={t("file.docLoadFailed")}
          errorDescription={loadError || t("file.checkFormatOrRetry")}
        >
          <div />
        </ViewerGuard>
      ) : (
        <div className={`relative flex-1 overflow-hidden ${isDark ? "e-dark" : ""}`}>
          {status === "loading" ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
              {t("loading")}
            </div>
          ) : null}
          <DocumentEditorContainerComponent
            ref={(el: DocumentEditorContainerComponent | null) => {
              containerRef.current = el;
            }}
            enableToolbar={isEditMode}
            enableLocalPaste={true}
            restrictEditing={!isEditMode}
            showPropertiesPane={false}
            toolbarItems={LOCAL_SYNCFUSION_TOOLBAR_ITEMS}
            style={{ height: "100%", width: "100%" }}
            contentChange={() => {
              if (openingDocumentRef.current) return;
              setIsDirty(true);
            }}
            created={handleCreated}
          >
            <Inject services={[DocToolbar]} />
          </DocumentEditorContainerComponent>
        </div>
      )}
    </div>
  );
}
