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

/**
 * Resolve model selection state for chat with tab/global memory scope support.
 * @param _tabId Unused tab id (kept for signature compatibility).
 * @param projectId Optional project id for resolving project-scoped master agent.
 */
export function useChatModelSelection(_tabId?: string, projectId?: string) {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const { modelIds: masterModelIds, detail: masterDetail } = useMainAgentModel(projectId);
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds]
  );
  const normalizedMasterIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(masterModelIds) ? masterModelIds : [])
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
      ),
    [masterModelIds],
  );
  const { selectedModel, selectedModelId } = React.useMemo(() => {
    for (const id of normalizedMasterIds) {
      const option = modelOptions.find((item) => item.id === id);
      if (option) {
        return { selectedModel: option, selectedModelId: id };
      }
    }
    return { selectedModel: undefined, selectedModelId: "" };
  }, [modelOptions, normalizedMasterIds]);
  const isAutoModel = normalizedMasterIds.length === 0 || !selectedModel;
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
    imageModelId: masterDetail?.imageModelIds?.[0]?.trim() || undefined,
    videoModelId: masterDetail?.videoModelIds?.[0]?.trim() || undefined,
  };
}
