"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@tenas-ai/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@tenas-ai/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { TenasAutoWidthInput } from "@tenas-ai/ui/tenas/TenasAutoWidthInput";
import { getModelLabel } from "@/lib/model-registry";

export function ModelManagement() {
  const { providerItems } = useSettingsValues();
  const { basic, setBasic } = useBasicConfig();
  const { models: cloudModels } = useCloudModels();

  const workspaceProjectRule =
    typeof basic.appProjectRule === "string" ? basic.appProjectRule : "";
  const defaultChatModelId =
    typeof basic.modelDefaultChatModelId === "string" ? basic.modelDefaultChatModelId : "";
  const chatModelSource = normalizeChatModelSource(basic.chatSource);

  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  const emptyModelLabel = chatModelSource === "cloud" ? "云端模型暂未开放" : "暂无模型";

  useEffect(() => {
    if (!defaultChatModelId) return;
    const exists = modelOptions.some((option) => option.id === defaultChatModelId);
    if (!exists) void setBasic({ modelDefaultChatModelId: "" });
  }, [defaultChatModelId, modelOptions, setBasic]);

  return (
    <div className="space-y-3">
      <TenasSettingsGroup title="模型设置">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">工作空间项目划分规范</div>
              <div className="text-xs text-muted-foreground">
                影响项目/会话的分类与组织方式
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-[420px] shrink-0 justify-end">
              <TenasAutoWidthInput
                value={workspaceProjectRule}
                onChange={(event) => void setBasic({ appProjectRule: event.target.value })}
                className="bg-background"
              />
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">默认聊天模型</div>
              <div className="text-xs text-muted-foreground">
                新对话默认使用的模型
              </div>
            </div>

            <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
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
            </TenasSettingsField>
          </div>

        </div>
      </TenasSettingsGroup>
    </div>
  );
}
