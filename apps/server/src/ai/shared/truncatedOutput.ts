/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Shared template for presenting truncated tool output to the model.
 *
 * Any tool that trims its output before returning to the message stream should
 * use this module so the format stays consistent — a leading guidance line, the
 * preview body, and a trailing marker that explicitly flags what was omitted
 * (so the model doesn't mistake the slice for a complete document).
 *
 * Two entry points:
 *
 *   - `buildTruncatedOutputBlock` — full `<truncated-output>` block for the
 *     tool-result interception layer, which persists the full text to disk
 *     and returns a preview wrapped in the tag.
 *
 *   - `formatTruncationTrailer` — just the trailing marker, for tools that
 *     embed previews inline inside a larger payload (e.g. jsSandbox stdout
 *     inside a JSON result). No wrapper tag, no leading guidance.
 */

/** XML tag name used to wrap truncated tool output in the message stream. */
export const TRUNCATED_OUTPUT_TAG = 'truncated-output'

export interface TruncationBlockOptions {
  /** Full text. If ≤ previewLength the block is skipped and `truncated` is false. */
  fullText: string
  /** Max preview length in characters. */
  previewLength: number
  /** Absolute path to the persisted full output, enables the Read() next-section hint. */
  persistedPath?: string
}

export interface TruncationBlockResult {
  /** Final content: either the full text (no wrapping) or a `<truncated-output>` block. */
  content: string
  /** True when the original text exceeded previewLength and was trimmed. */
  truncated: boolean
  /** Original text length in characters. */
  originalLength: number
}

export interface TruncationTrailerOptions {
  /** Number of characters omitted after the preview. */
  remaining: number
  /** Path to the full file, if available — enables the Read() hint. */
  persistedPath?: string
  /**
   * Line number where the next section starts in the persisted file.
   * Used as `Read(offset=…)` in the hint. Only consulted when `persistedPath`
   * is set. Callers usually pass `preview.split('\n').length`.
   */
  nextLineOffset?: number
}

/**
 * Render the leading guidance line that goes at the top of a truncated block.
 * Non-negative framing: describe what the model has + how to get more, avoid
 * "truncated/lost" wording that triggers retry loops.
 */
function formatTruncationGuidance(previewLength: number, originalLength: number, persistedPath?: string): string {
  return persistedPath
    ? `[Preview: first ${previewLength} of ${originalLength} chars. Full output saved to ${persistedPath} — use Read(file_path="${persistedPath}", offset, limit) to view other sections if the preview below is not enough. Often the preview already contains what you need.]`
    : `[Preview: first ${previewLength} of ${originalLength} chars. Often the preview already contains what you need; only request more if the answer is clearly not present.]`
}

/**
 * Render the trailing marker that closes a truncated preview.
 * Explicitly states how many chars were omitted and, when a persisted file is
 * available, points at the next `Read(offset=N)` section.
 */
export function formatTruncationTrailer(opts: TruncationTrailerOptions): string {
  const { remaining, persistedPath, nextLineOffset } = opts
  if (persistedPath && typeof nextLineOffset === 'number') {
    return `[... ${remaining} more chars not shown. Read(file_path="${persistedPath}", offset=${nextLineOffset}) for the next section.]`
  }
  return `[... ${remaining} more chars not shown.]`
}

/**
 * Build a complete `<truncated-output>` block wrapping a preview slice.
 * When `fullText.length <= previewLength`, returns the original text verbatim
 * with `truncated: false` — safe to call unconditionally.
 */
export function buildTruncatedOutputBlock(opts: TruncationBlockOptions): TruncationBlockResult {
  const { fullText, previewLength, persistedPath } = opts
  const originalLength = fullText.length
  if (originalLength <= previewLength) {
    return { content: fullText, truncated: false, originalLength }
  }

  const preview = fullText.slice(0, previewLength)
  const remaining = originalLength - preview.length
  const previewLineCount = preview.split('\n').length
  const pathAttr = persistedPath ? ` path="${persistedPath}"` : ''

  const guidance = formatTruncationGuidance(preview.length, originalLength, persistedPath)
  const trailer = formatTruncationTrailer({
    remaining,
    persistedPath,
    nextLineOffset: persistedPath ? previewLineCount : undefined,
  })

  const content = `<${TRUNCATED_OUTPUT_TAG}${pathAttr} original-length="${originalLength}">\n${guidance}\n\n${preview}\n${trailer}\n</${TRUNCATED_OUTPUT_TAG}>`
  return { content, truncated: true, originalLength }
}
