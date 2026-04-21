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
 * PptxInspect — read-only PPTX tool (9 actions).
 * Write operations go through `JsSandbox` with the preinstalled `pptxgenjs` /
 * `adm-zip` packages (see builtin-skills/pptx for demo scripts).
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { pptxInspectToolDef } from '@openloaf/api/types/tools/pptx'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import {
  inspectSummary,
  inspectOutline,
  inspectText,
  inspectNotes,
  inspectTables,
  inspectShapes,
  inspectImages,
  inspectXml,
  renderPptxSlides,
  PptxLegacyFormatError,
} from '@/ai/tools/office/pptxInspectEngine'

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

type InspectInput = {
  action:
    | 'summary'
    | 'outline'
    | 'text'
    | 'notes'
    | 'tables'
    | 'shapes'
    | 'images'
    | 'xml'
    | 'render'
  filePath: string
  slideNumbers?: string
  withCoords?: boolean
  extractImages?: boolean
  partName?: string
  scale?: number
  withRender?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveInspectAssetDir(filePath: string): Promise<{
  assetDirAbsPath: string
  assetRelPrefix: string
}> {
  const sessionId = getSessionId()
  if (!sessionId) {
    throw new Error(
      'PptxInspect render / extractImages requires an active chat session to write assets.',
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
// PptxInspect
// ---------------------------------------------------------------------------

export const pptxInspectTool = tool({
  description: pptxInspectToolDef.description,
  inputSchema: zodSchema(pptxInspectToolDef.parameters),
  execute: async (input) => {
    const i = input as InspectInput
    const { action, filePath } = i
    const absPath = await resolveOfficeFile(filePath, ['.pptx', '.ppt'])

    try {
      switch (action) {
        case 'summary': {
          const data = await inspectSummary(absPath)
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'outline': {
          const outline = await inspectOutline(absPath)
          return { ok: true, data: { action, filePath: absPath, outline } }
        }

        case 'text': {
          const data = await inspectText(absPath, {
            slideNumbers: i.slideNumbers,
            withCoords: i.withCoords,
          })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'notes': {
          const notes = await inspectNotes(absPath, { slideNumbers: i.slideNumbers })
          return { ok: true, data: { action, filePath: absPath, notes } }
        }

        case 'tables': {
          const data = await inspectTables(absPath, { slideNumbers: i.slideNumbers })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'shapes': {
          const shapes = await inspectShapes(absPath, {
            slideNumbers: i.slideNumbers,
            withCoords: i.withCoords,
          })
          return { ok: true, data: { action, filePath: absPath, shapes } }
        }

        case 'images': {
          let assetDirAbsPath: string | undefined
          let assetRelPrefix: string | undefined
          if (i.extractImages) {
            const resolved = await resolveInspectAssetDir(filePath)
            assetDirAbsPath = resolved.assetDirAbsPath
            assetRelPrefix = resolved.assetRelPrefix
          }
          const images = await inspectImages(absPath, {
            slideNumbers: i.slideNumbers,
            extractImages: i.extractImages,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return {
            ok: true,
            data: {
              action,
              filePath: absPath,
              images,
              assetDir: assetRelPrefix,
            },
          }
        }

        case 'xml': {
          const data = await inspectXml(absPath, { partName: i.partName })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'render': {
          const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
          const pages = await renderPptxSlides(absPath, {
            slideNumbers: i.slideNumbers,
            scale: i.scale,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return {
            ok: true,
            data: {
              action,
              filePath: absPath,
              pages,
              assetDir: assetRelPrefix,
            },
          }
        }

        default:
          throw new Error(`Unknown action: ${String(action)}`)
      }
    } catch (err) {
      if (err instanceof PptxLegacyFormatError) {
        return {
          ok: false as const,
          error: 'PPT_LEGACY_FORMAT',
          message: err.message,
          data: { filePath: absPath },
        }
      }
      throw err
    }
  },
})
