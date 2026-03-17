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
import { webFetchToolDef } from '@openloaf/api/types/tools/webFetch'

const DEFAULT_MAX_LENGTH = 50_000
const FETCH_TIMEOUT_MS = 30_000

async function importTurndown(): Promise<typeof import('turndown')> {
  const mod = await import('turndown')
  return (mod as any).default || mod
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1]?.trim() || undefined
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + `\n\n[... 内容已截断，共 ${text.length} 字符，显示前 ${maxLength} 字符]`
}

export const webFetchTool = tool({
  description: webFetchToolDef.description,
  inputSchema: zodSchema(webFetchToolDef.parameters),
  execute: async ({ url, headers: customHeaders, maxLength }) => {
    const limit = maxLength ?? DEFAULT_MAX_LENGTH

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'OpenLoaf/1.0 (web-fetch tool)',
        Accept: 'text/html, application/json, text/plain, */*',
        ...customHeaders,
      }

      const response = await fetch(url, {
        headers: requestHeaders,
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timer)

      if (!response.ok) {
        return {
          ok: false,
          url,
          error: `HTTP ${response.status} ${response.statusText}`,
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const rawBody = await response.text()

      let content: string
      let title: string | undefined

      if (contentType.includes('application/json')) {
        // JSON: pretty-print
        try {
          content = JSON.stringify(JSON.parse(rawBody), null, 2)
        } catch {
          content = rawBody
        }
      } else if (contentType.includes('text/html')) {
        // HTML: extract title, convert to Markdown
        title = extractTitle(rawBody)
        try {
          const TurndownService = await importTurndown()
          const td = new TurndownService()
          content = td.turndown(rawBody)
        } catch {
          // Fallback: strip tags
          content = rawBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        }
      } else {
        // Plain text / other
        content = rawBody
      }

      return {
        ok: true,
        url,
        contentType: (contentType.split(';')[0] ?? contentType).trim(),
        ...(title ? { title } : {}),
        content: truncate(content, limit),
        length: content.length,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        url,
        error: message.includes('abort')
          ? `请求超时（${FETCH_TIMEOUT_MS / 1000}s）`
          : message,
      }
    }
  },
})
