"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useSetting, useSettingsValues } from "@/hooks/use-settings";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { WebSettingDefs } from "@/lib/setting-defs";
import { useChatContext } from "../ChatProvider";
import type { ModelCapabilityId, ModelDefinition } from "@teatime-ai/api/common";

interface SelectModeProps {
  className?: string;
}

// 能力标签显示文案映射。
const MODEL_CAPABILITY_LABELS: Record<ModelCapabilityId, string> = {
  text: "文本",
  vision_input: "图片输入",
  vision_output: "图片输出",
  reasoning: "推理",
  tools: "工具",
  rerank: "重排",
  embedding: "嵌入",
  structured_output: "结构化输出",
};

/** Format a price value with adaptive precision. */
function formatPriceValue(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.1 ? 3 : abs >= 0.01 ? 4 : 6;
  return value.toFixed(decimals);
}

/** Format input/output pricing label for a model definition. */
function formatModelPrice(definition?: ModelDefinition): string | null {
  if (!definition) return null;
  const currencySymbol = definition.currencySymbol ?? "";
  // 价格按每 1,000,000 tokens 展示。
  const inputLabel = `${currencySymbol}${formatPriceValue(definition.priceInPerMillion)}`;
  const outputLabel = `${currencySymbol}${formatPriceValue(definition.priceOutPerMillion)}`;
  return `输入 ${inputLabel} / 1M · 输出 ${outputLabel} / 1M`;
}

export default function SelectMode({ className }: SelectModeProps) {
  const { items } = useSettingsValues();
  const { value: chatModelSourceRaw, setValue: setChatModelSource } =
    useSetting(WebSettingDefs.ModelChatSource);
  const { value: defaultChatModelIdRaw, setValue: setDefaultChatModelId } =
    useSetting(WebSettingDefs.ModelDefaultChatModelId);
  const [open, setOpen] = useState(false);
  const { tabId } = useChatContext();
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const chatModelSource = normalizeChatModelSource(chatModelSourceRaw);
  const isCloudSource = chatModelSource === "cloud";
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, items),
    [chatModelSource, items],
  );
  const selectedModel =
    typeof defaultChatModelIdRaw === "string" ? defaultChatModelIdRaw : "";
  const isAuto = !selectedModel;
  const hasModels = modelOptions.length > 0;
  const showCloudEmpty = isCloudSource && !hasModels;
  const showAuto = hasModels;
  const showModelList = hasModels && !isAuto;
  const showAddButton = !isCloudSource && (!isAuto || !hasModels);
  const showTopSection = showAuto || showModelList;
  useEffect(() => {
    if (isAuto) return;
    if (modelOptions.length === 0) {
      void setDefaultChatModelId("");
      return;
    }
    const exists = modelOptions.some((option) => option.id === selectedModel);
    if (!exists) void setDefaultChatModelId(modelOptions[0]!.id);
  }, [isAuto, modelOptions, selectedModel, setDefaultChatModelId]);

  /** Open settings panel to the provider menu inside the current tab stack. */
  const handleOpenProviderSettings = () => {
    if (!tabId) return;
    // 切换到当前标签页 stack 的设置面板，并定位到服务商菜单。
    pushStackItem(
      tabId,
      {
        id: "settings-page:providers",
        sourceKey: "settings-page:providers",
        component: "settings-page",
        title: "Settings",
        params: { settingsMenu: "keys" },
      },
      100,
    );
    setOpen(false);
  };

  /** Toggle model source between local and cloud. */
  const handleToggleCloudSource = (next: boolean) => {
    const normalized = next ? "cloud" : "local";
    void setChatModelSource(normalized);
    if (normalized === "cloud") {
      // 中文注释：切换到云端时清空本地选择，避免透传无效 modelId。
      void setDefaultChatModelId("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          className={cn(
            "h-7 w-auto inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors",
            className
          )}
        >
          <span className="max-w-[8rem] truncate whitespace-nowrap text-right">
            {isAuto
              ? "Auto"
              : (modelOptions.find((option) => option.id === selectedModel)?.modelId ??
                  "Auto")}
          </span>
          {open ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] p-2">
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="cloud-switch" className="text-sm">
                云端模型
              </Label>
              <Switch
                id="cloud-switch"
                checked={isCloudSource}
                onCheckedChange={handleToggleCloudSource}
              />
            </div>
            {showCloudEmpty ? (
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                云端模型暂未开放
              </p>
            ) : null}
          </div>

          {showTopSection ? (
            <div className="space-y-2">
              {showAuto ? (
                <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="auto-switch" className="text-sm">
                        Auto
                      </Label>
                    </div>
                    <Switch
                      id="auto-switch"
                      checked={isAuto}
                      onCheckedChange={(next) => {
                        if (next) {
                          void setDefaultChatModelId("");
                          return;
                        }
                        if (modelOptions.length === 0) return;
                        void setDefaultChatModelId(modelOptions[0]!.id);
                      }}
                    />
                  </div>
                  {isAuto && (
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      基于效果与速度帮助您选择最优模型
                    </p>
                  )}
                </div>
              ) : null}

              {showModelList ? (
                <div className="space-y-1">
                  {modelOptions.map((option) => {
                    // 未标注能力时默认展示 text，避免空白。
                    const capabilityIds: ModelCapabilityId[] =
                      option.capabilityIds && option.capabilityIds.length > 0
                        ? option.capabilityIds
                        : ["text"];
                    const priceLabel = formatModelPrice(option.modelDefinition);
                    return (
                      <button
                      key={option.id}
                      type="button"
                      onClick={() => void setDefaultChatModelId(option.id)}
                      className={cn(
                        "w-full rounded-lg border border-transparent px-3 py-2 text-right transition-colors hover:border-border/70 hover:bg-muted/60",
                        selectedModel === option.id && "border-border/70 bg-muted/70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 text-right">
                          <div className="truncate text-sm font-medium text-foreground">
                            {option.modelId}
                          </div>
                            <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-muted-foreground">
                              <span className="min-w-0 truncate text-right">
                                {option.providerName}
                              </span>
                              <span className="flex flex-wrap items-center justify-end gap-1">
                                {capabilityIds.map((capability) => (
                                  <span
                                    key={`${option.id}-${capability}`}
                                    className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {MODEL_CAPABILITY_LABELS[capability] ?? capability}
                                  </span>
                                ))}
                              </span>
                            </div>
                            {priceLabel ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {priceLabel}
                              </div>
                            ) : null}
                          </div>
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                            {selectedModel === option.id ? (
                              <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                            ) : null}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {showAddButton ? (
          <div className={cn((showTopSection || showCloudEmpty) && "border-t border-border/70 pt-2")}>
            <Button
              type="button"
              variant="outline"
              className="h-8 w-full text-xs"
              onClick={handleOpenProviderSettings}
            >
              新增添加模型
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
