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
 * ExcelInspect + ExcelMutate — v2 tool surface.
 *
 * Architecture:
 *   - Schemas + tool defs live in `@openloaf/api/types/tools/excel`.
 *   - Read-side logic lives in `office/excelInspectEngine.ts`.
 *   - Write-side logic lives in `office/excelEngine.ts::applyMutate` plus
 *     `office/excelRecalc.ts::recalc` for the `recalc` action.
 *   - This module is a thin dispatcher: resolve file path → validate input →
 *     call engine → map engine errors to `{ ok:false, code, message, hint? }`.
 *
 * Error-code surface (mirror of SKILL.md §9):
 *   VALUE_FORMULA_CONFLICT / SHEET_NOT_FOUND / MERGED_CELL_WRITE /
 *   PROTECTED_WORKBOOK / CHART_RANGE_INVALID / STRUCTURE_OP_INVALID /
 *   IMAGE_READ_FAILED / LIBREOFFICE_UNAVAILABLE / FORMULA_ERRORS_FOUND /
 *   CROSS_FILE_REF_IGNORED (warn) / CSV_UPGRADE_TO_XLSX (meta only).
 *
 * Path rules:
 *   - `create`: writes a NEW file → `resolveCreateTargetPath` (scoped to
 *     session asset dir or project root).
 *   - all other mutate actions + inspect: `resolveToolPath` (any abs path
 *     inside the writable scope).
 */

import path from 'node:path'
import { tool, zodSchema } from 'ai'
import {
  excelInspectToolDef,
  type ExcelInspectInput,
} from '@openloaf/api/types/tools/excel'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import {
  inspectSummary,
  inspectRead,
  inspectTables,
  inspectImages,
  inspectRender,
  ExcelLibreOfficeUnavailableError,
} from '@/ai/tools/office/excelInspectEngine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FailureShape {
  ok: false
  code: string
  message: string
  hint?: string
  data: { filePath: string }
}

function failure(
  code: string,
  message: string,
  filePath: string,
  hint?: string,
): FailureShape {
  const out: FailureShape = {
    ok: false,
    code,
    message,
    data: { filePath },
  }
  if (hint) out.hint = hint
  return out
}

/**
 * Resolve (and create if needed) the session-scoped asset directory used by
 * inspect actions that emit files (images extraction, render).
 */
async function resolveInspectAssetDir(filePath: string): Promise<{
  assetDirAbsPath: string
  assetRelPrefix: string
}> {
  const sessionId = getSessionId()
  if (!sessionId) {
    throw new Error(
      'ExcelInspect render / extractImages requires an active chat session to write assets.',
    )
  }
  const assetRoot = await resolveSessionAssetDir(sessionId)
  const baseName = path.basename(filePath, path.extname(filePath))
  const safeName = baseName.replace(/[^\w\u4e00-\u9fff.-]/g, '_') || 'file'
  const assetRelPrefix = `${safeName}_asset`
  const assetDirAbsPath = path.join(assetRoot, assetRelPrefix)
  return { assetDirAbsPath, assetRelPrefix }
}

// ---------------------------------------------------------------------------
// ExcelInspect
// ---------------------------------------------------------------------------

export const excelInspectTool = tool({
  description: excelInspectToolDef.description,
  inputSchema: zodSchema(excelInspectToolDef.parameters),
  execute: async (input) => {
    const i = input as ExcelInspectInput
    const { absPath } = resolveToolPath({ target: i.filePath })

    try {
      switch (i.action) {
        case 'summary': {
          const data = await inspectSummary({ filePath: absPath })
          return {
            ok: true as const,
            data: { action: 'summary', filePath: absPath, ...data },
          }
        }

        case 'read': {
          const data = await inspectRead({
            filePath: absPath,
            scope: i.scope,
            sheetName: i.sheetName,
            range: i.range,
            limit: i.limit,
            offset: i.offset,
            all: i.all,
            where: i.where,
            groupBy: i.groupBy,
          })
          return {
            ok: true as const,
            data: { action: 'read', filePath: absPath, ...data },
          }
        }

        case 'tables': {
          const data = await inspectTables({ filePath: absPath })
          return {
            ok: true as const,
            data: { action: 'tables', filePath: absPath, ...data },
          }
        }

        case 'images': {
          let assetDirAbsPath = ''
          let assetRelPrefix = ''
          if (i.extractImages) {
            const resolved = await resolveInspectAssetDir(i.filePath)
            assetDirAbsPath = resolved.assetDirAbsPath
            assetRelPrefix = resolved.assetRelPrefix
          }
          const data = await inspectImages({
            filePath: absPath,
            extractImages: i.extractImages,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return {
            ok: true as const,
            data: { action: 'images', filePath: absPath, ...data },
          }
        }

        case 'render': {
          const { assetDirAbsPath, assetRelPrefix } =
            await resolveInspectAssetDir(i.filePath)
          const data = await inspectRender({
            filePath: absPath,
            sheetName: i.sheetName,
            range: i.range,
            scale: i.scale,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return {
            ok: true as const,
            data: { action: 'render', filePath: absPath, ...data },
          }
        }

        default: {
          const _exhaust: never = i
          throw new Error(
            `Unknown action: ${String((_exhaust as { action: string }).action)}`,
          )
        }
      }
    } catch (err) {
      // LIBREOFFICE unavailable surfaces as ok:false (soft) so callers can
      // recover (e.g. fall back to non-render preview).
      if (err instanceof ExcelLibreOfficeUnavailableError) {
        return failure('LIBREOFFICE_UNAVAILABLE', err.message, absPath)
      }
      // SHEET_NOT_FOUND bubble from inspectRead — same soft shape.
      const msg = err instanceof Error ? err.message : String(err)
      if (/^SHEET_NOT_FOUND/.test(msg) || /SHEET_NOT_FOUND:/.test(msg)) {
        return failure('SHEET_NOT_FOUND', msg, absPath)
      }
      throw err
    }
  },
})

// ExcelMutate was removed — Excel write operations now go through JsSandbox
// using the preinstalled `exceljs` / `xlsx` packages. See builtin-skills/xlsx
// for demo scripts.
