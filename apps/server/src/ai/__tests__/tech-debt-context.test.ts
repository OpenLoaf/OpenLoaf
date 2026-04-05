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
 * 技术债验证测试 — AI 上下文管理与 Prompt 系统。
 *
 * 以静态源码分析为主：直接读取源文件内容，用字符串匹配验证已知技术债位置。
 * 目的是形成「债务感知器」——当债务被修复时测试失败，提醒更新或删除相关条目。
 *
 * 每个测试同时输出：
 *   [DEBT] 问题描述          — 该问题仍存在（预期）
 *   [FIXED] 问题描述         — 该问题已被修复（测试将 fail，表示债务已还清）
 *
 * 用法（无需 vitest，与其他 server 测试保持一致）：
 *   node --enable-source-maps --import tsx/esm \
 *        --import ./scripts/registerMdTextLoader.mjs \
 *        src/ai/__tests__/tech-debt-context.test.ts
 *
 * 或通过 package.json 脚本（添加后）：
 *   pnpm --filter server run test:tech-debt
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// 路径辅助
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** 从 apps/server/src 相对路径解析为绝对路径，并读取文件内容。
 *  __dirname = apps/server/src/ai/__tests__
 *  '../..' 向上两层 → apps/server/src
 */
function readSrc(relPath: string): string {
  const abs = resolve(__dirname, '../..', relPath)
  return readFileSync(abs, 'utf-8')
}

// ---------------------------------------------------------------------------
// 测试框架（与项目其他测试文件保持一致）
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const debtItems: string[] = []
const fixedItems: string[] = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    console.log(`  ✗ ${name}: ${err?.message ?? err}`)
  }
}

/** 断言技术债仍然存在（找到关键字符串 = 债务仍在 = 测试通过）。 */
function assertDebtExists(source: string, pattern: string | RegExp, debtDescription: string): void {
  const found = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source)
  if (found) {
    debtItems.push(debtDescription)
    // 债务仍在，断言通过
    assert.ok(true)
  } else {
    fixedItems.push(debtDescription)
    // 债务已消失，测试失败以提醒更新债务列表
    assert.fail(
      `[FIXED] 该技术债已被修复，请更新债务清单并删除/修改此测试：\n  ${debtDescription}`,
    )
  }
}

/** 断言某个特性/修复已经存在（找到 = 通过，未找到 = 提醒补充）。 */
function assertFeatureAbsent(source: string, pattern: string | RegExp, featureDescription: string): void {
  const found = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source)
  if (!found) {
    debtItems.push(featureDescription)
    assert.ok(true)
  } else {
    fixedItems.push(featureDescription)
    assert.fail(
      `[FIXED] 该特性已实现，请更新债务清单并删除/修改此测试：\n  ${featureDescription}`,
    )
  }
}

// ---------------------------------------------------------------------------
// 测试主体
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== 技术债验证：AI 上下文管理与 Prompt 系统 ===\n')

  // ── 债务 1：图片 token 估算 ── [FIXED] ──────────────────────────────────────
  console.log('  --- [债务 1] 图片 token 估算 --- [FIXED]')

  const ctxWindowSrc = readSrc('ai/shared/contextWindowManager.ts')

  await test('[债务 1-A] [FIXED] estimateImageTokens 函数已存在', () => {
    assert.ok(
      ctxWindowSrc.includes('function estimateImageTokens('),
      '[FIXED] estimateImageTokens 分辨率/模型感知函数已实现',
    )
    fixedItems.push('图片 token 估算已改为按模型/分辨率差异化（estimateImageTokens）')
  })

  await test('[债务 1-B] [FIXED] 不再有硬编码 total += 1000', () => {
    const occurrences = (ctxWindowSrc.match(/total \+= 1000/g) ?? []).length
    assert.equal(occurrences, 0, '[FIXED] 不再有 total += 1000 硬编码')
    fixedItems.push('图片 token 硬编码 1000 已全部替换为 estimateImageTokens 调用')
  })

  await test('[债务 1-C] [FIXED] estimateMessagesTokens 接受 modelId 参数', () => {
    assert.ok(
      /function estimateMessagesTokens\(messages: any\[\],\s*modelId\?/.test(ctxWindowSrc),
      '[FIXED] estimateMessagesTokens 已支持 modelId 参数',
    )
    fixedItems.push('estimateMessagesTokens 已支持 modelId 参数')
  })

  // ── 债务 2：MODEL_CONTEXT_SIZES 缺失主流模型 ────────────────────────────────
  console.log('\n  --- [债务 2] MODEL_CONTEXT_SIZES 缺失主流模型 ---')

  await test('[债务 2-A] [FIXED] 包含 gemini-* 系列', () => {
    assert.ok(/['"]gemini-/.test(ctxWindowSrc), '[FIXED] MODEL_CONTEXT_SIZES 已包含 gemini 系列')
    fixedItems.push('MODEL_CONTEXT_SIZES 已包含 gemini 系列模型')
  })

  await test('[债务 2-B] [FIXED] 包含 claude-sonnet-4', () => {
    assert.ok(/['"]claude-sonnet-4['"]/.test(ctxWindowSrc), '[FIXED] 已包含 claude-sonnet-4')
    fixedItems.push('MODEL_CONTEXT_SIZES 已包含 claude-sonnet-4')
  })

  await test('[债务 2-C] [FIXED] 包含 o1/o3/o4-mini 系列', () => {
    assert.ok(/['"](o1|o3|o4-mini)['"]/.test(ctxWindowSrc), '[FIXED] 已包含推理模型系列')
    fixedItems.push('MODEL_CONTEXT_SIZES 已包含 o1/o3/o4-mini 系列')
  })

  await test('[债务 2-D] [FIXED] 条目数量超过 15 个', () => {
    const match = ctxWindowSrc.match(/const MODEL_CONTEXT_SIZES[^}]+}/s)
    assert.ok(match, '找不到 MODEL_CONTEXT_SIZES 定义块')
    const entries = match![0].match(/'[^']+'\s*:\s*[\d_]+/g) ?? []
    assert.ok(entries.length > 15, `[FIXED] 已扩展到 ${entries.length} 个条目`)
    fixedItems.push(`MODEL_CONTEXT_SIZES 已扩展到 ${entries.length} 个条目`)
  })

  // ── 债务 3：contextCollapse 中 trimToContextWindow 重复调用 ─────────────────
  console.log('\n  --- [债务 3] trimToContextWindow 重复调用 ---')

  const collapseSrc = readSrc('ai/shared/contextCollapse.ts')

  await test('[债务 3-A] [FIXED] blocking-threshold 分支不再重复调用 trimToContextWindow', () => {
    const blockingBranch = collapseSrc.slice(
      collapseSrc.indexOf('Above blocking threshold with no model'),
      collapseSrc.indexOf('No model available — fallback'),
    )
    const trimCallCount = (blockingBranch.match(/trimToContextWindow\(/g) ?? []).length
    assert.ok(
      trimCallCount <= 1,
      `[FIXED] blocking-threshold 分支 trimToContextWindow 调用 ${trimCallCount} 次（应 <=1）`,
    )
    fixedItems.push('contextCollapse blocking-threshold 分支已消除 trimToContextWindow 重复调用')
  })

  await test('[债务 3-B] [FIXED] no-model 分支不再重复调用 trimToContextWindow', () => {
    const noModelSection = collapseSrc.slice(
      collapseSrc.indexOf('No model available — fallback'),
      collapseSrc.indexOf('Attempt LLM-based collapse'),
    )
    const trimCallCount = (noModelSection.match(/trimToContextWindow\(/g) ?? []).length
    assert.ok(
      trimCallCount <= 1,
      `[FIXED] no-model 分支 trimToContextWindow 调用 ${trimCallCount} 次（应 <=1）`,
    )
    fixedItems.push('contextCollapse no-model 分支已消除 trimToContextWindow 重复调用')
  })

  // ── 债务 4：hardRules.ts 中文硬编码 ── [设计决策：zh-only] ─────────────────
  // 决策：hardRules 作为系统级 AI 指令，保持中文单语实现。
  // 所有调用方实际都使用默认中文，英文分支是死代码（TODO 未完成翻译）。
  // 若未来需要多语言，考虑把内容提到 i18n 层并由调用方传入 locale。
  console.log('\n  --- [债务 4] hardRules.ts 保持中文单语 --- [设计决策]')

  const hardRulesSrc = readSrc('ai/shared/hardRules.ts')

  await test('[债务 4-A] hardRules.ts 已移除 locale 参数（zh-only 设计）', () => {
    const hasLocaleType = /HardRulesLocale/.test(hardRulesSrc)
    assert.ok(!hasLocaleType, 'HardRulesLocale 类型应已删除')
    fixedItems.push('hardRules.ts 已回归中文单语实现，移除未使用的 locale 参数和 en 死代码')
  })

  // ── 债务 5：UNKNOWN_VALUE ── [FIXED] ──────────────────────────────────────
  console.log('\n  --- [债务 5] UNKNOWN_VALUE 常量 --- [FIXED]')

  const prefaceSrc = readSrc('ai/shared/prefaceBuilder.ts')
  const subAgentSrc = readSrc('ai/shared/subAgentPrefaceBuilder.ts')
  const promptBuilderSrc = readSrc('ai/shared/promptBuilder.ts')

  await test('[债务 5-A] [FIXED] 三处均从 shared/constants 导入', () => {
    const files = [
      { name: 'prefaceBuilder', src: prefaceSrc },
      { name: 'subAgentPrefaceBuilder', src: subAgentSrc },
      { name: 'promptBuilder', src: promptBuilderSrc },
    ]
    const importedFrom = files.filter((f) => /import.*UNKNOWN_VALUE/.test(f.src))
    assert.equal(importedFrom.length, 3, '[FIXED] 三个文件均从共享模块导入 UNKNOWN_VALUE')
    fixedItems.push('UNKNOWN_VALUE 已统一从 shared/constants.ts 导入（3 个文件）')
  })

  await test('[债务 5-B] [FIXED] 无本地重复定义', () => {
    const files = [prefaceSrc, subAgentSrc, promptBuilderSrc]
    const localDefs = files.filter((src) => /const UNKNOWN_VALUE\s*=\s*['"]unknown['"]/.test(src))
    assert.equal(localDefs.length, 0, '[FIXED] 不再有本地 UNKNOWN_VALUE 定义')
    fixedItems.push('UNKNOWN_VALUE 本地重复定义已全部移除')
  })

  // ── 债务 6：needsPythonRuntime 误命名 ── [已修复] ──────────────────────────────
  console.log('\n  --- [债务 6] toolCapabilityDetector needsPythonRuntime 误命名 --- [已修复：重命名为 needsShellRuntime]')

  const detectorSrc = readSrc('ai/shared/toolCapabilityDetector.ts')

  await test('[债务 6-A] [已修复] needsShellRuntime 由 Bash 工具触发（命名准确）', () => {
    // 已重命名为 needsShellRuntime，与 SHELL_TOOL_IDS 语义一致
    const hasShellRuntime = /needsShellRuntime\s*:/.test(detectorSrc)
    assert.equal(hasShellRuntime, true, 'needsShellRuntime 字段应存在于 toolCapabilityDetector.ts')
  })

  await test('[债务 6-B] [已修复] needsPythonRuntime 字段已不存在', () => {
    const hasOldName = /needsPythonRuntime\s*:/.test(detectorSrc)
    assert.equal(hasOldName, false, 'needsPythonRuntime 字段应已被移除')
  })

  // ── 债务 7：modelRegistry TTL 缓存 ── [FIXED] ─────────────────────────────
  console.log('\n  --- [债务 7] modelRegistry TTL 缓存 --- [FIXED]')

  const registrySrc = readSrc('ai/models/modelRegistry.ts')

  await test('[债务 7-A] [FIXED] 缓存包含 TTL 机制', () => {
    assert.ok(
      /cachedAt|CACHE_TTL/i.test(registrySrc),
      '[FIXED] modelRegistry 已实现 TTL 缓存',
    )
    fixedItems.push('modelRegistry 已实现 cachedAt + CACHE_TTL_MS 过期机制')
  })

  await test('[债务 7-B] [FIXED] 缓存可主动失效', () => {
    assert.ok(
      /cachedRegistry\s*=\s*null/.test(registrySrc),
      '[FIXED] 存在缓存置 null 逻辑',
    )
    fixedItems.push('modelRegistry 缓存过期后自动置 null 重新 fetch')
  })

  await test('[债务 7-C] fetchRegistry 无重试逻辑', () => {
    assertFeatureAbsent(
      registrySrc,
      /retry|retries|backoff/i,
      'fetchRegistry 失败时直接返回空注册表，无重试/退避逻辑（网络抖动导致持续无模型）',
    )
  })

  await test('[债务 7-D] [FIXED] 有公开的 invalidateCache API', () => {
    assert.ok(
      /export.*invalidateCache|export.*function invalidateCache/.test(registrySrc),
      '[FIXED] 已导出 invalidateCache 供外部主动刷新',
    )
    fixedItems.push('modelRegistry 已导出 invalidateCache() 供外部主动刷新')
  })

  // ── 汇总报告 ────────────────────────────────────────────────────────────────
  console.log('\n=== 债务汇总报告 ===\n')

  if (debtItems.length > 0) {
    console.log(`  ⚠  仍存在的技术债（${debtItems.length} 项）：`)
    for (const item of debtItems) {
      console.log(`     - ${item}`)
    }
  }

  if (fixedItems.length > 0) {
    console.log(`\n  ✅ 已修复的债务（${fixedItems.length} 项，对应测试已 FAIL，请更新债务清单）：`)
    for (const item of fixedItems) {
      console.log(`     - ${item}`)
    }
  }

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('致命错误:', err)
  process.exit(1)
})
