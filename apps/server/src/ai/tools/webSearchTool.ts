/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import { webSearchToolDef } from '@openloaf/api/types/tools/webSearch'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

// ---------------------------------------------------------------------------
// Search Provider Abstraction
// ---------------------------------------------------------------------------

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export interface WebSearchProvider {
  search(query: string, maxResults: number): Promise<WebSearchResult[]>
}

// ---------------------------------------------------------------------------
// Jina Search Provider
// ---------------------------------------------------------------------------

class JinaSearchProvider implements WebSearchProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const url = `https://s.jina.ai/${encodeURIComponent(query)}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Retain-Images': 'none',
    }

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`Jina search failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as any

    // Jina returns { code, status, data: [...] }
    const items: any[] = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []

    return items.slice(0, maxResults).map((item: any) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      content: item.content ?? item.description ?? '',
    }))
  }
}

// ---------------------------------------------------------------------------
// SaaS Search Provider (placeholder for future implementation)
// ---------------------------------------------------------------------------

// class SaasSearchProvider implements WebSearchProvider {
//   constructor(private apiKey: string) {}
//   async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
//     // TODO: Implement SaaS search provider via @openloaf-saas/sdk
//     throw new Error('SaaS search provider not yet implemented')
//   }
// }

// ---------------------------------------------------------------------------
// Provider Selection
// ---------------------------------------------------------------------------

function getSearchProvider(): WebSearchProvider {
  const conf = readBasicConf()
  const provider = conf.webSearchProvider
  const apiKey = conf.webSearchApiKey

  if (provider === 'jina') {
    return new JinaSearchProvider(apiKey)
  }

  // Fallback: use Jina with whatever key is available
  return new JinaSearchProvider(apiKey || process.env.JINA_API_KEY || '')
}

/** Check whether web search is configured in settings. */
export function isWebSearchConfigured(): boolean {
  const conf = readBasicConf()
  return !!(conf.webSearchProvider && conf.webSearchApiKey)
}

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

export const webSearchTool = tool({
  description: webSearchToolDef.description,
  inputSchema: zodSchema(webSearchToolDef.parameters),
  execute: async ({ query, maxResults }) => {
    const limit = maxResults ?? 5

    if (!isWebSearchConfigured()) {
      return {
        ok: false,
        query,
        error: '网页搜索未配置。请在设置中选择搜索提供商并填写 API Key。',
        results: [],
      }
    }

    const provider = getSearchProvider()

    try {
      const results = await provider.search(query, limit)
      return {
        ok: true,
        query,
        resultCount: results.length,
        results,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        query,
        error: message,
        results: [],
      }
    }
  },
})
