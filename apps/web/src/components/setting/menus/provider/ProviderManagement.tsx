"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConfirmDeleteDialog } from "@/components/setting/menus/provider/ConfirmDeleteDialog";
import { ModelDialog } from "@/components/setting/menus/provider/ModelDialog";
import { ProviderDialog } from "@/components/setting/menus/provider/ProviderDialog";
import { ProviderSection } from "@/components/setting/menus/provider/ProviderSection";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeChatModelSource } from "@/lib/provider-models";
import { ChevronDown } from "lucide-react";
import { Claude, OpenAI } from "@lobehub/icons";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { toast } from "sonner";
import type { CliToolConfig, CliToolsConfig } from "@teatime-ai/api/types/basic";
import { queryClient, trpc } from "@/utils/trpc";
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

type CliToolKind = keyof CliToolsConfig;
type CliToolSettings = CliToolConfig;

type CliToolStatus = {
  /** Tool id. */
  id: CliToolKind;
  /** Whether CLI tool is installed. */
  installed: boolean;
  /** Current CLI version. */
  version?: string;
  /** Latest version from npm. */
  latestVersion?: string;
  /** Whether an update is available. */
  hasUpdate?: boolean;
};

type CliStatusMap = Record<CliToolKind, CliToolStatus>;
type CliSettingsMap = CliToolsConfig;

/** Build editable CLI settings from basic config. */
function buildCliSettingsFromBasic(cliTools: CliToolsConfig): CliSettingsMap {
  return {
    codex: {
      apiUrl: cliTools.codex.apiUrl,
      apiKey: cliTools.codex.apiKey,
      forceCustomApiKey: cliTools.codex.forceCustomApiKey,
    },
    claudeCode: {
      apiUrl: cliTools.claudeCode.apiUrl,
      apiKey: cliTools.claudeCode.apiKey,
      forceCustomApiKey: cliTools.claudeCode.forceCustomApiKey,
    },
  };
}

/** Build CLI status map from query data. */
function buildCliStatusMap(list?: CliToolStatus[]): CliStatusMap {
  const fallback: CliStatusMap = {
    codex: { id: "codex", installed: false },
    claudeCode: { id: "claudeCode", installed: false },
  };
  if (!list?.length) return fallback;
  // 逻辑：服务端返回按 id 覆盖默认项，保证 UI 总是有值。
  for (const item of list) {
    fallback[item.id] = item;
  }
  return fallback;
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
  const { basic, setBasic } = useBasicConfig();
  const [cliSettings, setCliSettings] = useState<CliSettingsMap>(() =>
    buildCliSettingsFromBasic(basic.cliTools),
  );
  /** Active CLI settings dialog target. */
  const [activeCliTool, setActiveCliTool] = useState<CliToolKind>("codex");
  /** Whether CLI settings dialog is open. */
  const [cliDialogOpen, setCliDialogOpen] = useState(false);

  const cliStatusQuery = useQuery({
    ...trpc.settings.getCliToolsStatus.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const cliStatuses = useMemo(
    () => buildCliStatusMap(cliStatusQuery.data as CliToolStatus[] | undefined),
    [cliStatusQuery.data],
  );
  const isCliStatusLoading = cliStatusQuery.isLoading && !cliStatusQuery.data;

  /** Update cached CLI status list. */
  const updateCliStatusCache = (nextStatus: CliToolStatus) => {
    // 逻辑：局部更新缓存，避免每次操作后全量请求。
    queryClient.setQueryData(
      trpc.settings.getCliToolsStatus.queryOptions().queryKey,
      (prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const index = list.findIndex(
          (item: CliToolStatus) => item.id === nextStatus.id,
        );
        if (index >= 0) {
          list[index] = nextStatus;
        } else {
          list.push(nextStatus);
        }
        return list;
      },
    );
  };

  const installCliMutation = useMutation(
    trpc.settings.installCliTool.mutationOptions({
      onSuccess: (result) => {
        updateCliStatusCache(result.status as CliToolStatus);
        toast.success("安装完成");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const checkUpdateMutation = useMutation(
    trpc.settings.checkCliToolUpdate.mutationOptions({
      onSuccess: (result) => {
        const status = result.status as CliToolStatus;
        updateCliStatusCache(status);
        if (status.hasUpdate && status.latestVersion) {
          toast.message(`发现更新 v${status.latestVersion}`);
          return;
        }
        if (status.latestVersion) {
          toast.success("已是最新版本");
          return;
        }
        toast.message("暂时无法获取最新版本");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  /** Resolve CLI tool version label. */
  const resolveCliVersionLabel = (status: CliToolStatus) => {
    // 逻辑：优先显示安装版本，其次显示安装状态。
    if (isCliStatusLoading) return "检测中";
    if (status.installed && status.version) return `v${status.version}`;
    if (status.installed) return "已安装";
    return "未安装";
  };

  /** Trigger install or update check based on current status. */
  const handleCliPrimaryAction = async (tool: CliToolKind) => {
    const status = cliStatuses[tool];
    // 逻辑：已安装走更新检查，未安装走安装。
    if (status.installed && status.hasUpdate && status.latestVersion) {
      await installCliMutation.mutateAsync({ id: tool });
      return;
    }
    if (status.installed) {
      await checkUpdateMutation.mutateAsync({ id: tool });
      return;
    }
    await installCliMutation.mutateAsync({ id: tool });
  };

  /** Save CLI tool settings to basic config. */
  const handleSaveCliSettings = async () => {
    try {
      // 逻辑：统一保存整组 CLI 配置，避免只更新局部导致丢失。
      await setBasic({ cliTools: cliSettings });
      toast.success("已保存");
      setCliDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      toast.error(message);
    }
  };

  useEffect(() => {
    if (cliDialogOpen) return;
    setCliSettings(buildCliSettingsFromBasic(basic.cliTools));
  }, [basic.cliTools, cliDialogOpen]);

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
  /** CLI tool labels. */
  const cliToolLabels: Record<CliToolKind, string> = {
    codex: "Codex CLI",
    claudeCode: "Claude Code",
  };
  /** CLI tool descriptions. */
  const cliToolDescriptions: Record<CliToolKind, string> = {
    codex: "OpenAI Codex CLI 编程助手",
    claudeCode: "Anthropic Claude Code CLI 编程助手",
  };
  const cliDialogTitle = `${cliToolLabels[activeCliTool]} 设置`;

  /** Open CLI settings dialog for a tool. */
  const openCliSettings = (tool: CliToolKind) => {
    setActiveCliTool(tool);
    setCliDialogOpen(true);
  };

  /** Update CLI settings with a partial patch. */
  const updateCliSettings = (tool: CliToolKind, patch: Partial<CliToolSettings>) => {
    setCliSettings((prev) => ({
      ...prev,
      [tool]: { ...prev[tool], ...patch },
    }));
  };

  const activeCliSettings = cliSettings[activeCliTool];

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

  return (
    <div className={wrapperClassName}>
      <TeatimeSettingsGroup
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

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型来源</div>
              <div className="text-xs text-muted-foreground">
                选择本地服务商或云端模型
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">聊天模型质量</div>
              <div className="text-xs text-muted-foreground">
                高 / 中 / 低（UI 预设）
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end">
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

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">模型声音提示</div>
              <div className="text-xs text-muted-foreground">
                发送请求与结束时播放提示音
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <div className="origin-right scale-110">
                <Switch
                  checked={basic.modelSoundEnabled}
                  onCheckedChange={(checked) =>
                    void setBasic({ modelSoundEnabled: checked })
                  }
                  aria-label="Model sound"
                />
              </div>
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="Cli编程工具">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <OpenAI
                  size={16}
                  style={{ color: OpenAI.colorPrimary }}
                  className="dark:!text-white"
                  aria-hidden="true"
                />
                <span>{cliToolLabels.codex}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cliToolDescriptions.codex} · 版本：{resolveCliVersionLabel(cliStatuses.codex)}
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (installCliMutation.isPending &&
                    installCliMutation.variables?.id === "codex") ||
                  (checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "codex")
                }
                onClick={() => void handleCliPrimaryAction("codex")}
              >
                {cliStatuses.codex.installed
                  ? installCliMutation.isPending &&
                    installCliMutation.variables?.id === "codex"
                    ? "升级中..."
                    : cliStatuses.codex.hasUpdate && cliStatuses.codex.latestVersion
                      ? `升级到v${cliStatuses.codex.latestVersion}`
                      : checkUpdateMutation.isPending &&
                          checkUpdateMutation.variables?.id === "codex"
                        ? "检测中..."
                        : "检测更新"
                  : installCliMutation.isPending &&
                      installCliMutation.variables?.id === "codex"
                    ? "安装中..."
                    : "安装"}
              </Button>
              {cliStatuses.codex.installed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCliSettings("codex")}
                >
                  设置
                </Button>
              ) : null}
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Claude.Color size={16} aria-hidden="true" />
                <span>{cliToolLabels.claudeCode}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cliToolDescriptions.claudeCode} · 版本：
                {resolveCliVersionLabel(cliStatuses.claudeCode)}
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (installCliMutation.isPending &&
                    installCliMutation.variables?.id === "claudeCode") ||
                  (checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "claudeCode")
                }
                onClick={() => void handleCliPrimaryAction("claudeCode")}
              >
                {cliStatuses.claudeCode.installed
                  ? installCliMutation.isPending &&
                    installCliMutation.variables?.id === "claudeCode"
                    ? "升级中..."
                    : cliStatuses.claudeCode.hasUpdate && cliStatuses.claudeCode.latestVersion
                      ? `升级到v${cliStatuses.claudeCode.latestVersion}`
                      : checkUpdateMutation.isPending &&
                          checkUpdateMutation.variables?.id === "claudeCode"
                        ? "检测中..."
                        : "检测更新"
                  : installCliMutation.isPending &&
                      installCliMutation.variables?.id === "claudeCode"
                    ? "安装中..."
                    : "安装"}
              </Button>
              {cliStatuses.claudeCode.installed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCliSettings("claudeCode")}
                >
                  设置
                </Button>
              ) : null}
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

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

      <Dialog open={cliDialogOpen} onOpenChange={setCliDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cliDialogTitle}</DialogTitle>
            <DialogDescription>配置 API URL 与密钥</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cli-api-url">API URL</Label>
              <Input
                id="cli-api-url"
                value={activeCliSettings.apiUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) =>
                  updateCliSettings(activeCliTool, { apiUrl: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-api-key">API Key</Label>
              <Input
                id="cli-api-key"
                type="password"
                value={activeCliSettings.apiKey}
                placeholder="••••••••"
                onChange={(event) =>
                  updateCliSettings(activeCliTool, { apiKey: event.target.value })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">强制使用自定义 API Key</div>
                <div className="text-xs text-muted-foreground">
                  开启后使用供应商 API Key 覆盖本地登录
                </div>
              </div>
              <div className="origin-right scale-110">
                <Switch
                  checked={activeCliSettings.forceCustomApiKey}
                  onCheckedChange={(checked) =>
                    updateCliSettings(activeCliTool, { forceCustomApiKey: checked })
                  }
                  aria-label="Force cli api key"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCliDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void handleSaveCliSettings()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
