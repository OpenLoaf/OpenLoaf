/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * MCPConfigService unit tests.
 *
 * Tests MCP server configuration CRUD, scope merging, and trust verification.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/services/__tests__/mcpConfigService.test.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setOpenLoafRootOverride } from '@openloaf/config'

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
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const msg = `${name}: ${err?.message}`
    errors.push(msg)
    console.log(`  ✗ ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Setup: redirect openloaf root to temp directory
// ---------------------------------------------------------------------------
const tempRoot = mkdtempSync(path.join(tmpdir(), 'openloaf-mcp-test-'))
setOpenLoafRootOverride(tempRoot)

// Create a fake project root
const projectRoot = mkdtempSync(path.join(tmpdir(), 'openloaf-mcp-project-'))
mkdirSync(path.join(projectRoot, '.openloaf'), { recursive: true })

// Import AFTER setting the root override
const {
  getMcpServers,
  getEnabledMcpServers,
  getMcpServerById,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  trustMcpServer,
  needsTrustVerification,
} = await import('../mcpConfigService')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n=== MCPConfigService Tests ===\n')

  // -----------------------------------------------------------------------
  // 1. Empty state
  // -----------------------------------------------------------------------
  await test('getMcpServers returns empty array initially', () => {
    const servers = getMcpServers()
    assert.ok(Array.isArray(servers))
    assert.equal(servers.length, 0)
  })

  // -----------------------------------------------------------------------
  // 2. addMcpServer — global
  // -----------------------------------------------------------------------
  let globalServerId = ''

  await test('addMcpServer creates a global server', () => {
    const server = addMcpServer({
      name: 'test-github',
      description: 'GitHub MCP server',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'test-token' },
      enabled: true,
      scope: 'global',
    })

    assert.ok(server.id)
    assert.equal(server.name, 'test-github')
    assert.equal(server.transport, 'stdio')
    assert.equal(server.scope, 'global')
    assert.equal(server.enabled, true)
    assert.equal(server.trusted, true) // global servers are auto-trusted
    assert.ok(server.configHash)
    globalServerId = server.id
  })

  await test('getMcpServers returns the added server', () => {
    const servers = getMcpServers()
    assert.equal(servers.length, 1)
    assert.equal(servers[0]!.name, 'test-github')
  })

  await test('getMcpServerById finds the server', () => {
    const server = getMcpServerById(globalServerId)
    assert.ok(server)
    assert.equal(server.id, globalServerId)
    assert.equal(server.name, 'test-github')
  })

  // -----------------------------------------------------------------------
  // 3. addMcpServer — project scope
  // -----------------------------------------------------------------------
  let projectServerId = ''

  await test('addMcpServer creates a project-scoped server', () => {
    const server = addMcpServer({
      name: 'test-db',
      transport: 'http',
      url: 'http://localhost:5000/mcp',
      enabled: true,
      scope: 'project',
      projectId: projectRoot,
    })

    assert.ok(server.id)
    assert.equal(server.scope, 'project')
    assert.equal(server.trusted, false) // project servers need explicit trust
    projectServerId = server.id
  })

  await test('config file created at project root', () => {
    const configPath = path.join(projectRoot, '.openloaf', 'mcp-servers.json')
    assert.ok(existsSync(configPath))
    const content = JSON.parse(readFileSync(configPath, 'utf-8'))
    assert.equal(content.servers.length, 1)
    assert.equal(content.servers[0].name, 'test-db')
  })

  // -----------------------------------------------------------------------
  // 4. Scope merging
  // -----------------------------------------------------------------------
  await test('getMcpServers merges global + project servers', () => {
    const servers = getMcpServers(projectRoot)
    assert.equal(servers.length, 2)
    const names = servers.map((s) => s.name).sort()
    assert.deepEqual(names, ['test-db', 'test-github'])
  })

  await test('project servers take precedence on name conflict', () => {
    // Add a project server with same name as global
    const server = addMcpServer({
      name: 'test-github', // same name as global
      transport: 'http',
      url: 'http://project-specific-github/mcp',
      enabled: true,
      scope: 'project',
      projectId: projectRoot,
    })

    const merged = getMcpServers(projectRoot)
    const githubServers = merged.filter((s) => s.name === 'test-github')
    // Should only have 1 (project wins)
    assert.equal(githubServers.length, 1)
    assert.equal(githubServers[0]!.scope, 'project')

    // Cleanup: remove the conflicting project server
    removeMcpServer(server.id, projectRoot)
  })

  // -----------------------------------------------------------------------
  // 5. updateMcpServer
  // -----------------------------------------------------------------------
  await test('updateMcpServer changes fields', () => {
    const updated = updateMcpServer({
      id: globalServerId,
      description: 'Updated description',
    })
    assert.ok(updated)
    assert.equal(updated!.description, 'Updated description')
    assert.equal(updated!.name, 'test-github') // unchanged
  })

  await test('updateMcpServer returns null for nonexistent ID', () => {
    const result = updateMcpServer({ id: 'nonexistent-id' })
    assert.equal(result, null)
  })

  // -----------------------------------------------------------------------
  // 6. setMcpServerEnabled
  // -----------------------------------------------------------------------
  await test('setMcpServerEnabled disables a server', () => {
    const ok = setMcpServerEnabled(globalServerId, false)
    assert.equal(ok, true)
    const server = getMcpServerById(globalServerId)
    assert.equal(server?.enabled, false)
  })

  await test('getEnabledMcpServers excludes disabled servers', () => {
    const enabled = getEnabledMcpServers()
    const found = enabled.find((s) => s.id === globalServerId)
    assert.equal(found, undefined)
  })

  await test('setMcpServerEnabled re-enables a server', () => {
    setMcpServerEnabled(globalServerId, true)
    const server = getMcpServerById(globalServerId)
    assert.equal(server?.enabled, true)
  })

  // -----------------------------------------------------------------------
  // 7. Trust verification
  // -----------------------------------------------------------------------
  await test('needsTrustVerification returns false for global servers', () => {
    const server = getMcpServerById(globalServerId)!
    assert.equal(needsTrustVerification(server), false)
  })

  await test('needsTrustVerification returns true for untrusted project servers', () => {
    const server = getMcpServerById(projectServerId, projectRoot)!
    assert.equal(needsTrustVerification(server), true)
  })

  await test('trustMcpServer marks server as trusted', () => {
    const ok = trustMcpServer(projectServerId, projectRoot)
    assert.equal(ok, true)
    const server = getMcpServerById(projectServerId, projectRoot)!
    assert.equal(server.trusted, true)
    assert.equal(needsTrustVerification(server), false)
  })

  await test('config change revokes trust for project server', () => {
    // Update a config field that changes the hash
    updateMcpServer({ id: projectServerId, url: 'http://new-url/mcp' }, projectRoot)
    const server = getMcpServerById(projectServerId, projectRoot)!
    // Trust should be revoked because content changed
    assert.equal(server.trusted, false)
    assert.equal(needsTrustVerification(server), true)
  })

  // -----------------------------------------------------------------------
  // 8. removeMcpServer
  // -----------------------------------------------------------------------
  await test('removeMcpServer removes a server', () => {
    const ok = removeMcpServer(globalServerId)
    assert.equal(ok, true)
    const server = getMcpServerById(globalServerId)
    assert.equal(server, undefined)
  })

  await test('removeMcpServer returns false for nonexistent ID', () => {
    const ok = removeMcpServer('nonexistent-id')
    assert.equal(ok, false)
  })

  await test('removeMcpServer removes project server', () => {
    const ok = removeMcpServer(projectServerId, projectRoot)
    assert.equal(ok, true)
    const servers = getMcpServers(projectRoot)
    assert.equal(servers.length, 0)
  })

  // -----------------------------------------------------------------------
  // 9. Config file persistence
  // -----------------------------------------------------------------------
  await test('global config file persists correctly', () => {
    const configPath = path.join(tempRoot, 'mcp-servers.json')
    assert.ok(existsSync(configPath))
    const content = JSON.parse(readFileSync(configPath, 'utf-8'))
    assert.equal(content.version, 1)
    assert.ok(Array.isArray(content.servers))
  })

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  • ${e}`)
  }

  // Cleanup temp dirs
  try {
    rmSync(tempRoot, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  } catch { /* ignore cleanup errors */ }

  process.exit(failed > 0 ? 1 : 0)
}

void runTests()
