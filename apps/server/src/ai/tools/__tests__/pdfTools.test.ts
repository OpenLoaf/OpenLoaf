// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * PDF 工具层测试（mutate + 统一 Read 工具 roundtrip）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/pdfTools.test.ts
 *
 * 测试覆盖：
 *   I 层 — PDF Mutate + Read roundtrip
 *   J 层 — 错误处理和边界情况
 *   K 层 — 真实 PDF 文件读取（中文规格书）
 *   L 层 — 创建与修改的完整场景
 *
 * 注意：原 pdfQueryTool 已废弃，统一由 readTool（@/ai/tools/fileTools）派发到
 * PDF 提取器。read-form-fields / read-structure 等模式已移除，相关用例随之删除。
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { pdfMutateTool } from '@/ai/tools/pdfTools'
import { readTool } from '@/ai/tools/fileTools'
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
    { sessionId: 'pdf-tools-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

const REAL_PDF_SOURCE = '/Users/zhao/Downloads/QRR0.3G丨S-Q热气溶胶灭火装置规格书李.pdf'

let projectRoot = ''
let testSubDir = ''
let hasRealPdf = false

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  testSubDir = `_pdf_test_${Date.now()}`
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })

  // Copy real PDF to test directory if available
  try {
    const realPdfDest = path.join(projectRoot, testSubDir, 'real-doc.pdf')
    await fs.copyFile(REAL_PDF_SOURCE, realPdfDest)
    hasRealPdf = true
  } catch {
    console.log('  ⚠ Real PDF not found, K-layer tests will be skipped')
  }
}

async function cleanupTestDir() {
  await fs.rm(path.join(projectRoot, testSubDir), { recursive: true, force: true }).catch(() => {})
}

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

/** Invoke the unified Read tool against a project-relative path. */
async function readPdf(filePath: string, opts: { pageRange?: string } = {}): Promise<string> {
  return (await withCtx(() =>
    readTool.execute({ file_path: filePath, ...opts }, toolCtx),
  )) as string
}

/**
 * Extract the JSON object embedded in `<meta>{...}</meta>` from a Read tool
 * envelope. Returns `null` when no meta tag is present.
 */
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
  // I 层 — PDF Mutate + Read roundtrip
  // -----------------------------------------------------------------------
  console.log('\nI 层 — PDF Mutate + Read roundtrip')

  await test('I1: create → read back via readTool roundtrip', async () => {
    const filePath = rel('i1.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'heading', text: 'My PDF Title', level: 1 },
            { type: 'paragraph', text: 'A normal paragraph with some content.' },
            { type: 'table', headers: ['Name', 'Age'], rows: [['Alice', '30'], ['Bob', '25']] },
          ],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    assert.ok(xml.includes('<file '), 'should be xml-tagged file response')
    assert.ok(xml.includes('type="pdf"'), 'should be pdf envelope')
    assert.ok(xml.includes('<meta>'), 'should have meta tag')
    assert.ok(xml.includes('<content>'), 'should have content tag')
    assert.ok(xml.includes('## Page 1'), 'content should be markdown with page header')
    assert.ok(xml.includes('My PDF Title'), 'should contain title')
    assert.ok(xml.includes('A normal paragraph'), 'should contain paragraph text')

    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.ok(typeof meta.pageCount === 'number' && meta.pageCount >= 1, 'should report at least 1 page')
    assert.equal(meta.imageCount, 0, 'no embedded images in pdf-lib created file')
    assert.ok(typeof meta.characterCount === 'number', 'should report characterCount')
  })

  await test('I2: create with bullet-list + numbered-list', async () => {
    const filePath = rel('i2.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'bullet-list', items: ['Bullet A', 'Bullet B'] },
            { type: 'numbered-list', items: ['Num 1', 'Num 2'] },
          ],
        },
        toolCtx,
      )
    })
    const xml = await readPdf(filePath)
    assert.ok(xml.includes('Bullet A'), 'should contain bullet items')
    assert.ok(xml.includes('Num 1'), 'should contain numbered items')
  })

  await test('I3: create with page-break → multiple pages', async () => {
    const filePath = rel('i3.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Page 1 content' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Page 2 content' },
          ],
        },
        toolCtx,
      )
    })
    const xml = await readPdf(filePath)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.pageCount, 2)
  })

  await test('I4: merge two PDFs', async () => {
    const file1 = rel('i4_a.pdf')
    const file2 = rel('i4_b.pdf')
    const merged = rel('i4_merged.pdf')

    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: file1,
          content: [{ type: 'paragraph', text: 'File 1' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: file2,
          content: [
            { type: 'paragraph', text: 'File 2 Page 1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'File 2 Page 2' },
          ],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'merge',
          filePath: merged,
          sourcePaths: [file1, file2],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(merged)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.pageCount, 3, 'merged should have 3 pages (1+2)')
  })

  await test('I5: add-text overlay', async () => {
    const filePath = rel('i5.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Original content' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'add-text',
          filePath,
          overlays: [
            { page: 1, x: 100, y: 400, text: 'OVERLAY TEXT', fontSize: 16 },
          ],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    assert.ok(xml.includes('OVERLAY TEXT'), 'should contain overlay text')
  })

  // -----------------------------------------------------------------------
  // J 层 — 错误处理和边界情况
  // -----------------------------------------------------------------------
  console.log('\nJ 层 — 错误处理和边界情况')

  await test('J1: read 不存在的文件抛出错误', async () => {
    await assert.rejects(
      () => readPdf(rel('nonexistent.pdf')),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('J3: create 缺少 content 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            { action: 'create', filePath: rel('j3.pdf') },
            toolCtx,
          ),
        ),
      /content is required/,
    )
  })

  await test('J4: fill-form 缺少 fields 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            { action: 'fill-form', filePath: rel('j4.pdf') },
            toolCtx,
          ),
        ),
      /fields is required/,
    )
  })

  await test('J5: merge 缺少 sourcePaths 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            { action: 'merge', filePath: rel('j5.pdf') },
            toolCtx,
          ),
        ),
      /sourcePaths is required/,
    )
  })

  await test('J6: add-text 缺少 overlays 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            { action: 'add-text', filePath: rel('j6.pdf') },
            toolCtx,
          ),
        ),
      /overlays is required/,
    )
  })

  await test('J8: 未知 action 抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            { action: 'unknown' as any, filePath: rel('j8.pdf') },
            toolCtx,
          ),
        ),
      /Unknown action/,
    )
  })

  await test('J9: add-text 无效页码抛出错误', async () => {
    const filePath = rel('i1.pdf') // reuse from I1
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            {
              action: 'add-text',
              filePath,
              overlays: [{ page: 999, x: 0, y: 0, text: 'test' }],
            },
            toolCtx,
          ),
        ),
      /Invalid page number/,
    )
  })

  await test('J10: create 含 CJK 字符抛出友好错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfMutateTool.execute(
            {
              action: 'create',
              filePath: rel('j10.pdf'),
              content: [{ type: 'paragraph', text: '这是中文内容' }],
            },
            toolCtx,
          ),
        ),
      /CJK/,
    )
  })

  await test('J11: read with pageRange', async () => {
    const filePath = rel('i3.pdf') // reuse from I3 (2 pages)
    const xml = await readPdf(filePath, { pageRange: '1' })
    assert.ok(xml.includes('<content>'), 'should have content')
    assert.ok(xml.includes('Page 1 content'), 'should contain page 1 text')
  })

  // -----------------------------------------------------------------------
  // K 层 — 真实 PDF 文件读取（中文规格书）
  // -----------------------------------------------------------------------
  console.log('\nK 层 — 真实 PDF 文件读取')

  if (!hasRealPdf) {
    console.log('  (skipped — real PDF not available)')
  } else {
    const realPdf = rel('real-doc.pdf')

    await test('K1: read on real PDF reports page count + file size', async () => {
      const xml = await readPdf(realPdf)
      assert.ok(xml.includes('type="pdf"'), 'should be pdf envelope')
      const bytesMatch = xml.match(/bytes="(\d+)"/)
      assert.ok(bytesMatch, 'should report bytes attribute')
      assert.ok(Number(bytesMatch![1]) > 0, 'bytes should be > 0')
      const meta = parseMeta(xml)
      assert.ok(meta, 'should parse meta JSON')
      assert.ok(typeof meta.pageCount === 'number' && meta.pageCount > 0, 'should report pageCount')
    })

    await test('K2: full extraction on real PDF contains chinese', async () => {
      const xml = await readPdf(realPdf)
      assert.ok(xml.includes('<content>'), 'should have content tag')
      const meta = parseMeta(xml)
      assert.ok(meta, 'should parse meta JSON')
      assert.ok(typeof meta.characterCount === 'number' && meta.characterCount > 0, 'should report characterCount')
      assert.ok(/[\u4e00-\u9fff]/.test(xml), 'should contain Chinese characters')
    })

    await test('K3: read with pageRange="1" on real PDF', async () => {
      const xml = await readPdf(realPdf, { pageRange: '1' })
      assert.ok(xml.includes('<content>'), 'should have content tag')
      assert.ok(xml.includes('## Page 1'), 'should contain page 1 marker')
    })

    await test('K4: read with pageRange="1-2" on real PDF', async () => {
      const xml = await readPdf(realPdf, { pageRange: '1-2' })
      assert.ok(xml.includes('<content>'), 'should have content tag')
      assert.ok(xml.includes('## Page 1'), 'should contain page 1 marker')
    })
  }

  // -----------------------------------------------------------------------
  // L 层 — 创建与修改的完整场景
  // -----------------------------------------------------------------------
  console.log('\nL 层 — 创建与修改的完整场景')

  await test('L1: create with all content types', async () => {
    const filePath = rel('l1.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'heading', text: 'Document Title', level: 1 },
            { type: 'paragraph', text: 'Bold paragraph text', bold: true },
            { type: 'paragraph', text: 'Italic paragraph text', italic: true },
            { type: 'table', headers: ['Col A', 'Col B'], rows: [['R1A', 'R1B'], ['R2A', 'R2B']] },
            { type: 'bullet-list', items: ['Bullet one', 'Bullet two'] },
            { type: 'numbered-list', items: ['Step one', 'Step two'] },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Content on second page' },
          ],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.ok(typeof meta.pageCount === 'number' && meta.pageCount >= 2, 'should have at least 2 pages')

    assert.ok(xml.includes('Document Title'), 'should contain heading')
    assert.ok(xml.includes('Bold paragraph'), 'should contain bold text')
    assert.ok(xml.includes('Italic paragraph'), 'should contain italic text')
    assert.ok(xml.includes('Col A'), 'should contain table header')
    assert.ok(xml.includes('Bullet one'), 'should contain bullet item')
    assert.ok(xml.includes('Step one'), 'should contain numbered item')
    assert.ok(xml.includes('second page'), 'should contain page 2 content')
  })

  await test('L2: create with custom fontSize', async () => {
    const filePath = rel('l2.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Large text here', fontSize: 24 },
          ],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    assert.ok(xml.includes('Large text'), 'should contain the text')
  })

  await test('L3: create then add-text multiple overlays', async () => {
    const filePath = rel('l3.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Base content' }],
        },
        toolCtx,
      )
      // First overlay
      await pdfMutateTool.execute(
        {
          action: 'add-text',
          filePath,
          overlays: [{ page: 1, x: 100, y: 500, text: 'OVERLAY_ALPHA', fontSize: 14 }],
        },
        toolCtx,
      )
      // Second overlay
      await pdfMutateTool.execute(
        {
          action: 'add-text',
          filePath,
          overlays: [{ page: 1, x: 100, y: 300, text: 'OVERLAY_BETA', fontSize: 14 }],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    assert.ok(xml.includes('Base content'), 'should keep base content')
    assert.ok(xml.includes('OVERLAY_ALPHA'), 'should contain first overlay')
    assert.ok(xml.includes('OVERLAY_BETA'), 'should contain second overlay')
  })

  await test('L4: add-text with color succeeds', async () => {
    const filePath = rel('l4.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Color test base' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'add-text',
          filePath,
          overlays: [{ page: 1, x: 100, y: 400, text: 'RED_TEXT', fontSize: 12, color: '#FF0000' }],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(filePath)
    assert.ok(xml.includes('RED_TEXT'), 'should contain colored overlay text')
  })

  await test('L4b: add-text with background mask (redaction)', async () => {
    const filePath = rel('l4b.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Secret phone 18812345678 here' }],
        },
        toolCtx,
      )
      // Mask the phone number with white background + black ****
      await pdfMutateTool.execute(
        {
          action: 'add-text',
          filePath,
          overlays: [{
            page: 1,
            x: 155,
            y: 775,
            text: '****',
            fontSize: 12,
            color: '#000000',
            background: { color: '#FFFFFF', padding: 2, width: 80 },
          }],
        },
        toolCtx,
      )
    })

    // Verify the overlay was applied (file still readable through Read tool)
    const xml = await readPdf(filePath)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.pageCount, 1)
  })

  await test('L5: merge two PDFs and verify combined text', async () => {
    const src1 = rel('l5_a.pdf')
    const src2 = rel('l5_b.pdf')
    const merged = rel('l5_merged.pdf')

    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: src1,
          content: [{ type: 'paragraph', text: 'SOURCE_ONE_CONTENT' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: src2,
          content: [{ type: 'paragraph', text: 'SOURCE_TWO_CONTENT' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'merge',
          filePath: merged,
          sourcePaths: [src1, src2],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(merged)
    assert.ok(xml.includes('SOURCE_ONE_CONTENT'), 'should contain source 1 text')
    assert.ok(xml.includes('SOURCE_TWO_CONTENT'), 'should contain source 2 text')
  })

  await test('L6: merge three PDFs and verify page count', async () => {
    const src1 = rel('l6_a.pdf')
    const src2 = rel('l6_b.pdf')
    const src3 = rel('l6_c.pdf')
    const merged = rel('l6_merged.pdf')

    await withCtx(async () => {
      // src1: 1 page
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: src1,
          content: [{ type: 'paragraph', text: 'A1' }],
        },
        toolCtx,
      )
      // src2: 2 pages
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: src2,
          content: [
            { type: 'paragraph', text: 'B1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'B2' },
          ],
        },
        toolCtx,
      )
      // src3: 1 page
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: src3,
          content: [{ type: 'paragraph', text: 'C1' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'merge',
          filePath: merged,
          sourcePaths: [src1, src2, src3],
        },
        toolCtx,
      )
    })

    const xml = await readPdf(merged)
    const meta = parseMeta(xml)
    assert.ok(meta, 'should parse meta JSON')
    assert.equal(meta.pageCount, 4, 'merged should have 4 pages (1+2+1)')
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
