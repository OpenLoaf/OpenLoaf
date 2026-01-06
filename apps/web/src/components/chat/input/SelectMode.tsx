"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, HardDrive, Sparkles } from "lucide-react";
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
import { resolveServerUrl } from "@/utils/server-url";
import { useChatContext } from "../ChatProvider";
import type { IOType, ModelDefinition, ModelTag } from "@teatime-ai/api/common";
import { resolvePriceTier } from "@teatime-ai/api/common";

interface SelectModeProps {
  className?: string;
}

// 标签显示文案映射。
const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_to_image: "文生图",
  image_to_image: "图生图",
  image_to_text: "图片理解",
  image_edit: "图片编辑",
  text_generation: "文本生成",
  video_generation: "视频生成",
  web_search: "网络搜索",
  asr: "语音识别",
  tts: "语音输出",
  tool_call: "工具调用",
  code: "代码生成",
};

const IO_LABELS: Record<IOType, string> = {
  text: "文本",
  image: "图片",
  imageUrl: "图片链接",
  audio: "音频",
  video: "视频",
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
  // 价格按每 1,000,000 tokens 展示。
  const tier = resolvePriceTier(definition, 0);
  if (!tier) return null;
  const inputLabel = formatPriceValue(tier.input);
  const outputLabel = formatPriceValue(tier.output);
  return `输入 ${inputLabel} / 1M · 输出 ${outputLabel} / 1M`;
}

type AuthSessionResponse = {
  /** Whether user is logged in. */
  loggedIn: boolean;
};

/** Fetch the current auth session from server. */
async function fetchAuthSession(baseUrl: string): Promise<AuthSessionResponse> {
  const response = await fetch(`${baseUrl}/auth/session`);
  if (!response.ok) {
    throw new Error("无法获取登录状态");
  }
  return (await response.json()) as AuthSessionResponse;
}

/** Fetch the SaaS login URL from server. */
async function fetchLoginUrl(baseUrl: string): Promise<string> {
  const url = new URL(`${baseUrl}/auth/login-url`);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("无法获取登录地址");
  }
  const payload = (await response.json()) as { authorizeUrl?: string };
  if (!payload.authorizeUrl) {
    throw new Error("登录地址无效");
  }
  return payload.authorizeUrl;
}

/** Open external URL in system browser (Electron) or new tab. */
async function openExternalUrl(url: string): Promise<void> {
  if (window.teatimeElectron?.openExternal) {
    const result = await window.teatimeElectron.openExternal(url);
    if (!result.ok) {
      throw new Error(result.reason ?? "无法打开浏览器");
    }
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function SelectMode({ className }: SelectModeProps) {
  const { providerItems, refresh } = useSettingsValues();
  const { value: chatModelSourceRaw, setValue: setChatModelSource } =
    useSetting(WebSettingDefs.ModelChatSource);
  const { value: defaultChatModelIdRaw, setValue: setDefaultChatModelId } =
    useSetting(WebSettingDefs.ModelDefaultChatModelId);
  const [open, setOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(false);
  const authBaseUrl = resolveServerUrl();
  const { tabId } = useChatContext();
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const chatModelSource = normalizeChatModelSource(chatModelSourceRaw);
  const isCloudSource = chatModelSource === "cloud";
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems),
    [chatModelSource, providerItems],
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
    if (!open) return;
    // 中文注释：展开模型列表时刷新服务端配置，确保展示最新模型。
    void refresh();
  }, [open, refresh]);
  useEffect(() => {
    if (!open) return;
    if (!authBaseUrl) return;
    // 中文注释：展开选择器时刷新登录状态，避免切换设备后状态不一致。
    fetchAuthSession(authBaseUrl)
      .then((session) => setAuthLoggedIn(session.loggedIn))
      .catch(() => setAuthLoggedIn(false));
  }, [authBaseUrl, open]);
  useEffect(() => {
    if (isAuto) return;
    if (modelOptions.length === 0) {
      void setDefaultChatModelId("");
      return;
    }
    const exists = modelOptions.some((option) => option.id === selectedModel);
    if (!exists) void setDefaultChatModelId(modelOptions[0]!.id);
  }, [isAuto, modelOptions, selectedModel, setDefaultChatModelId]);
  useEffect(() => {
    if (authLoggedIn) return;
    if (!isCloudSource) return;
    // 中文注释：未登录时强制回退为本地模式，避免云端入口被直接开启。
    void setChatModelSource("local");
  }, [authLoggedIn, isCloudSource, setChatModelSource]);

  /** Trigger login flow for cloud models. */
  const handleLogin = async () => {
    if (!authBaseUrl) return;
    try {
      const loginUrl = await fetchLoginUrl(authBaseUrl);
      await openExternalUrl(loginUrl);
    } catch (error) {
      console.error(error);
    }
  };

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
            "h-7 w-auto min-w-0 max-w-[12rem] shrink inline-flex items-center gap-0.5 rounded-md bg-transparent px-0 text-xs has-[>svg]:px-1 font-medium text-muted-foreground hover:bg-muted/50 transition-colors",
            className
          )}
        >
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right">
            {isAuto ? (
              <span className="flex items-center justify-end gap-1">
                {!isCloudSource ? (
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                ) : null}
                <span className="truncate">Auto</span>
              </span>
            ) : (
              <span className="flex items-center justify-end gap-1">
                {!isCloudSource ? (
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                ) : null}
                <span className="truncate">
                  {modelOptions.find((option) => option.id === selectedModel)?.modelId ?? "Auto"}
                </span>
              </span>
            )}
          </span>
          {open ? (
            <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw] p-2">
        <div className="space-y-2">
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="cloud-switch" className="text-sm">
                云端模型
              </Label>
              {authLoggedIn ? (
                <Switch
                  id="cloud-switch"
                  checked={isCloudSource}
                  onCheckedChange={handleToggleCloudSource}
                />
              ) : (
                <Button type="button" size="sm" onClick={() => void handleLogin()}>
                  立即登录
                </Button>
              )}
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
                    const tagLabels =
                      option.tags && option.tags.length > 0
                        ? option.tags.map((tag) => MODEL_TAG_LABELS[tag] ?? tag)
                        : null;
                    const ioLabels = [...(option.input ?? []), ...(option.output ?? [])].map(
                      (item) => IO_LABELS[item] ?? item,
                    );
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
                          <div className="flex items-center justify-end gap-1 truncate text-sm font-medium text-foreground">
                            {!isCloudSource ? (
                              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : null}
                            <span className="truncate">
                              {option.providerName}/{option.modelId}
                            </span>
                          </div>
                            <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-muted-foreground">
                              <span className="flex flex-wrap items-center justify-end gap-1">
                                {(tagLabels && tagLabels.length > 0 ? tagLabels : ioLabels).map(
                                  (label) => (
                                    <span
                                      key={`${option.id}-${label}`}
                                      className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                      {label}
                                    </span>
                                  ),
                                )}
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
