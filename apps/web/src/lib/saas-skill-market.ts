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
import { getAccessToken, resolveSaasBaseUrl } from '@/lib/saas-auth'
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
let cachedBaseUrl = ''
let cachedLang = ''

/** Resolve current app language. */
function getAppLang(): string {
  return i18n.language || 'en-US'
}

/**
 * Get a SaaSClient instance configured for Skill Marketplace calls.
 * Reuses the same instance as long as the base URL and language haven't changed.
 * Token is resolved lazily per-request via getAccessToken.
 */
export function getSkillMarketClient(): SaaSClient {
  const baseUrl = resolveSaasBaseUrl()
  if (!baseUrl) {
    throw new Error('saas_url_missing')
  }
  const lang = getAppLang()
  if (cachedClient && cachedBaseUrl === baseUrl && cachedLang === lang) {
    return cachedClient
  }
  cachedClient = new SaaSClient({
    baseUrl,
    getAccessToken: async () => {
      const token = await getAccessToken()
      return token ?? ''
    },
    locale: lang,
  })
  cachedBaseUrl = baseUrl
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

/** Download a marketplace skill as ZIP archive. Returns ArrayBuffer + fileName. */
export async function downloadMarketSkill(
  skillId: string,
): Promise<{ data: ArrayBuffer; fileName: string }> {
  const client = getSkillMarketClient()
  return client.skillMarket.download(skillId)
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
