/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Office 工具层测试（query/mutate roundtrip）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/officeTools.test.ts
 *
 * 测试覆盖：
 *   E 层 — Word 工具 Roundtrip
 *   F 层 — Excel 工具 Roundtrip
 *   G 层 — PPTX 工具 Roundtrip
 *   H 层 — 错误处理和边界情况
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { wordQueryTool, wordMutateTool } from '@/ai/tools/wordTools'
import { excelQueryTool, excelMutateTool } from '@/ai/tools/excelTools'
import { pptxQueryTool, pptxMutateTool } from '@/ai/tools/pptxTools'
import { resolveToolPath } from '@/ai/tools/toolScope'

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
// Helpers
// ---------------------------------------------------------------------------

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'office-tools-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

/** Get project root to construct relative paths for tool invocation. */
let projectRoot = ''
let testSubDir = ''

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  testSubDir = `_office_test_${Date.now()}`
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })
}

async function cleanupTestDir() {
  await fs.rm(path.join(projectRoot, testSubDir), { recursive: true, force: true }).catch(() => {})
}

/** Relative path within project for tool invocation. */
function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // -----------------------------------------------------------------------
  // E 层 — Word 工具 Roundtrip
  // -----------------------------------------------------------------------
  console.log('\nE 层 — Word 工具 Roundtrip')

  await test('E1: create → read-structure roundtrip', async () => {
    const filePath = rel('e1.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'heading', text: 'My Title', level: 1 },
            { type: 'paragraph', text: 'A normal paragraph.' },
            { type: 'table', headers: ['Name', 'Age'], rows: [['Alice', '30']] },
          ],
        },
        { toolCallId: 'e1', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'e1q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.paragraphs.length >= 2, 'should have paragraphs')
    assert.ok(result.data.tables.length >= 1, 'should have a table')
    assert.equal(result.data.paragraphs[0].style, 'Heading1')
  })

  await test('E2: create → read-text roundtrip', async () => {
    const filePath = rel('e2.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Hello from Word!' },
          ],
        },
        { toolCallId: 'e2', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-text', filePath },
        { toolCallId: 'e2q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Hello from Word!'), 'text should contain content')
  })

  await test('E3: create → read-xml (xmlPath="*")', async () => {
    const filePath = rel('e3.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'test' }],
        },
        { toolCallId: 'e3', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-xml', filePath, xmlPath: '*' },
        { toolCallId: 'e3q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(Array.isArray(result.data.entries), 'should have entries array')
    assert.ok(result.data.entries.includes('word/document.xml'), 'should include word/document.xml')
  })

  await test('E4: create → read-xml (xmlPath="word/document.xml")', async () => {
    const filePath = rel('e3.docx') // reuse from E3
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-xml', filePath, xmlPath: 'word/document.xml' },
        { toolCallId: 'e4q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(typeof result.data.xml === 'string', 'should return XML string')
    assert.ok(result.data.xml.includes('w:document'), 'should contain w:document')
  })

  await test('E5: create → edit (replace) → read-structure', async () => {
    const filePath = rel('e5.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Original text' },
            { type: 'paragraph', text: 'Keep this' },
          ],
        },
        { toolCallId: 'e5c', messages: [], abortSignal: AbortSignal.abort() },
      )
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'edit',
          filePath,
          edits: [
            {
              op: 'replace',
              path: 'word/document.xml',
              xpath: '//w:p[1]/w:r/w:t',
              xml: '<w:t xml:space="preserve">Edited text</w:t>',
            },
          ],
        },
        { toolCallId: 'e5e', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'e5q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.paragraphs[0].text, 'Edited text')
    assert.equal(result.data.paragraphs[1].text, 'Keep this')
  })

  await test('E6: create → edit (insert after) → read-structure', async () => {
    const filePath = rel('e6.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'First' },
            { type: 'paragraph', text: 'Third' },
          ],
        },
        { toolCallId: 'e6c', messages: [], abortSignal: AbortSignal.abort() },
      )
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'edit',
          filePath,
          edits: [
            {
              op: 'insert',
              path: 'word/document.xml',
              xpath: '//w:p[1]',
              position: 'after',
              xml: '<w:p><w:r><w:t>Second</w:t></w:r></w:p>',
            },
          ],
        },
        { toolCallId: 'e6e', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'e6q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.paragraphs[0].text, 'First')
    assert.equal(result.data.paragraphs[1].text, 'Second')
    assert.equal(result.data.paragraphs[2].text, 'Third')
  })

  await test('E7: create → edit (remove) → read-structure', async () => {
    const filePath = rel('e7.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Keep' },
            { type: 'paragraph', text: 'Remove me' },
          ],
        },
        { toolCallId: 'e7c', messages: [], abortSignal: AbortSignal.abort() },
      )
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'edit',
          filePath,
          edits: [
            {
              op: 'remove',
              path: 'word/document.xml',
              xpath: '//w:p[2]',
            },
          ],
        },
        { toolCallId: 'e7e', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'e7q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.paragraphs.length, 1)
    assert.equal(result.data.paragraphs[0].text, 'Keep')
  })

  await test('E8: create 含 XML 特殊字符', async () => {
    const filePath = rel('e8.docx')
    const specialText = 'Tom & Jerry <heroes> "quoted" \'apos\''
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: specialText }],
        },
        { toolCallId: 'e8', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-text', filePath },
        { toolCallId: 'e8q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Tom & Jerry'), 'should contain ampersand')
    assert.ok(result.data.text.includes('<heroes>'), 'should contain angle brackets')
    assert.ok(result.data.text.includes('"quoted"'), 'should contain quotes')
  })

  await test('E9: create 含 bullet-list + numbered-list', async () => {
    const filePath = rel('e9.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [
            { type: 'bullet-list', items: ['Bullet A', 'Bullet B'] },
            { type: 'numbered-list', items: ['Num 1', 'Num 2'] },
          ],
        },
        { toolCallId: 'e9', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'e9q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    // bullet-list(2 items) + numbered-list(2 items) = 4 paragraphs
    assert.equal(result.data.paragraphs.length, 4)
    assert.equal(result.data.paragraphs[0].text, 'Bullet A')
    assert.equal(result.data.paragraphs[2].text, 'Num 1')
  })

  await test('E10: edit 缺少 edits 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordMutateTool.execute(
            { actionName: 'test', action: 'edit', filePath: rel('e10.docx') },
            { toolCallId: 'e10', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /edits is required/,
    )
  })

  await test('E11: create 缺少 content 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordMutateTool.execute(
            { actionName: 'test', action: 'create', filePath: rel('e11.docx') },
            { toolCallId: 'e11', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /content is required/,
    )
  })

  await test('E12: query 不支持的扩展名 (.txt) 抛出错误', async () => {
    // Create a dummy txt file first
    const txtFile = rel('e12.txt')
    const absPath = path.join(projectRoot, txtFile)
    await fs.writeFile(absPath, 'dummy', 'utf-8')
    await assert.rejects(
      () =>
        withCtx(() =>
          wordQueryTool.execute(
            { actionName: 'test', mode: 'read-structure', filePath: txtFile },
            { toolCallId: 'e12', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /Unsupported file format/,
    )
  })

  // -----------------------------------------------------------------------
  // F 层 — Excel 工具 Roundtrip
  // -----------------------------------------------------------------------
  console.log('\nF 层 — Excel 工具 Roundtrip')

  await test('F1: create → read-structure roundtrip', async () => {
    const filePath = rel('f1.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          data: [
            ['Name', 'Score'],
            ['Alice', 95],
            ['Bob', 88],
          ],
        },
        { toolCallId: 'f1', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'f1q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.sheets[0].name, 'Sheet1')
    assert.ok(result.data.sheets[0].rowCount > 0, 'should have rows')
    assert.ok(result.data.sheets[0].colCount > 0, 'should have cols')
  })

  await test('F2: create with data → read-structure with sheet', async () => {
    const filePath = rel('f1.xlsx') // reuse from F1
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath, sheet: 'Sheet1' },
        { toolCallId: 'f2q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.cells, 'should have cells')
    const nameCell = result.data.cells.find((c: any) => c.value === 'Name')
    assert.ok(nameCell, 'should find Name cell')
    const scoreCell = result.data.cells.find((c: any) => c.value === 95)
    assert.ok(scoreCell, 'should find score cell')
  })

  await test('F3: create → read-xml (xmlPath="*")', async () => {
    const filePath = rel('f1.xlsx')
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-xml', filePath, xmlPath: '*' },
        { toolCallId: 'f3q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.entries.includes('xl/worksheets/sheet1.xml'))
  })

  await test('F4: create → read-text', async () => {
    const filePath = rel('f1.xlsx')
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-text', filePath },
        { toolCallId: 'f4q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Sheet1'), 'should include sheet name')
    assert.ok(result.data.text.includes('Name'), 'should include cell data')
  })

  await test('F5: create → edit (replace cell value) → read-structure', async () => {
    const filePath = rel('f5.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          data: [['X', 100]],
        },
        { toolCallId: 'f5c', messages: [], abortSignal: AbortSignal.abort() },
      )
      // Replace the entire <c> element to avoid namespace mismatch on inner <v>
      // XLSX uses default namespace — XPath needs x: prefix
      await excelMutateTool.execute(
        {
          actionName: 'test',
          action: 'edit',
          filePath,
          edits: [
            {
              op: 'replace',
              path: 'xl/worksheets/sheet1.xml',
              xpath: '//x:row[@r="1"]/x:c[@r="B1"]',
              xml: '<c r="B1" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><v>999</v></c>',
            },
          ],
        },
        { toolCallId: 'f5e', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath, sheet: 'Sheet1' },
        { toolCallId: 'f5q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    const cell = result.data.cells.find((c: any) => c.ref === 'B1')
    assert.ok(cell, 'should find cell B1')
    assert.equal(cell.value, 999)
  })

  await test('F6: create 含混合类型数据', async () => {
    const filePath = rel('f6.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          data: [
            ['text', 42, true, null],
          ],
        },
        { toolCallId: 'f6', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath, sheet: 'Sheet1' },
        { toolCallId: 'f6q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.cells, 'should have cells')
    const strCell = result.data.cells.find((c: any) => c.value === 'text')
    assert.ok(strCell, 'should have string cell')
    assert.equal(strCell.type, 'string')
    const numCell = result.data.cells.find((c: any) => c.value === 42)
    assert.ok(numCell, 'should have number cell')
    assert.equal(numCell.type, 'number')
    const boolCell = result.data.cells.find((c: any) => c.ref === 'C1')
    assert.ok(boolCell, 'should have boolean cell')
    assert.equal(boolCell.type, 'boolean')
    // null cells are skipped during creation
  })

  await test('F7: create 含 sheetName 参数', async () => {
    const filePath = rel('f7.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          sheetName: 'MySheet',
          data: [['A']],
        },
        { toolCallId: 'f7', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'f7q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.sheets[0].name, 'MySheet')
  })

  await test('F8: edit 缺少 edits 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelMutateTool.execute(
            { actionName: 'test', action: 'edit', filePath: rel('f8.xlsx') },
            { toolCallId: 'f8', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /edits is required/,
    )
  })

  await test('F9: colIndexToLetter 边界验证', async () => {
    // Create with 27 columns to test A (0), Z (25), AA (26)
    const filePath = rel('f9.xlsx')
    const row: (string | number)[] = []
    for (let i = 0; i <= 26; i++) {
      row.push(`col${i}`)
    }
    await withCtx(async () => {
      await excelMutateTool.execute(
        { actionName: 'test', action: 'create', filePath, data: [row] },
        { toolCallId: 'f9', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      excelQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath, sheet: 'Sheet1' },
        { toolCallId: 'f9q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    const cells = result.data.cells
    const cellA1 = cells.find((c: any) => c.ref === 'A1')
    assert.ok(cellA1, 'should have A1')
    assert.equal(cellA1.value, 'col0')
    const cellZ1 = cells.find((c: any) => c.ref === 'Z1')
    assert.ok(cellZ1, 'should have Z1')
    assert.equal(cellZ1.value, 'col25')
    const cellAA1 = cells.find((c: any) => c.ref === 'AA1')
    assert.ok(cellAA1, 'should have AA1')
    assert.equal(cellAA1.value, 'col26')
  })

  // -----------------------------------------------------------------------
  // G 层 — PPTX 工具 Roundtrip
  // -----------------------------------------------------------------------
  console.log('\nG 层 — PPTX 工具 Roundtrip')

  await test('G1: create → read-structure roundtrip', async () => {
    const filePath = rel('g1.pptx')
    await withCtx(async () => {
      await pptxMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          slides: [
            { title: 'Intro', textBlocks: ['Welcome to the presentation'] },
          ],
        },
        { toolCallId: 'g1', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'g1q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.slideCount, 1)
    assert.equal(result.data.slides[0].title, 'Intro')
    assert.ok(
      result.data.slides[0].textBlocks.some((t: string) => t.includes('Welcome')),
      'should contain text block',
    )
  })

  await test('G2: create → read-text', async () => {
    const filePath = rel('g1.pptx') // reuse from G1
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-text', filePath },
        { toolCallId: 'g2q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Intro'), 'should contain slide title')
    assert.ok(result.data.text.includes('Welcome'), 'should contain text block')
  })

  await test('G3: create → read-xml (xmlPath="*")', async () => {
    const filePath = rel('g1.pptx')
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-xml', filePath, xmlPath: '*' },
        { toolCallId: 'g3q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.entries.includes('ppt/slides/slide1.xml'))
  })

  await test('G4: create → edit (replace text) → read-structure', async () => {
    const filePath = rel('g4.pptx')
    await withCtx(async () => {
      await pptxMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          slides: [
            { title: 'Old Title', textBlocks: ['Old body'] },
          ],
        },
        { toolCallId: 'g4c', messages: [], abortSignal: AbortSignal.abort() },
      )
      await pptxMutateTool.execute(
        {
          actionName: 'test',
          action: 'edit',
          filePath,
          edits: [
            {
              op: 'replace',
              path: 'ppt/slides/slide1.xml',
              xpath: '//p:sp[1]//a:t',
              xml: '<a:t>New Title</a:t>',
            },
          ],
        },
        { toolCallId: 'g4e', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'g4q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.slides[0].title, 'New Title')
  })

  await test('G5: create 多个 slide', async () => {
    const filePath = rel('g5.pptx')
    await withCtx(async () => {
      await pptxMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          slides: [
            { title: 'Slide 1' },
            { title: 'Slide 2' },
            { title: 'Slide 3' },
          ],
        },
        { toolCallId: 'g5', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath },
        { toolCallId: 'g5q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.slideCount, 3)
    assert.equal(result.data.slides[0].title, 'Slide 1')
    assert.equal(result.data.slides[1].title, 'Slide 2')
    assert.equal(result.data.slides[2].title, 'Slide 3')
  })

  await test('G6: create 空 slides 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pptxMutateTool.execute(
            { actionName: 'test', action: 'create', filePath: rel('g6.pptx'), slides: [] },
            { toolCallId: 'g6', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /slides is required/,
    )
  })

  await test('G7: create 含 XML 特殊字符', async () => {
    const filePath = rel('g7.pptx')
    const specialText = 'A & B <test> "quote"'
    await withCtx(async () => {
      await pptxMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          slides: [{ title: specialText }],
        },
        { toolCallId: 'g7', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-text', filePath },
        { toolCallId: 'g7q', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('A & B'), 'should contain ampersand')
    assert.ok(result.data.text.includes('<test>'), 'should contain angle brackets')
  })

  // -----------------------------------------------------------------------
  // H 层 — 错误处理和边界情况
  // -----------------------------------------------------------------------
  console.log('\nH 层 — 错误处理和边界情况')

  await test('H1: WordQuery: 不存在的文件抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordQueryTool.execute(
            { actionName: 'test', mode: 'read-structure', filePath: rel('nonexistent.docx') },
            { toolCallId: 'h1', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('H2: WordQuery: 未知 mode 抛出错误', async () => {
    // Create a file first
    const filePath = rel('h2.docx')
    await withCtx(async () => {
      await wordMutateTool.execute(
        {
          actionName: 'test',
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'test' }],
        },
        { toolCallId: 'h2c', messages: [], abortSignal: AbortSignal.abort() },
      )
    })
    await assert.rejects(
      () =>
        withCtx(() =>
          wordQueryTool.execute(
            { actionName: 'test', mode: 'unknown-mode' as any, filePath },
            { toolCallId: 'h2', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /Unknown mode/,
    )
  })

  await test('H3: WordMutate: 未知 action 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordMutateTool.execute(
            { actionName: 'test', action: 'unknown' as any, filePath: rel('h3.docx') },
            { toolCallId: 'h3', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /Unknown action/,
    )
  })

  await test('H4: ExcelMutate: 未知 action 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelMutateTool.execute(
            { actionName: 'test', action: 'unknown' as any, filePath: rel('h4.xlsx') },
            { toolCallId: 'h4', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /Unknown action/,
    )
  })

  await test('H5: PptxMutate: 未知 action 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pptxMutateTool.execute(
            { actionName: 'test', action: 'unknown' as any, filePath: rel('h5.pptx') },
            { toolCallId: 'h5', messages: [], abortSignal: AbortSignal.abort() },
          ),
        ),
      /Unknown action/,
    )
  })

  await test('H6: WordQuery: .doc 文件 read-structure 返回 ok=false', async () => {
    // Create a dummy .doc file
    const docFile = rel('h6.doc')
    const absPath = path.join(projectRoot, docFile)
    await fs.writeFile(absPath, 'dummy doc content', 'utf-8')
    const result: any = await withCtx(() =>
      wordQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath: docFile },
        { toolCallId: 'h6', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, false)
    assert.ok(result.error, 'should have error message')
  })

  await test('H7: PptxQuery: .ppt 文件 read-structure 返回 ok=false', async () => {
    const pptFile = rel('h7.ppt')
    const absPath = path.join(projectRoot, pptFile)
    await fs.writeFile(absPath, 'dummy ppt content', 'utf-8')
    const result: any = await withCtx(() =>
      pptxQueryTool.execute(
        { actionName: 'test', mode: 'read-structure', filePath: pptFile },
        { toolCallId: 'h7', messages: [], abortSignal: AbortSignal.abort() },
      ),
    )
    assert.equal(result.ok, false)
    assert.ok(result.error, 'should have error message')
  })

  // -----------------------------------------------------------------------
  // Cleanup & Summary
  // -----------------------------------------------------------------------
  await cleanupTestDir()

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
