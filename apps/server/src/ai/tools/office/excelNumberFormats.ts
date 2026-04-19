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
 * Column-name heuristics for auto-suggesting Excel number formats.
 *
 * This is NOT applied implicitly by the engine — skills/callers can use
 * `suggestNumberFormat(headerLabel)` to decide which `numberFormat` to
 * attach to a CellSpec. Keeping it opt-in avoids silent format changes
 * when an AI passes a plain header string.
 */
export const CURRENCY_FORMAT = '¥#,##0;(¥#,##0);-'
export const PERCENT_FORMAT = '0.0%'
export const TEXT_FORMAT = '@'

const CURRENCY_RE = /(收入|金额|价格|成本|revenue|price|amount|cost|\$|¥)/i
const PERCENT_RE = /(率|占比|百分比|%|rate|growth|margin)/i
const TEXT_RE = /(year|年)/i

export function suggestNumberFormat(header: string | null | undefined): string | undefined {
  if (!header) return undefined
  const h = header.trim()
  if (!h) return undefined
  if (PERCENT_RE.test(h)) return PERCENT_FORMAT
  if (CURRENCY_RE.test(h)) return CURRENCY_FORMAT
  if (TEXT_RE.test(h)) return TEXT_FORMAT
  return undefined
}
