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
 * Doc Convert Tool — mammoth/turndown/marked/xlsx/pdf-lib/@hyzyla/pdfium 封装，
 * 提供文档格式互转能力。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { docConvertToolDef } from '@openloaf/api/types/tools/docConvert'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { resolveOfficeFile } from '@/ai/tools/office/streamingZip'

const DOC_EXTENSIONS = [
  '.docx', '.pdf', '.xlsx', '.xls', '.csv', '.html', '.htm', '.md', '.txt',
]

type ConvertResult = {
  outputPath: string
  sourceFormat: string
  outputFormat: string
  fileSize: number
  lossyConversion?: boolean
}

// ---------------------------------------------------------------------------
// Lazy imports (avoid loading all heavy libs upfront)
// ---------------------------------------------------------------------------

async function importMammoth() {
  return (await import('mammoth')).default
}

async function importTurndown(): Promise<typeof import('turndown')> {
  const mod = await import('turndown')
  return (mod as any).default || mod
}

async function importMarked() {
  return await import('marked')
}

async function importXlsx() {
  const mod = await import('xlsx')
  return (mod as any).default || mod
}

async function importPdfLib() {
  return await import('pdf-lib')
}

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

async function docxToHtml(inputPath: string): Promise<string> {
  const mammoth = await importMammoth()
  const result = await mammoth.convertToHtml({ path: inputPath })
  return result.value
}

async function docxToMd(inputPath: string): Promise<string> {
  const html = await docxToHtml(inputPath)
  const TurndownService = await importTurndown()
  const td = new TurndownService()
  return td.turndown(html)
}

async function docxToTxt(inputPath: string): Promise<string> {
  const mammoth = await importMammoth()
  const result = await mammoth.extractRawText({ path: inputPath })
  return result.value
}

async function docxToPdf(inputPath: string, outputPath: string): Promise<void> {
  const text = await docxToTxt(inputPath)
  await textToPdf(text, outputPath)
}

async function pdfToTxt(inputPath: string): Promise<string> {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const buffer = await fs.readFile(inputPath)
  const lib = await PDFiumLibrary.init()
  const doc = await lib.loadDocument(new Uint8Array(buffer))
  try {
    const pageTexts: string[] = []
    for (let i = 0; i < doc.getPageCount(); i++) {
      pageTexts.push(doc.getPage(i).getText())
    }
    return pageTexts.join('\n\n')
  } finally {
    doc.destroy()
    lib.destroy()
  }
}

async function pdfToHtml(inputPath: string): Promise<string> {
  const text = await pdfToTxt(inputPath)
  const pages = text.split('\f').filter(Boolean)
  const htmlPages = pages.map(
    (page, i) =>
      `<div class="pdf-page" data-page="${i + 1}">${page
        .split('\n')
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('\n')}</div>`,
  )
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PDF Convert</title>
<style>.pdf-page { page-break-after: always; margin-bottom: 2em; padding: 1em; border-bottom: 1px solid #ccc; }</style>
</head><body>${htmlPages.join('\n')}</body></html>`
}

async function pdfToMd(inputPath: string): Promise<string> {
  const text = await pdfToTxt(inputPath)
  const pages = text.split('\f').filter(Boolean)
  return pages.map((page, i) => `## Page ${i + 1}\n\n${page.trim()}`).join('\n\n---\n\n')
}

async function pdfToDocx(inputPath: string, outputPath: string): Promise<void> {
  // Lossy text-level conversion: extract text and create a minimal DOCX
  const text = await pdfToTxt(inputPath)
  await textToDocx(text, outputPath)
}

async function pdfToXlsx(inputPath: string, outputPath: string): Promise<void> {
  // Use the grid-based table extractor (stage 6); each detected table
  // becomes its own sheet. If no tables are found, fall back to dumping
  // the extracted text on a single "Text" sheet.
  const { inspectTables } = await import('./office/pdfInspectEngine')
  const result = await inspectTables(inputPath)
  const XLSX = await importXlsx()
  const wb = XLSX.utils.book_new()

  if (result.tables.length > 0) {
    const seenNames = new Set<string>()
    for (let i = 0; i < result.tables.length; i++) {
      const t = result.tables[i]!
      // Excel sheet names are capped at 31 chars and must be unique.
      let name = `Page${t.page}-Table${i + 1}`
      if (name.length > 31) name = name.slice(0, 31)
      let finalName = name
      let suffix = 1
      while (seenNames.has(finalName)) {
        const tail = `~${suffix++}`
        finalName = `${name.slice(0, 31 - tail.length)}${tail}`
      }
      seenNames.add(finalName)
      const ws = XLSX.utils.aoa_to_sheet(t.rows)
      XLSX.utils.book_append_sheet(wb, ws, finalName)
    }
  } else {
    const text = await pdfToTxt(inputPath)
    const lines = text.split('\n').map((line) => [line])
    const ws = XLSX.utils.aoa_to_sheet(lines.length > 0 ? lines : [['']])
    XLSX.utils.book_append_sheet(wb, ws, 'Text')
  }

  XLSX.writeFile(wb, outputPath, { bookType: 'xlsx' })
}

async function textToPdf(text: string, outputPath: string): Promise<void> {
  const { PDFDocument } = await importPdfLib()
  const { embedFont } = await import('./office/pdfFonts')
  const doc = await PDFDocument.create()
  const font = await embedFont(doc, text)
  const fontSize = 12
  const margin = 50
  const lineHeight = fontSize * 1.4

  const lines = text.split('\n')
  let page = doc.addPage()
  let { height } = page.getSize()
  let y = height - margin

  for (const line of lines) {
    if (y < margin + lineHeight) {
      page = doc.addPage()
      height = page.getSize().height
      y = height - margin
    }
    page.drawText(line.slice(0, 200), { x: margin, y, size: fontSize, font })
    y -= lineHeight
  }

  const bytes = await doc.save()
  await fs.writeFile(outputPath, bytes)
}

async function textToDocx(text: string, outputPath: string): Promise<void> {
  // Create a minimal DOCX (plain text paragraphs via xlsx ZIP manipulation is complex;
  // use a simple XML approach)
  const contentXml = text
    .split('\n')
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join('')

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14"><w:body>${contentXml}</w:body></w:document>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`

  // Build DOCX as a minimal ZIP (store, no compression)
  const zipFiles: Array<{ name: string; content: Buffer }> = [
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf-8') },
    { name: '_rels/.rels', content: Buffer.from(relsXml, 'utf-8') },
    { name: 'word/document.xml', content: Buffer.from(docXml, 'utf-8') },
    { name: 'word/_rels/document.xml.rels', content: Buffer.from(wordRelsXml, 'utf-8') },
  ]

  await fs.writeFile(outputPath, buildZipBuffer(zipFiles))
}

// Excel conversions
async function xlsxToCsv(inputPath: string): Promise<string> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  return XLSX.utils.sheet_to_csv(sheet)
}

async function xlsxToJson(inputPath: string): Promise<string> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  const data = XLSX.utils.sheet_to_json(sheet)
  return JSON.stringify(data, null, 2)
}

async function xlsxToTxt(inputPath: string): Promise<string> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  return XLSX.utils.sheet_to_txt(sheet)
}

async function xlsxToHtml(inputPath: string): Promise<string> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  const html = XLSX.utils.sheet_to_html(sheet)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
}

async function xlsxToXls(inputPath: string, outputPath: string): Promise<void> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  XLSX.writeFile(workbook, outputPath, { bookType: 'biff8' })
}

async function xlsxToXlsx(inputPath: string, outputPath: string): Promise<void> {
  const XLSX = await importXlsx()
  const workbook = XLSX.readFile(inputPath)
  XLSX.writeFile(workbook, outputPath, { bookType: 'xlsx' })
}

async function csvToXlsx(inputPath: string, outputPath: string): Promise<void> {
  const XLSX = await importXlsx()
  const csvContent = await fs.readFile(inputPath, 'utf-8')
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(
    csvContent.split('\n').map((row) => row.split(',')),
  )
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  XLSX.writeFile(workbook, outputPath, { bookType: 'xlsx' })
}

async function csvToXls(inputPath: string, outputPath: string): Promise<void> {
  const XLSX = await importXlsx()
  const csvContent = await fs.readFile(inputPath, 'utf-8')
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(
    csvContent.split('\n').map((row) => row.split(',')),
  )
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  XLSX.writeFile(workbook, outputPath, { bookType: 'biff8' })
}

async function csvToJson(inputPath: string): Promise<string> {
  const XLSX = await importXlsx()
  const csvContent = await fs.readFile(inputPath, 'utf-8')
  const workbook = XLSX.read(csvContent, { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!
  const data = XLSX.utils.sheet_to_json(sheet)
  return JSON.stringify(data, null, 2)
}

// HTML/MD conversions
async function htmlToMd(inputPath: string): Promise<string> {
  const html = await fs.readFile(inputPath, 'utf-8')
  const TurndownService = await importTurndown()
  const td = new TurndownService()
  return td.turndown(html)
}

async function htmlToTxt(inputPath: string): Promise<string> {
  const html = await fs.readFile(inputPath, 'utf-8')
  return stripHtmlTags(html)
}

async function htmlToPdf(inputPath: string, outputPath: string): Promise<void> {
  const html = await fs.readFile(inputPath, 'utf-8')
  const text = stripHtmlTags(html)
  await textToPdf(text, outputPath)
}

async function mdToHtml(inputPath: string): Promise<string> {
  const md = await fs.readFile(inputPath, 'utf-8')
  const { marked } = await importMarked()
  const html = await marked(md)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
}

async function mdToTxt(inputPath: string): Promise<string> {
  const md = await fs.readFile(inputPath, 'utf-8')
  const { marked } = await importMarked()
  const html = await marked(md)
  return stripHtmlTags(html)
}

async function mdToPdf(inputPath: string, outputPath: string): Promise<void> {
  const text = await mdToTxt(inputPath)
  await textToPdf(text, outputPath)
}

async function txtToPdf(inputPath: string, outputPath: string): Promise<void> {
  const text = await fs.readFile(inputPath, 'utf-8')
  await textToPdf(text, outputPath)
}

async function txtToDocx(inputPath: string, outputPath: string): Promise<void> {
  const text = await fs.readFile(inputPath, 'utf-8')
  await textToDocx(text, outputPath)
}

async function txtToHtml(inputPath: string): Promise<string> {
  const text = await fs.readFile(inputPath, 'utf-8')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>${escapeHtml(text)}</pre></body></html>`
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stripHtmlTags(html: string): string {
  // State-machine approach: iterate characters to extract text content,
  // skipping all tags (including <style> and <script> blocks) without regex.
  const out: string[] = []
  let i = 0
  const len = html.length
  while (i < len) {
    if (html[i] === '<') {
      // Check for <style or <script blocks — skip until closing tag.
      const tagMatch = html.slice(i, i + 10).toLowerCase()
      let skipTag = ''
      if (tagMatch.startsWith('<style') && (html[i + 6] === ' ' || html[i + 6] === '>' || html[i + 6] === '\t' || html[i + 6] === '\n')) {
        skipTag = '</style>'
      } else if (tagMatch.startsWith('<script') && (html[i + 7] === ' ' || html[i + 7] === '>' || html[i + 7] === '\t' || html[i + 7] === '\n')) {
        skipTag = '</script>'
      }
      if (skipTag) {
        const end = html.toLowerCase().indexOf(skipTag, i + skipTag.length)
        i = end === -1 ? len : end + skipTag.length
      } else {
        // Skip any HTML tag.
        const close = html.indexOf('>', i)
        i = close === -1 ? len : close + 1
      }
    } else if (html[i] === '&') {
      // Decode common HTML entities in-place.
      const slice = html.slice(i, i + 8)
      if (slice.startsWith('&nbsp;'))  { out.push(' ');  i += 6 }
      else if (slice.startsWith('&amp;'))   { out.push('&');  i += 5 }
      else if (slice.startsWith('&lt;'))    { out.push('<');  i += 4 }
      else if (slice.startsWith('&gt;'))    { out.push('>');  i += 4 }
      else if (slice.startsWith('&quot;'))  { out.push('"');  i += 6 }
      else if (slice.startsWith('&apos;'))  { out.push("'"); i += 6 }
      else { out.push('&'); i += 1 }
    } else {
      out.push(html[i]!)
      i += 1
    }
  }
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Simple CRC32 for ZIP file creation. */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    const idx = (crc ^ buf[i]!) & 0xff
    crc = (crc >>> 8) ^ CRC32_TABLE[idx]!
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC32_TABLE[i] = c >>> 0
}

/** Build a minimal ZIP buffer from file entries (store, no compression). */
function buildZipBuffer(files: Array<{ name: string; content: Buffer }>): Buffer {
  const zipParts: Buffer[] = []
  const centralDir: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf-8')
    const localHeader = Buffer.alloc(30 + nameBuffer.length)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8) // store
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    const crc = crc32(file.content)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(file.content.length, 18)
    localHeader.writeUInt32LE(file.content.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    nameBuffer.copy(localHeader, 30)

    const cdEntry = Buffer.alloc(46 + nameBuffer.length)
    cdEntry.writeUInt32LE(0x02014b50, 0)
    cdEntry.writeUInt16LE(20, 4)
    cdEntry.writeUInt16LE(20, 6)
    cdEntry.writeUInt16LE(0, 8)
    cdEntry.writeUInt16LE(0, 10)
    cdEntry.writeUInt16LE(0, 12)
    cdEntry.writeUInt16LE(0, 14)
    cdEntry.writeUInt32LE(crc, 16)
    cdEntry.writeUInt32LE(file.content.length, 20)
    cdEntry.writeUInt32LE(file.content.length, 24)
    cdEntry.writeUInt16LE(nameBuffer.length, 28)
    cdEntry.writeUInt16LE(0, 30)
    cdEntry.writeUInt16LE(0, 32)
    cdEntry.writeUInt16LE(0, 34)
    cdEntry.writeUInt16LE(0, 36)
    cdEntry.writeUInt32LE(0, 38)
    cdEntry.writeUInt32LE(offset, 42)
    nameBuffer.copy(cdEntry, 46)
    centralDir.push(cdEntry)

    zipParts.push(localHeader, file.content)
    offset += localHeader.length + file.content.length
  }

  const cdOffset = offset
  let cdSize = 0
  for (const cd of centralDir) {
    zipParts.push(cd)
    cdSize += cd.length
  }

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(centralDir.length, 8)
  eocd.writeUInt16LE(centralDir.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)
  zipParts.push(eocd)

  return Buffer.concat(zipParts)
}

// ---------------------------------------------------------------------------
// Conversion Matrix
// ---------------------------------------------------------------------------

type ConvertFn = (inputPath: string, outputPath: string) => Promise<void>

/** Returns string content converters (write to file in execute). */
type StringConvertFn = (inputPath: string) => Promise<string>

const CONVERSION_MAP: Record<string, Record<string, ConvertFn | StringConvertFn>> = {
  docx: {
    html: ((ip: string) => docxToHtml(ip)) as StringConvertFn,
    md: ((ip: string) => docxToMd(ip)) as StringConvertFn,
    txt: ((ip: string) => docxToTxt(ip)) as StringConvertFn,
    pdf: docxToPdf as ConvertFn,
  },
  pdf: {
    txt: ((ip: string) => pdfToTxt(ip)) as StringConvertFn,
    html: ((ip: string) => pdfToHtml(ip)) as StringConvertFn,
    md: ((ip: string) => pdfToMd(ip)) as StringConvertFn,
    docx: pdfToDocx as ConvertFn,
    xlsx: pdfToXlsx as ConvertFn,
  },
  xlsx: {
    csv: ((ip: string) => xlsxToCsv(ip)) as StringConvertFn,
    json: ((ip: string) => xlsxToJson(ip)) as StringConvertFn,
    txt: ((ip: string) => xlsxToTxt(ip)) as StringConvertFn,
    html: ((ip: string) => xlsxToHtml(ip)) as StringConvertFn,
    xls: xlsxToXls as ConvertFn,
  },
  xls: {
    csv: ((ip: string) => xlsxToCsv(ip)) as StringConvertFn,
    json: ((ip: string) => xlsxToJson(ip)) as StringConvertFn,
    txt: ((ip: string) => xlsxToTxt(ip)) as StringConvertFn,
    html: ((ip: string) => xlsxToHtml(ip)) as StringConvertFn,
    xlsx: ((ip: string, op: string) => xlsxToXlsx(ip, op)) as ConvertFn,
  },
  csv: {
    xlsx: csvToXlsx as ConvertFn,
    xls: csvToXls as ConvertFn,
    json: ((ip: string) => csvToJson(ip)) as StringConvertFn,
  },
  html: {
    md: ((ip: string) => htmlToMd(ip)) as StringConvertFn,
    txt: ((ip: string) => htmlToTxt(ip)) as StringConvertFn,
    pdf: htmlToPdf as ConvertFn,
  },
  htm: {
    md: ((ip: string) => htmlToMd(ip)) as StringConvertFn,
    txt: ((ip: string) => htmlToTxt(ip)) as StringConvertFn,
    pdf: htmlToPdf as ConvertFn,
  },
  md: {
    html: ((ip: string) => mdToHtml(ip)) as StringConvertFn,
    txt: ((ip: string) => mdToTxt(ip)) as StringConvertFn,
    pdf: mdToPdf as ConvertFn,
  },
  txt: {
    pdf: txtToPdf as ConvertFn,
    docx: txtToDocx as ConvertFn,
    html: ((ip: string) => txtToHtml(ip)) as StringConvertFn,
  },
}

// Lossy conversions (PDF↔DOCX, HTML/MD→PDF via text)
const LOSSY_CONVERSIONS = new Set([
  'pdf→docx',
  'pdf→html',
  'pdf→md',
  'pdf→xlsx',
  'docx→pdf',
  'html→pdf',
  'md→pdf',
  'txt→pdf',
])

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const docConvertTool = tool({
  description: docConvertToolDef.description,
  inputSchema: zodSchema(docConvertToolDef.parameters),
  execute: async (input) => {
    const { filePath, outputPath, outputFormat } = input as {
      filePath: string
      outputPath: string
      outputFormat: string
    }

    const absInput = await resolveOfficeFile(filePath, DOC_EXTENSIONS)
    const resolved = resolveToolPath({ target: outputPath })
    const absOutput = resolved.absPath
    await fs.mkdir(path.dirname(absOutput), { recursive: true })

    const sourceExt = path.extname(absInput).slice(1).toLowerCase()
    const sourceFormat = sourceExt === 'htm' ? 'html' : sourceExt

    const formatMap = CONVERSION_MAP[sourceExt]
    if (!formatMap) {
      throw new Error(`Unsupported source format: .${sourceExt}`)
    }

    const converter = formatMap[outputFormat]
    if (!converter) {
      throw new Error(
        `Unsupported conversion: .${sourceExt} → .${outputFormat}`,
      )
    }

    // Check if it's a string converter (1 arg) or file converter (2 args)
    if (converter.length === 1) {
      // String converter
      const content = await (converter as StringConvertFn)(absInput)
      await fs.writeFile(absOutput, content, 'utf-8')
    } else {
      // File converter
      await (converter as ConvertFn)(absInput, absOutput)
    }

    const stat = await fs.stat(absOutput)
    const isLossy = LOSSY_CONVERSIONS.has(`${sourceFormat}→${outputFormat}`)

    const result: ConvertResult = {
      outputPath: absOutput,
      sourceFormat,
      outputFormat,
      fileSize: stat.size,
    }
    if (isLossy) result.lossyConversion = true

    return { ok: true, data: result }
  },
})
