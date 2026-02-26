/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useRef, useState } from "react";
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
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { S3ProviderDialog } from "@/components/setting/menus/provider/S3ProviderDialog";
import { S3ProviderSection } from "@/components/setting/menus/provider/S3ProviderSection";
import {
  useProviderManagement,
  type S3ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";

/**
 * Manage object storage providers and global S3 preferences.
 */
export function ObjectStorageService() {
  const [testingS3Key, setTestingS3Key] = useState<string | null>(null);
  const [s3TestDialogOpen, setS3TestDialogOpen] = useState(false);
  const [s3TestUrl, setS3TestUrl] = useState("");
  const [s3TestError, setS3TestError] = useState("");
  const [s3TestCopyMessage, setS3TestCopyMessage] = useState("");
  const s3TestUrlInputRef = useRef<HTMLInputElement>(null);
  const { basic, setBasic } = useBasicConfig();
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
          setS3TestError(errorText || "S3 测试上传失败");
          setS3TestDialogOpen(true);
          return;
        }
        const data = (await res.json()) as { url?: string };
        if (!data?.url) {
          setS3TestUrl("");
          setS3TestError("S3 测试上传失败：服务端未返回地址");
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
        setS3TestError(error instanceof Error ? error.message : "S3 测试上传失败");
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
        setS3TestCopyMessage("已复制");
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
      setS3TestCopyMessage(copied ? "已复制" : "复制失败，请手动复制");
      return;
    }
    setS3TestCopyMessage("复制失败，请手动复制");
  }

  /**
   * Activate S3 provider for current workspace.
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

  return (
    <div className="space-y-3">
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
        title="确认删除"
        description="确认要删除这个 S3 服务商配置吗？"
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
            <DialogTitle>S3 测试上传结果</DialogTitle>
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
              <Button onClick={handleCopyS3TestUrl}>
                复制地址
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setS3TestDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
