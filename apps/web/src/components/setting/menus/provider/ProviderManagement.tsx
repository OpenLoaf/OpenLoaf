"use client";

import { useState } from "react";
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

type CliToolKind = "codex" | "claude";

type CliToolSettings = {
  /** API base URL. */
  apiUrl: string;
  /** API key for CLI tool. */
  apiKey: string;
  /** Whether to force custom API key. */
  forceApiKey: boolean;
};

type CliToolStatus = {
  /** Whether CLI tool is installed. */
  installed: boolean;
  /** Current CLI version. */
  currentVersion: string;
};

/**
 * Compose provider management sections and dialogs.
 */
export function ProviderManagement() {
  const { basic, setBasic } = useBasicConfig();
  // 逻辑：默认关闭强制 API Key，等待后续与配置联动。
  const [cliSettings, setCliSettings] = useState<Record<CliToolKind, CliToolSettings>>({
    codex: { apiUrl: "", apiKey: "", forceApiKey: false },
    claude: { apiUrl: "", apiKey: "", forceApiKey: false },
  });
  /** Active CLI settings dialog target. */
  const [activeCliTool, setActiveCliTool] = useState<CliToolKind>("codex");
  /** Whether CLI settings dialog is open. */
  const [cliDialogOpen, setCliDialogOpen] = useState(false);

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
  // 逻辑：先用静态占位状态，等待接入 CLI 的真实检测流程。
  const cliStatuses: Record<CliToolKind, CliToolStatus> = {
    codex: { installed: false, currentVersion: "" },
    claude: { installed: false, currentVersion: "" },
  };
  /** CLI tool labels. */
  const cliToolLabels: Record<CliToolKind, string> = {
    codex: "Codex CLI",
    claude: "Claude Code",
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
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="Cli编程工具">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{cliToolLabels.codex}</div>
              <div className="text-xs text-muted-foreground">
                OpenAI Codex CLI 编程助手 · 版本：
                {cliStatuses.codex.installed && cliStatuses.codex.currentVersion
                  ? `v${cliStatuses.codex.currentVersion}`
                  : cliStatuses.codex.installed
                    ? "已安装"
                    : "未安装"}
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (cliStatuses.codex.installed) {
                    toast.message("暂未接入 Codex CLI 更新检查");
                    return;
                  }
                  toast.message("暂未接入 Codex CLI 安装流程");
                }}
              >
                {
                  // 逻辑：根据安装状态切换主按钮文案。
                  cliStatuses.codex.installed ? "检测更新" : "安装"
                }
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
              <div className="text-sm font-medium">{cliToolLabels.claude}</div>
              <div className="text-xs text-muted-foreground">
                Anthropic Claude Code CLI 编程助手 · 版本：
                {cliStatuses.claude.installed && cliStatuses.claude.currentVersion
                  ? `v${cliStatuses.claude.currentVersion}`
                  : cliStatuses.claude.installed
                    ? "已安装"
                    : "未安装"}
              </div>
            </div>

            <TeatimeSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (cliStatuses.claude.installed) {
                    toast.message("暂未接入 Claude Code 更新检查");
                    return;
                  }
                  toast.message("暂未接入 Claude Code 安装流程");
                }}
              >
                {
                  // 逻辑：根据安装状态切换主按钮文案。
                  cliStatuses.claude.installed ? "检测更新" : "安装"
                }
              </Button>
              {cliStatuses.claude.installed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCliSettings("claude")}
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
                  checked={activeCliSettings.forceApiKey}
                  onCheckedChange={(checked) =>
                    updateCliSettings(activeCliTool, { forceApiKey: checked })
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
              onClick={() => {
                toast.message("暂未接入 CLI 配置保存流程");
                setCliDialogOpen(false);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
