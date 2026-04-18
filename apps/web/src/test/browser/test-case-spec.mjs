/**
 * 读取 `.agents/skills/ai-browser-test/test-cases/<name>.yaml` 里的人类/AI 评审用描述字段。
 *
 * 只解析我们关心的几个字段，不拉 yaml 库依赖：
 *   - description : 单行摘要（列表/标题用）
 *   - purpose     : 多行 block scalar（`purpose: |`），提供给 evaluator 子 agent 作为评审参考，
 *                   同时渲染进 HTML 报告 "🎯 测试目的" section，让人类也一眼看懂测的是什么
 *
 * 传入 yaml 绝对路径。文件不存在时返回 `{ description: null, purpose: null }`。
 */
import { existsSync, readFileSync } from 'node:fs'

export function readTestCaseSpec(yamlPath) {
  if (!yamlPath || !existsSync(yamlPath)) return { description: null, purpose: null }
  const raw = readFileSync(yamlPath, 'utf-8')
  return {
    description: extractSingleLine(raw, 'description'),
    purpose: extractBlockScalar(raw, 'purpose'),
  }
}

function extractSingleLine(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s*(?:"((?:[^"\\\\\\n]|\\\\.)*)"|'([^'\\n]*)'|([^\\n]*))$`, 'm'))
  if (!m) return null
  const val = (m[1] ?? m[2] ?? m[3] ?? '').trim()
  if (!val || val === 'null' || val === '~') return null
  return val.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function extractBlockScalar(raw, key) {
  const re = new RegExp(`^${key}:\\s*\\|[\\-+]?\\s*\\n((?:(?:^[ \\t]+[^\\n]*|^[ \\t]*)\\n?)+)`, 'm')
  const m = raw.match(re)
  if (!m) return null
  const body = m[1].replace(/\n+$/, '')
  if (!body) return null
  const lines = body.split('\n')
  const indents = lines
    .filter(l => l.trim().length > 0)
    .map(l => (l.match(/^[ \t]*/) ?? [''])[0].length)
  const indent = indents.length ? Math.min(...indents) : 0
  const stripped = lines.map(l => l.slice(Math.min(indent, l.length))).join('\n').trim()
  return stripped || null
}
