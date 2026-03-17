// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * PDF 工具层测试（query/mutate roundtrip）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/pdfTools.test.ts
 *
 * 测试覆盖：
 *   I 层 — PDF 工具 Roundtrip
 *   J 层 — 错误处理和边界情况
 *   K 层 — 真实 PDF 文件读取（中文规格书）
 *   L 层 — 创建与修改的完整场景
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { pdfQueryTool, pdfMutateTool } from '@/ai/tools/pdfTools'
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

/** Create a PDF with a form for testing. */
async function createFormPdf(absPath: string) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const form = pdfDoc.getForm()

  const nameField = form.createTextField('name')
  nameField.setText('default')
  nameField.addToPage(page, { x: 50, y: 700, width: 200, height: 30 })

  const checkField = form.createCheckBox('agree')
  checkField.addToPage(page, { x: 50, y: 650, width: 20, height: 20 })

  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(absPath, pdfBytes)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // -----------------------------------------------------------------------
  // I 层 — PDF 工具 Roundtrip
  // -----------------------------------------------------------------------
  console.log('\nI 层 — PDF 工具 Roundtrip')

  await test('I1: create → read-structure → read-text roundtrip', async () => {
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

    // read-structure
    const structResult: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath },
        toolCtx,
      ),
    )
    assert.equal(structResult.ok, true)
    assert.ok(structResult.data.pageCount >= 1, 'should have at least 1 page')
    assert.ok(structResult.data.fileSize > 0, 'should have file size')

    // read-text
    const textResult: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(textResult.ok, true)
    assert.ok(textResult.data.text.includes('My PDF Title'), 'should contain title')
    assert.ok(textResult.data.text.includes('A normal paragraph'), 'should contain paragraph')
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
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Bullet A'), 'should contain bullet items')
    assert.ok(result.data.text.includes('Num 1'), 'should contain numbered items')
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
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.pageCount, 2)
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath: merged },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.pageCount, 3, 'merged should have 3 pages (1+2)')
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('OVERLAY TEXT'), 'should contain overlay text')
  })

  await test('I6: read-form-fields + fill-form', async () => {
    const filePath = rel('i6.pdf')
    const absPath = path.join(projectRoot, filePath)
    await createFormPdf(absPath)

    // read-form-fields
    const fieldsResult: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-form-fields', filePath },
        toolCtx,
      ),
    )
    assert.equal(fieldsResult.ok, true)
    assert.ok(fieldsResult.data.fieldCount >= 2, 'should have at least 2 fields')
    const nameField = fieldsResult.data.fields.find((f: any) => f.name === 'name')
    assert.ok(nameField, 'should have name field')
    assert.equal(nameField.type, 'text')

    // fill-form
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'fill-form',
          filePath,
          fields: { name: 'John Doe', agree: 'true' },
        },
        toolCtx,
      )
    })

    // Verify fill
    const afterFill: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-form-fields', filePath },
        toolCtx,
      ),
    )
    assert.equal(afterFill.ok, true)
    const filledName = afterFill.data.fields.find((f: any) => f.name === 'name')
    assert.equal(filledName.value, 'John Doe')
    const filledAgree = afterFill.data.fields.find((f: any) => f.name === 'agree')
    assert.equal(filledAgree.value, 'true')
  })

  // -----------------------------------------------------------------------
  // J 层 — 错误处理和边界情况
  // -----------------------------------------------------------------------
  console.log('\nJ 层 — 错误处理和边界情况')

  await test('J1: query 不存在的文件抛出错误', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfQueryTool.execute(
            { mode: 'read-structure', filePath: rel('nonexistent.pdf') },
            toolCtx,
          ),
        ),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('J2: query 非 PDF 文件抛出错误', async () => {
    const txtFile = rel('j2.txt')
    const absPath = path.join(projectRoot, txtFile)
    await fs.writeFile(absPath, 'dummy', 'utf-8')
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfQueryTool.execute(
            { mode: 'read-structure', filePath: txtFile },
            toolCtx,
          ),
        ),
      /Unsupported file format/,
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

  await test('J7: 未知 mode 抛出错误', async () => {
    const filePath = rel('i1.pdf') // reuse from I1
    await assert.rejects(
      () =>
        withCtx(() =>
          pdfQueryTool.execute(
            { mode: 'unknown-mode' as any, filePath },
            toolCtx,
          ),
        ),
      /Unknown mode/,
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

  await test('J11: read-text with pageRange', async () => {
    const filePath = rel('i3.pdf') // reuse from I3 (2 pages)
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath, pageRange: '1' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.length > 0, 'should have text')
  })

  // -----------------------------------------------------------------------
  // K 层 — 真实 PDF 文件读取（中文规格书）
  // -----------------------------------------------------------------------
  console.log('\nK 层 — 真实 PDF 文件读取')

  if (!hasRealPdf) {
    console.log('  (skipped — real PDF not available)')
  } else {
    const realPdf = rel('real-doc.pdf')

    await test('K1: read-structure on real PDF', async () => {
      const result: any = await withCtx(() =>
        pdfQueryTool.execute(
          { mode: 'read-structure', filePath: realPdf },
          toolCtx,
        ),
      )
      assert.equal(result.ok, true)
      assert.ok(result.data.pageCount > 0, 'should have pages')
      assert.ok(result.data.fileSize > 0, 'should have file size')
      assert.ok(result.data.metadata, 'should have metadata object')
    })

    await test('K2: read-text full extraction on real PDF', async () => {
      const result: any = await withCtx(() =>
        pdfQueryTool.execute(
          { mode: 'read-text', filePath: realPdf },
          toolCtx,
        ),
      )
      assert.equal(result.ok, true)
      assert.ok(result.data.text.length > 0, 'should have text')
      assert.ok(result.data.characterCount > 0, 'should have character count')
      // Verify contains Chinese characters
      assert.ok(/[\u4e00-\u9fff]/.test(result.data.text), 'should contain Chinese characters')
    })

    await test('K3: read-text with pageRange="1" on real PDF', async () => {
      const result: any = await withCtx(() =>
        pdfQueryTool.execute(
          { mode: 'read-text', filePath: realPdf, pageRange: '1' },
          toolCtx,
        ),
      )
      assert.equal(result.ok, true)
      assert.ok(result.data.text.length > 0, 'page 1 should have text')
    })

    await test('K4: read-text with pageRange="1-2" on real PDF', async () => {
      const result: any = await withCtx(() =>
        pdfQueryTool.execute(
          { mode: 'read-text', filePath: realPdf, pageRange: '1-2' },
          toolCtx,
        ),
      )
      assert.equal(result.ok, true)
      assert.ok(result.data.text.length > 0, 'page 1-2 should have text')
    })

    await test('K5: read-form-fields on real PDF (no forms expected)', async () => {
      const result: any = await withCtx(() =>
        pdfQueryTool.execute(
          { mode: 'read-form-fields', filePath: realPdf },
          toolCtx,
        ),
      )
      assert.equal(result.ok, true)
      assert.equal(result.data.fieldCount, 0, 'should have no form fields')
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

    // Verify structure
    const structResult: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath },
        toolCtx,
      ),
    )
    assert.equal(structResult.ok, true)
    assert.ok(structResult.data.pageCount >= 2, 'should have at least 2 pages')

    // Verify text content
    const textResult: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(textResult.ok, true)
    assert.ok(textResult.data.text.includes('Document Title'), 'should contain heading')
    assert.ok(textResult.data.text.includes('Bold paragraph'), 'should contain bold text')
    assert.ok(textResult.data.text.includes('Italic paragraph'), 'should contain italic text')
    assert.ok(textResult.data.text.includes('Col A'), 'should contain table header')
    assert.ok(textResult.data.text.includes('Bullet one'), 'should contain bullet item')
    assert.ok(textResult.data.text.includes('Step one'), 'should contain numbered item')
    assert.ok(textResult.data.text.includes('second page'), 'should contain page 2 content')
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Large text'), 'should contain the text')
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('Base content'), 'should keep base content')
    assert.ok(result.data.text.includes('OVERLAY_ALPHA'), 'should contain first overlay')
    assert.ok(result.data.text.includes('OVERLAY_BETA'), 'should contain second overlay')
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('RED_TEXT'), 'should contain colored overlay text')
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

    // Verify the overlay was applied (file still readable)
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.pageCount, 1)
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-text', filePath: merged },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.text.includes('SOURCE_ONE_CONTENT'), 'should contain source 1 text')
    assert.ok(result.data.text.includes('SOURCE_TWO_CONTENT'), 'should contain source 2 text')
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

    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-structure', filePath: merged },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.pageCount, 4, 'merged should have 4 pages (1+2+1)')
  })

  await test('L7: fill-form text field and verify', async () => {
    const filePath = rel('l7.pdf')
    const absPath = path.join(projectRoot, filePath)
    await createFormPdf(absPath)

    // Fill name field
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'fill-form',
          filePath,
          fields: { name: 'Alice Smith' },
        },
        toolCtx,
      )
    })

    // Read back and verify
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-form-fields', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const nameField = result.data.fields.find((f: any) => f.name === 'name')
    assert.equal(nameField.value, 'Alice Smith', 'text field should be updated')
  })

  await test('L8: fill-form checkbox and verify state', async () => {
    const filePath = rel('l8.pdf')
    const absPath = path.join(projectRoot, filePath)
    await createFormPdf(absPath)

    // Check the agree checkbox
    await withCtx(async () => {
      await pdfMutateTool.execute(
        {
          action: 'fill-form',
          filePath,
          fields: { agree: 'true' },
        },
        toolCtx,
      )
    })

    // Read back and verify
    const result: any = await withCtx(() =>
      pdfQueryTool.execute(
        { mode: 'read-form-fields', filePath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const agreeField = result.data.fields.find((f: any) => f.name === 'agree')
    assert.equal(agreeField.value, 'true', 'checkbox should be checked')
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
