"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { useTabs } from "@/hooks/use-tabs";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import {
  areStoredSelectionsEqual,
  CHAT_MODEL_SELECTION_EVENT,
  CHAT_MODEL_SELECTION_TAB_PARAMS_KEY,
  MODEL_SELECTION_STORAGE_KEY,
  type ModelSourceKey,
  normalizeStoredSelections,
  readStoredSelections,
  writeStoredSelections,
} from "../input/chat-model-selection-storage";
import {
  supportsCode,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

/** Resolve model selection state for chat with tab/global memory scope support. */
export function useChatModelSelection(tabId?: string) {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const activeTabId = useTabs((state) => state.activeTabId);
  const setTabChatParams = useTabs((state) => state.setTabChatParams);
  // 逻辑：聊天场景优先使用传入 tabId，非聊天场景回退当前激活 tab。
  const activeChatTabId = tabId ?? activeTabId;
  // 逻辑：模型选择记忆范围与联网搜索共享同一个配置项。
  const modelSelectionMemoryScope: "tab" | "global" =
    basic.chatOnlineSearchMemoryScope === "global" ? "global" : "tab";
  const tabStoredSelectionsRaw = useTabs((state) => {
    const targetTabId = tabId ?? state.activeTabId;
    if (!targetTabId) return undefined;
    const tab = state.tabs.find((item) => item.id === targetTabId);
    return (tab?.chatParams as Record<string, unknown> | undefined)?.[
      CHAT_MODEL_SELECTION_TAB_PARAMS_KEY
    ];
  });
  const tabStoredSelections = React.useMemo(
    () => normalizeStoredSelections(tabStoredSelectionsRaw),
    [tabStoredSelectionsRaw]
  );
  const [globalStoredSelections, setGlobalStoredSelections] = React.useState(() =>
    readStoredSelections()
  );
  const scopeRef = React.useRef<"tab" | "global">(modelSelectionMemoryScope);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== MODEL_SELECTION_STORAGE_KEY) return;
      setGlobalStoredSelections(readStoredSelections());
    };
    const handleSelection = () => {
      setGlobalStoredSelections(readStoredSelections());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CHAT_MODEL_SELECTION_EVENT, handleSelection);
    };
  }, []);

  React.useEffect(() => {
    if (scopeRef.current === modelSelectionMemoryScope) return;
    if (modelSelectionMemoryScope === "global") {
      const nextSelections = activeChatTabId ? tabStoredSelections : globalStoredSelections;
      if (!areStoredSelectionsEqual(globalStoredSelections, nextSelections)) {
        writeStoredSelections(nextSelections);
        setGlobalStoredSelections(nextSelections);
      }
    } else if (
      activeChatTabId &&
      !areStoredSelectionsEqual(tabStoredSelections, globalStoredSelections)
    ) {
      setTabChatParams(activeChatTabId, {
        [CHAT_MODEL_SELECTION_TAB_PARAMS_KEY]: globalStoredSelections,
      });
    }
    scopeRef.current = modelSelectionMemoryScope;
  }, [
    activeChatTabId,
    globalStoredSelections,
    modelSelectionMemoryScope,
    setTabChatParams,
    tabStoredSelections,
  ]);

  const storedSelections =
    modelSelectionMemoryScope === "tab" && activeChatTabId
      ? tabStoredSelections
      : globalStoredSelections;
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds]
  );
  const sourceKey: ModelSourceKey = chatModelSource === "cloud" ? "cloud" : "local";
  const selection = storedSelections[sourceKey] ?? { lastModelId: "", isAuto: true };
  const rawSelectedModelId = selection.isAuto ? "" : selection.lastModelId.trim();
  const selectedModel = modelOptions.find(
    (option) => option.id === rawSelectedModelId
  );
  const selectedModelId = selectedModel ? rawSelectedModelId : "";
  const isAutoModel = selection.isAuto || !selectedModelId;
  const isCodeModel = supportsCode(selectedModel);
  const canAttachAll = isAutoModel || supportsToolCall(selectedModel) || isCodeModel;
  const canAttachImage =
    isAutoModel ||
    supportsImageInput(selectedModel) ||
    (supportsToolCall(selectedModel) && !isCodeModel);
  const canImageGeneration = false;
  const canImageEdit = supportsImageInput(selectedModel);
  const isCodexProvider = selectedModel?.providerId === "codex-cli";

  return {
    chatModelSource,
    modelOptions,
    selectedModel,
    selectedModelId,
    isAutoModel,
    isCodeModel,
    canAttachAll,
    canAttachImage,
    canImageGeneration,
    canImageEdit,
    isCodexProvider,
  };
}
