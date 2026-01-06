import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, ChevronDown, Plus, Copy, Check } from "lucide-react";
import { getModelLabel } from "@/lib/model-registry";
import {
  formatModelPriceLabel,
  getDefaultApiUrl,
  getDefaultModelIds,
  getDefaultProviderName,
  IO_LABELS,
  MODEL_TAG_LABELS,
  copyToClipboard,
  resolveAuthMode,
  truncateDisplay,
} from "@/components/setting/menus/provider/use-provider-management";
import type { ModelDefinition } from "@teatime-ai/api/common";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

type ProviderDialogProps = {
  /** Dialog visibility. */
  open: boolean;
  /** Edit mode flag. */
  editingKey: string | null;
  /** Provider options. */
  providerOptions: { id: string; label: string }[];
  /** Provider label lookup. */
  providerLabelById: Record<string, string>;
  /** Draft provider id. */
  draftProvider: string;
  /** Draft provider name. */
  draftName: string;
  /** Draft API url. */
  draftApiUrl: string;
  /** Draft auth mode. */
  draftAuthMode: "apiKey" | "accessKey";
  /** Draft API key. */
  draftApiKey: string;
  /** Draft access key id. */
  draftAccessKeyId: string;
  /** Draft secret access key. */
  draftSecretAccessKey: string;
  /** Show auth toggle. */
  showAuth: boolean;
  /** Show access key toggle. */
  showSecretAccessKey: boolean;
  /** Draft model ids. */
  draftModelIds: string[];
  /** Draft custom models. */
  draftCustomModels: ModelDefinition[];
  /** Draft model filter. */
  draftModelFilter: string;
  /** Draft errors. */
  error: string | null;
  /** Model options list. */
  modelOptions: ModelDefinition[];
  /** Filtered models list. */
  filteredModelOptions: ModelDefinition[];
  /** Focused model. */
  focusedModel: ModelDefinition | null;
  /** Close dialog callback. */
  onOpenChange: (open: boolean) => void;
  /** Update provider id. */
  onDraftProviderChange: (value: string) => void;
  /** Update name. */
  onDraftNameChange: (value: string) => void;
  /** Update API url. */
  onDraftApiUrlChange: (value: string) => void;
  /** Update auth mode. */
  onDraftAuthModeChange: (value: "apiKey" | "accessKey") => void;
  /** Update API key. */
  onDraftApiKeyChange: (value: string) => void;
  /** Update access key id. */
  onDraftAccessKeyIdChange: (value: string) => void;
  /** Update secret access key. */
  onDraftSecretAccessKeyChange: (value: string) => void;
  /** Toggle show auth. */
  onShowAuthChange: (value: boolean) => void;
  /** Toggle show secret access key. */
  onShowSecretAccessKeyChange: (value: boolean) => void;
  /** Update model ids. */
  onDraftModelIdsChange: Dispatch<SetStateAction<string[]>>;
  /** Update custom models. */
  onDraftCustomModelsChange: (value: ModelDefinition[]) => void;
  /** Update model filter. */
  onDraftModelFilterChange: (value: string) => void;
  /** Update focused model id. */
  onFocusedModelIdChange: (value: string | null) => void;
  /** Open model dialog. */
  onOpenModelDialog: () => void;
  /** Submit draft callback. */
  onSubmit: () => Promise<void> | void;
};

/**
 * Render IO tags for a model.
 */
function renderIoTags(types?: (keyof typeof IO_LABELS)[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {(types ?? []).map((io) => (
        <span
          key={io}
          className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {IO_LABELS[io] ?? io}
        </span>
      ))}
    </div>
  );
}

/**
 * Render model tags for a model.
 */
function renderModelTags(tags?: (keyof typeof MODEL_TAG_LABELS)[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {(tags ?? []).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {MODEL_TAG_LABELS[tag] ?? tag}
        </span>
      ))}
    </div>
  );
}

/**
 * Render compact model tags.
 */
function renderModelTagsCompact(tags?: (keyof typeof MODEL_TAG_LABELS)[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {(tags ?? []).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {MODEL_TAG_LABELS[tag] ?? tag}
        </span>
      ))}
    </div>
  );
}

/**
 * Render provider dialog.
 */
export function ProviderDialog({
  open,
  editingKey,
  providerOptions,
  providerLabelById,
  draftProvider,
  draftName,
  draftApiUrl,
  draftAuthMode,
  draftApiKey,
  draftAccessKeyId,
  draftSecretAccessKey,
  showAuth,
  showSecretAccessKey,
  draftModelIds,
  draftCustomModels,
  draftModelFilter,
  error,
  modelOptions,
  filteredModelOptions,
  focusedModel,
  onOpenChange,
  onDraftProviderChange,
  onDraftNameChange,
  onDraftApiUrlChange,
  onDraftAuthModeChange,
  onDraftApiKeyChange,
  onDraftAccessKeyIdChange,
  onDraftSecretAccessKeyChange,
  onShowAuthChange,
  onShowSecretAccessKeyChange,
  onDraftModelIdsChange,
  onDraftCustomModelsChange,
  onDraftModelFilterChange,
  onFocusedModelIdChange,
  onOpenModelDialog,
  onSubmit,
}: ProviderDialogProps) {
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-[60vw] overflow-y-auto lg:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{editingKey ? "编辑服务商" : "添加服务商"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">服务商</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={Boolean(editingKey)}
                  >
                    <span className="truncate">
                      {providerLabelById[draftProvider] ?? draftProvider}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                {editingKey ? null : (
                  <DropdownMenuContent align="start" className="w-[320px]">
                    <DropdownMenuRadioGroup
                      value={draftProvider}
                      onValueChange={(next) => {
                        const provider = next;
                        const currentDefault = getDefaultApiUrl(draftProvider);
                        const nextDefault = getDefaultApiUrl(provider);
                        const currentDefaultName = getDefaultProviderName(draftProvider);
                        const nextDefaultName = getDefaultProviderName(provider);
                        const nextDefaultModels = getDefaultModelIds(provider);
                        onDraftProviderChange(provider);
                        if (!draftApiUrl.trim() || draftApiUrl.trim() === currentDefault) {
                          onDraftApiUrlChange(nextDefault);
                        }
                        if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                          onDraftNameChange(nextDefaultName);
                        }
                        const nextAuthMode = resolveAuthMode(provider);
                        onDraftAuthModeChange(nextAuthMode);
                        onDraftApiKeyChange("");
                        onDraftAccessKeyIdChange("");
                        onDraftSecretAccessKeyChange("");
                        onDraftCustomModelsChange([]);
                        onDraftModelIdsChange((prev) => {
                          if (prev.length === 0) return nextDefaultModels;
                          const nextSet = new Set(nextDefaultModels);
                          const intersect = prev.filter((id) => nextSet.has(id));
                          return intersect.length > 0 ? intersect : nextDefaultModels;
                        });
                      }}
                    >
                      {providerOptions.map((p) => (
                        <DropdownMenuRadioItem key={p.id} value={p.id}>
                          {p.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                )}
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">名称</div>
              <Input
                value={draftName}
                placeholder="例如：OPENAI"
                onChange={(event) => onDraftNameChange(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">API URL</div>
              <Input
                value={draftApiUrl}
                placeholder="例如：https://api.openai.com/v1"
                onChange={(event) => onDraftApiUrlChange(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">认证信息</div>
              {draftAuthMode === "accessKey" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">AccessKeyID</div>
                    <Input
                      value={draftAccessKeyId}
                      placeholder="输入 AccessKeyID"
                      onChange={(event) => onDraftAccessKeyIdChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">SecretAccessKey</div>
                    <div className="relative">
                      <Input
                        type={showSecretAccessKey ? "text" : "password"}
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
                        onClick={() => onShowSecretAccessKeyChange(!showSecretAccessKey)}
                        aria-label={showSecretAccessKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"}
                      >
                        {showSecretAccessKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={showAuth ? "text" : "password"}
                    value={draftApiKey}
                    placeholder="输入 API Key"
                    onChange={(event) => onDraftApiKeyChange(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => onShowAuthChange(!showAuth)}
                    aria-label={showAuth ? "隐藏 API Key" : "显示 API Key"}
                  >
                    {showAuth ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">模型</div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-5 w-5"
                onClick={onOpenModelDialog}
                aria-label="新建模型"
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
            </div>
            <div className="rounded-md border border-border">
              <div className="grid grid-cols-[1.1fr_1fr] gap-3 p-3">
                <div className="flex h-64 flex-col gap-2 pr-1">
                  <div className="flex-1 overflow-auto space-y-1">
                    {filteredModelOptions.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">暂无可选模型</div>
                    ) : (
                      filteredModelOptions.map((model) => (
                        <div
                          key={model.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border border-transparent px-2 py-2 text-sm transition-colors",
                            draftModelIds.includes(model.id)
                              ? "bg-muted/60 border-border"
                              : "hover:bg-muted/30",
                          )}
                          onMouseEnter={() => onFocusedModelIdChange(model.id)}
                          onFocus={() => onFocusedModelIdChange(model.id)}
                        >
                          <div className="flex-1">
                            <div className="text-foreground">{getModelLabel(model)}</div>
                            <div className="mt-1">{renderModelTagsCompact(model.tags)}</div>
                          </div>
                          <Switch
                            checked={draftModelIds.includes(model.id)}
                            onCheckedChange={(checked) => {
                              onDraftModelIdsChange((prev) => {
                                if (checked) return Array.from(new Set([...prev, model.id]));
                                return prev.filter((id) => id !== model.id);
                              });
                            }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="h-64 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-sm">
                  {focusedModel ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className="text-sm font-medium text-foreground truncate"
                            title={getModelLabel(focusedModel)}
                          >
                            {truncateDisplay(getModelLabel(focusedModel), 48)}
                          </div>
                          {getModelLabel(focusedModel) !== focusedModel.id ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {focusedModel.id}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6"
                          onClick={async () => {
                            await copyToClipboard(focusedModel.id);
                            setCopiedModelId(focusedModel.id);
                            window.setTimeout(() => {
                              setCopiedModelId((prev) =>
                                prev === focusedModel.id ? null : prev,
                              );
                            }, 1200);
                          }}
                          aria-label="复制模型名称"
                        >
                          {copiedModelId === focusedModel.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">输入：</span>
                          <div className="min-w-0 flex-1">
                            {renderIoTags(focusedModel.input)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">输出：</span>
                          <div className="min-w-0 flex-1">
                            {renderIoTags(focusedModel.output)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">能力：</span>
                          <div className="min-w-0 flex-1">
                            {renderModelTags(focusedModel.tags)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">价格：</span>
                          <span className="text-xs text-muted-foreground">
                            {formatModelPriceLabel(focusedModel)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">暂无模型详情</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-destructive lg:col-span-2">{error}</div> : null}
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
