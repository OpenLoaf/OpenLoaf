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
  DEEPSEEK_MODEL_CATALOG,
  GOOGLE_MODEL_CATALOG,
  XAI_MODEL_CATALOG,
  type ModelDefinition,
} from "@teatime-ai/api/common";

type ProviderId = "anthropic" | "deepseek" | "google" | "openai" | "xai" | "custom";

export type ProviderEntryPayload = {
  key: string;
  provider: ProviderId;
  apiUrl: string;
  apiKey: string;
  modelIds: string[];
  modelDefinitions: ModelDefinition[];
};

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "openai", label: "openai" },
  { id: "anthropic", label: "anthropic" },
  { id: "google", label: "Google" },
  { id: "deepseek", label: "deepseek" },
  { id: "xai", label: "xai" },
  { id: "custom", label: "自定义" },
];

const MODEL_CATALOG_BY_PROVIDER: Partial<Record<ProviderId, typeof XAI_MODEL_CATALOG>> = {
  xai: XAI_MODEL_CATALOG,
  deepseek: DEEPSEEK_MODEL_CATALOG,
  google: GOOGLE_MODEL_CATALOG,
};

/**
 * Provide the default API URL for known providers.
 */
function getDefaultApiUrl(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    deepseek: "https://api.deepseek.com/v1",
    xai: "https://api.x.ai/v1",
    custom: "",
  };
  return defaults[provider];
}

/**
 * Provide the default display name for a provider.
 */
function getDefaultProviderName(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "OPENAI",
    anthropic: "ANTHROPIC",
    google: "Google",
    deepseek: "Deepseek",
    xai: "XAI",
    custom: "",
  };
  return defaults[provider];
}

/**
 * Get model ids from the provider catalog.
 */
function getDefaultModelIds(provider: ProviderId) {
  const catalog = MODEL_CATALOG_BY_PROVIDER[provider];
  if (!catalog) return [];
  const [first] = catalog.getModels();
  return first ? [first.id] : [];
}

/**
 * Build a label for selected models.
 */
function getModelSummary(models: { id: string }[], selected: string[]) {
  if (models.length === 0) return "暂无可选模型";
  if (selected.length === 0) return "请选择模型";
  const selectedSet = new Set(selected);
  const visible = models.filter((model) => selectedSet.has(model.id)).slice(0, 2);
  const labels = visible.map((model) => model.id);
  if (selected.length <= 2) return labels.join("、");
  return `${labels.join("、")} +${selected.length - 2}`;
}

/**
 * Resolve model definitions from the provider catalog.
 */
function resolveModelDefinitions(provider: ProviderId, modelIds: string[]): ModelDefinition[] {
  const catalog = MODEL_CATALOG_BY_PROVIDER[provider];
  if (!catalog) return [];
  const modelById = new Map(catalog.getModels().map((model) => [model.id, model]));
  return modelIds
    .map((modelId) => modelById.get(modelId))
    .filter((model): model is ModelDefinition => Boolean(model));
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
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDERS) map[provider.id] = provider.label;
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
    const apiKey = draftApiKey.trim();
    const normalizedName = name.toLowerCase();
    if (!name) {
      setError("请填写名称");
      return;
    }
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    if (!apiKey) {
      setError("请填写 API KEY");
      return;
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
                    setDraftModelIds((prev) => {
                      if (prev.length === 0) return nextDefaultModels;
                      const nextSet = new Set(nextDefaultModels);
                      const intersect = prev.filter((id) => nextSet.has(id));
                      return intersect.length > 0 ? intersect : nextDefaultModels;
                    });
                  }}
                >
                  {PROVIDERS.map((provider) => (
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
                      {model.id}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">API KEY</div>
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
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
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
