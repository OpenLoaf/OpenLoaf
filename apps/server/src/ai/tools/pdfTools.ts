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
  pdfQueryToolDef,
  pdfMutateToolDef,
} from '@openloaf/api/types/tools/pdf'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import {
  parsePdfStructure,
  extractPdfText,
  extractPdfFormFields,
  renderPageScreenshot,
  createPdf,
  fillPdfForm,
  mergePdfs,
  addTextOverlays,
} from '@/ai/tools/office/pdfEngine'
import { promises as fs } from 'node:fs'
import { resolveSessionAssetDir } from '@/ai/services/chat/repositories/chatFileStore'
import { getSessionId } from '@/ai/shared/context/requestContext'
import type { PdfContentItem, PdfTextOverlay } from '@/ai/tools/office/types'

// ---------------------------------------------------------------------------
// PDF Query Tool
// ---------------------------------------------------------------------------

export const pdfQueryTool = tool({
  description: pdfQueryToolDef.description,
  inputSchema: zodSchema(pdfQueryToolDef.parameters),
  execute: async (input) => {
    const { mode: rawMode, filePath, pageRange, page, scale } = input as {
      mode: string
      filePath: string
      pageRange?: string
      page?: number
      scale?: number
    }

    // 规范化 mode 别名（模型可能省略 "read-" 前缀）
    const MODE_ALIASES: Record<string, string> = {
      'form-fields': 'read-form-fields',
      'structure': 'read-structure',
      'text': 'read-text',
      'screenshot': 'read-screenshot',
    }
    const mode = MODE_ALIASES[rawMode] ?? rawMode

    const absPath = await resolveOfficeFile(filePath, ['.pdf'])

    switch (mode) {
      case 'read-structure': {
        const structure = await parsePdfStructure(absPath)
        return { ok: true, data: { mode, fileName: path.basename(filePath), ...structure } }
      }

      case 'read-text': {
        const result = await extractPdfText(absPath, pageRange)
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            ...result,
          },
        }
      }

      case 'read-form-fields': {
        const fields = await extractPdfFormFields(absPath)
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            fieldCount: fields.length,
            fields,
          },
        }
      }

      case 'read-screenshot': {
        const pageNum = page ?? 1
        const shot = await renderPageScreenshot(absPath, pageNum, scale)
        const sessionId = getSessionId()
        if (!sessionId) {
          throw new Error('read-screenshot requires an active chat session.')
        }
        const assetDir = await resolveSessionAssetDir(sessionId)
        const fileName = `pdf-page-${pageNum}-${Date.now()}.png`
        const targetPath = path.join(assetDir, fileName)
        await fs.writeFile(targetPath, shot.data)
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            pageNumber: shot.pageNumber,
            pageCount: shot.pageCount,
            width: shot.width,
            height: shot.height,
            url: fileName,
            bytes: shot.data.length,
          },
        }
      }

      default:
        throw new Error(`Unknown mode: ${mode}`)
    }
  },
})

// ---------------------------------------------------------------------------
// PDF Mutate Tool
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
