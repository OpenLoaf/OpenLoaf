#!/usr/bin/env node
/**
 * Pre-release validation checks. Run before bumping versions or creating tags.
 *
 * Usage:
 *   node .agents/skills/update-version-management/scripts/pre-release-check.mjs [--desktop] [--skip-types]
 *
 * Checks:
 *   1. Working tree is clean (no uncommitted changes)
 *   2. Lockfile is in sync with package.json files
 *   3. Type checking passes (pnpm check-types)
 *   4. [--desktop] Desktop changelog file exists for current version
 *   5. Tag format validation (no duplicate tags)
 *
 * Exit code: 0 = all passed, 1 = failures found
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const checkDesktop = args.includes('--desktop')
const skipTypes = args.includes('--skip-types')

let passed = 0
let failed = 0
let warned = 0

function check(name, fn) {
  try {
    const result = fn()
    if (result === 'warn') {
      warned++
      console.log(`⚠ ${name}`)
    } else {
      passed++
      console.log(`✓ ${name}`)
    }
  } catch (e) {
    failed++
    console.log(`✗ ${name}`)
    console.log(`  → ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// 1. Working tree status
// ---------------------------------------------------------------------------

check('Working tree is clean', () => {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
  if (status) {
    const lines = status.split('\n')
    const modified = lines.filter((l) => !l.startsWith('??'))
    const untracked = lines.filter((l) => l.startsWith('??'))

    if (modified.length > 0) {
      throw new Error(
        `${modified.length} uncommitted change(s). Commit or stash before releasing.\n` +
          modified
            .slice(0, 5)
            .map((l) => `    ${l}`)
            .join('\n'),
      )
    }
    if (untracked.length > 0) {
      console.log(`  (${untracked.length} untracked file(s) — ignored)`)
      return 'warn'
    }
  }
})

// ---------------------------------------------------------------------------
// 2. Lockfile sync
// ---------------------------------------------------------------------------

check('Lockfile is in sync', () => {
  // Check if any package.json was modified more recently than pnpm-lock.yaml
  try {
    execSync('pnpm install --frozen-lockfile --dry-run 2>&1', {
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (e) {
    if (e.stdout?.includes('ERR_PNPM_OUTDATED_LOCKFILE') || e.stderr?.includes('ERR_PNPM_OUTDATED_LOCKFILE')) {
      throw new Error('pnpm-lock.yaml is out of sync. Run: pnpm install --no-frozen-lockfile')
    }
    // Other errors (e.g., no internet for dry-run) — just warn
    return 'warn'
  }
})

// ---------------------------------------------------------------------------
// 3. Type checking
// ---------------------------------------------------------------------------

if (!skipTypes) {
  check('Type checking passes', () => {
    try {
      execSync('pnpm check-types', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120_000,
      })
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '')
      // Extract first few error lines
      const errorLines = output
        .split('\n')
        .filter((l) => l.includes('error TS') || l.includes('Error:'))
        .slice(0, 5)
      throw new Error(
        'Type errors found:\n' + errorLines.map((l) => `    ${l.trim()}`).join('\n'),
      )
    }
  })
} else {
  console.log('⊘ Type checking (skipped)')
}

// ---------------------------------------------------------------------------
// 4. Desktop changelog
// ---------------------------------------------------------------------------

if (checkDesktop) {
  check('Desktop changelog exists', () => {
    const pkg = JSON.parse(readFileSync(resolve('apps/desktop/package.json'), 'utf8'))
    const version = pkg.version
    const changelogPath = resolve(`apps/desktop/changelogs/${version}/en.md`)

    if (!existsSync(changelogPath)) {
      throw new Error(
        `Missing: apps/desktop/changelogs/${version}/en.md\n` +
          '    GitHub Release body is read from this file. Create it before tagging.',
      )
    }

    // Check it's not empty
    const content = readFileSync(changelogPath, 'utf8').trim()
    if (content.length < 10) {
      throw new Error(`Changelog file exists but seems too short (${content.length} chars)`)
    }
  })
}

// ---------------------------------------------------------------------------
// 5. Tag duplication check
// ---------------------------------------------------------------------------

check('No duplicate tags', () => {
  const duplicates = []

  for (const app of ['server', 'web', 'desktop']) {
    const pkg = JSON.parse(readFileSync(resolve(`apps/${app}/package.json`), 'utf8'))
    const ver = pkg.version
    const tag = app === 'desktop' ? `desktop@${ver}` : `${app}-v${ver}`

    try {
      execSync(`git rev-parse ${tag} 2>/dev/null`, { encoding: 'utf8', stdio: 'pipe' })
      duplicates.push(`${tag} (${app} v${ver})`)
    } catch {
      // Good — tag doesn't exist
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Tag(s) already exist — bump version first:\n` +
        duplicates.map((d) => `    ${d}`).join('\n'),
    )
  }
})

// ---------------------------------------------------------------------------
// 6. Commit message check (HEAD)
// ---------------------------------------------------------------------------

check('HEAD commit has no [skip ci]', () => {
  const msg = execSync('git log -1 --pretty=%B', { encoding: 'utf8' })
  if (msg.includes('[skip ci]')) {
    throw new Error('HEAD commit contains [skip ci] — CI will not trigger. Amend or create new commit.')
  }
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n─────────────────────────────────`)
console.log(`Results: ${passed} passed, ${failed} failed, ${warned} warnings`)

if (failed > 0) {
  console.log('\n✗ Pre-release checks FAILED. Fix issues above before releasing.')
  process.exit(1)
} else {
  console.log('\n✓ All pre-release checks passed.')
}
