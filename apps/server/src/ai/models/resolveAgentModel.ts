/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { LanguageModelV3 } from '@ai-sdk/provider'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import type { ChatModelSource } from '@openloaf/api/common'

type ResolveAgentModelInput = {
  /** Agent 自身配置的模型 ID（如 "openai:gpt-4o"）。 */
  agentModelId?: string | null
  /** 调用者传入的模型覆盖（如 master agent spawn 时指定）。 */
  modelOverride?: string | null
  /** 当前聊天模型来源。 */
  chatModelSource?: ChatModelSource | null
  /** SaaS 访问令牌（云端模式）。 */
  saasAccessToken?: string | null
}

type ResolveAgentModelResult = {
  model: LanguageModelV3
  modelInfo: { provider: string; modelId: string }
  chatModelId: string
}

/**
 * 解析 Agent 使用的模型。
 *
 * 优先级：modelOverride > agentModelId > Auto（由 resolveChatModel 自动选择）。
 */
export async function resolveAgentModel(
  input: ResolveAgentModelInput,
): Promise<ResolveAgentModelResult> {
  // 逻辑：优先使用调用者覆盖，其次 Agent 自身配置，最后 Auto。
  const chatModelId = input.modelOverride || input.agentModelId || undefined
  return resolveChatModel({
    chatModelId,
    chatModelSource: input.chatModelSource,
    saasAccessToken: input.saasAccessToken,
  })
}
