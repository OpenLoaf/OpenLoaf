"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Plus } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";
import { useSetting, useSettingsValues } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import {
  AddModelProviderDialog,
  type AddModelProviderPayload,
  type ModelProviderOption,
} from "@/components/setting/menus/model/AddModelProviderDialog";
import { Input } from "@/components/ui/input";
import { PROVIDER_OPTIONS, getModelLabel, type ProviderId } from "@teatime-ai/api/common";

type ModelEntry = {
  id: string;
  model: string;
  provider: ProviderId;
};

type ModelResponseLanguageId =
  | "zh-CN"
  | "en-US"
  | "ja-JP"
  | "ko-KR"
  | "fr-FR"
  | "de-DE"
  | "es-ES";

const PROVIDERS: ModelProviderOption[] = PROVIDER_OPTIONS.map((provider) => ({
  id: provider.id,
  label: provider.label,
}));

/** Generate a stable row id for model entries. */
function generateRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ModelManagement() {
  const { value: entriesRaw, setValue: setEntriesValue } = useSetting(
    WebSettingDefs.ModelProviders,
  );
  const { items } = useSettingsValues();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { value: modelResponseLanguageRaw, setValue: setModelResponseLanguage } =
    useSetting(WebSettingDefs.ModelResponseLanguage);
  const { value: workspaceProjectRuleRaw, setValue: setWorkspaceProjectRule } =
    useSetting(WebSettingDefs.AppProjectRule);
  const { value: chatModelSourceRaw, setValue: setChatModelSource } =
    useSetting(WebSettingDefs.ModelChatSource);
  const { value: defaultChatModelIdRaw, setValue: setDefaultChatModelId } =
    useSetting(WebSettingDefs.ModelDefaultChatModelId);
  const { value: chatModelQualityRaw, setValue: setChatModelQuality } =
    useSetting(WebSettingDefs.ModelChatQuality);

  const entries = Array.isArray(entriesRaw) ? (entriesRaw as ModelEntry[]) : [];
  const modelResponseLanguage: ModelResponseLanguageId =
    modelResponseLanguageRaw === "zh-CN" ||
    modelResponseLanguageRaw === "en-US" ||
    modelResponseLanguageRaw === "ja-JP" ||
    modelResponseLanguageRaw === "ko-KR" ||
    modelResponseLanguageRaw === "fr-FR" ||
    modelResponseLanguageRaw === "de-DE" ||
    modelResponseLanguageRaw === "es-ES"
      ? modelResponseLanguageRaw
      : "zh-CN";
  const workspaceProjectRule =
    typeof workspaceProjectRuleRaw === "string" ? workspaceProjectRuleRaw : "";
  const chatModelSource = normalizeChatModelSource(chatModelSourceRaw);
  const defaultChatModelId =
    typeof defaultChatModelIdRaw === "string" ? defaultChatModelIdRaw : "";
  const chatModelQuality: "high" | "medium" | "low" =
    chatModelQualityRaw === "high" ||
    chatModelQualityRaw === "medium" ||
    chatModelQualityRaw === "low"
      ? chatModelQualityRaw
      : "medium";

  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, items),
    [chatModelSource, items],
  );
  const emptyModelLabel = chatModelSource === "cloud" ? "云端模型暂未开放" : "暂无模型";

  const modelResponseLanguageLabelById: Record<ModelResponseLanguageId, string> =
    {
      "zh-CN": "中文（简体）",
      "en-US": "English",
      "ja-JP": "日本語",
      "ko-KR": "한국어",
      "fr-FR": "Français",
      "de-DE": "Deutsch",
      "es-ES": "Español",
    };

  useEffect(() => {
    if (!defaultChatModelId) return;
    const exists = modelOptions.some((option) => option.id === defaultChatModelId);
    if (!exists) void setDefaultChatModelId("");
  }, [defaultChatModelId, modelOptions, setDefaultChatModelId]);

  /** Save a new provider model entry. */
  const handleAddModelProvider = useCallback(
    (payload: AddModelProviderPayload) => {
      void setEntriesValue([
        ...entries,
        {
          id: generateRowId(),
          provider: payload.providerId as ProviderId,
          model: payload.model,
        },
      ]);
    },
    [entries, setEntriesValue],
  );

  return (
    <div className="space-y-3">
      <SettingsGroup title="模型设置">
        <div className="divide-y divide-border">
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">模型返回语言</div>
              <div className="text-xs text-muted-foreground">
                暂不支持切换，仅保存偏好
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
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
                      void setModelResponseLanguage(next as ModelResponseLanguageId)
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
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">工作空间项目划分规范</div>
              <div className="text-xs text-muted-foreground">
                影响项目/会话的分类与组织方式
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <Input
                value={workspaceProjectRule}
                onChange={(event) => void setWorkspaceProjectRule(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">模型来源</div>
              <div className="text-xs text-muted-foreground">
                选择本地服务商或云端模型
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end">
              <Tabs
                value={chatModelSource}
                onValueChange={(next) =>
                  void setChatModelSource(normalizeChatModelSource(next))
                }
              >
                <TabsList>
                  <TabsTrigger value="local">本地</TabsTrigger>
                  <TabsTrigger value="cloud">云端</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">默认聊天模型</div>
              <div className="text-xs text-muted-foreground">
                新对话默认使用的模型
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {defaultChatModelId
                        ? (() => {
                            const option = modelOptions.find(
                              (item) => item.id === defaultChatModelId,
                            );
                            if (!option) return "Auto";
                            return option.modelDefinition
                              ? getModelLabel(option.modelDefinition)
                              : option.modelId;
                          })()
                        : "Auto"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  <DropdownMenuRadioGroup
                    value={defaultChatModelId}
                    onValueChange={(next) => void setDefaultChatModelId(next)}
                  >
                    <DropdownMenuRadioItem value="">Auto</DropdownMenuRadioItem>
                    {modelOptions.length === 0 ? (
                      <DropdownMenuRadioItem value="__empty__" disabled>
                        {emptyModelLabel}
                      </DropdownMenuRadioItem>
                    ) : null}
                    {modelOptions.map((option) => {
                      const modelLabel = option.modelDefinition
                        ? getModelLabel(option.modelDefinition)
                        : option.modelId;
                      return (
                        <DropdownMenuRadioItem key={option.id} value={option.id}>
                          <div className="min-w-0">
                            <div className="truncate">{modelLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {option.providerName}
                            </div>
                          </div>
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">聊天模型质量</div>
              <div className="text-xs text-muted-foreground">
                高 / 中 / 低（UI 预设）
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end">
              <Tabs
                value={chatModelQuality}
                onValueChange={(next) =>
                  void setChatModelQuality(next as "high" | "medium" | "low")
                }
              >
                <TabsList>
                  <TabsTrigger value="high">高</TabsTrigger>
                  <TabsTrigger value="medium">中</TabsTrigger>
                  <TabsTrigger value="low">低</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </SettingsGroup>

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          添加模型
        </Button>
      </div>

      <AddModelProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        providers={PROVIDERS}
        onSave={handleAddModelProvider}
      />
    </div>
  );
}
