/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * WebFetch tool — fetches a URL, extracts relevant content, returns summary.
 *
 * Pipeline:
 *   1. URL validation → http→https upgrade → LRU cache check
 *   2. fetch with manual redirect following (same-host only, max 10)
 *   3. Content-type branching:
 *      - Binary (PDF/image/...) → persist to disk, return descriptive text
 *      - Text → UTF-8 decode → HTML→Markdown via Turndown (lazy-loaded)
 *   4. Auxiliary model analysis (for HTML): lightweight model extracts
 *      relevant info based on user prompt, stripping nav/ads/footers
 *   5. Structured content (Markdown/JSON under 20K) skips auxiliary model
 *   6. Raw body persisted to session asset dir for direct Read/Grep access
 */
import { tool, zodSchema } from 'ai'
import { webFetchToolDef } from '@openloaf/api/types/tools/webFetch'
import { LRUCache } from 'lru-cache'
import {
  type SavedRawArtifact,
  formatBytes,
  hostSlug,
  saveRawArtifact,
  timestampPrefix,
} from '@/ai/tools/shared/saveRawArtifact'
import { CAPABILITY_SCHEMAS } from '@/ai/services/auxiliaryCapabilities'
import { createToolProgress } from '@/ai/tools/toolProgress'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HTTP request timeout — reduced from 60s to leave 10s budget for auxiliary model. */
const FETCH_TIMEOUT_MS = 50_000
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024 // 10MB
const MAX_REDIRECTS = 10
/** Max input to auxiliary model (~15-20K tokens). */
const MAX_AUXILIARY_INPUT = 60_000
/** Max content returned when auxiliary model is skipped (aligns with interceptor threshold). */
const MAX_DIRECT_CONTENT = 20_000
const MAX_URL_LENGTH = 2000

const USER_AGENT = 'OpenLoaf/1.0 (web-fetch; +https://github.com/OpenLoaf/OpenLoaf)'

// ---------------------------------------------------------------------------
// Content-type detection (modeled after Claude Code's isBinaryContentType)
// ---------------------------------------------------------------------------

/**
 * Returns true for content types that are textual and can be safely UTF-8 decoded.
 * Everything else is considered binary (PDF, images, audio, video, archives, etc.).
 */
function isTextContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase()
  return (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('+json') ||
    ct.includes('application/xml') ||
    ct.includes('+xml') ||
    ct.includes('application/javascript') ||
    ct.includes('application/x-www-form-urlencoded')
  )
}

/** Map common MIME types to file extensions for binary persistence. */
function mimeToExtension(contentType: string): string {
  const ct = (contentType.toLowerCase().split(';')[0] ?? '').trim()
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/zip': 'zip',
    'application/gzip': 'gz',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  }
  return map[ct] ?? 'bin'
}

// ---------------------------------------------------------------------------
// URL Cache (LRU — 15min TTL, ~50MB total)
// ---------------------------------------------------------------------------

interface CachedContent {
  /** Processed content — auxiliary model summary or direct text. */
  content: string
  contentType: string
  finalUrl: string
  code: number
  codeText: string
  /** Original HTTP response byte count. */
  bytes: number
  /** File extension derived from content-type. */
  rawExt: string
  /** Pre-computed raw body shape (cached to avoid re-analysis on cache hit). */
  shape: RawBodyShape
  /** Whether the response was binary (PDF, image, etc.). */
  isBinary: boolean
}

const URL_CACHE = new LRUCache<string, CachedContent>({
  max: 200,
  ttl: 15 * 60 * 1000, // 15 minutes
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (entry) => Buffer.byteLength(entry.content) || 1,
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
// Content processing — text path (UTF-8 decodable content)
// ---------------------------------------------------------------------------

async function processTextContent(
  text: string,
  contentType: string,
): Promise<{ content: string; ext: string }> {
  if (contentType.includes('application/json')) {
    let content: string
    try {
      content = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      content = text
    }
    return { content, ext: 'json' }
  }

  if (contentType.includes('text/html')) {
    let content: string
    try {
      const td = await getTurndownService()
      content = td.turndown(text)
    } catch {
      // Fallback: strip HTML tags
      content = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    return { content, ext: 'html' }
  }

  if (contentType.includes('text/markdown')) {
    return { content: text, ext: 'md' }
  }

  // text/plain, text/csv, etc.
  return { content: text, ext: 'txt' }
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '\n\n[Content truncated due to length...]'
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
// Computed once per fetch and cached in CachedContent to avoid re-analysis.
// ---------------------------------------------------------------------------

interface RawBodyShape {
  lines: number
  maxLineLength: number
  isMinified: boolean
}

const EMPTY_SHAPE: RawBodyShape = { lines: 0, maxLineLength: 0, isMinified: false }

function analyzeRawBodyShape(text: string): RawBodyShape {
  if (!text) return EMPTY_SHAPE
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
  if (text.endsWith('\n')) lineCount = Math.max(1, lineCount - 1)
  const isMinified = lineCount < 20 && maxLen > 5000
  return { lines: lineCount, maxLineLength: maxLen, isMinified }
}

// ---------------------------------------------------------------------------
// Auxiliary model analysis — uses lightweight model to extract relevant info
// from noisy HTML content (nav bars, ads, footers stripped).
// ---------------------------------------------------------------------------

/**
 * Determine whether auxiliary model analysis should be skipped.
 * Skip for structured content (Markdown, JSON) under the direct-content limit,
 * since these are already clean and don't benefit from a second pass.
 */
function shouldSkipAnalysis(contentType: string, contentLength: number): boolean {
  const ct = contentType.toLowerCase()
  const isStructured = ct.includes('text/markdown') || ct.includes('application/json') || ct.includes('+json')
  return isStructured && contentLength < MAX_DIRECT_CONTENT
}

/**
 * Apply auxiliary model to extract relevant information from web content.
 * Falls back to truncated original on any failure (timeout, model unavailable).
 */
async function applyPromptToContent(
  content: string,
  prompt: string,
  url: string,
): Promise<string> {
  const { auxiliaryInfer } = await import('@/ai/services/auxiliaryInferenceService')

  const truncated = truncateContent(content, MAX_AUXILIARY_INPUT)
  const fallbackContent = truncateContent(content, MAX_DIRECT_CONTENT)

  const result = await auxiliaryInfer({
    capabilityKey: 'webfetch.extract',
    context: `## Web Page Content\n${truncated}\n\n## Request\n${prompt}\n\n## Source URL\n${url}`,
    schema: CAPABILITY_SCHEMAS['webfetch.extract'],
    fallback: { summary: fallbackContent },
    noCache: false,
    maxTokens: 2048,
  })

  return result.summary
}

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

export const webFetchTool = tool({
  description: webFetchToolDef.description,
  inputSchema: zodSchema(webFetchToolDef.parameters),
  execute: async (input, { toolCallId }): Promise<string> => {
    const { url: rawUrl, prompt } = input as { url: string; prompt: string }
    const progress = createToolProgress(toolCallId, 'WebFetch')
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

    progress.start(`Fetching: ${url}`)

    // 3. Check cache — content is already processed (summary or direct text)
    const cached = URL_CACHE.get(url)
    if (cached) {
      const durationMs = Date.now() - start
      progress.done(`Cached — ${formatBytes(cached.bytes)} in ${durationMs}ms`)
      return formatOutput({
        bytes: cached.bytes,
        code: cached.code,
        codeText: cached.codeText,
        content: cached.content,
        durationMs,
        url: cached.finalUrl,
        prompt,
        shape: cached.shape,
        isBinary: cached.isBinary,
      })
    }

    // 4. Fetch with redirect handling
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetchWithRedirects(url, controller.signal)
      clearTimeout(timer)

      progress.delta(`Connected — processing response...\n`)

      // Cross-host redirect
      if (response.type === 'redirect') {
        const statusText = response.statusCode === 301
          ? 'Moved Permanently'
          : response.statusCode === 308
            ? 'Permanent Redirect'
            : response.statusCode === 307
              ? 'Temporary Redirect'
              : 'Found'

        progress.done(`Redirect → ${response.redirectUrl}`)
        return `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${response.originalUrl}
Redirect URL: ${response.redirectUrl}
Status: ${response.statusCode} ${statusText}

To complete your request, fetch content from the redirected URL using WebFetch again with:
- url: "${response.redirectUrl}"
- prompt: "${prompt}"`
      }

      // 5. Convert ArrayBuffer to Buffer, then release ArrayBuffer
      const bytes = response.body.byteLength
      const rawBody = Buffer.from(response.body)
      // Release the ArrayBuffer copy held by fetch response (saves up to 10MB)
      ;(response as { body: unknown }).body = null

      // 6. Content-type branching: text vs binary
      const isBinary = !isTextContentType(response.contentType)
      let processedContent: string
      let ext: string
      let shape: RawBodyShape

      if (isBinary) {
        // Binary path: persist to disk, return descriptive text (no UTF-8 decode)
        progress.delta(`Binary content: ${response.contentType} (${formatBytes(bytes)})\n`)
        ext = mimeToExtension(response.contentType)
        shape = EMPTY_SHAPE
        const rawArtifact = await trySaveRaw(response.finalUrl, rawBody, ext)
        const rawLine = rawArtifact
          ? `Saved to: ${rawArtifact.relPath} (${formatBytes(rawArtifact.bytes)})`
          : '(failed to save: no active session)'
        processedContent = `Binary content: ${response.contentType} (${formatBytes(bytes)})\n${rawLine}\nUse the Read tool to access this file directly.`
      } else {
        // Text path: decode → process → persist raw → analyze shape → maybe summarize
        const text = new TextDecoder('utf-8', { fatal: false }).decode(rawBody)
        const processed = await processTextContent(text, response.contentType)
        ext = processed.ext
        shape = analyzeRawBodyShape(text)

        // Persist raw body to disk for model's direct inspection
        await trySaveRaw(response.finalUrl, rawBody, ext)

        // 7. Auxiliary model analysis decision
        if (shouldSkipAnalysis(response.contentType, processed.content.length)) {
          // Structured + short → direct pass-through
          processedContent = truncateContent(processed.content, MAX_DIRECT_CONTENT)
        } else {
          // HTML or large content → auxiliary model summarization
          progress.delta(`Analyzing content with auxiliary model...\n`)
          processedContent = await applyPromptToContent(processed.content, prompt, response.finalUrl)
        }
      }

      // 8. Write cache (no rawBody — only processed content + shape)
      URL_CACHE.set(url, {
        content: processedContent,
        contentType: response.contentType,
        finalUrl: response.finalUrl,
        code: response.code,
        codeText: response.codeText,
        bytes,
        rawExt: ext,
        shape,
        isBinary,
      })

      const durationMs = Date.now() - start
      progress.done(`Fetched ${formatBytes(bytes)} in ${durationMs}ms`)
      return formatOutput({
        bytes,
        code: response.code,
        codeText: response.codeText,
        content: processedContent,
        durationMs,
        url: response.finalUrl,
        prompt,
        shape,
        isBinary,
      })
    } catch (error) {
      clearTimeout(timer)
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('abort') || message.includes('AbortError')) {
        progress.error(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
        return `Error: Request timed out after ${FETCH_TIMEOUT_MS / 1000}s for ${url}`
      }
      progress.error(message)
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
  content: string
  durationMs: number
  url: string
  prompt: string
  shape: RawBodyShape
  isBinary: boolean
}): string {
  const { bytes, code, codeText, content, durationMs, url, prompt, shape, isBinary } = params

  const header = `Fetched ${url} (${code} ${codeText}, ${formatBytes(bytes)}, ${durationMs}ms)`
  const promptLine = `Prompt: ${prompt}`

  if (isBinary) {
    return `${header}\n${promptLine}\n\n## Content\n${content}`
  }

  // Shape metadata helps the model pick the right tool for follow-up analysis
  const shapeLine = shape.lines > 0
    ? `Raw shape → lines=${shape.lines}, maxLineLength=${shape.maxLineLength}, isMinified=${shape.isMinified}`
    : undefined

  const minifiedHint = shape.isMinified
    ? '\n\n## Minified/compressed raw file detected\n' +
      `This file has only ${shape.lines} line(s) with the longest line being ${shape.maxLineLength} chars. ` +
      'Read/Grep will struggle — single-line content gets truncated or yields misleading matches. ' +
      'Prefer `Bash` with line-tokenizing commands:\n' +
      '- Extract all src/href: `grep -oE \'(src|href)="[^"]+"\' file | sort -u`\n' +
      '- Split by tag delimiter then filter: `tr "<>" "\\n\\n" < file | grep -i "^script"`\n' +
      '- Slice a byte range: `cut -c 1-2000 file` / `dd if=file bs=1 skip=N count=M`'
    : ''

  const tip =
    '## Tip\nThe content above may be a model-extracted summary. If you need raw structure ' +
    '(e.g. `<script>/<link>/<meta>` tags, attributes, DOM layout), Read/Grep the Raw file in ${CURRENT_CHAT_DIR}/webfetch/ directly.'

  const headerBlock = [header, promptLine, shapeLine].filter(Boolean).join('\n')
  return `${headerBlock}${minifiedHint}\n\n## Summary\n${content}\n\n${tip}`
}

