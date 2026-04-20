/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

/**
 * Auto-parse JSON strings into arrays (some LLMs serialize array params as strings).
 *
 * When parse fails, surface the JSON syntax error with the exact position and a
 * ±40 char snippet so the model's next retry can see *why* the string was rejected
 * (typical miss: full-width brackets like "（" used in place of JSON delimiters).
 * Without this, Zod only reports "expected array, received string" and the model
 * keeps guessing.
 */
export const jsonArrayPreprocess = (
  val: unknown,
  ctx: z.core.$RefinementCtx,
): unknown => {
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Node's SyntaxError sometimes includes a char position, sometimes doesn't —
    // depends on runtime version. Treat both, and always include a head snippet
    // of the string so the model can see the first few items it tried to pass.
    const posMatch = msg.match(/position (\d+)/i)
    const pos = posMatch ? Number(posMatch[1]) : -1
    const start = pos >= 0 ? Math.max(0, pos - 40) : 0
    const end =
      pos >= 0 ? Math.min(val.length, pos + 40) : Math.min(val.length, 120)
    const snippet = val.slice(start, end)
    ctx.addIssue(
      `Parameter was passed as a JSON string but JSON.parse failed: ${msg}. ` +
        `Context near error: "${snippet}${end < val.length ? '...' : ''}". ` +
        'Fix by passing the parameter as a real array (e.g. [{...}, {...}]) instead of a JSON-encoded string. ' +
        'If you must pass a string, the entire string must be valid JSON — use ASCII double quotes for JSON string values; full-width punctuation like "（" or "＂" is not a valid JSON delimiter.',
    )
    return z.NEVER
  }
}

/**
 * Auto-coerce stringified booleans ("true" / "false" / "1" / "0") into real
 * booleans. Some LLMs insist on serializing primitives as strings; without
 * this the zod check rejects them with "expected boolean, got string" and
 * wastes a retry.
 */
export const stringBoolPreprocess = (val: unknown): unknown => {
  if (typeof val !== 'string') return val
  const t = val.trim().toLowerCase()
  if (t === 'true' || t === '1') return true
  if (t === 'false' || t === '0') return false
  return val
}

/**
 * Auto-coerce stringified numbers ("500" / "1.5") into real numbers.
 * Mirrors stringBoolPreprocess for the same LLM-stringification pitfall.
 */
export const stringNumberPreprocess = (val: unknown): unknown => {
  if (typeof val !== 'string') return val
  const t = val.trim()
  if (t === '') return val
  const n = Number(t)
  return Number.isFinite(n) ? n : val
}

/** Shared edit operation schema for Office documents (DOCX/XLSX/PPTX). */
export const officeEditSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('replace'),
    path: z.string().describe('ZIP entry path, e.g. "word/document.xml".'),
    xpath: z.string(),
    xml: z.string(),
  }),
  z.object({
    op: z.literal('insert'),
    path: z.string().describe('ZIP entry path.'),
    xpath: z.string(),
    position: z.enum(['before', 'after']),
    xml: z.string(),
  }),
  z.object({
    op: z.literal('remove'),
    path: z.string().describe('ZIP entry path.'),
    xpath: z.string(),
  }),
  z.object({
    op: z.literal('write'),
    path: z.string().describe('ZIP entry path, e.g. "word/media/logo.png".'),
    source: z.string().describe('Source file path or HTTP(S) URL.'),
  }),
  z.object({
    op: z.literal('delete'),
    path: z.string().describe('ZIP entry path.'),
  }),
])
