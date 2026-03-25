#!/usr/bin/env node
/**
 * Create release tag(s) and push to origin.
 *
 * Usage:
 *   node .agents/skills/update-version-management/scripts/tag-and-push.mjs --server
 *   node .agents/skills/update-version-management/scripts/tag-and-push.mjs --web
 *   node .agents/skills/update-version-management/scripts/tag-and-push.mjs --desktop
 *   node .agents/skills/update-version-management/scripts/tag-and-push.mjs --server --web
 *   node .agents/skills/update-version-management/scripts/tag-and-push.mjs --all  (auto-detect from analyze-changes)
 *
 * Options:
 *   --dry-run    Show what would be done without executing
 *   -m "msg"     Custom annotation message (default: version number)
 *
 * Tag format:
 *   server  → server-v{version}     (annotated)
 *   web     → web-v{version}        (annotated)
 *   desktop → desktop@{version}     (lightweight)
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const doServer = args.includes('--server') || args.includes('--all')
const doWeb = args.includes('--web') || args.includes('--all')
const doDesktop = args.includes('--desktop') || args.includes('--all')
const msgIdx = args.indexOf('-m')
const customMsg = msgIdx !== -1 ? args[msgIdx + 1] : null

if (!doServer && !doWeb && !doDesktop) {
  console.error('Usage: tag-and-push.mjs --server|--web|--desktop|--all [--dry-run] [-m "message"]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readVersion(app) {
  const pkg = JSON.parse(readFileSync(resolve(`apps/${app}/package.json`), 'utf8'))
  return pkg.version
}

function run(cmd) {
  console.log(`$ ${cmd}`)
  if (!dryRun) {
    execSync(cmd, { stdio: 'inherit' })
  }
}

function tagExists(tag) {
  try {
    execSync(`git rev-parse ${tag}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Build tag list
// ---------------------------------------------------------------------------

const tags = []

if (doServer) {
  const ver = readVersion('server')
  const tag = `server-v${ver}`
  tags.push({ app: 'server', tag, version: ver, annotated: true })
}

if (doWeb) {
  const ver = readVersion('web')
  const tag = `web-v${ver}`
  tags.push({ app: 'web', tag, version: ver, annotated: true })
}

if (doDesktop) {
  const ver = readVersion('desktop')
  const tag = `desktop@${ver}`
  tags.push({ app: 'desktop', tag, version: ver, annotated: false })
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

let hasError = false
for (const { app, tag } of tags) {
  if (tagExists(tag)) {
    console.error(`✗ Tag "${tag}" already exists for ${app}. Bump version first.`)
    hasError = true
  }
}
if (hasError) process.exit(1)

// ---------------------------------------------------------------------------
// Create tags
// ---------------------------------------------------------------------------

console.log(dryRun ? '\n[DRY RUN] Would create tags:' : '\nCreating tags:')

for (const { app, tag, version, annotated } of tags) {
  const msg = customMsg || `Release ${app} ${version}`
  if (annotated) {
    run(`git tag -a "${tag}" -m "${msg}"`)
  } else {
    // Desktop uses lightweight tags
    run(`git tag "${tag}"`)
  }
  console.log(`  ✓ ${tag}`)
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

const tagNames = tags.map((t) => t.tag)
const pushCmd = `git push origin main ${tagNames.join(' ')}`

console.log('')
run(pushCmd)
console.log(dryRun ? '\n[DRY RUN] Done.' : '\n✓ Tags pushed successfully.')
