/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { SaaSClient } from '@openloaf-saas/sdk'
import type {
  skillMarketModule,
} from '@openloaf-saas/sdk'
import {
  createSaasProxyFetcher,
  resolveSaasProxyBaseUrl,
  resolveServerOriginForSaasProxy,
} from '@/lib/saas-auth'
import { CLIENT_HEADERS } from '@/lib/client-headers'
import i18n from '@/i18n'

// Re-export SDK types for consumer convenience.
export type MarketSkillEntry = skillMarketModule.MarketSkillEntry
export type SkillMarketListRequest = skillMarketModule.SkillMarketListRequest
export type SkillMarketListResponse = skillMarketModule.SkillMarketListResponse
export type SkillMarketDetailResponse = skillMarketModule.SkillMarketDetailResponse
export type SkillMarketCheckUpdatesRequest =
  skillMarketModule.SkillMarketCheckUpdatesRequest
export type SkillMarketCheckUpdatesResponse =
  skillMarketModule.SkillMarketCheckUpdatesResponse
export type SkillMarketRateResponse = skillMarketModule.SkillMarketRateResponse

let cachedClient: SaaSClient | null = null
let cachedOrigin = ''
let cachedLang = ''

/** Resolve current app language. */
function getAppLang(): string {
  return i18n.language || 'en-US'
}

/**
 * Get a SaaSClient instance for Skill Marketplace, pointing at the local
 * reverse proxy. Server injects token server-side.
 */
export function getSkillMarketClient(): SaaSClient {
  const origin = resolveServerOriginForSaasProxy()
  if (!origin) {
    throw new Error('server_origin_missing')
  }
  const lang = getAppLang()
  if (cachedClient && cachedOrigin === origin && cachedLang === lang) {
    return cachedClient
  }
  cachedClient = new SaaSClient({
    // 逻辑：baseUrl 必须是 origin-only，前缀注入由 createSaasProxyFetcher 完成。
    baseUrl: origin,
    // 逻辑：反代会注入 Server 自持的 token，客户端传空串即可。
    getAccessToken: async () => '',
    // 逻辑：每个请求带 X-OpenLoaf-Client，通过 strictClientGuard CSRF 检查。
    headers: { ...CLIENT_HEADERS },
    locale: lang,
    fetcher: createSaasProxyFetcher(origin),
  })
  cachedOrigin = origin
  cachedLang = lang
  return cachedClient
}

/** List marketplace skills with optional filters. */
export async function listMarketSkills(
  params?: SkillMarketListRequest,
): Promise<SkillMarketListResponse> {
  const client = getSkillMarketClient()
  return client.skillMarket.list(params)
}

/** Fetch marketplace skill detail by id. */
export async function getMarketSkillDetail(
  skillId: string,
): Promise<SkillMarketDetailResponse> {
  const client = getSkillMarketClient()
  return client.skillMarket.detail(skillId)
}

/** Download a marketplace skill as ZIP archive. Returns ArrayBuffer + fileName.
 *
 * 不走 SDK 的 skillMarket.download —— 该方法在 SDK 内部用 global fetch 直接调 SaaS，
 * 不合并 SaaSClient 静态 headers，无法带 X-OpenLoaf-Client。这里直接对反代发 POST。
 */
export async function downloadMarketSkill(
  skillId: string,
): Promise<{ data: ArrayBuffer; fileName: string }> {
  const base = resolveSaasProxyBaseUrl()
  if (!base) {
    throw new Error('saas_proxy_base_url_missing')
  }
  const lang = getAppLang()
  const langParam = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  const response = await fetch(
    `${base}/api/skill-market/${encodeURIComponent(skillId)}/download${langParam}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { ...CLIENT_HEADERS },
    },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Download failed' }))
    throw new Error((payload as { message?: string }).message ?? 'Download failed')
  }
  const disposition = response.headers.get('content-disposition')
  const fileNameMatch = disposition?.match(/filename="?([^"]+)"?/i)
  const fileName = fileNameMatch?.[1] ?? `${skillId}.zip`
  return { data: await response.arrayBuffer(), fileName }
}

/** Batch check installed skills for available updates. */
export async function checkSkillUpdates(
  payload: SkillMarketCheckUpdatesRequest,
): Promise<SkillMarketCheckUpdatesResponse> {
  const client = getSkillMarketClient()
  return client.skillMarket.checkUpdates(payload)
}

/** Rate a marketplace skill (1-5) with optional comment. */
export async function rateMarketSkill(
  skillId: string,
  rating: number,
  comment?: string,
): Promise<SkillMarketRateResponse> {
  const client = getSkillMarketClient()
  return client.skillMarket.rate(skillId, rating, comment)
}
