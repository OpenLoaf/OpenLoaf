#!/usr/bin/env node

/**
 * AI Tool Test Coverage Report
 *
 * Compares registered tool IDs (from packages/api/src/types/tools/*.ts)
 * against tested tool IDs (from tests/**\/*.yaml) to report coverage gaps.
 *
 * Usage:
 *   cd apps/server && node scripts/check-tool-coverage.mjs
 *
 * Exit codes:
 *   0 = full coverage (no missing or orphaned)
 *   1 = coverage gaps or orphaned tests exist
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '../../..')

// ---------------------------------------------------------------------------
// 1. Internal/exempt tools — no explicit behavior test required
// ---------------------------------------------------------------------------
const INTERNAL_TOOLS = new Set([
  'tool-search',      // Master Agent internal routing
  'sub-agent',        // Internal delegation
  'update-plan',      // Internal planning state
  'test-approval',    // Test-only
  'send-input',       // Helper (paired with spawn-agent)
  'create-task',      // Deprecated alias for task-manage
])

// ---------------------------------------------------------------------------
// 2. Extract all tool IDs from packages/api/src/types/tools/*.ts
// ---------------------------------------------------------------------------
function extractDefinedToolIds() {
  const toolsDir = join(ROOT, 'packages/api/src/types/tools')
  const ids = new Set()

  for (const file of readdirSync(toolsDir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue
    const content = readFileSync(join(toolsDir, file), 'utf-8')
    // Match:  id: "xxx"  or  id: 'xxx'
    const regex = /^\s*id:\s*["']([a-z][\w-]*)["']/gm
    let match
    while ((match = regex.exec(content)) !== null) {
      ids.add(match[1])
    }
  }

  return ids
}

// ---------------------------------------------------------------------------
// 3. Extract tested tool IDs from tests/**/*.yaml
// ---------------------------------------------------------------------------
function extractTestedToolIds() {
  const testsDir = join(ROOT, 'apps/server/src/ai/__tests__/agent-behavior/tests')
  const ids = new Set()

  function walkYaml(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walkYaml(full)
        continue
      }
      if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue

      const content = readFileSync(full, 'utf-8')

      // Pattern 1: tools.includes('xxx')
      const includesRe = /tools\.includes\(\s*["']([a-z][\w-]*)["']\s*\)/g
      let m
      while ((m = includesRe.exec(content)) !== null) {
        ids.add(m[1])
      }

      // Pattern 2: toolName === 'xxx' or toolName === "xxx"
      const eqRe = /toolName\s*===\s*["']([a-z][\w-]*)["']/g
      while ((m = eqRe.exec(content)) !== null) {
        ids.add(m[1])
      }

      // Pattern 3: toolNames contains / some(t => t === 'xxx')
      const someRe = /t\s*===\s*["']([a-z][\w-]*)["']/g
      while ((m = someRe.exec(content)) !== null) {
        ids.add(m[1])
      }

      // Pattern 4: check for tool id in agentType + toolIds vars (sub-agent tests)
      const toolIdsVarRe = /toolIds:\s*['"]\[([^\]]*)\]['"]/g
      while ((m = toolIdsVarRe.exec(content)) !== null) {
        const inner = m[1]
        const itemRe = /["']([a-z][\w-]*)["']/g
        let im
        while ((im = itemRe.exec(inner)) !== null) {
          ids.add(im[1])
        }
      }
    }
  }

  walkYaml(testsDir)
  return ids
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------
function main() {
  const definedIds = extractDefinedToolIds()
  const testedIds = extractTestedToolIds()

  const testableIds = new Set([...definedIds].filter((id) => !INTERNAL_TOOLS.has(id)))
  const missingIds = [...testableIds].filter((id) => !testedIds.has(id)).sort()
  const orphanedIds = [...testedIds].filter((id) => !definedIds.has(id)).sort()

  const registered = definedIds.size
  const excluded = INTERNAL_TOOLS.size
  const testable = testableIds.size
  const tested = [...testableIds].filter((id) => testedIds.has(id)).length
  const coverage = testable > 0 ? ((tested / testable) * 100).toFixed(1) : '100.0'

  console.log('')
  console.log('========================================')
  console.log('  AI Tool Test Coverage Report')
  console.log('========================================')
  console.log(`  Registered: ${registered} | Excluded: ${excluded} | Testable: ${testable} | Tested: ${tested}`)
  console.log(`  Coverage: ${coverage}% (${tested}/${testable})`)
  console.log('')

  if (missingIds.length > 0) {
    console.log(`  MISSING COVERAGE (${missingIds.length} tools):`)
    for (const id of missingIds) {
      console.log(`    - ${id}`)
    }
    console.log('')
  }

  if (orphanedIds.length > 0) {
    console.log(`  ORPHANED TESTS (${orphanedIds.length} tools):`)
    for (const id of orphanedIds) {
      console.log(`    - ${id}  (tool removed but test still references it)`)
    }
    console.log('')
  }

  if (missingIds.length === 0 && orphanedIds.length === 0) {
    console.log('  All testable tools have coverage. No orphaned tests.')
    console.log('')
  }

  console.log('========================================')
  console.log('')

  process.exit(missingIds.length > 0 || orphanedIds.length > 0 ? 1 : 0)
}

main()
