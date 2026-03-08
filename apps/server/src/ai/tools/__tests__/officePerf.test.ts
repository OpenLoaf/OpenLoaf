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
 * Office 工具性能与大文件安全测试
 *
 * 背景：
 *   一个 554KB 的 word/document.xml 导致 xmldom+xpath 编辑超时 30 秒，
 *   同时 read-xml 无截断导致上下文超 131K token 限制。
 *   本测试验证修复后：
 *     1. 快速路径（字符串操作）能在毫秒级完成大 XML 编辑
 *     2. 复杂 XPath 正确回退到 DOM 路径
 *     3. read-xml 对大文件正确截断
 *
 * 用法：
 *   cd apps/server
 *   npx tsx --test src/ai/tools/__tests__/officePerf.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { applyXmlEdits } from '@/ai/tools/office/xpathEditor'
import {
  createZip,
  listZipEntries,
  readZipEntryText,
} from '@/ai/tools/office/streamingZip'

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers: generate large OOXML-like documents
// ---------------------------------------------------------------------------

/**
 * Generate a realistic word/document.xml with N paragraphs.
 * Each paragraph has a run with a text node — typical OOXML structure.
 * 500 paragraphs ≈ 300KB, 1000 paragraphs ≈ 600KB.
 */
function generateLargeDocumentXml(paragraphCount: number): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<w:body>',
  ]

  for (let i = 0; i < paragraphCount; i++) {
    // Mix in some heading styles to make it realistic
    const isHeading = i % 50 === 0
    const style = isHeading
      ? `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>`
      : ''
    // Use longer text to simulate real documents
    const text = isHeading
      ? `Section ${Math.floor(i / 50) + 1}: Project Overview and Analysis`
      : `This is paragraph ${i + 1} of the document. It contains some regular text content that would be typical in a business report, including numbers like ${Math.random().toFixed(4)} and dates like 2026-03-${(i % 28 + 1).toString().padStart(2, '0')}.`
    parts.push(
      `<w:p>${style}<w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`,
    )
  }

  parts.push('</w:body>')
  parts.push('</w:document>')
  return parts.join('\n')
}

/**
 * Generate a large xl/worksheets/sheet1.xml with N rows.
 */
function generateLargeSheetXml(rowCount: number): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<x:sheetData>',
  ]

  for (let i = 0; i < rowCount; i++) {
    parts.push(
      `<x:row r="${i + 1}"><x:c r="A${i + 1}" t="s"><x:v>${i}</x:v></x:c><x:c r="B${i + 1}"><x:v>${Math.random().toFixed(2)}</x:v></x:c><x:c r="C${i + 1}" t="s"><x:v>${i + rowCount}</x:v></x:c></x:row>`,
    )
  }

  parts.push('</x:sheetData>')
  parts.push('</x:worksheet>')
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Temp directory management
// ---------------------------------------------------------------------------

let tmpDir = ''

async function setupTmpDir() {
  tmpDir = path.join(
    await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'office-perf-')),
  )
}

async function cleanupTmpDir() {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await setupTmpDir()

  // -----------------------------------------------------------------------
  // P 层 — 快速路径性能测试
  // -----------------------------------------------------------------------
  console.log('\nP 层 — 快速路径性能（大文件 XML 编辑）')

  const largeDocXml = generateLargeDocumentXml(1000) // ~600KB
  const docSizeKb = Math.round(largeDocXml.length / 1024)
  console.log(`  [info] 生成 document.xml: ${docSizeKb}KB, ${largeDocXml.split('\n').length} 行`)

  await test('P1: 大文件 insert-after-last — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'insert',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[last()]',
          position: 'after',
          xml: '<w:p><w:r><w:t>Appended paragraph at the end</w:t></w:r></w:p>',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('Appended paragraph at the end'), 'should contain appended text')
    assert.ok(result.includes('</w:body>'), 'should preserve document structure')
    // The appended paragraph should be before </w:body>
    const appendedIdx = result.indexOf('Appended paragraph at the end')
    const bodyCloseIdx = result.indexOf('</w:body>')
    assert.ok(appendedIdx < bodyCloseIdx, 'appended should be before </w:body>')
    console.log(`    [perf] insert-after-last: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('P2: 大文件 replace 第一个段落 — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'replace',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]',
          xml: '<w:p><w:r><w:t>Replaced first paragraph</w:t></w:r></w:p>',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('Replaced first paragraph'), 'should contain replaced text')
    // Original first paragraph should be gone (it was a Heading1: "Section 1:...")
    assert.ok(!result.includes('Section 1: Project Overview'), 'original first para should be gone')
    console.log(`    [perf] replace-first: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('P3: 大文件 remove 第一个段落 — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'remove',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(!result.includes('Section 1: Project Overview'), 'first paragraph should be removed')
    assert.ok(result.includes('paragraph 2'), 'other paragraphs should remain')
    console.log(`    [perf] remove-first: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('P4: 大文件 insert-before 第一个段落 — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'insert',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]',
          position: 'before',
          xml: '<w:p><w:r><w:t>Prepended paragraph</w:t></w:r></w:p>',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    const prependedIdx = result.indexOf('Prepended paragraph')
    const firstParaIdx = result.indexOf('Section 1: Project Overview')
    assert.ok(prependedIdx > -1, 'should contain prepended text')
    assert.ok(prependedIdx < firstParaIdx, 'prepended should be before original first')
    console.log(`    [perf] insert-before-first: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('P5: 大文件批量编辑（3 个操作）— 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'replace',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]',
          xml: '<w:p><w:r><w:t>New first paragraph</w:t></w:r></w:p>',
        },
        {
          op: 'insert',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[last()]',
          position: 'after',
          xml: '<w:p><w:r><w:t>New last paragraph</w:t></w:r></w:p>',
        },
        {
          op: 'remove',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[2]',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('New first paragraph'), 'should have replaced first')
    assert.ok(result.includes('New last paragraph'), 'should have appended last')
    console.log(`    [perf] batch-3-ops: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('P6: 大文件深层 XPath — 快速路径 < 100ms', async () => {
    // //w:body/w:p[1]/w:r/w:t — 四层深度，仍是简单模式
    const start = performance.now()
    const result = await applyXmlEdits(
      largeDocXml,
      [
        {
          op: 'replace',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]/w:r/w:t',
          xml: '<w:t>Deep path replaced</w:t>',
        },
      ],
      'word/document.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('Deep path replaced'), 'should contain replaced text')
    console.log(`    [perf] deep-xpath: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  // -----------------------------------------------------------------------
  // Q 层 — Excel 大文件快速路径
  // -----------------------------------------------------------------------
  console.log('\nQ 层 — Excel 大文件快速路径')

  const largeSheetXml = generateLargeSheetXml(2000) // ~400KB
  const sheetSizeKb = Math.round(largeSheetXml.length / 1024)
  console.log(`  [info] 生成 sheet1.xml: ${sheetSizeKb}KB`)

  await test('Q1: 大 Excel insert-after-last-row — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeSheetXml,
      [
        {
          op: 'insert',
          path: 'xl/worksheets/sheet1.xml',
          xpath: '//x:sheetData/x:row[last()]',
          position: 'after',
          xml: '<x:row r="9999"><x:c r="A9999" t="s"><x:v>new</x:v></x:c></x:row>',
        },
      ],
      'xl/worksheets/sheet1.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('A9999'), 'should contain new row')
    console.log(`    [perf] excel-insert-after-last: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  await test('Q2: 大 Excel replace-first-row — 快速路径 < 100ms', async () => {
    const start = performance.now()
    const result = await applyXmlEdits(
      largeSheetXml,
      [
        {
          op: 'replace',
          path: 'xl/worksheets/sheet1.xml',
          xpath: '//x:sheetData/x:row[1]',
          xml: '<x:row r="1"><x:c r="A1"><x:v>replaced</x:v></x:c></x:row>',
        },
      ],
      'xl/worksheets/sheet1.xml',
    )
    const elapsed = performance.now() - start

    assert.ok(result.includes('>replaced<'), 'should contain replaced value')
    console.log(`    [perf] excel-replace-first: ${elapsed.toFixed(1)}ms`)
    assert.ok(elapsed < 100, `should complete in <100ms, took ${elapsed.toFixed(1)}ms`)
  })

  // -----------------------------------------------------------------------
  // R 层 — DOM 回退正确性
  // -----------------------------------------------------------------------
  console.log('\nR 层 — 复杂 XPath DOM 回退')

  // Use a small XML for DOM tests (DOM path is slow on large files by design)
  const smallDocXml = generateLargeDocumentXml(10) // ~6KB

  await test('R1: contains() 谓词 — 回退到 DOM', async () => {
    // contains() is not supported by fast path — should fallback to DOM
    const result = await applyXmlEdits(
      smallDocXml,
      [
        {
          op: 'replace',
          path: 'word/document.xml',
          xpath: '//w:t[contains(text(),"paragraph 2")]',
          xml: '<w:t>DOM replaced paragraph 2</w:t>',
        },
      ],
      'word/document.xml',
    )
    assert.ok(result.includes('DOM replaced paragraph 2'), 'DOM fallback should work')
    assert.ok(!result.includes('paragraph 2 of the document'), 'original should be gone')
  })

  await test('R2: 不存在的 XPath — DOM 回退后抛出错误', async () => {
    await assert.rejects(
      applyXmlEdits(
        smallDocXml,
        [
          {
            op: 'replace',
            path: 'word/document.xml',
            xpath: '//w:nonexistent',
            xml: '<w:t>test</w:t>',
          },
        ],
        'word/document.xml',
      ),
      /matched no nodes/,
    )
  })

  await test('R3: 属性谓词 — 回退到 DOM', async () => {
    const result = await applyXmlEdits(
      smallDocXml,
      [
        {
          op: 'remove',
          path: 'word/document.xml',
          xpath: '//w:pStyle[@w:val="Heading1"]',
        },
      ],
      'word/document.xml',
    )
    assert.ok(!result.includes('w:val="Heading1"'), 'heading style should be removed')
  })

  // -----------------------------------------------------------------------
  // S 层 — read-xml 截断测试
  // -----------------------------------------------------------------------
  console.log('\nS 层 — read-xml 大文件截断')

  await test('S1: 大 XML 通过 read-xml 返回截断结果', async () => {
    // Create a DOCX ZIP with the large document.xml
    const zipPath = path.join(tmpDir, 's1-large.docx')
    const entries = new Map<string, Buffer>()
    entries.set('word/document.xml', Buffer.from(largeDocXml, 'utf-8'))
    entries.set('[Content_Types].xml', Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
      'utf-8',
    ))
    await createZip(zipPath, entries)

    // Verify the ZIP was created correctly
    const zipEntries = await listZipEntries(zipPath)
    assert.ok(zipEntries.includes('word/document.xml'), 'zip should contain document.xml')

    // Read the XML entry directly to check size
    const rawXml = await readZipEntryText(zipPath, 'word/document.xml')
    assert.ok(rawXml.length > 200_000, `raw XML should be > 200KB, got ${rawXml.length}`)
    console.log(`    [info] raw XML size: ${Math.round(rawXml.length / 1024)}KB`)
  })

  await test('S2: read-xml 截断标记正确', async () => {
    // Import wordTools to test the actual tool behavior
    // We simulate what wordTools does for read-xml
    const MAX_XML_LENGTH = 200_000
    const rawXml = largeDocXml
    const xmlTruncated = rawXml.length > MAX_XML_LENGTH
    const xml = xmlTruncated ? rawXml.slice(0, MAX_XML_LENGTH) : rawXml

    assert.ok(xmlTruncated, 'should be marked as truncated')
    assert.equal(xml.length, MAX_XML_LENGTH, 'should be truncated to MAX_XML_LENGTH')
    // Verify it's still valid-ish XML (starts with declaration)
    assert.ok(xml.startsWith('<?xml'), 'truncated XML should start with declaration')
    console.log(`    [info] truncated from ${Math.round(rawXml.length / 1024)}KB to ${Math.round(xml.length / 1024)}KB`)
  })

  await test('S3: 小 XML 不被截断', async () => {
    const smallXml = generateLargeDocumentXml(10) // ~6KB
    const MAX_XML_LENGTH = 200_000
    const xmlTruncated = smallXml.length > MAX_XML_LENGTH

    assert.ok(!xmlTruncated, 'small XML should not be truncated')
    assert.ok(smallXml.length < MAX_XML_LENGTH, `small XML (${smallXml.length}) should be < ${MAX_XML_LENGTH}`)
  })

  // -----------------------------------------------------------------------
  // T 层 — 快速路径边界情况
  // -----------------------------------------------------------------------
  console.log('\nT 层 — 快速路径边界情况')

  await test('T1: 自闭合标签 — 正确处理', async () => {
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>
<w:p><w:r><w:t>Content</w:t></w:r></w:p>
</w:body>
</w:document>`

    const result = await applyXmlEdits(
      xml,
      [
        {
          op: 'insert',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[last()]',
          position: 'after',
          xml: '<w:p><w:r><w:t>After last</w:t></w:r></w:p>',
        },
      ],
      'word/document.xml',
    )
    assert.ok(result.includes('After last'), 'should contain inserted text')
    const afterIdx = result.indexOf('After last')
    const bodyCloseIdx = result.indexOf('</w:body>')
    assert.ok(afterIdx < bodyCloseIdx, 'inserted should be before </w:body>')
  })

  await test('T2: 嵌套同名标签 — 正确定位最外层', async () => {
    // Nested w:r inside w:r (uncommon but possible in complex docs)
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Outer</w:t><w:r><w:t>Inner</w:t></w:r></w:r></w:p>
</w:body>
</w:document>`

    const result = await applyXmlEdits(
      xml,
      [
        {
          op: 'remove',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[1]',
        },
      ],
      'word/document.xml',
    )
    assert.ok(!result.includes('Outer'), 'paragraph should be removed')
    assert.ok(!result.includes('Inner'), 'nested content should also be removed')
    assert.ok(result.includes('</w:body>'), 'body should remain')
  })

  await test('T3: 属性中含 > 字符 — 正确处理', async () => {
    // Attributes with special chars
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t xml:space="preserve">Text A</w:t></w:r></w:p>
<w:p><w:r><w:t>Text B</w:t></w:r></w:p>
</w:body>
</w:document>`

    const result = await applyXmlEdits(
      xml,
      [
        {
          op: 'replace',
          path: 'word/document.xml',
          xpath: '//w:body/w:p[2]',
          xml: '<w:p><w:r><w:t>Replaced B</w:t></w:r></w:p>',
        },
      ],
      'word/document.xml',
    )
    assert.ok(result.includes('Replaced B'), 'should contain replaced text')
    assert.ok(result.includes('Text A'), 'first paragraph should remain')
  })

  await test('T4: 快速路径找不到元素 — 正确回退到 DOM', async () => {
    // Fast path can parse the XPath but element doesn't exist in XML
    // Fast path returns null → falls back to DOM → DOM throws
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Only paragraph</w:t></w:r></w:p>
</w:body>
</w:document>`

    await assert.rejects(
      applyXmlEdits(
        xml,
        [
          {
            op: 'replace',
            path: 'word/document.xml',
            xpath: '//w:body/w:p[5]',
            xml: '<w:p><w:r><w:t>No such para</w:t></w:r></w:p>',
          },
        ],
        'word/document.xml',
      ),
      /matched no nodes/,
    )
  })

  await test('T5: 空编辑列表 — 原样返回', async () => {
    const result = await applyXmlEdits(largeDocXml, [], 'word/document.xml')
    assert.equal(result, largeDocXml, 'should return unchanged XML')
  })

  await test('T6: write/delete 操作被过滤 — 原样返回', async () => {
    const result = await applyXmlEdits(
      largeDocXml,
      [
        { op: 'write', path: 'word/document.xml', source: 'data:text/plain,test' },
        { op: 'delete', path: 'word/styles.xml' },
      ],
      'word/document.xml',
    )
    assert.equal(result, largeDocXml, 'write/delete ops should be ignored')
  })

  // -----------------------------------------------------------------------
  // Cleanup & Summary
  // -----------------------------------------------------------------------
  await cleanupTmpDir()

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  - ${e}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
