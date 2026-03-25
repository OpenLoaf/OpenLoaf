#!/usr/bin/env node
/**
 * Analyze changes since last release tag to determine which apps need publishing.
 *
 * Usage:
 *   node .agents/skills/update-version-management/scripts/analyze-changes.mjs [--verbose]
 *
 * Finds the most recent tag (across all apps), then checks which directories
 * have changes. Applies the directory → app mapping from the skill spec.
 *
 * Exit code 0 = analysis complete (results printed to stdout as JSON).
 */

import { execSync } from 'node:child_process'

const verbose = process.argv.includes('--verbose')

// ---------------------------------------------------------------------------
// 1. Find baseline tag (most recent across all app tags)
// ---------------------------------------------------------------------------

function findLatestTag() {
  const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Only consider release tags
  const releaseTag = tags.find(
    (t) => t.startsWith('desktop@') || t.startsWith('server-v') || t.startsWith('web-v'),
  )
  if (!releaseTag) {
    console.error('⚠ No release tags found, falling back to first commit')
    return execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim()
  }
  return releaseTag
}

const baselineTag = findLatestTag()
if (verbose) console.error(`Baseline tag: ${baselineTag}`)

// ---------------------------------------------------------------------------
// 2. Get changed files since baseline
// ---------------------------------------------------------------------------

function getChangedFiles(ref) {
  // Committed changes
  const committed = execSync(`git diff --name-only ${ref}..HEAD`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Uncommitted changes (staged + unstaged)
  const uncommitted = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)

  // Untracked files
  const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)

  return [...new Set([...committed, ...uncommitted, ...untracked])]
}

const changedFiles = getChangedFiles(baselineTag)
if (verbose) console.error(`Changed files: ${changedFiles.length}`)

// ---------------------------------------------------------------------------
// 3. Directory → App mapping (from SKILL.md spec)
// ---------------------------------------------------------------------------

// Returns: { server: boolean, web: boolean, desktop: boolean }
function classifyChanges(files) {
  const result = { server: false, web: false, desktop: false }
  const details = { server: [], web: [], desktop: [], ignored: [] }

  for (const f of files) {
    // Direct app directories
    if (f.startsWith('apps/server/')) {
      result.server = true
      details.server.push(f)
    } else if (f.startsWith('apps/web/')) {
      result.web = true
      details.web.push(f)
    } else if (f.startsWith('apps/desktop/')) {
      result.desktop = true
      details.desktop.push(f)
    }
    // Package mappings
    else if (f.startsWith('packages/db/')) {
      result.server = true
      details.server.push(f)
    } else if (f.startsWith('packages/ui/')) {
      result.web = true
      details.web.push(f)
    } else if (f.startsWith('packages/widget-sdk/')) {
      result.web = true
      details.web.push(f)
    } else if (f.startsWith('packages/config/')) {
      // config affects server + desktop (not web at runtime)
      result.server = true
      result.desktop = true
      details.server.push(f)
      details.desktop.push(f)
    } else if (f.startsWith('packages/api/')) {
      // Need sub-path analysis
      const apiResult = classifyApiFile(f)
      if (apiResult.server) {
        result.server = true
        details.server.push(f)
      }
      if (apiResult.web) {
        result.web = true
        details.web.push(f)
      }
    } else {
      // docs, .agents, root configs — no app impact
      details.ignored.push(f)
    }
  }

  return { result, details }
}

function classifyApiFile(filePath) {
  // packages/api/src/services/ → Server
  if (filePath.includes('/src/services/')) return { server: true, web: false }
  // packages/api/src/routers/ → Server
  if (filePath.includes('/src/routers/')) return { server: true, web: false }
  // packages/api/src/common/tabs.ts → Web
  if (filePath.includes('/src/common/tabs')) return { server: false, web: true }
  // packages/api/src/common/model → Server
  if (filePath.match(/\/src\/common\/model/)) return { server: true, web: false }
  // packages/api/src/types/ → Both
  if (filePath.includes('/src/types/')) return { server: true, web: true }
  // Default: both (conservative)
  return { server: true, web: true }
}

// ---------------------------------------------------------------------------
// 4. Output
// ---------------------------------------------------------------------------

const { result: affected, details } = classifyChanges(changedFiles)

// Read current versions
function readVersion(pkgPath) {
  try {
    const content = execSync(`cat ${pkgPath}`, { encoding: 'utf8' })
    return JSON.parse(content).version
  } catch {
    return 'unknown'
  }
}

const versions = {
  server: readVersion('apps/server/package.json'),
  web: readVersion('apps/web/package.json'),
  desktop: readVersion('apps/desktop/package.json'),
}

const output = {
  baselineTag,
  totalChangedFiles: changedFiles.length,
  affected,
  versions,
  summary: [],
}

if (affected.server) output.summary.push(`Server (${versions.server}) — ${details.server.length} files`)
if (affected.web) output.summary.push(`Web (${versions.web}) — ${details.web.length} files`)
if (affected.desktop) output.summary.push(`Desktop (${versions.desktop}) — ${details.desktop.length} files`)
if (!affected.server && !affected.web && !affected.desktop) {
  output.summary.push('No app-affecting changes detected')
}

console.log(JSON.stringify(output, null, 2))

if (verbose) {
  console.error('\n--- Details ---')
  for (const [app, files] of Object.entries(details)) {
    if (files.length) {
      console.error(`\n${app} (${files.length}):`)
      for (const f of files.slice(0, 10)) console.error(`  ${f}`)
      if (files.length > 10) console.error(`  ... and ${files.length - 10} more`)
    }
  }
}
