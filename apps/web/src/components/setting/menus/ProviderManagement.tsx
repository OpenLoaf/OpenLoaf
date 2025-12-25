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
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Copy, Eye, EyeOff, Menu, Pencil, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";
import { useSettingsValues } from "@/hooks/use-settings";
import {
  DEEPSEEK_MODEL_CATALOG,
  GOOGLE_MODEL_CATALOG,
  XAI_MODEL_CATALOG,
  type ModelDefinition,
} from "@teatime-ai/api/common";

type ProviderId = "anthropic" | "deepseek" | "google" | "openai" | "xai" | "custom";

type KeyEntry = {
  provider: ProviderId;
  apiUrl: string;
  apiKey: string;
  modelIds: string[];
  modelDefinitions: ModelDefinition[];
};

type ProviderEntry = KeyEntry & {
  key: string;
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
 * Mask the API key to show the first and last 6 characters.
 */
function maskKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const head = trimmed.slice(0, 6);
  const tail = trimmed.slice(-6);
  if (trimmed.length <= 12) return trimmed;
  const maskedMiddle = "*".repeat(trimmed.length - 12);
  return `${head}${maskedMiddle}${tail}`;
}

/**
 * Truncate display text without affecting stored value.
 */
function truncateDisplay(value: string, maxLength = 32) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

/**
 * Copy text into clipboard.
 */
async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // 兼容旧浏览器的降级方案。
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

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
 * Build labels for all selected models.
 */
function getSelectedModelLabels(models: ModelDefinition[]) {
  if (!Array.isArray(models) || models.length === 0) return "未配置";
  return models.map((model) => model.id).join("、");
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

export function ProviderManagement() {
  const { items, setValue, removeValue } = useSettingsValues();
  const entries = useMemo(() => {
    const list: ProviderEntry[] = [];
    for (const item of items) {
      if ((item.category ?? "general") !== "provider") continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<KeyEntry>;
      if (!entry.provider || !entry.apiUrl || !entry.apiKey) continue;
      list.push({
        key: item.key,
        provider: entry.provider as ProviderId,
        apiUrl: entry.apiUrl,
        apiKey: entry.apiKey,
        modelIds: Array.isArray(entry.modelIds) ? entry.modelIds : [],
        modelDefinitions: Array.isArray(entry.modelDefinitions)
          ? (entry.modelDefinitions as ModelDefinition[])
          : [],
      });
    }
    return list;
  }, [items]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDERS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  /**
   * Open the editor dialog and hydrate the draft fields.
   */
  function openEditor(entry?: ProviderEntry) {
    setError(null);
    const provider = entry?.provider ?? "openai";
    setEditingKey((entry as ProviderEntry | undefined)?.key ?? null);
    setDraftProvider(provider);
    setDraftName(entry?.key ?? getDefaultProviderName(provider));
    setDraftApiUrl(entry?.apiUrl ?? getDefaultApiUrl(provider));
    setDraftApiKey(entry?.apiKey ?? "");
    setShowApiKey(false);
    setDraftModelIds(entry?.modelIds ?? getDefaultModelIds(provider));
    setDialogOpen(true);
  }

  /**
   * Submit the draft to create or update an entry.
   */
  async function submitDraft() {
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
    const nameExists = entries.some((entry) => {
      if (editingKey && entry.key === editingKey) return false;
      return entry.key.toLowerCase() === normalizedName;
    });
    if (nameExists) {
      setError("名称已存在，请更换");
      return;
    }

    const modelDefinitions = resolveModelDefinitions(draftProvider, draftModelIds);
    if (modelDefinitions.length === 0) {
      setError("模型定义缺失");
      return;
    }
    // 中文注释：模型 ID 以定义为准，确保存储字段同步。
    const entryValue: KeyEntry = {
      provider: draftProvider,
      apiUrl,
      apiKey,
      modelIds: modelDefinitions.map((model) => model.id),
      modelDefinitions,
    };

    if (!editingKey) {
      await setValue(name, entryValue, "provider");
      setDialogOpen(false);
      return;
    }

    const shouldReuseKey = editingKey === name;
    const nextKey = shouldReuseKey ? editingKey : name;
    if (!shouldReuseKey) await removeValue(editingKey, "provider");
    await setValue(nextKey, entryValue, "provider");
    setDialogOpen(false);
  }

  const modelOptions = useMemo(
    () => MODEL_CATALOG_BY_PROVIDER[draftProvider]?.getModels() ?? [],
    [draftProvider],
  );

  return (
    <div className="space-y-3">
      <SettingsGroup
        title="服务商"
        action={
          <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onMouseEnter={() => setAddMenuOpen(true)}
                aria-label="添加服务商"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onMouseLeave={() => setAddMenuOpen(false)}
            >
              <DropdownMenuItem onSelect={() => openEditor()}>
                添加模型服务商
              </DropdownMenuItem>
              <DropdownMenuItem disabled>添加用户账户密码</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <div className="text-xs text-muted-foreground">
          配置模型服务商的 API URL 与 API KEY。
        </div>
      </SettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[160px_120px_260px_1.5fr_0.8fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>名称</div>
          <div>类型</div>
          <div>模型</div>
          <div>API URL</div>
          <div>API KEY</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className={cn(
                "group grid grid-cols-[160px_120px_260px_1.5fr_0.8fr_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm">{entry.key}</div>

              <div className="text-sm text-muted-foreground">模型服务商</div>

              <div className="text-sm text-muted-foreground break-words whitespace-normal">
                <div className="flex flex-col gap-1">
                  {entry.modelDefinitions.map((model) => (
                    <span key={model.id}>{model.id}</span>
                  ))}
                </div>
              </div>

              <div className="min-w-0 flex items-center gap-2">
                <div className="text-sm truncate">{truncateDisplay(entry.apiUrl)}</div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-0 text-muted-foreground/70 transition-opacity group-hover:opacity-100"
                  onClick={async () => {
                    await copyToClipboard(entry.apiUrl);
                    setCopiedKey(entry.key);
                    window.setTimeout(() => {
                      setCopiedKey((prev) => (prev === entry.key ? null : prev));
                    }, 1200);
                  }}
                  aria-label="复制 API URL"
                >
                  {copiedKey === entry.key ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>

              <div className="min-w-0 text-sm font-mono truncate">
                {truncateDisplay(maskKey(entry.apiKey))}
              </div>

              <div className="flex items-center justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openEditor(entry)}
                  aria-label="Edit key"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setConfirmDeleteId(entry.key)}
                  aria-label="Delete key"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无服务商，点击右上角添加。
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKey ? "编辑服务商" : "添加服务商"}</DialogTitle>
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
                    <span className="truncate">
                      {providerLabelById[draftProvider]}
                    </span>
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
                    {PROVIDERS.map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        {p.label}
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
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitDraft}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            确认要删除这个服务商配置吗？
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmDeleteId) return;
                await removeValue(confirmDeleteId, "provider");
                setConfirmDeleteId(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
