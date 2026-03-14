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
import {
  excelQueryToolDef,
  excelMutateToolDef,
} from '@openloaf/api/types/tools/excel'
import { resolveToolPath } from '@/ai/tools/toolScope'
import {
  resolveOfficeFile,
  listZipEntries,
  readZipEntryText,
  readZipEntryBuffer,
  editZip,
  createZip,
} from '@/ai/tools/office/streamingZip'
import { parseXlsxStructure } from '@/ai/tools/office/structureParser'
import type { OfficeEdit } from '@/ai/tools/office/types'

const MAX_XML_LENGTH = 200_000

// ---------------------------------------------------------------------------
// XLSX XML Templates (for create action)
// ---------------------------------------------------------------------------

function xlsxContentTypes(sheetCount: number): string {
  const overrides = [`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
  ]
  for (let i = 1; i <= sheetCount; i++) {
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides.join('\n  ')}
</Types>`
}

const XLSX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

function xlsxWorkbookRels(sheetCount: number): string {
  const rels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`,
  ]
  for (let i = 1; i <= sheetCount; i++) {
    rels.push(`<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`)
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join('\n  ')}
</Relationships>`
}

function xlsxWorkbook(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 3}"/>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets}</sheets>
</workbook>`
}

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Build a worksheet XML and collect shared strings. */
function buildSheetXml(
  data: (string | number | boolean | null)[][],
  sharedStrings: string[],
  ssIndex: Map<string, number>,
): string {
  if (data.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData/>
</worksheet>`
  }

  const rows: string[] = []
  for (let r = 0; r < data.length; r++) {
    const row = data[r]!
    const cells: string[] = []
    for (let c = 0; c < row.length; c++) {
      const ref = colIndexToLetter(c) + (r + 1)
      const val = row[c]
      if (val === null || val === undefined) continue
      if (typeof val === 'number') {
        cells.push(`<c r="${ref}"><v>${val}</v></c>`)
      } else if (typeof val === 'boolean') {
        cells.push(`<c r="${ref}" t="b"><v>${val ? 1 : 0}</v></c>`)
      } else {
        // String → shared string
        const str = String(val)
        let idx = ssIndex.get(str)
        if (idx === undefined) {
          idx = sharedStrings.length
          sharedStrings.push(str)
          ssIndex.set(str, idx)
        }
        cells.push(`<c r="${ref}" t="s"><v>${idx}</v></c>`)
      }
    }
    if (cells.length > 0) {
      rows.push(`<row r="${r + 1}">${cells.join('')}</row>`)
    }
  }

  const maxCol = Math.max(...data.map((r) => r.length)) - 1
  const maxRow = data.length
  const dimension = `A1:${colIndexToLetter(maxCol)}${maxRow}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetData>${rows.join('')}</sheetData>
</worksheet>`
}

function buildSharedStringsXml(strings: string[]): string {
  const items = strings.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`
}

function colIndexToLetter(col: number): string {
  let result = ''
  let c = col
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result
    c = Math.floor(c / 26) - 1
  }
  return result
}

// ---------------------------------------------------------------------------
// Excel Query Tool
// ---------------------------------------------------------------------------

export const excelQueryTool = tool({
  description: excelQueryToolDef.description,
  inputSchema: zodSchema(excelQueryToolDef.parameters),
  execute: async (input) => {
    const { mode, filePath, sheet, xmlPath } = input as {
      mode: string
      filePath: string
      sheet?: string
      xmlPath?: string
    }

    // Handle .xls legacy format
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.xls') {
      return handleLegacyXls(filePath, mode, sheet)
    }

    const absPath = await resolveOfficeFile(filePath, ['.xlsx'])

    switch (mode) {
      case 'read-structure': {
        const entries = await listZipEntries(absPath)
        const readEntry = (p: string) => readZipEntryBuffer(absPath, p)
        const structure = await parseXlsxStructure(readEntry, entries, sheet)
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
        const entries = await listZipEntries(absPath)
        const readEntry = (p: string) => readZipEntryBuffer(absPath, p)
        const structure = await parseXlsxStructure(readEntry, entries)
        const lines: string[] = []
        for (const s of structure.sheets) {
          lines.push(`=== Sheet: ${s.name} (${s.rowCount}x${s.colCount}) ===`)
          // Read cells for each sheet
          const sheetStructure = await parseXlsxStructure(readEntry, entries, s.name)
          if (sheetStructure.cells) {
            for (const cell of sheetStructure.cells) {
              if (cell.value !== null) {
                lines.push(`${cell.ref}: ${cell.value}`)
              }
            }
          }
        }
        const text = lines.join('\n')
        const truncated = text.length > 200_000
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            text: truncated ? text.slice(0, 200_000) : text,
            truncated,
          },
        }
      }

      default:
        throw new Error(`Unknown mode: ${mode}`)
    }
  },
})

// ---------------------------------------------------------------------------
// Excel Mutate Tool
// ---------------------------------------------------------------------------

export const excelMutateTool = tool({
  description: excelMutateToolDef.description,
  inputSchema: zodSchema(excelMutateToolDef.parameters),
  execute: async (input) => {
    const { action, filePath, sheetName, data, edits } = input as {
      action: string
      filePath: string
      sheetName?: string
      data?: (string | number | boolean | null)[][]
      edits?: OfficeEdit[]
    }

    const { absPath } = resolveToolPath({ target: filePath })

    switch (action) {
      case 'create': {
        const wsName = sheetName || 'Sheet1'
        const sharedStrings: string[] = []
        const ssIndex = new Map<string, number>()
        const sheetXml = buildSheetXml(data ?? [[]], sharedStrings, ssIndex)

        const entries = new Map<string, Buffer>()
        entries.set('[Content_Types].xml', Buffer.from(xlsxContentTypes(1), 'utf-8'))
        entries.set('_rels/.rels', Buffer.from(XLSX_ROOT_RELS, 'utf-8'))
        entries.set('xl/_rels/workbook.xml.rels', Buffer.from(xlsxWorkbookRels(1), 'utf-8'))
        entries.set('xl/workbook.xml', Buffer.from(xlsxWorkbook([wsName]), 'utf-8'))
        entries.set('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf-8'))
        entries.set('xl/styles.xml', Buffer.from(XLSX_STYLES, 'utf-8'))
        entries.set('xl/sharedStrings.xml', Buffer.from(buildSharedStringsXml(sharedStrings), 'utf-8'))

        await createZip(absPath, entries)
        return {
          ok: true,
          data: { action, filePath: absPath, sheetName: wsName },
        }
      }

      case 'edit': {
        if (!edits || edits.length === 0) {
          throw new Error('edits is required for edit action.')
        }
        await resolveOfficeFile(filePath, ['.xlsx'])
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
// Legacy .xls handling (auto-convert to .xlsx via SheetJS)
// ---------------------------------------------------------------------------

async function handleLegacyXls(filePath: string, mode: string, sheet?: string) {
  const { absPath } = resolveToolPath({ target: filePath })
  const stat = await fs.stat(absPath)
  if (stat.size > 100 * 1024 * 1024) {
    throw new Error('File size exceeds 100 MB limit.')
  }

  // Convert .xls to .xlsx in memory using SheetJS
  const XLSX = await import('xlsx')
  const buf = await fs.readFile(absPath)
  const wb = XLSX.read(buf, { type: 'buffer' })

  // Write to temp .xlsx
  const tmpPath = absPath.replace(/\.xls$/i, '.xlsx')
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  await fs.writeFile(tmpPath, xlsxBuf)

  try {
    // Use the new .xlsx path for structure parsing
    const entries = await listZipEntries(tmpPath)
    const readEntry = (p: string) => readZipEntryBuffer(tmpPath, p)

    if (mode === 'read-structure') {
      const structure = await parseXlsxStructure(readEntry, entries, sheet)
      return {
        ok: true,
        data: {
          mode,
          fileName: path.basename(filePath),
          ...structure,
          legacy: true,
          convertedPath: tmpPath,
          hint: '该文件为旧版 .xls 格式，已自动转换为 .xlsx。如需编辑，请对转换后的 .xlsx 文件操作。',
        },
      }
    }

    if (mode === 'read-xml') {
      const entryList = await listZipEntries(tmpPath)
      return {
        ok: true,
        data: {
          mode,
          fileName: path.basename(filePath),
          entries: entryList,
          legacy: true,
          convertedPath: tmpPath,
        },
      }
    }

    // read-text
    const structure = await parseXlsxStructure(readEntry, entries)
    const lines: string[] = []
    for (const s of structure.sheets) {
      lines.push(`=== Sheet: ${s.name} ===`)
      const sheetData = await parseXlsxStructure(readEntry, entries, s.name)
      if (sheetData.cells) {
        for (const cell of sheetData.cells) {
          if (cell.value !== null) lines.push(`${cell.ref}: ${cell.value}`)
        }
      }
    }
    return {
      ok: true,
      data: {
        mode,
        fileName: path.basename(filePath),
        text: lines.join('\n'),
        legacy: true,
        convertedPath: tmpPath,
      },
    }
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}
