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
import { installHttpProxy } from '@/modules/proxy/httpProxy'

// 测试环境初始化代理 — 确保 Node.js fetch 走系统代理（undici 不自动识别环境变量）
installHttpProxy()

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

/** E2E 测试工作区 ID（与 scripts/docker-e2e/openloaf-root/workspaces.json 一致）。 */
export const E2E_WORKSPACE_ID = '00000000-e2e0-4000-8000-000000000001'

/**
 * 设置最小 RequestContext（sessionId + cookies + workspaceId）。
 * workspaceId 使用 E2E 测试工作区，确保 calendar/email/project 等工具能正确查询数据。
 */
export function setMinimalRequestContext() {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
    workspaceId: E2E_WORKSPACE_ID,
  })
}

export { getProviderSettings, setChatModel, setAbortSignal }
