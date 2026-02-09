"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Cloud, HardDrive } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tenas-ai/ui/popover";
import { Button } from "@tenas-ai/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@tenas-ai/ui/tabs";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import {
  buildChatModelOptions,
  normalizeChatModelSource,
} from "@/lib/provider-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { getModelLabel } from "@/lib/model-registry";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { ModelIcon } from "@/components/setting/menus/provider/ModelIcon";
import { useOptionalChatSession } from "../context";
import { MODEL_TAG_LABELS } from "@tenas-ai/api/common";
import {
  CHAT_MODEL_SELECTION_EVENT,
  MODEL_SELECTION_STORAGE_KEY,
  type ModelSourceKey,
  type StoredModelSelections,
  readStoredSelections,
  writeStoredSelections,
  notifyChatModelSelectionChange,
} from "./chat-model-selection-storage";

interface SelectModeProps {
  className?: string;
}

/** Fallback icon for models without icon mapping. */
const MODEL_ICON_FALLBACK_SRC = "/head_s.png";

export default function SelectMode({ className }: SelectModeProps) {
  const { providerItems, refresh } = useSettingsValues();
  const { models: cloudModels, refresh: refreshCloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const { basic, setBasic } = useBasicConfig();
  const [open, setOpen] = useState(false);
  const { loggedIn: authLoggedIn, refreshSession } = useSaasAuth();
  /** Login dialog open state. */
  const [loginOpen, setLoginOpen] = useState(false);
  const chatSession = useOptionalChatSession();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  // 逻辑：聊天场景优先使用上下文 tabId，非聊天场景回退到当前激活 tab。
  const tabId = chatSession?.tabId ?? activeTabId;
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const isCloudSource = chatModelSource === "cloud";
  /** Current source key for storage mapping. */
  const sourceKey: ModelSourceKey = isCloudSource ? "cloud" : "local";
  const [storedSelections, setStoredSelections] = useState<StoredModelSelections>(() =>
    readStoredSelections()
  );
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds],
  );
  const currentSelection = storedSelections[sourceKey] ?? {
    lastModelId: "",
    isAuto: true,
  };
  const rawSelectedModelId = currentSelection.isAuto
    ? ""
    : currentSelection.lastModelId.trim();
  const selectedModel =
    modelOptions.find((option) => option.id === rawSelectedModelId) ?? null;
  const resolvedSelectedModelId = selectedModel?.id ?? "";
  const isAuto = currentSelection.isAuto || !resolvedSelectedModelId;
  const selectedModelId = isAuto ? "" : resolvedSelectedModelId;
  // 中文注释：优先展示模型 name，没有则回退到 id。
  const selectedModelLabel =
    selectedModel?.modelDefinition
      ? getModelLabel(selectedModel.modelDefinition)
      : selectedModel?.modelId ?? "Auto";
  const hasModels = modelOptions.length > 0;
  // 逻辑：检查用户是否配置了至少一个本地 provider（排除注册表默认 CLI 项）。
  const hasConfiguredProviders = useMemo(
    () => providerItems.some((item) => (item.category ?? "general") === "provider"),
    [providerItems],
  );
  // 逻辑：未登录且无本地配置时，视为"未就绪"状态，引导用户配置。
  const isUnconfigured = !authLoggedIn && !hasConfiguredProviders;
  const showCloudLogin = isCloudSource && !authLoggedIn;
  const showCloudEmpty = isCloudSource && authLoggedIn && !hasModels;
  const showAddButton = !isCloudSource;
  const showModelList = hasModels || showAddButton || showCloudLogin;
  const showTopSection = showModelList || showAddButton;
  /** Update stored selection for a specific source. */
  const updateStoredSelection = useCallback(
    (key: ModelSourceKey, updates: Partial<StoredModelSelections[ModelSourceKey]>) => {
      setStoredSelections((prev) => {
        const prevSelection = prev[key] ?? { lastModelId: "", isAuto: true };
        const nextSelection = { ...prevSelection, ...updates };
        if (
          prevSelection.lastModelId === nextSelection.lastModelId &&
          prevSelection.isAuto === nextSelection.isAuto
        ) {
          return prev;
        }
        const updated: StoredModelSelections = { ...prev, [key]: nextSelection };
        writeStoredSelections(updated);
        notifyChatModelSelectionChange();
        return updated;
      });
    },
    [],
  );
  /** Resolve a manual model selection for the current source. */
  const resolveManualModelId = useCallback(
    (storedModelId: string) => {
      const trimmed = storedModelId.trim();
      if (!hasModels) return trimmed;
      if (trimmed) {
        const matched = modelOptions.find((option) => option.id === trimmed);
        if (matched) return matched.id;
      }
      return modelOptions[0]?.id ?? "";
    },
    [hasModels, modelOptions],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== MODEL_SELECTION_STORAGE_KEY) return;
      setStoredSelections(readStoredSelections());
    };
    const handleSelection = () => {
      setStoredSelections(readStoredSelections());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection);
    };
  }, []);
  useEffect(() => {
    if (!hasModels) return;
    if (isAuto) return;
    if (!selectedModel && currentSelection.lastModelId) {
      const resolvedModelId = resolveManualModelId(currentSelection.lastModelId);
      if (resolvedModelId && resolvedModelId !== currentSelection.lastModelId) {
        updateStoredSelection(sourceKey, { isAuto: false, lastModelId: resolvedModelId });
      }
    }
  }, [
    currentSelection.lastModelId,
    hasModels,
    isAuto,
    resolveManualModelId,
    selectedModel,
    sourceKey,
    updateStoredSelection,
  ]);
  useEffect(() => {
    if (!open) return;
    // 展开模型列表时刷新服务端配置，确保展示最新模型。
    void refresh();
  }, [open, refresh]);
  useEffect(() => {
    if (!open) return;
    if (!isCloudSource) return;
    // 云端模式展开时刷新模型列表，避免显示旧数据。
    void refreshCloudModels();
  }, [open, isCloudSource, refreshCloudModels]);
  useEffect(() => {
    if (!open) return;
    if (!isCloudSource) return;
    // 展开选择器时刷新登录状态，避免切换设备后状态不一致。
    void refreshSession();
  }, [isCloudSource, open, refreshSession]);
  useEffect(() => {
    if (!tabId) return;
    const target = document.querySelector(
      `[data-tenas-chat-root][data-tab-id="${tabId}"][data-chat-active="true"]`,
    );
    if (!target) return;
    const mask = target.querySelector<HTMLElement>("[data-tenas-chat-mask]");
    if (mask) {
      if (open) {
        // 遮罩打开时拦截交互，避免触发底层事件。
        mask.classList.remove("hidden");
        mask.style.pointerEvents = "auto";
      } else {
        mask.classList.add("hidden");
        mask.style.pointerEvents = "none";
      }
    }
    return () => {
      if (mask) {
        mask.classList.add("hidden");
        mask.style.pointerEvents = "none";
      }
    };
  }, [open, tabId]);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);
  /** Open SaaS login dialog. */
  const handleOpenLogin = () => {
    // 打开登录弹窗时收起模型选择器，避免遮罩叠加。
    setOpen(false);
    setLoginOpen(true);
  };

  /** Open the provider management panel inside the current tab stack. */
  const handleOpenProviderSettings = () => {
    if (!tabId) return;
    // 直接打开模型管理面板，避免进入设置菜单列表。
    pushStackItem(
      tabId,
      {
        id: "provider-management",
        sourceKey: "provider-management",
        component: "provider-management",
        title: "管理模型",
      },
      100,
    );
    setOpen(false);
  };

  /** Select model source between local and cloud. */
  const handleSelectSource = (next: string) => {
    const normalized = next === "cloud" ? "cloud" : "local";
    void setBasic({ chatSource: normalized });
  };

  /** Models for rendering (no provider grouping). */
  const activeProviderModels = modelOptions;

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
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
              {isUnconfigured ? (
                <span className="truncate">配置模型</span>
              ) : isAuto ? (
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
                  {selectedModel?.modelDefinition ? (
                    <ModelIcon
                      icon={
                        selectedModel.modelDefinition.familyId ??
                        selectedModel.modelDefinition.icon
                      }
                      size={14}
                      className="h-3.5 w-3.5 shrink-0"
                      fallbackSrc={MODEL_ICON_FALLBACK_SRC}
                      fallbackAlt=""
                    />
                  ) : null}
                  <span className="truncate">
                    {selectedModelLabel}
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
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          avoidCollisions={false}
          className="w-[21rem] max-w-[94vw] -translate-x-4 rounded-xl border-border bg-muted/40 p-2 shadow-2xl backdrop-blur-sm"
        >
          <div className="space-y-2">
            {showTopSection ? (
              <div className="space-y-2">
                {showModelList ? (
                  <>
                    <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-lg">
                      {showCloudLogin ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10">
                          <Button type="button" size="sm" onClick={handleOpenLogin}>
                            登录Teanas账户，使用云端模型
                          </Button>
                          <div className="text-xs text-muted-foreground">使用云端模型</div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              updateStoredSelection(sourceKey, { isAuto: true });
                            }}
                            className={cn(
                              "h-12 w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/60",
                              isAuto && "bg-muted/70"
                            )}
                          >
                            <div className="flex h-full items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex items-center gap-1 truncate text-[13px] font-medium text-foreground">
                                  {!isCloudSource ? (
                                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : null}
                                  <span className="truncate">Auto</span>
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  基于效果与速度帮助您选择最优模型
                                </div>
                              </div>
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                {isAuto ? (
                                  <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                                ) : null}
                              </span>
                            </div>
                          </button>
                          {activeProviderModels.length > 0 ? (
                            activeProviderModels.map((option) => {
                              const optionLabel = option.modelDefinition
                                ? getModelLabel(option.modelDefinition)
                                : option.modelId;
                              const providerLabel =
                                option.providerName || option.providerId || "";
                              const displayLabel = providerLabel
                                ? `${providerLabel} / ${optionLabel}`
                                : optionLabel;
                              const tagLabels =
                                option.tags && option.tags.length > 0
                                  ? option.tags.map((tag) => MODEL_TAG_LABELS[tag] ?? tag)
                                  : null;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    updateStoredSelection(sourceKey, {
                                      isAuto: false,
                                      lastModelId: option.id,
                                    });
                                  }}
                                  className={cn(
                                    "h-12 w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/60",
                                    selectedModelId === option.id && "bg-muted/70"
                                  )}
                                >
                                  <div className="flex h-full items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1 text-left">
                                      <div className="flex items-center gap-2 truncate text-[13px] font-medium text-foreground">
                                        <ModelIcon
                                          icon={option.modelDefinition?.familyId ?? option.modelDefinition?.icon}
                                          size={14}
                                          className="h-3.5 w-3.5 shrink-0"
                                          fallbackSrc={MODEL_ICON_FALLBACK_SRC}
                                          fallbackAlt=""
                                        />
                                        <span className="truncate">{displayLabel}</span>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="flex flex-wrap items-center gap-1">
                                          {(tagLabels ?? []).map((label) => (
                                            <span
                                              key={`${option.id}-${label}`}
                                              className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[9px] text-muted-foreground"
                                            >
                                              {label}
                                            </span>
                                          ))}
                                        </span>
                                      </div>
                                    </div>
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                      {selectedModelId === option.id ? (
                                        <Check
                                          className="h-4 w-4 text-primary"
                                          strokeWidth={2.5}
                                        />
                                      ) : null}
                                    </span>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                              {showCloudEmpty ? "云端模型暂未开放" : "暂无可用模型"}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {showAddButton ? (
                      <Button
                        type="button"
                        className="h-8 w-full text-xs"
                        onClick={handleOpenProviderSettings}
                      >
                        管理模型
                      </Button>
                    ) : null}
                  </>
                ) : null}

              </div>
            ) : null}

            <Tabs
              value={isCloudSource ? "cloud" : "local"}
              onValueChange={handleSelectSource}
            >
              <TabsList className="h-7 w-full grid grid-cols-2 items-center rounded-lg border-0 p-0">
                <TabsTrigger value="cloud" className="h-7 text-xs leading-none">
                  <span className="inline-flex items-center gap-1">
                    <Cloud className="h-3 w-3" />
                    云端模型
                  </span>
                </TabsTrigger>
                <TabsTrigger value="local" className="h-7 text-xs leading-none">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    本地模型
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
