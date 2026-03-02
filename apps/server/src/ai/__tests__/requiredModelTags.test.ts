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
 * requiredModelTags feature tests.
 *
 * 验证 Agent requiredModelTags 机制：类型定义、序列化/反序列化、
 * agent.json 描述符读取、模板回退。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/requiredModelTags.test.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setOpenLoafRootOverride } from '@openloaf/config'
import { visionTemplate } from '@/ai/agent-templates/templates/vision/index'
import { getTemplate } from '@/ai/agent-templates'
import {
  serializeAgentToMarkdown,
  readAgentConfigFromPath,
} from '@/ai/services/agentConfigService'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'

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
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let tempDir: string

async function main() {
  // ---- Setup ----
  tempDir = path.join(os.tmpdir(), `requiredModelTags_test_${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  setOpenLoafRootOverride(tempDir)

  try {
    // =================================================================
    // A layer: pure functions — template definitions & serialization
    // =================================================================
    console.log('\n--- A layer: pure functions ---')

    // A1: visionTemplate 声明了 requiredModelTags
    await test('A1: visionTemplate has requiredModelTags', () => {
      assert.ok(
        visionTemplate.requiredModelTags,
        'visionTemplate.requiredModelTags should be defined',
      )
      assert.deepEqual(
        [...visionTemplate.requiredModelTags!],
        ['image_analysis'],
      )
    })

    // A2: getTemplate('vision') 返回相同的 requiredModelTags
    await test('A2: getTemplate("vision") returns requiredModelTags', () => {
      const tmpl = getTemplate('vision')
      assert.ok(tmpl, 'vision template should exist in registry')
      assert.deepEqual(
        [...(tmpl!.requiredModelTags ?? [])],
        ['image_analysis'],
      )
    })

    // A3: 非视觉模板不带 requiredModelTags
    await test('A3: non-vision templates have no requiredModelTags', () => {
      const masterTmpl = getTemplate('master')
      assert.ok(masterTmpl, 'master template should exist')
      assert.equal(masterTmpl!.requiredModelTags, undefined)

      const shellTmpl = getTemplate('shell')
      assert.ok(shellTmpl, 'shell template should exist')
      assert.equal(shellTmpl!.requiredModelTags, undefined)
    })

    // A4: serializeAgentToMarkdown 包含 requiredModelTags
    await test('A4: serializeAgentToMarkdown includes requiredModelTags', () => {
      const markdown = serializeAgentToMarkdown({
        name: 'test-agent',
        description: 'A test agent',
        requiredModelTags: ['image_analysis', 'video_analysis'],
      })
      assert.ok(
        markdown.includes('requiredModelTags:'),
        'should contain requiredModelTags key',
      )
      assert.ok(
        markdown.includes('  - image_analysis'),
        'should contain image_analysis tag',
      )
      assert.ok(
        markdown.includes('  - video_analysis'),
        'should contain video_analysis tag',
      )
    })

    // A5: serializeAgentToMarkdown 不含空 requiredModelTags
    await test('A5: serializeAgentToMarkdown omits empty requiredModelTags', () => {
      const markdown = serializeAgentToMarkdown({
        name: 'test-agent',
        requiredModelTags: [],
      })
      assert.ok(
        !markdown.includes('requiredModelTags'),
        'should not contain requiredModelTags when empty',
      )
    })

    // A6: serializeAgentToMarkdown 不含 undefined requiredModelTags
    await test('A6: serializeAgentToMarkdown omits undefined requiredModelTags', () => {
      const markdown = serializeAgentToMarkdown({
        name: 'test-agent',
      })
      assert.ok(
        !markdown.includes('requiredModelTags'),
        'should not contain requiredModelTags when undefined',
      )
    })

    // =================================================================
    // B layer: file I/O — AGENT.md parsing & agent.json reading
    // =================================================================
    console.log('\n--- B layer: file operations ---')

    // B1: readAgentConfigFromPath 解析 requiredModelTags
    await test('B1: readAgentConfigFromPath parses requiredModelTags', async () => {
      const agentDir = path.join(tempDir, 'b1-agent')
      mkdirSync(agentDir, { recursive: true })
      const agentMdPath = path.join(agentDir, 'AGENT.md')
      const content = [
        '---',
        'name: vision-test',
        'description: test vision agent',
        'requiredModelTags:',
        '  - image_analysis',
        '  - video_analysis',
        '---',
        '',
        'You are a vision agent.',
      ].join('\n')
      writeFileSync(agentMdPath, content, 'utf8')

      const config = readAgentConfigFromPath(agentMdPath, 'workspace')
      assert.ok(config, 'config should not be null')
      assert.deepEqual(config!.requiredModelTags, [
        'image_analysis',
        'video_analysis',
      ])
    })

    // B2: readAgentConfigFromPath 缺少 requiredModelTags 时返回空数组
    await test('B2: readAgentConfigFromPath returns empty when no requiredModelTags', async () => {
      const agentDir = path.join(tempDir, 'b2-agent')
      mkdirSync(agentDir, { recursive: true })
      const agentMdPath = path.join(agentDir, 'AGENT.md')
      const content = [
        '---',
        'name: plain-agent',
        'description: no tags',
        '---',
        '',
        'Just a regular agent.',
      ].join('\n')
      writeFileSync(agentMdPath, content, 'utf8')

      const config = readAgentConfigFromPath(agentMdPath, 'workspace')
      assert.ok(config, 'config should not be null')
      assert.deepEqual(config!.requiredModelTags, [])
    })

    // B3: serialize → parse round-trip preserves requiredModelTags
    await test('B3: serialize → parse round-trip', async () => {
      const agentDir = path.join(tempDir, 'b3-agent')
      mkdirSync(agentDir, { recursive: true })

      const original = {
        name: 'roundtrip-agent',
        description: 'round-trip test',
        icon: 'eye',
        requiredModelTags: ['image_analysis'],
        systemPrompt: 'Analyze images.',
      }
      const markdown = serializeAgentToMarkdown(original)
      const agentMdPath = path.join(agentDir, 'AGENT.md')
      writeFileSync(agentMdPath, markdown, 'utf8')

      const config = readAgentConfigFromPath(agentMdPath, 'project')
      assert.ok(config, 'config should not be null')
      assert.equal(config!.name, 'roundtrip-agent')
      assert.deepEqual(config!.requiredModelTags, ['image_analysis'])
      assert.ok(config!.systemPrompt.includes('Analyze images'))
    })

    // B4: readAgentJson 读取 agent.json 中的 requiredModelTags
    await test('B4: readAgentJson reads requiredModelTags from agent.json', async () => {
      const agentDir = path.join(tempDir, 'b4-agent')
      mkdirSync(agentDir, { recursive: true })
      const descriptor = {
        name: 'vision',
        description: '图片分析',
        icon: 'eye',
        requiredModelTags: ['image_analysis'],
      }
      writeFileSync(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(descriptor, null, 2),
        'utf8',
      )

      const result = readAgentJson(agentDir)
      assert.ok(result, 'descriptor should not be null')
      assert.deepEqual(result!.requiredModelTags, ['image_analysis'])
    })

    // B5: readAgentJson — agent.json 不含 requiredModelTags
    await test('B5: readAgentJson returns undefined when no requiredModelTags', async () => {
      const agentDir = path.join(tempDir, 'b5-agent')
      mkdirSync(agentDir, { recursive: true })
      const descriptor = {
        name: 'shell',
        description: 'shell agent',
        icon: 'terminal',
      }
      writeFileSync(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(descriptor, null, 2),
        'utf8',
      )

      const result = readAgentJson(agentDir)
      assert.ok(result, 'descriptor should not be null')
      assert.equal(result!.requiredModelTags, undefined)
    })

    // B6: .openloaf/agents/vision/agent.json 写入 + 读取
    await test('B6: openloaf agents dir agent.json with requiredModelTags', async () => {
      // 模拟 .openloaf/agents/vision/ 目录结构
      const visionDir = resolveAgentDir(tempDir, 'vision')
      mkdirSync(visionDir, { recursive: true })
      const descriptor = {
        name: '视觉分析',
        description: '图片/视频理解',
        icon: 'eye',
        requiredModelTags: ['image_analysis'],
        toolIds: [],
      }
      writeFileSync(
        path.join(visionDir, 'agent.json'),
        JSON.stringify(descriptor, null, 2),
        'utf8',
      )

      const result = readAgentJson(visionDir)
      assert.ok(result, 'should read from .openloaf/agents/vision/')
      assert.deepEqual(result!.requiredModelTags, ['image_analysis'])
      assert.equal(result!.name, '视觉分析')
    })

    // B7: requiredModelTags 单值（非数组格式）在 AGENT.md 中
    await test('B7: single requiredModelTag value in AGENT.md', async () => {
      const agentDir = path.join(tempDir, 'b7-agent')
      mkdirSync(agentDir, { recursive: true })
      const agentMdPath = path.join(agentDir, 'AGENT.md')
      const content = [
        '---',
        'name: single-tag-agent',
        'requiredModelTags:',
        '  - image_analysis',
        '---',
        '',
        'Single tag test.',
      ].join('\n')
      writeFileSync(agentMdPath, content, 'utf8')

      const config = readAgentConfigFromPath(agentMdPath, 'workspace')
      assert.ok(config)
      assert.deepEqual(config!.requiredModelTags, ['image_analysis'])
    })
  } finally {
    // ---- Teardown ----
    setOpenLoafRootOverride(null)
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  // ---- Summary ----
  console.log(`\n${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed tests:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
