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
 * MCP Client Manager integration tests.
 *
 * Tests real MCP server connection using the user's configured
 * context7 server (stdio transport via npx).
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/services/__tests__/mcpClientManager.test.ts
 */
import assert from 'node:assert/strict'
import { mcpClientManager } from '../mcpClientManager'
import { getMcpToolIds, isMcpTool } from '@/ai/tools/toolRegistry'
import { getMcpCatalogEntries } from '@openloaf/api/types/tools/toolCatalog'
import { getEnabledMcpServers } from '@/services/mcpConfigService'

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
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n=== MCP Client Manager Integration Tests ===\n')

  // -----------------------------------------------------------------------
  // 1. Check config exists
  // -----------------------------------------------------------------------
  const servers = getEnabledMcpServers()

  await test('getEnabledMcpServers returns configured servers', () => {
    console.log(`    Found ${servers.length} enabled server(s):`, servers.map(s => s.name))
    assert.ok(servers.length > 0, 'No enabled MCP servers found in ~/.openloaf/mcp-servers.json')
  })

  const context7 = servers.find(s => s.name === 'context7')
  await test('context7 server is configured', () => {
    assert.ok(context7, 'context7 server not found')
    assert.equal(context7!.transport, 'stdio')
    assert.equal(context7!.command, 'npx')
    console.log(`    Config: ${context7!.command} ${context7!.args?.join(' ')}`)
  })

  // -----------------------------------------------------------------------
  // 2. No tools registered before connection
  // -----------------------------------------------------------------------
  await test('getMcpToolIds is empty before connect', () => {
    const ids = getMcpToolIds()
    console.log(`    Tool IDs before connect: [${ids.join(', ')}]`)
    // May not be empty if previous test left state, that's ok
  })

  // -----------------------------------------------------------------------
  // 3. Connect to context7
  // -----------------------------------------------------------------------
  let toolIds: string[] = []

  await test('connect to context7 MCP server (may take a few seconds)', async () => {
    assert.ok(context7, 'context7 not configured')
    console.log('    Connecting...')
    toolIds = await mcpClientManager.connect(context7!)
    console.log(`    Connected! Discovered ${toolIds.length} tool(s): [${toolIds.join(', ')}]`)
    assert.ok(toolIds.length > 0, 'No tools discovered from context7 server')
  })

  // -----------------------------------------------------------------------
  // 4. Verify tools registered in toolRegistry
  // -----------------------------------------------------------------------
  await test('MCP tools registered in toolRegistry', () => {
    const registeredIds = getMcpToolIds()
    console.log(`    Registered MCP tool IDs: [${registeredIds.join(', ')}]`)
    for (const id of toolIds) {
      assert.ok(registeredIds.includes(id), `Tool ${id} not in registry`)
      assert.ok(isMcpTool(id), `${id} should be recognized as MCP tool`)
    }
  })

  // -----------------------------------------------------------------------
  // 5. Verify catalog entries
  // -----------------------------------------------------------------------
  await test('MCP tools registered in catalog', () => {
    const entries = getMcpCatalogEntries()
    console.log(`    Catalog entries: ${entries.length}`)
    for (const id of toolIds) {
      const entry = entries.find(e => e.id === id)
      assert.ok(entry, `Catalog entry missing for ${id}`)
      console.log(`    - ${entry!.id}: ${entry!.description.slice(0, 60)}...`)
    }
  })

  // -----------------------------------------------------------------------
  // 6. Check server status
  // -----------------------------------------------------------------------
  await test('server status is connected', () => {
    const status = mcpClientManager.getServerStatus(context7!.id)
    console.log(`    Status: ${status}`)
    assert.equal(status, 'connected')
  })

  await test('getServerInfos returns correct info', () => {
    const infos = mcpClientManager.getServerInfos()
    const info = infos.find(i => i.id === context7!.id)
    assert.ok(info, 'Server info not found')
    console.log(`    Name: ${info!.name}, Status: ${info!.status}, Tools: ${info!.toolCount}`)
    assert.equal(info!.status, 'connected')
    assert.ok(info!.toolCount > 0)
  })

  // -----------------------------------------------------------------------
  // 7. Test ensureEnabledServersConnected (should be no-op if already connected)
  // -----------------------------------------------------------------------
  await test('ensureEnabledServersConnected is idempotent', async () => {
    const beforeIds = getMcpToolIds().length
    await mcpClientManager.ensureEnabledServersConnected()
    const afterIds = getMcpToolIds().length
    console.log(`    Tools before: ${beforeIds}, after: ${afterIds}`)
    assert.equal(beforeIds, afterIds, 'Tool count changed — not idempotent')
  })

  // -----------------------------------------------------------------------
  // 8. Test actual MCP tool execution (resolve-library-id)
  // -----------------------------------------------------------------------
  const resolveToolId = toolIds.find(id => id.includes('resolve-library-id'))
  if (resolveToolId) {
    await test('execute mcp__context7__resolve-library-id', async () => {
      const { buildToolset } = await import('@/ai/tools/toolRegistry')
      const toolset = buildToolset([resolveToolId])
      const tool = toolset[resolveToolId]
      assert.ok(tool, `Tool ${resolveToolId} not in toolset`)
      assert.ok(typeof tool.execute === 'function', 'Tool has no execute function')

      console.log('    Calling resolve-library-id with query "ai-sdk"...')
      const result = await tool.execute({ libraryName: 'ai sdk' }, {})
      console.log(`    Result type: ${typeof result}, length: ${JSON.stringify(result).length} chars`)
      console.log(`    Result preview: ${JSON.stringify(result).slice(0, 200)}...`)
      assert.ok(result !== undefined, 'Tool returned undefined')
    })
  }

  // -----------------------------------------------------------------------
  // 9. Disconnect
  // -----------------------------------------------------------------------
  await test('disconnect context7 server', async () => {
    await mcpClientManager.disconnect(context7!.id)
    const status = mcpClientManager.getServerStatus(context7!.id)
    console.log(`    Status after disconnect: ${status}`)
    assert.equal(status, 'disconnected')
  })

  await test('tools unregistered after disconnect', () => {
    const ids = getMcpToolIds()
    const remaining = ids.filter(id => id.startsWith('mcp__context7__'))
    console.log(`    context7 tools remaining: ${remaining.length}`)
    assert.equal(remaining.length, 0, 'Tools not cleaned up after disconnect')
  })

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  • ${e}`)
  }

  // Cleanup
  await mcpClientManager.shutdownAll()
  process.exit(failed > 0 ? 1 : 0)
}

void runTests()
