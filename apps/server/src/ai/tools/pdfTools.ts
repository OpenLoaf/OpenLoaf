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
 * PdfInspect — read-only PDF analysis (8 actions).
 * Write operations were removed; all PDF creation / editing now goes through
 * `JsSandbox` with the preinstalled `pdf-lib` / `pdfkit` / `pdf-parse`
 * packages (see builtin-skills/pdf for demo scripts).
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { pdfInspectToolDef } from '@openloaf/api/types/tools/pdf'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import {
  inspectSummary,
  inspectText,
  inspectFormFieldsDetailed,
  inspectFormStructure,
  inspectImages,
  inspectAnnotations,
  inspectTables,
  renderPdfPages,
  PdfEncryptedError,
} from '@/ai/tools/office/pdfInspectEngine'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

type InspectInput = {
  action:
    | 'summary'
    | 'text'
    | 'tables'
    | 'form-fields'
    | 'form-structure'
    | 'images'
    | 'annotations'
    | 'render'
  filePath: string
  pageRange?: string
  password?: string
  withCoords?: boolean
  extractImages?: boolean
  scale?: number
  withRender?: boolean
  sampleSize?: number
}

async function resolveInspectAssetDir(filePath: string): Promise<{
  assetDirAbsPath: string
  assetRelPrefix: string
}> {
  const sessionId = getSessionId()
  if (!sessionId) {
    throw new Error(
      'PdfInspect render / extractImages / withRender requires an active chat session to write PNG assets.',
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
// PdfInspect
// ---------------------------------------------------------------------------

export const pdfInspectTool = tool({
  description: pdfInspectToolDef.description,
  inputSchema: zodSchema(pdfInspectToolDef.parameters),
  execute: async (input) => {
    const {
      action,
      filePath,
      pageRange,
      password,
      withCoords,
      extractImages,
      scale,
      withRender,
      sampleSize,
    } = input as InspectInput

    const absPath = await resolveOfficeFile(filePath, ['.pdf'])

    try {
      switch (action) {
        case 'summary': {
          const data = await inspectSummary(absPath, { password, sampleSize })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'text': {
          const data = await inspectText(absPath, { pageRange, withCoords, password })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'form-fields': {
          const fields = await inspectFormFieldsDetailed(absPath, { password })
          let renders
          if (withRender) {
            const pages = Array.from(
              new Set(fields.map((f) => f.page).filter((n): n is number => typeof n === 'number')),
            ).sort((a, b) => a - b)
            if (pages.length > 0) {
              const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
              const min = pages[0]!
              const max = pages[pages.length - 1]!
              const rendered = await renderPdfPages(absPath, `${min}-${max}`, {
                scale: scale ?? 2,
                password,
                assetDirAbsPath,
                assetRelPrefix,
              })
              renders = rendered.pages
            }
          }
          return {
            ok: true,
            data: { action, filePath: absPath, fields, renders },
          }
        }

        case 'form-structure': {
          const data = await inspectFormStructure(absPath, { pageRange, password })
          let renders
          if (withRender) {
            const pagesSet = new Set<number>()
            data.labels.forEach((l) => pagesSet.add(l.page))
            data.checkboxes.forEach((c) => pagesSet.add(c.page))
            data.lines.forEach((l) => pagesSet.add(l.page))
            const pages = Array.from(pagesSet).sort((a, b) => a - b)
            if (pages.length > 0) {
              const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
              const min = pages[0]!
              const max = pages[pages.length - 1]!
              const rendered = await renderPdfPages(absPath, `${min}-${max}`, {
                scale: scale ?? 2,
                password,
                assetDirAbsPath,
                assetRelPrefix,
              })
              renders = rendered.pages
            }
          }
          return {
            ok: true,
            data: { action, filePath: absPath, ...data, renders },
          }
        }

        case 'images': {
          let assetDirAbsPath: string | undefined
          let assetRelPrefix: string | undefined
          if (extractImages) {
            const resolved = await resolveInspectAssetDir(filePath)
            assetDirAbsPath = resolved.assetDirAbsPath
            assetRelPrefix = resolved.assetRelPrefix
          }
          const data = await inspectImages(absPath, {
            pageRange,
            extract: extractImages,
            password,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'annotations': {
          const data = await inspectAnnotations(absPath, { pageRange, password })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'tables': {
          const data = await inspectTables(absPath, { pageRange, password })
          let renders
          if (withRender && data.tables.length > 0) {
            const pages = Array.from(new Set(data.tables.map((t) => t.page))).sort((a, b) => a - b)
            const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
            const min = pages[0]!
            const max = pages[pages.length - 1]!
            const rendered = await renderPdfPages(absPath, `${min}-${max}`, {
              scale: scale ?? 2,
              password,
              assetDirAbsPath,
              assetRelPrefix,
            })
            renders = rendered.pages
          }
          return {
            ok: true,
            data: { action, filePath: absPath, ...data, renders },
          }
        }

        case 'render': {
          if (!pageRange) {
            throw new Error('action=render requires `pageRange` (e.g. "1-5" or "3").')
          }
          const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
          const data = await renderPdfPages(absPath, pageRange, {
            scale,
            password,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        default:
          throw new Error(`Unknown action: ${action}`)
      }
    } catch (err) {
      if (err instanceof PdfEncryptedError) {
        return {
          ok: false as const,
          error: 'PDF_ENCRYPTED',
          message:
            'PDF is encrypted. Provide the `password` argument, or use JsSandbox with pdf-lib `PDFDocument.load(buf, { password })` to decrypt.',
          data: { filePath: absPath },
        }
      }
      throw err
    }
  },
})
