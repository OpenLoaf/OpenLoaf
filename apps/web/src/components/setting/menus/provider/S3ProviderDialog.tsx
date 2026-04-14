/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { FormDialog } from "@/components/ui/FormDialog";
import { Switch } from "@openloaf/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import {
  getDefaultS3Endpoint,
  getDefaultS3ProviderName,
  getDefaultS3Region,
} from "@/components/setting/menus/provider/use-provider-management";

type S3ProviderDialogProps = {
  /** Dialog visibility. */
  open: boolean;
  /** Edit mode key. */
  editingKey: string | null;
  /** Provider options list. */
  providerOptions: { id: string; label: string }[];
  /** Provider label lookup. */
  providerLabelById: Record<string, string>;
  /** Draft provider id. */
  draftProviderId: string;
  /** Draft name. */
  draftName: string;
  /** Draft endpoint. */
  draftEndpoint: string;
  /** Draft region. */
  draftRegion: string;
  /** Draft bucket. */
  draftBucket: string;
  /** Draft force path style. */
  draftForcePathStyle: boolean;
  /** Draft public base URL. */
  draftPublicBaseUrl: string;
  /** Draft access key id. */
  draftAccessKeyId: string;
  /** Draft secret access key. */
  draftSecretAccessKey: string;
  /** Show secret key. */
  showSecretKey: boolean;
  /** Validation error. */
  error: string | null;
  /** Close dialog callback. */
  onOpenChange: (open: boolean) => void;
  /** Update provider id. */
  onDraftProviderIdChange: (value: string) => void;
  /** Update name. */
  onDraftNameChange: (value: string) => void;
  /** Update endpoint. */
  onDraftEndpointChange: (value: string) => void;
  /** Update region. */
  onDraftRegionChange: (value: string) => void;
  /** Update bucket. */
  onDraftBucketChange: (value: string) => void;
  /** Update force path style. */
  onDraftForcePathStyleChange: (value: boolean) => void;
  /** Update public base URL. */
  onDraftPublicBaseUrlChange: (value: string) => void;
  /** Update access key id. */
  onDraftAccessKeyIdChange: (value: string) => void;
  /** Update secret access key. */
  onDraftSecretAccessKeyChange: (value: string) => void;
  /** Toggle secret key visibility. */
  onShowSecretKeyChange: (value: boolean) => void;
  /** Submit callback. */
  onSubmit: () => Promise<void> | void;
};

/**
 * Render S3 provider dialog.
 */
export function S3ProviderDialog({
  open,
  editingKey,
  providerOptions,
  providerLabelById,
  draftProviderId,
  draftName,
  draftEndpoint,
  draftRegion,
  draftBucket,
  draftForcePathStyle,
  draftPublicBaseUrl,
  draftAccessKeyId,
  draftSecretAccessKey,
  showSecretKey,
  error,
  onOpenChange,
  onDraftProviderIdChange,
  onDraftNameChange,
  onDraftEndpointChange,
  onDraftRegionChange,
  onDraftBucketChange,
  onDraftForcePathStyleChange,
  onDraftPublicBaseUrlChange,
  onDraftAccessKeyIdChange,
  onDraftSecretAccessKeyChange,
  onShowSecretKeyChange,
  onSubmit,
}: S3ProviderDialogProps) {
  const { t } = useTranslation("settings");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingKey ? t("s3.editProvider") : t("s3.addProvider")}
      onSubmit={onSubmit}
      submitLabel={t("s3.save")}
      cancelLabel={t("s3.cancel")}
      contentClassName="max-h-[80vh] w-full max-w-4xl overflow-y-auto"
    >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("s3.provider")}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {providerLabelById[draftProviderId] ?? draftProviderId}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuRadioGroup
                  value={draftProviderId}
                  onValueChange={(next) => {
                    const providerId = next;
                    const currentDefaultEndpoint = getDefaultS3Endpoint(draftProviderId);
                    const nextDefaultEndpoint = getDefaultS3Endpoint(providerId);
                    const currentDefaultName = getDefaultS3ProviderName(draftProviderId);
                    const nextDefaultName = getDefaultS3ProviderName(providerId);
                    const currentDefaultRegion = getDefaultS3Region(draftProviderId);
                    const nextDefaultRegion = getDefaultS3Region(providerId);
                    onDraftProviderIdChange(providerId);
                    // 保留用户填写内容，仅在与默认值一致时自动切换。
                    if (!draftEndpoint.trim() || draftEndpoint.trim() === currentDefaultEndpoint) {
                      onDraftEndpointChange(nextDefaultEndpoint);
                    }
                    if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                      onDraftNameChange(nextDefaultName);
                    }
                    if (!draftRegion.trim() || draftRegion.trim() === currentDefaultRegion) {
                      onDraftRegionChange(nextDefaultRegion);
                    }
                  }}
                >
                  {providerOptions.map((provider) => (
                    <DropdownMenuRadioItem key={provider.id} value={provider.id}>
                      {provider.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t("s3.name")}</div>
            <Input
              value={draftName}
              placeholder={t("s3.namePlaceholder")}
              onChange={(event) => onDraftNameChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Endpoint</div>
            <Input
              value={draftEndpoint}
              placeholder={t("s3.endpointPlaceholder")}
              onChange={(event) => onDraftEndpointChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Region</div>
            <Input
              value={draftRegion}
              placeholder={t("s3.regionPlaceholder")}
              onChange={(event) => onDraftRegionChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Bucket</div>
            <Input
              value={draftBucket}
              placeholder={t("s3.bucketPlaceholder")}
              onChange={(event) => onDraftBucketChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Public Base URL</div>
            <Input
              value={draftPublicBaseUrl}
              placeholder={t("s3.publicBaseUrlPlaceholder")}
              onChange={(event) => onDraftPublicBaseUrlChange(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-3xl border px-3 py-2 md:col-span-2">
            <div>
              <div className="text-sm font-medium">Force Path Style</div>
              <div className="text-xs text-muted-foreground">{t("s3.forcePathStyleDesc")}</div>
            </div>
            <Switch checked={draftForcePathStyle} onCheckedChange={onDraftForcePathStyleChange} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">AccessKeyID</div>
            <Input
              value={draftAccessKeyId}
              placeholder={t("s3.accessKeyIdPlaceholder")}
              onChange={(event) => onDraftAccessKeyIdChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">SecretAccessKey</div>
            <div className="relative">
              <Input
                type={showSecretKey ? "text" : "password"}
                value={draftSecretAccessKey}
                placeholder={t("s3.secretAccessKeyPlaceholder")}
                onChange={(event) => onDraftSecretAccessKeyChange(event.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => onShowSecretKeyChange(!showSecretKey)}
                aria-label={showSecretKey ? t("s3.hideSecretKey") : t("s3.showSecretKey")}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {error ? <div className="text-sm text-destructive md:col-span-2">{error}</div> : null}
        </div>
    </FormDialog>
  );
}
