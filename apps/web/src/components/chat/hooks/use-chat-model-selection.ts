"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import {
  CHAT_MODEL_SELECTION_EVENT,
  MODEL_SELECTION_STORAGE_KEY,
  type ModelSourceKey,
  readStoredSelections,
} from "../input/chat-model-selection-storage";
import {
  supportsCode,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

export function useChatModelSelection() {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const [storedSelections, setStoredSelections] = React.useState(() =>
    readStoredSelections()
  );
  React.useEffect(() => {
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
