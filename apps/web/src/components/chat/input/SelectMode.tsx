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
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { resolveServerUrl } from "@/utils/server-url";
import { useChatContext } from "../ChatProvider";
import type { ModelTag } from "@teatime-ai/api/common";

interface SelectModeProps {
  className?: string;
}

// 标签显示文案映射。
const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_output: "文本输出",
  image_output: "图片输出",
  image_input: "图片输入",
  image_url_input: "图片链接输入",
  text_input: "文本输入",
  video_input: "视频输入",
  tool: "工具调用",
  code: "代码",
  web_search: "网络搜索",
  image_edit: "图片编辑",
  video_generation: "视频生成",
  language_input: "语言输入",
  language_output: "语言输出",
};

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
  const { models: cloudModels, refresh: refreshCloudModels } = useCloudModels();
  const { basic, setBasic } = useBasicConfig();
  const [open, setOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(false);
  const authBaseUrl = resolveServerUrl();
  const { tabId } = useChatContext();
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const isCloudSource = chatModelSource === "cloud";
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  const selectedModel =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId
      : "";
  const isAuto = !selectedModel;
  const hasModels = modelOptions.length > 0;
  const showCloudEmpty = isCloudSource && !hasModels;
  const showAuto = isCloudSource ? true : hasModels;
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
    if (!isCloudSource) return;
    // 中文注释：云端模式展开时刷新模型列表，避免显示旧数据。
    void refreshCloudModels();
  }, [open, isCloudSource, refreshCloudModels]);
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
      void setBasic({ modelDefaultChatModelId: "" });
      return;
    }
    const exists = modelOptions.some((option) => option.id === selectedModel);
    if (!exists) void setBasic({ modelDefaultChatModelId: modelOptions[0]!.id });
  }, [isAuto, modelOptions, selectedModel, setBasic]);
  useEffect(() => {
    if (authLoggedIn) return;
    if (!isCloudSource) return;
    // 中文注释：未登录时强制回退为本地模式，避免云端入口被直接开启。
    void setBasic({ chatSource: "local" });
  }, [authLoggedIn, isCloudSource, setBasic]);

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
    void setBasic({ chatSource: normalized });
    if (normalized === "cloud") {
      // 中文注释：切换到云端时清空本地选择，避免透传无效 modelId。
      void setBasic({ modelDefaultChatModelId: "" });
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
      <PopoverContent className="w-[28rem] max-w-[92vw] p-2">
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
                          void setBasic({ modelDefaultChatModelId: "" });
                          return;
                        }
                        if (modelOptions.length === 0) return;
                        void setBasic({ modelDefaultChatModelId: modelOptions[0]!.id });
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
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/30 p-1">
                  {modelOptions.map((option) => {
                    const tagLabels =
                      option.tags && option.tags.length > 0
                        ? option.tags.map((tag) => MODEL_TAG_LABELS[tag] ?? tag)
                        : null;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void setBasic({ modelDefaultChatModelId: option.id })}
                        className={cn(
                          "h-16 w-full rounded-md border border-transparent px-3 py-2 text-right transition-colors hover:border-border/70 hover:bg-muted/60",
                          selectedModel === option.id && "border-border/70 bg-muted/70"
                        )}
                      >
                        <div className="flex h-full items-center justify-between gap-3">
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
                                {(tagLabels ?? []).map((label) => (
                                  <span
                                    key={`${option.id}-${label}`}
                                    className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {label}
                                  </span>
                                ))}
                              </span>
                            </div>
                          </div>
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
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
