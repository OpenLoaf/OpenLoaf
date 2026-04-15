/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { useInstalledCliProviderIds } from "@/hooks/use-cli-tools-installed";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import {
  supportsCode,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

/**
 * Resolve model selection state for chat.
 * Reads directly from basic.chatModelId instead of per-agent config.
 */
export function useChatModelSelection() {
  const { basic, setBasic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const chatModelSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = React.useMemo(
    () => buildChatModelOptions(chatModelSource, providerItems, cloudModels, installedCliProviderIds),
    [chatModelSource, providerItems, cloudModels, installedCliProviderIds],
  );

  const { selectedModel, selectedModelId, isStaleId } = React.useMemo(() => {
    const storedId = (basic.chatModelId ?? "").trim();
    if (storedId) {
      const option = modelOptions.find((item) => item.id === storedId);
      if (option) {
        return { selectedModel: option, selectedModelId: storedId, isStaleId: false };
      }
      // Stored id not found in current options — stale, needs self-heal.
    }
    // Fallback to first available model.
    const first = modelOptions[0];
    if (first) {
      return {
        selectedModel: first,
        selectedModelId: first.id,
        isStaleId: storedId.length > 0,
      };
    }
    return { selectedModel: undefined, selectedModelId: "", isStaleId: false };
  }, [basic.chatModelId, modelOptions]);

  // Self-heal: if stored chatModelId is stale, write back the fallback.
  React.useEffect(() => {
    if (!isStaleId) return;
    if (!selectedModelId) return;
    void setBasic({ chatModelId: selectedModelId });
  }, [isStaleId, selectedModelId, setBasic]);

  const isAutoModel = !selectedModel;
  const isCodeModel = supportsCode(selectedModel);
  const canAttachAll = isAutoModel || supportsToolCall(selectedModel) || isCodeModel;
  // 始终允许图片上传：非视觉模型由后端剥离图片并委派 vision SubAgent 处理。
  const canAttachImage = true;
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
