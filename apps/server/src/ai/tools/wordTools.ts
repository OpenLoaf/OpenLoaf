/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import mammoth from 'mammoth'
import {
  wordQueryToolDef,
  wordMutateToolDef,
} from '@openloaf/api/types/tools/word'
import { resolveToolPath } from '@/ai/tools/toolScope'
import {
  resolveOfficeFile,
  listZipEntries,
  readZipEntryText,
  readZipEntryBuffer,
  editZip,
  createZip,
} from '@/ai/tools/office/streamingZip'
import { parseDocxStructure } from '@/ai/tools/office/structureParser'
import type { OfficeEdit } from '@/ai/tools/office/types'

const MAX_TEXT_LENGTH = 200_000
const MAX_XML_LENGTH = 200_000

// ---------------------------------------------------------------------------
// DOCX XML Templates (for create action)
// ---------------------------------------------------------------------------

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

const DOCX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOCX_DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:pPr><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:pPr><w:outlineLvl w:val="4"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:pPr><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`

const DOCX_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

// ---------------------------------------------------------------------------
// Content Item → XML
// ---------------------------------------------------------------------------

type ContentItem =
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text: string; bold?: boolean; italic?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: string[] }

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function contentToDocxXml(content: ContentItem[]): string {
  const paras: string[] = []

  for (const item of content) {
    switch (item.type) {
      case 'heading': {
        const level = Math.min(Math.max(item.level ?? 1, 1), 6)
        paras.push(
          `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${escapeXml(item.text)}</w:t></w:r></w:p>`,
        )
        break
      }
      case 'paragraph': {
        const rPr: string[] = []
        if (item.bold) rPr.push('<w:b/>')
        if (item.italic) rPr.push('<w:i/>')
        const rPrXml = rPr.length > 0 ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''
        paras.push(
          `<w:p><w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(item.text)}</w:t></w:r></w:p>`,
        )
        break
      }
      case 'table': {
        const headerCells = item.headers
          .map((h) => `<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p></w:tc>`)
          .join('')
        const headerRow = `<w:tr>${headerCells}</w:tr>`
        const dataRows = item.rows
          .map(
            (row) =>
              `<w:tr>${row.map((c) => `<w:tc><w:p><w:r><w:t>${escapeXml(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`,
          )
          .join('')
        paras.push(`<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>${headerRow}${dataRows}</w:tbl>`)
        break
      }
      case 'bullet-list': {
        for (const text of item.items) {
          paras.push(
            `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
          )
        }
        break
      }
      case 'numbered-list': {
        for (const text of item.items) {
          paras.push(
            `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
          )
        }
        break
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${paras.join('')}</w:body>
</w:document>`
}

// ---------------------------------------------------------------------------
// Word Query Tool
// ---------------------------------------------------------------------------

export const wordQueryTool = tool({
  description: wordQueryToolDef.description,
  inputSchema: zodSchema(wordQueryToolDef.parameters),
  execute: async (input) => {
    const { mode, filePath, xmlPath } = input as {
      mode: string
      filePath: string
      xmlPath?: string
    }

    // Handle .doc legacy format
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.doc') {
      return handleLegacyDoc(filePath, mode)
    }

    const absPath = await resolveOfficeFile(filePath, ['.docx'])

    switch (mode) {
      case 'read-structure': {
        const entries = await listZipEntries(absPath)
        const readEntry = (p: string) => readZipEntryBuffer(absPath, p)
        const structure = await parseDocxStructure(readEntry)
        return { ok: true, data: { mode, fileName: path.basename(filePath), ...structure } }
      }

      case 'read-xml': {
        if (!xmlPath || xmlPath === '*') {
          const entries = await listZipEntries(absPath)
          return { ok: true, data: { mode, fileName: path.basename(filePath), entries } }
        }
        const rawXml = await readZipEntryText(absPath, xmlPath)
        const xmlTruncated = rawXml.length > MAX_XML_LENGTH
        const xml = xmlTruncated ? rawXml.slice(0, MAX_XML_LENGTH) : rawXml
        return { ok: true, data: { mode, fileName: path.basename(filePath), xmlPath, xml, truncated: xmlTruncated, totalLength: rawXml.length } }
      }

      case 'read-text': {
        const buffer = await fs.readFile(absPath)
        const result = await mammoth.extractRawText({ buffer })
        const text = result.value
        const truncated = text.length > MAX_TEXT_LENGTH
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
            truncated,
            characterCount: text.length,
          },
        }
      }

      default:
        throw new Error(`Unknown mode: ${mode}`)
    }
  },
})

// ---------------------------------------------------------------------------
// Word Mutate Tool
// ---------------------------------------------------------------------------

export const wordMutateTool = tool({
  description: wordMutateToolDef.description,
  inputSchema: zodSchema(wordMutateToolDef.parameters),
  execute: async (input) => {
    const { action, filePath, content, edits } = input as {
      action: string
      filePath: string
      content?: ContentItem[]
      edits?: OfficeEdit[]
    }

    const { absPath } = resolveToolPath({ target: filePath })

    switch (action) {
      case 'create': {
        if (!content || content.length === 0) {
          throw new Error('content is required for create action.')
        }
        const entries = new Map<string, Buffer>()
        entries.set('[Content_Types].xml', Buffer.from(DOCX_CONTENT_TYPES, 'utf-8'))
        entries.set('_rels/.rels', Buffer.from(DOCX_ROOT_RELS, 'utf-8'))
        entries.set('word/_rels/document.xml.rels', Buffer.from(DOCX_DOC_RELS, 'utf-8'))
        entries.set('word/document.xml', Buffer.from(contentToDocxXml(content), 'utf-8'))
        entries.set('word/styles.xml', Buffer.from(DOCX_STYLES, 'utf-8'))
        entries.set('word/numbering.xml', Buffer.from(DOCX_NUMBERING, 'utf-8'))

        await createZip(absPath, entries)
        return {
          ok: true,
          data: { action, filePath: absPath, elementCount: content.length },
        }
      }

      case 'edit': {
        if (!edits || edits.length === 0) {
          throw new Error('edits is required for edit action.')
        }
        await resolveOfficeFile(filePath, ['.docx'])
        await editZip(absPath, absPath, edits)
        return {
          ok: true,
          data: { action, filePath: absPath, editCount: edits.length },
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  },
})

// ---------------------------------------------------------------------------
// Legacy .doc handling
// ---------------------------------------------------------------------------

/** Extract plain text from officeparser AST. */
function extractAstText(ast: { content?: { text?: string; children?: any[] }[] }): string {
  const lines: string[] = []
  function walk(nodes: any[]) {
    for (const node of nodes) {
      if (node.text) lines.push(node.text)
      if (node.children) walk(node.children)
    }
  }
  if (ast.content) walk(ast.content)
  return lines.join('\n')
}

async function handleLegacyDoc(filePath: string, mode: string) {
  if (mode !== 'read-text') {
    return {
      ok: false,
      error: '该文件为旧版 .doc 格式，仅支持 read-text 模式提取纯文本。如需编辑，请使用 word-mutate(create) 创建新的 .docx 文件。',
    }
  }
  const { absPath } = resolveToolPath({ target: filePath })
  const officeparser = await import('officeparser')
  const ast = await officeparser.parseOffice(absPath)
  const text = extractAstText(ast)
  const truncated = text.length > MAX_TEXT_LENGTH
  return {
    ok: true,
    data: {
      mode,
      fileName: path.basename(filePath),
      text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
      truncated,
      characterCount: text.length,
      legacy: true,
      hint: '该文件为旧版 .doc 格式。如需编辑，请使用 word-mutate(create) 创建新的 .docx 文件。',
    },
  }
}
