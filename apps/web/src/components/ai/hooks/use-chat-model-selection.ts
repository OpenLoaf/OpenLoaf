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
import { useMainAgentModel } from "./use-main-agent-model";
import {
  supportsCode,
  supportsImageInput,
  supportsToolCall,
} from "@/lib/model-capabilities";

/**
 * Resolve model selection state for chat.
 * @param projectId Optional project id for resolving project-scoped master agent.
 */
export function useChatModelSelection(projectId?: string) {
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const installedCliProviderIds = useInstalledCliProviderIds();
  const {
    modelIds: masterModelIds,
    detail: masterDetail,
    setModelIds,
  } = useMainAgentModel(projectId);
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
  const { selectedModel, selectedModelId, isStaleMasterId } = React.useMemo(() => {
    for (const id of normalizedMasterIds) {
      const option = modelOptions.find((item) => item.id === id);
      if (option) {
        return { selectedModel: option, selectedModelId: id, isStaleMasterId: false };
      }
    }
    // 无显式选择时 fallback 到第一个可用模型（已删除 auto 模式）。
    // 同时记录 isStaleMasterId = true，便于在 effect 中自愈回写到 master agent，
    // 避免后续 send 仍然使用 in-memory fallback 而 master 文件里留着陈旧 id。
    const first = modelOptions[0];
    if (first) {
      return {
        selectedModel: first,
        selectedModelId: first.id,
        isStaleMasterId: normalizedMasterIds.length > 0,
      };
    }
    return { selectedModel: undefined, selectedModelId: "", isStaleMasterId: false };
  }, [modelOptions, normalizedMasterIds]);
  // 自愈：旧格式的 modelCloudIds（如 v3 迁移前的 `deepseek:deepseek-chat`）在
  // 新的 modelOptions 里找不到匹配项时，静默回写到 master agent。否则 Chat.tsx
  // 每次发消息都会用 fallback id，而 picker 看似选中的 model 完全不会生效。
  // 只在 masterDetail 真正就绪后回写，防止启动期空数据误伤。
  React.useEffect(() => {
    if (!masterDetail) return;
    if (!isStaleMasterId) return;
    if (!selectedModelId) return;
    setModelIds([selectedModelId]);
  }, [masterDetail, isStaleMasterId, selectedModelId, setModelIds]);
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
