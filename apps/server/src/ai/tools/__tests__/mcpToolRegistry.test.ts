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
 * MCP Tool Registry + ToolSearch + ActivatedToolSet unit tests.
 *
 * Tests dynamic MCP tool registration, catalog integration, and
 * ToolSearch discovery of MCP tools.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/mcpToolRegistry.test.ts
 */
import assert from 'node:assert/strict'
import {
  registerMcpTool,
  unregisterMcpTool,
  unregisterMcpToolsByServer,
  getMcpToolIds,
  isMcpTool,
  buildToolset,
} from '../toolRegistry'
import { ActivatedToolSet } from '../toolSearchState'
import {
  registerMcpCatalogEntry,
  unregisterMcpCatalogEntry,
  unregisterMcpCatalogEntriesByServer,
  getMcpCatalogEntries,
  extractKeywordsFromDescription,
} from '@openloaf/api/types/tools/toolCatalog'

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
// Mock MCP tool (minimal AI SDK CoreTool shape)
// ---------------------------------------------------------------------------
function createMockTool(description = 'A mock MCP tool') {
  return {
    description,
    inputSchema: {
      type: 'object' as const,
      properties: {},
      validate: () => ({ success: true as const, value: {} }),
    },
    execute: async () => ({ ok: true, data: 'mock result' }),
  }
}

// ---------------------------------------------------------------------------
// Cleanup helper — unregister all MCP tools between tests
// ---------------------------------------------------------------------------
function cleanupMcpTools() {
  for (const id of getMcpToolIds()) {
    unregisterMcpTool(id)
  }
  for (const entry of getMcpCatalogEntries()) {
    unregisterMcpCatalogEntry(entry.id)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n=== MCP Tool Registry Tests ===\n')

  // -----------------------------------------------------------------------
  // 1. isMcpTool
  // -----------------------------------------------------------------------
  await test('isMcpTool returns true for mcp__ prefixed IDs', () => {
    assert.equal(isMcpTool('mcp__github__create-issue'), true)
    assert.equal(isMcpTool('mcp__slack__send-message'), true)
  })

  await test('isMcpTool returns false for native tool IDs', () => {
    assert.equal(isMcpTool('read-file'), false)
    assert.equal(isMcpTool('shell-command'), false)
    assert.equal(isMcpTool('ToolSearch'), false)
  })

  // -----------------------------------------------------------------------
  // 2. registerMcpTool / unregisterMcpTool
  // -----------------------------------------------------------------------
  await test('registerMcpTool adds tool to registry', () => {
    cleanupMcpTools()
    const tool = createMockTool()
    registerMcpTool('mcp__test__hello', tool)
    const ids = getMcpToolIds()
    assert.ok(ids.includes('mcp__test__hello'))
  })

  await test('unregisterMcpTool removes tool from registry', () => {
    registerMcpTool('mcp__test__remove-me', createMockTool())
    assert.ok(getMcpToolIds().includes('mcp__test__remove-me'))
    unregisterMcpTool('mcp__test__remove-me')
    assert.ok(!getMcpToolIds().includes('mcp__test__remove-me'))
  })

  await test('unregisterMcpToolsByServer removes all tools for a server', () => {
    cleanupMcpTools()
    registerMcpTool('mcp__github__tool-a', createMockTool())
    registerMcpTool('mcp__github__tool-b', createMockTool())
    registerMcpTool('mcp__slack__tool-c', createMockTool())

    assert.equal(getMcpToolIds().length, 3)
    unregisterMcpToolsByServer('github')
    const remaining = getMcpToolIds()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0], 'mcp__slack__tool-c')
    cleanupMcpTools()
  })

  // -----------------------------------------------------------------------
  // 3. buildToolset includes MCP tools
  // -----------------------------------------------------------------------
  await test('buildToolset includes registered MCP tools', () => {
    cleanupMcpTools()
    registerMcpTool('mcp__fs__read', createMockTool())
    const toolset = buildToolset(['mcp__fs__read'])
    assert.ok('mcp__fs__read' in toolset)
    cleanupMcpTools()
  })

  await test('buildToolset skips unregistered MCP tool IDs', () => {
    cleanupMcpTools()
    const toolset = buildToolset(['mcp__nonexistent__tool'])
    assert.ok(!('mcp__nonexistent__tool' in toolset))
  })

  await test('buildToolset applies needsApproval:true to MCP tools', () => {
    cleanupMcpTools()
    const tool = createMockTool()
    assert.equal((tool as any).needsApproval, undefined)
    registerMcpTool('mcp__test__approval', tool)
    const toolset = buildToolset(['mcp__test__approval'])
    const wrapped = toolset['mcp__test__approval']
    // needsApproval should be set (either function or true)
    assert.ok(wrapped.needsApproval !== undefined)
    cleanupMcpTools()
  })

  // -----------------------------------------------------------------------
  // 4. MCP Catalog
  // -----------------------------------------------------------------------
  console.log('\n=== MCP Catalog Tests ===\n')

  await test('registerMcpCatalogEntry adds entry', () => {
    cleanupMcpTools()
    registerMcpCatalogEntry({
      id: 'mcp__github__create-issue',
      label: '[github] create-issue',
      description: 'Create a new GitHub issue',
      keywords: ['github', 'issue', 'create'],
      group: 'mcp-github',
    })
    const entries = getMcpCatalogEntries()
    assert.equal(entries.length, 1)
    assert.equal(entries[0]!.id, 'mcp__github__create-issue')
  })

  await test('unregisterMcpCatalogEntry removes entry', () => {
    unregisterMcpCatalogEntry('mcp__github__create-issue')
    assert.equal(getMcpCatalogEntries().length, 0)
  })

  await test('unregisterMcpCatalogEntriesByServer removes all server entries', () => {
    registerMcpCatalogEntry({
      id: 'mcp__db__query',
      label: '[db] query',
      description: 'Query database',
      keywords: ['database', 'query'],
      group: 'mcp-db',
    })
    registerMcpCatalogEntry({
      id: 'mcp__db__insert',
      label: '[db] insert',
      description: 'Insert into database',
      keywords: ['database', 'insert'],
      group: 'mcp-db',
    })
    registerMcpCatalogEntry({
      id: 'mcp__other__tool',
      label: '[other] tool',
      description: 'Some other tool',
      keywords: ['other'],
      group: 'mcp-other',
    })
    assert.equal(getMcpCatalogEntries().length, 3)
    unregisterMcpCatalogEntriesByServer('db')
    const remaining = getMcpCatalogEntries()
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0]!.id, 'mcp__other__tool')
    cleanupMcpTools()
  })

  await test('extractKeywordsFromDescription extracts meaningful tokens', () => {
    const kw = extractKeywordsFromDescription(
      'Create a new GitHub issue with title and body content',
    )
    assert.ok(kw.includes('create'))
    assert.ok(kw.includes('github'))
    assert.ok(kw.includes('issue'))
    // Short words (< 3 chars) should be filtered
    assert.ok(!kw.includes('a'))
  })

  // -----------------------------------------------------------------------
  // 5. ActivatedToolSet — MCP-specific behavior
  // -----------------------------------------------------------------------
  console.log('\n=== ActivatedToolSet Tests ===\n')

  await test('activate and isActive work for MCP tool IDs', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    assert.equal(set.isActive('mcp__github__create-issue'), false)
    set.activate(['mcp__github__create-issue'])
    assert.equal(set.isActive('mcp__github__create-issue'), true)
  })

  await test('deactivate removes a specific tool', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    set.activate(['mcp__github__tool-a', 'mcp__github__tool-b'])
    assert.equal(set.isActive('mcp__github__tool-a'), true)
    set.deactivate('mcp__github__tool-a')
    assert.equal(set.isActive('mcp__github__tool-a'), false)
    assert.equal(set.isActive('mcp__github__tool-b'), true)
  })

  await test('deactivateByPrefix removes all tools with a prefix', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    set.activate([
      'mcp__github__tool-a',
      'mcp__github__tool-b',
      'mcp__slack__tool-c',
    ])
    set.deactivateByPrefix('mcp__github__')
    assert.equal(set.isActive('mcp__github__tool-a'), false)
    assert.equal(set.isActive('mcp__github__tool-b'), false)
    assert.equal(set.isActive('mcp__slack__tool-c'), true)
  })

  await test('core tools are always active and cannot be deactivated', () => {
    const set = new ActivatedToolSet(['ToolSearch', 'LoadSkill'])
    assert.equal(set.isActive('ToolSearch'), true)
    set.deactivate('ToolSearch') // should not affect core tools
    assert.equal(set.isActive('ToolSearch'), true)
  })

  await test('getActiveToolIds returns core + activated tools', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    set.activate(['mcp__test__tool1', 'read-file'])
    const active = set.getActiveToolIds()
    assert.ok(active.includes('ToolSearch'))
    assert.ok(active.includes('mcp__test__tool1'))
    assert.ok(active.includes('read-file'))
  })

  // -----------------------------------------------------------------------
  // 6. rehydrateFromMessages with availability filter
  // -----------------------------------------------------------------------
  await test('rehydrateFromMessages filters out unavailable MCP tools', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            toolName: 'ToolSearch',
            state: 'output-available',
            output: {
              tools: [
                { id: 'mcp__github__create-issue' },
                { id: 'mcp__disconnected__tool' },
                { id: 'read-file' },
              ],
            },
          },
        ],
      },
    ]

    // Only these tools are currently available
    const available = new Set(['mcp__github__create-issue', 'read-file', 'ToolSearch'])

    ActivatedToolSet.rehydrateFromMessages(set, messages, available)

    assert.equal(set.isActive('mcp__github__create-issue'), true)
    assert.equal(set.isActive('read-file'), true)
    // mcp__disconnected__tool should NOT be rehydrated
    assert.equal(set.isActive('mcp__disconnected__tool'), false)
  })

  await test('rehydrateFromMessages without filter activates all tools', () => {
    const set = new ActivatedToolSet(['ToolSearch'])
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            toolName: 'ToolSearch',
            state: 'output-available',
            output: {
              tools: [
                { id: 'mcp__any__tool' },
                { id: 'read-file' },
              ],
            },
          },
        ],
      },
    ]

    ActivatedToolSet.rehydrateFromMessages(set, messages)
    assert.equal(set.isActive('mcp__any__tool'), true)
    assert.equal(set.isActive('read-file'), true)
  })

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  • ${e}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

void runTests()
