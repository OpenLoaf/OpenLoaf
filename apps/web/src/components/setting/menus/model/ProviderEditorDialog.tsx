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

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import {
  getModelLabel,
  getModelSummary,
  getProviderDefinition,
  getProviderModels,
  getProviderOptions,
  isModelRegistryReady,
} from "@/lib/model-registry";

/** Custom provider id for user-defined OpenAI-compatible endpoints. */
const CUSTOM_PROVIDER_ID = "custom";

export type ProviderEntryPayload = {
  /** Entry display name. */
  key: string;
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model definitions keyed by model id. */
  models: Record<string, ReturnType<typeof getProviderModels>[number]>;
};

/**
 * Parse auth config input into a raw object.
 */
function parseAuthConfigInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return { apiKey: trimmed };
}

/**
 * Resolve default provider name from registry.
 */
function getDefaultProviderName(providerId: string) {
  return getProviderDefinition(providerId)?.label ?? providerId;
}

/**
 * Resolve default API URL from registry.
 */
function getDefaultApiUrl(providerId: string) {
  return getProviderDefinition(providerId)?.apiUrl ?? "";
}

/**
 * Resolve default model id from registry.
 */
function getDefaultModelIds(providerId: string) {
  const models = getProviderModels(providerId);
  const first = models[0];
  return first ? [first.id] : [];
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
  const { t } = useTranslation('settings');
  const registryReady = isModelRegistryReady();
  const PROVIDER_OPTIONS = useMemo(() => {
    void registryReady;
    const options = getProviderOptions();
    if (options.some((provider) => provider.id === CUSTOM_PROVIDER_ID)) {
      return options;
    }
    // 逻辑：当 SaaS 模板未返回 custom 时，本地补齐“自定义服务商地址”入口。
    return [
      ...options,
      { id: CUSTOM_PROVIDER_ID, label: t('provider.customProviderAddressOption') },
    ];
  }, [registryReady, t]);
  const PROVIDER_LABEL_BY_ID = useMemo(
    () =>
      Object.fromEntries(
        PROVIDER_OPTIONS.map((provider) => [provider.id, provider.label]),
      ) as Record<string, string>,
    [PROVIDER_OPTIONS],
  );
  const [draftProvider, setDraftProvider] = useState<string>(
    PROVIDER_OPTIONS[0]?.id ?? "",
  );
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftAuthRaw, setDraftAuthRaw] = useState("");
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [showAuth, setShowAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerLabelById = PROVIDER_LABEL_BY_ID;

  const modelOptions = useMemo(
    () => getProviderModels(draftProvider),
    [draftProvider],
  );

  const resetDraft = () => {
    setError(null);
    const defaultProvider = PROVIDER_OPTIONS[0]?.id ?? "";
    setDraftProvider(defaultProvider);
    setDraftName(providerLabelById[defaultProvider] ?? getDefaultProviderName(defaultProvider));
    setDraftApiUrl(getDefaultApiUrl(defaultProvider));
    setDraftAuthRaw("");
    setDraftModelIds(getDefaultModelIds(defaultProvider));
    setShowAuth(false);
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
    const normalizedName = name.toLowerCase();
    const fail = (message: string) => {
      setError(message);
      throw new Error(message);
    };
    setError(null);
    if (!name) fail(t('provider.errorFillName'));
    if (!apiUrl) fail(t('provider.errorFillApiUrl'));
    const authConfig = parseAuthConfigInput(draftAuthRaw);
    if (!authConfig) fail(t('provider.errorFillAuth'));
    if (draftModelIds.length === 0) fail(t('provider.errorSelectModel'));
    if (existingKeys.some((key) => key.toLowerCase() === normalizedName)) {
      fail(t('provider.errorNameExists'));
    }
    const providerModels = getProviderModels(draftProvider);
    const modelIdSet = new Set(providerModels.map((model) => model.id));
    const modelIds = draftModelIds.filter((modelId) => modelIdSet.has(modelId));
    if (modelIds.length === 0) fail(t('provider.errorModelMissing'));
    const models = modelIds.reduce<Record<string, ReturnType<typeof getProviderModels>[number]>>(
      (acc, modelId) => {
        const model = providerModels.find((item) => item.id === modelId);
        if (model) acc[modelId] = model;
        return acc;
      },
      {},
    );
    // 中文注释：模型 ID 以定义为准，确保存储字段同步。
    const payload: ProviderEntryPayload = {
      key: name,
      providerId: draftProvider,
      apiUrl,
      authConfig: authConfig as Record<string, unknown>,
      models,
    };
    await onSubmit(payload);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('provider.addProvider')}
      onSubmit={submitDraft}
    >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('provider.title')}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {providerLabelById[draftProvider] ?? draftProvider}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuRadioGroup
                  value={draftProvider}
                  onValueChange={(next) => {
                    const provider = next;
                    const currentDefault = getDefaultApiUrl(draftProvider);
                    const nextDefault = getDefaultApiUrl(provider);
                    const currentDefaultName =
                      providerLabelById[draftProvider] ?? getDefaultProviderName(draftProvider);
                    const nextDefaultName =
                      providerLabelById[provider] ?? getDefaultProviderName(provider);
                    const nextDefaultModels = getDefaultModelIds(provider);
                    setDraftProvider(provider);
                    if (!draftApiUrl.trim() || draftApiUrl.trim() === currentDefault) {
                      setDraftApiUrl(nextDefault);
                    }
                    if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                      setDraftName(nextDefaultName);
                    }
                    setDraftAuthRaw("");
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
            <div className="text-sm font-medium">{t('provider.name')}</div>
            <Input
              value={draftName}
              placeholder={t('provider.namePlaceholder')}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t('provider.apiUrl')}</div>
            <Input
              value={draftApiUrl}
              placeholder={t('provider.apiUrlPlaceholder')}
              onChange={(event) => setDraftApiUrl(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t('provider.model')}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {getModelSummary(modelOptions, draftModelIds, {
                      empty: t('modelSelector.noModels'),
                      unselected: t('modelSelector.unselected'),
                      separator: t('modelSelector.separator'),
                    })}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                {modelOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t('modelSelector.noModels')}
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
            <div className="text-sm font-medium">{t('provider.authentication')}</div>
            <div className="relative">
              <Input
                type={showAuth ? "text" : "password"}
                value={draftAuthRaw}
                placeholder={t('provider.authPlaceholder')}
                onChange={(event) => setDraftAuthRaw(event.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setShowAuth((prev) => !prev)}
                aria-label={showAuth ? t('provider.hideAuth') : t('provider.showAuth')}
              >
                {showAuth ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>
    </FormDialog>
  );
}
