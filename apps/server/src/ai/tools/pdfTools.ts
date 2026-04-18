/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import {
  pdfMutateToolDef,
  pdfInspectToolDef,
} from '@openloaf/api/types/tools/pdf'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import {
  createPdf,
  fillPdfForm,
  mergePdfs,
  addTextOverlays,
} from '@/ai/tools/office/pdfEngine'
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
import type { PdfContentItem, PdfTextOverlay } from '@/ai/tools/office/types'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'

// ---------------------------------------------------------------------------
// PDF Mutate Tool — write operations (create / fill-form / merge / add-text)
// ---------------------------------------------------------------------------

export const pdfMutateTool = tool({
  description: pdfMutateToolDef.description,
  inputSchema: zodSchema(pdfMutateToolDef.parameters),
  execute: async (input) => {
    const { action, filePath, content, fields, sourcePaths, overlays } = input as {
      action: string
      filePath: string
      content?: PdfContentItem[]
      fields?: Record<string, string>
      sourcePaths?: string[]
      overlays?: PdfTextOverlay[]
    }

    switch (action) {
      case 'create': {
        if (!content || content.length === 0) {
          throw new Error('content is required for create action.')
        }
        const { absPath } = resolveToolPath({ target: filePath })
        const result = await createPdf(absPath, content)
        return {
          ok: true,
          data: { action, filePath: absPath, ...result },
        }
      }

      case 'fill-form': {
        if (!fields || Object.keys(fields).length === 0) {
          throw new Error('fields is required for fill-form action.')
        }
        const absPath = await resolveOfficeFile(filePath, ['.pdf'])
        const result = await fillPdfForm(absPath, fields)
        return {
          ok: true,
          data: { action, filePath: absPath, ...result },
        }
      }

      case 'merge': {
        if (!sourcePaths || sourcePaths.length === 0) {
          throw new Error('sourcePaths is required for merge action.')
        }
        const { absPath } = resolveToolPath({ target: filePath })
        // Resolve all source paths
        const resolvedSources: string[] = []
        for (const src of sourcePaths) {
          const resolved = await resolveOfficeFile(src, ['.pdf'])
          resolvedSources.push(resolved)
        }
        const result = await mergePdfs(absPath, resolvedSources)
        return {
          ok: true,
          data: { action, filePath: absPath, ...result },
        }
      }

      case 'add-text': {
        if (!overlays || overlays.length === 0) {
          throw new Error('overlays is required for add-text action.')
        }
        const absPath = await resolveOfficeFile(filePath, ['.pdf'])
        const result = await addTextOverlays(absPath, overlays)
        return {
          ok: true,
          data: { action, filePath: absPath, ...result },
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  },
})

// ---------------------------------------------------------------------------
// PDF Inspect Tool — read-only analysis (summary / text / tables / form-fields
// / form-structure / images / annotations / render)
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

/** Compute the per-file asset dir and ensure the session context is present. */
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

/** Small helper: wrap any PdfEncryptedError into a typed payload instead of throwing. */
function encryptedPayload(filePath: string) {
  return {
    ok: false as const,
    error: 'PDF_ENCRYPTED',
    message:
      'PDF is encrypted. Provide the `password` argument, or call PdfMutate(decrypt) to produce an unlocked copy.',
    data: { filePath },
  }
}

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
              const rendered = await renderPdfPages(absPath, pages.join(','), {
                // pageRange string accepts a single range — render each page separately.
                // Simpler: render min..max which matches `1-5` style semantics.
                scale: scale ?? 2,
                password,
                assetDirAbsPath,
                assetRelPrefix,
              }).catch(async () => {
                // Fallback: render contiguous min..max if the comma-list fails.
                const min = pages[0]!
                const max = pages[pages.length - 1]!
                return renderPdfPages(absPath, `${min}-${max}`, {
                  scale: scale ?? 2,
                  password,
                  assetDirAbsPath,
                  assetRelPrefix,
                })
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
        return encryptedPayload(absPath)
      }
      throw err
    }
  },
})
