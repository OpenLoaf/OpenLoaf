"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import {
  supportsCode,
  supportsImageEdit,
  supportsImageGeneration,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

export function useChatModelSelection() {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels),
    [chatModelSource, providerItems, cloudModels]
  );
  const rawSelectedModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";
  const selectedModel = modelOptions.find(
    (option) => option.id === rawSelectedModelId
  );
  const selectedModelId = selectedModel ? rawSelectedModelId : "";
  const isAutoModel = !selectedModelId;
  const isCodeModel = supportsCode(selectedModel);
  const canAttachAll = isAutoModel || supportsToolCall(selectedModel) || isCodeModel;
  const canAttachImage =
    isAutoModel ||
    supportsImageInput(selectedModel) ||
    supportsImageEdit(selectedModel) ||
    (supportsToolCall(selectedModel) && !isCodeModel);
  const canImageGeneration = supportsImageGeneration(selectedModel);
  const canImageEdit = supportsImageEdit(selectedModel);
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
