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
import { pdfMutateTool, pdfInspectTool } from '@/ai/tools/pdfTools'
import { readTool } from '@/ai/tools/fileTools'
import { resolveToolPath } from '@/ai/tools/toolScope'
import { parseComplexPageRanges } from '@/ai/tools/office/pdfEngine'

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

  await test('J10: create 含 CJK 字符应成功（自动加载 Noto Sans SC）', async () => {
    const filePath = rel('j10.pdf')
    await withCtx(() =>
      pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: '这是中文内容 — 这是中文内容' }],
        },
        toolCtx,
      ),
    )
    // The file should exist and be non-empty.
    const { absPath } = await withCtx(() => resolveToolPath({ target: filePath }))
    const stat = await fs.stat(absPath)
    assert.ok(stat.size > 0, 'CJK PDF should be created non-empty')
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
  // M 层 — PdfInspect 只读分析
  // -----------------------------------------------------------------------
  console.log('\nM 层 — PdfInspect 只读分析')

  await test('M1: summary on extractable PDF reports textType=extractable', async () => {
    const filePath = rel('m1.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'heading', text: 'Summary Probe Doc', level: 1 },
            { type: 'paragraph', text: 'This is extractable body text with plenty of words to detect.' },
          ],
        },
        toolCtx,
      )
    })

    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'summary', filePath }, toolCtx),
    )) as { ok: boolean; data: Record<string, unknown> }
    assert.equal(result.ok, true)
    assert.equal(result.data.action, 'summary')
    assert.equal(result.data.isEncrypted, false)
    assert.equal(result.data.needsPassword, false)
    assert.equal(result.data.textType, 'extractable')
    assert.equal(result.data.hasForm, false)
    const suggested = result.data.suggestedNextTool as Record<string, unknown>
    assert.equal(suggested.tool, 'PdfInspect')
    assert.equal(suggested.action, 'text')
  })

  await test('M2: summary page count matches create', async () => {
    const filePath = rel('m2.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Page 1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Page 2' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Page 3' },
          ],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'summary', filePath }, toolCtx),
    )) as { ok: boolean; data: { pageCount: number } }
    assert.equal(result.data.pageCount, 3)
  })

  await test('M3: text action extracts body text', async () => {
    const filePath = rel('m3.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'UNIQUE_PROBE_STRING_M3' }],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'text', filePath }, toolCtx),
    )) as { ok: boolean; data: { text: string } }
    assert.equal(result.ok, true)
    assert.ok(
      result.data.text.includes('UNIQUE_PROBE_STRING_M3'),
      `text should include probe string; got ${result.data.text.slice(0, 200)}`,
    )
  })

  await test('M4: text with withCoords returns items array', async () => {
    const filePath = rel('m4.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Coordinate probe.' }],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'text', filePath, withCoords: true }, toolCtx),
    )) as { ok: boolean; data: { items: Array<Record<string, unknown>> } }
    assert.ok(Array.isArray(result.data.items), 'items should be an array when withCoords=true')
    assert.ok(result.data.items.length > 0, 'items should not be empty')
    const first = result.data.items[0]!
    assert.equal(typeof first.x, 'number')
    assert.equal(typeof first.y, 'number')
    assert.equal(typeof first.str, 'string')
  })

  await test('M5: form-fields on non-AcroForm PDF returns empty array', async () => {
    const filePath = rel('m5.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'No forms here.' }],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'form-fields', filePath }, toolCtx),
    )) as { ok: boolean; data: { fields: unknown[] } }
    assert.equal(result.ok, true)
    assert.equal(result.data.fields.length, 0)
  })

  await test('M6: annotations on clean PDF returns empty', async () => {
    const filePath = rel('m6.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Plain body.' }],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'annotations', filePath }, toolCtx),
    )) as { ok: boolean; data: { annotations: unknown[] } }
    assert.equal(result.ok, true)
    assert.equal(result.data.annotations.length, 0)
  })

  await test('M7: render multi-page returns pages[] with URL + dimensions', async () => {
    const filePath = rel('m7.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Page 1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Page 2' },
          ],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute(
        { action: 'render', filePath, pageRange: '1-2', scale: 1 },
        toolCtx,
      ),
    )) as { ok: boolean; data: { pages: Array<Record<string, unknown>> } }
    assert.equal(result.ok, true)
    assert.equal(result.data.pages.length, 2)
    for (const p of result.data.pages) {
      assert.equal(typeof p.url, 'string')
      assert.equal(typeof p.width, 'number')
      assert.equal(typeof p.height, 'number')
    }
  })

  await test('M8: tables action returns not-implemented heuristic', async () => {
    const filePath = rel('m8.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
          ],
        },
        toolCtx,
      )
    })
    const result = (await withCtx(() =>
      pdfInspectTool.execute({ action: 'tables', filePath }, toolCtx),
    )) as { ok: boolean; data: { heuristic: string; tables: unknown[] } }
    assert.equal(result.ok, true)
    // Stage-6 real impl changes this to 'simple-grid'; for now we accept either.
    assert.ok(['simple-grid', 'not-implemented'].includes(result.data.heuristic))
  })

  // -----------------------------------------------------------------------
  // N 层 — PdfMutate new actions
  // -----------------------------------------------------------------------
  console.log('\nN 层 — PdfMutate 新 action')

  await test('N0: parseComplexPageRanges parses "1,3-5,8,10-end"', async () => {
    const r = parseComplexPageRanges('1,3-5,8,10-end', 12)
    assert.deepEqual(r, [1, 3, 4, 5, 8, 10, 11, 12])
  })

  await test('N0b: parseComplexPageRanges rejects out-of-range', async () => {
    assert.throws(() => parseComplexPageRanges('1-99', 5))
  })

  await test('N1: rotate page', async () => {
    const filePath = rel('n1.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Rotate me.' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        { action: 'rotate', filePath, rotations: [{ page: 1, degrees: 90 }] },
        toolCtx,
      )) as { ok: boolean; data: { rotatedCount: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.rotatedCount, 1)
    })
    // Verify stored rotation via pdf-lib.
    const { absPath } = await withCtx(() => resolveToolPath({ target: filePath }))
    const bytes = await fs.readFile(absPath)
    const doc = await PDFDocument.load(bytes)
    assert.equal(doc.getPage(0).getRotation().angle, 90)
  })

  await test('N2: crop page sets mediaBox', async () => {
    const filePath = rel('n2.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Crop probe.' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'crop',
          filePath,
          crops: [{ page: 1, mediaBox: [50, 50, 400, 600] }],
        },
        toolCtx,
      )) as { ok: boolean; data: { croppedCount: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.croppedCount, 1)
    })
    const { absPath } = await withCtx(() => resolveToolPath({ target: filePath }))
    const bytes = await fs.readFile(absPath)
    const doc = await PDFDocument.load(bytes)
    const box = doc.getPage(0).getMediaBox()
    assert.equal(box.width, 400)
    assert.equal(box.height, 600)
  })

  await test('N3: split by groupSize writes N part files', async () => {
    const filePath = rel('n3.pdf')
    const outDir = rel('n3_parts')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'P1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'P2' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'P3' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'P4' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'P5' },
          ],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        { action: 'split', filePath, outputDir: outDir, groupSize: 2 },
        toolCtx,
      )) as { ok: boolean; data: { parts: string[] } }
      assert.equal(r.ok, true)
      // 5 pages, group 2 → 3 parts
      assert.equal(r.data.parts.length, 3)
      for (const p of r.data.parts) {
        const stat = await fs.stat(p).catch(() => null)
        assert.ok(stat && stat.size > 0, `part ${p} should exist and have content`)
      }
    })
  })

  await test('N4: split by splitAt breakpoints', async () => {
    const filePath = rel('n4.pdf')
    const outDir = rel('n4_parts')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'A' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'B' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'C' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'D' },
          ],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        { action: 'split', filePath, outputDir: outDir, splitAt: [3] },
        toolCtx,
      )) as { ok: boolean; data: { parts: string[] } }
      assert.equal(r.ok, true)
      // 4 pages, splitAt=[3] → parts [1-2] and [3-4] = 2 parts
      assert.equal(r.data.parts.length, 2)
    })
  })

  await test('N5: extract-pages writes a subset', async () => {
    const filePath = rel('n5.pdf')
    const outputPath = rel('n5_extract.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'A' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'B' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'C' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'D' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'E' },
          ],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'extract-pages',
          filePath,
          outputPath,
          pageRanges: '1,3-4,end',
        },
        toolCtx,
      )) as { ok: boolean; data: { pageCount: number; sourcePages: number[] } }
      assert.equal(r.ok, true)
      assert.deepEqual(r.data.sourcePages, [1, 3, 4, 5])
      assert.equal(r.data.pageCount, 4)
    })
  })

  await test('N6: decrypt unencrypted PDF round-trips', async () => {
    // pdf-lib has no built-in encrypt, so we only test that the decrypt
    // path round-trips an unencrypted file without corruption.
    const filePath = rel('n6.pdf')
    const outputPath = rel('n6_decrypted.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'DECRYPT_PROBE' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        { action: 'decrypt', filePath, outputPath, password: 'any' },
        toolCtx,
      )) as { ok: boolean; data: { pageCount: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.pageCount, 1)
    })
    const xml = await readPdf(outputPath)
    assert.ok(xml.includes('DECRYPT_PROBE'))
  })

  await test('N7: optimize produces a saveable file', async () => {
    const filePath = rel('n7.pdf')
    const outputPath = rel('n7_opt.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'OPTIMIZE_PROBE'.repeat(50) }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        { action: 'optimize', filePath, outputPath, linearize: true },
        toolCtx,
      )) as { ok: boolean; data: { beforeBytes: number; afterBytes: number } }
      assert.equal(r.ok, true)
      assert.ok(r.data.beforeBytes > 0)
      assert.ok(r.data.afterBytes > 0)
    })
    const xml = await readPdf(outputPath)
    assert.ok(xml.includes('OPTIMIZE_PROBE'))
  })

  await test('N8: watermark type=text stamps each page', async () => {
    const filePath = rel('n8.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [
            { type: 'paragraph', text: 'Body1' },
            { type: 'page-break' },
            { type: 'paragraph', text: 'Body2' },
          ],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'watermark',
          filePath,
          watermarkType: 'text',
          watermarkText: 'TOP_SECRET',
        },
        toolCtx,
      )) as { ok: boolean; data: { pagesWatermarked: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.pagesWatermarked, 2)
    })
    const xml = await readPdf(filePath)
    assert.ok(xml.includes('TOP_SECRET'))
  })

  await test('N9: watermark type=pdf stamps using embedded page', async () => {
    const filePath = rel('n9.pdf')
    const stampPath = rel('n9_stamp.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Body.' }],
        },
        toolCtx,
      )
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath: stampPath,
          content: [{ type: 'heading', text: 'STAMPED', level: 1 }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'watermark',
          filePath,
          watermarkType: 'pdf',
          watermarkPdfPath: stampPath,
          watermarkPdfPage: 1,
        },
        toolCtx,
      )) as { ok: boolean; data: { pagesWatermarked: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.pagesWatermarked, 1)
    })
  })

  await test('N10: fill-visual with valid bbox draws text', async () => {
    const filePath = rel('n10.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Host doc.' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'fill-visual',
          filePath,
          visualFields: [
            {
              page: 1,
              entryBoundingBox: [100, 400, 300, 420],
              text: 'FILLED_VALUE',
              fontSize: 10,
            },
          ],
        },
        toolCtx,
      )) as { ok: boolean; data: { filledCount: number; errors: string[] } }
      assert.equal(r.ok, true)
      assert.equal(r.data.filledCount, 1)
      assert.equal(r.data.errors.length, 0)
    })
    const xml = await readPdf(filePath)
    assert.ok(xml.includes('FILLED_VALUE'))
  })

  await test('N11: fill-visual rejects overlapping bboxes', async () => {
    const filePath = rel('n11.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Host.' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'fill-visual',
          filePath,
          visualFields: [
            { page: 1, entryBoundingBox: [100, 400, 300, 430], text: 'A', fontSize: 10 },
            { page: 1, entryBoundingBox: [200, 410, 400, 440], text: 'B', fontSize: 10 },
          ],
        },
        toolCtx,
      )) as { ok: boolean; error?: string; data: { errors: string[] } }
      assert.equal(r.ok, false)
      assert.equal(r.error, 'BBOX_VALIDATION_FAILED')
      assert.ok(r.data.errors.some((e) => e.includes('overlap')))
    })
  })

  await test('N12: fill-visual converts image coords', async () => {
    // Rendered image is (imageWidth, imageHeight) = (595, 842) at scale 1,
    // same as A4 PDF points, so an image bbox at top-left [50, 50, 250, 80]
    // should map to PDF bbox roughly [50, 762, 250, 792].
    const filePath = rel('n12.pdf')
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'create',
          filePath,
          content: [{ type: 'paragraph', text: 'Img-coord host.' }],
        },
        toolCtx,
      )
      const r = (await pdfMutateTool.execute(
        {
          action: 'fill-visual',
          filePath,
          visualFields: [
            {
              page: 1,
              entryBoundingBox: [50, 50, 250, 80],
              text: 'IMG_COORD_PROBE',
              fontSize: 10,
              coordSystem: 'image',
              imageWidth: 595,
              imageHeight: 842,
            },
          ],
        },
        toolCtx,
      )) as { ok: boolean; data: { filledCount: number } }
      assert.equal(r.ok, true)
      assert.equal(r.data.filledCount, 1)
    })
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
