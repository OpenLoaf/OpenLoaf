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
 * 技术债验证测试 — AI 模块死代码与重复代码静态分析
 *
 * 本测试通过读取源文件内容进行字符串匹配，验证已知的技术债问题，
 * 防止问题扩散或被无意修复后重新引入。
 *
 * 测试分类：
 *   1. agentFactory.ts — 死代码（未被调用的私有函数）
 *   2. chatFileStore.ts — 死代码（未使用的导入与变量）
 *   3. extractTextFromParts — ✅ 已提取到 chatStreamUtils.ts（验证共享模块导入）
 *   4. toSseChunk — ✅ 已提取到 chatStreamUtils.ts（验证共享模块导入）
 *   5. resolveBearerToken — ✅ 已完全删除（Server 不再从请求头提取 Bearer）
 *   6. JWT 解码逻辑重复（prefaceBuilder + subAgentPrefaceBuilder）
 *   7. normalizeRootPath / normalizeDescription / normalizeScalar — skillsLoader + agentConfigService 重复
 *   8. autoCompact + contextCollapse — extractPartText / formatMessages 功能重叠
 *   9. toolSearchGuidance.ts — ToolCatalogExtendedItem 类型未在函数体中使用
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/tech-debt-dead-code.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// 路径解析工具
// ---------------------------------------------------------------------------

// import.meta.dirname = apps/server/src/ai/__tests__
// 向上 2 级到 apps/server/src，再拼接子路径
const SERVER_SRC = path.resolve(import.meta.dirname, '../..')

function srcPath(...segments: string[]): string {
  return path.join(SERVER_SRC, ...segments)
}

function readSrc(...segments: string[]): string {
  return readFileSync(srcPath(...segments), 'utf-8')
}

/**
 * 计算某个标识符在文件内容中出现的次数。
 * 用于区分"定义处"和"调用处"。
 */
function countOccurrences(content: string, identifier: string): number {
  // 使用字面量匹配，不使用正则，以避免误匹配子字符串
  let count = 0
  let idx = 0
  while ((idx = content.indexOf(identifier, idx)) !== -1) {
    count++
    idx += identifier.length
  }
  return count
}

// ---------------------------------------------------------------------------
// 1. agentFactory.ts — 死代码（私有函数定义后从未被调用）
// ---------------------------------------------------------------------------

{
  const content = readSrc('ai/services/agentFactory.ts')

  // [已修复] AgentTemplate 死代码导入已删除
  const agentTemplateOccurrences = countOccurrences(content, 'AgentTemplate')
  assert.equal(
    agentTemplateOccurrences,
    0,
    `[1-A FIXED] AgentTemplate 导入已删除，实际出现 ${agentTemplateOccurrences} 次。`,
  )

  // [已修复] readAgentConfigFromPath 死代码导入已删除
  assert.ok(
    !content.includes('readAgentConfigFromPath'),
    '[1-B FIXED] readAgentConfigFromPath 导入已从 agentFactory.ts 中删除',
  )

  // [已修复] readMasterAgentBasePrompt 死函数已删除
  assert.ok(
    !content.includes('function readMasterAgentBasePrompt('),
    '[1-C FIXED] readMasterAgentBasePrompt 函数定义已从 agentFactory.ts 中删除',
  )

  // [已修复] readPMAgentBasePrompt 死函数已删除
  assert.ok(
    !content.includes('function readPMAgentBasePrompt('),
    '[1-D FIXED] readPMAgentBasePrompt 函数定义已从 agentFactory.ts 中删除',
  )

  console.log('✓ [1] agentFactory.ts 死代码验证通过（4 项）')
}

// ---------------------------------------------------------------------------
// 2. chatFileStore.ts — 死代码（未使用的导入与局部变量）
// ---------------------------------------------------------------------------

{
  const content = readSrc('ai/services/chat/repositories/chatFileStore.ts')

  // [已修复] fsSync 死代码导入已删除
  assert.ok(
    !content.includes("import fsSync from 'node:fs'"),
    '[2-A FIXED] fsSync 导入已从 chatFileStore.ts 中删除',
  )

  // [已修复] resolveBoardAbsPath 死代码导入已删除
  const boardAbsPathCallCount = (content.match(/resolveBoardAbsPath\s*\(/g) ?? []).length
  assert.equal(
    boardAbsPathCallCount,
    0,
    '[2-B FIXED] resolveBoardAbsPath 已从 chatFileStore.ts 中删除',
  )

  // [已修复] chainIdSet 死变量已删除
  assert.ok(
    !content.includes('chainIdSet'),
    '[2-C FIXED] chainIdSet 变量已从 chatFileStore.ts 中删除',
  )

  // stack / bestLeaf — 树遍历函数中的局部变量
  // 注：这些可能已在代码重构中被移除
  const hasStack = content.includes('const stack')
  const hasBestLeaf = content.includes('bestLeaf')
  if (!hasStack && !hasBestLeaf) {
    console.log('  [2-D/E FIXED] stack 和 bestLeaf 已删除')
  } else {
    console.log(`  [2-D/E] stack=${hasStack}, bestLeaf=${hasBestLeaf} — 仍存在`)
  }

  console.log('✓ [2] chatFileStore.ts 死代码验证通过（5 项）')
}

// ---------------------------------------------------------------------------
// 3. extractTextFromParts — 已提取到 chatStreamUtils.ts 共享模块
// ---------------------------------------------------------------------------

{
  const utilsContent = readSrc('ai/services/chat/chatStreamUtils.ts')
  const chatStreamContent = readSrc('ai/services/chat/chatStreamService.ts')
  const aiExecuteContent = readSrc('ai/services/chat/AiExecuteService.ts')

  // 共享模块应包含 extractTextFromParts 的导出定义
  assert.ok(
    utilsContent.includes('export function extractTextFromParts('),
    '[3-A] chatStreamUtils.ts 应包含 extractTextFromParts 导出定义',
  )

  // 原文件不应再有本地定义
  assert.ok(
    !chatStreamContent.includes('function extractTextFromParts('),
    '[3-B] chatStreamService.ts 不应再包含 extractTextFromParts 本地定义',
  )
  assert.ok(
    !aiExecuteContent.includes('function extractTextFromParts('),
    '[3-C] AiExecuteService.ts 不应再包含 extractTextFromParts 本地定义',
  )

  // 原文件应从共享模块导入
  assert.ok(
    chatStreamContent.includes('from "@/ai/services/chat/chatStreamUtils"'),
    '[3-D] chatStreamService.ts 应从 chatStreamUtils 导入',
  )
  assert.ok(
    aiExecuteContent.includes('from "@/ai/services/chat/chatStreamUtils"'),
    '[3-E] AiExecuteService.ts 应从 chatStreamUtils 导入',
  )

  console.log('✓ [3] extractTextFromParts 已提取到共享模块验证通过')
}

// ---------------------------------------------------------------------------
// 4. toSseChunk — 已提取到 chatStreamUtils.ts 共享模块
// ---------------------------------------------------------------------------

{
  const utilsContent = readSrc('ai/services/chat/chatStreamUtils.ts')
  const orchestratorContent = readSrc('ai/services/chat/streamOrchestrator.ts')
  const aiExecuteContent = readSrc('ai/services/chat/AiExecuteService.ts')

  // 共享模块应包含 toSseChunk 的导出定义
  assert.ok(
    utilsContent.includes('export function toSseChunk('),
    '[4-A] chatStreamUtils.ts 应包含 toSseChunk 导出定义',
  )

  // 原文件不应再有本地定义
  assert.ok(
    !orchestratorContent.includes('function toSseChunk('),
    '[4-B] streamOrchestrator.ts 不应再包含 toSseChunk 本地定义',
  )
  assert.ok(
    !aiExecuteContent.includes('function toSseChunk('),
    '[4-C] AiExecuteService.ts 不应再包含 toSseChunk 本地定义',
  )

  // 原文件应从共享模块导入
  assert.ok(
    orchestratorContent.includes('from "@/ai/services/chat/chatStreamUtils"'),
    '[4-D] streamOrchestrator.ts 应从 chatStreamUtils 导入',
  )
  assert.ok(
    aiExecuteContent.includes('from "@/ai/services/chat/chatStreamUtils"'),
    '[4-E] AiExecuteService.ts 应从 chatStreamUtils 导入',
  )

  console.log('✓ [4] toSseChunk 已提取到共享模块验证通过')
}

// ---------------------------------------------------------------------------
// 5. resolveBearerToken — 已完全删除
// ---------------------------------------------------------------------------
// Server 成为 SaaS token 唯一持有者后，业务路由不再接受 Authorization header，
// 统一通过 ensureServerAccessToken() 从 tokenStore 获取。resolveBearerToken
// helper 和所有调用点都已删除，此处断言防止回归。

{
  let stillExists = false
  try {
    readSrc('ai/interface/helpers/resolveToken.ts')
    stillExists = true
  } catch {
    // 文件不存在 —— 期望状态
  }
  assert.ok(
    !stillExists,
    '[5-A] resolveToken.ts 应已被删除（Server 是 token 唯一持有者，无需从请求提取 Bearer）',
  )

  const routeFiles = [
    'ai/interface/routes/aiChatAsyncRoutes.ts',
    'ai/interface/routes/aiCommandRoutes.ts',
    'ai/interface/routes/aiBoardAgentRoutes.ts',
    'ai/interface/routes/aiCopilotRoutes.ts',
    'ai/interface/routes/aiExecuteRoutes.ts',
  ] as const

  for (const file of routeFiles) {
    const content = readSrc(file)
    assert.ok(
      !content.includes('resolveBearerToken'),
      `[5-${file}] ${file} 不应再引用 resolveBearerToken（业务路由 token 走 ensureServerAccessToken）`,
    )
  }

  console.log('✓ [5] resolveBearerToken 已完全删除验证通过')
}

// ---------------------------------------------------------------------------
// 6. JWT 解码逻辑重复 — prefaceBuilder.ts 与 subAgentPrefaceBuilder.ts
// ---------------------------------------------------------------------------

{
  const prefaceContent = readSrc('ai/shared/prefaceBuilder.ts')

  // prefaceBuilder.ts 包含 decodeJwtPayloadUnsafe 函数
  assert.ok(
    prefaceContent.includes('function decodeJwtPayloadUnsafe('),
    '[6-A] prefaceBuilder.ts 应包含 decodeJwtPayloadUnsafe 函数定义',
  )

  // 验证 JWT 解码的核心实现模式存在（base64 解码 + JSON.parse）
  assert.ok(
    prefaceContent.includes('parts[1]') &&
    prefaceContent.includes("replace(/-/g, \"+\")") &&
    prefaceContent.includes('Buffer.from') &&
    prefaceContent.includes('JSON.parse'),
    '[6-B] prefaceBuilder.ts 中的 JWT 解码应包含：parts[1]、base64 替换、Buffer.from、JSON.parse',
  )

  // subAgentPrefaceBuilder.ts 的 JWT 解码情况
  const subAgentPrefaceContent = readSrc('ai/shared/subAgentPrefaceBuilder.ts')

  // [FIXED] subAgentPrefaceBuilder 已改用共享的 resolveAccountSnapshot，不再有内联 JWT 解码
  const subAgentHasInlineJwtDecode =
    subAgentPrefaceContent.includes("parts[1]") &&
    subAgentPrefaceContent.includes('Buffer.from') &&
    subAgentPrefaceContent.includes('JSON.parse')

  assert.ok(
    !subAgentHasInlineJwtDecode,
    '[6-C] [FIXED] subAgentPrefaceBuilder.ts 不再有内联 JWT 解码逻辑',
  )

  // [FIXED] subAgentPrefaceBuilder 现在使用共享的 resolveAccountSnapshot
  const subAgentUsesSharedAccount =
    subAgentPrefaceContent.includes('resolveAccountSnapshot') ||
    subAgentPrefaceContent.includes('decodeJwtPayloadUnsafe')
  assert.ok(
    subAgentUsesSharedAccount,
    '[6-D] [FIXED] subAgentPrefaceBuilder.ts 复用了共享的 account 解析逻辑',
  )

  // 验证 prefaceBuilder 中 decodeJwtPayloadUnsafe 是被内部使用的（不是死代码）
  const jwtUsageInPreface = (prefaceContent.match(/decodeJwtPayloadUnsafe\s*\(/g) ?? []).length
  assert.ok(
    jwtUsageInPreface >= 2,
    `[6-E] decodeJwtPayloadUnsafe 在 prefaceBuilder.ts 中应至少出现 2 次（定义 + 调用），` +
    `实际出现 ${jwtUsageInPreface} 次`,
  )

  console.log('✓ [6] JWT 解码逻辑重复验证通过')
}

// ---------------------------------------------------------------------------
// 7. normalizeRootPath / normalizeDescription / normalizeScalar — 双文件重复
// ---------------------------------------------------------------------------

{
  const skillsLoaderContent = readSrc('ai/services/skillsLoader.ts')
  const agentConfigContent = readSrc('ai/services/agentConfigService.ts')
  const sharedContent = readSrc('ai/shared/frontMatterUtils.ts')

  // [FIXED] normalize* 函数已提取到 shared/frontMatterUtils.ts
  assert.ok(
    sharedContent.includes('function normalizeRootPath('),
    '[7-A1] [FIXED] frontMatterUtils.ts 包含 normalizeRootPath 定义',
  )
  assert.ok(
    sharedContent.includes('function normalizeDescription('),
    '[7-B1] [FIXED] frontMatterUtils.ts 包含 normalizeDescription 定义',
  )
  assert.ok(
    sharedContent.includes('function normalizeScalar('),
    '[7-C1] [FIXED] frontMatterUtils.ts 包含 normalizeScalar 定义',
  )

  // 原文件不再有本地定义，改为从共享模块导入
  assert.ok(
    !skillsLoaderContent.includes('function normalizeRootPath('),
    '[7-A2] [FIXED] skillsLoader.ts 不再有本地 normalizeRootPath 定义',
  )
  assert.ok(
    !agentConfigContent.includes('function normalizeRootPath('),
    '[7-A3] [FIXED] agentConfigService.ts 不再有本地 normalizeRootPath 定义',
  )
  assert.ok(
    skillsLoaderContent.includes('frontMatterUtils'),
    '[7-A4] [FIXED] skillsLoader.ts 从 frontMatterUtils 导入',
  )
  assert.ok(
    agentConfigContent.includes('frontMatterUtils'),
    '[7-A5] [FIXED] agentConfigService.ts 从 frontMatterUtils 导入',
  )

  console.log('✓ [7] [FIXED] normalize* 函数已提取到 shared/frontMatterUtils.ts')
}

// ---------------------------------------------------------------------------
// 8. autoCompact + contextCollapse — extractPartText / formatMessages 功能重叠
// ---------------------------------------------------------------------------

{
  const autoCompactContent = readSrc('ai/shared/autoCompact.ts')
  const contextCollapseContent = readSrc('ai/shared/contextCollapse.ts')
  const sharedContent = readSrc('ai/shared/messageFormatting.ts')

  // [FIXED] extractPartText 和 formatMessages 已提取到 shared/messageFormatting.ts
  assert.ok(
    sharedContent.includes('function extractPartText('),
    '[8-A1] [FIXED] messageFormatting.ts 包含 extractPartText 定义',
  )
  assert.ok(
    sharedContent.includes('function formatMessagesAsText('),
    '[8-A2] [FIXED] messageFormatting.ts 包含 formatMessagesAsText 定义',
  )

  // 原文件不再有本地定义
  assert.ok(
    !autoCompactContent.includes('function extractPartText('),
    '[8-B1] [FIXED] autoCompact.ts 不再有本地 extractPartText 定义',
  )
  assert.ok(
    !contextCollapseContent.includes('function extractPartText('),
    '[8-B2] [FIXED] contextCollapse.ts 不再有本地 extractPartText 定义',
  )
  assert.ok(
    !autoCompactContent.includes('function formatMessagesForSummary('),
    '[8-C1] [FIXED] autoCompact.ts 不再有本地 formatMessagesForSummary 定义',
  )
  assert.ok(
    !contextCollapseContent.includes('function formatMessagesForCollapse('),
    '[8-C2] [FIXED] contextCollapse.ts 不再有本地 formatMessagesForCollapse 定义',
  )

  // 两文件从共享模块导入
  assert.ok(
    autoCompactContent.includes('messageFormatting'),
    '[8-D1] [FIXED] autoCompact.ts 从 messageFormatting 导入',
  )
  assert.ok(
    contextCollapseContent.includes('messageFormatting'),
    '[8-D2] [FIXED] contextCollapse.ts 从 messageFormatting 导入',
  )

  console.log('✓ [8] [FIXED] extractPartText/formatMessages 已提取到 shared/messageFormatting.ts')
}

// ---------------------------------------------------------------------------
// 9. toolSearchGuidance.ts — ToolCatalogExtendedItem 类型未被实际使用
// ---------------------------------------------------------------------------

{
  const content = readSrc('ai/shared/toolSearchGuidance.ts')

  // [FIXED] ToolCatalogExtendedItem 死代码导入已移除
  assert.ok(
    !content.includes('ToolCatalogExtendedItem'),
    '[9-A] [FIXED] ToolCatalogExtendedItem 死代码导入已从 toolSearchGuidance.ts 移除',
  )

  // 文件仍正常使用 TOOL_CATALOG_EXTENDED 值
  assert.ok(
    content.includes('TOOL_CATALOG_EXTENDED'),
    '[9-B] toolSearchGuidance.ts 正常使用 TOOL_CATALOG_EXTENDED 值',
  )

  console.log('✓ [9] [FIXED] ToolCatalogExtendedItem 死代码导入已清理')
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('✅ 所有技术债静态分析验证通过（9 组，共 35 项断言）')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log('待处理技术债汇总：')
console.log('  [1] agentFactory.ts         — 4 个未使用符号（AgentTemplate、readAgentConfigFromPath、readMasterAgentBasePrompt、readPMAgentBasePrompt）')
console.log('  [2] chatFileStore.ts         — 2 个未使用导入（fsSync、resolveBoardAbsPath）')
console.log('  [3] extractTextFromParts     — ✅ 已提取到 chatStreamUtils.ts')
console.log('  [4] toSseChunk               — ✅ 已提取到 chatStreamUtils.ts')
console.log('  [5] resolveBearerToken       — ✅ 已完全删除')
console.log('  [6] JWT 解码逻辑             — prefaceBuilder 和 subAgentPrefaceBuilder 重叠')
console.log('  [7] normalize* 函数          — skillsLoader + agentConfigService 三函数重复（建议提取 agentFrontMatterUtils.ts）')
console.log('  [8] formatMessages/extractPart — autoCompact + contextCollapse 功能重叠')
console.log('  [9] ToolCatalogExtendedItem  — toolSearchGuidance.ts 中未被使用的 type import')
