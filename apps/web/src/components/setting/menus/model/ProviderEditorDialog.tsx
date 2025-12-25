"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import {
  MODEL_CATALOG_BY_PROVIDER,
  PROVIDER_OPTIONS,
  getDefaultApiUrl,
  getDefaultModelIds,
  getDefaultProviderName,
  getModelLabel,
  getModelSummary,
  resolveModelDefinitions,
  type ProviderId,
  type ModelDefinition,
} from "@teatime-ai/api/common";
const VOLCENGINE_PROVIDER_ID = "volcengine";

export type ProviderEntryPayload = {
  key: string;
  provider: ProviderId;
  apiUrl: string;
  apiKey: string;
  modelIds: string[];
  modelDefinitions: ModelDefinition[];
};

/**
 * Compose Volcengine key pair into a single string.
 */
function formatVolcengineKey(accessKeyId: string, secretAccessKey: string) {
  return `${accessKeyId.trim()}:${secretAccessKey.trim()}`;
}

type ProviderEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ProviderEntryPayload) => Promise<void> | void;
  existingKeys?: string[];
};

/** Render a provider editor dialog for creating entries. */
export function ProviderEditorDialog({
  open,
  onOpenChange,
  onSubmit,
  existingKeys = [],
}: ProviderEditorDialogProps) {
  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftAccessKeyId, setDraftAccessKeyId] = useState("");
  const [draftSecretAccessKey, setDraftSecretAccessKey] = useState("");
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDER_OPTIONS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  const modelOptions = useMemo(
    () => MODEL_CATALOG_BY_PROVIDER[draftProvider]?.getModels() ?? [],
    [draftProvider],
  );

  const resetDraft = () => {
    setError(null);
    setDraftProvider("openai");
    setDraftName(getDefaultProviderName("openai"));
    setDraftApiUrl(getDefaultApiUrl("openai"));
    setDraftApiKey("");
    setDraftAccessKeyId("");
    setDraftSecretAccessKey("");
    setDraftModelIds(getDefaultModelIds("openai"));
    setShowApiKey(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next && !open) {
      resetDraft();
    }
    onOpenChange(next);
  };

  const submitDraft = async () => {
    const name = draftName.trim();
    const apiUrl = draftApiUrl.trim();
    const apiKey =
      draftProvider === VOLCENGINE_PROVIDER_ID
        ? formatVolcengineKey(draftAccessKeyId, draftSecretAccessKey)
        : draftApiKey.trim();
    const normalizedName = name.toLowerCase();
    if (!name) {
      setError("请填写名称");
      return;
    }
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    // 中文注释：火山引擎使用 AK/SK 双字段校验。
    if (draftProvider === VOLCENGINE_PROVIDER_ID) {
      if (!draftAccessKeyId.trim() || !draftSecretAccessKey.trim()) {
        setError("请填写 AccessKeyID 和 SecretAccessKey");
        return;
      }
    } else {
      if (!apiKey) {
        setError("请填写 API KEY");
        return;
      }
    }
    if (draftModelIds.length === 0) {
      setError("请选择模型");
      return;
    }
    if (existingKeys.some((key) => key.toLowerCase() === normalizedName)) {
      setError("名称已存在，请更换");
      return;
    }
    const modelDefinitions = resolveModelDefinitions(draftProvider, draftModelIds);
    if (modelDefinitions.length === 0) {
      setError("模型定义缺失");
      return;
    }
    // 中文注释：模型 ID 以定义为准，确保存储字段同步。
    const payload: ProviderEntryPayload = {
      key: name,
      provider: draftProvider,
      apiUrl,
      apiKey,
      modelIds: modelDefinitions.map((model) => model.id),
      modelDefinitions,
    };
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加服务商</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">服务商</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{providerLabelById[draftProvider]}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuRadioGroup
                  value={draftProvider}
                  onValueChange={(next) => {
                    const provider = next as ProviderId;
                    const currentDefault = getDefaultApiUrl(draftProvider);
                    const nextDefault = getDefaultApiUrl(provider);
                    const currentDefaultName = getDefaultProviderName(draftProvider);
                    const nextDefaultName = getDefaultProviderName(provider);
                    const nextDefaultModels = getDefaultModelIds(provider);
                    setDraftProvider(provider);
                    if (!draftApiUrl.trim() || draftApiUrl.trim() === currentDefault) {
                      setDraftApiUrl(nextDefault);
                    }
                    if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                      setDraftName(nextDefaultName);
                    }
                    if (provider === VOLCENGINE_PROVIDER_ID) {
                      setDraftApiKey("");
                      setDraftAccessKeyId("");
                      setDraftSecretAccessKey("");
                    }
                    setDraftModelIds((prev) => {
                      if (prev.length === 0) return nextDefaultModels;
                      const nextSet = new Set(nextDefaultModels);
                      const intersect = prev.filter((id) => nextSet.has(id));
                      return intersect.length > 0 ? intersect : nextDefaultModels;
                    });
                  }}
                >
                  {PROVIDER_OPTIONS.map((provider) => (
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
              placeholder="例如：OPENAI"
              onChange={(event) => setDraftName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">API URL</div>
            <Input
              value={draftApiUrl}
              placeholder="例如：https://api.openai.com/v1"
              onChange={(event) => setDraftApiUrl(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {getModelSummary(modelOptions, draftModelIds)}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                {modelOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    暂无可选模型
                  </div>
                ) : (
                  modelOptions.map((model) => (
                    <DropdownMenuCheckboxItem
                      key={model.id}
                      checked={draftModelIds.includes(model.id)}
                      onSelect={(event) => {
                        event.preventDefault();
                      }}
                      onCheckedChange={(checked) => {
                        setDraftModelIds((prev) => {
                          if (checked) return Array.from(new Set([...prev, model.id]));
                          return prev.filter((id) => id !== model.id);
                        });
                      }}
                    >
                      {getModelLabel(model)}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">认证信息</div>
            {draftProvider === VOLCENGINE_PROVIDER_ID ? (
              <div className="space-y-2">
                <Input
                  value={draftAccessKeyId}
                  placeholder="AccessKeyID"
                  onChange={(event) => setDraftAccessKeyId(event.target.value)}
                />
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={draftSecretAccessKey}
                    placeholder="SecretAccessKey"
                    onChange={(event) => setDraftSecretAccessKey(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    aria-label={showApiKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={draftApiKey}
                  placeholder="输入 API KEY"
                  onChange={(event) => setDraftApiKey(event.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  aria-label={showApiKey ? "隐藏 API KEY" : "显示 API KEY"}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submitDraft()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
