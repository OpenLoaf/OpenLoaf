/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-full max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingKey ? "编辑 S3 服务商" : "添加 S3 服务商"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">服务商</div>
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
            <div className="text-sm font-medium">名称</div>
            <Input
              value={draftName}
              placeholder="例如：AWS-S3"
              onChange={(event) => onDraftNameChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Endpoint</div>
            <Input
              value={draftEndpoint}
              placeholder="例如：https://s3.amazonaws.com"
              onChange={(event) => onDraftEndpointChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Region</div>
            <Input
              value={draftRegion}
              placeholder="例如：us-east-1（可选）"
              onChange={(event) => onDraftRegionChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Bucket</div>
            <Input
              value={draftBucket}
              placeholder="例如：openloaf-bucket"
              onChange={(event) => onDraftBucketChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Public Base URL</div>
            <Input
              value={draftPublicBaseUrl}
              placeholder="例如：https://cdn.example.com（可选）"
              onChange={(event) => onDraftPublicBaseUrlChange(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2 md:col-span-2">
            <div>
              <div className="text-sm font-medium">Force Path Style</div>
              <div className="text-xs text-muted-foreground">部分 S3 兼容服务需要开启</div>
            </div>
            <Switch checked={draftForcePathStyle} onCheckedChange={onDraftForcePathStyleChange} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">AccessKeyID</div>
            <Input
              value={draftAccessKeyId}
              placeholder="输入 AccessKeyID"
              onChange={(event) => onDraftAccessKeyIdChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">SecretAccessKey</div>
            <div className="relative">
              <Input
                type={showSecretKey ? "text" : "password"}
                value={draftSecretAccessKey}
                placeholder="输入 SecretAccessKey"
                onChange={(event) => onDraftSecretAccessKeyChange(event.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => onShowSecretKeyChange(!showSecretKey)}
                aria-label={showSecretKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {error ? <div className="text-sm text-destructive md:col-span-2">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
