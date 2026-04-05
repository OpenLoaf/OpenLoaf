/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * WebFetch tool — fetches a URL, converts HTML to Markdown, returns content.
 * Architecture modeled after Claude Code's WebFetchTool:
 *   - URL validation (length, parseable, no auth)
 *   - LRU cache (15min TTL, 50MB max)
 *   - http → https upgrade
 *   - Manual redirect following (same-host only, max 10)
 *   - HTML → Markdown via Turndown (lazy-loaded)
 *   - Content truncation at 100,000 chars
 */
import { tool, zodSchema } from 'ai'
import { webFetchToolDef } from '@openloaf/api/types/tools/webFetch'
import { LRUCache } from 'lru-cache'
import {
  formatBytes,
  hostSlug,
  saveRawArtifact,
  timestampPrefix,
  type SavedRawArtifact,
} from '@/ai/tools/shared/saveRawArtifact'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Constants (matching Claude Code)
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 60_000
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024 // 10MB
const MAX_REDIRECTS = 10
const MAX_MARKDOWN_LENGTH = 32_768
const MAX_URL_LENGTH = 2000

const USER_AGENT = 'OpenLoaf/1.0 (web-fetch; +https://github.com/OpenLoaf/OpenLoaf)'

// ---------------------------------------------------------------------------
// URL Cache (LRU — 15min TTL, ~50MB total)
// ---------------------------------------------------------------------------

interface CachedContent {
  content: string
  contentType: string
  finalUrl: string
  code: number
  codeText: string
  bytes: number
  /** Raw body (undecoded) — kept so cache hits can re-save to the current session. */
  rawBody: Buffer
  /** File extension derived from content-type (html/json/txt). */
  rawExt: string
}

const URL_CACHE = new LRUCache<string, CachedContent>({
  max: 200,
  ttl: 15 * 60 * 1000, // 15 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (entry) => (entry.content.length || 0) + (entry.rawBody.byteLength || 0) || 1,
})

// ---------------------------------------------------------------------------
// Turndown lazy loader (singleton — ~1.4MB heap on first use)
// ---------------------------------------------------------------------------

let turndownInstance: any = null

async function getTurndownService(): Promise<any> {
  if (turndownInstance) return turndownInstance
  const mod = await import('turndown')
  const TurndownService = (mod as any).default || mod
  turndownInstance = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })
  return turndownInstance
}

// ---------------------------------------------------------------------------
// URL Validation (matching Claude Code's validateURL)
// ---------------------------------------------------------------------------

function validateURL(url: string): { valid: true; parsed: URL } | { valid: false; message: string } {
  if (url.length > MAX_URL_LENGTH) {
    return { valid: false, message: `URL too long (${url.length} chars, max ${MAX_URL_LENGTH})` }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, message: `Invalid URL: "${url}" could not be parsed.` }
  }

  // Reject URLs with embedded credentials
  if (parsed.username || parsed.password) {
    return { valid: false, message: 'URLs with embedded authentication credentials are not supported.' }
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, message: `Unsupported protocol: ${parsed.protocol}` }
  }

  return { valid: true, parsed }
}

// ---------------------------------------------------------------------------
// Redirect checking (matching Claude Code's isPermittedRedirect)
// ---------------------------------------------------------------------------

function isPermittedRedirect(originalUrl: URL, redirectUrl: URL): boolean {
  // Protocol downgrade not allowed
  if (originalUrl.protocol === 'https:' && redirectUrl.protocol === 'http:') {
    return false
  }
  // Port change not allowed
  if (originalUrl.port !== redirectUrl.port) {
    return false
  }
  // No auth in redirect
  if (redirectUrl.username || redirectUrl.password) {
    return false
  }
  // Same hostname or just www prefix difference
  const origHost = originalUrl.hostname.replace(/^www\./, '')
  const redirHost = redirectUrl.hostname.replace(/^www\./, '')
  return origHost === redirHost
}

// ---------------------------------------------------------------------------
// Core fetch with manual redirect handling
// ---------------------------------------------------------------------------

async function fetchWithRedirects(
  url: string,
  signal: AbortSignal,
): Promise<{
  type: 'content'
  body: ArrayBuffer
  contentType: string
  finalUrl: string
  code: number
  codeText: string
} | {
  type: 'redirect'
  originalUrl: string
  redirectUrl: string
  statusCode: number
}> {
  let currentUrl = url
  let redirectCount = 0

  while (redirectCount < MAX_REDIRECTS) {
    const response = await fetch(currentUrl, {
      signal,
      redirect: 'manual',
      headers: {
        Accept: 'text/markdown, text/html, application/json, text/plain, */*',
        'User-Agent': USER_AGENT,
      },
    })

    // Check for redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        // No location header — treat as content
        const body = await response.arrayBuffer()
        return {
          type: 'content',
          body,
          contentType: response.headers.get('content-type') ?? '',
          finalUrl: currentUrl,
          code: response.status,
          codeText: response.statusText,
        }
      }

      const redirectUrl = new URL(location, currentUrl)
      const originalParsed = new URL(currentUrl)

      if (!isPermittedRedirect(originalParsed, redirectUrl)) {
        // Cross-host redirect — report back to model
        return {
          type: 'redirect',
          originalUrl: url,
          redirectUrl: redirectUrl.href,
          statusCode: response.status,
        }
      }

      currentUrl = redirectUrl.href
      redirectCount++
      continue
    }

    // Content length check
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_HTTP_CONTENT_LENGTH) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_HTTP_CONTENT_LENGTH})`)
    }

    const body = await response.arrayBuffer()
    if (body.byteLength > MAX_HTTP_CONTENT_LENGTH) {
      throw new Error(`Response too large: ${body.byteLength} bytes (max ${MAX_HTTP_CONTENT_LENGTH})`)
    }

    return {
      type: 'content',
      body,
      contentType: response.headers.get('content-type') ?? '',
      finalUrl: currentUrl,
      code: response.status,
      codeText: response.statusText,
    }
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`)
}

// ---------------------------------------------------------------------------
// Content processing
// ---------------------------------------------------------------------------

async function processContent(
  body: ArrayBuffer,
  contentType: string,
): Promise<{ summary: string; ext: string }> {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(body)

  if (contentType.includes('application/json')) {
    let summary: string
    try {
      summary = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      summary = text
    }
    return { summary, ext: 'json' }
  }

  if (contentType.includes('text/html')) {
    let summary: string
    try {
      const td = await getTurndownService()
      summary = td.turndown(text)
    } catch {
      // Fallback: strip HTML tags
      summary = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    return { summary, ext: 'html' }
  }

  if (contentType.includes('text/markdown')) {
    return { summary: text, ext: 'md' }
  }

  // text/plain, etc.
  return { summary: text, ext: 'txt' }
}

function truncateContent(content: string): string {
  if (content.length <= MAX_MARKDOWN_LENGTH) return content
  return content.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n[Content truncated due to length...]'
}

/**
 * Persist raw fetched body to the session's asset dir. Returns undefined if
 * no active session (tool may be invoked outside a chat context during tests).
 */
async function trySaveRaw(
  finalUrl: string,
  rawBody: Buffer,
  ext: string,
): Promise<SavedRawArtifact | undefined> {
  try {
    const filename = `${timestampPrefix()}_${hostSlug(finalUrl)}.${ext}`
    return await saveRawArtifact({ subdir: 'webfetch', filename, content: rawBody })
  } catch (err) {
    logger.warn({ err, finalUrl }, '[webFetchTool] failed to persist raw body')
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Raw body shape analysis — detects minified/compressed single-line files.
// Claude models frequently loop on such files because Read/Grep see long
// lines as "truncated" or yield zero matches; surfacing shape up-front lets
// the model pick Bash grep/sed directly.
// ---------------------------------------------------------------------------

interface RawBodyShape {
  lines: number
  maxLineLength: number
  isMinified: boolean
}

function analyzeRawBodyShape(rawBody: Buffer, ext: string): RawBodyShape {
  // Only analyze textual bodies — skip binary-ish content to save cycles.
  if (!['html', 'json', 'md', 'txt'].includes(ext)) {
    return { lines: 0, maxLineLength: 0, isMinified: false }
  }
  // Decode as UTF-8 with lenient fallback.
  let text: string
  try {
    text = rawBody.toString('utf8')
  } catch {
    return { lines: 0, maxLineLength: 0, isMinified: false }
  }
  if (!text) return { lines: 0, maxLineLength: 0, isMinified: false }
  // Count lines + track max line length in one pass.
  let lineCount = 1
  let maxLen = 0
  let currentLen = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      if (currentLen > maxLen) maxLen = currentLen
      lineCount++
      currentLen = 0
    } else {
      currentLen++
    }
  }
  if (currentLen > maxLen) maxLen = currentLen
  // Trailing newline shouldn't add an empty line.
  if (text.endsWith('\n')) lineCount = Math.max(1, lineCount - 1)
  // Minified signature: few lines, very long single lines.
  const isMinified = lineCount < 20 && maxLen > 5000
  return { lines: lineCount, maxLineLength: maxLen, isMinified }
}

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

export const webFetchTool = tool({
  description: webFetchToolDef.description,
  inputSchema: zodSchema(webFetchToolDef.parameters),
  execute: async (input): Promise<string> => {
    const { url: rawUrl, prompt } = input as { url: string; prompt: string }
    const start = Date.now()

    // 1. Validate URL
    const validation = validateURL(rawUrl)
    if (!validation.valid) {
      return `Error: ${validation.message}`
    }

    // 2. http → https upgrade
    let url = rawUrl
    if (validation.parsed.protocol === 'http:') {
      url = rawUrl.replace(/^http:/, 'https:')
    }

    // 3. Check cache
    const cached = URL_CACHE.get(url)
    if (cached) {
      const result = truncateContent(cached.content)
      const durationMs = Date.now() - start
      // Cache hit: still save raw to the CURRENT session so the model
      // can Read/Grep it without knowing whether it was cached.
      const rawArtifact = await trySaveRaw(cached.finalUrl, cached.rawBody, cached.rawExt)
      const rawShape = analyzeRawBodyShape(cached.rawBody, cached.rawExt)
      return formatOutput({
        bytes: cached.bytes,
        code: cached.code,
        codeText: cached.codeText,
        result,
        durationMs,
        url: cached.finalUrl,
        prompt,
        rawArtifact,
        rawShape,
      })
    }

    // 4. Fetch with redirect handling
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetchWithRedirects(url, controller.signal)
      clearTimeout(timer)

      // Cross-host redirect
      if (response.type === 'redirect') {
        const statusText = response.statusCode === 301
          ? 'Moved Permanently'
          : response.statusCode === 308
            ? 'Permanent Redirect'
            : response.statusCode === 307
              ? 'Temporary Redirect'
              : 'Found'

        return `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${response.originalUrl}
Redirect URL: ${response.redirectUrl}
Status: ${response.statusCode} ${statusText}

To complete your request, fetch content from the redirected URL using WebFetch again with:
- url: "${response.redirectUrl}"
- prompt: "${prompt}"`
      }

      // Process content (lossy: HTML→Markdown) — keep raw body for persistence.
      const { summary, ext } = await processContent(response.body, response.contentType)
      const bytes = response.body.byteLength
      const rawBody = Buffer.from(response.body)

      // Write cache
      URL_CACHE.set(url, {
        content: summary,
        contentType: response.contentType,
        finalUrl: response.finalUrl,
        code: response.code,
        codeText: response.codeText,
        bytes,
        rawBody,
        rawExt: ext,
      })

      const result = truncateContent(summary)
      const durationMs = Date.now() - start
      const rawArtifact = await trySaveRaw(response.finalUrl, rawBody, ext)
      const rawShape = analyzeRawBodyShape(rawBody, ext)

      return formatOutput({
        bytes,
        code: response.code,
        codeText: response.codeText,
        result,
        durationMs,
        url: response.finalUrl,
        prompt,
        rawArtifact,
        rawShape,
      })
    } catch (error) {
      clearTimeout(timer)
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('abort') || message.includes('AbortError')) {
        return `Error: Request timed out after ${FETCH_TIMEOUT_MS / 1000}s for ${url}`
      }
      return `Error fetching ${url}: ${message}`
    }
  },
})

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatOutput(params: {
  bytes: number
  code: number
  codeText: string
  result: string
  durationMs: number
  url: string
  prompt: string
  rawArtifact: SavedRawArtifact | undefined
  rawShape: RawBodyShape
}): string {
  const { bytes, code, codeText, result, durationMs, url, prompt, rawArtifact, rawShape } = params

  const header = `Fetched ${url} (${code} ${codeText}, ${formatBytes(bytes)}, ${durationMs}ms)`
  const promptLine = `Prompt: ${prompt}`

  // Shape metadata helps the model pick the right tool for follow-up analysis
  // (Read/Grep for normal text, Bash grep/sed for minified/compressed single-line files).
  const shapeLine = rawShape.lines > 0
    ? `Raw shape → lines=${rawShape.lines}, maxLineLength=${rawShape.maxLineLength}, isMinified=${rawShape.isMinified}`
    : undefined
  const rawLine = rawArtifact
    ? `Raw saved → ${rawArtifact.relPath} (${formatBytes(rawArtifact.bytes)})`
    : 'Raw saved → (unavailable: no active session)'

  const minifiedHint = rawShape.isMinified
    ? '\n\n## ⚠️ Minified/compressed raw file detected\n' +
      `This file has only ${rawShape.lines} line(s) with the longest line being ${rawShape.maxLineLength} chars. ` +
      'Read/Grep will struggle — single-line content gets truncated or yields misleading matches. ' +
      'Prefer `Bash` with line-tokenizing commands:\n' +
      '- Extract all src/href: `grep -oE \'(src|href)="[^"]+"\' file | sort -u`\n' +
      '- Split by tag delimiter then filter: `tr "<>" "\\n\\n" < file | grep -i "^script"`\n' +
      '- Slice a byte range: `cut -c 1-2000 file` / `dd if=file bs=1 skip=N count=M`'
    : ''

  const tip =
    '## Tip\nThe Summary above is a lossy extraction (HTML→Markdown). If you need raw structure ' +
    '(e.g. `<script>/<link>/<meta>` tags, attributes, DOM layout), Read/Grep the Raw file directly.'

  const headerBlock = [header, promptLine, rawLine, shapeLine].filter(Boolean).join('\n')
  return `${headerBlock}${minifiedHint}\n\n## Summary\n${result}\n\n${tip}`
}

