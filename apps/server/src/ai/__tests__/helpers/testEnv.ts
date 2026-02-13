import { getProviderSettings } from '@/modules/settings/settingsService'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { setRequestContext, setChatModel, setAbortSignal } from '@/ai/shared/context/requestContext'

const ENV_KEY = 'TENAS_TEST_CHAT_MODEL_ID'

/**
 * 读取 TENAS_TEST_CHAT_MODEL_ID 环境变量（格式：profileId:modelId）。
 * 未设置时直接抛错，避免静默跳过。
 */
export function getTestChatModelId(): string {
  const raw = process.env[ENV_KEY]
  if (!raw) {
    throw new Error(`环境变量 ${ENV_KEY} 未设置。格式：profileId:modelId`)
  }
  return raw
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
