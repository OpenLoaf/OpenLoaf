/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * WebSearch tool — searches the web via configurable providers.
 * Architecture modeled after Claude Code's WebSearchTool:
 *   - Schema: query + allowed_domains/blocked_domains (mutually exclusive)
 *   - Input validation with error codes
 *   - Output includes results + mandatory Sources reminder
 *
 * Unlike Claude Code (which uses Anthropic's native web_search_20250305 server tool),
 * OpenLoaf uses pluggable search providers (currently Jina) since it supports
 * multiple AI model providers.
 */
import { tool, zodSchema } from 'ai'
import { webSearchToolDef } from '@openloaf/api/types/tools/webSearch'
import { readBasicConf } from '@/modules/settings/openloafConfStore'
import { createToolProgress } from './toolProgress'

// ---------------------------------------------------------------------------
// Search Provider Abstraction
// ---------------------------------------------------------------------------

export interface SearchHit {
  title: string
  url: string
}

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export interface WebSearchProvider {
  search(query: string, options?: {
    allowedDomains?: string[]
    blockedDomains?: string[]
  }): Promise<WebSearchResult[]>
}

// ---------------------------------------------------------------------------
// Jina Search Provider
// ---------------------------------------------------------------------------

const MAX_SEARCH_RESULTS = 8 // matching Claude Code's max_uses: 8

class JinaSearchProvider implements WebSearchProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(
    query: string,
    options?: { allowedDomains?: string[]; blockedDomains?: string[] },
  ): Promise<WebSearchResult[]> {
    // Build search query with domain filters
    let searchQuery = query
    if (options?.allowedDomains?.length) {
      const siteFilter = options.allowedDomains.map((d) => `site:${d}`).join(' OR ')
      searchQuery = `${query} (${siteFilter})`
    } else if (options?.blockedDomains?.length) {
      const excludeFilter = options.blockedDomains.map((d) => `-site:${d}`).join(' ')
      searchQuery = `${query} ${excludeFilter}`
    }

    const url = `https://s.jina.ai/${encodeURIComponent(searchQuery)}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Retain-Images': 'none',
    }

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as any
    const items: any[] = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []

    return items.slice(0, MAX_SEARCH_RESULTS).map((item: any) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      content: item.content ?? item.description ?? '',
    }))
  }
}

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
  execute: async (input, { toolCallId }): Promise<string> => {
    const {
      query,
      allowed_domains: allowedDomains,
      blocked_domains: blockedDomains,
    } = input as {
      query: string
      allowed_domains?: string[]
      blocked_domains?: string[]
    }

    const progress = createToolProgress(toolCallId, 'WebSearch')
    const startTime = performance.now()

    // Input validation (matching Claude Code's validateInput)
    if (!query || query.length < 2) {
      return 'Error: Missing or too short query (minimum 2 characters)'
    }

    if (allowedDomains?.length && blockedDomains?.length) {
      return 'Error: Cannot specify both allowed_domains and blocked_domains in the same request'
    }

    // Check configuration
    if (!isWebSearchConfigured()) {
      return 'Error: Web search is not configured. Please set up a search provider and API key in Settings → Web Search.'
    }

    progress.start(`Searching: ${query}`)
    const provider = getSearchProvider()

    try {
      const results = await provider.search(query, {
        allowedDomains,
        blockedDomains,
      })

      const endTime = performance.now()
      const durationSeconds = ((endTime - startTime) / 1000).toFixed(1)

      if (results.length === 0) {
        progress.done(`No results found (${durationSeconds}s)`)
        return `Web search results for query: "${query}"\n\nNo results found.\n\nSearch completed in ${durationSeconds}s`
      }

      // Emit each result as a delta for progressive UI rendering
      for (const result of results) {
        const snippet = result.content
          ? result.content.length > 200
            ? `${result.content.slice(0, 200)}...`
            : result.content
          : ''
        progress.delta(`### ${result.title}\n${result.url}\n${snippet}\n\n`)
      }

      progress.done(`Found ${results.length} results in ${durationSeconds}s`)

      // Format full output for LLM (unchanged)
      let output = `Web search results for query: "${query}"\n\n`

      for (const result of results) {
        output += `### ${result.title}\n`
        output += `URL: ${result.url}\n`
        if (result.content) {
          // Truncate individual result content to keep total size reasonable
          const snippet = result.content.length > 500
            ? result.content.slice(0, 500) + '...'
            : result.content
          output += `${snippet}\n`
        }
        output += '\n'
      }

      output += `\nSearch completed in ${durationSeconds}s (${results.length} results)`
      output += '\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.'

      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      progress.error(message)
      return `Error searching for "${query}": ${message}`
    }
  },
})
