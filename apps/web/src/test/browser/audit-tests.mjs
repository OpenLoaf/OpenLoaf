#!/usr/bin/env node
/**
 * Audit browser tests vs recorded test-case yaml files.
 *
 * Reports five categories:
 *   - never_run      : .browser.tsx exists but no yaml (potentially un-executed)
 *   - orphan_yaml    : yaml exists but corresponding .browser.tsx is gone
 *   - duplicate      : same `name:` appears in multiple yaml files (pick one, delete rest)
 *   - misplaced      : yaml should live at `<suite>/<slug>.yaml` but sits elsewhere
 *                      (usually a legacy flat-layout leftover from pre-suite restructure)
 *   - prompt_drift   : both exist but yaml promptHash is missing or pre-2.x (no hash)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSuite } from './test-case-paths.mjs'

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
  const out = []
  function walk(dir, rel) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) { walk(abs, relPath); continue }
      if (!entry.name.endsWith('.yaml')) continue
      const content = readFileSync(abs, 'utf-8')
      const name = content.match(/^name:\s*(\S+)/m)?.[1] ?? entry.name.replace(/\.yaml$/, '')
      const promptHash = content.match(/^promptHash:\s*(\S+)/m)?.[1] ?? null
      const updatedAt = content.match(/^updatedAt:\s*(\S+)/m)?.[1]
        ?? content.match(/^createdAt:\s*(\S+)/m)?.[1] ?? null
      out.push({ name, file: relPath, path: abs, promptHash, updatedAt })
    }
  }
  walk(yamlDir, '')
  return out
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

// ── Duplicate detection (same `name:` in multiple yaml files) ──
// Group yamls by name; any group with >1 file is a duplicate set.
const yamlsByName = new Map()
for (const y of yamls) {
  const list = yamlsByName.get(y.name) ?? []
  list.push(y)
  yamlsByName.set(y.name, list)
}
const duplicates = [] // [{ name, files: [{rel, size, promptHash}] }]
for (const [name, list] of yamlsByName) {
  if (list.length < 2) continue
  duplicates.push({
    name,
    files: list.map(y => ({
      rel: y.file,
      size: existsSync(y.path) ? readFileSync(y.path).length : 0,
      promptHash: y.promptHash,
    })).sort((a, b) => b.size - a.size), // biggest first = likely source-of-truth
  })
}

// ── Misplaced detection (yaml not at expected <suite>/<slug>.yaml) ──
// A yaml is misplaced when resolveSuite(name) returns a suite but the yaml's
// relative path doesn't start with `<suite>/`. Top-level flat yamls and
// cross-suite-folder placements both land here.
const misplaced = []
for (const y of yamls) {
  const suite = resolveSuite(y.name)
  if (!suite) continue // name can't map to a suite; leave alone
  const expectedPrefix = `${suite}/`
  if (!y.file.startsWith(expectedPrefix)) {
    misplaced.push({
      name: y.name,
      actual: y.file,
      expected: `${suite}/${y.name}.yaml`,
    })
  }
}

const orphanYaml = yamls.filter(y => !testBySlug.has(y.name))
// Skip prompt-drift noise caused by duplicate flat-layout leftovers: if a name
// has any yaml sitting at the correct <suite>/ location with a promptHash, the
// orphan flat twin isn't "drift", it's a "duplicate" — already reported above.
const namesWithCanonicalHash = new Set()
for (const [name, list] of yamlsByName) {
  const suite = resolveSuite(name)
  if (!suite) continue
  const canonical = list.find(y => y.file.startsWith(`${suite}/`) && y.promptHash)
  if (canonical) namesWithCanonicalHash.add(name)
}
const promptDrift = yamls
  .filter(y => y.promptHash == null && testBySlug.has(y.name) && !namesWithCanonicalHash.has(y.name))

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
dump('Duplicate yamls (same name, multiple files — keep the biggest, delete rest)', duplicates, d => {
  const lines = d.files.map((f, i) => `${i === 0 ? 'keep ' : 'drop '}${f.rel}  (${f.size}B${f.promptHash ? ', hash' : ', no-hash'})`)
  return `${d.name}\n    ${lines.join('\n    ')}`
})
dump('Misplaced yamls (should live at <suite>/<slug>.yaml)', misplaced, m => `${m.name}\n    actual:   ${m.actual}\n    expected: ${m.expected}`)
dump('Prompt-drift (yaml predates promptHash field)', promptDrift, y => `${y.name}  —  last ${y.updatedAt ?? 'unknown'}`)

const hasIssue = neverRun.length + orphanYaml.length + duplicates.length + misplaced.length + promptDrift.length
if (hasIssue) {
  console.log(`Found ${hasIssue} issue(s). Run the missing tests or clean up orphan/duplicate/misplaced yamls.`)
  process.exit(hasIssue > 10 ? 2 : 1)
}
console.log('All browser tests and yaml test-cases are in sync.')
