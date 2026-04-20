/**
 * Per-case summary cache —— 把"主页索引 / run 概览"需要的小字段从大体积的
 * data/<case>.json 里抽出来，落盘到 _case-summaries/<case>.json（约 2KB），
 * 让 computeRunInfo / 主页 rebuild 不必每次重新读 messages.jsonl 合并的几 MB
 * 大文件。
 *
 * 字段要求只放主页用得到的：
 *   - testCase / description
 *   - model（friendly name 或 id）
 *   - credits / totalTokens / hasFailedTool
 *   - savedAt（与 data/<case>.json 同步）
 *
 * 改字段后记得：
 *   1. 升 SUMMARY_SCHEMA_VERSION（让 computeRunInfo 检测到老 cache 自动重算）
 *   2. 主页/概览渲染处加 fallback（缺字段读 0 / null）
 *   3. backfill 脚本会自动覆盖老 _run-summary.json
 */

export const SUMMARY_SCHEMA_VERSION = 1

/**
 * 从 saveTestData 写盘的 probe data（含 result + messages 合并 metadata）里抽出主页需要的小摘要。
 *
 * @param {object} d - data/<case>.json 的内容
 * @returns {object|null} - 摘要；缺 testCase 返回 null
 */
export function extractCaseSummary(d) {
  if (!d || typeof d !== 'object') return null
  const testCase = typeof d.testCase === 'string' ? d.testCase : null
  if (!testCase) return null

  const description = typeof d.description === 'string' ? d.description : ''
  const result = (d.result && typeof d.result === 'object') ? d.result : {}

  // credits：优先 result.creditsConsumed（enrichMessagesWithHistoryMetadata 已聚合好的权威值）
  const c = result.creditsConsumed
  const credits = (typeof c === 'number' && Number.isFinite(c) && c > 0) ? c : null

  // totalTokens：tokenUsage.totalTokens 优先；缺就 input+output 兜底
  let totalTokens = null
  const u = result.tokenUsage
  if (u && typeof u === 'object') {
    const tt = Number(u.totalTokens)
    const inT = Number(u.inputTokens)
    const outT = Number(u.outputTokens)
    const v = Number.isFinite(tt) && tt > 0
      ? tt
      : ((Number.isFinite(inT) ? inT : 0) + (Number.isFinite(outT) ? outT : 0))
    if (v > 0) totalTokens = v
  }

  // model：扫 messages 找首个 assistant.metadata.agent.model.name；找不到回退到 d.model
  let friendlyName = null
  let fallbackId = null
  const msgs = Array.isArray(result.messages) ? result.messages : []
  for (const m of msgs) {
    if (m?.role !== 'assistant') continue
    const ag = m?.metadata?.agent
    if (!ag) continue
    if (ag?.model?.name) friendlyName = String(ag.model.name)
    if (ag?.chatModelId) fallbackId = String(ag.chatModelId)
    else if (ag?.model?.modelId) fallbackId = String(ag.model.modelId)
    if (friendlyName || fallbackId) break
  }
  const declared = typeof d.model === 'string' && d.model.trim() ? d.model.trim() : null
  const model = friendlyName || fallbackId || declared || null

  // hasFailedTool：toolCallDetails 里任一 hasError = true（reviewer 视觉降级会用到）
  let hasFailedTool = false
  const details = Array.isArray(result.toolCallDetails) ? result.toolCallDetails : []
  for (const det of details) {
    if (det?.hasError) { hasFailedTool = true; break }
  }

  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    testCase,
    description,
    model,
    credits,
    totalTokens,
    hasFailedTool,
    savedAt: typeof d.savedAt === 'string' ? d.savedAt : new Date().toISOString(),
  }
}
