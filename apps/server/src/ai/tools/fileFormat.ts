/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Shared formatter for Read / DocPreview — wraps a FileContentResult into the
 * unified `<system-tag type="fileInfo" toolName="...">` header + raw body
 * string that the model consumes.
 *
 * Extracted from fileTools.ts so docPreviewTools.ts can reuse it without
 * importing from fileTools (which would create a circular import).
 */
import type { FileContentResult } from '@/ai/tools/office/types'

/** Escape a string for safe inclusion in an XML attribute value. */
export function xmlAttrEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export type FormatOptions = {
  /**
   * `raw` = literal source content (editable with Edit/Write).
   * `derived` = extracted / rendered view; source cannot be edited with Edit/Write.
   * Defaults to `raw` for backwards compat with callers that don't opt in.
   */
  readMode?: 'raw' | 'derived'
  /** For derived reads: tool that can mutate the source file. */
  mutateTool?: string
  /** The tool name emitted in <system-tag toolName="..."> (defaults to 'Read'). */
  toolName?: string
  /**
   * Optional suggest-skill block to append inside <system-tag>. Used by the
   * Read tool for media files to point the model at cloud-media-skill without
   * forcibly loading it.
   */
  suggestSkill?: {
    skill: string
    reason: string
    body: string
  }
}

/**
 * Wrap a FileContentResult into the unified XML-tagged string for the model.
 */
export function formatFileResult(
  result: FileContentResult,
  fileName: string,
  mimeType: string,
  bytes: number,
  opts: FormatOptions = {},
): string {
  const readMode = opts.readMode ?? 'raw'
  const toolName = opts.toolName ?? 'Read'
  const attrs = [
    `name="${xmlAttrEscape(fileName)}"`,
    `type="${result.type}"`,
    `mimeType="${xmlAttrEscape(mimeType)}"`,
    `bytes="${bytes}"`,
    `readMode="${readMode}"`,
  ]
  if (readMode === 'derived') {
    attrs.push('editable="false"')
    if (opts.mutateTool) attrs.push(`mutateTool="${xmlAttrEscape(opts.mutateTool)}"`)
  }

  const { error: metaError, ...cleanMeta } = result.meta as { error?: unknown } & Record<
    string,
    unknown
  >
  const errorReason = typeof metaError === 'string' ? metaError : undefined

  const header: string[] = [
    `<system-tag type="fileInfo" toolName="${xmlAttrEscape(toolName)}">`,
    `<file ${attrs.join(' ')} />`,
    `<meta>${JSON.stringify(cleanMeta)}</meta>`,
  ]
  if (readMode === 'derived') {
    const hint = opts.mutateTool
      ? `This is a rendered view of a ${result.type.toUpperCase()} file. Edit/Write cannot modify the source — use \`${opts.mutateTool}\` for structural edits. For archives, Read individual files inside the extracted folder.`
      : `This is a rendered view / extracted metadata. Edit/Write cannot modify the source file. For archives, Read individual files inside the extracted folder; for media, regenerate via media generation tools.`
    header.push(`<note>${xmlAttrEscape(hint)}</note>`)
  }
  if (opts.suggestSkill) {
    const { skill, reason, body } = opts.suggestSkill
    header.push(
      `<suggest skill="${xmlAttrEscape(skill)}" reason="${xmlAttrEscape(reason)}">${xmlAttrEscape(body)}</suggest>`,
    )
  }
  if (result.truncated) header.push('<truncated reason="output exceeded size limit" />')

  if (result.fallbackPath) {
    header.push(
      `<fallback path="${xmlAttrEscape(result.fallbackPath)}">This file could not be parsed. The original has been copied to the asset dir for manual inspection.</fallback>`,
    )
    header.push('</system-tag>')
    return header.join('\n')
  }
  if (errorReason && result.content.length === 0) {
    header.push(`<error>${xmlAttrEscape(errorReason)}</error>`)
    header.push('</system-tag>')
    return header.join('\n')
  }
  header.push('</system-tag>')
  return `${header.join('\n')}\n${result.content}`
}
