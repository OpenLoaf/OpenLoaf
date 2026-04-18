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
  rotatePdfPages,
  cropPdfPages,
  splitPdfByGroups,
  splitPdfAtBreakpoints,
  extractPdfPages,
  decryptPdf,
  optimizePdf,
  watermarkPdfWithText,
  watermarkPdfWithPdf,
  fillPdfVisual,
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
// PdfMutate — 12 write actions
// ---------------------------------------------------------------------------

type MutateInput = {
  action:
    | 'create'
    | 'fill-form'
    | 'fill-visual'
    | 'add-text'
    | 'merge'
    | 'split'
    | 'extract-pages'
    | 'rotate'
    | 'crop'
    | 'watermark'
    | 'decrypt'
    | 'optimize'
  filePath: string
  outputPath?: string
  outputDir?: string
  password?: string

  content?: PdfContentItem[]
  fields?: Record<string, string>
  visualFields?: Array<{
    page: number
    entryBoundingBox: [number, number, number, number]
    text: string
    fontSize?: number
    color?: string
    coordSystem?: 'pdf' | 'image'
    imageWidth?: number
    imageHeight?: number
  }>
  overlays?: PdfTextOverlay[]
  sourcePaths?: string[]

  groupSize?: number
  splitAt?: number[]

  pageRanges?: string

  rotations?: Array<{ page: number; degrees: number }>
  crops?: Array<{ page: number; mediaBox: [number, number, number, number] }>

  watermarkType?: 'text' | 'pdf'
  watermarkText?: string
  watermarkFontSize?: number
  watermarkColor?: string
  watermarkOpacity?: number
  watermarkAngle?: number
  watermarkPdfPath?: string
  watermarkPdfPage?: number
  watermarkPageRange?: string

  linearize?: boolean
}

function encryptedPayload(filePath: string) {
  return {
    ok: false as const,
    error: 'PDF_ENCRYPTED',
    message:
      'PDF is encrypted. Provide the `password` argument, or call PdfMutate(decrypt) to produce an unlocked copy first.',
    data: { filePath },
  }
}

export const pdfMutateTool = tool({
  description: pdfMutateToolDef.description,
  inputSchema: zodSchema(pdfMutateToolDef.parameters),
  execute: async (input) => {
    const i = input as MutateInput

    try {
      switch (i.action) {
        case 'create': {
          if (!i.content || i.content.length === 0) {
            throw new Error('content is required for create.')
          }
          const { absPath } = resolveToolPath({ target: i.filePath })
          const r = await createPdf(absPath, i.content)
          return { ok: true, data: { action: 'create', filePath: absPath, ...r } }
        }

        case 'fill-form': {
          if (!i.fields || Object.keys(i.fields).length === 0) {
            throw new Error('fields is required for fill-form.')
          }
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const r = await fillPdfForm(absPath, i.fields)
          const hint =
            r.skippedFields.length > 0
              ? 'Some fields were skipped. Re-run PdfInspect(form-fields) to get the exact field names and checkedValue / radioOptions values.'
              : undefined
          return { ok: true, data: { action: 'fill-form', filePath: absPath, ...r, hint } }
        }

        case 'fill-visual': {
          if (!i.visualFields || i.visualFields.length === 0) {
            throw new Error('visualFields is required for fill-visual.')
          }
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const r = await fillPdfVisual(absPath, i.visualFields, i.password)
          if (r.errors.length > 0) {
            return {
              ok: false,
              error: 'BBOX_VALIDATION_FAILED',
              message:
                'fill-visual aborted: bounding-box validation failed. Fix the reported overlaps / size issues and retry.',
              data: { action: 'fill-visual', filePath: absPath, errors: r.errors, filledCount: 0 },
            }
          }
          return { ok: true, data: { action: 'fill-visual', filePath: absPath, ...r } }
        }

        case 'add-text': {
          if (!i.overlays || i.overlays.length === 0) {
            throw new Error('overlays is required for add-text.')
          }
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const r = await addTextOverlays(absPath, i.overlays)
          return { ok: true, data: { action: 'add-text', filePath: absPath, ...r } }
        }

        case 'merge': {
          if (!i.sourcePaths || i.sourcePaths.length === 0) {
            throw new Error('sourcePaths is required for merge.')
          }
          const { absPath } = resolveToolPath({ target: i.filePath })
          const resolved: string[] = []
          for (const src of i.sourcePaths) {
            resolved.push(await resolveOfficeFile(src, ['.pdf']))
          }
          const r = await mergePdfs(absPath, resolved)
          return { ok: true, data: { action: 'merge', filePath: absPath, ...r } }
        }

        case 'split': {
          if ((i.groupSize && i.splitAt) || (!i.groupSize && !i.splitAt)) {
            throw new Error('split requires exactly one of `groupSize` or `splitAt`.')
          }
          if (!i.outputDir) throw new Error('outputDir is required for split.')
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const { absPath: absOutDir } = resolveToolPath({ target: i.outputDir })
          const r = i.groupSize
            ? await splitPdfByGroups(absPath, absOutDir, i.groupSize, i.password)
            : await splitPdfAtBreakpoints(absPath, absOutDir, i.splitAt!, i.password)
          return {
            ok: true,
            data: { action: 'split', filePath: absPath, outputDir: absOutDir, ...r },
          }
        }

        case 'extract-pages': {
          if (!i.pageRanges) throw new Error('pageRanges is required for extract-pages.')
          if (!i.outputPath) throw new Error('outputPath is required for extract-pages.')
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const { absPath: absOut } = resolveToolPath({ target: i.outputPath })
          const r = await extractPdfPages(absPath, absOut, i.pageRanges, i.password)
          return {
            ok: true,
            data: { action: 'extract-pages', filePath: absPath, outputPath: absOut, ...r },
          }
        }

        case 'rotate': {
          if (!i.rotations || i.rotations.length === 0) {
            throw new Error('rotations is required for rotate.')
          }
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const r = await rotatePdfPages(absPath, i.rotations, i.password)
          return { ok: true, data: { action: 'rotate', filePath: absPath, ...r } }
        }

        case 'crop': {
          if (!i.crops || i.crops.length === 0) {
            throw new Error('crops is required for crop.')
          }
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const r = await cropPdfPages(absPath, i.crops, i.password)
          return { ok: true, data: { action: 'crop', filePath: absPath, ...r } }
        }

        case 'watermark': {
          if (!i.watermarkType) throw new Error('watermarkType is required for watermark.')
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          if (i.watermarkType === 'text') {
            if (!i.watermarkText) throw new Error('watermarkText is required for watermark type=text.')
            const r = await watermarkPdfWithText(absPath, {
              text: i.watermarkText,
              fontSize: i.watermarkFontSize,
              color: i.watermarkColor,
              opacity: i.watermarkOpacity,
              angle: i.watermarkAngle,
              pageRange: i.watermarkPageRange,
              password: i.password,
            })
            return { ok: true, data: { action: 'watermark', filePath: absPath, type: 'text', ...r } }
          } else {
            if (!i.watermarkPdfPath) throw new Error('watermarkPdfPath is required for watermark type=pdf.')
            const wmAbs = await resolveOfficeFile(i.watermarkPdfPath, ['.pdf'])
            const r = await watermarkPdfWithPdf(absPath, {
              watermarkPdfPath: wmAbs,
              watermarkPdfPage: i.watermarkPdfPage,
              opacity: i.watermarkOpacity,
              pageRange: i.watermarkPageRange,
              password: i.password,
            })
            return { ok: true, data: { action: 'watermark', filePath: absPath, type: 'pdf', ...r } }
          }
        }

        case 'decrypt': {
          if (!i.password) throw new Error('password is required for decrypt.')
          if (!i.outputPath) throw new Error('outputPath is required for decrypt.')
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const { absPath: absOut } = resolveToolPath({ target: i.outputPath })
          const r = await decryptPdf(absPath, absOut, i.password)
          return {
            ok: true,
            data: { action: 'decrypt', filePath: absPath, outputPath: absOut, ...r },
          }
        }

        case 'optimize': {
          if (!i.outputPath) throw new Error('outputPath is required for optimize.')
          const absPath = await resolveOfficeFile(i.filePath, ['.pdf'])
          const { absPath: absOut } = resolveToolPath({ target: i.outputPath })
          const r = await optimizePdf(absPath, absOut, {
            linearize: i.linearize,
            password: i.password,
          })
          return {
            ok: true,
            data: { action: 'optimize', filePath: absPath, outputPath: absOut, ...r },
          }
        }

        default:
          throw new Error(`Unknown action: ${(i as { action: string }).action}`)
      }
    } catch (err) {
      if (err instanceof PdfEncryptedError) {
        return encryptedPayload(i.filePath)
      }
      throw err
    }
  },
})

// ---------------------------------------------------------------------------
// PdfInspect — read-only analysis (8 actions)
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
            'PDF is encrypted. Provide the `password` argument, or call PdfMutate(decrypt) to produce an unlocked copy.',
          data: { filePath: absPath },
        }
      }
      throw err
    }
  },
})
