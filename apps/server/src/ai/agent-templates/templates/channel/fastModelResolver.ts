/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Fast chat model resolver — channel bridge 的"fast agent"路径（快速 ack
 * + 超时兜底 summarizer）专用。
 *
 * IM 通道对首条反馈延迟极敏感（≤10s，否则用户焦虑）。SaaS SDK v0.2.4+ 在
 * v3Variant 上暴露 `isFast: boolean` 标记低延迟 variant（例如 Qwen Flash
 * 家族），供 channel 这种"秒级应答"场景选型。
 *
 * 解析策略：
 *   1. 拉云端 chat 目录（含缓存，默认 24h TTL）
 *   2. 找第一个 `isFast === true` 的 variant
 *   3. 返回 `<familyId-lower>:<variantId>`（channel runChatStream 需要这种
 *      格式的 chatModelId）
 *   4. 任何一步失败（无 token / SaaS 连不上 / 目录里没 isFast variant）都
 *      fallback 到 `CHANNEL_DEFAULT_CHAT_MODEL_ID`，让 bridge 至少能跑
 *
 * 为什么不复用 `resolveChatModel`：那个函数期望前端已经**选好** chatModelId
 * 然后构建具体 provider adapter；这里我们是"在多个 variant 里自动挑一个"，
 * 语义不同，直接读 modelList 即可。
 */

import { fetchModelList } from '@/modules/saas'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'
import { CHANNEL_DEFAULT_CHAT_MODEL_ID } from './index'
import { logger } from '@/common/logger'

/**
 * Resolve a low-latency chat model id for the channel fast-agent path.
 * Always returns a valid id; falls back to CHANNEL_DEFAULT_CHAT_MODEL_ID.
 */
export async function resolveChannelFastChatModelId(): Promise<string> {
  const accessToken = (await ensureServerAccessToken().catch(() => null)) ?? ''
  if (!accessToken) {
    logger.debug(
      '[channel-fast-model] no saas access token; using default',
    )
    return CHANNEL_DEFAULT_CHAT_MODEL_ID
  }
  let payload
  try {
    payload = await fetchModelList(accessToken)
  } catch (err) {
    logger.debug(
      { err: String(err) },
      '[channel-fast-model] fetchModelList threw; using default',
    )
    return CHANNEL_DEFAULT_CHAT_MODEL_ID
  }
  if (!payload || payload.success !== true) {
    logger.debug('[channel-fast-model] fetchModelList unsuccessful; using default')
    return CHANNEL_DEFAULT_CHAT_MODEL_ID
  }
  const items = payload.data.data
  // 逻辑：第一个 isFast variant 即选定；如果 SaaS 有多个 fast model，
  // 按 SaaS 返回顺序取第一个即可（SaaS 会把推荐优先的排前面）。
  const fast = items.find((it) => it.isFast === true)
  if (!fast) {
    logger.debug(
      { totalVariants: items.length },
      '[channel-fast-model] no isFast variant in catalog; using default',
    )
    return CHANNEL_DEFAULT_CHAT_MODEL_ID
  }
  const id = `${fast.provider}:${fast.id}`
  logger.debug(
    { chatModelId: id },
    '[channel-fast-model] resolved fast variant',
  )
  return id
}
