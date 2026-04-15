/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import { pdfMutateToolDef } from '@openloaf/api/types/tools/pdf'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import {
  createPdf,
  fillPdfForm,
  mergePdfs,
  addTextOverlays,
} from '@/ai/tools/office/pdfEngine'
import type { PdfContentItem, PdfTextOverlay } from '@/ai/tools/office/types'

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
