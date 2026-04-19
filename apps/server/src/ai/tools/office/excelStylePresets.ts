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
 * Financial-model style presets.
 *
 * Colour choices follow industry convention for financial models:
 *   HEADER     — dark fill + white bold font + bottom border (column titles)
 *   TOTAL      — top + bottom border, bold (totals / subtotals)
 *   INPUT      — blue font on white (user-editable inputs)
 *   ASSUMPTION — yellow fill (assumption cells to be highlighted)
 *
 * These map 1:1 to `StylePreset` in packages/api/src/types/tools/excel.ts.
 */
import type { CellStyleObject } from '@openloaf/api/types/tools/excel'

export type StylePresetName = 'HEADER' | 'TOTAL' | 'INPUT' | 'ASSUMPTION'

export function resolvePreset(name: StylePresetName): CellStyleObject {
  switch (name) {
    case 'HEADER':
      return {
        font: { bold: true, color: 'FFFFFF' },
        fill: '1F2937',
        align: 'center',
        border: { bottom: { style: 'medium', color: '000000' } },
      }
    case 'TOTAL':
      return {
        font: { bold: true },
        border: {
          top: { style: 'thin', color: '000000' },
          bottom: { style: 'double', color: '000000' },
        },
      }
    case 'INPUT':
      return {
        font: { color: '1D4ED8' },
      }
    case 'ASSUMPTION':
      return {
        fill: 'FEF3C7',
        font: { color: '92400E' },
      }
  }
}
