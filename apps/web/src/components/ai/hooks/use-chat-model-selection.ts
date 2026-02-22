"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useMainAgentModel } from "./use-main-agent-model";
import {
  supportsCode,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

/** Resolve model selection state for chat with tab/global memory scope support. */
export function useChatModelSelection(_tabId?: string) {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const { modelId: masterModelId, detail: masterDetail } = useMainAgentModel();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds]
  );
  const rawSelectedModelId = masterModelId.trim();
  const selectedModel = modelOptions.find(
    (option) => option.id === rawSelectedModelId
  );
  const selectedModelId = selectedModel ? rawSelectedModelId : "";
  const isAutoModel = !rawSelectedModelId || !selectedModel;
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
    imageModelId: masterDetail?.imageModelId?.trim() || undefined,
    videoModelId: masterDetail?.videoModelId?.trim() || undefined,
  };
}
