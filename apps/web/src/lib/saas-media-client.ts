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
import {
  createSaasProxyFetcher,
  resolveServerOriginForSaasProxy,
} from '@/lib/saas-auth'
import { CLIENT_HEADERS } from '@/lib/client-headers'
import i18n from '@/i18n'

let cachedClient: SaaSClient | null = null
let cachedOrigin = ''
let cachedLang = ''

/** Resolve current app language. */
function getAppLang(): string {
  return i18n.language || 'en-US'
}

/**
 * Get a SaaSClient instance pointing at the local reverse proxy.
 * Server injects the real access token server-side — the SDK's
 * getAccessToken callback is a no-op here.
 */
export function getSaasMediaClient(): SaaSClient {
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
