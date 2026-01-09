"use client";

import { useState } from "react";
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { ModelDialog } from "@/components/setting/menus/provider/ModelDialog";
import { ProviderDialog } from "@/components/setting/menus/provider/ProviderDialog";
import { ProviderSection } from "@/components/setting/menus/provider/ProviderSection";
import { TeatimeSettingsCard } from "@/components/ui/teatime/TeatimeSettingsCard";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeChatModelSource } from "@/lib/provider-models";
import { ChevronDown } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { toast } from "sonner";
import {
  useProviderManagement,
} from "@/components/setting/menus/provider/use-provider-management";

type ModelResponseLanguageId =
  | "zh-CN"
  | "en-US"
  | "ja-JP"
  | "ko-KR"
  | "fr-FR"
  | "de-DE"
  | "es-ES";

/**
 * Compose provider management sections and dialogs.
 */
export function ProviderManagement() {
  const { basic, setBasic } = useBasicConfig();
  // 逻辑：默认关闭强制 API Key，等待后续与配置联动。
  const [codexForceApiKey, setCodexForceApiKey] = useState(false);

  const modelResponseLanguage: ModelResponseLanguageId = basic.modelResponseLanguage;
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const chatModelQuality: "high" | "medium" | "low" = basic.modelQuality;
  const modelResponseLanguageLabelById: Record<ModelResponseLanguageId, string> = {
    "zh-CN": "中文（简体）",
    "en-US": "English",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
    "fr-FR": "Français",
    "de-DE": "Deutsch",
    "es-ES": "Español",
  };
  // 逻辑：先用静态占位状态，等待接入 Codex CLI 的真实检测流程。
  const codexStatus = {
    installed: false,
    currentVersion: "",
    latestVersion: "",
  };
  const codexCurrentVersionLabel =
    codexStatus.installed && codexStatus.currentVersion
      ? `v${codexStatus.currentVersion}`
      : "未安装";
  const codexLatestVersionLabel = codexStatus.latestVersion
    ? `v${codexStatus.latestVersion}`
    : "未检测";

  const {
    entries,
    dialogOpen,
    setDialogOpen,
    modelDialogOpen,
    setModelDialogOpen,
    editingKey,
    confirmDeleteId,
    setConfirmDeleteId,
    draftProvider,
    setDraftProvider,
    draftName,
    setDraftName,
    draftApiUrl,
    setDraftApiUrl,
    draftAuthMode,
    setDraftAuthMode,
    draftApiKey,
    setDraftApiKey,
    draftAccessKeyId,
    setDraftAccessKeyId,
    draftSecretAccessKey,
    setDraftSecretAccessKey,
    draftEnableResponsesApi,
    setDraftEnableResponsesApi,
    showAuth,
    setShowAuth,
    showSecretAccessKey,
    setShowSecretAccessKey,
    draftModelIds,
    setDraftModelIds,
    draftCustomModels,
    setDraftCustomModels,
    draftModelFilter,
    setDraftModelFilter,
    setFocusedModelId,
    draftModelId,
    setDraftModelId,
    draftModelTags,
    setDraftModelTags,
    draftModelContextK,
    setDraftModelContextK,
    draftModelCurrencySymbol,
    setDraftModelCurrencySymbol,
    draftModelInputPrice,
    setDraftModelInputPrice,
    draftModelInputCachePrice,
    setDraftModelInputCachePrice,
    draftModelOutputPrice,
    setDraftModelOutputPrice,
    error,
    modelError,
    copiedKey,
    setCopiedKey,
    expandedProviders,
    setExpandedProviders,
    providerLabelById,
    modelOptions,
    filteredModelOptions,
    focusedModel,
    openEditor,
    submitDraft,
    deleteProvider,
    openModelDialog,
    submitModelDraft,
    PROVIDER_OPTIONS,
  } = useProviderManagement();

  return (
    <div className="space-y-3">
      <TeatimeSettingsGroup
        title="模型设置"
        subtitle="调整模型响应语言、来源与质量偏好。"
        showBorder={false}
        className="pb-4"
      >
        <TeatimeSettingsCard divided className="bg-background">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">模型返回语言</div>
              <div className="text-xs text-muted-foreground">
                暂不支持切换，仅保存偏好
              </div>
            </div>

            <TeatimeSettingsField>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[200px] w-auto justify-between font-normal"
                  >
                    <span className="truncate">
                      {modelResponseLanguageLabelById[modelResponseLanguage]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  <DropdownMenuRadioGroup
                    value={modelResponseLanguage}
                    onValueChange={(next) =>
                      void setBasic({ modelResponseLanguage: next as ModelResponseLanguageId })
                    }
                  >
                    {Object.entries(modelResponseLanguageLabelById).map(
                      ([id, label]) => (
                        <DropdownMenuRadioItem key={id} value={id}>
                          {label}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">模型来源</div>
              <div className="text-xs text-muted-foreground">
                选择本地服务商或云端模型
              </div>
            </div>

            <TeatimeSettingsField>
              <Tabs
                value={chatModelSource}
                onValueChange={(next) =>
                  void setBasic({ chatSource: normalizeChatModelSource(next) })
                }
              >
                <TabsList>
                  <TabsTrigger value="local">本地</TabsTrigger>
                  <TabsTrigger value="cloud">云端</TabsTrigger>
                </TabsList>
              </Tabs>
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">聊天模型质量</div>
              <div className="text-xs text-muted-foreground">
                高 / 中 / 低（UI 预设）
              </div>
            </div>

            <TeatimeSettingsField>
              <Tabs
                value={chatModelQuality}
                onValueChange={(next) =>
                  void setBasic({ modelQuality: next as "high" | "medium" | "low" })
                }
              >
                <TabsList>
                  <TabsTrigger value="high">高</TabsTrigger>
                  <TabsTrigger value="medium">中</TabsTrigger>
                  <TabsTrigger value="low">低</TabsTrigger>
                </TabsList>
              </Tabs>
            </TeatimeSettingsField>
          </div>
        </TeatimeSettingsCard>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="Codex CLI">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">安装与版本</div>
              <div className="text-xs text-muted-foreground">
                当前版本：{codexCurrentVersionLabel}
              </div>
              <div className="text-xs text-muted-foreground">
                安装方式：npm i -g @openai/codex
              </div>
            </div>

            <TeatimeSettingsField className="gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.message("暂未接入 Codex CLI 安装流程")}
              >
                {codexStatus.installed ? "重新安装" : "安装"}
              </Button>
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">更新检查</div>
              <div className="text-xs text-muted-foreground">
                最新版本：{codexLatestVersionLabel}
              </div>
            </div>

            <TeatimeSettingsField className="gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast.message("暂未接入 Codex CLI 更新检查")}
              >
                检测更新
              </Button>
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">强制使用自定义 API Key</div>
              <div className="text-xs text-muted-foreground">
                开启后使用供应商 API Key 覆盖本地登录
              </div>
            </div>

            <TeatimeSettingsField>
              <div className="origin-right scale-125">
                <Switch
                  checked={codexForceApiKey}
                  onCheckedChange={setCodexForceApiKey}
                  aria-label="Force codex api key"
                />
              </div>
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

      <ProviderSection
        entries={entries}
        expandedProviders={expandedProviders}
        copiedKey={copiedKey}
        onAdd={() => openEditor()}
        onEdit={(entry) => openEditor(entry)}
        onDelete={(key) => setConfirmDeleteId(key)}
        onCopiedKeyChange={setCopiedKey}
        onToggleExpand={(key) =>
          setExpandedProviders((prev) => ({
            ...prev,
            [key]: !prev[key],
          }))
        }
      />

      <ProviderDialog
        open={dialogOpen}
        editingKey={editingKey}
        providerOptions={PROVIDER_OPTIONS}
        providerLabelById={providerLabelById}
        draftProvider={draftProvider}
        draftName={draftName}
        draftApiUrl={draftApiUrl}
        draftAuthMode={draftAuthMode}
        draftApiKey={draftApiKey}
        draftAccessKeyId={draftAccessKeyId}
        draftSecretAccessKey={draftSecretAccessKey}
        draftEnableResponsesApi={draftEnableResponsesApi}
        showAuth={showAuth}
        showSecretAccessKey={showSecretAccessKey}
        draftModelIds={draftModelIds}
        draftCustomModels={draftCustomModels}
        draftModelFilter={draftModelFilter}
        error={error}
        modelOptions={modelOptions}
        filteredModelOptions={filteredModelOptions}
        focusedModel={focusedModel}
        onOpenChange={setDialogOpen}
        onDraftProviderChange={setDraftProvider}
        onDraftNameChange={setDraftName}
        onDraftApiUrlChange={setDraftApiUrl}
        onDraftAuthModeChange={setDraftAuthMode}
        onDraftApiKeyChange={setDraftApiKey}
        onDraftAccessKeyIdChange={setDraftAccessKeyId}
        onDraftSecretAccessKeyChange={setDraftSecretAccessKey}
        onDraftEnableResponsesApiChange={setDraftEnableResponsesApi}
        onShowAuthChange={setShowAuth}
        onShowSecretAccessKeyChange={setShowSecretAccessKey}
        onDraftModelIdsChange={setDraftModelIds}
        onDraftCustomModelsChange={setDraftCustomModels}
        onDraftModelFilterChange={setDraftModelFilter}
        onFocusedModelIdChange={setFocusedModelId}
        onOpenModelDialog={openModelDialog}
        onSubmit={submitDraft}
      />

      <ModelDialog
        open={modelDialogOpen}
        draftModelId={draftModelId}
        draftModelTags={draftModelTags}
        draftModelContextK={draftModelContextK}
        draftModelCurrencySymbol={draftModelCurrencySymbol}
        draftModelInputPrice={draftModelInputPrice}
        draftModelInputCachePrice={draftModelInputCachePrice}
        draftModelOutputPrice={draftModelOutputPrice}
        modelError={modelError}
        onOpenChange={setModelDialogOpen}
        onDraftModelIdChange={setDraftModelId}
        onDraftModelTagsChange={setDraftModelTags}
        onDraftModelContextKChange={setDraftModelContextK}
        onDraftModelCurrencySymbolChange={setDraftModelCurrencySymbol}
        onDraftModelInputPriceChange={setDraftModelInputPrice}
        onDraftModelInputCachePriceChange={setDraftModelInputCachePrice}
        onDraftModelOutputPriceChange={setDraftModelOutputPrice}
        onSubmit={submitModelDraft}
      />

      <ConfirmDeleteDialog
        title="确认删除"
        description="确认要删除这个服务商配置吗？"
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (!confirmDeleteId) return;
          await deleteProvider(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
