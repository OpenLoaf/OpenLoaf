// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * File Info 工具层测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/fileInfoTool.test.ts
 *
 * 测试覆盖：
 *   F1 层 — Base info（所有文件类型应返回 base）
 *   F2 层 — Image details
 *   F3 层 — Video/Audio details（需 ffmpeg）
 *   F4 层 — PDF details
 *   F5 层 — Spreadsheet details
 *   F6 层 — Edge cases and errors
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { fileInfoTool } from '@/ai/tools/fileInfoTool'
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
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  ✗ ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'FileInfo-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

let projectRoot = ''
const testSubDir = `_fileinfo_test_${Date.now()}`
let ffmpegAvailable = false

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

// ---------------------------------------------------------------------------
// Setup / Cleanup
// ---------------------------------------------------------------------------

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })

  // PNG image (200x200 red)
  const sharp = (await import('sharp')).default
  await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toFile(path.join(projectRoot, testSubDir, 'test.png'))

  // JPEG image (300x200 blue)
  await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 128, b: 255 } },
  })
    .jpeg()
    .toFile(path.join(projectRoot, testSubDir, 'test.jpg'))

  // TXT file
  await fs.writeFile(path.join(projectRoot, testSubDir, 'test.txt'), 'Hello World\nLine 2')

  // HTML file
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.html'),
    '<!DOCTYPE html><html><body><h1>Title</h1></body></html>',
  )

  // CSV file
  await fs.writeFile(
    path.join(projectRoot, testSubDir, 'test.csv'),
    'Name,Age,City\nAlice,30,Beijing\nBob,25,Shanghai',
  )

  // XLSX (using xlsx library)
  const xlsxMod = await import('xlsx')
  const XLSX = (xlsxMod as any).default || xlsxMod
  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.aoa_to_sheet([['Name', 'Age'], ['Alice', 30], ['Bob', 25]])
  XLSX.utils.book_append_sheet(wb, ws1, 'People')
  const ws2 = XLSX.utils.aoa_to_sheet([['City', 'Country'], ['Beijing', 'China']])
  XLSX.utils.book_append_sheet(wb, ws2, 'Cities')
  XLSX.writeFile(wb, path.join(projectRoot, testSubDir, 'test.xlsx'))

  // PDF (using pdf-lib)
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Test PDF', { x: 50, y: 700, size: 12, font })
  await fs.writeFile(path.join(projectRoot, testSubDir, 'test.pdf'), await doc.save())

  // JSON file
  await fs.writeFile(path.join(projectRoot, testSubDir, 'test.json'), '{"key": "value"}')

  // Video / Audio (if ffmpeg available)
  try {
    const { execSync } = await import('node:child_process')
    execSync('ffmpeg -version', { stdio: 'ignore' })
    ffmpegAvailable = true
  } catch {}
  if (ffmpegAvailable) {
    const { execSync } = await import('node:child_process')
    execSync(
      `ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=1 -f lavfi -i sine=frequency=440:duration=1 -shortest "${path.join(projectRoot, testSubDir, 'test.mp4')}"`,
      { stdio: 'ignore' },
    )
    execSync(
      `ffmpeg -y -f lavfi -i sine=frequency=440:duration=1 "${path.join(projectRoot, testSubDir, 'test.wav')}"`,
      { stdio: 'ignore' },
    )
  } else {
    console.log('  ⚠ ffmpeg not found, F3-layer tests will be skipped')
  }
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
  // F1 层 — Base info（所有文件类型应返回 base）
  // -----------------------------------------------------------------------
  console.log('\nF1 层 — Base info')

  await test('F1a: PNG file base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.png') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.base.fileName, 'test.png')
    assert.equal(result.data.base.mimeType, 'image/png')
    assert.equal(result.data.base.extension, '.png')
    assert.ok(result.data.base.fileSize > 0, 'fileSize should be > 0')
    // createdAt and modifiedAt should be ISO date strings
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T/.test(result.data.base.createdAt),
      'createdAt should be ISO string',
    )
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T/.test(result.data.base.modifiedAt),
      'modifiedAt should be ISO string',
    )
  })

  await test('F1b: TXT file base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.txt') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.base.fileName, 'test.txt')
    assert.equal(result.data.base.mimeType, 'text/plain')
    assert.equal(result.data.base.extension, '.txt')
  })

  await test('F1c: PDF file base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.pdf') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.base.fileName, 'test.pdf')
    assert.equal(result.data.base.mimeType, 'application/pdf')
  })

  await test('F1d: CSV file base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.csv') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.base.mimeType, 'text/csv')
  })

  await test('F1e: HTML file base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.html') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.base.mimeType, 'text/html')
  })

  await test('F1f: JSON file type and base info', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.json') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.fileType, 'other')
    assert.equal(result.data.base.mimeType, 'application/json')
  })

  // -----------------------------------------------------------------------
  // F2 层 — Image details
  // -----------------------------------------------------------------------
  console.log('\nF2 层 — Image details')

  await test('F2a: PNG image details', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.png') }, toolCtx),
    )
    assert.equal(result.data.fileType, 'image')
    assert.equal(result.data.details.width, 200)
    assert.equal(result.data.details.height, 200)
    assert.equal(result.data.details.format, 'png')
    assert.equal(result.data.details.hasAlpha, true)
    assert.equal(result.data.details.channels, 4)
  })

  await test('F2b: JPEG image details', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.jpg') }, toolCtx),
    )
    assert.equal(result.data.fileType, 'image')
    assert.equal(result.data.details.width, 300)
    assert.equal(result.data.details.height, 200)
    assert.equal(result.data.details.format, 'jpeg')
    assert.equal(result.data.details.hasAlpha, false)
  })

  await test('F2c: image details has colorSpace', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.png') }, toolCtx),
    )
    assert.ok(result.data.details.colorSpace, 'colorSpace should be truthy')
  })

  await test('F2d: static PNG isAnimated=false', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.png') }, toolCtx),
    )
    assert.equal(result.data.details.isAnimated, false)
  })

  await test('F2e: image base fileSize matches fs.stat', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.png') }, toolCtx),
    )
    const stat = await fs.stat(path.join(projectRoot, testSubDir, 'test.png'))
    assert.equal(result.data.base.fileSize, stat.size)
  })

  // -----------------------------------------------------------------------
  // F3 层 — Video/Audio details（需 ffmpeg）
  // -----------------------------------------------------------------------
  console.log('\nF3 层 — Video/Audio details')

  if (!ffmpegAvailable) {
    console.log('  (skipped — ffmpeg not available)')
  } else {
    await test('F3a: MP4 video details', async () => {
      const result: any = await withCtx(() =>
        fileInfoTool.execute({ filePath: rel('test.mp4') }, toolCtx),
      )
      assert.equal(result.data.fileType, 'video')
      assert.ok(result.data.details.duration > 0, 'duration should be > 0')
      assert.equal(result.data.details.resolution, '320x240')
      assert.ok(result.data.details.codecs.video, 'video codec should be truthy')
    })

    await test('F3b: WAV audio details', async () => {
      const result: any = await withCtx(() =>
        fileInfoTool.execute({ filePath: rel('test.wav') }, toolCtx),
      )
      assert.equal(result.data.fileType, 'audio')
      assert.ok(result.data.details.duration > 0, 'duration should be > 0')
      assert.equal(result.data.details.resolution, null, 'audio should have no resolution')
      assert.equal(result.data.details.codecs.video, null, 'audio should have no video codec')
    })

    await test('F3c: video details.streams is array with length >= 1', async () => {
      const result: any = await withCtx(() =>
        fileInfoTool.execute({ filePath: rel('test.mp4') }, toolCtx),
      )
      assert.ok(Array.isArray(result.data.details.streams), 'streams should be an array')
      assert.ok(result.data.details.streams.length >= 1, 'streams should have at least 1 entry')
    })

    await test('F3d: video details.bitRate is a number', async () => {
      const result: any = await withCtx(() =>
        fileInfoTool.execute({ filePath: rel('test.mp4') }, toolCtx),
      )
      assert.equal(typeof result.data.details.bitRate, 'number', 'bitRate should be a number')
    })
  }

  // -----------------------------------------------------------------------
  // F4 层 — PDF details
  // -----------------------------------------------------------------------
  console.log('\nF4 层 — PDF details')

  await test('F4a: PDF file type and page count', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.pdf') }, toolCtx),
    )
    assert.equal(result.data.fileType, 'pdf')
    assert.equal(result.data.details.pageCount, 1)
    assert.equal(result.data.details.hasForm, false)
  })

  await test('F4b: PDF details.metadata is an object', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.pdf') }, toolCtx),
    )
    assert.equal(typeof result.data.details.metadata, 'object', 'metadata should be an object')
  })

  await test('F4c: PDF details.fileSize > 0', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.pdf') }, toolCtx),
    )
    assert.ok(result.data.details.fileSize > 0, 'PDF details fileSize should be > 0')
  })

  // -----------------------------------------------------------------------
  // F5 层 — Spreadsheet details
  // -----------------------------------------------------------------------
  console.log('\nF5 层 — Spreadsheet details')

  await test('F5a: CSV spreadsheet details', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.csv') }, toolCtx),
    )
    assert.equal(result.data.fileType, 'spreadsheet')
    assert.equal(result.data.details.sheetCount, 1)
    assert.equal(result.data.details.sheets[0].rowCount, 3)
    assert.equal(result.data.details.sheets[0].colCount, 3)
  })

  await test('F5b: XLSX spreadsheet sheet count', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.xlsx') }, toolCtx),
    )
    assert.equal(result.data.fileType, 'spreadsheet')
    assert.equal(result.data.details.sheetCount, 2)
  })

  await test('F5c: XLSX sheet names', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.xlsx') }, toolCtx),
    )
    assert.equal(result.data.details.sheets[0].name, 'People')
    assert.equal(result.data.details.sheets[1].name, 'Cities')
  })

  await test('F5d: XLSX sheet row/col counts', async () => {
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.xlsx') }, toolCtx),
    )
    // People sheet: header + 2 data rows = 3 rows, 2 columns (Name, Age)
    assert.equal(result.data.details.sheets[0].rowCount, 3)
    assert.equal(result.data.details.sheets[0].colCount, 2)
  })

  // -----------------------------------------------------------------------
  // F6 层 — Edge cases and errors
  // -----------------------------------------------------------------------
  console.log('\nF6 层 — Edge cases and errors')

  await test('F6a: non-existent file throws ENOENT', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          fileInfoTool.execute(
            { filePath: rel('nonexistent.xyz') },
            toolCtx,
          ),
        ),
      /ENOENT|no such file/i,
    )
  })

  await test('F6b: directory path throws not-a-file error', async () => {
    // Create a subdirectory
    const subDirName = 'test_subdir'
    await fs.mkdir(path.join(projectRoot, testSubDir, subDirName), { recursive: true })
    await assert.rejects(
      () =>
        withCtx(() =>
          fileInfoTool.execute(
            { filePath: rel(subDirName) },
            toolCtx,
          ),
        ),
      /not a file/i,
    )
  })

  await test('F6c: .docx file returns document type with hint', async () => {
    // Create a minimal file with .docx extension (not a real docx, but enough to test type detection)
    await fs.copyFile(
      path.join(projectRoot, testSubDir, 'test.txt'),
      path.join(projectRoot, testSubDir, 'test.docx'),
    )
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.docx') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.fileType, 'document')
    // details should have either a hint or an error (hint if recognized, error if parsing fails)
    assert.ok(
      result.data.details.hint || result.data.details.error,
      'document details should have hint or error',
    )
  })

  await test('F6d: unknown extension returns other with empty details', async () => {
    await fs.writeFile(path.join(projectRoot, testSubDir, 'test.xyz'), 'unknown content')
    const result: any = await withCtx(() =>
      fileInfoTool.execute({ filePath: rel('test.xyz') }, toolCtx),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.fileType, 'other')
    assert.deepEqual(result.data.details, {})
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
