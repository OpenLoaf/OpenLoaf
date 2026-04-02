// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Image Process 工具层测试（action roundtrip + convert + error handling）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/imageProcessTools.test.ts
 *
 * 测试覆盖：
 *   M 层 — Action Roundtrip（resize / crop / rotate / flip / grayscale / blur / sharpen / tint）
 *   N 层 — Convert format（PNG↔JPEG↔WebP↔AVIF↔TIFF + quality 对比）
 *   O 层 — 错误处理和边界情况
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import sharp from 'sharp'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { imageProcessTool } from '@/ai/tools/imageProcessTools'
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
    { sessionId: 'ImageProcess-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

let projectRoot = ''
const testSubDir = `_image_test_${Date.now()}`

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })

  // Generate test images with sharp
  // 200x200 red PNG
  await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toFile(path.join(projectRoot, rel('test.png')))

  // 300x200 blue JPEG
  await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 128, b: 255 } },
  })
    .jpeg()
    .toFile(path.join(projectRoot, rel('test.jpg')))
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
  // M0 — get-info action
  // -----------------------------------------------------------------------
  console.log('\nM0 — get-info action')

  await test('M0a: get-info on PNG returns width, height, format, colorSpace', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'get-info', filePath: rel('test.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.action, 'get-info')
    assert.equal(result.data.width, 200)
    assert.equal(result.data.height, 200)
    assert.equal(result.data.format, 'png')
    assert.ok(result.data.colorSpace, 'should have colorSpace')
    assert.equal(result.data.channels, 4, 'RGBA should have 4 channels')
    assert.equal(result.data.hasAlpha, true, 'RGBA PNG should have alpha')
    assert.ok(result.data.fileSize > 0, 'should have fileSize')
    assert.equal(result.data.isAnimated, false, 'static PNG is not animated')
  })

  await test('M0b: get-info on JPEG returns width, height, no alpha', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'get-info', filePath: rel('test.jpg') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 300)
    assert.equal(result.data.height, 200)
    assert.equal(result.data.format, 'jpeg')
    assert.equal(result.data.channels, 3, 'JPEG should have 3 channels')
    assert.equal(result.data.hasAlpha, false, 'JPEG should not have alpha')
  })

  await test('M0c: get-info does not modify the file', async () => {
    const absPath = path.join(projectRoot, rel('test.png'))
    const sizeBefore = (await fs.stat(absPath)).size
    const mtimeBefore = (await fs.stat(absPath)).mtimeMs

    await withCtx(() =>
      imageProcessTool.execute(
        { action: 'get-info', filePath: rel('test.png') },
        toolCtx,
      ),
    )

    const sizeAfter = (await fs.stat(absPath)).size
    const mtimeAfter = (await fs.stat(absPath)).mtimeMs
    assert.equal(sizeBefore, sizeAfter, 'file size should not change')
    assert.equal(mtimeBefore, mtimeAfter, 'file mtime should not change')
  })

  // -----------------------------------------------------------------------
  // M 层 — Action Roundtrip
  // -----------------------------------------------------------------------
  console.log('\nM 层 — Action Roundtrip')

  await test('M1: resize PNG 200x200 → 100x100', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: rel('test.png'), width: 100, height: 100 },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 100)
    assert.equal(result.data.height, 100)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  // Recreate test.png since M1 overwrites it in place
  await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toFile(path.join(projectRoot, rel('test.png')))

  await test('M2: resize only width=50 (height proportional)', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: rel('test.png'), width: 50, outputPath: rel('m2_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 50)
    // height should be proportional (original 200x200 → 50x50 with cover fit)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M3: crop PNG left=10,top=10,cropWidth=50,cropHeight=50', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        {
          action: 'crop',
          filePath: rel('test.png'),
          left: 10,
          top: 10,
          cropWidth: 50,
          cropHeight: 50,
          outputPath: rel('m3_out.png'),
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 50)
    assert.equal(result.data.height, 50)
  })

  await test('M4: rotate JPEG 90°', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'rotate', filePath: rel('test.jpg'), angle: 90, outputPath: rel('m4_out.jpg') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    // Original is 300x200, after 90° rotation: width=200, height=300
    assert.equal(result.data.width, 200)
    assert.equal(result.data.height, 300)
  })

  await test('M5: flip horizontal', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'flip', filePath: rel('test.png'), direction: 'horizontal', outputPath: rel('m5_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M6: flip vertical', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'flip', filePath: rel('test.png'), direction: 'vertical', outputPath: rel('m6_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M7: grayscale', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'grayscale', filePath: rel('test.png'), outputPath: rel('m7_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M8: blur sigma=5', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'blur', filePath: rel('test.png'), sigma: 5, outputPath: rel('m8_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M9: sharpen', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'sharpen', filePath: rel('test.png'), outputPath: rel('m9_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  await test('M10: tint "#FF6600"', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'tint', filePath: rel('test.png'), tintColor: '#FF6600', outputPath: rel('m10_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.fileSize > 0, 'should have fileSize > 0')
  })

  // -----------------------------------------------------------------------
  // N 层 — Convert format
  // -----------------------------------------------------------------------
  console.log('\nN 层 — Convert format')

  await test('N1: PNG → JPEG', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'jpeg', outputPath: rel('n1_out.jpg') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.format?.includes('jpeg'), 'format should contain jpeg')
    const exists = await fs.stat(path.join(projectRoot, rel('n1_out.jpg')))
    assert.ok(exists.size > 0, 'output file should exist')
  })

  await test('N2: PNG → WebP', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'webp', outputPath: rel('n2_out.webp') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'webp')
  })

  await test('N3: JPEG → PNG', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.jpg'), format: 'png', outputPath: rel('n3_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'png')
  })

  await test('N4: PNG → AVIF', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'avif', outputPath: rel('n4_out.avif') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'heif')
  })

  await test('N5: PNG → TIFF', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'tiff', outputPath: rel('n5_out.tiff') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'tiff')
  })

  let lowQualityFileSize = 0

  await test('N6: convert quality=10 (low)', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'jpeg', quality: 10, outputPath: rel('n6_low.jpg') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    lowQualityFileSize = result.data.fileSize
    assert.ok(lowQualityFileSize > 0, 'low quality file should have size > 0')
  })

  await test('N7: convert quality=95 (high) → fileSize > N6', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'convert', filePath: rel('test.png'), format: 'jpeg', quality: 95, outputPath: rel('n7_high.jpg') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(
      result.data.fileSize > lowQualityFileSize,
      `high quality (${result.data.fileSize}) should be larger than low quality (${lowQualityFileSize})`,
    )
  })

  await test('N8: resize + outputPath (source preserved)', async () => {
    const sourcePath = rel('test.png')
    const outPath = rel('n8_resized.png')
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: sourcePath, width: 80, height: 80, outputPath: outPath },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    // Source file should still exist
    const sourceStat = await fs.stat(path.join(projectRoot, sourcePath))
    assert.ok(sourceStat.size > 0, 'source file should still exist')
    // Output file should also exist
    const outStat = await fs.stat(path.join(projectRoot, outPath))
    assert.ok(outStat.size > 0, 'output file should exist')
  })

  // -----------------------------------------------------------------------
  // O 层 — 错误处理和边界情况
  // -----------------------------------------------------------------------
  console.log('\nO 层 — 错误处理和边界情况')

  await test('O1: file doesn\'t exist → ENOENT', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'resize', filePath: rel('nonexistent.png'), width: 100 },
            toolCtx,
          ),
        ),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('O2: unsupported format (.txt) → Unsupported file format', async () => {
    const txtFile = rel('o2.txt')
    await fs.writeFile(path.join(projectRoot, txtFile), 'dummy', 'utf-8')
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'resize', filePath: txtFile, width: 100 },
            toolCtx,
          ),
        ),
      /Unsupported file format/,
    )
  })

  await test('O3: resize no width no height → resize requires', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'resize', filePath: rel('test.png') },
            toolCtx,
          ),
        ),
      /resize requires/,
    )
  })

  await test('O4: crop missing params → crop requires', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'crop', filePath: rel('test.png'), left: 10 },
            toolCtx,
          ),
        ),
      /crop requires/,
    )
  })

  await test('O5: tint no tintColor → tint requires', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'tint', filePath: rel('test.png') },
            toolCtx,
          ),
        ),
      /tint requires/,
    )
  })

  await test('O6: convert no format → convert requires format', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'convert', filePath: rel('test.png'), outputPath: rel('o6_out.jpg') },
            toolCtx,
          ),
        ),
      /convert requires format/,
    )
  })

  await test('O7: convert no outputPath → convert requires outputPath', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'convert', filePath: rel('test.png'), format: 'jpeg' },
            toolCtx,
          ),
        ),
      /convert requires outputPath/,
    )
  })

  await test('O8: unknown action → Unknown action', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          imageProcessTool.execute(
            { action: 'pixelate', filePath: rel('test.png') },
            toolCtx,
          ),
        ),
      /Unknown action/,
    )
  })

  await test('O9: outputPath in nested non-existent dir → ok (fs.mkdir recursive)', async () => {
    const nestedOut = rel('deep/nested/dir/o9_out.png')
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: rel('test.png'), width: 50, outputPath: nestedOut },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const stat = await fs.stat(path.join(projectRoot, nestedOut))
    assert.ok(stat.size > 0, 'output file in nested dir should exist')
  })

  await test('O10: resize width=1, height=1 → ok, 1x1', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: rel('test.png'), width: 1, height: 1, outputPath: rel('o10_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 1)
    assert.equal(result.data.height, 1)
  })

  await test('O11: blur without outputPath → auto-suffix _blur, source preserved', async () => {
    const blurSource = rel('o11_source.png')
    await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
    })
      .png()
      .toFile(path.join(projectRoot, blurSource))

    const sizeBefore = (await fs.stat(path.join(projectRoot, blurSource))).size

    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'blur', filePath: blurSource, sigma: 3 },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.outputPath.includes('o11_source_blur.png'), `outputPath should have _blur suffix, got: ${result.data.outputPath}`)
    // Source file should be preserved
    const sizeAfter = (await fs.stat(path.join(projectRoot, blurSource))).size
    assert.equal(sizeBefore, sizeAfter, 'source file should not be modified')
    // Suffixed file should exist
    const suffixedStat = await fs.stat(result.data.outputPath)
    assert.ok(suffixedStat.size > 0, 'suffixed output file should exist')
  })

  await test('O11b: resize without outputPath → auto-suffix _resize', async () => {
    const source = rel('o11b_source.png')
    await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
    })
      .png()
      .toFile(path.join(projectRoot, source))

    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: source, width: 50 },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.outputPath.includes('o11b_source_resize.png'), `should have _resize suffix, got: ${result.data.outputPath}`)
    // Source untouched
    const sourceMeta = await sharp(path.join(projectRoot, source)).metadata()
    assert.equal(sourceMeta.width, 200, 'source width should remain 200')
  })

  await test('O11c: overwrite=true without outputPath → overwrites source', async () => {
    const source = rel('o11c_source.png')
    await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toFile(path.join(projectRoot, source))

    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'resize', filePath: source, width: 80, overwrite: true },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.outputPath.includes('o11c_source.png'), 'should overwrite source path')
    // Source file should now be 80px wide
    const meta = await sharp(result.data.outputPath).metadata()
    assert.equal(meta.width, 80, 'source should be overwritten to 80px')
  })

  await test('O11d: grayscale without outputPath → auto-suffix _grayscale', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'grayscale', filePath: rel('test.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.outputPath.endsWith('test_grayscale.png'), `should end with _grayscale.png, got: ${result.data.outputPath}`)
  })

  await test('O12: rotate angle=0 → ok, dimensions unchanged (200x200)', async () => {
    const result: any = await withCtx(() =>
      imageProcessTool.execute(
        { action: 'rotate', filePath: rel('test.png'), angle: 0, outputPath: rel('o12_out.png') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.width, 200)
    assert.equal(result.data.height, 200)
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
