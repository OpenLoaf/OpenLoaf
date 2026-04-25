/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * Probe the Notion Remote MCP directly with the OAuth access_token we
 * persisted for the `notion` integration, so we can see exactly which tools
 * are exposed + what payloads they return. Run with:
 *
 *   cd apps/server
 *   pnpm tsx scripts/test-notion-identity.ts
 *
 * Reads `~/.openloaf/integration-oauth.json` — does not touch the running
 * server.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createMCPClient } from '@ai-sdk/mcp'

const MCP_URL = 'https://mcp.notion.com/mcp'

type OAuthFile = {
  integrations?: Record<
    string,
    {
      tokens?: { access_token?: string; token_type?: string }
    }
  >
}

async function main(): Promise<void> {
  const storePath = join(homedir(), '.openloaf', 'integration-oauth.json')
  const raw = readFileSync(storePath, 'utf-8')
  const file = JSON.parse(raw) as OAuthFile
  const token = file.integrations?.notion?.tokens?.access_token
  if (!token) throw new Error('No Notion access_token in integration-oauth.json')

  console.log('[1/3] Connecting MCP at', MCP_URL)
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: MCP_URL,
      headers: { Authorization: `Bearer ${token}` },
    },
  })
  const tools = await client.tools()
  const toolNames = Object.keys(tools)
  console.log('  tool count:', toolNames.length)
  console.log('  tools:')
  for (const n of toolNames) console.log('    -', n)

  console.log('\n[2/3] Try notion-get-self (may not exist)')
  const candidate = tools['notion-get-self'] ?? tools['notion_get_self']
  if (candidate?.execute) {
    try {
      const res = await candidate.execute(
        {},
        { toolCallId: 'test', messages: [], abortSignal: AbortSignal.timeout(15_000) },
      )
      console.log('  result:', JSON.stringify(res, null, 2))
    } catch (err) {
      console.log('  execute failed:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  (tool not exposed by this Notion workspace)')
  }

  console.log('\n[3/4] Call notion-get-users — find the bot user (type=bot)')
  const getUsers = tools['notion-get-users']
  if (getUsers?.execute) {
    try {
      const res = await getUsers.execute(
        {},
        { toolCallId: 'test-users', messages: [], abortSignal: AbortSignal.timeout(15_000) },
      )
      console.log('  raw result:', JSON.stringify(res, null, 2).slice(0, 3000))
    } catch (err) {
      console.log('  execute failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[4/4] Call notion-get-teams — does it return workspace info?')
  const getTeams = tools['notion-get-teams']
  if (getTeams?.execute) {
    try {
      const res = await getTeams.execute(
        {},
        { toolCallId: 'test-teams', messages: [], abortSignal: AbortSignal.timeout(15_000) },
      )
      console.log('  raw result:', JSON.stringify(res, null, 2).slice(0, 3000))
    } catch (err) {
      console.log('  execute failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[5] notion-get-users({ user_id: "self" }) — fetch current bot identity')
  if (getUsers?.execute) {
    try {
      const res = await getUsers.execute(
        { user_id: 'self' },
        { toolCallId: 'test-self', messages: [], abortSignal: AbortSignal.timeout(15_000) },
      )
      console.log('  raw result:', JSON.stringify(res, null, 2))
    } catch (err) {
      console.log('  execute failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[6] Dump every tool — description + inputSchema')
  for (const name of toolNames) {
    const t: any = tools[name]
    const desc = typeof t?.description === 'string' ? t.description : ''
    const schema = t?.inputSchema ?? t?.parameters
    console.log(`\n  --- ${name} ---`)
    console.log('  desc:', desc.slice(0, 280))
    if (schema) {
      console.log('  schema:', JSON.stringify(schema, null, 2).slice(0, 1200))
    }
  }

  console.log('\n[7] notion-search schema — look for filter options')
  const searchTool: any = tools['notion-search']
  if (searchTool?.inputSchema) {
    console.log(JSON.stringify(searchTool.inputSchema, null, 2).slice(0, 3000))
  }

  console.log('\n[8] notion-search({ query: "a" }) — broad query')
  if (searchTool?.execute) {
    try {
      const res = await searchTool.execute(
        { query: 'a' },
        { toolCallId: 'search-a', messages: [], abortSignal: AbortSignal.timeout(20_000) },
      )
      console.log('  (first 2500 chars)', JSON.stringify(res, null, 2).slice(0, 2500))
    } catch (err) {
      console.log('  failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[9] notion-fetch schema')
  const fetchTool: any = tools['notion-fetch']
  if (fetchTool?.inputSchema) {
    console.log(JSON.stringify(fetchTool.inputSchema, null, 2).slice(0, 2500))
  }

  console.log('\n[9.5] notion-search with prod args (query:"a", query_type:"internal", page_size:20)')
  if (searchTool?.execute) {
    try {
      const res = await searchTool.execute(
        { query: 'a', query_type: 'internal', page_size: 20 },
        { toolCallId: 'prod-search', messages: [], abortSignal: AbortSignal.timeout(20_000) },
      )
      const rec = res as { content?: Array<{ type: string; text: string }> }
      const text = rec?.content?.find((c) => c.type === 'text')?.text
      if (text) {
        const parsed = JSON.parse(text) as { results?: unknown[]; has_more?: boolean; next_cursor?: string }
        console.log('  top-level keys:', Object.keys(parsed))
        console.log('  has_more:', parsed.has_more, 'next_cursor:', parsed.next_cursor)
        console.log('  results count:', parsed.results?.length)
        if (Array.isArray(parsed.results) && parsed.results.length > 0) {
          console.log('\n  --- full first 3 items ---')
          for (let i = 0; i < Math.min(3, parsed.results.length); i++) {
            console.log(`\n  [${i}] keys:`, Object.keys(parsed.results[i] as object))
            console.log(`  [${i}] value:`, JSON.stringify(parsed.results[i], null, 2))
          }
          console.log('\n  --- type/parent/object stats across ALL items ---')
          for (const item of parsed.results) {
            const it = item as Record<string, unknown>
            console.log(
              `  type=${it.type} object=${it.object} title=${String(it.title).slice(0, 30)}`,
              it.parent ? `parent=${JSON.stringify(it.parent)}` : '',
            )
          }
        }
      } else {
        console.log('  raw:', JSON.stringify(res, null, 2).slice(0, 2000))
      }
    } catch (err) {
      console.log('  failed:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\n[10] notion-fetch({ id: "workspace" }) — try pseudo workspace pointer')
  if (fetchTool?.execute) {
    for (const probe of ['workspace', 'root', '']) {
      console.log(`  trying id=${JSON.stringify(probe)}`)
      try {
        const res = await fetchTool.execute(
          { id: probe },
          { toolCallId: `fetch-${probe}`, messages: [], abortSignal: AbortSignal.timeout(15_000) },
        )
        console.log('    →', JSON.stringify(res, null, 2).slice(0, 1200))
      } catch (err) {
        console.log('    failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  await client.close?.()
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
