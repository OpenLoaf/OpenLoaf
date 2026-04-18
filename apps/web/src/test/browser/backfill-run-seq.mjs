#!/usr/bin/env node
/**
 * 一次性脚本：把 `browser-test-runs` 的所有历史目录规范化到新的纯 seq 命名。
 *
 * 目录名演化：
 *   v1（最老）: `20260417_150958`            ← 纯时间戳
 *   v2（中间）: `0007_20260417_150958`       ← seq + 时间戳
 *   v3（当前）: `0007`                        ← 纯 seq，时间戳进 run-meta.json
 *
 * 本脚本负责：
 *   1. v1 老目录：分配新 seq（max 现有 seq + 1 起步），重命名为 `<seq>`，
 *      把老名字里的时间戳写进 `<dir>/run-meta.json`。
 *   2. v2 中间态目录：去掉 `_<timestamp>` 后缀变成 v3，同样把时间戳存进 run-meta.json。
 *   3. 同步更新 `.agents/skills/ai-browser-test/runs.jsonl` 里 screenshotsDir
 *      字符串前缀，保证跨 run 报告聚合不丢配对。
 *
 * 幂等：v3 目录跳过不动；反复执行安全。
 */
import {
  readdirSync, statSync, renameSync, readFileSync, writeFileSync, existsSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const runsRoot = join(webRoot, 'browser-test-runs')
const runsJsonl = join(monoRoot, '.agents/skills/ai-browser-test/runs.jsonl')

if (!existsSync(runsRoot)) {
  console.log('browser-test-runs does not exist, nothing to do.')
  process.exit(0)
}

// 扫描现状
let maxExistingSeq = 0
const v1Dirs = []        // 纯时间戳
const v2Dirs = []        // seq_timestamp
const v3Dirs = new Set() // 纯 seq

for (const d of readdirSync(runsRoot)) {
  if (!statSync(join(runsRoot, d)).isDirectory()) continue
  if (/^\d+$/.test(d)) {
    v3Dirs.add(d)
    maxExistingSeq = Math.max(maxExistingSeq, Number.parseInt(d, 10))
    continue
  }
  const m = d.match(/^(\d+)_(\d{8}_\d{6})$/)
  if (m) {
    v2Dirs.push({ name: d, seq: Number.parseInt(m[1], 10), ts: m[2] })
    maxExistingSeq = Math.max(maxExistingSeq, Number.parseInt(m[1], 10))
    continue
  }
  if (/^\d{8}_\d{6}$/.test(d)) {
    v1Dirs.push(d)
  }
}

// v1 → v3：按时间顺序分配 seq，起点 = max(existing seq) + 1
v1Dirs.sort()
const v1Renames = v1Dirs.map((name, i) => ({
  oldName: name,
  newName: String(maxExistingSeq + 1 + i).padStart(4, '0'),
  ts: name,
}))

// v2 → v3：直接把 seq 部分作为新名
const v2Renames = v2Dirs.map(({ name, seq, ts }) => ({
  oldName: name,
  newName: String(seq).padStart(4, '0'),
  ts,
}))

const allRenames = [...v1Renames, ...v2Renames]

if (allRenames.length === 0 && v3Dirs.size === maxExistingSeq) {
  console.log(`All ${v3Dirs.size} dirs already normalized, max seq = ${maxExistingSeq}.`)
  process.exit(0)
}

console.log(`Renaming ${v1Renames.length} v1 + ${v2Renames.length} v2 dir(s) → v3 (pure seq).`)

function writeMeta(dirAbs, ts, seq) {
  const metaPath = join(dirAbs, 'run-meta.json')
  if (existsSync(metaPath)) return // 不覆盖已有 meta
  // 从 `YYYYMMDD_HHMMSS` 恢复 ISO 时间（当作 UTC）
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  let startedAt = null
  if (m) {
    const [, y, mo, d, h, mi, se] = m
    startedAt = `${y}-${mo}-${d}T${h}:${mi}:${se}.000Z`
  }
  writeFileSync(
    metaPath,
    JSON.stringify({
      seq: Number.parseInt(seq, 10),
      startedAt,
      legacyTimestamp: ts,
      backfilled: true,
    }, null, 2),
    'utf-8',
  )
}

// 冲突保护：如果目标名已存在（不是自己），报错退出
for (const r of allRenames) {
  const target = join(runsRoot, r.newName)
  if (r.oldName !== r.newName && existsSync(target)) {
    console.error(`ERROR: target '${r.newName}' already exists, can't rename from '${r.oldName}'.`)
    process.exit(1)
  }
}

for (const r of allRenames) {
  const oldAbs = join(runsRoot, r.oldName)
  const newAbs = join(runsRoot, r.newName)
  if (r.oldName !== r.newName) renameSync(oldAbs, newAbs)
  writeMeta(newAbs, r.ts, r.newName)
  console.log(`  ${r.oldName}  →  ${r.newName}  (ts=${r.ts})`)
}

// 同步 runs.jsonl
let rewrote = 0
if (existsSync(runsJsonl)) {
  let content = readFileSync(runsJsonl, 'utf-8')
  for (const r of allRenames) {
    if (r.oldName === r.newName) continue
    const needle = `/${r.oldName}/`
    const replacement = `/${r.newName}/`
    if (content.includes(needle)) {
      content = content.split(needle).join(replacement)
      rewrote++
    }
  }
  writeFileSync(runsJsonl, content, 'utf-8')
}

console.log(`Done. Renamed ${allRenames.length} dir(s), rewrote ${rewrote} screenshotsDir prefix(es).`)
