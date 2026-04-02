// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Doc Convert 工具层测试（格式互转 roundtrip）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/docConvertTools.test.ts
 *
 * 测试覆盖：
 *   S 层 — 核心转换 roundtrip（14 项）
 *   T 层 — 更多转换路径（12 项）
 *   U 层 — Lossy 标志与边界情况（10 项）
 *   V 层 — 错误处理（9 项）
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { docConvertTool } from '@/ai/tools/docConvertTools'
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
    { sessionId: 'DocConvert-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

let projectRoot = ''
const testSubDir = `_doc_test_${Date.now()}`

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })

  // TXT
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.txt'),
    'Hello World\nLine 2\nLine 3',
  )

  // HTML
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.html'),
    '<!DOCTYPE html><html><body><h1>Title</h1><p>Paragraph</p></body></html>',
  )

  // Markdown
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.md'),
    '# Title\n\nParagraph text\n\n- Item 1\n- Item 2',
  )

  // CSV
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.csv'),
    'Name,Age,City\nAlice,30,Beijing\nBob,25,Shanghai',
  )

  // XLSX (using xlsx library)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([['Name', 'Age'], ['Alice', 30], ['Bob', 25]])
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, path.join(projectRoot, testSubDir, 'test.xlsx'))

  // PDF (using pdf-lib)
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Test PDF Content', { x: 50, y: 700, size: 12, font })
  await fs.writeFile(path.join(projectRoot, testSubDir, 'test.pdf'), await doc.save())
}

async function cleanupTestDir() {
  await fs.rm(path.join(projectRoot, testSubDir), { recursive: true, force: true }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // -----------------------------------------------------------------------
  // S 层 — 核心转换 roundtrip（14 项）
  // -----------------------------------------------------------------------
  console.log('\nS 层 — 核心转换 roundtrip')

  await test('S1: txt → pdf', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.txt'), outputPath: rel('s1.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
    assert.equal(result.data.sourceFormat, 'txt')
    assert.equal(result.data.outputFormat, 'pdf')
  })

  await test('S2: txt → html', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.txt'), outputPath: rel('s2.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s2.html')), 'utf-8')
    assert.ok(content.includes('<pre>'), 'should contain <pre>')
  })

  await test('S3: txt → docx', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.txt'), outputPath: rel('s3.docx'), outputFormat: 'docx' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0 (DOCX ZIP)')
  })

  await test('S4: html → md', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.html'), outputPath: rel('s4.md'), outputFormat: 'md' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s4.md')), 'utf-8')
    assert.ok(content.includes('Title'), 'should contain converted heading "Title"')
  })

  await test('S5: html → txt', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.html'), outputPath: rel('s5.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s5.txt')), 'utf-8')
    assert.ok(content.includes('Title'), 'should contain "Title"')
    assert.ok(!content.includes('<h1>'), 'should NOT contain <h1> tag')
  })

  await test('S6: html → pdf', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.html'), outputPath: rel('s6.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.lossyConversion, true, 'html→pdf should be lossy')
  })

  await test('S7: md → html', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.md'), outputPath: rel('s7.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s7.html')), 'utf-8')
    assert.ok(content.includes('<h1>'), 'should contain <h1>')
  })

  await test('S8: md → txt', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.md'), outputPath: rel('s8.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s8.txt')), 'utf-8')
    assert.ok(content.includes('Title'), 'should contain "Title"')
  })

  await test('S9: md → pdf', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.md'), outputPath: rel('s9.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.lossyConversion, true, 'md→pdf should be lossy')
  })

  await test('S10: csv → xlsx', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.csv'), outputPath: rel('s10.xlsx'), outputFormat: 'xlsx' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('S11: csv → xls', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.csv'), outputPath: rel('s11.xls'), outputFormat: 'xls' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('S12: csv → json', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.csv'), outputPath: rel('s12.json'), outputFormat: 'json' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s12.json')), 'utf-8')
    const parsed = JSON.parse(content)
    assert.ok(Array.isArray(parsed), 'should be an array')
  })

  await test('S13: xlsx → csv', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('s13.csv'), outputFormat: 'csv' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s13.csv')), 'utf-8')
    assert.ok(content.includes(','), 'should contain comma-separated content')
  })

  await test('S14: xlsx → json', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('s14.json'), outputFormat: 'json' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('s14.json')), 'utf-8')
    const parsed = JSON.parse(content)
    assert.ok(parsed, 'JSON.parse should succeed')
  })

  // -----------------------------------------------------------------------
  // T 层 — 更多转换路径（12 项）
  // -----------------------------------------------------------------------
  console.log('\nT 层 — 更多转换路径')

  await test('T1: xlsx → txt', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('t1.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('T2: xlsx → html', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('t2.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('t2.html')), 'utf-8')
    assert.ok(content.includes('<table'), 'should contain <table')
  })

  await test('T3: xlsx → xls', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('t3.xls'), outputFormat: 'xls' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('T4: xls → xlsx (reuse xls from T3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('t3.xls'), outputPath: rel('t4.xlsx'), outputFormat: 'xlsx' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('T5: xls → csv (reuse xls from T3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('t3.xls'), outputPath: rel('t5.csv'), outputFormat: 'csv' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('T6: pdf → txt', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('t6.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('t6.txt')), 'utf-8')
    assert.ok(content.includes('Test PDF Content'), 'should contain "Test PDF Content"')
  })

  await test('T7: pdf → html', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('t7.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('t7.html')), 'utf-8')
    assert.ok(content.includes('pdf-page'), 'should contain "pdf-page"')
  })

  await test('T8: pdf → md', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('t8.md'), outputFormat: 'md' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('t8.md')), 'utf-8')
    assert.ok(content.includes('## Page'), 'should contain "## Page"')
  })

  await test('T9: pdf → docx', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('t9.docx'), outputFormat: 'docx' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.lossyConversion, true, 'pdf→docx should be lossy')
  })

  await test('T10: docx → html (use docx from S3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('s3.docx'), outputPath: rel('t10.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('T11: docx → txt (use docx from S3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('s3.docx'), outputPath: rel('t11.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('T12: docx → pdf (use docx from S3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('s3.docx'), outputPath: rel('t12.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.lossyConversion, true, 'docx→pdf should be lossy')
  })

  // -----------------------------------------------------------------------
  // U 层 — Lossy 标志与边界情况（10 项）
  // -----------------------------------------------------------------------
  console.log('\nU 层 — Lossy 标志与边界情况')

  await test('U1: pdf→docx has lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('u1.docx'), outputFormat: 'docx' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, true)
  })

  await test('U2: pdf→html has lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('u2.html'), outputFormat: 'html' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, true)
  })

  await test('U3: docx→pdf has lossyConversion (reuse docx from S3)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('s3.docx'), outputPath: rel('u3.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, true)
  })

  await test('U4: html→pdf has lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.html'), outputPath: rel('u4.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, true)
  })

  await test('U5: txt→pdf has lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.txt'), outputPath: rel('u5.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, true)
  })

  await test('U6: xlsx→csv no lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('u6.csv'), outputFormat: 'csv' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, undefined, 'xlsx→csv should not be lossy')
  })

  await test('U7: html→md no lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.html'), outputPath: rel('u7.md'), outputFormat: 'md' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, undefined, 'html→md should not be lossy')
  })

  await test('U8: csv→json no lossyConversion', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.csv'), outputPath: rel('u8.json'), outputFormat: 'json' },
        toolCtx,
      ),
    )
    assert.equal(result.data.lossyConversion, undefined, 'csv→json should not be lossy')
  })

  await test('U9: .htm extension handled as html', async () => {
    // Create test.htm (copy of test.html)
    await fs.copyFile(
      path.join(projectRoot, testSubDir, 'test.html'),
      path.join(projectRoot, testSubDir, 'test.htm'),
    )
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.htm'), outputPath: rel('u9.md'), outputFormat: 'md' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('U10: empty txt → pdf', async () => {
    await fs.writeFile(path.join(projectRoot, testSubDir, 'empty.txt'), '')
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('empty.txt'), outputPath: rel('u10.pdf'), outputFormat: 'pdf' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  // -----------------------------------------------------------------------
  // V 层 — 错误处理（9 项）
  // -----------------------------------------------------------------------
  console.log('\nV 层 — 错误处理')

  await test('V1: file doesn\'t exist → ENOENT', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('nonexistent.txt'), outputPath: rel('v1.pdf'), outputFormat: 'pdf' },
            toolCtx,
          ),
        ),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('V2: unsupported source format (.png)', async () => {
    await fs.writeFile(path.join(projectRoot, testSubDir, 'v2.png'), 'dummy')
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('v2.png'), outputPath: rel('v2.txt'), outputFormat: 'txt' },
            toolCtx,
          ),
        ),
      /Unsupported file format/,
    )
  })

  await test('V3: unsupported conversion txt→xlsx', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('test.txt'), outputPath: rel('v3.xlsx'), outputFormat: 'xlsx' },
            toolCtx,
          ),
        ),
      /Unsupported conversion/,
    )
  })

  await test('V4: unsupported conversion csv→pdf', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('test.csv'), outputPath: rel('v4.pdf'), outputFormat: 'pdf' },
            toolCtx,
          ),
        ),
      /Unsupported conversion/,
    )
  })

  await test('V5: unsupported conversion xlsx→docx', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('test.xlsx'), outputPath: rel('v5.docx'), outputFormat: 'docx' },
            toolCtx,
          ),
        ),
      /Unsupported conversion/,
    )
  })

  await test('V6: outputPath in nested non-existent dir → ok (fs.mkdir recursive)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        {
          filePath: rel('test.txt'),
          outputPath: rel('nested/deep/dir/v6.html'),
          outputFormat: 'html',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('V7: unsupported source format (.mp4)', async () => {
    await fs.writeFile(path.join(projectRoot, testSubDir, 'v7.mp4'), 'dummy')
    await assert.rejects(
      () =>
        withCtx(() =>
          docConvertTool.execute(
            { filePath: rel('v7.mp4'), outputPath: rel('v7.txt'), outputFormat: 'txt' },
            toolCtx,
          ),
        ),
      /Unsupported file format/,
    )
  })

  await test('V8: pdf→txt correctly parses (re-verify content)', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.pdf'), outputPath: rel('v8.txt'), outputFormat: 'txt' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('v8.txt')), 'utf-8')
    assert.ok(content.includes('Test PDF Content'), 'should contain "Test PDF Content"')
  })

  await test('V9: xlsx→json output is valid JSON', async () => {
    const result: any = await withCtx(() =>
      docConvertTool.execute(
        { filePath: rel('test.xlsx'), outputPath: rel('v9.json'), outputFormat: 'json' },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const content = await fs.readFile(path.join(projectRoot, rel('v9.json')), 'utf-8')
    JSON.parse(content) // should not throw
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
