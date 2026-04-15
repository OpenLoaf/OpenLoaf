// @ts-nocheck
/**
 * Read 工具真实样本 smoke 测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/readTool.samples.smoke.ts
 *
 * 对 __tests__/fixtures/read-samples 下真实样本逐个调用 readTool，
 * 打印 kind / type / 耗时 / content 前 160 字符 / meta / images。
 *
 * 多模态样本（jpg / wav / mp4）默认 `understand: false`，避免 SaaS 计费。
 * 加 `--understand` 参数可开启真实 SaaS 调用。
 */
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { readTool } from '@/ai/tools/fileTools'

const THIS_FILE = fileURLToPath(import.meta.url)
const FIXTURE_DIR = path.resolve(path.dirname(THIS_FILE), 'fixtures', 'read-samples')
const USE_UNDERSTAND = process.argv.includes('--understand')

type Sample = {
  file: string
  expectOk: boolean
  note?: string
  overrideArgs?: Record<string, unknown>
}

const SAMPLES: Sample[] = [
  { file: 'meeting-notes.txt', expectOk: true, note: '纯文本 (3.6 KB)' },
  { file: 'sample.docx', expectOk: true, note: 'DOCX (9.4 MB)' },
  { file: 'sample.xlsx', expectOk: true, note: 'XLSX (7.3 KB)' },
  { file: 'bmr.pdf', expectOk: true, note: 'PDF EN (3.8 MB)' },
  { file: 'manual-cn.pdf', expectOk: true, note: 'PDF 中文 (16 MB) — 只读前 3 页', overrideArgs: { pageRange: '1-3' } },
  { file: 'inside.pdf', expectOk: true, note: 'PDF (2.9 MB)' },
  { file: 'sample.jpg', expectOk: true, note: `JPG (272 KB)${USE_UNDERSTAND ? ' — understand' : ''}`, overrideArgs: { understand: USE_UNDERSTAND } },
  { file: 'sample.wav', expectOk: true, note: `WAV (653 KB)${USE_UNDERSTAND ? ' — understand' : ''}`, overrideArgs: { understand: USE_UNDERSTAND } },
  { file: 'sample.mp4', expectOk: true, note: `MP4 (4.1 MB)${USE_UNDERSTAND ? ' — understand' : ''}`, overrideArgs: { understand: USE_UNDERSTAND } },
  { file: 'sample.zip', expectOk: true, note: '.zip — 自动解压并列出内容' },
]

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'read-smoke-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

const toolCtx = {
  toolCallId: 'read-smoke',
  messages: [],
  abortSignal: new AbortController().signal,
}

function truncate(s: string, n = 160): string {
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed.length <= n ? trimmed : `${trimmed.slice(0, n)}…`
}

function parseEnvelope(raw: string): {
  attrs: Record<string, string>
  meta?: Record<string, unknown>
  contentLen: number
  contentHead: string
  imageCount: number
  hasError: boolean
  errorText?: string
} {
  const attrMatch = raw.match(/^<file\s+([^>]+)>/)
  const attrs: Record<string, string> = {}
  if (attrMatch) {
    const re = /(\w+)="([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(attrMatch[1]!))) attrs[m[1]!] = m[2]!
  }
  const metaMatch = raw.match(/<meta>([\s\S]*?)<\/meta>/)
  let meta: Record<string, unknown> | undefined
  if (metaMatch) {
    try { meta = JSON.parse(metaMatch[1]!) } catch { /* ignore */ }
  }
  const contentMatch = raw.match(/<content>([\s\S]*?)<\/content>/)
  const contentBody = contentMatch?.[1] ?? ''
  const errorMatch = raw.match(/<error>([\s\S]*?)<\/error>/)
  const imageMatches = raw.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []
  return {
    attrs,
    meta,
    contentLen: contentBody.length,
    contentHead: truncate(contentBody),
    imageCount: imageMatches.length,
    hasError: !!errorMatch,
    errorText: errorMatch?.[1],
  }
}

async function runOne(sample: Sample) {
  const absPath = path.join(FIXTURE_DIR, sample.file)
  try {
    await fs.access(absPath)
  } catch {
    console.log(`  ✘ ${sample.file} — fixture missing at ${absPath}`)
    return
  }
  const args: any = { file_path: absPath, ...(sample.overrideArgs ?? {}) }
  const start = Date.now()
  try {
    const result = await withCtx(() => readTool.execute(args, toolCtx))
    const elapsed = Date.now() - start
    if (!sample.expectOk) {
      console.log(`  ✘ ${sample.file} — expected failure but succeeded (${elapsed}ms)`)
      return
    }
    const env = parseEnvelope(result as string)
    console.log(
      `  ✓ ${sample.file.padEnd(22)} [${(env.attrs.type ?? '??').padEnd(6)}] ${elapsed}ms` +
      `  bytes=${env.attrs.bytes}  contentLen=${env.contentLen}  images=${env.imageCount}`,
    )
    if (env.meta) console.log(`      meta: ${JSON.stringify(env.meta)}`)
    if (env.contentHead) console.log(`      head: ${env.contentHead}`)
    if (env.hasError) console.log(`      note: <error> ${truncate(env.errorText ?? '')}`)
  } catch (err: any) {
    const elapsed = Date.now() - start
    const msg = err?.message ?? String(err)
    if (!sample.expectOk) {
      console.log(`  ✓ ${sample.file.padEnd(22)} [rejected] ${elapsed}ms — ${truncate(msg, 100)}`)
    } else {
      console.log(`  ✘ ${sample.file.padEnd(22)} FAILED (${elapsed}ms) — ${msg}`)
    }
  }
}

async function main() {
  await setupE2eTestEnv()
  console.log(`\nRead smoke test — fixtures at ${FIXTURE_DIR}`)
  console.log(`understand=${USE_UNDERSTAND ? 'TRUE (billed)' : 'false'}\n`)
  for (const sample of SAMPLES) {
    if (sample.note) console.log(`[${sample.note}]`)
    await runOne(sample)
    console.log()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
