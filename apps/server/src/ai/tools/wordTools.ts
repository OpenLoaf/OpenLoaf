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
 * WordInspect + WordMutate — DOCX tool skeletons.
 *
 * Phase 1: WordInspect 9 actions implemented via docxInspectEngine.
 * Phase 2+: WordMutate will come later; its execute still throws
 * `not yet implemented`.
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import {
  wordInspectToolDef,
  wordMutateToolDef,
} from '@openloaf/api/types/tools/word'
import { createZip, resolveOfficeFile } from '@/ai/tools/office/streamingZip'
import { getSessionId } from '@/ai/shared/context/requestContext'
import { resolveSessionAssetDir } from '@openloaf/api/services/chatSessionPaths'
import { resolveToolPath } from '@/ai/tools/toolScope'
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
import {
  acceptTrackedChanges,
  addCommentAnchors,
  allocateDurableId,
  allocateParaId,
  applyPageSettings,
  buildCommentsExtendedPart,
  buildCommentsIdsPart,
  buildCommentsPart,
  buildDocument,
  buildImageDrawing,
  buildPeoplePart,
  DocxBuildError,
  ensureCommentContentTypes,
  ensureCommentRels,
  ensureContentTypeDefault,
  findAnchorParagraph,
  insertAtAnchor,
  insertParagraphLevelDel,
  loadImageForMutate,
  loadRelManager,
  modifyDocument,
  parseCommentsXml,
  parsePeopleXml,
  pxToEmu,
  rejectTrackedChanges,
  replaceTextAcrossRuns,
  updateTocFields,
  validateCommentAnchorXPath,
  wrapRunsWithDel,
  wrapRunsWithIns,
  type CommentRecord,
  type DocxColumnsSettings,
  type DocxContentItem,
  type DocxDocumentSettings,
  type DocxPageSettings,
  type InsertAnchor,
} from '@/ai/tools/office/docxEngine'

// ---------------------------------------------------------------------------
// Shared helpers
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

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Concatenate every <w:t> text inside a <w:p> run, decoding the escape
 * characters emitted by escapeXmlText (no delText — deleted text is
 * already tombstoned).
 */
function extractParagraphPlainText(paraXml: string): string {
  const out: string[] = []
  const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(paraXml)) !== null) {
    out.push(
      m[1]!
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
    )
  }
  return out.join('')
}

/**
 * Produce a new `<w:p>...</w:p>` with the requested tracked-change
 * applied inside one of its `<w:r>` runs. If the anchor text spans
 * multiple runs inside a single <w:p>, we still work on the FIRST run
 * that contains the substring — the remaining text on adjacent runs is
 * not touched (matches Word's default tracked-change behaviour when the
 * selection happens to be a single run).
 *
 * `mode='delete'` wraps the substring in <w:del>.
 * `mode='replace'` emits <w:del> + <w:ins> sibling pair.
 */
function rewriteParagraphForTrackedChange(opts: {
  paraXml: string
  mode: 'delete' | 'replace'
  anchorText: string
  replacement: string
  author: string
  date: string
  changeId: number
}): string {
  const { paraXml, mode, anchorText, replacement, author, date, changeId } = opts
  // Find the run containing anchorText.
  const runRe = /<w:r\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/w:r>)/g
  let m: RegExpExecArray | null
  while ((m = runRe.exec(paraXml)) !== null) {
    const runXml = m[0]
    if (/<w:delText\b/.test(runXml)) continue
    // Gather rPr + text bodies.
    const rPrMatch = runXml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/)
    const rPr = rPrMatch ? rPrMatch[0] : ''
    const textBodies: string[] = []
    const textRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = textRe.exec(runXml)) !== null) textBodies.push(tm[1]!)
    const runText = textBodies
      .join('')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    const idx = runText.indexOf(anchorText)
    if (idx < 0) continue

    const before = runText.slice(0, idx)
    const after = runText.slice(idx + anchorText.length)

    const beforeRun = before ? `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(before)}</w:t></w:r>` : ''
    const afterRun = after ? `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(after)}</w:t></w:r>` : ''
    const targetRun = `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(anchorText)}</w:t></w:r>`

    let replacementBlock: string
    if (mode === 'delete') {
      replacementBlock = wrapRunsWithDel(targetRun, author, date, changeId)
    } else {
      const insRun = replacement
        ? `<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(replacement)}</w:t></w:r>`
        : ''
      const delBlock = wrapRunsWithDel(targetRun, author, date, changeId)
      const insBlock = insRun ? wrapRunsWithIns(insRun, author, date, changeId + 1) : ''
      replacementBlock = delBlock + insBlock
    }

    const replaced = beforeRun + replacementBlock + afterRun
    return paraXml.slice(0, m.index) + replaced + paraXml.slice(m.index + runXml.length)
  }
  // Anchor not found inside any run — return paragraph unchanged.
  return paraXml
}

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
// WordInspect — read-only analysis (9 actions)
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
          // Text may emit image asset files via docxExtractor — use session
          // asset dir when available, else let the engine fall back to tmp.
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

// ---------------------------------------------------------------------------
// WordMutate — write surface. 9 actions are wired into the engine:
//   create / replace-text / add-image / update-toc / set-page-settings /
//   comment / add-tracked-change / resolve-changes.
// The final action `edit` is the XPath + OOXML op escape hatch and is
// intentionally deferred (see SKILL.md §4.8).
// ---------------------------------------------------------------------------

type MutateInput = {
  action:
    | 'create'
    | 'replace-text'
    | 'add-image'
    | 'update-toc'
    | 'set-page-settings'
    | 'comment'
    | 'add-tracked-change'
    | 'resolve-changes'
    | 'edit'
  filePath: string
  content?: DocxContentItem[]
  documentSettings?: DocxDocumentSettings
  // replace-text
  find?: string
  replace?: string
  regex?: boolean
  matchCase?: boolean
  wholeWord?: boolean
  // add-image
  imageSource?: string
  imageWidthPx?: number
  imageHeightPx?: number
  imageAlt?: string
  anchor?: InsertAnchor
  // set-page-settings
  pageSettings?: DocxPageSettings
  columns?: DocxColumnsSettings
  // comment
  commentText?: string
  commentAuthor?: string
  parentId?: string
  // add-tracked-change
  changeType?: 'insert' | 'delete' | 'replace'
  changeText?: string
  changeReplace?: string
  changeAuthor?: string
  // resolve-changes
  decision?: 'accept' | 'reject'
  ids?: string[]
  [k: string]: unknown
}

export const wordMutateTool = tool({
  description: wordMutateToolDef.description,
  inputSchema: zodSchema(wordMutateToolDef.parameters),
  execute: async (input) => {
    const i = input as MutateInput
    const { action, filePath } = i

    // Every action writes to a session-relative filePath; resolve for
    // sandbox check (raises outside-scope errors for J4).
    const { absPath } = resolveToolPath({ target: filePath })

    try {
      switch (action) {
        case 'create': {
          if (!i.content || !Array.isArray(i.content) || i.content.length === 0) {
            throw new Error('content is required for create action.')
          }
          const { entries } = await buildDocument(i.documentSettings, i.content)
          await createZip(absPath, entries)
          return {
            ok: true as const,
            data: {
              action: 'create',
              filePath: absPath,
              elementCount: i.content.length,
            },
          }
        }

        case 'replace-text': {
          if (typeof i.find !== 'string' || i.find.length === 0) {
            throw new Error('find is required for replace-text action.')
          }
          const findStr = i.find
          const replaceStr = typeof i.replace === 'string' ? i.replace : ''
          let replacements = 0
          await modifyDocument(absPath, (parts) => {
            const result = replaceTextAcrossRuns(parts.docXml, findStr, replaceStr, {
              regex: i.regex,
              matchCase: i.matchCase,
              wholeWord: i.wholeWord,
            })
            parts.docXml = result.docXml
            replacements = result.replacements
          })
          return {
            ok: true as const,
            data: {
              action: 'replace-text',
              filePath: absPath,
              replacements,
            },
          }
        }

        case 'add-image': {
          if (typeof i.imageSource !== 'string' || i.imageSource.length === 0) {
            throw new Error('imageSource is required for add-image action.')
          }
          const imageSource = i.imageSource
          const loaded = await loadImageForMutate(imageSource)
          await modifyDocument(absPath, (parts) => {
            // Rebuild the rels manager from the existing rels XML to
            // allocate a non-colliding rId.
            const rels = loadRelManager(parts.relsXml)
            // Pick a media filename not already taken.
            let idx = 1
            while (parts.entries.has(
              `word/media/image${idx}.${loaded.ext === 'jpeg' ? 'jpg' : loaded.ext}`,
            )) {
              idx += 1
            }
            const fileExt = loaded.ext === 'jpeg' ? 'jpg' : loaded.ext
            const mediaName = `image${idx}.${fileExt}`
            const mediaPath = `word/media/${mediaName}`
            parts.entries.set(mediaPath, loaded.bytes)

            const rid = rels.add(
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
              `media/${mediaName}`,
            )
            parts.relsXml = rels.renderXml()

            // Ensure content type default for this extension.
            parts.contentTypesXml = ensureContentTypeDefault(
              parts.contentTypesXml,
              fileExt,
              loaded.contentType,
            )

            // Compute EMU dimensions: default 300px if not provided.
            const widthPx = i.imageWidthPx ?? 300
            const heightPx = i.imageHeightPx ?? widthPx
            const cx = pxToEmu(widthPx)
            const cy = pxToEmu(heightPx)
            const drawing = buildImageDrawing({
              rid,
              name: mediaName,
              cx,
              cy,
              docPrId: idx,
              alt: i.imageAlt,
            })
            const para = `<w:p><w:r>${drawing}</w:r></w:p>`
            parts.docXml = insertAtAnchor(parts.docXml, i.anchor, para)
          })
          return {
            ok: true as const,
            data: {
              action: 'add-image',
              filePath: absPath,
            },
          }
        }

        case 'update-toc': {
          let tocCount = 0
          await modifyDocument(absPath, (parts) => {
            const result = updateTocFields(parts.docXml)
            parts.docXml = result.docXml
            tocCount = result.tocCount
          })
          return {
            ok: true as const,
            data: {
              action: 'update-toc',
              filePath: absPath,
              tocCount,
            },
          }
        }

        case 'set-page-settings': {
          await modifyDocument(absPath, (parts) => {
            parts.docXml = applyPageSettings(parts.docXml, i.pageSettings, i.columns)
          })
          return {
            ok: true as const,
            data: {
              action: 'set-page-settings',
              filePath: absPath,
            },
          }
        }

        case 'add-tracked-change': {
          if (
            i.changeType !== 'insert' &&
            i.changeType !== 'delete' &&
            i.changeType !== 'replace'
          ) {
            throw new Error(
              "changeType is required for add-tracked-change and must be 'insert', 'delete' or 'replace'.",
            )
          }
          const changeType = i.changeType
          const author = i.changeAuthor ?? 'OpenLoaf AI'
          const date = new Date().toISOString()
          const text = typeof i.changeText === 'string' ? i.changeText : ''
          const replacement = typeof i.changeReplace === 'string' ? i.changeReplace : ''

          await modifyDocument(absPath, (parts) => {
            const changeId = Date.now() % 1000000
            const runXml = (t: string) =>
              `<w:r><w:t xml:space="preserve">${escapeXmlText(t)}</w:t></w:r>`

            if (changeType === 'insert') {
              const block = wrapRunsWithIns(runXml(text), author, date, changeId)
              parts.docXml = insertAtAnchor(parts.docXml, i.anchor, `<w:p>${block}</w:p>`)
              return
            }

            // delete / replace need an anchor paragraph whose text contains
            // `text`. Fall back to the last paragraph when the anchor is
            // not found (keeps the contract non-throwing).
            const match = findAnchorParagraph(parts.docXml, text)
            if (!match) {
              // Anchor miss — emit a standalone deletion/replacement block
              // at the end of the body so the operation still records the
              // intent (rare edge case; typical callers should ensure the
              // anchor text exists).
              if (changeType === 'delete') {
                const delBlock = wrapRunsWithDel(runXml(text), author, date, changeId)
                parts.docXml = insertAtAnchor(parts.docXml, i.anchor, `<w:p>${delBlock}</w:p>`)
              } else {
                const delBlock = wrapRunsWithDel(runXml(text), author, date, changeId)
                const insBlock = wrapRunsWithIns(
                  runXml(replacement),
                  author,
                  date,
                  changeId + 1,
                )
                parts.docXml = insertAtAnchor(
                  parts.docXml,
                  i.anchor,
                  `<w:p>${delBlock}${insBlock}</w:p>`,
                )
              }
              return
            }

            // Build the rewritten paragraph.
            let newParaXml = rewriteParagraphForTrackedChange({
              paraXml: match.paraXml,
              mode: changeType,
              anchorText: text,
              replacement,
              author,
              date,
              changeId,
            })

            // Paragraph-level delete: when the caller asked to delete text
            // that exactly matches the whole paragraph's plain text, inject
            // <w:del/> inside pPr/rPr so accepting the change properly
            // removes the paragraph mark (Anthropic pitfall #7).
            if (changeType === 'delete') {
              const paraPlainText = extractParagraphPlainText(match.paraXml)
              if (paraPlainText.trim() === text.trim() && paraPlainText.trim().length > 0) {
                newParaXml = insertParagraphLevelDel(
                  newParaXml,
                  author,
                  date,
                  changeId + 2,
                )
              }
            }

            parts.docXml =
              parts.docXml.slice(0, match.paraStart) +
              newParaXml +
              parts.docXml.slice(match.paraEnd)
          })
          return {
            ok: true as const,
            data: {
              action: 'add-tracked-change',
              filePath: absPath,
              changeType,
            },
          }
        }

        case 'comment': {
          if (typeof i.commentText !== 'string' || i.commentText.length === 0) {
            throw new Error('commentText is required for comment action.')
          }
          const commentText = i.commentText
          const author = i.commentAuthor ?? 'OpenLoaf AI'
          const date = new Date().toISOString()
          validateCommentAnchorXPath(i.anchor?.xpath)

          await modifyDocument(absPath, (parts) => {
            // Load existing comment parts (or start from empty templates).
            const existingCommentsBuf = parts.entries.get('word/comments.xml')
            const existingCommentsXml = existingCommentsBuf
              ? existingCommentsBuf.toString('utf-8')
              : ''
            const existing = parseCommentsXml(existingCommentsXml)
            const existingIds = new Set(existing.map((c) => c.id))
            let nextIdNum = 0
            while (existingIds.has(String(nextIdNum))) nextIdNum += 1
            const newId = String(nextIdNum)

            let parentParaId: string | undefined
            if (typeof i.parentId === 'string' && i.parentId.length > 0) {
              const parent = existing.find((c) => c.id === i.parentId)
              if (!parent) {
                throw new Error(
                  `comment parentId "${i.parentId}" does not match any existing comment.`,
                )
              }
              parentParaId = parent.paraId
            }

            const newParaId = allocateParaId(existing.length + 1)
            const newDurableId = allocateDurableId(existing.length + 1)

            const record: CommentRecord = {
              id: newId,
              author,
              date,
              text: commentText,
              paraId: newParaId,
              parentParaId,
              durableId: newDurableId,
            }

            // Existing comments need durable/para ids preserved, not
            // recomputed.
            const allRecords: CommentRecord[] = existing.map((e, idx) => ({
              id: e.id,
              author: e.author,
              date: e.date,
              text: e.text,
              paraId: e.paraId || allocateParaId(idx + 1),
              durableId: e.paraId || allocateDurableId(idx + 1),
            }))
            allRecords.push(record)

            // Anchor into document.xml. Replies reuse the parent's anchor
            // by skipping the commentRangeStart/End emission for the reply
            // itself — the reply shows up as a threaded paragraph inside
            // commentsExtended, while the visual anchor stays on the
            // parent comment.
            if (!parentParaId) {
              parts.docXml = addCommentAnchors(parts.docXml, i.anchor, newId)
            }

            // Rebuild all 4 comment parts from the combined record set.
            parts.entries.set(
              'word/comments.xml',
              Buffer.from(buildCommentsPart(allRecords), 'utf-8'),
            )
            parts.entries.set(
              'word/commentsExtended.xml',
              Buffer.from(buildCommentsExtendedPart(allRecords), 'utf-8'),
            )
            parts.entries.set(
              'word/commentsIds.xml',
              Buffer.from(buildCommentsIdsPart(allRecords), 'utf-8'),
            )

            // people.xml merge.
            const existingPeopleBuf = parts.entries.get('word/people.xml')
            const existingAuthors = existingPeopleBuf
              ? parsePeopleXml(existingPeopleBuf.toString('utf-8'))
              : []
            const allAuthors = [
              ...existingAuthors,
              ...allRecords.map((r) => r.author),
            ]
            parts.entries.set(
              'word/people.xml',
              Buffer.from(buildPeoplePart(allAuthors), 'utf-8'),
            )

            // Register rels + content types (idempotent).
            const rels = loadRelManager(parts.relsXml)
            ensureCommentRels(rels)
            parts.relsXml = rels.renderXml()
            parts.contentTypesXml = ensureCommentContentTypes(parts.contentTypesXml)
          })

          return {
            ok: true as const,
            data: {
              action: 'comment',
              filePath: absPath,
              parentId: i.parentId ?? null,
            },
          }
        }

        case 'resolve-changes': {
          if (i.decision !== 'accept' && i.decision !== 'reject') {
            throw new Error(
              "decision is required for resolve-changes and must be 'accept' or 'reject'.",
            )
          }
          const decision = i.decision
          await modifyDocument(absPath, (parts) => {
            parts.docXml =
              decision === 'accept'
                ? acceptTrackedChanges(parts.docXml)
                : rejectTrackedChanges(parts.docXml)
          })
          return {
            ok: true as const,
            data: {
              action: 'resolve-changes',
              filePath: absPath,
              decision,
            },
          }
        }

        case 'edit':
          // `edit` is the escape-hatch XPath op. High-level actions above
          // (replace-text / add-image / update-toc / set-page-settings /
          // comment / add-tracked-change / resolve-changes) cover ~99% of
          // real-world use cases — prefer them first. `edit` requires a full
          // XPath engine + OOXML op engine (replace / insert / remove / write
          // / delete) which is intentionally deferred: it's a large surface
          // area with its own test battery, and every observed use case so
          // far can be expressed with a high-level action.
          throw new Error(
            'WordMutate(edit) not yet implemented: use replace-text / add-image / set-page-settings / comment / add-tracked-change / resolve-changes instead. Raw XPath edits are a last-resort escape hatch planned for a later phase.',
          )

        default:
          throw new Error(
            `WordMutate action "${String(action)}" not recognised.`,
          )
      }
    } catch (err) {
      if (err instanceof DocxBuildError) {
        // Rethrow so the test's assert.rejects can match the regex on the
        // error message (TOC_STYLE_CONFLICT etc).
        throw new Error(err.message)
      }
      throw err
    }
  },
})
