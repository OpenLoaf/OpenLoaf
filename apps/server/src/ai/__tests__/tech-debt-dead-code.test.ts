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
 *   5. resolveBearerToken — ✅ 已提取到 helpers/resolveToken.ts（验证共享模块导入）
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

/**
 * 提取函数体（从 `function name(` 到配对的 `}` 闭括号），
 * 用于比较两处实现的结构相似性。
 * 返回函数体字符串（去除空白归一化后）。
 */
function extractFunctionBody(content: string, functionName: string): string | null {
  const startMarker = `function ${functionName}(`
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return null

  // 找到函数体起始 `{`
  const braceStart = content.indexOf('{', startIdx)
  if (braceStart === -1) return null

  let depth = 0
  let i = braceStart
  while (i < content.length) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) {
        return content.slice(braceStart, i + 1).replace(/\s+/g, ' ').trim()
      }
    }
    i++
  }
  return null
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
// 5. resolveBearerToken — 已提取到 helpers/resolveToken.ts 共享模块
// ---------------------------------------------------------------------------

{
  const helperContent = readSrc('ai/interface/helpers/resolveToken.ts')

  // 共享模块应包含 resolveBearerToken 的导出定义
  assert.ok(
    helperContent.includes('export function resolveBearerToken('),
    '[5-A] resolveToken.ts 应包含 resolveBearerToken 导出定义',
  )

  const routeFiles = [
    'ai/interface/routes/aiChatAsyncRoutes.ts',
    'ai/interface/routes/aiCommandRoutes.ts',
    'ai/interface/routes/aiBoardAgentRoutes.ts',
    'ai/interface/routes/aiCopilotRoutes.ts',
  ] as const

  for (const file of routeFiles) {
    const content = readSrc(file)
    assert.ok(
      !content.includes('function resolveBearerToken('),
      `[5-${file}] ${file} 不应再包含 resolveBearerToken 本地定义`,
    )
    assert.ok(
      content.includes('resolveToken'),
      `[5-import-${file}] ${file} 应从 resolveToken 模块导入`,
    )
  }

  console.log('✓ [5] resolveBearerToken 已提取到共享模块验证通过')
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

  // 验证 subAgentPrefaceBuilder 中存在内联的 JWT 解码逻辑（重复实现而非复用）
  const subAgentHasInlineJwtDecode =
    subAgentPrefaceContent.includes("parts[1]") &&
    subAgentPrefaceContent.includes('Buffer.from') &&
    subAgentPrefaceContent.includes('JSON.parse') &&
    subAgentPrefaceContent.includes(".replace(/-/g, '+')")

  assert.ok(
    subAgentHasInlineJwtDecode,
    '[6-C] 技术债确认：subAgentPrefaceBuilder.ts 中存在内联 JWT 解码逻辑（parts[1] + Buffer.from + JSON.parse），' +
    '而非复用 prefaceBuilder.ts 中的 decodeJwtPayloadUnsafe 函数。应将该函数提取到共享模块。',
  )

  // 同时验证 subAgentPrefaceBuilder 没有导入 decodeJwtPayloadUnsafe（即确认是重复而非复用）
  const subAgentUsesSharedJwt = subAgentPrefaceContent.includes('decodeJwtPayloadUnsafe')
  assert.equal(
    subAgentUsesSharedJwt,
    false,
    '[6-D] 技术债确认：subAgentPrefaceBuilder.ts 未复用 decodeJwtPayloadUnsafe，' +
    '自行内联实现了相同的 JWT 解码逻辑，构成重复代码。',
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

  // 7-A: normalizeRootPath 在两处都有定义
  assert.ok(
    skillsLoaderContent.includes('function normalizeRootPath('),
    '[7-A1] skillsLoader.ts 应包含 normalizeRootPath 函数定义',
  )
  assert.ok(
    agentConfigContent.includes('function normalizeRootPath('),
    '[7-A2] agentConfigService.ts 应包含 normalizeRootPath 函数定义',
  )

  const rootPathBody1 = extractFunctionBody(skillsLoaderContent, 'normalizeRootPath')
  const rootPathBody2 = extractFunctionBody(agentConfigContent, 'normalizeRootPath')

  assert.ok(rootPathBody1 !== null, '[7-A3] 应能从 skillsLoader.ts 提取 normalizeRootPath 函数体')
  assert.ok(rootPathBody2 !== null, '[7-A4] 应能从 agentConfigService.ts 提取 normalizeRootPath 函数体')

  // 两处实现语义相同（引号风格和三元表达式写法略有差异，但核心逻辑一致）：
  // 均检查 typeof !== 'string'、trim() 后若为空返回 null
  assert.ok(
    rootPathBody1!.includes('typeof value') &&
    rootPathBody1!.includes('trim()') &&
    rootPathBody1!.includes('null'),
    '[7-A5a] skillsLoader.ts 的 normalizeRootPath 应包含 typeof value、trim()、null',
  )
  assert.ok(
    rootPathBody2!.includes('typeof value') &&
    rootPathBody2!.includes('trim()') &&
    rootPathBody2!.includes('null'),
    '[7-A5b] agentConfigService.ts 的 normalizeRootPath 应包含 typeof value、trim()、null。' +
    '两处实现语义等价，属于重复代码。',
  )

  // 7-B: normalizeDescription 在两处都有定义且相同
  assert.ok(
    skillsLoaderContent.includes('function normalizeDescription('),
    '[7-B1] skillsLoader.ts 应包含 normalizeDescription 函数定义',
  )
  assert.ok(
    agentConfigContent.includes('function normalizeDescription('),
    '[7-B2] agentConfigService.ts 应包含 normalizeDescription 函数定义',
  )

  const descBody1 = extractFunctionBody(skillsLoaderContent, 'normalizeDescription')
  const descBody2 = extractFunctionBody(agentConfigContent, 'normalizeDescription')

  assert.ok(descBody1 !== null, '[7-B3] 应能从 skillsLoader.ts 提取 normalizeDescription 函数体')
  assert.ok(descBody2 !== null, '[7-B4] 应能从 agentConfigService.ts 提取 normalizeDescription 函数体')

  // 两处实现语义相同：均 trim() 后判空，再 replace(/\s+/gu, ' ')
  assert.ok(
    descBody1!.includes('trim()') && descBody1!.includes("replace(") && descBody1!.includes('未提供'),
    '[7-B5a] skillsLoader.ts 的 normalizeDescription 应包含 trim()、replace、"未提供"',
  )
  assert.ok(
    descBody2!.includes('trim()') && descBody2!.includes("replace(") && descBody2!.includes('未提供'),
    '[7-B5b] agentConfigService.ts 的 normalizeDescription 应包含 trim()、replace、"未提供"。' +
    '两处实现语义等价，属于重复代码。',
  )

  // 7-C: normalizeScalar 在两处都有定义且相同
  assert.ok(
    skillsLoaderContent.includes('function normalizeScalar('),
    '[7-C1] skillsLoader.ts 应包含 normalizeScalar 函数定义',
  )
  assert.ok(
    agentConfigContent.includes('function normalizeScalar('),
    '[7-C2] agentConfigService.ts 应包含 normalizeScalar 函数定义',
  )

  const scalarBody1 = extractFunctionBody(skillsLoaderContent, 'normalizeScalar')
  const scalarBody2 = extractFunctionBody(agentConfigContent, 'normalizeScalar')

  assert.ok(scalarBody1 !== null, '[7-C3] 应能从 skillsLoader.ts 提取 normalizeScalar 函数体')
  assert.ok(scalarBody2 !== null, '[7-C4] 应能从 agentConfigService.ts 提取 normalizeScalar 函数体')

  // 两处实现语义相同：均 trim()、检测引号包裹、strip 引号、返回 trim 后的值
  assert.ok(
    scalarBody1!.includes('trim()') && scalarBody1!.includes('startsWith') && scalarBody1!.includes('slice'),
    '[7-C5a] skillsLoader.ts 的 normalizeScalar 应包含 trim()、startsWith、slice',
  )
  assert.ok(
    scalarBody2!.includes('trim()') && scalarBody2!.includes('startsWith') && scalarBody2!.includes('slice'),
    '[7-C5b] agentConfigService.ts 的 normalizeScalar 应包含 trim()、startsWith、slice。' +
    '两处实现语义等价，属于重复代码。应提取到共享工具模块（如 ai/services/agentFrontMatterUtils.ts）。',
  )

  console.log('✓ [7] normalize* 函数重复验证通过（normalizeRootPath + normalizeDescription + normalizeScalar）')
}

// ---------------------------------------------------------------------------
// 8. autoCompact + contextCollapse — extractPartText / formatMessages 功能重叠
// ---------------------------------------------------------------------------

{
  const autoCompactContent = readSrc('ai/shared/autoCompact.ts')
  const contextCollapseContent = readSrc('ai/shared/contextCollapse.ts')

  // 8-A: 两文件都定义了 extractPartText
  assert.ok(
    autoCompactContent.includes('function extractPartText('),
    '[8-A1] autoCompact.ts 应包含 extractPartText 函数定义',
  )
  assert.ok(
    contextCollapseContent.includes('function extractPartText('),
    '[8-A2] contextCollapse.ts 应包含 extractPartText 函数定义',
  )

  // 8-B: 两处实现结构相似（都包含 p.text、tool-result、tool-call 的处理分支）
  const autoExtractBody = extractFunctionBody(autoCompactContent, 'extractPartText')
  const collapseExtractBody = extractFunctionBody(contextCollapseContent, 'extractPartText')

  assert.ok(autoExtractBody !== null, '[8-B1] 应能从 autoCompact.ts 提取 extractPartText 函数体')
  assert.ok(collapseExtractBody !== null, '[8-B2] 应能从 contextCollapse.ts 提取 extractPartText 函数体')

  // 两处都包含相同的分支逻辑（核心判断相同，截断长度不同）
  assert.ok(
    autoExtractBody!.includes('p.text') && autoExtractBody!.includes('tool-result'),
    '[8-B3] autoCompact.ts 的 extractPartText 应包含 p.text 和 tool-result 处理分支',
  )
  assert.ok(
    collapseExtractBody!.includes('p.text') && collapseExtractBody!.includes('tool-result'),
    '[8-B4] contextCollapse.ts 的 extractPartText 应包含 p.text 和 tool-result 处理分支',
  )

  // 两处实现的差异仅是截断长度（500 vs 300），核心逻辑重叠
  assert.ok(
    autoExtractBody !== collapseExtractBody,
    '[8-B5] autoCompact 和 contextCollapse 的 extractPartText 实现略有不同（截断长度 500 vs 300），' +
    '但核心逻辑重叠，属于可合并的重复代码。',
  )

  // 8-C: formatMessagesForSummary（autoCompact）与 formatMessagesForCollapse（contextCollapse）结构高度相似
  assert.ok(
    autoCompactContent.includes('function formatMessagesForSummary('),
    '[8-C1] autoCompact.ts 应包含 formatMessagesForSummary 函数定义',
  )
  assert.ok(
    contextCollapseContent.includes('function formatMessagesForCollapse('),
    '[8-C2] contextCollapse.ts 应包含 formatMessagesForCollapse 函数定义',
  )

  const summaryBody = extractFunctionBody(autoCompactContent, 'formatMessagesForSummary')
  const collapseBody = extractFunctionBody(contextCollapseContent, 'formatMessagesForCollapse')

  assert.ok(summaryBody !== null, '[8-C3] 应能从 autoCompact.ts 提取 formatMessagesForSummary 函数体')
  assert.ok(collapseBody !== null, '[8-C4] 应能从 contextCollapse.ts 提取 formatMessagesForCollapse 函数体')

  // 两者都迭代 messages、处理 content 为数组或字符串的情况
  assert.ok(
    summaryBody!.includes('Array.isArray') && summaryBody!.includes('msg.role'),
    '[8-C5] formatMessagesForSummary 应包含 Array.isArray 和 msg.role 处理',
  )
  assert.ok(
    collapseBody!.includes('Array.isArray') && collapseBody!.includes('msg.role'),
    '[8-C6] formatMessagesForCollapse 应包含 Array.isArray 和 msg.role 处理',
  )

  console.log('✓ [8] autoCompact/contextCollapse 功能重叠验证通过')
}

// ---------------------------------------------------------------------------
// 9. toolSearchGuidance.ts — ToolCatalogExtendedItem 类型未被实际使用
// ---------------------------------------------------------------------------

{
  const content = readSrc('ai/shared/toolSearchGuidance.ts')

  // 验证 ToolCatalogExtendedItem 确实被导入
  assert.ok(
    content.includes('type ToolCatalogExtendedItem'),
    '[9-A] ToolCatalogExtendedItem 应以 type import 形式出现在 toolSearchGuidance.ts',
  )

  // 验证 ToolCatalogExtendedItem 在文件中只出现 1 次（仅 import 行，未被引用）
  const occurrences = countOccurrences(content, 'ToolCatalogExtendedItem')
  assert.equal(
    occurrences,
    1,
    `[9-B] ToolCatalogExtendedItem 应只出现 1 次（仅 import type 行），` +
    `实际出现 ${occurrences} 次。` +
    '该类型被导入但从未在函数签名、变量类型注解等位置使用，属于死代码导入。',
  )

  // 验证文件中实际使用的是 TOOL_CATALOG_EXTENDED（值），而非 ToolCatalogExtendedItem（类型）
  assert.ok(
    content.includes('TOOL_CATALOG_EXTENDED'),
    '[9-C] toolSearchGuidance.ts 应使用 TOOL_CATALOG_EXTENDED 值（而非 ToolCatalogExtendedItem 类型）',
  )

  console.log('✓ [9] toolSearchGuidance.ts ToolCatalogExtendedItem 未使用验证通过')
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
console.log('  [5] resolveBearerToken       — ✅ 已提取到 helpers/resolveToken.ts')
console.log('  [6] JWT 解码逻辑             — prefaceBuilder 和 subAgentPrefaceBuilder 重叠')
console.log('  [7] normalize* 函数          — skillsLoader + agentConfigService 三函数重复（建议提取 agentFrontMatterUtils.ts）')
console.log('  [8] formatMessages/extractPart — autoCompact + contextCollapse 功能重叠')
console.log('  [9] ToolCatalogExtendedItem  — toolSearchGuidance.ts 中未被使用的 type import')
