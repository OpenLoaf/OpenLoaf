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

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { resolveServerUrl } from "@/utils/server-url";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { FolderOpen, Layers, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { S3ProviderDialog } from "@/components/setting/menus/provider/S3ProviderDialog";
import { S3ProviderSection } from "@/components/setting/menus/provider/S3ProviderSection";
import {
  useProviderManagement,
  type S3ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

/**
 * Manage object storage providers and global S3 preferences.
 */
export function ObjectStorageService() {
  const { t } = useTranslation("settings");
  const { t: tProject } = useTranslation("project", { keyPrefix: "global" });
  const [testingS3Key, setTestingS3Key] = useState<string | null>(null);
  const [s3TestDialogOpen, setS3TestDialogOpen] = useState(false);
  const [s3TestUrl, setS3TestUrl] = useState("");
  const [s3TestError, setS3TestError] = useState("");
  const [s3TestCopyMessage, setS3TestCopyMessage] = useState("");
  const s3TestUrlInputRef = useRef<HTMLInputElement>(null);
  const { basic, setBasic } = useBasicConfig();
  const statsQuery = useQuery({
    ...trpc.chat.getChatStats.queryOptions(),
    staleTime: 5000,
  });
  const clearAllChat = useMutation(
    trpc.chat.clearAllChat.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          tProject("settings.sessionsClearedSuccess", { count: result.deletedSessions }),
        );
        queryClient.invalidateQueries();
      },
    }),
  );
  const clearUnboundBoards = useMutation(
    trpc.board.clearUnboundBoards.mutationOptions({
      onSuccess: (result) => {
        if (result.deletedBoards > 0) {
          toast.success(
            tProject("settings.clearCanvasSuccess", { count: result.deletedBoards }),
          );
        } else {
          toast.info(tProject("settings.clearCanvasEmpty"));
        }
        queryClient.invalidateQueries();
      },
      onError: () => {
        toast.error(tProject("settings.clearCanvasError"));
      },
    }),
  );
  const {
    s3Entries,
    s3DialogOpen,
    setS3DialogOpen,
    editingS3Key,
    confirmS3DeleteId,
    setConfirmS3DeleteId,
    draftS3ProviderId,
    setDraftS3ProviderId,
    draftS3Name,
    setDraftS3Name,
    draftS3Endpoint,
    setDraftS3Endpoint,
    draftS3Region,
    setDraftS3Region,
    draftS3Bucket,
    setDraftS3Bucket,
    draftS3ForcePathStyle,
    setDraftS3ForcePathStyle,
    draftS3PublicBaseUrl,
    setDraftS3PublicBaseUrl,
    draftS3AccessKeyId,
    setDraftS3AccessKeyId,
    draftS3SecretAccessKey,
    setDraftS3SecretAccessKey,
    showS3SecretKey,
    setShowS3SecretKey,
    s3Error,
    openS3Editor,
    submitS3Draft,
    deleteS3Provider,
    S3_PROVIDER_LABEL_BY_ID,
    S3_PROVIDER_OPTIONS,
  } = useProviderManagement();

  const resolvedAutoUpload = basic.s3AutoUpload;
  const resolvedAutoDeleteHours = basic.s3AutoDeleteHours;
  const sessionCount = statsQuery.data?.sessionCount;

  /**
   * Upload a file to S3 for testing and copy the returned URL.
   */
  async function handleS3TestUpload(entry: S3ProviderEntry) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setTestingS3Key(entry.key);
      try {
        // 中文注释：构造表单提交测试文件与目标 provider。
        const formData = new FormData();
        formData.append("providerKey", entry.key);
        formData.append("file", file);

        const apiBase = resolveServerUrl();
        const endpoint = apiBase ? `${apiBase}/settings/s3/test-upload` : "/settings/s3/test-upload";
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errorText = await res.text();
          setS3TestUrl("");
          setS3TestError(errorText || t("s3.uploadFailed"));
          setS3TestDialogOpen(true);
          return;
        }
        const data = (await res.json()) as { url?: string };
        if (!data?.url) {
          setS3TestUrl("");
          setS3TestError(t("s3.noUrlReturned"));
          setS3TestCopyMessage("");
          setS3TestDialogOpen(true);
          return;
        }
        setS3TestError("");
        setS3TestUrl(data.url);
        setS3TestCopyMessage("");
        setS3TestDialogOpen(true);
      } catch (error) {
        setS3TestUrl("");
        setS3TestError(error instanceof Error ? error.message : t("s3.uploadFailed"));
        setS3TestCopyMessage("");
        setS3TestDialogOpen(true);
      } finally {
        setTestingS3Key(null);
      }
    };

    input.click();
  }

  /**
   * Copy S3 test URL into clipboard.
   */
  async function handleCopyS3TestUrl() {
    if (!s3TestUrl) return;
    setS3TestCopyMessage("");
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(s3TestUrl);
        setS3TestCopyMessage(t("s3.copied"));
        return;
      }
    } catch {
      // 中文注释：剪贴板 API 失败时走降级复制。
    }

    const input = s3TestUrlInputRef.current;
    if (input) {
      input.focus();
      input.select();
      const copied = document.execCommand("copy");
      setS3TestCopyMessage(copied ? t("s3.copied") : t("s3.copyFailed"));
      return;
    }
    setS3TestCopyMessage(t("s3.copyFailed"));
  }

  /**
   * Activate S3 provider for current global settings scope.
   */
  async function handleActivateS3(entry: S3ProviderEntry) {
    if (!entry.id) return;
    if (basic.activeS3Id === entry.id) return;
    await setBasic({ activeS3Id: entry.id });
  }

  function handleAutoUploadChange(next: boolean) {
    void setBasic({
      s3AutoUpload: next,
      s3AutoDeleteHours: resolvedAutoDeleteHours,
    });
  }

  function handleAutoDeleteHoursChange(next: number | ((prev: number) => number)) {
    const nextValue = typeof next === "function" ? next(resolvedAutoDeleteHours) : next;
    void setBasic({
      s3AutoUpload: resolvedAutoUpload,
      s3AutoDeleteHours: nextValue,
    });
  }

  async function handlePickTempStorageDir() {
    const api = window.openloafElectron;
    if (api?.pickDirectory) {
      // basic.appTempStorageDir is always populated by the server with the
      // platform-specific default, so the picker opens at the current path.
      const result = await api.pickDirectory({ defaultPath: basic.appTempStorageDir });
      if (result?.ok && result.path) {
        void setBasic({ appTempStorageDir: result.path });
      }
    }
  }

  /**
   * Clear all chat sessions after confirmation.
   */
  const handleClearAllChat = async () => {
    const countPart =
      typeof sessionCount === "number"
        ? tProject("settings.clearChatConfirmWithCount", { count: sessionCount })
        : "";
    const confirmText = `${tProject("settings.clearChatConfirm", { countText: countPart })}`;
    if (!window.confirm(confirmText)) return;
    await clearAllChat.mutateAsync();
  };

  /**
   * Clear all canvases that are not attached to any project.
   */
  const handleClearUnboundBoards = async () => {
    if (!window.confirm(tProject("settings.clearCanvasConfirm"))) return;
    await clearUnboundBoards.mutateAsync({});
  };

  const tempStorageDisplay = basic.appTempStorageDir || t("tempStorage.selectFolder");

  return (
    <div className="space-y-3">
      <OpenLoafSettingsGroup
        title={t("tempStorage.title")}
        subtitle={t("tempStorage.subtitle")}
        className="pb-4"
      >
        <div className="flex flex-wrap items-center gap-2 py-3">
          <SettingIcon icon={FolderOpen} bg="bg-secondary" fg="text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("tempStorage.path")}</div>
            <div className="text-xs text-muted-foreground">{t("tempStorage.pathDescription")}</div>
          </div>
          <OpenLoafSettingsField className="w-full sm:w-72 shrink-0">
            <button
              type="button"
              className="flex h-9 w-full items-center rounded-3xl border border-input bg-background px-3 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
              onClick={handlePickTempStorageDir}
            >
              <FolderOpen className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span dir="rtl" className="truncate text-left">
                {tempStorageDisplay}
              </span>
            </button>
          </OpenLoafSettingsField>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={tProject("settings.cleanup")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Trash2} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{tProject("settings.clearAllChat")}</div>
              <div className="text-xs text-muted-foreground">
                {tProject("settings.clearAllChatDescription")}
              </div>
            </div>
            <OpenLoafSettingsField>
              <Button
                type="button"
                size="sm"
                className="rounded-3xl bg-destructive/10 text-destructive shadow-none hover:bg-destructive/20"
                disabled={clearAllChat.isPending}
                onClick={() => void handleClearAllChat()}
              >
                {clearAllChat.isPending
                  ? tProject("settings.clearingButton")
                  : tProject("settings.clearButton")}
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Layers} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{tProject("settings.clearAllCanvas")}</div>
              <div className="text-xs text-muted-foreground">
                {tProject("settings.clearAllCanvasDescription")}
              </div>
            </div>
            <OpenLoafSettingsField>
              <Button
                type="button"
                size="sm"
                className="rounded-3xl bg-secondary text-secondary-foreground shadow-none hover:bg-accent"
                disabled={clearUnboundBoards.isPending}
                onClick={() => void handleClearUnboundBoards()}
              >
                {clearUnboundBoards.isPending
                  ? tProject("settings.clearingCanvasButton")
                  : tProject("settings.clearCanvasButton")}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <S3ProviderSection
        entries={s3Entries}
        autoUploadEnabled={resolvedAutoUpload}
        onAutoUploadChange={handleAutoUploadChange}
        autoDeleteHours={resolvedAutoDeleteHours}
        onAutoDeleteHoursChange={handleAutoDeleteHoursChange}
        onAdd={() => openS3Editor()}
        onEdit={(entry) => openS3Editor(entry)}
        onTest={handleS3TestUpload}
        onDelete={(key) => setConfirmS3DeleteId(key)}
        onActivate={handleActivateS3}
        activeS3Id={basic.activeS3Id ?? ""}
        testingKey={testingS3Key}
      />

      <S3ProviderDialog
        open={s3DialogOpen}
        editingKey={editingS3Key}
        providerOptions={S3_PROVIDER_OPTIONS}
        providerLabelById={S3_PROVIDER_LABEL_BY_ID}
        draftProviderId={draftS3ProviderId}
        draftName={draftS3Name}
        draftEndpoint={draftS3Endpoint}
        draftRegion={draftS3Region}
        draftBucket={draftS3Bucket}
        draftForcePathStyle={draftS3ForcePathStyle}
        draftPublicBaseUrl={draftS3PublicBaseUrl}
        draftAccessKeyId={draftS3AccessKeyId}
        draftSecretAccessKey={draftS3SecretAccessKey}
        showSecretKey={showS3SecretKey}
        error={s3Error}
        onOpenChange={setS3DialogOpen}
        onDraftProviderIdChange={setDraftS3ProviderId}
        onDraftNameChange={setDraftS3Name}
        onDraftEndpointChange={setDraftS3Endpoint}
        onDraftRegionChange={setDraftS3Region}
        onDraftBucketChange={setDraftS3Bucket}
        onDraftForcePathStyleChange={setDraftS3ForcePathStyle}
        onDraftPublicBaseUrlChange={setDraftS3PublicBaseUrl}
        onDraftAccessKeyIdChange={setDraftS3AccessKeyId}
        onDraftSecretAccessKeyChange={setDraftS3SecretAccessKey}
        onShowSecretKeyChange={setShowS3SecretKey}
        onSubmit={submitS3Draft}
      />

      <ConfirmDeleteDialog
        title={t("s3.deleteTitle")}
        description={t("s3.deleteDesc")}
        open={Boolean(confirmS3DeleteId)}
        onClose={() => setConfirmS3DeleteId(null)}
        onConfirm={async () => {
          if (!confirmS3DeleteId) return;
          await deleteS3Provider(confirmS3DeleteId);
          setConfirmS3DeleteId(null);
        }}
      />

      <Dialog open={s3TestDialogOpen} onOpenChange={setS3TestDialogOpen}>
        <DialogContent className="max-h-[80vh] w-full max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("s3.testResultTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {s3TestError ? (
              <div className="text-destructive">{s3TestError}</div>
            ) : (
              <Input ref={s3TestUrlInputRef} readOnly value={s3TestUrl} />
            )}
            {s3TestCopyMessage ? (
              <div className="text-xs text-muted-foreground">{s3TestCopyMessage}</div>
            ) : null}
          </div>
          <DialogFooter>
            {s3TestUrl ? (
              <Button onClick={handleCopyS3TestUrl}>{t("s3.copyUrl")}</Button>
            ) : null}
            <Button variant="ghost" onClick={() => setS3TestDialogOpen(false)}>
              {t("s3.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
