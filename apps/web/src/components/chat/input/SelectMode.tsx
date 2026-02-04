"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, HardDrive, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tenas-ai/ui/popover";
import { Button } from "@tenas-ai/ui/button";
import { Switch } from "@tenas-ai/ui/switch";
import { Label } from "@tenas-ai/ui/label";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import {
  buildChatModelOptions,
  normalizeChatModelSource,
  type ProviderModelOption,
} from "@/lib/provider-models";
import { getModelLabel } from "@/lib/model-registry";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog";
import { useOptionalChatSession } from "../context";
import { MODEL_TAG_LABELS, type ModelTag } from "@tenas-ai/api/common";

interface SelectModeProps {
  className?: string;
}

const MODEL_SELECTION_STORAGE_KEY = "tenas.chat-model-selection";

type ModelSourceKey = "local" | "cloud";

type StoredModelSelection = {
  /** Last manually selected model id. */
  lastModelId: string;
  /** Auto toggle state for the source. */
  isAuto: boolean;
};

type StoredModelSelections = Record<ModelSourceKey, StoredModelSelection>;

/** Create a fresh default selection entry. */
function createDefaultStoredSelection(): StoredModelSelection {
  return {
    lastModelId: "",
    isAuto: true,
  };
}

/** Create a fresh default selection map. */
function createDefaultStoredSelections(): StoredModelSelections {
  return {
    local: createDefaultStoredSelection(),
    cloud: createDefaultStoredSelection(),
  };
}

/** Normalize stored selection entry. */
function normalizeStoredSelection(value: unknown): StoredModelSelection {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelection();
  }
  const record = value as Record<string, unknown>;
  return {
    lastModelId: typeof record.lastModelId === "string" ? record.lastModelId : "",
    isAuto: typeof record.isAuto === "boolean" ? record.isAuto : true,
  };
}

/** Normalize stored selection map. */
function normalizeStoredSelections(value: unknown): StoredModelSelections {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelections();
  }
  const record = value as Record<string, unknown>;
  return {
    local: normalizeStoredSelection(record.local),
    cloud: normalizeStoredSelection(record.cloud),
  };
}

/** Read stored selection map from local storage. */
function readStoredSelections(): { value: StoredModelSelections; hasStorage: boolean } {
  if (typeof window === "undefined") {
    return { value: createDefaultStoredSelections(), hasStorage: false };
  }
  const raw = window.localStorage.getItem(MODEL_SELECTION_STORAGE_KEY);
  if (!raw) {
    return { value: createDefaultStoredSelections(), hasStorage: false };
  }
  try {
    return { value: normalizeStoredSelections(JSON.parse(raw)), hasStorage: true };
  } catch {
    return { value: createDefaultStoredSelections(), hasStorage: false };
  }
}

/** Persist selection map into local storage. */
function writeStoredSelections(value: StoredModelSelections) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(value));
}

type ProviderGroup = {
  /** Provider group key (settings id or provider id). */
  providerKey: string;
  /** Provider display name. */
  providerName: string;
  /** Models under provider. */
  models: ProviderModelOption[];
};

type FilteredProviderGroup = ProviderGroup & {
  /** Filtered models. */
  filteredModels: ProviderModelOption[];
  /** Models that match current filters. */
  matchCount: number;
  /** Total model count. */
  totalCount: number;
};

export default function SelectMode({ className }: SelectModeProps) {
  const { providerItems, refresh } = useSettingsValues();
  const { models: cloudModels, refresh: refreshCloudModels } = useCloudModels();
  const { basic, setBasic } = useBasicConfig();
  const [open, setOpen] = useState(false);
  const { loggedIn: authLoggedIn, refreshSession } = useSaasAuth();
  /** Login dialog open state. */
  const [loginOpen, setLoginOpen] = useState(false);
  /** Active provider key for the model list. */
  const [activeProviderKey, setActiveProviderKey] = useState<string>("");
  /** Selected tags for model filtering. */
  const [selectedTags, setSelectedTags] = useState<ModelTag[]>([]);
  const chatSession = useOptionalChatSession();
  const activeTabId = useTabs((s) => s.activeTabId);
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  // 逻辑：聊天场景优先使用上下文 tabId，非聊天场景回退到当前激活 tab。
  const tabId = chatSession?.tabId ?? activeTabId;
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const isCloudSource = chatModelSource === "cloud";
  const sourceKey: ModelSourceKey = isCloudSource ? "cloud" : "local";
  const storedSelectionsRef = useRef<StoredModelSelections>(createDefaultStoredSelections());
  const storedLoadedRef = useRef(false);
  const prevSourceKeyRef = useRef<ModelSourceKey | null>(null);
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels],
  );
  /** Provider groups derived from model options. */
  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const grouped = new Map<string, ProviderGroup>();
    for (const option of modelOptions) {
      const providerKey = option.providerSettingsId ?? option.providerId;
      const existing = grouped.get(providerKey);
      if (existing) {
        existing.models.push(option);
        continue;
      }
      // 按 settings id 分组，避免同 providerId 合并到一起。
      grouped.set(providerKey, {
        providerKey,
        providerName: option.providerName,
        models: [option],
      });
    }
    return Array.from(grouped.values());
  }, [modelOptions]);
  /** Available tags for filtering. */
  const availableTags = useMemo(() => {
    const tagSet = new Set<ModelTag>();
    for (const option of modelOptions) {
      for (const tag of option.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return (Object.keys(MODEL_TAG_LABELS) as ModelTag[])
      .filter((tag) => tagSet.has(tag))
      .map((tag) => ({ tag, label: MODEL_TAG_LABELS[tag] ?? tag }));
  }, [modelOptions]);
  /** Provider groups enriched with tag filtering results. */
  const filteredProviderGroups = useMemo<FilteredProviderGroup[]>(() => {
    const hasFilters = selectedTags.length > 0;
    return providerGroups.map((group) => {
      const filteredModels = hasFilters
        ? group.models.filter((model) =>
            selectedTags.every((tag) => (model.tags ?? []).includes(tag)),
          )
        : group.models;
      return {
        ...group,
        filteredModels,
        matchCount: filteredModels.length,
        totalCount: group.models.length,
      };
    });
  }, [providerGroups, selectedTags]);
  // 仅保留有命中模型的 provider。
  const visibleProviderGroups = useMemo(() => {
    if (selectedTags.length === 0) return filteredProviderGroups;
    return filteredProviderGroups.filter((group) => group.matchCount > 0);
  }, [filteredProviderGroups, selectedTags.length]);
  const rawSelectedModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";
  const selectedModel =
    modelOptions.find((option) => option.id === rawSelectedModelId) ?? null;
  const selectedModelId = selectedModel?.id ?? "";
  // 中文注释：优先展示模型 name，没有则回退到 id。
  const selectedModelLabel =
    selectedModel?.modelDefinition
      ? getModelLabel(selectedModel.modelDefinition)
      : selectedModel?.modelId ?? "Auto";
  const isAuto = !selectedModelId;
  const hasModels = modelOptions.length > 0;
  const showCloudEmpty = isCloudSource && !hasModels;
  const showAuto = isCloudSource ? true : hasModels;
  const showAddButton = !isCloudSource;
  const showModelList = hasModels || showAddButton;
  const showTopSection = showAuto || showModelList || showAddButton;
  // 筛选区在模型列表显示时出现。
  // Auto 模式时展示遮罩提示。
  const showAutoMask = isAuto && hasModels;
  const showFilterRow = showModelList;
  /** Provider key of the currently selected model. */
  const selectedProviderKey =
    selectedModel?.providerSettingsId ?? selectedModel?.providerId ?? "";
  /** Persist selected model id into basic config. */
  const persistModelDefaultId = useCallback((nextModelId: string) => {
    const normalized = typeof nextModelId === "string" ? nextModelId : "";
    if (normalized === rawSelectedModelId) return;
    void setBasic({ modelDefaultChatModelId: normalized });
  }, [rawSelectedModelId, setBasic]);
  /** Toggle tag selection for filtering. */
  const handleToggleTag = useCallback((tag: ModelTag) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      return [...prev, tag];
    });
  }, []);
  /** Clear all selected tags. */
  const handleClearTags = useCallback(() => {
    setSelectedTags([]);
  }, []);
  /** Select provider for model list. */
  const handleSelectProvider = useCallback((providerKey: string) => {
    setActiveProviderKey(providerKey);
  }, []);
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
      `[data-tenas-chat-root][data-tab-id="${tabId}"]`,
    );
    if (!target) return;
    const mask = target.querySelector<HTMLElement>("[data-tenas-chat-mask]");
    // 弹出层打开时为 chat 主区域添加模糊效果。
    target.classList.toggle("blur-sm", open);
    target.classList.toggle("opacity-80", open);
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
      target.classList.remove("blur-sm", "opacity-80");
      if (mask) {
        mask.classList.add("hidden");
        mask.style.pointerEvents = "none";
      }
    };
  }, [open, tabId]);
  useEffect(() => {
    if (authLoggedIn) return;
    if (!isCloudSource) return;
    // 未登录时强制回退为本地模式，避免云端入口被直接开启。
    void setBasic({ chatSource: "local" });
  }, [authLoggedIn, isCloudSource, setBasic]);
  useEffect(() => {
    if (!authLoggedIn) return;
    if (!loginOpen) return;
    setLoginOpen(false);
  }, [authLoggedIn, loginOpen]);
  useEffect(() => {
    if (selectedTags.length === 0) return;
    const availableTagSet = new Set(availableTags.map((item) => item.tag));
    const nextTags = selectedTags.filter((tag) => availableTagSet.has(tag));
    if (nextTags.length === selectedTags.length) return;
    // 移除不可用标签，避免筛选条件失效但不可见。
    setSelectedTags(nextTags);
  }, [availableTags, selectedTags]);
  useEffect(() => {
    if (!open) return;
    const availableGroups =
      selectedTags.length > 0 ? visibleProviderGroups : providerGroups;
    if (availableGroups.length === 0) {
      if (activeProviderKey) {
        setActiveProviderKey("");
      }
      return;
    }
    if (
      activeProviderKey &&
      availableGroups.some((group) => group.providerKey === activeProviderKey)
    ) {
      return;
    }
    const nextProviderKey =
      selectedProviderKey &&
      availableGroups.some((group) => group.providerKey === selectedProviderKey)
        ? selectedProviderKey
        : availableGroups[0]!.providerKey;
    // 选择器打开时优先定位到已选模型对应的 provider。
    setActiveProviderKey(nextProviderKey);
  }, [
    open,
    providerGroups,
    visibleProviderGroups,
    selectedTags.length,
    activeProviderKey,
    selectedProviderKey,
  ]);

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

  /** Toggle model source between local and cloud. */
  const handleToggleCloudSource = (next: boolean) => {
    const normalized = next ? "cloud" : "local";
    void setBasic({ chatSource: normalized });
    if (normalized === "cloud") {
      // 切换到云端时清空本地选择，避免透传无效 modelId。
      persistModelDefaultId("");
    }
  };

  /** Active provider group for rendering. */
  const activeProviderGroup =
    visibleProviderGroups.find((group) => group.providerKey === activeProviderKey) ??
    visibleProviderGroups[0] ??
    null;
  /** Models for active provider after filtering. */
  const activeProviderModels = activeProviderGroup?.filteredModels ?? [];

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
        <PopoverContent className="w-[27rem] max-w-[94vw] -translate-x-8 rounded-xl border-border bg-background/95 p-2 shadow-2xl backdrop-blur-sm">
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
                  <Button type="button" size="sm" onClick={handleOpenLogin}>
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
                            persistModelDefaultId("");
                            return;
                          }
                          if (modelOptions.length === 0) return;
                          // 从 Auto 切换到手动时，默认定位到首个模型所在 provider。
                          setActiveProviderKey(
                            modelOptions[0]!.providerSettingsId ?? modelOptions[0]!.providerId
                          );
                          persistModelDefaultId(modelOptions[0]!.id);
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      基于效果与速度帮助您选择最优模型
                    </p>
                  </div>
                ) : null}

                {showFilterRow || showModelList ? (
                  <div className="relative flex flex-col gap-2">
                    {showFilterRow ? (
                      <div className="rounded-lg border border-border/70 bg-muted/30 px-2 py-2">
                        <div className="flex items-start gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {availableTags.length > 0 ? (
                              <>
                                {availableTags.map(({ tag, label }) => {
                                  const isSelected = selectedTags.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => handleToggleTag(tag)}
                                      className={cn(
                                        "inline-flex h-6 items-center rounded-full border px-2 text-[10px] leading-none transition-colors",
                                        isSelected
                                          ? "border-primary/60 bg-primary/15 text-primary"
                                          : "border-border/60 bg-background/70 text-muted-foreground hover:border-border/90 hover:bg-muted/60"
                                      )}
                                      aria-pressed={isSelected}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                                {selectedTags.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={handleClearTags}
                                    className="text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    清空
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                暂无可筛选标签
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {showModelList ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="sm:w-32">
                          <div className="flex h-54 flex-col overflow-hidden rounded-lg border border-border/70 bg-muted/30">
                            <div className="flex-1 space-y-1 overflow-y-scroll p-1 min-h-0">
                              {visibleProviderGroups.map((group) => {
                                const isActive = group.providerKey === activeProviderKey;
                                const isEmpty = selectedTags.length > 0 && group.matchCount === 0;
                                const countLabel =
                                  selectedTags.length > 0
                                    ? `${group.matchCount}/${group.totalCount}`
                                    : `${group.totalCount}`;
                                return (
                                  <button
                                    key={group.providerKey}
                                    type="button"
                                    onClick={() => handleSelectProvider(group.providerKey)}
                                    className={cn(
                                      "w-full rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border/70 hover:bg-muted/60",
                                      isActive && "border-border/70 bg-muted/70",
                                      isEmpty && "opacity-60"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                        {group.providerName}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {countLabel}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {showAddButton ? (
                              <div className="border-t border-border/70 p-1">
                                <Button
                                  type="button"
                                  className="h-8 w-full text-xs"
                                  onClick={handleOpenProviderSettings}
                                >
                                  管理模型
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="rounded-lg border border-border/70 bg-muted/30">
                            <div className="h-54 space-y-1 overflow-y-scroll p-1">
                              {activeProviderGroup ? (
                                activeProviderModels.length > 0 ? (
                                  activeProviderModels.map((option) => {
                                    const optionLabel = option.modelDefinition
                                      ? getModelLabel(option.modelDefinition)
                                      : option.modelId;
                                    const tagLabels =
                                      option.tags && option.tags.length > 0
                                        ? option.tags.map((tag) => MODEL_TAG_LABELS[tag] ?? tag)
                                        : null;
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => persistModelDefaultId(option.id)}
                                        className={cn(
                                          "h-12 w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border/70 hover:bg-muted/60",
                                          selectedModelId === option.id &&
                                            "border-border/70 bg-muted/70"
                                        )}
                                      >
                                        <div className="flex h-full items-center justify-between gap-3">
                                          <div className="min-w-0 flex-1 text-left">
                                            <div className="flex items-center gap-1 truncate text-[13px] font-medium text-foreground">
                                              {!isCloudSource ? (
                                                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                              ) : null}
                                              <span className="truncate">
                                                {optionLabel}
                                              </span>
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
                                    当前筛选无匹配模型
                                  </div>
                                )
                              ) : (
                                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                                  暂无可用模型
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {showAutoMask ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 px-4 text-center text-[11px] text-muted-foreground backdrop-blur-sm">
                        已开启 Auto，关闭后可手动选择模型
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
