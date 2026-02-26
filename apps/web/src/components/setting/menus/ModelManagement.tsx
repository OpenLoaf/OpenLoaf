"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { OpenLoafAutoWidthInput } from "@openloaf/ui/openloaf/OpenLoafAutoWidthInput";
import { getModelLabel } from "@/lib/model-registry";

export function ModelManagement() {
  const { providerItems } = useSettingsValues();
  const { basic, setBasic } = useBasicConfig();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();

  const workspaceProjectRule =
    typeof basic.appProjectRule === "string" ? basic.appProjectRule : "";
  const defaultChatModelId =
    typeof basic.modelDefaultChatModelId === "string" ? basic.modelDefaultChatModelId : "";
  const chatModelSource = normalizeChatModelSource(basic.chatSource);

  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds],
  );
  const emptyModelLabel = chatModelSource === "cloud" ? "云端模型暂未开放" : "暂无模型";

  useEffect(() => {
    if (!defaultChatModelId) return;
    const exists = modelOptions.some((option) => option.id === defaultChatModelId);
    if (!exists) void setBasic({ modelDefaultChatModelId: "" });
  }, [defaultChatModelId, modelOptions, setBasic]);

  return (
    <div className="space-y-3">
      <OpenLoafSettingsGroup title="模型设置">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">工作空间项目划分规范</div>
              <div className="text-xs text-muted-foreground">
                影响项目/会话的分类与组织方式
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-[420px] shrink-0 justify-end">
              <OpenLoafAutoWidthInput
                value={workspaceProjectRule}
                onChange={(event) => void setBasic({ appProjectRule: event.target.value })}
                className="bg-background"
              />
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">默认聊天模型</div>
              <div className="text-xs text-muted-foreground">
                新对话默认使用的模型
              </div>
            </div>

            <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[220px] w-auto justify-between font-normal"
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
                    onValueChange={(next) => void setBasic({ modelDefaultChatModelId: next })}
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
            </OpenLoafSettingsField>
          </div>

        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
