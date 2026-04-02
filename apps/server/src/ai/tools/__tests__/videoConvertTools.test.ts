// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Video Convert 工具层测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/videoConvertTools.test.ts
 *
 * 测试覆盖：
 *   P 层 — FFmpeg 集成测试（需要系统安装 FFmpeg）
 *   Q 层 — 错误处理和边界情况
 *   R 层 — 音频转换及更多场景
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execSync } from 'node:child_process'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { videoConvertTool } from '@/ai/tools/videoConvertTools'
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
    { sessionId: 'VideoConvert-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

let ffmpegAvailable = false
try {
  execSync('ffmpeg -version', { stdio: 'ignore' })
  ffmpegAvailable = true
} catch {}

let projectRoot = ''
const testSubDir = `_video_test_${Date.now()}`

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })

  // Generate test media files if FFmpeg is available
  if (ffmpegAvailable) {
    const mp4Path = path.join(projectRoot, testSubDir, 'test.mp4')
    execSync(
      `ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=1 -f lavfi -i sine=frequency=440:duration=1 -shortest "${mp4Path}"`,
      { stdio: 'ignore' },
    )

    const wavPath = path.join(projectRoot, testSubDir, 'test.wav')
    execSync(
      `ffmpeg -y -f lavfi -i sine=frequency=440:duration=1 "${wavPath}"`,
      { stdio: 'ignore' },
    )
  }

  // Create a .txt file for unsupported format testing
  await fs.writeFile(path.join(projectRoot, testSubDir, 'test.txt'), 'not a video')
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

  console.log(`\n  FFmpeg available: ${ffmpegAvailable}`)

  // -----------------------------------------------------------------------
  // P 层 — FFmpeg 集成测试
  // -----------------------------------------------------------------------
  console.log('\nP 层 — FFmpeg 集成测试')

  await test('P1: get-info on test.mp4', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        { action: 'get-info', filePath: rel('test.mp4') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.duration > 0, 'should have positive duration')
    assert.equal(result.data.resolution, '320x240')
    assert.ok(result.data.fileSize > 0, 'should have positive file size')
  })

  await test('P2: convert MP4 → WebM', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'convert',
          filePath: rel('test.mp4'),
          outputPath: rel('p2_output.webm'),
          format: 'webm',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'webm')
    // Verify output file exists
    const stat = await fs.stat(result.data.outputPath)
    assert.ok(stat.isFile(), 'output file should exist')
  })

  await test('P3: extract-audio MP3', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'extract-audio',
          filePath: rel('test.mp4'),
          outputPath: rel('p3_audio.mp3'),
          audioFormat: 'mp3',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'mp3')
    assert.ok(result.data.fileSize > 0, 'should have positive file size')
  })

  await test('P4: extract-audio WAV', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'extract-audio',
          filePath: rel('test.mp4'),
          outputPath: rel('p4_audio.wav'),
          audioFormat: 'wav',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'wav')
  })

  await test('P5: convert with resolution 160x120', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'convert',
          filePath: rel('test.mp4'),
          outputPath: rel('p5_resized.mp4'),
          resolution: '160x120',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  // -----------------------------------------------------------------------
  // Q 层 — 错误处理和边界情况
  // -----------------------------------------------------------------------
  console.log('\nQ 层 — 错误处理和边界情况')

  await test('Q1: file doesn\'t exist → ENOENT', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          videoConvertTool.execute(
            { action: 'get-info', filePath: rel('nonexistent.mp4') },
            toolCtx,
          ),
        ),
      /ENOENT|not a file|no such file/i,
    )
  })

  await test('Q2: unsupported format (.txt) → Unsupported file format', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          videoConvertTool.execute(
            { action: 'get-info', filePath: rel('test.txt') },
            toolCtx,
          ),
        ),
      /Unsupported file format/,
    )
  })

  await test('Q3: convert without outputPath → error', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          videoConvertTool.execute(
            { action: 'convert', filePath: rel('test.mp4') },
            toolCtx,
          ),
        ),
      /convert requires outputPath/,
    )
  })

  await test('Q4: extract-audio without outputPath → error', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          videoConvertTool.execute(
            { action: 'extract-audio', filePath: rel('test.mp4') },
            toolCtx,
          ),
        ),
      /extract-audio requires outputPath/,
    )
  })

  await test('Q5: unknown action → error', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          videoConvertTool.execute(
            { action: 'unknown-action', filePath: rel('test.mp4') },
            toolCtx,
          ),
        ),
      /Unknown action/,
    )
  })

  // Q6: Skipped — mocking FFmpeg unavailability is complex and fragile.
  // The checkFfmpeg() path is implicitly covered when FFmpeg is not installed.

  await test('Q7: get-info on WAV (audio only) file', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        { action: 'get-info', filePath: rel('test.wav') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.resolution, null, 'audio-only file should have null resolution')
    assert.equal(result.data.codecs.video, null, 'audio-only file should have null video codec')
  })

  await test('Q8: outputPath in nested non-existent dir', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'convert',
          filePath: rel('test.mp4'),
          outputPath: rel('nested/deep/dir/q8_output.mp4'),
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true, 'should succeed with recursive mkdir')
  })

  // -----------------------------------------------------------------------
  // R 层 — 音频转换及更多场景
  // -----------------------------------------------------------------------
  console.log('\nR 层 — 音频转换及更多场景')

  await test('R1: extract-audio default (mp3)', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'extract-audio',
          filePath: rel('test.mp4'),
          outputPath: rel('r1_default.mp3'),
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'mp3', 'default audio format should be mp3')
  })

  await test('R2: extract-audio aac', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'extract-audio',
          filePath: rel('test.mp4'),
          outputPath: rel('r2_audio.aac'),
          audioFormat: 'aac',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'aac')
  })

  await test('R3: extract-audio flac', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'extract-audio',
          filePath: rel('test.mp4'),
          outputPath: rel('r3_audio.flac'),
          audioFormat: 'flac',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.equal(result.data.format, 'flac')
  })

  await test('R4: WAV → MP3 convert', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'convert',
          filePath: rel('test.wav'),
          outputPath: rel('r4_converted.mp3'),
          format: 'mp3',
        },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
  })

  await test('R5: get-info returns streams array', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        { action: 'get-info', filePath: rel('test.mp4') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    assert.ok(result.data.streams.length >= 1, 'should have at least 1 stream')
    for (const stream of result.data.streams) {
      assert.ok(stream.type, 'each stream should have a type')
      assert.ok(stream.codec, 'each stream should have a codec')
    }
  })

  await test('R6: get-info fileSize matches fs.stat', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    const result: any = await withCtx(() =>
      videoConvertTool.execute(
        { action: 'get-info', filePath: rel('test.mp4') },
        toolCtx,
      ),
    )
    assert.equal(result.ok, true)
    const stat = await fs.stat(path.join(projectRoot, testSubDir, 'test.mp4'))
    assert.equal(result.data.fileSize, stat.size, 'fileSize should match actual stat size')
  })

  await test('R7: convert then get-info on output', async () => {
    if (!ffmpegAvailable) { console.log('  ⚠ FFmpeg not available, skipped'); return }

    // Step 1: convert
    const convertResult: any = await withCtx(() =>
      videoConvertTool.execute(
        {
          action: 'convert',
          filePath: rel('test.mp4'),
          outputPath: rel('r7_output.mp4'),
        },
        toolCtx,
      ),
    )
    assert.equal(convertResult.ok, true)

    // Step 2: get-info on the converted output
    const infoResult: any = await withCtx(() =>
      videoConvertTool.execute(
        { action: 'get-info', filePath: rel('r7_output.mp4') },
        toolCtx,
      ),
    )
    assert.equal(infoResult.ok, true)
    assert.ok(infoResult.data.duration > 0, 'converted file should have positive duration')
    assert.ok(infoResult.data.fileSize > 0, 'converted file should have positive file size')
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
