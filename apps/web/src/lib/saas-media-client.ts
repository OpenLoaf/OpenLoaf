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
import { getAccessToken, resolveSaasBaseUrl } from '@/lib/saas-auth'
import i18n from '@/i18n'

let cachedClient: SaaSClient | null = null
let cachedBaseUrl = ''
let cachedLang = ''

/** Resolve current app language for Accept-Language header. */
function getAppLang(): string {
  return i18n.language || 'en-US'
}

/**
 * Get a SaaSClient instance for direct web-side SDK calls.
 * Reuses the same instance as long as the base URL and language haven't changed.
 * Token is resolved lazily per-request via getAccessToken.
 */
export function getSaasMediaClient(): SaaSClient {
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
    headers: {
      'Accept-Language': lang,
    },
  })
  cachedBaseUrl = baseUrl
  cachedLang = lang
  return cachedClient
}
