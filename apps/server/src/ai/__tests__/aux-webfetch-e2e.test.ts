/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * 根因修复 E2E：auxiliaryInfer 走纯文本生成 + 自己抽 JSON + zod 校验后，
 * webfetch.extract 不再因 response_format 不兼容触发 silent fallback。
 *
 * 跨 provider 兼容性：
 *  - 本测试默认走 isFast variant（本地 SaaS 通常是 Qwen Flash）→ 证明根因修复对生产路径有效
 *  - jsonExtract 单元测试覆盖各种"凌乱 JSON 输出形态"的鲁棒性 → 证明对 Kimi/DeepSeek 这类
 *    会自由输出文本的 provider 也能稳定解析
 *  - 跨 provider HTTP 行为矩阵见 dashscope-json-format-repro.ts（直打 SaaS endpoint）
 *
 * 用法：
 *   pnpm --filter server test:ai:aux-webfetch
 */
import assert from 'node:assert/strict'
import { auxiliaryInfer } from '@/ai/services/auxiliaryInferenceService'
import { CAPABILITY_SCHEMAS } from '@/ai/services/auxiliaryCapabilities'

const FALLBACK_SENTINEL = '__FALLBACK_SENTINEL__'

const PAGE = `# Example Domain\n\nThis domain is for use in illustrative examples in documents.\nYou may use this domain in literature without prior coordination or asking for permission.\n\n## More information\n\nIANA assigns and maintains the example domain.`

async function main() {
  console.log('=== auxiliaryInfer webfetch.extract E2E ===\n')
  const r = await auxiliaryInfer({
    capabilityKey: 'webfetch.extract',
    context: `## Web Page Content\n${PAGE}\n\n## Request\nWhat is this page about?\n\n## Source URL\nhttps://example.com`,
    schema: CAPABILITY_SCHEMAS['webfetch.extract'],
    fallback: { summary: FALLBACK_SENTINEL },
    noCache: true,
    maxTokens: 256,
  })

  console.log('summary:')
  console.log(`  ${r.summary.slice(0, 400).replace(/\n/g, '\n  ')}\n`)

  assert.ok(
    r.summary !== FALLBACK_SENTINEL,
    'auxiliary 调用失败命中 fallback — 见 server log [AuxiliaryInfer] 推理失败',
  )
  assert.ok(r.summary.length > 0, 'summary 不应为空')
  assert.ok(r.summary.length < 2000, `summary 过长（${r.summary.length}）— 大概率没遵循 schema`)
  console.log('✅ 未命中 fallback，结构化 summary 正常')
}

main().catch((e) => {
  console.error('❌ FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
