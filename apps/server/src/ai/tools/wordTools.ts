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
 * WordInspect — read-only DOCX tool (9 actions).
 * Write operations were removed; all .docx creation / editing now goes
 * through `JsSandbox` with the preinstalled `docx` / `adm-zip` packages
 * (see builtin-skills/docx for demo scripts).
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { wordInspectToolDef } from '@openloaf/api/types/tools/word'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import {
  inspectSummary,
  inspectOutline,
  inspectText,
  inspectTables,
  inspectImages,
  inspectComments,
  inspectTrackedChanges,
  inspectXml,
  renderDocxPages,
  DocxLibreOfficeUnavailableError,
  DocxProtectedError,
} from '@/ai/tools/office/docxInspectEngine'

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

type InspectInput = {
  action:
    | 'summary'
    | 'outline'
    | 'text'
    | 'tables'
    | 'images'
    | 'comments'
    | 'tracked-changes'
    | 'xml'
    | 'render'
  filePath: string
  pageRange?: string
  withCoords?: boolean
  extractImages?: boolean
  partName?: string
  scale?: number
  withRender?: boolean
  sampleSize?: number
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
      'WordInspect render / extractImages / text asset extraction requires an active chat session to write assets.',
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
// WordInspect
// ---------------------------------------------------------------------------

export const wordInspectTool = tool({
  description: wordInspectToolDef.description,
  inputSchema: zodSchema(wordInspectToolDef.parameters),
  execute: async (input) => {
    const i = input as InspectInput
    const { action, filePath } = i
    const absPath = await resolveOfficeFile(filePath, ['.docx'])

    try {
      switch (action) {
        case 'summary': {
          const data = await inspectSummary(absPath, {
            sampleSize: i.sampleSize,
            withRender: i.withRender,
          })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'outline': {
          const outline = await inspectOutline(absPath)
          return { ok: true, data: { action, filePath: absPath, outline } }
        }

        case 'text': {
          let assetDirAbsPath: string | undefined
          let assetRelPrefix: string | undefined
          if (getSessionId()) {
            const resolved = await resolveInspectAssetDir(filePath)
            assetDirAbsPath = resolved.assetDirAbsPath
            assetRelPrefix = resolved.assetRelPrefix
          }
          const data = await inspectText(absPath, {
            pageRange: i.pageRange,
            withCoords: i.withCoords,
            assetDirAbsPath,
            assetRelPrefix,
          })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'tables': {
          const tables = await inspectTables(absPath, { pageRange: i.pageRange })
          return { ok: true, data: { action, filePath: absPath, tables } }
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

        case 'comments': {
          const comments = await inspectComments(absPath)
          return { ok: true, data: { action, filePath: absPath, comments } }
        }

        case 'tracked-changes': {
          const changes = await inspectTrackedChanges(absPath)
          return { ok: true, data: { action, filePath: absPath, changes } }
        }

        case 'xml': {
          const data = await inspectXml(absPath, { partName: i.partName })
          return { ok: true, data: { action, filePath: absPath, ...data } }
        }

        case 'render': {
          const { assetDirAbsPath, assetRelPrefix } = await resolveInspectAssetDir(filePath)
          const pages = await renderDocxPages(absPath, {
            pageRange: i.pageRange,
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
      if (err instanceof DocxLibreOfficeUnavailableError) {
        return {
          ok: false as const,
          error: 'LIBREOFFICE_UNAVAILABLE',
          message: err.message,
          data: { filePath: absPath },
        }
      }
      if (err instanceof DocxProtectedError) {
        return {
          ok: false as const,
          error: 'DOCX_PROTECTED',
          message: err.message,
          data: { filePath: absPath },
        }
      }
      throw err
    }
  },
})
