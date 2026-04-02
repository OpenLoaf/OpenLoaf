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
  pptxQueryToolDef,
  pptxMutateToolDef,
} from '@openloaf/api/types/tools/pptx'
import { resolveToolPath } from '@/ai/tools/toolScope'
import {
  resolveOfficeFile,
  listZipEntries,
  readZipEntryText,
  readZipEntryBuffer,
  editZip,
  createZip,
} from '@/ai/tools/office/streamingZip'
import { parsePptxStructure } from '@/ai/tools/office/structureParser'
import type { OfficeEdit } from '@/ai/tools/office/types'

const MAX_TEXT_LENGTH = 200_000
const MAX_XML_LENGTH = 200_000

// ---------------------------------------------------------------------------
// PPTX XML Templates (for create action)
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pptxContentTypes(slideCount: number): string {
  const overrides = [
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
  ]
  for (let i = 1; i <= slideCount; i++) {
    overrides.push(
      `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides.join('\n  ')}
</Types>`
}

const PPTX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

function pptxPresentationRels(slideCount: number): string {
  const rels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
  ]
  for (let i = 1; i <= slideCount; i++) {
    rels.push(
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join('\n  ')}
</Relationships>`
}

function pptxPresentation(slideCount: number): string {
  const sldIdLst = Array.from({ length: slideCount }, (_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIdLst}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
}

const PPTX_THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`

const PPTX_SLIDE_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`

const PPTX_SLIDE_MASTER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

const PPTX_SLIDE_LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`

const PPTX_SLIDE_LAYOUT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

type SlideContent = {
  title?: string
  textBlocks?: string[]
  notes?: string
}

function buildSlideXml(slide: SlideContent, slideIndex: number): string {
  const shapes: string[] = []
  let spId = 2

  // Title shape
  if (slide.title) {
    shapes.push(`<p:sp>
  <p:nvSpPr><p:cNvPr id="${spId}" name="Title ${spId}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="3200" b="1" dirty="0"/><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p></p:txBody>
</p:sp>`)
    spId++
  }

  // Text block shapes
  if (slide.textBlocks) {
    for (const text of slide.textBlocks) {
      shapes.push(`<p:sp>
  <p:nvSpPr><p:cNvPr id="${spId}" name="TextBox ${spId}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="457200" y="${1600200 + (spId - 3) * 400000}"/><a:ext cx="8229600" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1800" dirty="0"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody>
</p:sp>`)
      spId++
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      ${shapes.join('\n      ')}
    </p:spTree>
  </p:cSld>
</p:sld>`
}

function buildSlideRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
}

// ---------------------------------------------------------------------------
// PPTX Query Tool
// ---------------------------------------------------------------------------

export const pptxQueryTool = tool({
  description: pptxQueryToolDef.description,
  inputSchema: zodSchema(pptxQueryToolDef.parameters),
  execute: async (input) => {
    const { mode, filePath, xmlPath } = input as {
      mode: string
      filePath: string
      xmlPath?: string
    }

    // Handle .ppt legacy format
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.ppt') {
      return handleLegacyPpt(filePath, mode)
    }

    const absPath = await resolveOfficeFile(filePath, ['.pptx'])

    switch (mode) {
      case 'read-structure': {
        const entries = await listZipEntries(absPath)
        const readEntry = (p: string) => readZipEntryBuffer(absPath, p)
        const structure = await parsePptxStructure(readEntry, entries)
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
        const structure = await parsePptxStructure(readEntry, entries)
        const lines: string[] = []
        for (const slide of structure.slides) {
          lines.push(`=== Slide ${slide.index + 1} ===`)
          if (slide.title) lines.push(`Title: ${slide.title}`)
          for (const text of slide.textBlocks) {
            lines.push(text)
          }
        }
        const text = lines.join('\n')
        const truncated = text.length > MAX_TEXT_LENGTH
        return {
          ok: true,
          data: {
            mode,
            fileName: path.basename(filePath),
            text: truncated ? text.slice(0, MAX_TEXT_LENGTH) : text,
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
// PPTX Mutate Tool
// ---------------------------------------------------------------------------

export const pptxMutateTool = tool({
  description: pptxMutateToolDef.description,
  inputSchema: zodSchema(pptxMutateToolDef.parameters),
  execute: async (input) => {
    const { action, filePath, slides, edits } = input as {
      action: string
      filePath: string
      slides?: SlideContent[]
      edits?: OfficeEdit[]
    }

    const { absPath } = resolveToolPath({ target: filePath })

    switch (action) {
      case 'create': {
        if (!slides || slides.length === 0) {
          throw new Error('slides is required for create action.')
        }
        const entries = new Map<string, Buffer>()
        entries.set('[Content_Types].xml', Buffer.from(pptxContentTypes(slides.length), 'utf-8'))
        entries.set('_rels/.rels', Buffer.from(PPTX_ROOT_RELS, 'utf-8'))
        entries.set('ppt/_rels/presentation.xml.rels', Buffer.from(pptxPresentationRels(slides.length), 'utf-8'))
        entries.set('ppt/presentation.xml', Buffer.from(pptxPresentation(slides.length), 'utf-8'))
        entries.set('ppt/theme/theme1.xml', Buffer.from(PPTX_THEME, 'utf-8'))
        entries.set('ppt/slideMasters/slideMaster1.xml', Buffer.from(PPTX_SLIDE_MASTER, 'utf-8'))
        entries.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', Buffer.from(PPTX_SLIDE_MASTER_RELS, 'utf-8'))
        entries.set('ppt/slideLayouts/slideLayout1.xml', Buffer.from(PPTX_SLIDE_LAYOUT, 'utf-8'))
        entries.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', Buffer.from(PPTX_SLIDE_LAYOUT_RELS, 'utf-8'))

        for (let i = 0; i < slides.length; i++) {
          entries.set(`ppt/slides/slide${i + 1}.xml`, Buffer.from(buildSlideXml(slides[i]!, i), 'utf-8'))
          entries.set(`ppt/slides/_rels/slide${i + 1}.xml.rels`, Buffer.from(buildSlideRels(), 'utf-8'))
        }

        await createZip(absPath, entries)
        return {
          ok: true,
          data: { action, filePath: absPath, slideCount: slides.length },
        }
      }

      case 'edit': {
        if (!edits || edits.length === 0) {
          throw new Error('edits is required for edit action.')
        }
        await resolveOfficeFile(filePath, ['.pptx'])
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
// Legacy .ppt handling
// ---------------------------------------------------------------------------

function handleLegacyPpt(_filePath: string, _mode: string) {
  return {
    ok: false,
    error: '该文件为旧版 .ppt 格式，不支持直接读取。请先将文件转换为 .pptx 格式后重试，或使用 DocConvert 工具转换。',
  }
}
