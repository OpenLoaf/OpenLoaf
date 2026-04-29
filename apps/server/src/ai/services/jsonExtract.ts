/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { z } from 'zod'

/**
 * 从 LLM 自由文本中抽出 JSON 段。容忍三种常见输出形态：
 * 1. 纯 JSON：'{"summary":"..."}'
 * 2. ``` 代码块（带或不带 json 标签）
 * 3. 前后夹解释：'Here is the JSON: {"summary":"..."} Hope this helps!'
 *
 * 返回原始字符串（未 JSON.parse），调用方负责 parse + schema 校验。
 */
export function extractJsonBlock(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  // 1. ```...``` 代码块（dot-all 不能用，手工匹配）
  const fenceMatch = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/m.exec(trimmed)
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim()
  }

  // 2. 第一个 { 到最后一个 } 之间（容忍前后解释文字）
  const objStart = trimmed.indexOf('{')
  const objEnd = trimmed.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    return trimmed.slice(objStart, objEnd + 1)
  }
  // 3. 数组形式
  const arrStart = trimmed.indexOf('[')
  const arrEnd = trimmed.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    return trimmed.slice(arrStart, arrEnd + 1)
  }

  return trimmed
}

/**
 * 把 LLM 文本输出按 zod schema 解析。
 * 失败时抛出带原文片段的错误，便于上层 fallback / 日志定位。
 */
export function parseJsonByZod<T extends z.ZodType>(
  text: string,
  schema: T,
): z.infer<T> {
  const block = extractJsonBlock(text)
  let raw: unknown
  try {
    raw = JSON.parse(block)
  } catch (e) {
    throw new Error(
      `JSON.parse failed: ${(e as Error).message} | text head: ${block.slice(0, 120)}`,
    )
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `schema validation failed: ${parsed.error.message} | parsed value: ${JSON.stringify(raw).slice(0, 200)}`,
    )
  }
  return parsed.data
}

/**
 * 把 zod schema 渲染为 prompt-friendly 文本（便于注入到 system 末尾告诉模型期望结构）。
 * 用 toJSONSchema 拿原始 JSON Schema，再裁掉冗余字段（$schema、definitions、description 等长字段）。
 */
export function describeSchemaForPrompt(schema: z.ZodType): string {
  const fn = (schema as { toJSONSchema?: () => unknown }).toJSONSchema
  if (typeof fn !== 'function') {
    return '(schema unavailable)'
  }
  const json = fn.call(schema) as Record<string, unknown>
  const stripped = stripVerboseKeys(json)
  return JSON.stringify(stripped, null, 2)
}

function stripVerboseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVerboseKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'definitions') continue
      out[k] = stripVerboseKeys(v)
    }
    return out
  }
  return value
}
