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

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { ModelDialog } from "@/components/setting/menus/provider/ModelDialog";
import { ProviderDialog } from "@/components/setting/menus/provider/ProviderDialog";
import { ProviderSection } from "@/components/setting/menus/provider/ProviderSection";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { Label } from "@openloaf/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@openloaf/ui/tabs";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { BarChart3, Bug, ChevronDown, Eye, MessageSquare, Sparkles, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@openloaf/ui/animate-ui/components/radix/switch";
import { toast } from "sonner";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { getModelLabel } from "@/lib/model-registry";
import { ModelIcon } from "@/components/setting/menus/provider/ModelIcon";
import {
  useProviderManagement,
  type ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";
import { WebSearchSettings } from "@/components/setting/menus/WebSearchSettings";
import { trpc } from "@/utils/trpc";

const TOKEN_K = 1000;
const TOKEN_M = 1000 * 1000;

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= TOKEN_M) {
    const next = value / TOKEN_M;
    const fixed = abs % TOKEN_M === 0 ? next.toFixed(0) : next.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}M`;
  }
  if (abs >= TOKEN_K) {
    const next = value / TOKEN_K;
    const fixed = abs % TOKEN_K === 0 ? next.toFixed(0) : next.toFixed(1);
    return `${fixed.replace(/\.0$/, "")}K`;
  }
  return String(value);
}

/** Flat-color icon badge for settings items. */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

/**
 * Compose provider management sections and dialogs.
 */
type ProviderManagementProps = {
  /** Optional panel key when rendered inside stack panels. */
  panelKey?: string;
  /** Optional tab id when rendered inside stack panels. */
  tabId?: string;
};

export function ProviderManagement({ panelKey }: ProviderManagementProps) {
  const { t } = useTranslation('settings');
  const { t: tProject } = useTranslation("project", { keyPrefix: "global" });
  const { basic, setBasic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const statsQuery = useQuery({
    ...trpc.chat.getChatStats.queryOptions(),
    staleTime: 5000,
  });

  const chatOnlineSearchMemoryScope: "tab" | "global" =
    basic.chatOnlineSearchMemoryScope === "global" ? "global" : "tab";
  const localToolModelOptions = useMemo(
    () =>
      buildChatModelOptions("local", providerItems, cloudModels, installedCliProviderIds).filter(
        (option) => option.tags?.includes("chat"),
      ),
    [providerItems, cloudModels, installedCliProviderIds],
  );
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
    editingModelId,
    draftModelId,
    setDraftModelId,
    draftModelName,
    setDraftModelName,
    draftModelTags,
    setDraftModelTags,
    draftModelContextK,
    setDraftModelContextK,
    error,
    modelError,
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
    openModelEditDialog,
    openProviderModelEditDialog,
    submitModelDraft,
    deleteProviderModel,
    PROVIDER_OPTIONS,
  } = useProviderManagement();

  const wrapperClassName = panelKey
    ? "h-full min-h-0 overflow-auto space-y-3"
    : "space-y-3";
  const sessionCount = statsQuery.data?.sessionCount;
  const usage = statsQuery.data?.usageTotals;

  /**
   * Delete model entry from provider list with a minimum guard.
   */
  async function handleDeleteProviderModel(entry: ProviderEntry, modelId: string) {
    if (Object.keys(entry.models).length <= 1) {
      toast.error(t('provider.keepAtLeastOneModel'));
      return;
    }
    await deleteProviderModel(entry, modelId);
    toast.success(t('provider.modelDeletedSuccess'));
  }


  return (
    <div className={wrapperClassName}>
      <OpenLoafSettingsGroup
        title={t('provider.preferencesTitle')}
        subtitle={t('provider.preferencesSubtitle')}
        className="pb-4"
      >
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={MessageSquare} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('provider.chatMemoryScope')}</div>
              <div className="text-xs text-muted-foreground">
                {t('provider.chatMemoryScopeDesc')}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <Tabs
                value={chatOnlineSearchMemoryScope}
                onValueChange={(next) =>
                  void setBasic({
                    chatOnlineSearchMemoryScope:
                      next === "global" ? "global" : "tab",
                  })
                }
              >
                <TabsList>
                  <TabsTrigger value="tab">{t('provider.chatMemoryScopeTab')}</TabsTrigger>
                  <TabsTrigger value="global">{t('provider.chatMemoryScopeGlobal')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Volume2} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('provider.modelSound')}</div>
              <div className="text-xs text-muted-foreground">
                {t('provider.modelSoundDesc')}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={basic.modelSoundEnabled}
                  onCheckedChange={(checked) =>
                    void setBasic({ modelSoundEnabled: checked })
                  }
                  aria-label="Model sound"
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Eye} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('provider.showAllToolResults')}</div>
              <div className="text-xs text-muted-foreground">
                {t('provider.showAllToolResultsDesc')}
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={basic.chatShowAllToolResults}
                  onCheckedChange={(checked) =>
                    void setBasic({ chatShowAllToolResults: checked })
                  }
                  aria-label="Show all tool results"
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Bug} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t('aboutAdditions.aiDebugMode')}</div>
              <div className="text-xs text-muted-foreground">{t('aboutAdditions.aiDebugModeDesc')}</div>
            </div>
            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={Boolean(basic.chatPrefaceEnabled)}
                  onCheckedChange={(checked) =>
                    void setBasic({ chatPrefaceEnabled: checked })
                  }
                  aria-label={t('aboutAdditions.aiDebugMode')}
                />
              </div>
            </OpenLoafSettingsField>
          </div>

        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={tProject("settings.chatData")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={MessageSquare} bg="bg-secondary" fg="text-foreground" />
            <div className="text-sm font-medium">{tProject("settings.totalSessions")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {typeof sessionCount === "number" ? sessionCount : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Sparkles} bg="bg-secondary" fg="text-foreground" />
            <div className="text-sm font-medium">{tProject("settings.totalTokens")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {usage ? formatTokenCount(usage.totalTokens) : "—"}
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={BarChart3} bg="bg-secondary" fg="text-foreground" />
            <div className="text-sm font-medium">{tProject("settings.tokenUsage")}</div>
            <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
              {usage
                ? tProject("settings.tokenBreakdown", {
                    input: formatTokenCount(usage.inputTokens),
                    inputRaw: formatTokenCount(Math.max(0, usage.inputTokens - usage.cachedInputTokens)),
                    cached: formatTokenCount(usage.cachedInputTokens),
                    output: formatTokenCount(usage.outputTokens),
                  })
                : "—"}
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <ProviderSection
        entries={entries}
        expandedProviders={expandedProviders}
        onAdd={() => openEditor()}
        onEdit={(entry) => openEditor(entry)}
        onDelete={(key) => setConfirmDeleteId(key)}
        onToggleExpand={(key) =>
          setExpandedProviders((prev) => ({
            ...prev,
            [key]: !prev[key],
          }))
        }
        onModelEdit={(entry, model) => openProviderModelEditDialog(entry, model)}
        onModelDelete={(entry, modelId) => void handleDeleteProviderModel(entry, modelId)}
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
        onOpenModelEditDialog={openModelEditDialog}
        onSubmit={submitDraft}
      />

      <ModelDialog
        open={modelDialogOpen}
        editingModelId={editingModelId}
        draftModelId={draftModelId}
        draftModelName={draftModelName}
        draftModelTags={draftModelTags}
        draftModelContextK={draftModelContextK}
        modelError={modelError}
        onOpenChange={setModelDialogOpen}
        onDraftModelIdChange={setDraftModelId}
        onDraftModelNameChange={setDraftModelName}
        onDraftModelTagsChange={setDraftModelTags}
        onDraftModelContextKChange={setDraftModelContextK}
        onSubmit={submitModelDraft}
      />

      <ConfirmDeleteDialog
        title={t('provider.confirmDeleteTitle')}
        description={t('provider.confirmDeleteDesc')}
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (!confirmDeleteId) return;
          await deleteProvider(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />

      <WebSearchSettings />

    </div>
  );
}
