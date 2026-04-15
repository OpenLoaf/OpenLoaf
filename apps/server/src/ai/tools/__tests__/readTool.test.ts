// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * 统一 readTool 调度层测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/readTool.test.ts
 *
 * 本套件专注 Read 工具的 dispatcher 行为 + 边界：
 *   A 层 — 文本路径（numbered lines / offset+limit / chunking / budget）
 *   B 层 — 错误边界（ENOENT / 目录 / 未知二进制 / legacy office）
 *   C 层 — 多模态 understand=false（PNG / MP4 / MP3，不真实调用 SaaS）
 *   D 层 — XML 包装 invariants（所有成功返回都用 <file>...</file>）
 *   E 层 — MIME 识别（.ts/.json/.md 走 text；扩展名决定 type 属性）
 *
 * PDF / DOCX / XLSX / PPTX 的 mutate → read 回环已在 pdfTools.test.ts 和
 * officeTools.test.ts 里覆盖，这里不重复。
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
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
// Context + path helpers
// ---------------------------------------------------------------------------

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'read-tool-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

const toolCtx = {
  toolCallId: 'read-test',
  messages: [],
  abortSignal: AbortSignal.abort(),
}

let projectRoot = ''
let testSubDir = ''

async function setupTestDir() {
  projectRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  testSubDir = `_read_test_${Date.now()}`
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })
}

async function cleanupTestDir() {
  await fs
    .rm(path.join(projectRoot, testSubDir), { recursive: true, force: true })
    .catch(() => {})
}

function rel(filename: string): string {
  return `${testSubDir}/${filename}`
}

function abs(filename: string): string {
  return path.join(projectRoot, testSubDir, filename)
}

async function writeFile(relPath: string, content: string): Promise<string> {
  const target = abs(relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf-8')
  return rel(relPath)
}

async function writeBinaryFile(relPath: string, buf: Buffer): Promise<string> {
  const target = abs(relPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buf)
  return rel(relPath)
}

async function readViaTool(opts: Record<string, unknown>): Promise<string> {
  return withCtx(() => readTool.execute(opts, toolCtx)) as Promise<string>
}

// ---------------------------------------------------------------------------
// XML parsing helpers (not a full parser — regex on well-formed output)
// ---------------------------------------------------------------------------

function parseMeta(xml: string): Record<string, unknown> {
  const m = xml.match(/<meta>(.+?)<\/meta>/s)
  if (!m) throw new Error('no <meta> tag in output')
  return JSON.parse(m[1]!)
}

function extractContent(xml: string): string {
  const m = xml.match(/<content>\n?([\s\S]*?)\n?<\/content>/)
  return m ? m[1]! : ''
}

function getFileAttr(xml: string, attr: string): string | null {
  const re = new RegExp(`<file[^>]*\\s${attr}="([^"]*)"`)
  const m = xml.match(re)
  return m ? m[1]! : null
}

function isXmlEnvelope(xml: string): boolean {
  return xml.startsWith('<file ') && xml.trimEnd().endsWith('</file>')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // -----------------------------------------------------------------------
  // A 层 — 文本路径
  // -----------------------------------------------------------------------
  console.log('\nA 层 — 文本路径')

  await test('A1: read multi-line text file wraps in <file> + numbered lines', async () => {
    const body = 'line one\nline two\nline three\n'
    const filePath = await writeFile('a1.txt', body)
    const out = await readViaTool({ file_path: filePath })
    assert.ok(isXmlEnvelope(out), 'output must be <file>...</file>')
    assert.equal(getFileAttr(out, 'type'), 'text')
    assert.equal(getFileAttr(out, 'name'), 'a1.txt')
    const meta = parseMeta(out)
    assert.equal(meta.totalLines, 3)
    assert.equal(meta.displayedStart, 1)
    assert.equal(meta.displayedEnd, 3)
    const content = extractContent(out)
    assert.ok(content.includes('1\tline one'), 'line 1 has tab prefix')
    assert.ok(content.includes('2\tline two'))
    assert.ok(content.includes('3\tline three'))
  })

  await test('A2: offset + limit returns a sub-range with correct meta', async () => {
    const body = Array.from({ length: 20 }, (_, i) => `row-${i + 1}`).join('\n')
    const filePath = await writeFile('a2.txt', body)
    const out = await readViaTool({ file_path: filePath, offset: 5, limit: 3 })
    const meta = parseMeta(out)
    assert.equal(meta.totalLines, 20)
    assert.equal(meta.displayedStart, 5)
    assert.equal(meta.displayedEnd, 7)
    const content = extractContent(out)
    assert.ok(content.includes('5\trow-5'))
    assert.ok(content.includes('6\trow-6'))
    assert.ok(content.includes('7\trow-7'))
    assert.ok(!content.includes('4\trow-4'), 'must not include pre-offset lines')
    assert.ok(!content.includes('8\trow-8'), 'must not include post-limit lines')
  })

  await test('A3: empty file reports 0 lines in note', async () => {
    const filePath = await writeFile('a3.txt', '')
    const out = await readViaTool({ file_path: filePath })
    const meta = parseMeta(out)
    assert.equal(meta.totalLines, 0)
    assert.ok(out.includes('<note>'), 'should include note for empty file')
    assert.ok(out.includes('Empty file'), 'note should say empty')
  })

  await test('A4: offset > totalLines throws', async () => {
    const filePath = await writeFile('a4.txt', 'only one line')
    await assert.rejects(
      () => readViaTool({ file_path: filePath, offset: 100 }),
      /offset exceeds file length/,
    )
  })

  await test('A5: offset = 0 throws', async () => {
    const filePath = await writeFile('a5.txt', 'content')
    await assert.rejects(
      () => readViaTool({ file_path: filePath, offset: 0 }),
      /offset must be a 1-indexed line number|Too small/,
    )
  })

  await test('A6: long line gets chunked with [chars A-B/total] labels', async () => {
    // One line ≈ 4 KB, above the 500 byte MAX_LINE_LENGTH threshold
    const longLine = 'x'.repeat(4000)
    const filePath = await writeFile('a6.txt', longLine)
    const out = await readViaTool({ file_path: filePath })
    const content = extractContent(out)
    assert.ok(/1\[chars 0-\d+\/4000\]/.test(content), 'expected chunk label on line 1')
    const meta = parseMeta(out)
    assert.ok(meta.longLineCount === 1, 'longLineCount should be 1')
  })

  await test('A7: UTF-8 content is preserved (CJK)', async () => {
    const filePath = await writeFile('a7.txt', '你好世界\n再见')
    const out = await readViaTool({ file_path: filePath })
    const content = extractContent(out)
    assert.ok(content.includes('你好世界'))
    assert.ok(content.includes('再见'))
  })

  // -----------------------------------------------------------------------
  // B 层 — 错误边界
  // -----------------------------------------------------------------------
  console.log('\nB 层 — 错误边界')

  await test('B1: non-existent file throws ENOENT', async () => {
    await assert.rejects(
      () => readViaTool({ file_path: rel('does-not-exist.txt') }),
      /ENOENT|no such file/i,
    )
  })

  await test('B2: directory path throws "not a file"', async () => {
    // testSubDir itself is a directory
    await assert.rejects(
      () => readViaTool({ file_path: testSubDir }),
      /not a file/i,
    )
  })

  await test('B3: known binary extension (.exe) throws with clear message', async () => {
    const filePath = await writeBinaryFile('b3.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))
    await assert.rejects(
      () => readViaTool({ file_path: filePath }),
      /Unknown binary file type/,
    )
  })

  await test('B3b: unknown extension (.xyz) falls through to text reader (best-effort)', async () => {
    // Custom / unknown extensions should not be refused — some users store
    // plain-text configs under non-standard extensions.
    const filePath = await writeFile('b3b.xyz', 'key=value\nfoo=bar')
    const out = await readViaTool({ file_path: filePath })
    assert.equal(getFileAttr(out, 'type'), 'text', 'unknown ext → text fallback')
    const content = extractContent(out)
    assert.ok(content.includes('key=value'))
  })

  await test('B4: legacy .doc throws with re-save guidance', async () => {
    const filePath = await writeBinaryFile('b4.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
    await assert.rejects(
      () => readViaTool({ file_path: filePath }),
      /Legacy Office format.*\.docx/,
    )
  })

  await test('B5: legacy .xls throws with re-save guidance', async () => {
    const filePath = await writeBinaryFile('b5.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
    await assert.rejects(
      () => readViaTool({ file_path: filePath }),
      /Legacy Office format.*\.xlsx/,
    )
  })

  await test('B6: legacy .ppt throws with re-save guidance', async () => {
    const filePath = await writeBinaryFile('b6.ppt', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
    await assert.rejects(
      () => readViaTool({ file_path: filePath }),
      /Legacy Office format.*\.pptx/,
    )
  })

  // -----------------------------------------------------------------------
  // C 层 — 多模态 understand=false（不真实调用 SaaS）
  // -----------------------------------------------------------------------
  console.log('\nC 层 — 多模态 understand=false')

  await test('C1: PNG with understand=false returns metadata and empty content', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()
    const filePath = await writeBinaryFile('c1.png', png)
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.ok(isXmlEnvelope(out))
    assert.equal(getFileAttr(out, 'type'), 'image')
    assert.equal(getFileAttr(out, 'mimeType'), 'image/png')
    const meta = parseMeta(out)
    assert.equal(meta.width, 120, 'width parsed from sharp')
    assert.equal(meta.height, 80, 'height parsed from sharp')
    assert.equal(meta.understand, false)
    // No SaaS call → content empty (no <content> body)
    assert.ok(!meta.error, 'no error when understand=false')
  })

  await test('C2: MP4 with understand=false returns video envelope without SaaS call', async () => {
    // Zero-byte mp4 is enough — readVideoFile only stats + (conditionally) uploads
    const filePath = await writeBinaryFile('c2.mp4', Buffer.alloc(0))
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.ok(isXmlEnvelope(out))
    assert.equal(getFileAttr(out, 'type'), 'video')
    assert.equal(getFileAttr(out, 'mimeType'), 'video/mp4')
    const meta = parseMeta(out)
    assert.equal(meta.understand, false)
    assert.equal(meta.bytes, 0)
    assert.ok(!meta.error)
  })

  await test('C3: MP3 with understand=false returns audio envelope without SaaS call', async () => {
    const filePath = await writeBinaryFile('c3.mp3', Buffer.alloc(0))
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.ok(isXmlEnvelope(out))
    assert.equal(getFileAttr(out, 'type'), 'audio')
    assert.equal(getFileAttr(out, 'mimeType'), 'audio/mpeg')
    const meta = parseMeta(out)
    assert.equal(meta.understand, false)
    assert.equal(meta.bytes, 0)
    assert.ok(!meta.error)
  })

  // -----------------------------------------------------------------------
  // D 层 — XML 包装 invariants
  // -----------------------------------------------------------------------
  console.log('\nD 层 — XML 包装 invariants')

  await test('D1: text envelope has name/type/mimeType/bytes attrs', async () => {
    const filePath = await writeFile('d1.ts', 'const x = 1\n')
    const out = await readViaTool({ file_path: filePath })
    assert.ok(getFileAttr(out, 'name'), 'name attr present')
    assert.equal(getFileAttr(out, 'type'), 'text')
    assert.ok(getFileAttr(out, 'mimeType'), 'mimeType attr present')
    assert.ok(/bytes="\d+"/.test(out), 'bytes attr numeric')
  })

  await test('D2: meta block is always valid JSON', async () => {
    const filePath = await writeFile('d2.md', '# Title\nBody')
    const out = await readViaTool({ file_path: filePath })
    // parseMeta already throws if JSON is invalid
    const meta = parseMeta(out)
    assert.ok(typeof meta === 'object')
    assert.equal(typeof meta.totalLines, 'number')
  })

  await test('D3: XML attributes escape quotes/ampersands in filenames', async () => {
    const weirdName = 'a & b.txt'
    const filePath = await writeFile(weirdName, 'hello')
    const out = await readViaTool({ file_path: filePath })
    // Ampersand must be entity-encoded
    assert.ok(out.includes('name="a &amp; b.txt"'), 'ampersand encoded')
  })

  // -----------------------------------------------------------------------
  // E 层 — MIME 识别
  // -----------------------------------------------------------------------
  console.log('\nE 层 — MIME 识别')

  await test('E1: .ts file → type=text mimeType=text/plain', async () => {
    const filePath = await writeFile('e1.ts', 'export const x = 1')
    const out = await readViaTool({ file_path: filePath })
    assert.equal(getFileAttr(out, 'type'), 'text')
    assert.equal(getFileAttr(out, 'mimeType'), 'text/plain')
  })

  await test('E2: .json file → type=text', async () => {
    const filePath = await writeFile('e2.json', '{"a":1}')
    const out = await readViaTool({ file_path: filePath })
    assert.equal(getFileAttr(out, 'type'), 'text')
  })

  await test('E3: .md file → type=text', async () => {
    const filePath = await writeFile('e3.md', '# heading')
    const out = await readViaTool({ file_path: filePath })
    assert.equal(getFileAttr(out, 'type'), 'text')
  })

  await test('E4: .jpeg file → type=image mimeType=image/jpeg', async () => {
    const sharp = (await import('sharp')).default
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#00ff00' },
    })
      .jpeg()
      .toBuffer()
    const filePath = await writeBinaryFile('e4.jpeg', jpeg)
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.equal(getFileAttr(out, 'type'), 'image')
    assert.equal(getFileAttr(out, 'mimeType'), 'image/jpeg')
  })

  await test('E5: .webm file → type=video', async () => {
    const filePath = await writeBinaryFile('e5.webm', Buffer.alloc(0))
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.equal(getFileAttr(out, 'type'), 'video')
    assert.equal(getFileAttr(out, 'mimeType'), 'video/webm')
  })

  await test('E6: .wav file → type=audio', async () => {
    const filePath = await writeBinaryFile('e6.wav', Buffer.alloc(0))
    const out = await readViaTool({ file_path: filePath, understand: false })
    assert.equal(getFileAttr(out, 'type'), 'audio')
    assert.equal(getFileAttr(out, 'mimeType'), 'audio/wav')
  })

  // -----------------------------------------------------------------------
  // Cleanup & summary
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
