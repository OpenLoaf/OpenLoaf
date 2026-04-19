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
 * Office 工具层测试（mutate + 统一 Read 工具 roundtrip）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/officeTools.test.ts
 *
 * 测试覆盖：
 *   E 层 — Word Mutate + Read roundtrip
 *   F 层 — Excel Mutate + Read roundtrip
 *   G 层 — PPTX Mutate + Read roundtrip
 *   H 层 — Mutate 错误处理
 *
 * 注意：原 wordQueryTool / excelQueryTool / pptxQueryTool 已废弃，
 * 统一由 readTool（@/ai/tools/fileTools）派发到对应提取器。
 * read-xml / read-structure 等结构化模式已移除，相关用例随之删除或改写为
 * 基于 readTool 输出文本的断言。
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { wordMutateTool } from '@/ai/tools/wordTools'
import { excelMutateTool } from '@/ai/tools/excelTools'
import { pptxMutateTool } from '@/ai/tools/pptxTools'
import { readTool } from '@/ai/tools/fileTools'
import { ensureWritableRoot, resolveToolPath } from '@/ai/tools/toolScope'

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
  // *Mutate.create pins new files to the session asset dir (or project root).
  // Align the test sandbox so create-side writes and readback paths converge.
  projectRoot = await withCtx(async () => (await ensureWritableRoot()).rootPath)
  testSubDir = `_office_test_${Date.now()}`
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })
}

async function cleanupTestDir() {
  await fs.rm(path.join(projectRoot, testSubDir), { recursive: true, force: true }).catch(() => {})
}

/** Absolute path within the writable root (session asset dir / project). */
function rel(filename: string): string {
  return path.join(projectRoot, testSubDir, filename)
}

const toolCtx = (id: string) => ({
  toolCallId: id,
  messages: [],
  abortSignal: AbortSignal.abort(),
})

/** Invoke the unified Read tool against a project-relative path. */
async function readDoc(
  filePath: string,
  opts: { sheetName?: string } = {},
): Promise<string> {
  return (await withCtx(() =>
    readTool.execute({ file_path: filePath, ...opts }, toolCtx('read')),
  )) as string
}

/** Extract `<meta>{...}</meta>` JSON block from a Read tool envelope. */
function parseMeta(xml: string): Record<string, unknown> | null {
  const match = xml.match(/<meta>(.*?)<\/meta>/s)
  if (!match) return null
  try {
    return JSON.parse(match[1] ?? '')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // -----------------------------------------------------------------------
  // E 层 — Word Mutate + Read roundtrip
  // -----------------------------------------------------------------------
  console.log('\nE 层 — Word Mutate + Read roundtrip')

  await test('E1: create → read back via readTool', async () => {
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
        toolCtx('e1'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('type="docx"'), 'should be docx envelope')
    assert.ok(xml.includes('My Title'), 'should contain heading text')
    assert.ok(xml.includes('A normal paragraph'), 'should contain paragraph text')
    assert.ok(xml.includes('Alice'), 'should contain table cell text')
  })

  await test('E2: create → read text content', async () => {
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
        toolCtx('e2'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('Hello from Word!'), 'text should contain content')
  })

  await test('E5: create → edit (replace) → read back text', async () => {
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
        toolCtx('e5c'),
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
        toolCtx('e5e'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('Edited text'), 'should contain edited text')
    assert.ok(!xml.includes('Original text'), 'original text should be gone')
    assert.ok(xml.includes('Keep this'), 'untouched paragraph should remain')
  })

  await test('E6: create → edit (insert after) → read back text', async () => {
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
        toolCtx('e6c'),
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
        toolCtx('e6e'),
      )
    })
    const xml = await readDoc(filePath)
    const firstIdx = xml.indexOf('First')
    const secondIdx = xml.indexOf('Second')
    const thirdIdx = xml.indexOf('Third')
    assert.ok(firstIdx >= 0, 'should contain First')
    assert.ok(secondIdx >= 0, 'should contain inserted Second')
    assert.ok(thirdIdx >= 0, 'should contain Third')
    assert.ok(firstIdx < secondIdx && secondIdx < thirdIdx, 'order should be First → Second → Third')
  })

  await test('E7: create → edit (remove) → read back text', async () => {
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
        toolCtx('e7c'),
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
        toolCtx('e7e'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('Keep'), 'should keep retained paragraph')
    assert.ok(!xml.includes('Remove me'), 'removed paragraph should be gone')
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
        toolCtx('e8'),
      )
    })
    const xml = await readDoc(filePath)
    // Read tool xml-escapes the file envelope attrs but the docx markdown
    // body keeps the original text (mammoth → turndown). The Read envelope
    // wraps the body inside <content>...</content> verbatim, so we can match
    // the original characters directly. Note: '&' may be html-escaped to
    // `&amp;` by the html-to-markdown stage — accept either form.
    assert.ok(
      xml.includes('Tom & Jerry') || xml.includes('Tom &amp; Jerry'),
      'should contain ampersand (raw or escaped)',
    )
    assert.ok(xml.includes('Jerry'), 'should contain jerry')
    assert.ok(xml.includes('quoted'), 'should contain quoted text')
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
        toolCtx('e9'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('Bullet A'), 'should contain first bullet item')
    assert.ok(xml.includes('Bullet B'), 'should contain second bullet item')
    assert.ok(xml.includes('Num 1'), 'should contain first numbered item')
    assert.ok(xml.includes('Num 2'), 'should contain second numbered item')
  })

  await test('E10: edit 缺少 edits 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordMutateTool.execute(
            { actionName: 'test', action: 'edit', filePath: rel('e10.docx') },
            toolCtx('e10'),
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
            toolCtx('e11'),
          ),
        ),
      /content is required/,
    )
  })

  // -----------------------------------------------------------------------
  // F 层 — Excel Mutate + Read roundtrip
  // -----------------------------------------------------------------------
  console.log('\nF 层 — Excel Mutate + Read roundtrip')

  await test('F1: create (v2 sheets + cells) → read back via readTool', async () => {
    const filePath = rel('f1.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          action: 'create',
          filePath,
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { value: 'Name' },
                B1: { value: 'Score' },
                A2: { value: 'Alice' },
                B2: { value: 95 },
                A3: { value: 'Bob' },
                B3: { value: 88 },
              },
            },
          ],
        },
        toolCtx('f1'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('type="xlsx"'), 'should be xlsx envelope')
    assert.ok(xml.includes('Sheet1'), 'should contain sheet name')
    assert.ok(xml.includes('Name'), 'should contain header text')
    assert.ok(xml.includes('Alice'), 'should contain row data')
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.sheetCount, 1)
  })

  await test('F5: create → update cell via v2 update action → read back', async () => {
    const filePath = rel('f5.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          action: 'create',
          filePath,
          sheets: [
            {
              name: 'Data',
              cells: { A1: { value: 'X' }, B1: { value: 100 } },
            },
          ],
        },
        toolCtx('f5c'),
      )
      await excelMutateTool.execute(
        {
          action: 'update',
          filePath,
          sheetName: 'Data',
          cells: { B1: { value: 999 } },
        },
        toolCtx('f5u'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('999'), 'should contain updated cell value 999')
    assert.ok(!xml.includes('100'), 'old cell value 100 should be gone')
  })

  await test('F7: create 含自定义 sheetName 参数', async () => {
    const filePath = rel('f7.xlsx')
    await withCtx(async () => {
      await excelMutateTool.execute(
        {
          action: 'create',
          filePath,
          sheets: [
            {
              name: 'MySheet',
              cells: { A1: { value: 'A' } },
            },
          ],
        },
        toolCtx('f7'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('MySheet'), 'should render custom sheet name')
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
  })

  // -----------------------------------------------------------------------
  // G 层 — PPTX Mutate + Read roundtrip
  // -----------------------------------------------------------------------
  console.log('\nG 层 — PPTX Mutate + Read roundtrip')

  await test('G1: create → read back via readTool', async () => {
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
        toolCtx('g1'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('type="pptx"'), 'should be pptx envelope')
    assert.ok(xml.includes('## Slide 1'), 'should contain slide header')
    assert.ok(xml.includes('Intro'), 'should contain slide title text')
    assert.ok(xml.includes('Welcome'), 'should contain text block')
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.slideCount, 1)
  })

  await test('G2: create → read back text', async () => {
    const filePath = rel('g1.pptx') // reuse from G1
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('Intro'), 'should contain slide title')
    assert.ok(xml.includes('Welcome'), 'should contain text block')
  })

  await test('G4: create → edit (replace text) → read back', async () => {
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
        toolCtx('g4c'),
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
        toolCtx('g4e'),
      )
    })
    const xml = await readDoc(filePath)
    assert.ok(xml.includes('New Title'), 'should contain new title text')
    assert.ok(!xml.includes('Old Title'), 'old title should be gone')
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
        toolCtx('g5'),
      )
    })
    const xml = await readDoc(filePath)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.slideCount, 3)
    assert.ok(xml.includes('## Slide 1'), 'should have slide 1 header')
    assert.ok(xml.includes('## Slide 2'), 'should have slide 2 header')
    assert.ok(xml.includes('## Slide 3'), 'should have slide 3 header')
  })

  await test('G6: create 空 slides 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pptxMutateTool.execute(
            { actionName: 'test', action: 'create', filePath: rel('g6.pptx'), slides: [] },
            toolCtx('g6'),
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
        toolCtx('g7'),
      )
    })
    const xml = await readDoc(filePath)
    // pptx extractor pulls raw text runs; ampersand will appear literally.
    assert.ok(xml.includes('A & B') || xml.includes('A &amp; B'), 'should contain ampersand text')
    assert.ok(xml.includes('quote'), 'should contain quoted text')
  })

  // -----------------------------------------------------------------------
  // H 层 — Mutate 错误处理
  // -----------------------------------------------------------------------
  console.log('\nH 层 — Mutate 错误处理')

  await test('H3: WordMutate: 未知 action 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          wordMutateTool.execute(
            { actionName: 'test', action: 'unknown' as any, filePath: rel('h3.docx') },
            toolCtx('h3'),
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
            { action: 'unknown' as any, filePath: rel('h4.xlsx') },
            toolCtx('h4'),
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
            toolCtx('h5'),
          ),
        ),
      /Unknown action/,
    )
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
