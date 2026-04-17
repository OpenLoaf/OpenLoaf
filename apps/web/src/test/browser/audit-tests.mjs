#!/usr/bin/env node
/**
 * Audit browser tests vs recorded test-case yaml files.
 *
 * Reports three categories:
 *   - never_run      : .browser.tsx exists but no yaml (potentially un-executed)
 *   - orphan_yaml    : yaml exists but corresponding .browser.tsx is gone
 *   - prompt_drift   : both exist but yaml promptHash is missing or pre-2.x (no hash)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')
const monoRoot = resolve(webRoot, '../..')
const testsRoot = join(webRoot, 'src/test/browser/__tests__')
const yamlDir = join(monoRoot, '.agents/skills/ai-browser-test/test-cases')

/** Collect all .browser.tsx files and derive their canonical slug(s).
 *  Each file can contribute multiple slugs:
 *    - the filename-derived slug (for yaml files that were auto-created from file name)
 *    - every `testCase: 'xxx'` string literal inside the file (for files that declare
 *      explicit test cases, e.g. basic-chat.browser.tsx defines 100/101/102).
 */
function collectTests() {
  const out = []
  function walk(dir, prefix) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'browser-test-runs') continue
        walk(abs, prefix ? `${prefix}-${entry.name}` : entry.name)
        continue
      }
      if (!entry.name.endsWith('.browser.tsx')) continue
      const base = entry.name.replace(/\.browser\.tsx$/, '')
      const fileSlug = prefix ? `${prefix}-${base}` : base
      const slugs = new Set([fileSlug])
      try {
        const src = readFileSync(abs, 'utf-8')
        for (const m of src.matchAll(/testCase\s*:\s*['"`]([\w-]+)['"`]/g)) {
          slugs.add(m[1])
        }
      } catch {}
      for (const slug of slugs) out.push({ slug, path: abs, fileSlug })
    }
  }
  walk(testsRoot, '')
  return out
}

/** Read yaml files and pull name + promptHash. */
function collectYamls() {
  if (!existsSync(yamlDir)) return []
  return readdirSync(yamlDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => {
      const content = readFileSync(join(yamlDir, f), 'utf-8')
      const name = content.match(/^name:\s*(\S+)/m)?.[1] ?? f.replace(/\.yaml$/, '')
      const promptHash = content.match(/^promptHash:\s*(\S+)/m)?.[1] ?? null
      const updatedAt = content.match(/^updatedAt:\s*(\S+)/m)?.[1]
        ?? content.match(/^createdAt:\s*(\S+)/m)?.[1] ?? null
      return { name, file: f, path: join(yamlDir, f), promptHash, updatedAt }
    })
}

const tests = collectTests()
const yamls = collectYamls()

const yamlByName = new Map(yamls.map(y => [y.name, y]))
const testBySlug = new Map(tests.map(t => [t.slug, t]))

// Count "never run" only against the file-level slug to avoid N duplicates from
// files that declare multiple testCases (we want one "never ran this file" line).
const uniqueFileSlugs = new Map()
for (const t of tests) {
  if (!uniqueFileSlugs.has(t.fileSlug)) uniqueFileSlugs.set(t.fileSlug, t.path)
}
const neverRun = [...uniqueFileSlugs.entries()]
  .filter(([slug]) => {
    // consider file "covered" if any of its slug aliases have a yaml
    for (const t of tests) if (t.fileSlug === slug && yamlByName.has(t.slug)) return false
    return true
  })
  .map(([slug, path]) => ({ slug, path }))

const orphanYaml = yamls.filter(y => !testBySlug.has(y.name))
const promptDrift = yamls
  .filter(y => y.promptHash == null && testBySlug.has(y.name))

console.log(`\n== Browser test audit ==`)
console.log(`Total .browser.tsx files : ${tests.length}`)
console.log(`Total yaml test-cases    : ${yamls.length}\n`)

function dump(label, items, render) {
  console.log(`─ ${label} (${items.length}) ${'─'.repeat(Math.max(0, 50 - label.length - String(items.length).length))}`)
  if (items.length === 0) { console.log('  (none)\n'); return }
  for (const it of items) console.log(`  ${render(it)}`)
  console.log()
}

dump('Never-run tests (no yaml)', neverRun, t => `${t.slug}  —  ${t.path.replace(webRoot + '/', '')}`)
dump('Orphan yamls (test file gone)', orphanYaml, y => `${y.name}  —  ${y.path.replace(monoRoot + '/', '')}`)
dump('Prompt-drift (yaml predates promptHash field)', promptDrift, y => `${y.name}  —  last ${y.updatedAt ?? 'unknown'}`)

const hasIssue = neverRun.length + orphanYaml.length + promptDrift.length
if (hasIssue) {
  console.log(`Found ${hasIssue} issue(s). Run the missing tests or clean up orphan yamls.`)
  process.exit(hasIssue > 10 ? 2 : 1)
}
console.log('All browser tests and yaml test-cases are in sync.')
