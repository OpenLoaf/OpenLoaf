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
 * 从 SaaS chat 目录里挑 `isFast === true` 的快速 variant，返回
 * `${provider}:${id}` 形式的 chatModelId，供 resolveChatModel 直接消费。
 *
 * 适用场景：auxiliary 推理、channel fast-ack 等"需要低延迟、由系统自动
 * 选型"的路径。失败（无 token / SaaS 连不上 / 目录里没 isFast variant）
 * 直接抛错——调用方自行决定兜底策略（channel 有默认模型，auxiliary 会
 * 走外层 try/catch 回落到 fallback 值）。
 */

import { fetchModelList } from '@/modules/saas'
import { ensureServerAccessToken } from '@/modules/auth/tokenStore'

export async function resolveSaasFastChatModelId(): Promise<string> {
  const accessToken = (await ensureServerAccessToken().catch(() => null)) ?? ''
  if (!accessToken) throw new Error('尚未登录云端账号，请先在设置中完成登录')
  const payload = await fetchModelList(accessToken)
  if (!payload || payload.success !== true) {
    throw new Error('暂时无法获取云端模型列表，请检查网络或稍后重试')
  }
  const fast = payload.data.data.find((it) => it.isFast === true)
  if (!fast) throw new Error('云端暂未提供可用的快速模型')
  return `${fast.provider}:${fast.id}`
}
