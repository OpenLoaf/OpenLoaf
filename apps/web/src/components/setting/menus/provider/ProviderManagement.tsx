"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { ModelDialog } from "@/components/setting/menus/provider/ModelDialog";
import { ProviderDialog } from "@/components/setting/menus/provider/ProviderDialog";
import { ProviderSection } from "@/components/setting/menus/provider/ProviderSection";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { Button } from "@tenas-ai/ui/button";
import { Checkbox } from "@tenas-ai/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@tenas-ai/ui/dropdown-menu";
import { Label } from "@tenas-ai/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import { normalizeChatModelSource } from "@/lib/provider-models";
import { ChevronDown } from "lucide-react";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@tenas-ai/ui/animate-ui/components/radix/switch";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useTabs } from "@/hooks/use-tabs";
import {
  useProviderManagement,
  type ProviderEntry,
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
type ProviderManagementProps = {
  /** Optional panel key when rendered inside stack panels. */
  panelKey?: string;
  /** Optional tab id when rendered inside stack panels. */
  tabId?: string;
};

export function ProviderManagement({ panelKey }: ProviderManagementProps) {
  const { basic, setBasic } = useBasicConfig();
  const autoSummaryHours = Array.from({ length: 25 }, (_, hour) => hour);
  const [manualDate, setManualDate] = useState("");

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
  const workspaceQuery = useQuery(trpc.workspace.getActive.queryOptions());
  const workspaceId = workspaceQuery.data?.id ?? "";
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabs((state) => state.pushStackItem);
  const runSummaryForWorkspace = useMutation(
    trpc.project.runSummaryForWorkspace.mutationOptions({
      onSuccess: async () => {},
    }),
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

  /**
   * Delete model entry from provider list with a minimum guard.
   */
  async function handleDeleteProviderModel(entry: ProviderEntry, modelId: string) {
    if (Object.keys(entry.models).length <= 1) {
      toast.error("至少保留一个模型");
      return;
    }
    await deleteProviderModel(entry, modelId);
    toast.success("已删除模型");
  }

  function handleToggleAutoSummaryHour(hour: number) {
    const next = new Set(basic.autoSummaryHours ?? []);
    if (next.has(hour)) {
      next.delete(hour);
    } else {
      next.add(hour);
    }
    // 逻辑：排序后写回，保持配置稳定输出。
    const sorted = Array.from(next).sort((a, b) => a - b);
    void setBasic({ autoSummaryHours: sorted });
  }

  function handleRunSummaryForWorkspace() {
    if (!workspaceId) {
      toast.error("未找到工作空间");
      return;
    }
    if (!manualDate) return;
    runSummaryForWorkspace.mutate({ workspaceId, dateKey: manualDate });
  }

  const handleOpenHistoryPanel = useCallback(() => {
    if (!activeTabId || !workspaceId) return;
    pushStackItem(activeTabId, {
      id: `summary-history:workspace:${workspaceId}`,
      sourceKey: `summary-history:workspace:${workspaceId}`,
      component: "scheduler-task-history",
      title: "工作空间汇总历史",
      params: { workspaceId, scope: "workspace" },
    });
  }, [activeTabId, pushStackItem, workspaceId]);

  const autoSummaryLabel = (basic.autoSummaryHours ?? [])
    .map((hour) => `${hour}时`)
    .join("、");

  return (
    <div className={wrapperClassName}>
      <TenasSettingsGroup
        title="模型设置"
        subtitle="调整模型响应语言、来源与质量偏好。"
        className="pb-4"
      >
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型返回语言</div>
              <div className="text-xs text-muted-foreground">
                暂不支持切换，仅保存偏好
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型来源</div>
              <div className="text-xs text-muted-foreground">
                选择本地服务商或云端模型
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">聊天模型质量</div>
              <div className="text-xs text-muted-foreground">
                高 / 中 / 低（UI 预设）
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型声音提示</div>
              <div className="text-xs text-muted-foreground">
                发送请求与结束时播放提示音
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={basic.modelSoundEnabled}
                  onCheckedChange={(checked) =>
                    void setBasic({ modelSoundEnabled: checked })
                  }
                  aria-label="Model sound"
                />
              </div>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">资料自动总结</div>
              <div className="text-xs text-muted-foreground">
                自动总结项目资料并按计划生成记录
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={basic.autoSummaryEnabled}
                  onCheckedChange={(checked) =>
                    void setBasic({ autoSummaryEnabled: checked })
                  }
                  aria-label="Auto summary"
                />
              </div>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">自动总结时间</div>
              <div className="text-xs text-muted-foreground">
                选择一天内需要自动总结的小时
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-muted-foreground">
                  {autoSummaryLabel || "-"}
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" disabled={!basic.autoSummaryEnabled}>
                      设置
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[280px]">
                    <div className="grid grid-cols-5 gap-2">
                      {autoSummaryHours.map((hour) => {
                        const checked = (basic.autoSummaryHours ?? []).includes(hour);
                        const id = `auto-summary-hour-${hour}`;
                        return (
                          <div key={hour} className="flex items-center gap-2">
                            <Checkbox
                              id={id}
                              checked={checked}
                              onCheckedChange={() => handleToggleAutoSummaryHour(hour)}
                              disabled={!basic.autoSummaryEnabled}
                            />
                            <Label htmlFor={id} className="text-xs">
                              {hour}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">立即触发</div>
              <div className="text-xs text-muted-foreground">
                选择任意日期执行工作空间内的日汇总
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-[360px] shrink-0">
              <div className="flex items-center justify-end gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      执行
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[240px]">
                    <div className="space-y-3">
                      <input
                        type="date"
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                        value={manualDate}
                        onChange={(event) => setManualDate(event.target.value)}
                      />
                      <Button
                        type="button"
                        onClick={handleRunSummaryForWorkspace}
                        disabled={!manualDate || runSummaryForWorkspace.isPending}
                      >
                        立即触发
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="ghost" onClick={handleOpenHistoryPanel}>
                  历史面板
                </Button>
              </div>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

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
        draftModelCurrencySymbol={draftModelCurrencySymbol}
        draftModelInputPrice={draftModelInputPrice}
        draftModelInputCachePrice={draftModelInputCachePrice}
        draftModelOutputPrice={draftModelOutputPrice}
        modelError={modelError}
        onOpenChange={setModelDialogOpen}
        onDraftModelIdChange={setDraftModelId}
        onDraftModelNameChange={setDraftModelName}
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
