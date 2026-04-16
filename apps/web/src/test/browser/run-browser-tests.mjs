#!/usr/bin/env node
/**
 * Browser test runner wrapper.
 *
 * Usage:
 *   node run-browser-tests.mjs 009              # run test 009
 *   node run-browser-tests.mjs 009 010 basic    # run tests 009, 010, and basic-*
 *   node run-browser-tests.mjs --all            # run all tests
 *
 * Without arguments, prints usage and exits (no tests run).
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(root, '../../..')

const args = process.argv.slice(2)
const extraVitestArgs = []
const patterns = []

for (const arg of args) {
  if (arg === '--all') {
    patterns.length = 0
    patterns.push('__ALL__')
  } else if (arg.startsWith('--')) {
    extraVitestArgs.push(arg)
  } else {
    patterns.push(arg)
  }
}

if (patterns.length === 0) {
  console.log(`
  AI Browser Test Runner
  ──────────────────────
  Usage:
    pnpm test:browser:run <pattern> [pattern...]   run matching tests
    pnpm test:browser:run --all                    run all tests

  Examples:
    pnpm test:browser:run 009                      run test 009
    pnpm test:browser:run 007 009 basic            run tests 007, 009, and basic-*
    pnpm test:browser:run --all                    run all tests

  Available tests:`)

  // List available test files
  const { readdirSync } = await import('node:fs')
  const testsDir = resolve(root, '__tests__')
  try {
    const files = readdirSync(testsDir)
      .filter(f => f.endsWith('.browser.tsx'))
      .sort()
    for (const f of files) {
      console.log(`    ${f.replace('.browser.tsx', '')}`)
    }
  } catch {
    console.log('    (no test files found)')
  }
  console.log()
  process.exit(0)
}

// Build vitest command
const vitestArgs = ['run', '--config', 'vitest.browser.config.ts']

if (!patterns.includes('__ALL__')) {
  // Join patterns with | for regex OR matching
  const filter = patterns.join('|')
  vitestArgs.push(filter)
}

vitestArgs.push(...extraVitestArgs)

// Quote args that contain regex metacharacters (e.g. "|") to prevent shell interpretation
const cmd = `pnpm exec vitest ${vitestArgs.map(a => /[|*?(){}[\]\\]/.test(a) ? `'${a}'` : a).join(' ')}`
console.log(`Running: ${cmd}\n`)

try {
  execSync(cmd, { cwd: webRoot, stdio: 'inherit' })
} catch (e) {
  // vitest exits non-zero on test failure — still generate report
}

// Generate HTML report
try {
  execSync('node src/test/browser/generate-report.mjs', { cwd: webRoot, stdio: 'inherit' })
} catch {
  console.error('Warning: report generation failed')
}
