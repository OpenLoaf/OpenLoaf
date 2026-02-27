/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getProviderSettings } from '@/modules/settings/settingsService'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { setRequestContext, setChatModel, setAbortSignal } from '@/ai/shared/context/requestContext'

const ENV_KEY = 'OPENLOAF_TEST_CHAT_MODEL_ID'

/**
 * 读取 OPENLOAF_TEST_CHAT_MODEL_ID 环境变量（格式：profileId:modelId）。
 * 未设置时返回 undefined，走 resolveChatModel 自动 fallback。
 */
export function getTestChatModelId(): string | undefined {
  const raw = process.env[ENV_KEY]
  return raw?.trim() || undefined
}

/**
 * 解析测试模型为 LanguageModelV3。
 */
export async function resolveTestModel() {
  const chatModelId = getTestChatModelId()
  return resolveChatModel({ chatModelId, chatModelSource: 'local' })
}

/**
 * 设置最小 RequestContext（仅 sessionId + cookies）。
 */
export function setMinimalRequestContext() {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
  })
}

export { getProviderSettings, setChatModel, setAbortSignal }
